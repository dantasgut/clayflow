import type { Frame } from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { Flow } from '../../scene/flows/Flow';
import { slot, type SingletonSlot, type SlotMap, type TextureSlot } from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { Sky } from '../../elements/scene/sky/Sky';
import { CloudLayer } from '../../elements/media/clouds/CloudLayer';
import { FrameTargets, SCENE_COLOR_FORMAT } from '../app/FrameTargets';
import { skyOverflow } from './shaders';

/** Slots do excesso do disco do sol. */
export interface SkyOverflowSlots extends SlotMap {
    /** O céu (o sol, o disco, a câmera). */
    readonly sky: SingletonSlot<false>;
    /** Os alvos da cena (o excesso é alocado nele quando há disco). */
    readonly targets: SingletonSlot<true>;
    /** A radiância acima do teto da cor (`FrameTargets.overflow`). */
    readonly overflow: TextureSlot<true>;
    /** A profundidade da cena (o fundo é o que ficou no plano distante). */
    readonly depth: TextureSlot<true>;
    /** A camada de nuvens: o disco atrás delas passa atenuado pela transmitância delas no pixel. */
    readonly cloud: SingletonSlot<true>;
}

type Ctx = TransitionContext<SkyOverflowSlots>;

const pipelineId = (multisampled: boolean, clouds: boolean): string =>
    `sky_overflow${multisampled ? '_ms' : ''}${clouds ? '_clouds' : ''}`;

/**
 * SkyOverflowFlow — o disco do sol acima do teto da cor (spec 041; Camada 4). A radiância física do disco (~10⁹ nits ao
 * meio dia) passa do teto do alvo meio-float da cor (65504; o fundo guarda `SKY_SUN_DISK_MAX`): na fase `forward`, depois
 * da composição das nuvens, um retângulo em volta do disco escreve o excesso em `FrameTargets.overflow` (em unidades de
 * `OVERFLOW_UNIT`), com a cobertura do pixel pelo disco e atenuado pela névoa dos volumes e pelas nuvens na frente dele —
 * o espalhamento da lente (`Bloom`) soma a energia inteira do sol e o `PostFlow` limpa o alvo depois de ler. Sem disco,
 * nada.
 */
export class SkyOverflowFlow extends Flow<SkyOverflowSlots, 'idle'> {
    readonly type = 'SkyOverflowFlow';
    readonly slots: SkyOverflowSlots = {
        sky: slot.singleton(Sky.schema),
        targets: slot.singleton(FrameTargets.schema, { optional: true }),
        overflow: slot.texture(FrameTargets.schema, 'overflow', { optional: true }),
        depth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
        cloud: slot.singleton(CloudLayer.schema, { optional: true }),
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly prepared = new Set<string>();
    /** O pipeline do quadro, ou `undefined` sem disco ou sem os alvos. */
    private current: string | undefined;
    /** A profundidade ligada (outra = religa). */
    private boundDepth: unknown;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                slotChanged: {
                    to: 'idle',
                    run: (_e, c) => {
                        for (const id of this.prepared) c.release(id);
                        this.prepared.clear();
                        this.current = undefined;
                    },
                },
                poolReallocated: 'ignore',
                // A camada de nuvens (ou o céu) saiu ou trocou: as variantes ligadas às texturas dela são soltas e
                // preparadas de novo quando a vista da nova existir.
                slotLost: {
                    to: 'idle',
                    run: (_e, c) => {
                        for (const id of this.prepared) c.release(id);
                        this.prepared.clear();
                        this.current = undefined;
                    },
                },
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

    /** O retângulo do disco no alvo do excesso. */
    dispatch(frame: Frame, bound: BoundFlow<SkyOverflowSlots>): void {
        const overflow = bound.slots.overflow;
        const p = this.current === undefined ? undefined : bound.pipelines.get(this.current);
        if (overflow === undefined || p?.role !== 'render' || !p.ready) return;
        frame.render(
            { colorAttachments: [{ view: overflow.view, loadOp: 'load', storeOp: 'store' }] },
            'SkyOverflowFlow',
            (pass) => {
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind);
                pass.draw.vertices(6);
            },
        );
    }

    /** Com disco: o alvo alocado, a profundidade ligada e o pipeline pelas amostras e pelas nuvens. */
    private prepare(c: Ctx): void {
        this.current = undefined;
        const sky = c.bound.slots.sky.resource as Sky;
        const targets = c.bound.slots.targets?.resource as FrameTargets | undefined;
        const depth = c.bound.slots.depth;
        if (sky.data.sunDisk !== 1 || targets === undefined || depth === undefined) return;
        this.resources.ensureAllocated(targets, 'overflow');
        if (c.bound.slots.overflow === undefined) return;
        const multisampled = targets.samples > 1;
        if (depth.view !== this.boundDepth) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [
                        multisampled ? skyOverflow.depth.multisampled : skyOverflow.depth.single,
                        depth.view,
                    ],
                ]),
            );
            this.boundDepth = depth.view;
        }
        const cloud = c.bound.slots.cloud?.resource;
        const clouds =
            cloud !== undefined && this.resources.textureViewOf(cloud, 'view') !== undefined;
        const id = pipelineId(multisampled, clouds);
        // A variante que saiu (as nuvens entraram ou saíram) é solta: esperaria pelas texturas de quem saiu.
        for (const old of this.prepared)
            if (old !== id) {
                c.release(old);
                this.prepared.delete(old);
            }
        if (!this.prepared.has(id)) {
            this.prepared.add(id);
            c.prepare({
                id,
                role: 'render',
                shader: skyOverflow.module(multisampled, clouds),
                entryPoints: ['sky_overflow_vs', 'sky_overflow_fs'],
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [{ format: SCENE_COLOR_FORMAT }],
            });
        }
        this.current = id;
    }
}
