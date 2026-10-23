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
import { slot, type SingletonSlot, type SlotMap, type TextureSlot } from '../../scene/flows/slots';
import { bindPoints } from '../../scene/shaders/bindPoints';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { TracedDenoiser } from '../../elements/lighting/denoise/TracedDenoiser';
import {
    TRACED_DENOISE_ATROUS_STEPS,
    tracedDenoiseAtrous,
    tracedDenoiseResources as D,
    tracedDenoiseSourcePoint,
    tracedDenoiseTemporal,
} from '../../elements/lighting/denoise/shaders';
import { Refraction } from '../../elements/lighting/refraction/Refraction';
import {
    refractionDenoiseSource,
    refractionResources as R,
} from '../../elements/lighting/refraction/shaders';
import { TemporalAntialiasing } from '../../elements/scene/TemporalAntialiasing';
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
}

type Ctx = TransitionContext<RefractionDenoiseSlots>;

/** Os kernels com a refração como fonte do sinal (o ponto `traced_denoise_source`). */
const fromRefraction = (shader: WgslModule): WgslModule =>
    bindPoints(shader, new Map([[tracedDenoiseSourcePoint, refractionDenoiseSource]]));

const TEMPORAL: PipelineDescriptor = {
    id: 'refraction_denoise_temporal',
    role: 'compute',
    shader: fromRefraction(tracedDenoiseTemporal),
    entryPoints: ['traced_denoise_temporal_main'],
};

/**
 * As passadas à-trous: o passo e de onde para onde, a partir da média temporal (`accumulated`, já guardada como
 * histórico), alternando com a cor filtrada (`output`), onde termina a última.
 */
const ATROUS = TRACED_DENOISE_ATROUS_STEPS.map((step, k) => {
    const pipeline: PipelineDescriptor = {
        id: `refraction_denoise_atrous_${step}`,
        role: 'compute',
        shader: fromRefraction(tracedDenoiseAtrous),
        entryPoints: [`traced_denoise_atrous_${step}_main`],
    };
    const even = k % 2 === 0;
    return {
        pipeline,
        from: even ? 'accumulated' : 'output',
        into: even ? 'output' : 'accumulated',
    } as const;
});

/** Os alvos do filtro (sob demanda, do tamanho do canvas). */
const TARGETS = [
    'accumulated',
    'accumulatedMoments',
    'history',
    'historyMoments',
    'guidePrevious',
    'output',
] as const;

/**
 * RefractionDenoiseFlow — o filtro de sinal traçado (`TracedDenoiser`) sobre a refração (spec 034, R3, T044a).
 *
 * Na fase `forward`, depois do traçado (`RefractionFlow`) e antes da composição, só com o antisserrilhado temporal e o
 * filtro ligado: a refração é a fonte do sinal (`refraction_denoise_source`: os pixels com pedido, a radiância, o
 * ponto mostrado e o gradiente temporal — que este estágio aloca, e o traçado passa a medir); o movimento da superfície
 * vem do rg de `FrameTargets.motion`. A passada temporal, as cópias do que o quadro seguinte lê (o ponto mostrado, a
 * média sem o filtro espacial e os momentos) e as cinco à-trous; a cor filtrada fica em `TracedDenoiser.output`.
 * Declara a cada quadro se a produziu (a composição usa a amostra crua quando não).
 */
