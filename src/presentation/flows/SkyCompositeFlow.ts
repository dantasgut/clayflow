import type { EngineCore, Frame, RenderTarget } from '../../scene/contracts/gpu';
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
import { Sky } from '../../elements/scene/sky/Sky';
import { CloudLayer } from '../../elements/media/clouds/CloudLayer';
import { FrameTargets, LIGHT_FORMAT } from '../app/FrameTargets';
import { skyComposite } from './shaders';

/** Slots da composição do céu. */
export interface SkyCompositeSlots extends SlotMap {
    /** O céu (a câmera ativa, o sol). */
    readonly sky: SingletonSlot<false>;
    /** A camada de nuvens (a nuvem aumentada): sem ela, o estágio não existe. */
    readonly cloud: SingletonSlot<false>;
    /** Cor e profundidade da cena. */
    readonly target: TargetSlot;
    /**
     * A luz que chega a cada pixel (`FrameTargets.light`, sem MSAA): no fundo, a radiância — a composição a mantém igual
     * ao brilho da cor composta (a resolução temporal reilumina o histórico do fundo por ela, spec 041).
     */
    readonly light: TextureSlot<true>;
}

type Ctx = TransitionContext<SkyCompositeSlots>;

/**
 * SkyCompositeFlow — as nuvens na tela (spec 041, R13; Camada 4). Na fase `forward`, depois da água e da marcha das
 * nuvens, antes da resolução temporal, com um `Sky` e uma `CloudLayer` na cena: dois triângulos de tela cheia sobre a
 * cor resolvida da cena (com MSAA, depois da resolução: as amostras não são mais lidas) — o produto pela transmitância
 * da nuvem (mistura `dst·src`) e a soma da luz dela e da névoa na frente dela (mistura aditiva). A perspectiva aérea da
 * geometria não passa por aqui: é a contribuição do `Sky` a `scene_fog`, no desenho de cada superfície (a passagem a
 * mais sobre a cor em toda cena com céu custava ~0,3 ms na `fog`). Sem `CloudLayer`, o estágio não existe.
 */
export class SkyCompositeFlow extends RenderFlow<SkyCompositeSlots, 'idle'> {
    readonly type = 'SkyCompositeFlow';
    readonly slots: SkyCompositeSlots = {
        sky: slot.singleton(Sky.schema),
        cloud: slot.singleton(CloudLayer.schema),
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
    private prepared: readonly [string, string] | undefined;
    /** Os pipelines preparados escrevem a luz que chega. */
    private lit = false;
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
        // Na cor resolvida (uma amostra): nada depois da composição lê as amostras, e o passe sobre o alvo
        // multiamostrado traria e devolveria as quatro de todo pixel (a banda dominava o custo).
        const target = bound.slots.target;
        const resolved = target.color;
        if (resolved === 'none' || resolved === 'canvas') return;
        const light = this.lit ? bound.slots.light : undefined;
        const renderTarget: RenderTarget = {
            colorAttachments: [
                { view: resolved, loadOp: 'load', storeOp: 'store' },
                ...(light === undefined
                    ? []
                    : [{ view: light.view, loadOp: 'load' as const, storeOp: 'store' as const }]),
            ],
        };
        frame.render(renderTarget, 'SkyCompositeFlow', (pass) => {
            pass.bind.setPipeline(multiply.spec);
            multiply.bindTo(pass.bind);
            pass.draw.vertices(3);
            pass.bind.setPipeline(add.spec);
            add.bindTo(pass.bind);
            pass.draw.vertices(3);
        });
    }

    /** Liga a profundidade da cena e prepara os pipelines do alvo e das amostras. */
    private prepare(c: Ctx): void {
        const cloud = c.bound.slots.cloud.resource;
        const target = c.bound.slots.target;
        const depth = target.depth;
        if (depth === undefined || this.resources.textureViewOf(cloud, 'view') === undefined)
            return;
        const multisampled = target.sampleCount > 1;
        // A composição desenha na cor resolvida: uma amostra (a profundidade, essa sim, é a multiamostrada).
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
        const format = target.format ?? this.core.canvasFormat;
        const lit = !multisampled && c.bound.slots.light !== undefined;
        const key = `${format}:${target.sampleCount}${lit ? ':light' : ''}:resolved`;
        const ids = [`sky_composite_multiply:${key}`, `sky_composite_add:${key}`] as const;
        if (this.prepared?.[0] === ids[0]) return;
        if (this.prepared !== undefined) for (const id of this.prepared) c.release(id);
        this.prepared = ids;
        this.lit = lit;
        const shader = skyComposite.module(multisampled);
        const pipeline = (id: string, entry: string, blend: GPUBlendState): void => {
            c.prepare({
                id,
                role: 'render',
                shader,
                entryPoints: [
                    'refraction_screen_vs',
                    lit ? entry.replace(/_fs$/, '_light_fs') : entry,
                ],
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [
                    { format, blend },
                    ...(lit
                        ? [
                              {
                                  format: LIGHT_FORMAT,
                                  blend: { color: blend.color, alpha: blend.color },
                              },
                          ]
                        : []),
                ],
                multisample: { count: 1 },
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
