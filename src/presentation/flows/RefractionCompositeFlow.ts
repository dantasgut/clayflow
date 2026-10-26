import type { EngineCore, Frame, RenderTarget, TextureViewSpec } from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import {
    slot,
    type SingletonSlot,
    type SlotMap,
    type TargetSlot,
    type TextureSlot,
} from '../../scene/flows/slots';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { Refraction } from '../../elements/lighting/refraction/Refraction';
import {
    refractionComposite,
    refractionCompositeDenoised,
    refractionResources as R,
} from '../../elements/lighting/refraction/shaders';
import { TemporalFilter } from '../../elements/lighting/temporal/TemporalFilter';
import { temporalFilterResources } from '../../elements/lighting/temporal/shaders';
import { FrameTargets, LIGHT_FORMAT } from '../app/FrameTargets';

/** Slots da composição da refração. */
export interface RefractionCompositeSlots extends SlotMap {
    /** A refração da cena (o pedido, a radiância traçada e a profundidade do pedido). */
    readonly refraction: SingletonSlot<false>;
    /** O filtro de sinal traçado da cena: quando produziu, a cor composta é a filtrada. */
    readonly denoiser: SingletonSlot<true>;
    /** Cor e profundidade da cena (a composição escreve as duas nos pixels com pedido). */
    readonly target: TargetSlot;
    /**
     * A luz que chega (`FrameTargets.light`, sem MSAA): nos pixels com pedido, "sem luz medida" — a luz do opaco de trás
     * não reilumina o histórico da resolução temporal (T065h).
     */
    readonly light: TextureSlot<true>;
}

type Ctx = TransitionContext<RefractionCompositeSlots>;

/**
 * RefractionCompositeFlow — composição da refração traçada nos alvos da cena (spec 034, R1, T045).
 *
 * Na fase `forward`, depois do traçado (`RefractionFlow`) e antes da água: um triângulo de tela cheia — com MSAA, nas
 * amostras, resolvidas na cor — escreve, em cada pixel com pedido, a radiância que o traçado achou para o raio daquele
 * pixel, com a névoa até a primeira interface, e a profundidade dessa interface (a água, os sprites seguintes e a
 * resolução temporal a veem). Não lê a cor da cena: o que está atrás do transmissivo vem só do raio. Só desenha no
 * quadro em que o traçado produziu a radiância; quando o filtro de sinal traçado produziu a cor filtrada
 * (`TemporalFilter.output`, com o antisserrilhado temporal), compõe ela.
 */
