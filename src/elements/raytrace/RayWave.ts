import type { BindingSource, BoundFlow } from '../../scene/flows/FlowBinding';
import type { ComputePass, IndirectBufferSpec, StorageBufferSpec } from '../../scene/contracts/gpu';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { WorkContext, WorkPart } from '../../scene/flows/FlowWork';
import { wordBuffer } from '../gpu/compute/schemas';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { RayMaterialFunction } from './RayScene';
import { HIT_SHADE_ENTRY, RAY_WAVE_CLASS, hitShade, hitShadeConstants } from './hitShade';
import {
    RayWaveEntrySchema,
    rayWaveBins,
    rayWaveCountWords,
    rayWaveResources as R,
} from './wave/shaders';

/** Os buffers de uma onda. */
interface WaveBuffers {
    readonly entries: StorageBufferSpec;
    readonly counts: StorageBufferSpec;
    readonly ranges: StorageBufferSpec;
    readonly order: StorageBufferSpec;
}

type Compute = ReturnType<BoundFlow['compute']>;

/** Grupos no máximo de um despacho em passo de grade (o bastante para ocupar a GPU; o vazio custa ~2 µs). */
export const RAY_WAVE_GRID_GROUPS = 512;

/**
 * A onda dos acertos de quem traça (spec 039, R1–R5): os registros, os fechamentos, as contagens, as faixas, a ordem e
 * os argumentos indiretos de `capacity` raios e `classes` classes (as funções `material` da estrutura de raios), e os
 * kernels da separação e do material de cada classe, declarados no Flow de quem traça. Cada rodada: `reset` antes do
 * traçado (o kernel de quem traça grava os registros e conta) e `shade` depois — a separação e, por classe, o kernel de
 * material dela, ou o das constantes enquanto ele compila. O mesmo kernel de material (o mesmo WGSL e as mesmas
 * constantes) é o mesmo pipeline em todos os Flows: o núcleo deduplica pela especificação.
 */
export class RayWave implements WorkPart {
    private capacityValue = 0;
    private classesValue = 0;
    private functions: readonly RayMaterialFunction[] = [];
    private revision = -1;

    constructor(
        private readonly ctx: WorkContext,
        private readonly prefix: string,
    ) {
        ctx.work.use(this);
    }

    /** Os buffers da onda no Resource de trabalho (spec 039), pela capacidade e pelas classes atuais. */
    descriptors(): readonly GPUDescriptor[] {
        if (this.capacityValue === 0) return [];
        const id = (name: string): string => `${this.prefix}:${name}`;
        return [
            {
                id: id('ray_wave'),
                role: 'storage-rw',
                schema: RayWaveEntrySchema,
                upload: 'never',
                count: this.capacityValue,
            },
            wordBuffer(id('ray_wave_counts'), rayWaveCountWords(this.classesValue) * 4),
            wordBuffer(id('ray_wave_ranges'), this.classesValue * 8),
            wordBuffer(id('ray_wave_order'), this.capacityValue * 4),
        ];
    }

    /** Os buffers que a C2 alocou para a onda. */
    private get buffers(): WaveBuffers | undefined {
        if (this.capacityValue === 0) return undefined;
        const of = (name: string): StorageBufferSpec =>
            this.ctx.resources.bufferOf(
                this.ctx.work,
                `${this.prefix}:${name}`,
            ) as StorageBufferSpec;
        return {
            entries: of('ray_wave'),
            counts: of('ray_wave_counts'),
            ranges: of('ray_wave_ranges'),
            order: of('ray_wave_order'),
        };
    }

    /** Raios da onda. */
    get capacity(): number {
        return this.capacityValue;
    }

    /** Classes da onda. */
    get classes(): number {
        return this.classesValue;
    }

    /** O kernel do zeramento. */
    get resetId(): string {
        return `${this.prefix}:ray_wave_reset`;
    }

    /** O kernel das faixas e dos argumentos. */
    get scanId(): string {
        return `${this.prefix}:ray_wave_scan`;
    }

    /** O kernel do espalhamento. */
    get scatterId(): string {
        return `${this.prefix}:ray_wave_scatter`;
    }

    /** O kernel de material da classe `cls` na revisão atual. */
    shadeId(cls: number): string {
        return `${this.prefix}:hit_shade:${this.revision}:${cls}`;
    }

    /** O kernel das constantes sobre a classe `cls`. */
    fallbackId(cls: number): string {
        return `${this.prefix}:hit_shade_constants:${cls}`;
    }

