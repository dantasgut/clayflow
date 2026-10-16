import type { BindingSource } from '../../../scene/flows/FlowBinding';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type {
    EngineCore,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../scene/contracts/gpu';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { PrefixSum } from './PrefixSum';
import { HashGridParamsSchema } from './schemas';
import { shCount, shScatter, hashGridResources } from './shaders';

/** Opções de `SpatialHashGrid`. */
export interface SpatialHashGridOptions {
    /** Prefixo único dos recursos da instância. */
    readonly discriminator: string;
}

/** Menor tabela de baldes. */
const MIN_TABLE = 1024;

/** Tamanho da tabela (potência de 2, ≥ 2 × itens) para `count` itens. */
export function hashTableSize(count: number): number {
    let size = MIN_TABLE;
    while (size < count * 2) size *= 2;
    return size;
}

/**
 * Grade hash espacial ilimitada em GPU (spec 007, research R9) — a variante sem volume fixo da busca de vizinhança da
 * 005: cada item (`array<vec4f>`: centro em `xyz`; `w < 0` = fora da grade) vai para o balde da célula do seu centro;
 * a construção conta os itens por balde, soma os prefixos (`PrefixSum`) e espalha os índices. Quem consulta lê
 * `cellStart[b]`/`cellCount[b]`/`cellItems` com `sh_cell`/`sh_hash` (módulo `spatialHash`) e aceita um item só se a
 * célula do centro dele é a consultada — baldes compartilhados por células distintas não geram duplicatas.
 *
 * Duas fases (spec 006): `prepare` (fora da gravação, numa transição do Flow) dimensiona buffers e kernels e escreve os
 * parâmetros; `record` só grava. A ordem dos índices dentro de um balde não é determinística (atômicos); a consulta não
 * deve depender dela.
 */
export class SpatialHashGrid {
    private readonly disc: string;
    private readonly scan: PrefixSum;
    private readonly paramsBuffer: UniformBufferSpec;
    private items: StorageBufferSpec | null = null;
    private table = 0;
    private capacity = 0;
    private starts: StorageBufferSpec | null = null;
    private counts: StorageBufferSpec | null = null;
    private cursors: StorageBufferSpec | null = null;
    private itemsOut: StorageBufferSpec | null = null;
    private countKernel: ComputeKernel | null = null;
    private scatterKernel: ComputeKernel | null = null;
    private count = 0;

    constructor(
        private readonly core: EngineCore,
        options: SpatialHashGridOptions,
    ) {
        this.disc = options.discriminator;
        this.paramsBuffer = core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: `${this.disc}:params`,
            byteSize: HashGridParamsSchema.stride,
        });
        this.scan = new PrefixSum(core, {
            discriminator: `${this.disc}:scan`,
            capacity: 1 << 24,
        });
    }

    /** Parâmetros da grade (uniform `HashGridParams`), para quem consulta. */
    get params(): UniformBufferSpec {
        return this.paramsBuffer;
    }

    /** Início de cada balde em `cellItems` (soma de prefixos exclusiva). */
    get cellStart(): StorageBufferSpec {
        return this.require(this.starts);
    }

    /** Itens de cada balde. */
    get cellCount(): StorageBufferSpec {
        return this.require(this.counts);
    }

    /** Índices dos itens, agrupados por balde. */
    get cellItems(): StorageBufferSpec {
        return this.require(this.itemsOut);
    }

    /**
     * Prepara a grade para `count` itens de `items` com células de lado `cellSize`, gravada até `recordsPerFrame`
     * vezes por quadro: recria buffers e kernels quando os itens ou a capacidade mudam e escreve os parâmetros.
     * Devolve `true` se algum buffer exposto foi recriado (quem consulta religa). Chamado fora da gravação.
     */
    prepare(
        items: StorageBufferSpec,
        count: number,
        cellSize: number,
        recordsPerFrame = 1,
    ): boolean {
        const table = hashTableSize(count);
        const capacity = Math.max(64, count);
        let changed = false;
        if (this.starts === null || table !== this.table || capacity > this.capacity) {
            this.releaseBuffers();
            this.table = table;
            this.capacity = Math.max(capacity, this.capacity);
            const storage = (name: string, byteSize: number): StorageBufferSpec =>
                this.core.create<StorageBufferSpec>({
                    kind: 'buffer',
                    subkind: 'storage',
                    discriminator: `${this.disc}:${name}:${table}:${this.capacity}`,
                    byteSize,
                });
            this.counts = storage('counts', table * 4);
            this.starts = storage('starts', table * 4);
            this.cursors = storage('cursors', table * 4);
            this.itemsOut = storage('items', this.capacity * 4);
            changed = true;
        }
        this.scan.prepare(this.starts, recordsPerFrame);
        if (changed || items !== this.items) {
            this.items = items;
            this.releaseKernels();
            this.countKernel = createComputeKernel(this.core, {
                discriminator: `${this.disc}:count`,
                shader: shCount,
                entryPoint: 'sh_count_main',
                bindings: new Map<WgslResource, BindingSource>([
                    [hashGridResources.grid, this.paramsBuffer],
                    [hashGridResources.items, items],
                    [hashGridResources.counts, this.counts!],
                ]),
            });
            this.scatterKernel = createComputeKernel(this.core, {
                discriminator: `${this.disc}:scatter`,
                shader: shScatter,
                entryPoint: 'sh_scatter_main',
                bindings: new Map<WgslResource, BindingSource>([
                    [hashGridResources.grid, this.paramsBuffer],
                    [hashGridResources.items, items],
                    [hashGridResources.cursors, this.cursors!],
                    [hashGridResources.cellItems, this.itemsOut!],
                ]),
            });
        }
        this.count = count;
        this.core.write(
            this.paramsBuffer,
            HashGridParamsSchema.pack({ count, table_mask: table - 1, cell_size: cellSize }),
        );
        return changed;
    }

    /** Grava a construção da grade: zera as contagens, conta, soma os prefixos, copia os cursores e espalha. */
    record(frame: Frame): void {
        if (this.count === 0 || this.countKernel === null || this.scatterKernel === null) return;
        frame.clear(this.counts!);
        this.run(frame, 'SpatialHashGrid.count', this.countKernel);
        this.scan.record(frame, { src: this.counts!, dst: this.starts!, count: this.table });
        frame.copy(this.starts!, this.cursors!, this.table * 4);
        this.run(frame, 'SpatialHashGrid.scatter', this.scatterKernel);
    }

    /** Libera buffers, kernels e uniforms. */
    destroy(): void {
        this.releaseKernels();
        this.releaseBuffers();
        this.scan.destroy();
        this.core.destroy(this.paramsBuffer);
    }

    private run(frame: Frame, label: string, kernel: ComputeKernel): void {
        frame.compute(label, (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind);
            pass.dispatch.invocations(this.count, WORKGROUP_SIZE.value);
        });
    }

    private require(spec: StorageBufferSpec | null): StorageBufferSpec {
        if (spec === null)
            throw new Error(`SpatialHashGrid(${this.disc}): prepare() antes do uso.`);
        return spec;
    }

    private releaseKernels(): void {
        for (const k of [this.countKernel, this.scatterKernel])
            if (k !== null) destroyComputeKernel(this.core, k);
        this.countKernel = null;
        this.scatterKernel = null;
    }

    private releaseBuffers(): void {
        for (const b of [this.counts, this.starts, this.cursors, this.itemsOut])
            if (b !== null) this.core.destroy(b);
        this.counts = this.starts = this.cursors = this.itemsOut = null;
    }
}
