import type { Frame } from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { Flow } from '../../scene/flows/Flow';
import {
    slot,
    type ChannelSlot,
    type SingletonSlot,
    type SlotMap,
    type TextureSlot,
} from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { Sky } from '../../elements/scene/sky/Sky';
import { skySunVisibilitySlots } from '../../elements/scene/sky/shaders';
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
    /** A fração visível do disco, série temporal (spec 037): a anterior lida, a do quadro escrita. */
    readonly skySunVisibility: ChannelSlot<false>;
}

type Ctx = TransitionContext<SkyOverflowSlots>;

const overflowId = (multisampled: boolean): string => `sky_overflow${multisampled ? '_ms' : ''}`;
const visibilityId = (multisampled: boolean, clouds: boolean): string =>
    `sky_overflow_visibility${multisampled ? '_ms' : ''}${clouds ? '_clouds' : ''}`;

/**
 * SkyOverflowFlow — o disco do sol acima do teto da cor (spec 041; Camada 4). A radiância física do disco (~10⁹ nits ao
 * meio dia) passa do teto do alvo meio-float da cor (65504; o fundo guarda `SKY_SUN_DISK_MAX`): na fase `forward`, depois
 * da composição das nuvens, a fração visível do disco (a média no disco do que está na frente dele, acumulada pela série
 * `Sky.sunVisibility`) e um retângulo em volta do disco que escreve o excesso em `FrameTargets.overflow` (em unidades de
 * `OVERFLOW_UNIT`), com a cobertura do pixel pelo disco, a névoa dos volumes e a fração visível —
 * o espalhamento da lente (`Bloom`) soma a energia inteira do sol. O passe limpa o alvo (o único que o escreve). Sem o
 * alvo (nenhum efeito o lê: o `PostFlow` o pede) ou sem disco, nada.
 */
export class SkyOverflowFlow extends Flow<SkyOverflowSlots, 'idle'> {
    readonly type = 'SkyOverflowFlow';
    readonly slots: SkyOverflowSlots = {
        sky: slot.singleton(Sky.schema),
        targets: slot.singleton(FrameTargets.schema, { optional: true }),
        overflow: slot.texture(FrameTargets.schema, 'overflow', { optional: true }),
        depth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
        cloud: slot.singleton(CloudLayer.schema, { optional: true }),
        ...skySunVisibilitySlots,
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly prepared = new Set<string>();
    /** Os pipelines do quadro (a fração visível e o excesso), ou `undefined` sem disco ou sem os alvos. */
    private current: readonly [string, string] | undefined;
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

    /**
     * O retângulo do disco no alvo do excesso, que este passe limpa (é o único que o escreve; o espalhamento da lente o
     * lê no fim do quadro). Sem o disco ou sem os pipelines, só a limpeza: o efeito não lê o excesso de outro quadro.
     */
    dispatch(frame: Frame, bound: BoundFlow<SkyOverflowSlots>): void {
        const overflow = bound.slots.overflow;
        if (overflow === undefined) return;
        const v = this.current === undefined ? undefined : bound.pipelines.get(this.current[0]);
        const p = this.current === undefined ? undefined : bound.pipelines.get(this.current[1]);
        const draw = v?.role === 'compute' && v.ready && p?.role === 'render' && p.ready;
        if (draw) {
            frame.compute('SkyOverflowFlow.visibility', (pass) => {
                pass.bind.setPipeline(v.spec);
                v.bindTo(pass.bind);
                pass.dispatch.invocations(64, 64);
            });
            bound.slots.skySunVisibility.written();
        }
        frame.render(
            {
                colorAttachments: [
                    {
                        view: overflow.view,
                        loadOp: 'clear',
                        clearValue: [0, 0, 0, 0],
                        storeOp: 'store',
                    },
                ],
            },
            'SkyOverflowFlow',
            (pass) => {
                if (!draw) return;
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
        // O alvo do excesso é pedido por quem o lê (o `PostFlow`, com um efeito que leia a radiância acima do teto).
        if (
            sky.data.sunDisk !== 1
            || targets === undefined
            || depth === undefined
            || c.bound.slots.overflow === undefined
        )
            return;
        this.resources.ensureAllocated(sky, 'sunVisibility');
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
        const ids = [visibilityId(multisampled, clouds), overflowId(multisampled)] as const;
        // A variante que saiu (as nuvens entraram ou saíram) é solta: esperaria pelas texturas de quem saiu.
        for (const old of this.prepared)
            if (!ids.includes(old as never)) {
                c.release(old);
                this.prepared.delete(old);
            }
        if (!this.prepared.has(ids[0])) {
            this.prepared.add(ids[0]);
            c.prepare({
                id: ids[0],
                role: 'compute',
                shader: skyOverflow.visibility(multisampled, clouds),
                entryPoints: ['sky_overflow_visibility_main'],
            });
        }
        if (!this.prepared.has(ids[1])) {
            this.prepared.add(ids[1]);
            c.prepare({
                id: ids[1],
                role: 'render',
                shader: skyOverflow.module(multisampled),
                entryPoints: ['sky_overflow_vs', 'sky_overflow_fs'],
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [{ format: SCENE_COLOR_FORMAT }],
            });
        }
        this.current = ids;
    }
}
