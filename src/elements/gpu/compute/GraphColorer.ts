import type { Frame, StorageBufferSpec, UniformBufferSpec } from '../../../scene/contracts/gpu';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { WorkContext, WorkPart } from '../../../scene/flows/FlowWork';
import type { BindingSource } from '../../../scene/flows/FlowBinding';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { PrefixSum, SCAN_GROUP } from './PrefixSum';
import { RadixSort } from './RadixSort';
import { Reduce } from './Reduce';
import {
    ColorRangeSchema,
    GraphColorParamsSchema,
    GraphColorStatusSchema,
    wordBuffer,
} from './schemas';
import { gcGroup, gcInit, gcRound, graphColorResources as R } from './shaders';
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

/** Decodifica o estado (`GraphColorStatusSchema`): os bytes lidos da GPU ou o registro desempacotado pela C2. */
export function readGraphColorStatus(
    source: ArrayBuffer | Record<string, unknown>,
): GraphColorStatus {
    const at =
        source instanceof ArrayBuffer
            ? (field: string): number =>
                  new Uint32Array(source)[GraphColorStatusSchema.offsetOf(field) / 4] ?? 0
            : (field: string): number => Number(source[field] ?? 0);
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
}

/** Buffers dimensionados por vértice (crescem sob demanda). */
interface VertexBuffers {
    readonly degree: StorageBufferSpec;
    readonly vmax: StorageBufferSpec;
    readonly used: StorageBufferSpec;
}

/**
 * Coloração de arestas na GPU (research R12) para resolver restrições em paralelo: arestas da mesma cor não
 * compartilham vértice. Cada cor é um emparelhamento maximal construído por subpassos (prioridade única por aresta
 * via `pcg_hash`, máximo atômico nos vértices), então o número de cores é ≤ 2Δ − 1. Depois a ordenação radix agrupa
 * as arestas por cor e a soma de prefixos das contagens dá os intervalos.
 *
 * Assíncrona e com envios próprios: chamada na criação ou mudança de topologia, fora de um quadro (`core.record`),
 * nunca por quadro — kernels e preparações internas são criados antes de cada envio. Substitui o `GraphColorSolver`
 * em CPU. Os buffers são descritores do Resource de trabalho (spec 039); o estado e os intervalos voltam à CPU pela
 * leitura sob demanda da C2 (`read`).
 */
export class GraphColorer implements WorkPart {
    private readonly disc: string;
    private readonly capacity: number;
    private readonly maxColorsOption: number | undefined;
    private readonly scan: PrefixSum;
    private readonly sort: RadixSort;
    private readonly reduce: Reduce;
    /** Vértices que os buffers por vértice comportam (0 antes da primeira coloração). */
    private vertexCapacity = 0;
    private kernels: ComputeKernel[] = [];
    /** `destroy()` soltou os descritores (a C2 libera os buffers); a próxima coloração os declara de novo. */
    private released = false;
    private busy = false;

    constructor(
        private readonly ctx: WorkContext,
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
        this.scan = new PrefixSum(ctx, {
            discriminator: `${this.disc}:gc_scan`,
            capacity: options.capacity,
        });
        this.sort = new RadixSort(ctx, {
            discriminator: `${this.disc}:gc_sort`,
            capacity: options.capacity,
            withValues: true,
        });
        this.reduce = new Reduce(ctx, {
            discriminator: `${this.disc}:gc_max_degree`,
            capacity: 1,
            op: 'max',
            type: 'u32',
        });
        ctx.work.use(this);
    }

