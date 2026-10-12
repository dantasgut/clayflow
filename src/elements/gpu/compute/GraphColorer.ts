import type {
    ComputeKernel,
    ComputeKernelBinding,
    EngineCore,
    Frame,
    StagingBufferSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../core/contracts/index';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { PrefixSum, SCAN_GROUP } from './PrefixSum';
import { RadixSort } from './RadixSort';
import { Reduce } from './Reduce';
import { ColorRangeSchema, GraphColorParamsSchema, GraphColorStatusSchema } from './schemas';
import { gcGroup, gcInit, gcRound } from './shaders';
import type { WgslModule } from '../../../scene/shaders/WgslModule';

/** Subpassos gravados entre duas leituras do estado. */
const STEPS_PER_BATCH = 32;

/** Intervalo das arestas de uma cor em `edgesByColor`, lido para a CPU. */
export interface ColorRangeCpu {
    /** Primeira posição da cor em `edgesByColor`. */
    readonly offset: number;
    /** Arestas da cor. */
    readonly count: number;
}

/** Resultado de `verifyEdgeColoring`. */
export interface EdgeColoringVerdict {
    /** Nenhuma cor com duas arestas no mesmo vértice. */
    readonly valid: boolean;
    /** Maior cor + 1. */
    readonly colorCount: number;
    /** Primeiro par de arestas em conflito (índices), quando inválida. */
    readonly conflict?: readonly [number, number];
}

/** Resultado de uma coloração de arestas. Os buffers pertencem ao `GraphColorer` e valem até a próxima coloração. */
export interface GraphColoring {
    /** Cores usadas (`0..colorCount-1`). */
    readonly colorCount: number;
    /** `u32[edgeCount]`: cor de cada aresta. */
    readonly edgeColors: StorageBufferSpec;
    /** `u32[edgeCount]`: índices de aresta agrupados por cor (estável por índice dentro da cor). */
    readonly edgesByColor: StorageBufferSpec;
    /** `ColorRange[colorCount]`: `{ offset, count }` de cada cor em `edgesByColor`. */
    readonly ranges: StorageBufferSpec;
    /** Os mesmos intervalos, lidos para a CPU (para gravar um despacho por cor). */
    readonly rangesCpu: readonly ColorRangeCpu[];
}

/** Opções de `GraphColorer`. */
export interface GraphColorerOptions {
    /** Prefixo único dos recursos da instância. */
    readonly discriminator: string;
    /** Maior número de arestas aceito por `color`. */
    readonly capacity: number;
    /** Teto de cores; padrão `2Δ` (Δ = grau máximo, calculado na GPU). */
    readonly maxColors?: number;
}

/** Estado da coloração lido da GPU. */
export interface GraphColorStatus {
    readonly color: number;
    readonly step: number;
    readonly colorCount: number;
    readonly candidates: number;
    readonly uncolored: number;
    readonly loops: number;
    readonly invalid: number;
    readonly maxDegree: number;
}

/** Decodifica o estado (`GraphColorStatusSchema`) lido da GPU. */
export function readGraphColorStatus(bytes: ArrayBuffer): GraphColorStatus {
    const u32 = new Uint32Array(bytes);
    const at = (field: string): number => u32[GraphColorStatusSchema.offsetOf(field) / 4] ?? 0;
    return {
        color: at('color'),
        step: at('step'),
        colorCount: at('color_count'),
        candidates: at('candidates'),
        uncolored: at('uncolored'),
        loops: at('loops'),
        invalid: at('invalid'),
        maxDegree: at('max_degree'),
    };
}

/** Decodifica `count` intervalos (`ColorRangeSchema`) lidos da GPU. */
export function readColorRanges(bytes: ArrayBuffer, count: number): ColorRangeCpu[] {
    const u32 = new Uint32Array(bytes);
    const stride = ColorRangeSchema.stride / 4;
    const offset = ColorRangeSchema.offsetOf('offset') / 4;
    const size = ColorRangeSchema.offsetOf('count') / 4;
    return Array.from({ length: count }, (_, c) => ({
        offset: u32[c * stride + offset] ?? 0,
        count: u32[c * stride + size] ?? 0,
    }));
}

/** Teto de cores padrão para o grau máximo `maxDegree`: `2Δ` (a coloração por emparelhamentos maximais usa ≤ 2Δ − 1). */
export function defaultMaxColors(maxDegree: number): number {
    return Math.max(1, 2 * maxDegree);
}

/** Bits de chave da ordenação por cor: múltiplo de 4 que cobre `colorCount - 1`. */
export function colorSortBits(colorCount: number): number {
    const needed = Math.max(1, Math.ceil(Math.log2(Math.max(2, colorCount))));
    return Math.min(32, Math.ceil(needed / 4) * 4);
}

/** Próximo passo da orquestração a partir do estado lido depois de um lote de subpassos. */
export function nextColoringAction(
    status: GraphColorStatus,
    maxColors: number,
): 'done' | 'continue' | 'too-many-colors' {
    if (status.uncolored === 0) return 'done';
    if (status.color >= maxColors) return 'too-many-colors';
    return 'continue';
}

/**
 * Verifica uma coloração de arestas: nenhuma cor com duas arestas no mesmo vértice. `edges` são pares `(a, b)`
 * achatados. Usada pelos testes e pelo smoke `computeKernels`.
 */
export function verifyEdgeColoring(edges: Uint32Array, colors: Uint32Array): EdgeColoringVerdict {
    let colorCount = 0;
    for (const c of colors) colorCount = Math.max(colorCount, c + 1);
    // Chave numérica (vértice, cor): exata até 2^53.
    const seen = new Map<number, number>();
    for (let e = 0; e < colors.length; e++) {
        const c = colors[e]!;
        for (const v of [edges[2 * e]!, edges[2 * e + 1]!]) {
            const key = v * colorCount + c;
            const other = seen.get(key);
            if (other !== undefined) return { valid: false, colorCount, conflict: [other, e] };
            seen.set(key, e);
        }
    }
    return { valid: true, colorCount };
}

/** Buffers dimensionados pela capacidade de arestas. */
interface EdgeBuffers {
    readonly params: UniformBufferSpec;
    readonly status: StorageBufferSpec;
    readonly colors: StorageBufferSpec;
    readonly keys: StorageBufferSpec;
    readonly values: StorageBufferSpec;
    readonly counts: StorageBufferSpec;
    readonly offsets: StorageBufferSpec;
    readonly ranges: StorageBufferSpec;
    readonly statusStaging: StagingBufferSpec;
    readonly rangesStaging: StagingBufferSpec;
}

/** Buffers dimensionados por vértice (crescem sob demanda). */
interface VertexBuffers {
    readonly capacity: number;
    readonly degree: StorageBufferSpec;
    readonly vmax: StorageBufferSpec;
    readonly used: StorageBufferSpec;
    readonly reduce: Reduce;
}

/**
 * Coloração de arestas na GPU (research R12) para resolver restrições em paralelo: arestas da mesma cor não
 * compartilham vértice. Cada cor é um emparelhamento maximal construído por subpassos (prioridade única por aresta
 * via `pcg_hash`, máximo atômico nos vértices), então o número de cores é ≤ 2Δ − 1. Depois a ordenação radix agrupa
 * as arestas por cor e a soma de prefixos das contagens dá os intervalos.
 *
 * Assíncrona e com envios próprios: chamada na criação ou mudança de topologia, fora de um quadro (`core.record`),
 * nunca por quadro. Substitui o `GraphColorSolver` em CPU.
 */
export class GraphColorer {
    private readonly disc: string;
    private readonly capacity: number;
    private readonly maxColorsOption: number | undefined;
    private readonly scan: PrefixSum;
    private readonly sort: RadixSort;
    private buffers: EdgeBuffers | null = null;
    private vertex: VertexBuffers | null = null;
    private kernels: ComputeKernel[] = [];
    private busy = false;

    constructor(
        private readonly core: EngineCore,
        options: GraphColorerOptions,
    ) {
        if (!Number.isInteger(options.capacity) || options.capacity < 1) {
            throw new RangeError(
                `GraphColorer(${options.discriminator}): capacity deve ser inteiro ≥ 1 (recebeu ${options.capacity}).`,
            );
        }
        if (
            options.maxColors !== undefined
            && (!Number.isInteger(options.maxColors) || options.maxColors < 1)
        ) {
            throw new RangeError(
                `GraphColorer(${options.discriminator}): maxColors deve ser inteiro ≥ 1 (recebeu ${options.maxColors}).`,
            );
        }
        this.disc = options.discriminator;
        this.capacity = options.capacity;
        this.maxColorsOption = options.maxColors;
        // Contagens por cor: no máximo uma cor por aresta.
        this.scan = new PrefixSum(core, {
            discriminator: `${this.disc}:gc_scan`,
            capacity: options.capacity,
        });
        this.sort = new RadixSort(core, {
            discriminator: `${this.disc}:gc_sort`,
            capacity: options.capacity,
            withValues: true,
        });
    }

    /**
     * Colore as `count` arestas `edges` (`vec2u[count]`) de um grafo com `vertexCount` vértices. Rejeita laços
     * (`a == b`) e índices fora de `[0, vertexCount)`; arestas repetidas recebem cores distintas.
     */
    async color(
        edges: StorageBufferSpec,
        count: number,
        vertexCount: number,
    ): Promise<GraphColoring> {
        if (!Number.isInteger(count) || count < 0 || count > this.capacity) {
            throw new RangeError(
                `GraphColorer(${this.disc}): count deve ser inteiro em [0, ${this.capacity}] (recebeu ${count}).`,
            );
        }
        if (!Number.isInteger(vertexCount) || vertexCount < 0) {
            throw new RangeError(
                `GraphColorer(${this.disc}): vertexCount deve ser inteiro ≥ 0 (recebeu ${vertexCount}).`,
            );
        }
        if (this.busy) {
            throw new Error(`GraphColorer(${this.disc}): coloração anterior ainda em andamento.`);
        }
        this.busy = true;
        try {
            return await this.run(edges, count, vertexCount);
        } finally {
            this.busy = false;
        }
    }

    /** Libera kernels, buffers, ordenação e soma de prefixos internas. */
    destroy(): void {
        this.releaseKernels();
        if (this.buffers !== null) {
            for (const b of Object.values(this.buffers)) this.core.destroy(b);
        }
        this.buffers = null;
        this.releaseVertexBuffers();
        this.scan.destroy();
        this.sort.destroy();
    }

    private async run(
        edges: StorageBufferSpec,
        count: number,
        vertexCount: number,
    ): Promise<GraphColoring> {
        const b = (this.buffers ??= this.allocate());
        const vertex = this.ensureVertexBuffers(Math.max(1, vertexCount));
        this.releaseKernels();
        const status = b.status;
        if (count === 0) {
            return {
                colorCount: 0,
                edgeColors: b.colors,
                edgesByColor: b.values,
                ranges: b.ranges,
                rangesCpu: [],
            };
        }

        // Preparação, validação e grau máximo.
        this.core.write(
            b.params,
            GraphColorParamsSchema.pack({
                edge_count: count,
                vertex_count: vertexCount,
                max_colors: 0,
            }),
        );
        const init = this.kernel(b, 'gc_init', gcInit, 'gc_init_main', [
            { binding: 0, type: 'read-only-storage', buffer: edges },
            { binding: 1, type: 'storage', buffer: b.colors },
            { binding: 2, type: 'storage', buffer: vertex.degree },
            { binding: 3, type: 'storage', buffer: status },
        ]);
        this.submit('GraphColorer.init', (frame) => {
            frame.clear(status);
            frame.clear(vertex.degree, 0, vertexCount * 4);
            frame.clear(vertex.used, 0, vertexCount * 4);
            this.dispatch(frame, 'GraphColorer.init', init, count);
            if (vertexCount > 0) {
                vertex.reduce.record(frame, {
                    src: vertex.degree,
                    count: vertexCount,
                    out: status,
                    outOffset: GraphColorStatusSchema.offsetOf('max_degree') / 4,
                });
            }
        });
        const validated = await this.readStatus(b);
        if (validated.invalid > 0) {
            throw new RangeError(
                `GraphColorer(${this.disc}): ${validated.invalid} aresta(s) com vértice fora de [0, ${vertexCount}).`,
            );
        }
        if (validated.loops > 0) {
            throw new Error(
                `GraphColorer(${this.disc}): ${validated.loops} laço(s) (aresta com a == b) — não há coloração.`,
            );
        }
        const maxColors = this.maxColorsOption ?? defaultMaxColors(validated.maxDegree);

        // Subpassos por cor até não restar aresta sem cor.
        const round: ComputeKernelBinding[] = [
            { binding: 0, type: 'read-only-storage', buffer: edges },
            { binding: 1, type: 'storage', buffer: b.colors },
            { binding: 2, type: 'storage', buffer: vertex.vmax },
            { binding: 3, type: 'storage', buffer: vertex.used },
            { binding: 4, type: 'storage', buffer: status },
        ];
        const priority = this.kernel(b, 'gc_priority', gcRound, 'gc_priority_main', round);
        const assign = this.kernel(b, 'gc_assign', gcRound, 'gc_assign_main', round);
        const advance = this.kernel(b, 'gc_advance', gcRound, 'gc_advance_main', round);
        const counters = GraphColorStatusSchema.offsetOf('candidates');
        const counterBytes = GraphColorStatusSchema.offsetOf('loops') - counters;
        let state = validated;
        for (;;) {
            this.submit('GraphColorer.rounds', (frame) => {
                for (let s = 0; s < STEPS_PER_BATCH; s++) {
                    frame.clear(vertex.vmax, 0, vertexCount * 4);
                    frame.clear(status, counters, counterBytes);
                    this.dispatch(frame, 'GraphColorer.priority', priority, count);
                    this.dispatch(frame, 'GraphColorer.assign', assign, count);
                    this.dispatch(frame, 'GraphColorer.advance', advance, null);
                }
            });
            state = await this.readStatus(b);
            const action = nextColoringAction(state, maxColors);
            if (action === 'done') break;
            if (action === 'too-many-colors') {
                throw new Error(
                    `GraphColorer(${this.disc}): coloração passou de maxColors = ${maxColors} com ${state.uncolored} aresta(s) sem cor.`,
                );
            }
        }
        const colorCount = state.colorCount;

        // Agrupamento: ordenação por cor (estável por índice), contagens e intervalos.
        const group: ComputeKernelBinding[] = [
            { binding: 0, type: 'read-only-storage', buffer: b.colors },
            { binding: 1, type: 'storage', buffer: b.keys },
            { binding: 2, type: 'storage', buffer: b.values },
            { binding: 3, type: 'storage', buffer: b.counts },
            { binding: 4, type: 'read-only-storage', buffer: b.offsets },
            { binding: 5, type: 'storage', buffer: b.ranges },
            { binding: 6, type: 'storage', buffer: status },
        ];
        const sortInit = this.kernel(b, 'gc_sort_init', gcGroup, 'gc_sort_init_main', group);
        const countColors = this.kernel(b, 'gc_count', gcGroup, 'gc_count_main', group);
        const buildRanges = this.kernel(b, 'gc_ranges', gcGroup, 'gc_ranges_main', group);
        const rangesBytes = colorCount * ColorRangeSchema.stride;
        this.submit('GraphColorer.group', (frame) => {
            this.dispatch(frame, 'GraphColorer.sort_init', sortInit, count);
            this.sort.record(frame, {
                keys: b.keys,
                values: b.values,
                count,
                bits: colorSortBits(colorCount),
            });
            frame.clear(b.counts, 0, colorCount * 4);
            this.dispatch(frame, 'GraphColorer.count', countColors, count);
            this.scan.record(frame, { src: b.counts, dst: b.offsets, count: colorCount });
            this.dispatch(frame, 'GraphColorer.ranges', buildRanges, colorCount);
            frame.copy(b.ranges, b.rangesStaging, rangesBytes);
        });
        const rangesCpu = readColorRanges(await this.core.readback(b.rangesStaging), colorCount);
        return {
            colorCount,
            edgeColors: b.colors,
            edgesByColor: b.values,
            ranges: b.ranges,
            rangesCpu,
        };
    }

    private allocate(): EdgeBuffers {
        const storage = (name: string, byteSize: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `${this.disc}:${name}`,
                byteSize: Math.max(16, byteSize),
            });
        const staging = (name: string, byteSize: number): StagingBufferSpec =>
            this.core.create<StagingBufferSpec>({
                kind: 'buffer',
                subkind: 'staging',
                discriminator: `${this.disc}:${name}`,
                byteSize,
            });
        const edges = this.capacity * 4;
        return {
            params: this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: `${this.disc}:gc_params`,
                byteSize: GraphColorParamsSchema.stride,
            }),
            status: storage('gc_status', GraphColorStatusSchema.stride),
            colors: storage('gc_colors', edges),
            keys: storage('gc_keys', edges),
            values: storage('gc_edges_by_color', edges),
            counts: storage('gc_counts', edges),
            offsets: storage('gc_offsets', edges),
            ranges: storage('gc_ranges', this.capacity * ColorRangeSchema.stride),
            statusStaging: staging('gc_status_staging', GraphColorStatusSchema.stride),
            rangesStaging: staging('gc_ranges_staging', this.capacity * ColorRangeSchema.stride),
        };
    }

    /** Buffers por vértice: recriados quando `vertexCount` passa da capacidade (nenhum envio anterior pendente). */
    private ensureVertexBuffers(vertexCount: number): VertexBuffers {
        if (this.vertex !== null && this.vertex.capacity >= vertexCount) return this.vertex;
        this.releaseVertexBuffers();
        const storage = (name: string): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `${this.disc}:${name}:${vertexCount}`,
                byteSize: Math.max(16, vertexCount * 4),
            });
        return (this.vertex = {
            capacity: vertexCount,
            degree: storage('gc_degree'),
            vmax: storage('gc_vmax'),
            used: storage('gc_used'),
            reduce: new Reduce(this.core, {
                discriminator: `${this.disc}:gc_max_degree`,
                capacity: vertexCount,
                op: 'max',
                type: 'u32',
            }),
        });
    }

    private releaseVertexBuffers(): void {
        if (this.vertex === null) return;
        for (const b of [this.vertex.degree, this.vertex.vmax, this.vertex.used]) {
            this.core.destroy(b);
        }
        this.vertex.reduce.destroy();
        this.vertex = null;
    }

    private kernel(
        b: EdgeBuffers,
        name: string,
        shader: WgslModule,
        entryPoint: string,
        bindings: readonly ComputeKernelBinding[],
    ): ComputeKernel {
        const kernel = createComputeKernel(this.core, {
            discriminator: `${this.disc}:${name}`,
            shader,
            entryPoint,
            bindGroups: [
                { bindings: [{ binding: 0, type: 'uniform', buffer: b.params }] },
                { bindings },
            ],
        });
        this.kernels.push(kernel);
        return kernel;
    }

    /** `count = null`: um grupo (passe de avanço, um único fio); senão `invocations(count, 256)`. */
    private dispatch(
        frame: Frame,
        label: string,
        kernel: ComputeKernel,
        count: number | null,
    ): void {
        frame.compute(label, (pass) => {
            pass.bind
                .setPipeline(kernel.pipeline)
                .setBindGroup(0, kernel.bindGroups[0]!)
                .setBindGroup(1, kernel.bindGroups[1]!);
            if (count === null) pass.dispatch.workgroups(1);
            else pass.dispatch.invocations(count, SCAN_GROUP);
        });
    }

    private submit(label: string, body: (frame: Frame) => void): void {
        this.core.record(label, body);
        this.core.submit();
    }

    private async readStatus(b: EdgeBuffers): Promise<GraphColorStatus> {
        this.submit('GraphColorer.status', (frame) => {
            frame.copy(b.status, b.statusStaging, GraphColorStatusSchema.stride);
        });
        return readGraphColorStatus(await this.core.readback(b.statusStaging));
    }

    private releaseKernels(): void {
        for (const k of this.kernels) destroyComputeKernel(this.core, k);
        this.kernels = [];
    }
}
