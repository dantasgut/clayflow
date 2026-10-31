import type { BindingSource } from '../../../scene/flows/FlowBinding';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { Frame, StorageBufferSpec, UniformBufferSpec } from '../../../scene/contracts/gpu';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { WorkContext, WorkPart } from '../../../scene/flows/FlowWork';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { PrefixSum } from './PrefixSum';
import { HashGridParamsSchema, wordBuffer } from './schemas';
import { shCount, shScatter, hashGridResources } from './shaders';

/** Opções de `SpatialHashGrid`. */
export interface SpatialHashGridOptions {
    /** Prefixo único dos recursos da instância. */
    readonly discriminator: string;
    /** Prefixo dos rótulos dos passes (perfil por passo). Padrão `'SpatialHashGrid'`. */
    readonly label?: string;
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
 * deve depender dela. Os buffers e os parâmetros são descritores do Resource de trabalho (spec 039): a tabela e a
 * capacidade novas redescrevem o trabalho, e a C2 realoca.
 */
export class SpatialHashGrid implements WorkPart {
    private readonly disc: string;
    private readonly label: string;
    private readonly scan: PrefixSum;
    private items: StorageBufferSpec | null = null;
    private table = 0;
    private capacity = 0;
    private countKernel: ComputeKernel | null = null;
    private scatterKernel: ComputeKernel | null = null;
    private count = 0;

    constructor(
        private readonly ctx: WorkContext,
        options: SpatialHashGridOptions,
    ) {
        this.disc = options.discriminator;
        this.label = options.label ?? 'SpatialHashGrid';
        this.scan = new PrefixSum(ctx, {
            discriminator: `${this.disc}:scan`,
            capacity: 1 << 24,
            ...(options.label !== undefined ? { label: `${options.label}.scan` } : {}),
        });
        ctx.work.use(this);
    }

    /** Parâmetros (sempre) e, depois do primeiro `prepare`, contagens, inícios e cursores da tabela e os itens. */
    descriptors(): readonly GPUDescriptor[] {
        const params: GPUDescriptor = {
            id: `${this.disc}:params`,
            role: 'uniform',
            schema: HashGridParamsSchema,
        };
        if (this.table === 0) return [params];
        return [
            params,
            wordBuffer(`${this.disc}:counts`, this.table * 4),
            wordBuffer(`${this.disc}:starts`, this.table * 4),
            wordBuffer(`${this.disc}:cursors`, this.table * 4),
            wordBuffer(`${this.disc}:items`, this.capacity * 4),
        ];
    }

    /** Parâmetros da grade (uniform `HashGridParams`), para quem consulta. */
    get params(): UniformBufferSpec {
        return this.buffer('params') as UniformBufferSpec;
    }

    /** Início de cada balde em `cellItems` (soma de prefixos exclusiva). */
    get cellStart(): StorageBufferSpec {
        return this.storage('starts');
    }

    /** Itens de cada balde. */
    get cellCount(): StorageBufferSpec {
        return this.storage('counts');
    }

    /** Índices dos itens, agrupados por balde. */
    get cellItems(): StorageBufferSpec {
        return this.storage('items');
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
        if (this.table === 0 || table !== this.table || capacity > this.capacity) {
            this.table = table;
            this.capacity = Math.max(capacity, this.capacity);
            this.ctx.work.refresh();
            changed = true;
        }
        this.scan.prepare(this.cellStart, recordsPerFrame);
        if (changed || items !== this.items) {
            this.items = items;
            this.releaseKernels();
            this.countKernel = createComputeKernel(this.ctx.core, {
                discriminator: `${this.disc}:count`,
                shader: shCount,
                entryPoint: 'sh_count_main',
                bindings: new Map<WgslResource, BindingSource>([
                    [hashGridResources.grid, this.params],
                    [hashGridResources.items, items],
                    [hashGridResources.counts, this.cellCount],
                ]),
            });
            this.scatterKernel = createComputeKernel(this.ctx.core, {
                discriminator: `${this.disc}:scatter`,
                shader: shScatter,
                entryPoint: 'sh_scatter_main',
                bindings: new Map<WgslResource, BindingSource>([
                    [hashGridResources.grid, this.params],
                    [hashGridResources.items, items],
                    [hashGridResources.cursors, this.storage('cursors')],
                    [hashGridResources.cellItems, this.cellItems],
                ]),
            });
        }
        this.count = count;
        // Enviado pela C2 no próximo envio dos sujos (antes da gravação do quadro).
        this.ctx.work.data[`${this.disc}:params`] = [
            { count, table_mask: table - 1, cell_size: cellSize },
        ];
        return changed;
    }

    /** Grava a construção da grade: zera as contagens, conta, soma os prefixos, copia os cursores e espalha. */
    record(frame: Frame): void {
        if (this.count === 0 || this.countKernel === null || this.scatterKernel === null) return;
        const counts = this.cellCount;
        const starts = this.cellStart;
        frame.clear(counts);
        this.run(frame, `${this.label}.count`, this.countKernel);
        this.scan.record(frame, { src: counts, dst: starts, count: this.table });
        frame.copy(starts, this.storage('cursors'), this.table * 4);
        this.run(frame, `${this.label}.scatter`, this.scatterKernel);
    }

    /**
     * Libera os kernels e solta a tabela e os itens (a C2 libera os buffers); o próximo `prepare` os declara de novo.
     */
    destroy(): void {
        this.releaseKernels();
        this.scan.destroy();
        this.items = null;
        this.table = 0;
        this.capacity = 0;
        this.ctx.work.refresh();
    }

    private run(frame: Frame, label: string, kernel: ComputeKernel): void {
        frame.compute(label, (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind);
            pass.dispatch.invocations(this.count, WORKGROUP_SIZE.value);
        });
    }

    private buffer(name: string): StorageBufferSpec | UniformBufferSpec {
        const buffer = this.ctx.resources.bufferOf(this.ctx.work, `${this.disc}:${name}`);
        if (buffer === undefined)
            throw new Error(`SpatialHashGrid(${this.disc}): prepare() antes do uso.`);
        return buffer as StorageBufferSpec | UniformBufferSpec;
    }

    private storage(name: string): StorageBufferSpec {
        if (this.table === 0)
            throw new Error(`SpatialHashGrid(${this.disc}): prepare() antes do uso.`);
        return this.buffer(name) as StorageBufferSpec;
    }

    private releaseKernels(): void {
        for (const k of [this.countKernel, this.scatterKernel])
            if (k !== null) destroyComputeKernel(this.ctx.core, k);
        this.countKernel = null;
        this.scatterKernel = null;
    }
}