    /** Parâmetros, estado e buffers por aresta (pela capacidade) e, depois da primeira coloração, os por vértice. */
    descriptors(): readonly GPUDescriptor[] {
        if (this.released) return [];
        const edges = this.capacity * 4;
        const id = (name: string): string => `${this.disc}:${name}`;
        return [
            // Uma região: escrita na hora pela C2 (`writeRegions`), antes dos envios próprios da coloração.
            {
                id: id('gc_params'),
                role: 'uniform',
                schema: GraphColorParamsSchema,
                regions: { count: 1 },
            },
            {
                id: id('gc_status'),
                role: 'storage-rw',
                schema: GraphColorStatusSchema,
                upload: 'never',
            },
            wordBuffer(id('gc_colors'), edges),
            wordBuffer(id('gc_keys'), edges),
            wordBuffer(id('gc_edges_by_color'), edges),
            wordBuffer(id('gc_counts'), edges),
            wordBuffer(id('gc_offsets'), edges),
            {
                id: id('gc_ranges'),
                role: 'storage-rw',
                schema: ColorRangeSchema,
                upload: 'never',
                count: this.capacity,
            },
            ...(this.vertexCapacity === 0
                ? []
                : [
                      wordBuffer(id('gc_degree'), this.vertexCapacity * 4),
                      wordBuffer(id('gc_vmax'), this.vertexCapacity * 4),
                      wordBuffer(id('gc_used'), this.vertexCapacity * 4),
                  ]),
        ];
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

    /** Libera os kernels (e os da ordenação, da soma e da redução) e solta os buffers: a C2 os libera. */
    destroy(): void {
        this.releaseKernels();
        this.reduce.destroy();
        this.scan.destroy();
        this.sort.destroy();
        this.released = true;
        this.vertexCapacity = 0;
        this.ctx.work.refresh();
    }

    private async run(
        edges: StorageBufferSpec,
        count: number,
        vertexCount: number,
    ): Promise<GraphColoring> {
        if (this.released) {
            this.released = false;
            this.ctx.work.refresh();
        }
        const vertex = this.ensureVertexBuffers(Math.max(1, vertexCount));
        const b = this.edgeBuffers();
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
        this.ctx.resources.writeRegions(this.ctx.work, `${this.disc}:gc_params`, [
            { edge_count: count, vertex_count: vertexCount, max_colors: 0 },
        ]);
        const init = this.kernel(
            'gc_init',
            gcInit,
            'gc_init_main',
            new Map<WgslResource, BindingSource>([
                [R.gc, b.params],
                [R.edges, edges],
                [R.colors, b.colors],
                [R.degree, vertex.degree],
                [R.status, status],
            ]),
        );
        if (vertexCount > 0) this.reduce.prepare(vertex.degree, status);
        this.submit('GraphColorer.init', (frame) => {
            frame.clear(status);
            frame.clear(vertex.degree, 0, vertexCount * 4);
            frame.clear(vertex.used, 0, vertexCount * 4);
            this.dispatch(frame, 'GraphColorer.init', init, count);
            if (vertexCount > 0) {
                this.reduce.record(frame, {
                    src: vertex.degree,
                    count: vertexCount,
                    out: status,
                    outOffset: GraphColorStatusSchema.offsetOf('max_degree') / 4,
                });
            }
        });
        const validated = await this.readStatus();
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
        const round = new Map<WgslResource, BindingSource>([
            [R.gc, b.params],
            [R.edges, edges],
            [R.colors, b.colors],
            [R.vmax, vertex.vmax],
            [R.used, vertex.used],
            [R.status, status],
        ]);
        const priority = this.kernel('gc_priority', gcRound, 'gc_priority_main', round);
        const assign = this.kernel('gc_assign', gcRound, 'gc_assign_main', round);
        const advance = this.kernel(
            'gc_advance',
            gcRound,
            'gc_advance_main',
            new Map<WgslResource, BindingSource>([[R.status, status]]),
        );
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
            state = await this.readStatus();
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
        const sortInit = this.kernel(
            'gc_sort_init',
            gcGroup,
            'gc_sort_init_main',
            new Map<WgslResource, BindingSource>([
                [R.gc, b.params],
                [R.colorsRead, b.colors],
                [R.keys, b.keys],
                [R.values, b.values],
            ]),
        );
        const countColors = this.kernel(
            'gc_count',
            gcGroup,
            'gc_count_main',
            new Map<WgslResource, BindingSource>([
                [R.gc, b.params],
                [R.colorsRead, b.colors],
                [R.counts, b.counts],
            ]),
        );
        const buildRanges = this.kernel(
            'gc_ranges',
            gcGroup,
            'gc_ranges_main',
            new Map<WgslResource, BindingSource>([
                [R.counts, b.counts],
                [R.offsets, b.offsets],
                [R.ranges, b.ranges],
                [R.status, status],
            ]),
        );
        this.sort.prepare(b.keys, b.values);
        this.scan.prepare(b.offsets);
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
        });
        const ranges = await this.ctx.resources.read(this.ctx.work, `${this.disc}:gc_ranges`);
        const offsets = (ranges?.offset ?? []) as number[];
        const sizes = (ranges?.count ?? []) as number[];
        const rangesCpu: ColorRangeCpu[] = Array.from({ length: colorCount }, (_, c) => ({
            offset: offsets[c] ?? 0,
            count: sizes[c] ?? 0,
        }));
        return {
            colorCount,
            edgeColors: b.colors,
            edgesByColor: b.values,
            ranges: b.ranges,
            rangesCpu,
        };
    }

    private buffer(name: string): StorageBufferSpec {
        const buffer = this.ctx.resources.bufferOf(this.ctx.work, `${this.disc}:${name}`);
        if (buffer === undefined)
            throw new Error(`GraphColorer(${this.disc}): trabalho fora da cena.`);
        return buffer as StorageBufferSpec;
    }

    private edgeBuffers(): EdgeBuffers {
        return {
            params: this.buffer('gc_params') as unknown as UniformBufferSpec,
            status: this.buffer('gc_status'),
            colors: this.buffer('gc_colors'),
            keys: this.buffer('gc_keys'),
            values: this.buffer('gc_edges_by_color'),
            counts: this.buffer('gc_counts'),
            offsets: this.buffer('gc_offsets'),
            ranges: this.buffer('gc_ranges'),
        };
    }

    /** Buffers por vértice: crescem (o trabalho se redescreve) quando `vertexCount` passa da capacidade. */
    private ensureVertexBuffers(vertexCount: number): VertexBuffers {
        if (vertexCount > this.vertexCapacity) {
            this.vertexCapacity = vertexCount;
            this.ctx.work.refresh();
        }
        this.reduce.reserve(this.vertexCapacity);
        return {
            degree: this.buffer('gc_degree'),
            vmax: this.buffer('gc_vmax'),
            used: this.buffer('gc_used'),
        };
    }

    private kernel(
        name: string,
        shader: WgslModule,
        entryPoint: string,
        bindings: ReadonlyMap<WgslResource, BindingSource>,
    ): ComputeKernel {
        const kernel = createComputeKernel(this.ctx.core, {
            discriminator: `${this.disc}:${name}`,
            shader,
            entryPoint,
            bindings,
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
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind);
            if (count === null) pass.dispatch.workgroups(1);
            else pass.dispatch.invocations(count, SCAN_GROUP);
        });
    }

    private submit(label: string, body: (frame: Frame) => void): void {
        this.ctx.core.record(label, body);
        this.ctx.core.submit();
    }

    /** O estado, pela leitura sob demanda da C2 (depois dos envios já feitos). */
    private async readStatus(): Promise<GraphColorStatus> {
        const status = await this.ctx.resources.read(this.ctx.work, `${this.disc}:gc_status`);
        if (status === undefined)
            throw new Error(`GraphColorer(${this.disc}): trabalho fora da cena.`);
        return readGraphColorStatus(status);
    }

    private releaseKernels(): void {
        for (const k of this.kernels) destroyComputeKernel(this.ctx.core, k);
        this.kernels = [];
    }
}