    /**
     * Garante a onda para `capacity` raios (ao menos 1) e as funções `material` da revisão `revision` (as classes): os
     * buffers (refeitos quando crescem: devolve as fontes novas para o Flow ligar) e os kernels a declarar (os da
     * separação na primeira vez, os de material quando a revisão muda, com o das constantes por classe). As classes
     * nunca diminuem a onda abaixo de 1.
     */
    ensure(
        capacity: number,
        functions: readonly RayMaterialFunction[],
        revision: number,
    ): {
        readonly bindings: ReadonlyMap<WgslResource, BindingSource> | undefined;
        readonly pipelines: readonly PipelineDescriptor[];
        readonly released: readonly string[];
    } {
        const pipelines: PipelineDescriptor[] = [];
        const released: string[] = [];
        const classes = Math.max(1, functions.length);
        const grow =
            this.capacityValue === 0
            || capacity > this.capacityValue
            || classes > this.classesValue;
        let bindings: Map<WgslResource, BindingSource> | undefined;
        if (grow) {
            const first = this.capacityValue === 0;
            this.capacityValue = Math.max(1, capacity, this.capacityValue);
            this.classesValue = Math.max(classes, this.classesValue);
            // A C2 realoca a onda no tamanho novo (o Resource de trabalho se redescreve).
            this.ctx.work.refresh();
            const b = this.buffers!;
            bindings = new Map<WgslResource, BindingSource>([
                [R.entries, b.entries],
                [R.entriesIn, b.entries],
                [R.counts, b.counts],
                [R.ranges, b.ranges],
                [R.rangesOut, b.ranges],
                [R.order, b.order],
                [R.orderOut, b.order],
            ]);
            if (first) {
                pipelines.push(
                    {
                        id: this.resetId,
                        role: 'compute',
                        shader: rayWaveBins,
                        entryPoints: ['ray_wave_reset_main'],
                    },
                    {
                        id: this.scanId,
                        role: 'compute',
                        shader: rayWaveBins,
                        entryPoints: ['ray_wave_scan_main'],
                    },
                    {
                        id: this.scatterId,
                        role: 'compute',
                        shader: rayWaveBins,
                        entryPoints: ['ray_wave_scatter_main'],
                    },
                );
            }
        }
        if (revision !== this.revision) {
            for (let k = 0; k < this.functions.length; k++) released.push(this.shadeId(k));
            this.revision = revision;
            this.functions = functions;
            functions.forEach((f, k) => {
                pipelines.push({
                    id: this.shadeId(k),
                    role: 'compute',
                    shader: hitShade(f),
                    entryPoints: [HIT_SHADE_ENTRY],
                    constants: { [RAY_WAVE_CLASS]: k },
                    preferAsync: true,
                });
                pipelines.push({
                    id: this.fallbackId(k),
                    role: 'compute',
                    shader: hitShadeConstants,
                    entryPoints: [HIT_SHADE_ENTRY],
                    constants: { [RAY_WAVE_CLASS]: k },
                });
            });
        }
        return { bindings, pipelines, released };
    }

    /** Os kernels da separação prontos. */
    ready(bound: BoundFlow): boolean {
        return [this.resetId, this.scanId, this.scatterId].every((id) => {
            const p = bound.pipelines.get(id);
            return p?.role === 'compute' && p.ready;
        });
    }

    /** Os kernels de material de todas as classes prontos (nenhuma no substituto das constantes). */
    shadeReady(bound: BoundFlow): boolean {
        for (let k = 0; k < this.functions.length; k++) {
            const p = bound.pipelines.get(this.shadeId(k));
            if (p?.role !== 'compute' || !p.ready) return false;
        }
        return true;
    }

    /** Zera as contagens (antes do traçado da rodada). */
    reset(pass: ComputePass, bound: BoundFlow): void {
        const p = bound.pipelines.get(this.resetId) as Compute;
        pass.bind.setPipeline(p.spec);
        p.bindTo(pass.bind);
        pass.dispatch.invocations(rayWaveCountWords(this.classesValue), WORKGROUP_SIZE.value);
    }

    /**
     * Depois do traçado da rodada: as faixas, o espalhamento e o material de cada classe (o kernel dela pronto, senão o
     * das constantes). Com `groups`, o espalhamento e o material despacham os grupos lidos dele (argumentos indiretos que
     * quem traça gravou na GPU pelos raios da rodada; nenhum, sem raio) em vez da grade inteira.
     */
    shade(pass: ComputePass, bound: BoundFlow, groups?: IndirectBufferSpec): void {
        const grid = (): void => {
            if (groups === undefined)
                pass.dispatch.invocations(this.gridInvocations(), WORKGROUP_SIZE.value);
            else pass.dispatch.workgroupsIndirect(groups, 0);
        };
        const scan = bound.pipelines.get(this.scanId) as Compute;
        pass.bind.setPipeline(scan.spec);
        scan.bindTo(pass.bind);
        pass.dispatch.workgroups(1);
        const scatter = bound.pipelines.get(this.scatterId) as Compute;
        pass.bind.setPipeline(scatter.spec);
        scatter.bindTo(pass.bind);
        grid();
        for (let k = 0; k < this.functions.length; k++) {
            const own = bound.pipelines.get(this.shadeId(k));
            const kernel =
                own?.role === 'compute' && own.ready
                    ? own
                    : bound.pipelines.get(this.fallbackId(k));
            if (kernel?.role !== 'compute' || !kernel.ready) continue;
            pass.bind.setPipeline(kernel.spec);
            kernel.bindTo(pass.bind);
            grid();
        }
    }

    /**
     * Invocações dos despachos em passo de grade (a separação, o material por classe e quem traça pela onda): as da
     * capacidade, em no máximo `RAY_WAVE_GRID_GROUPS` grupos — os que bastam para ocupar a GPU; a rodada vazia custa só o
     * despacho deles.
     */
    gridInvocations(): number {
        const W = WORKGROUP_SIZE.value;
        return W * Math.max(1, Math.min(Math.ceil(this.capacityValue / W), RAY_WAVE_GRID_GROUPS));
    }

    /** Compatibilidade: os buffers são do Resource de trabalho (a C2 os libera com ele). */
    destroy(): void {}
}
