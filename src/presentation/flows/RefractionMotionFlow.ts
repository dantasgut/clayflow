import type { Frame, RenderTarget } from '../../scene/contracts/gpu';
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
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { Refraction } from '../../elements/lighting/refraction/Refraction';
import {
    refractionMotion,
    refractionResources as R,
} from '../../elements/lighting/refraction/shaders';
import { TemporalAntialiasing } from '../../elements/scene/TemporalAntialiasing';
import { FrameTargets } from '../app/FrameTargets';

/** Slots do movimento da refração. */
export interface RefractionMotionSlots extends SlotMap {
    /** A refração da cena (o pedido e o ponto que cada pixel com pedido mostra). */
    readonly refraction: SingletonSlot<false>;
    /** Vetores de movimento (`FrameTargets.motion`, só sem MSAA): sem eles o estágio fica pendente. */
    readonly target: TargetSlot;
    /** A máscara reativa (`FrameTargets.reactive`): onde o histórico recomeça. */
    readonly reactive: TextureSlot<false>;
    /** O antisserrilhado da cena: só o temporal lê os vetores. */
    readonly antialiasing: SingletonSlot<true>;
}

type Ctx = TransitionContext<RefractionMotionSlots>;

/** Só os canais ba do alvo de movimento (`GPUColorWrite.BLUE | GPUColorWrite.ALPHA`): o rg é o da superfície. */
const BEHIND_ONLY = 0x4 | 0x8;

/**
 * RefractionMotionFlow — movimento do que a refração mostra (spec 034, R3, T044a).
 *
 * Na fase `forward`, depois do traçado (`RefractionFlow`), do filtro dele e da composição, antes da água: um triângulo
 * de tela cheia escreve, em cada pixel com pedido, o vetor de "o que está atrás" (ba do alvo `motion`) — onde estava,
 * no quadro anterior, o ponto que o caminho traçado do pixel achou (`Refraction.hit`), pelas matrizes de mundo do
 * objeto atingido e pelas duas câmeras. Sem ele, o ba sob o vidro era o do opaco atrás na linha reta, não o do conteúdo
 * refratado ou refletido. E, como a lente desloca e inverte a imagem do que está atrás e o pixel também mostra caminhos
 * secundários, a máscara reativa (`FrameTargets.reactive`, limpa a cada quadro): onde o gradiente temporal da refração
 * (`Refraction.gradient`) diz que a cena mudou em volta do pixel, a resolução temporal recomeça o histórico. Só com o
 * antisserrilhado temporal; no quadro em que o traçado não produziu, só limpa a máscara. O traçado não sabe de
 * movimento.
 */
export class RefractionMotionFlow extends RenderFlow<RefractionMotionSlots, 'idle'> {
    readonly type = 'RefractionMotionFlow';
    readonly slots: RefractionMotionSlots = {
        refraction: slot.singleton(Refraction.schema),
        target: slot.target({ color: { schema: FrameTargets.schema, descId: 'motion' } }),
        reactive: slot.texture(FrameTargets.schema, 'reactive'),
        antialiasing: slot.singleton(TemporalAntialiasing.schema, { optional: true }),
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    /** Pipeline preparado. */
    private pipeline: string | undefined;
    /** Fontes ligadas (outras = religa: redimensionamento). */
    private bound: readonly unknown[] = [];

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
                        this.prepare(c);
                    },
                },
            },
        };
    }

    /** Escreve o movimento e a máscara reativa dos pixels com pedido. */
    dispatch(frame: Frame, bound: BoundFlow<RefractionMotionSlots>): void {
        const refraction = bound.slots.refraction.resource;
        const aa = bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        if (this.pipeline === undefined || aa?.mode !== 'temporal') return;
        const reactive = {
            view: bound.slots.reactive.view,
            loadOp: 'clear' as const,
            clearValue: [0, 0, 0, 0] as const,
            storeOp: 'store' as const,
        };
        const prepared = bound.pipelines.get(this.pipeline);
        const color = this.colorAttachment(frame, bound.slots.target, { loadOp: 'load' });
        if (
            !this.resources.isProduced(refraction, 'radiance')
            || prepared?.role !== 'render'
            || !prepared.ready
            || color === undefined
        ) {
            // Nada traçado neste quadro: nenhum pixel recomeça por aqui.
            frame.render({ colorAttachments: [reactive] }, 'RefractionMotionFlow.clear', () => {});
            return;
        }
        const target: RenderTarget = { colorAttachments: [color, reactive] };
        frame.render(target, 'RefractionMotionFlow', (pass) => {
            pass.bind.setPipeline(prepared.spec);
            prepared.bindTo(pass.bind);
            pass.draw.vertices(3);
        });
    }

    /**
     * Com o antisserrilhado temporal: aloca o gradiente temporal da refração, liga o pedido, o ponto mostrado e o
     * gradiente (quando mudam) e prepara o pipeline.
     */
    private prepare(c: Ctx): void {
        const refraction = c.bound.slots.refraction.resource;
        const aa = c.bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        if (
            aa?.mode !== 'temporal'
            || this.resources.textureOf(refraction, 'request') === undefined
        )
            return;
        // A máscara lê a mudança da cena: com o gradiente alocado, o traçado o mede.
        this.resources.ensureAllocated(refraction, 'gradient');
        const views = (['request', 'hit', 'gradient'] as const).map((id) =>
            this.resources.textureViewOf(refraction, id),
        );
        const [request, hit, gradient] = views;
        if (request === undefined || hit === undefined || gradient === undefined) return;
        if (views.some((v, k) => v !== this.bound[k])) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [R.request, request],
                    [R.hit, hit],
                    [R.gradient, gradient],
                ]),
            );
            this.bound = views;
        }
        if (this.pipeline !== undefined) return;
        this.pipeline = 'refraction_motion';
        c.prepare({
            id: this.pipeline,
            role: 'render',
            shader: refractionMotion,
            entryPoints: ['refraction_screen_vs', 'refraction_motion_fs'],
            topology: 'triangle-list',
            cullMode: 'none',
            colorTargets: [
                { format: 'rgba16float', writeMask: BEHIND_ONLY },
                { format: 'r8unorm' },
            ],
        });
    }
}