export class RefractionDenoiseFlow extends Flow<RefractionDenoiseSlots, 'idle'> {
    readonly type = 'RefractionDenoiseFlow';
    readonly slots: RefractionDenoiseSlots = {
        refraction: slot.singleton(Refraction.schema),
        denoiser: slot.singleton(TracedDenoiser.schema, { optional: true }),
        motion: slot.texture(FrameTargets.schema, 'motion', { optional: true }),
        antialiasing: slot.singleton(TemporalAntialiasing.schema, { optional: true }),
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    /** Os pipelines foram pedidos. */
    private prepared = false;
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
                            | TracedDenoiser
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

    /** A passada temporal, as cópias para o quadro seguinte e as cinco à-trous. */
    dispatch(frame: Frame, bound: BoundFlow<RefractionDenoiseSlots>): void {
        const denoiser = bound.slots.denoiser?.resource;
        if (denoiser === undefined || !this.resources.isProduced(denoiser, 'output')) return;
        const refraction = bound.slots.refraction.resource;
        const temporal = bound.pipelines.get(TEMPORAL.id);
        if (temporal?.role !== 'compute') return;
        frame.compute('RefractionDenoiseFlow.temporal', (pass) => {
            pass.bind.setPipeline(temporal.spec);
            temporal.bindTo(pass.bind);
            pass.dispatch.invocations(this.pixels, WORKGROUP_SIZE.value);
        });
        // O que o quadro seguinte lê: o ponto mostrado agora e a média temporal sem o filtro espacial (realimentar o
        // histórico com a cor filtrada acumularia o borrão), com os momentos.
        const copy = (from: Resource, fromId: string, toId: string): void => {
            const src = this.resources.textureOf(from, fromId)!;
            frame.copyTextureToTexture(src, this.resources.textureOf(denoiser, toId)!, [
                src.width,
                src.height,
                1,
            ]);
        };
        copy(refraction, 'hit', 'guidePrevious');
        copy(denoiser, 'accumulated', 'history');
        copy(denoiser, 'accumulatedMoments', 'historyMoments');
        frame.compute('RefractionDenoiseFlow.atrous', (pass) => {
            for (const { pipeline } of ATROUS) {
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
    private prepare(c: Ctx, denoiser: TracedDenoiser): boolean {
        const aa = c.bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        const refraction = c.bound.slots.refraction.resource;
        if (
            !denoiser.enabled
            || aa?.mode !== 'temporal'
            || this.resources.textureOf(refraction, 'request') === undefined
        )
            return false;
        this.resources.ensureAllocated(refraction, 'gradient');
        for (const id of TARGETS) this.resources.ensureAllocated(denoiser, id);
        const view = (r: Resource, id: string): BindingSource | undefined =>
            this.resources.textureViewOf(r, id);
        const signal = (['request', 'radiance', 'hit', 'gradient'] as const).map((id) =>
            view(refraction, id),
        );
        const targets = TARGETS.map((id) => view(denoiser, id));
        const motion = c.bound.slots.motion?.view;
        if (motion === undefined) return false;
        const sources = [...signal, ...targets, motion];
        if (sources.some((s) => s === undefined)) return false;
        if (sources.some((s, k) => s !== this.bound[k])) {
            const of = (id: (typeof TARGETS)[number]): BindingSource =>
                targets[TARGETS.indexOf(id)]!;
            const [request, radiance, hit, gradient] = signal;
            const binds = new Map<BindingKey, BindingSource>([
                [R.request, request!],
                [R.radiance, radiance!],
                [R.hit, hit!],
                [R.gradient, gradient!],
                [D.surfaceMotion, motion],
                [D.guidePrevious, of('guidePrevious')],
                [D.historyColor, of('history')],
                [D.historyMoments, of('historyMoments')],
                [D.accumulatedOut, of('accumulated')],
                [D.momentsOut, of('accumulatedMoments')],
            ]);
            for (const { pipeline, from, into } of ATROUS) {
                binds.set({ pipeline: pipeline.id, resource: D.filterIn }, of(from));
                binds.set({ pipeline: pipeline.id, resource: D.filterOut }, of(into));
            }
            c.bind(binds);
            this.bound = sources;
        }
        const request = this.resources.textureOf(refraction, 'request')!;
        this.pixels = request.width * request.height;
        if (!this.prepared) {
            this.prepared = true;
            c.prepare(TEMPORAL);
            for (const { pipeline } of ATROUS) c.prepare(pipeline);
        }
        return [TEMPORAL, ...ATROUS.map(({ pipeline }) => pipeline)].every(
            (p) => c.bound.pipelines.get(p.id)?.ready === true,
        );
    }
}
