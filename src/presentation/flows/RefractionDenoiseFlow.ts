import type { Frame } from '../../scene/contracts/gpu';
import type { Resource } from '../../scene/contracts/Resource';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../scene/flows/Flow';
import type {
    BindingKey,
    BindingSource,
    BoundFlow,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import {
    slot,
    type ChannelSlot,
    type SingletonSlot,
    type SlotMap,
    type TextureSlot,
} from '../../scene/flows/slots';
import { bindPoints } from '../../scene/shaders/bindPoints';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import {
    TEMPORAL_FILTER_CHANNELS,
    TemporalFilter,
} from '../../elements/lighting/temporal/TemporalFilter';
import {
    TEMPORAL_FILTER_ATROUS_STEPS,
    temporalFilterSlots,
    temporalFilterSourcePoint,
    temporalFilterVariant,
    type TemporalFilterVariant,
} from '../../elements/lighting/temporal/shaders';
import { Refraction } from '../../elements/lighting/refraction/Refraction';
import {
    refractionDenoiseSource,
    refractionResources as R,
} from '../../elements/lighting/refraction/shaders';
import {
    TemporalAntialiasing,
    type HistoryPrecision,
} from '../../elements/scene/TemporalAntialiasing';
import { FrameTargets } from '../app/FrameTargets';

/** Slots do filtro da refração traçada. */
export interface RefractionDenoiseSlots extends SlotMap {
    /** A refração da cena: o sinal (o pedido, a radiância, o ponto mostrado e o gradiente temporal). */
    readonly refraction: SingletonSlot<false>;
    /** O filtro de sinal traçado da cena (os alvos e os parâmetros); sem ele, a composição usa a amostra crua. */
    readonly denoiser: SingletonSlot<true>;
    /**
     * Vetores de movimento (`FrameTargets.motion`; o rg é o da superfície dos transmissivos): só existem sem MSAA.
     * Opcional — sem eles o filtro não roda (um slot obrigatório deixaria o motor pendente em toda cena com MSAA).
     */
    readonly motion: TextureSlot<true>;
    /** O antisserrilhado da cena: só com o temporal (o movimento existe e a imagem acumula). */
    readonly antialiasing: SingletonSlot<true>;
    /** Os canais temporais do filtro (spec 037): a média, os momentos e o guia, o anterior e o de agora. */
    readonly temporalFilterAccumulated: ChannelSlot<true>;
    readonly temporalFilterMoments: ChannelSlot<true>;
    readonly temporalFilterGuide: ChannelSlot<true>;
}

type Ctx = TransitionContext<RefractionDenoiseSlots>;

/** Os kernels com a refração como fonte do sinal (o ponto `temporal_filter_source`). */
const fromRefraction = (shader: WgslModule): WgslModule =>
    bindPoints(shader, new Map([[temporalFilterSourcePoint, refractionDenoiseSource]]));

/** Os pipelines do filtro numa precisão (spec 037: o formato dos alvos escritos é parte do WGSL). */
interface DenoisePipelines {
    readonly variant: TemporalFilterVariant;
    readonly temporal: PipelineDescriptor;
    /**
     * As passadas à-trous: o passo e de onde para onde, a partir da média temporal (repetida em `work` pela passada
     * temporal: o histórico não é tocado), alternando com a cor filtrada (`output`), onde termina a última.
     */
    readonly atrous: readonly {
        readonly pipeline: PipelineDescriptor;
        readonly from: 'work' | 'output';
        readonly into: 'work' | 'output';
    }[];
}

const pipelinesByPrecision = new Map<HistoryPrecision, DenoisePipelines>();

function pipelinesFor(precision: HistoryPrecision): DenoisePipelines {
    const known = pipelinesByPrecision.get(precision);
    if (known !== undefined) return known;
    const variant = temporalFilterVariant(precision);
    const suffix = precision === 'full' ? '_full' : '';
    const made: DenoisePipelines = {
        variant,
        temporal: {
            id: `refraction_denoise_temporal${suffix}`,
            role: 'compute',
            shader: fromRefraction(variant.temporal),
            entryPoints: ['temporal_filter_temporal_main'],
        },
        atrous: TEMPORAL_FILTER_ATROUS_STEPS.map((step, k) => {
            const even = k % 2 === 0;
            return {
                pipeline: {
                    id: `refraction_denoise_atrous_${step}${suffix}`,
                    role: 'compute',
                    shader: fromRefraction(variant.atrous),
                    entryPoints: [`temporal_filter_atrous_${step}_main`],
                },
                from: even ? 'work' : 'output',
                into: even ? 'output' : 'work',
            } as const;
        }),
    };
    pipelinesByPrecision.set(precision, made);
    return made;
}

/** Os alvos do filtro ligados pelo estágio (sob demanda, do tamanho do canvas); os canais a C2 liga. */
const TARGETS = ['work', 'output'] as const;

/**
 * RefractionDenoiseFlow — o filtro de sinal traçado (`TemporalFilter`) sobre a refração (spec 034, R3, T044a).
 *
 * Na fase `forward`, depois do traçado (`RefractionFlow`) e antes da composição, só com o antisserrilhado temporal e o
 * filtro ligado: a refração é a fonte do sinal (`refraction_denoise_source`: os pixels com pedido, a radiância, o
 * ponto mostrado e o gradiente temporal — que este estágio aloca, e o traçado passa a medir); o movimento da superfície
 * vem do rg de `FrameTargets.motion`. A passada temporal grava a média, os momentos e o guia nas fatias de agora dos
 * canais temporais do filtro (o quadro seguinte os lê pelo atraso 1, sem cópia; spec 037) e as à-trous; a cor
 * filtrada fica em `TemporalFilter.output`.
 * Declara a cada quadro se a produziu (a composição usa a amostra crua quando não).
 */
export class RefractionDenoiseFlow extends Flow<RefractionDenoiseSlots, 'idle'> {
    readonly type = 'RefractionDenoiseFlow';
    readonly slots: RefractionDenoiseSlots = {
        refraction: slot.singleton(Refraction.schema),
        denoiser: slot.singleton(TemporalFilter.schema, { optional: true }),
        motion: slot.texture(FrameTargets.schema, 'motion', { optional: true }),
        antialiasing: slot.singleton(TemporalAntialiasing.schema, { optional: true }),
        ...temporalFilterSlots,
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    /** As precisões cujos pipelines foram pedidos. */
    private readonly prepared = new Set<HistoryPrecision>();
    /** Os pipelines da precisão do filtro neste quadro. */
    private current: DenoisePipelines = pipelinesFor('half');
    /** Fontes ligadas (outras = religa: redimensionamento). */
    private bound: readonly unknown[] = [];
    /** Pixels do canvas (o despacho de cada passada). */
    private pixels = 0;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                poolReallocated: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                canvasReconfigured: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        const denoiser = c.bound.slots.denoiser?.resource as
                            | TemporalFilter
                            | undefined;
                        if (denoiser === undefined) return;
                        const refraction = c.bound.slots.refraction.resource;
                        const ready = this.prepare(c, denoiser);
                        c.produced(
                            denoiser,
                            'output',
                            ready && this.resources.isProduced(refraction, 'radiance'),
                        );
                    },
                },
            },
        };
    }

    /** A passada temporal (as fatias de agora dos canais) e as à-trous. */
    dispatch(frame: Frame, bound: BoundFlow<RefractionDenoiseSlots>): void {
        const denoiser = bound.slots.denoiser?.resource;
        if (denoiser === undefined || !this.resources.isProduced(denoiser, 'output')) return;
        const temporal = bound.pipelines.get(this.current.temporal.id);
        if (temporal?.role !== 'compute') return;
        frame.compute('RefractionDenoiseFlow.temporal', (pass) => {
            pass.bind.setPipeline(temporal.spec);
            temporal.bindTo(pass.bind);
            pass.dispatch.invocations(this.pixels, WORKGROUP_SIZE.value);
        });
        // O que o quadro seguinte lê como histórico — o guia de agora e a média sem o filtro espacial (realimentar o
        // histórico com a cor filtrada acumularia o borrão), com os momentos — está nas fatias de agora dos canais.
        bound.slots.temporalFilterAccumulated?.written();
        bound.slots.temporalFilterMoments?.written();
        bound.slots.temporalFilterGuide?.written();
        frame.compute('RefractionDenoiseFlow.atrous', (pass) => {
            for (const { pipeline } of this.current.atrous) {
                const p = bound.pipelines.get(pipeline.id);
                if (p?.role !== 'compute') continue;
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind);
                pass.dispatch.invocations(this.pixels, WORKGROUP_SIZE.value);
            }
        });
    }

    /**
     * Com o antisserrilhado temporal, o filtro ligado e o pedido alocado: aloca o gradiente da refração e os alvos do
     * filtro, liga-os (religa quando mudam) e prepara os pipelines. Devolve se todos estão prontos.
     */
    private prepare(c: Ctx, denoiser: TemporalFilter): boolean {
        const aa = c.bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        const refraction = c.bound.slots.refraction.resource;
        if (
            !denoiser.enabled
            || aa?.mode !== 'temporal'
            || this.resources.textureOf(refraction, 'request') === undefined
        )
            return false;
        this.current = pipelinesFor(denoiser.historyPrecision);
        const D = this.current.variant.resources;
        this.resources.ensureAllocated(refraction, 'gradient');
        for (const id of [...TARGETS, ...TEMPORAL_FILTER_CHANNELS])
            this.resources.ensureAllocated(denoiser, id);
        const view = (r: Resource, id: string): BindingSource | undefined =>
            this.resources.textureViewOf(r, id);
        const signal = (['request', 'radiance', 'hit', 'albedo', 'gradient'] as const).map((id) =>
            view(refraction, id),
        );
        const targets = TARGETS.map((id) => view(denoiser, id));
        const motion = c.bound.slots.motion?.view;
        if (motion === undefined) return false;
        const sources = [...signal, ...targets, motion];
        if (sources.some((s) => s === undefined)) return false;
        if (sources.some((s, k) => s !== this.bound[k]) || this.bound.at(-1) !== this.current) {
            const of = (id: (typeof TARGETS)[number]): BindingSource =>
                targets[TARGETS.indexOf(id)]!;
            const [request, radiance, hit, albedo, gradient] = signal;
            const binds = new Map<BindingKey, BindingSource>([
                [R.request, request!],
                [R.radiance, radiance!],
                [R.hit, hit!],
                [R.albedo, albedo!],
                [R.gradient, gradient!],
                [D.surfaceMotion, motion],
                [D.workOut, of('work')],
            ]);
            for (const { pipeline, from, into } of this.current.atrous) {
                binds.set({ pipeline: pipeline.id, resource: D.filterIn }, of(from));
                binds.set({ pipeline: pipeline.id, resource: D.filterOut }, of(into));
            }
            c.bind(binds);
            this.bound = [...sources, this.current];
        }
        const request = this.resources.textureOf(refraction, 'request')!;
        this.pixels = request.width * request.height;
        if (!this.prepared.has(denoiser.historyPrecision)) {
            this.prepared.add(denoiser.historyPrecision);
            c.prepare(this.current.temporal);
            for (const { pipeline } of this.current.atrous) c.prepare(pipeline);
        }
        return [
            this.current.temporal,
            ...this.current.atrous.map(({ pipeline }) => pipeline),
        ].every((p) => c.bound.pipelines.get(p.id)?.ready === true);
    }
}