export class RefractionCompositeFlow extends RenderFlow<RefractionCompositeSlots, 'idle'> {
    readonly type = 'RefractionCompositeFlow';
    readonly slots: RefractionCompositeSlots = {
        refraction: slot.singleton(Refraction.schema),
        denoiser: slot.singleton(TemporalFilter.schema, { optional: true }),
        target: slot.target({
            color: { schema: FrameTargets.schema, descId: 'color' },
            depth: { schema: FrameTargets.schema, descId: 'depth' },
            samples: { schema: FrameTargets.schema, descId: 'samples' },
        }),
        light: slot.texture(FrameTargets.schema, 'light', { optional: true }),
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    /** Pipelines preparados (por formato e amostras do alvo): com a amostra crua e com a cor filtrada. */
    private pipeline: string | undefined;
    private denoisedPipeline: string | undefined;
    /** Fontes ligadas (outras = religa: redimensionamento). */
    private bound: readonly unknown[] = [];

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
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
                        this.prepare(c);
                    },
                },
            },
        };
    }

    /** Compõe o traçado sobre a cena, nos pixels com pedido. */
    dispatch(frame: Frame, bound: BoundFlow<RefractionCompositeSlots>): void {
        const refraction = bound.slots.refraction.resource;
        if (this.pipeline === undefined || !this.resources.isProduced(refraction, 'radiance'))
            return;
        const denoiser = bound.slots.denoiser?.resource;
        const filtered =
            this.denoisedPipeline === undefined
            || denoiser === undefined
            || !this.resources.isProduced(denoiser, 'output')
                ? undefined
                : bound.pipelines.get(this.denoisedPipeline);
        const prepared =
            filtered?.role === 'render' && filtered.ready
                ? filtered
                : bound.pipelines.get(this.pipeline);
        if (prepared?.role !== 'render' || !prepared.ready) return;
        const target = bound.slots.target;
        const color = this.colorAttachment(frame, target, { loadOp: 'load' });
        if (color === undefined || target.depth === undefined) return;
        const renderTarget: RenderTarget = {
            colorAttachments: [
                color,
                ...this.lightOf(bound.slots).map((view) => ({
                    view,
                    loadOp: 'load' as const,
                    storeOp: 'store' as const,
                })),
            ],
            depthStencilAttachment: {
                view: target.depth,
                depthLoadOp: 'load',
                depthStoreOp: 'store',
            },
        };
        frame.render(renderTarget, 'RefractionCompositeFlow', (pass) => {
            pass.bind.setPipeline(prepared.spec);
            prepared.bindTo(pass.bind);
            pass.draw.vertices(3);
        });
    }

    /**
     * Liga o pedido, a radiância, a profundidade do pedido e a cor filtrada, quando alocada (quando mudam), e prepara
     * os pipelines do alvo.
     */
    private prepare(c: Ctx): void {
        const refraction = c.bound.slots.refraction.resource;
        const denoiser = c.bound.slots.denoiser?.resource;
        const views = (['request', 'radiance', 'requestDepth'] as const).map((id) =>
            this.resources.textureViewOf(refraction, id),
        );
        const denoised =
            denoiser === undefined ? undefined : this.resources.textureViewOf(denoiser, 'output');
        const [request, radiance, requestDepth] = views;
        if (request === undefined || radiance === undefined || requestDepth === undefined) return;
        if ([...views, denoised].some((v, k) => v !== this.bound[k])) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [R.request, request],
                    [R.radiance, radiance],
                    [R.requestDepth, requestDepth],
                    ...(denoised === undefined
                        ? []
                        : [[temporalFilterResources.output, denoised] as const]),
                ]),
            );
            this.bound = [...views, denoised];
        }
        const target = c.bound.slots.target;
        const format = target.format ?? this.core.canvasFormat;
        const samples = target.sampleCount;
        // Com o alvo da luz (sem MSAA), outro pipeline: o anexo a mais.
        const light = this.lightOf(c.bound.slots).map(() => ({ format: LIGHT_FORMAT }));
        const lit = light.map(() => ':light').join('');
        const pipeline = (id: string, shader: WgslModule, entry: string): void => {
            c.prepare({
                id,
                role: 'render',
                shader,
                entryPoints: ['refraction_screen_vs', entry],
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [{ format }, ...light],
                // O pedido já é só o que está à frente dos opacos: a profundidade dele substitui a da cena.
                depth: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'always' },
                multisample: { count: samples },
            });
        };
        const id = `refraction_composite:${format}:${samples}${lit}`;
        if (id !== this.pipeline) {
            if (this.pipeline !== undefined) c.release(this.pipeline);
            this.pipeline = id;
            pipeline(id, refractionComposite, 'refraction_composite_fs');
        }
        const filteredId =
            denoised === undefined
                ? undefined
                : `refraction_composite_denoised:${format}:${samples}${lit}`;
        if (filteredId === this.denoisedPipeline) return;
        if (this.denoisedPipeline !== undefined) c.release(this.denoisedPipeline);
        this.denoisedPipeline = filteredId;
        if (filteredId !== undefined)
            pipeline(filteredId, refractionCompositeDenoised, 'refraction_composite_denoised_fs');
    }

    /** A vista do alvo da luz que chega, quando há (sem MSAA): zero ou um anexo. */
    private lightOf(slots: BoundFlow<RefractionCompositeSlots>['slots']): TextureViewSpec[] {
        return slots.light === undefined ? [] : [slots.light.view];
    }
}
