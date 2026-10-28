import type { Frame } from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { Flow } from '../../scene/flows/Flow';
import { slot, type SingletonSlot, type SlotMap, type TextureSlot } from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { FluidField } from '../../elements/fields/FluidField';
import {
    Refraction,
    REFRACTION_REQUEST_FORMAT,
} from '../../elements/lighting/refraction/Refraction';
import { refractionVolumeRequest } from '../../elements/lighting/refraction/shaders';
import { transmissionResources } from '../../elements/material/shaders';
import { FrameTargets } from '../app/FrameTargets';

/** Slots do pedido da refração pelos volumes. */
export interface RefractionVolumeRequestSlots extends SlotMap {
    /** A refração da cena (o pedido e a profundidade dele). */
    readonly refraction: SingletonSlot<false>;
    /** O campo dos fluidos: há volume a pedir quando ele contribui para os raios. */
    readonly field: SingletonSlot<true>;
    /** A profundidade dos opacos (a superfície atrás de um opaco não é pedida). */
    readonly sceneDepth: TextureSlot<true>;
}

type Ctx = TransitionContext<RefractionVolumeRequestSlots>;

/**
 * RefractionVolumeRequestFlow — o pedido da refração pelos volumes atravessados por raios (spec 034, T065f): depois do
 * pedido dos transmissivos (o `ForwardFlow`, que o limpa a cada quadro), um triângulo de tela cheia no mesmo alvo e na
 * mesma profundidade, com o teste `less` — por pixel fica a interface mais próxima, a de uma malha ou a da superfície de
 * um volume (a água das partículas, pelo ponto `ray_volume_hit`). Com a câmera dentro de um volume, todo pixel é pedido
 * até a saída dele ou até o opaco. O traçado e a composição da refração fazem o resto: a água é composta como o vidro,
 * com a névoa, o movimento e o filtro do sinal traçado do mesmo caminho. Sem volume na cena, nada (o pedido nem é
 * alocado por este estágio).
 */
export class RefractionVolumeRequestFlow extends Flow<RefractionVolumeRequestSlots, 'idle'> {
    readonly type = 'RefractionVolumeRequestFlow';
    readonly slots: RefractionVolumeRequestSlots = {
        refraction: slot.singleton(Refraction.schema),
        field: slot.singleton(FluidField.schema, { optional: true }),
        sceneDepth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    /** Pipeline preparado (pelas amostras da profundidade dos opacos). */
    private pipeline: string | undefined;
    /** A profundidade dos opacos ligada (outra = religa). */
    private bound: unknown;
    /** Há volume a pedir neste quadro. */
    private active = false;

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

    /** Marca no pedido as superfícies dos volumes à frente das interfaces já pedidas e dos opacos. */
    dispatch(frame: Frame, bound: BoundFlow<RefractionVolumeRequestSlots>): void {
        if (!this.active || this.pipeline === undefined) return;
        const prepared = bound.pipelines.get(this.pipeline);
        if (prepared?.role !== 'render' || !prepared.ready) return;
        const refraction = bound.slots.refraction.resource;
        const view = this.resources.textureViewOf(refraction, 'request');
        const depth = this.resources.textureViewOf(refraction, 'requestDepth');
        if (view === undefined || depth === undefined) return;
        frame.render(
            {
                colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }],
                depthStencilAttachment: { view: depth, depthLoadOp: 'load', depthStoreOp: 'store' },
            },
            'RefractionVolumeRequestFlow',
            (pass) => {
                pass.bind.setPipeline(prepared.spec);
                prepared.bindTo(pass.bind);
                pass.draw.vertices(3);
            },
        );
    }

    /** Com volume na cena: o pedido alocado, a profundidade dos opacos ligada e o pipeline das amostras dela. */
    private prepare(c: Ctx): void {
        const field = c.bound.slots.field?.resource as FluidField | undefined;
        const sceneDepth = c.bound.slots.sceneDepth;
        this.active = field?.volume === true && sceneDepth !== undefined;
        if (!this.active || sceneDepth === undefined) return;
        const refraction = c.bound.slots.refraction.resource;
        this.resources.ensureAllocated(refraction, 'request');
        this.resources.ensureAllocated(refraction, 'requestDepth');
        const multisampled = (sceneDepth.texture.sampleCount ?? 1) > 1;
        if (sceneDepth.view !== this.bound) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [
                        multisampled
                            ? transmissionResources.sceneDepthMs
                            : transmissionResources.sceneDepth,
                        sceneDepth.view,
                    ],
                ]),
            );
            this.bound = sceneDepth.view;
        }
        const id = `refraction_volume_request:${multisampled ? 'ms' : '1'}`;
        if (id === this.pipeline) return;
        if (this.pipeline !== undefined) c.release(this.pipeline);
        this.pipeline = id;
        c.prepare({
            id,
            role: 'render',
            shader: multisampled
                ? refractionVolumeRequest.multisampled
                : refractionVolumeRequest.single,
            entryPoints: ['refraction_screen_vs', 'refraction_volume_request_fs'],
            topology: 'triangle-list',
            cullMode: 'none',
            colorTargets: [{ format: REFRACTION_REQUEST_FORMAT }],
            // A interface mais próxima por pixel: a mesma profundidade do pedido dos transmissivos.
            depth: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
            multisample: { count: 1 },
        });
    }
}
