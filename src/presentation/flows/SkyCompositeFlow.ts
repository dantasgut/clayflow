import type { EngineCore, Frame, RenderTarget } from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import { slot, type SingletonSlot, type SlotMap, type TargetSlot } from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { Sky } from '../../elements/scene/sky/Sky';
import { CloudLayer } from '../../elements/media/clouds/CloudLayer';
import { FrameTargets } from '../app/FrameTargets';
import { skyComposite } from './shaders';

/** Slots da composição do céu. */
export interface SkyCompositeSlots extends SlotMap {
    /** O céu (a perspectiva aérea, a câmera). */
    readonly sky: SingletonSlot<false>;
    /** A camada de nuvens, quando há (a nuvem aumentada). */
    readonly cloud: SingletonSlot<true>;
    /** Cor e profundidade da cena. */
    readonly target: TargetSlot;
}

type Ctx = TransitionContext<SkyCompositeSlots>;

/**
 * SkyCompositeFlow — a atmosfera e as nuvens na tela (spec 041, R10, R13; Camada 4). Na fase `forward`, depois da água e
 * da marcha das nuvens, antes da resolução temporal, com um `Sky` na cena: dois triângulos de tela cheia sobre a cor da
 * cena (com MSAA, nas amostras, resolvidas na cor) — o produto pela transmitância da nuvem e da atmosfera até a
 * superfície (mistura `dst·src`, por canal) e a soma da luz delas, atrás da névoa dos froxels (mistura aditiva). A
 * perspectiva aérea vale para toda a geometria, com ou sem `CloudLayer`; com ela, a nuvem aumentada entra na mesma
 * fórmula. Sem `Sky`, nada.
 */
export class SkyCompositeFlow extends RenderFlow<SkyCompositeSlots, 'idle'> {
    readonly type = 'SkyCompositeFlow';
    readonly slots: SkyCompositeSlots = {
        sky: slot.singleton(Sky.schema),
        cloud: slot.singleton(CloudLayer.schema, { optional: true }),
        target: slot.target({
            color: { schema: FrameTargets.schema, descId: 'color' },
            depth: { schema: FrameTargets.schema, descId: 'depth' },
            samples: { schema: FrameTargets.schema, descId: 'samples' },
        }),
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private prepared: readonly [string, string] | undefined;
    private boundDepth: unknown;

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

    /** O produto e a soma, num passe sobre a cor da cena. */
    dispatch(frame: Frame, bound: BoundFlow<SkyCompositeSlots>): void {
        if (this.prepared === undefined) return;
        const multiply = bound.pipelines.get(this.prepared[0]);
        const add = bound.pipelines.get(this.prepared[1]);
        if (multiply?.role !== 'render' || !multiply.ready || add?.role !== 'render' || !add.ready)
            return;
        const color = this.colorAttachment(frame, bound.slots.target, { loadOp: 'load' });
        if (color === undefined) return;
        const renderTarget: RenderTarget = { colorAttachments: [color] };
        frame.render(renderTarget, 'SkyCompositeFlow', (pass) => {
            pass.bind.setPipeline(multiply.spec);
            multiply.bindTo(pass.bind);
            pass.draw.vertices(3);
            pass.bind.setPipeline(add.spec);
            add.bindTo(pass.bind);
            pass.draw.vertices(3);
        });
    }

    /** Liga a profundidade da cena e prepara os pipelines do alvo, das amostras e da presença das nuvens. */
    private prepare(c: Ctx): void {
        const sky = c.bound.slots.sky.resource;
        const target = c.bound.slots.target;
        const depth = target.depth;
        if (depth === undefined || this.resources.textureViewOf(sky, 'aerial') === undefined) {
            return;
        }
        const multisampled = target.sampleCount > 1;
        if (depth !== this.boundDepth) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [
                        multisampled ? skyComposite.depth.multisampled : skyComposite.depth.single,
                        depth,
                    ],
                ]),
            );
            this.boundDepth = depth;
        }
        const cloud = c.bound.slots.cloud?.resource;
        const clouds =
            cloud !== undefined && this.resources.textureViewOf(cloud, 'view') !== undefined;
        const format = target.format ?? this.core.canvasFormat;
        const key = `${format}:${target.sampleCount}${clouds ? ':clouds' : ''}`;
        const ids = [`sky_composite_multiply:${key}`, `sky_composite_add:${key}`] as const;
        if (this.prepared?.[0] === ids[0]) return;
        if (this.prepared !== undefined) for (const id of this.prepared) c.release(id);
        this.prepared = ids;
        const shader = skyComposite.module(multisampled, clouds);
        const pipeline = (id: string, entry: string, blend: GPUBlendState): void => {
            c.prepare({
                id,
                role: 'render',
                shader,
                entryPoints: ['refraction_screen_vs', entry],
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [{ format, blend }],
                multisample: { count: target.sampleCount },
            });
        };
        pipeline(ids[0], 'sky_composite_multiply_fs', {
            color: { srcFactor: 'zero', dstFactor: 'src', operation: 'add' },
            alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
        });
        pipeline(ids[1], 'sky_composite_add_fs', {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
        });
    }
}
