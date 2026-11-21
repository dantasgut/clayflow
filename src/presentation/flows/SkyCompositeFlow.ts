import type {
    EngineCore,
    Frame,
    IndirectBufferSpec,
    RenderTarget,
    TextureViewSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { Resource } from '../../scene/contracts/Resource';
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
     * A luz que chega (`FrameTargets.light`, sem MSAA): os dois passes a levam também à das nuvens passa-baixa — a
     * resolução temporal reilumina o histórico do fundo pela mudança da luz das nuvens (spec 041).
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
 *
 * Com a cor da cena (e a luz que chega) ligável como storage de leitura e escrita (o device com `texture-formats-tier2`;
 * T074), por compute sobre a lista dos blocos com nuvem que o `CloudFlow` monta na GPU, pelo despacho indireto: os dois
 * triângulos carregavam e gravavam a cor e a luz da tela inteira mesmo sem nuvem à vista (a sala fechada: zero blocos).
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
    private boundDepth: unknown;
    /** A camada dos pipelines preparados (outra no mesmo quadro — a troca, o A/B — os prepara de novo). */
    private layer: unknown;
    /** O caminho por compute: o pipeline e o despacho indireto da lista dos blocos com nuvem (`CloudLayer.tileArgs`). */
    private tiles: { readonly id: string; readonly args: IndirectBufferSpec } | undefined;
    /** As fontes ligadas ao compute por blocos (outras = religa). */
    private boundTiles: readonly unknown[] = [];

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                poolReallocated: 'ignore',
                // A camada (ou o céu) saiu: os pipelines, ligados às texturas dela, saem junto — uma camada nova os prepara
                // de novo quando a vista dela existe (senão esperariam a vista da nova antes de ela ser alocada).
                slotLost: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.release(c);
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

    /** O produto e a soma, num passe sobre a cor da cena (ou por compute sobre os blocos com nuvem). */
    dispatch(frame: Frame, bound: BoundFlow<SkyCompositeSlots>): void {
        if (this.tiles !== undefined) {
            const tiles = bound.pipelines.get(this.tiles.id);
            if (tiles?.role !== 'compute' || !tiles.ready) return;
            const args = this.tiles.args;
            frame.compute('SkyCompositeFlow', (pass) => {
                pass.bind.setPipeline(tiles.spec);
                tiles.bindTo(pass.bind);
                pass.dispatch.workgroupsIndirect(args, 0);
            });
            return;
        }
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
        // Com o alvo da luz que chega (a resolução temporal), os passes o levam também à das nuvens passa-baixa: ver
        // `sky_composite.wgsl`.
        const light = this.prepared[0].endsWith(':light') ? bound.slots.light : undefined;
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

    /** Solta os pipelines (sem a vista da camada, nada a compor). */
    private release(c: Ctx): void {
        if (this.prepared !== undefined) for (const id of this.prepared) c.release(id);
        this.prepared = undefined;
        this.boundDepth = undefined;
        if (this.tiles !== undefined) c.release(this.tiles.id);
        this.tiles = undefined;
        this.boundTiles = [];
    }

    /**
     * O caminho por compute: a cor resolvida (e a luz que chega) com storage de leitura e escrita e a lista dos blocos
     * da camada alocada. Liga as fontes (quando mudam) e prepara o pipeline; devolve se o caminho vale.
     */
    private prepareTiles(c: Ctx, cloud: Resource): boolean {
        const target = c.bound.slots.target;
        const color = target.color;
        const light = c.bound.slots.light;
        const storage = (view: TextureViewSpec): boolean =>
            (view.source.usage & GPUTextureUsage.STORAGE_BINDING) !== 0
            && (view.format ?? view.source.format) === 'rgba16float';
        const list = this.resources.textureViewOf(cloud, 'tileList');
        const args = this.resources.bufferOf(cloud, 'tileArgs');
        if (
            color === 'none'
            || color === 'canvas'
            || !storage(color)
            || (light !== undefined && !storage(light.view))
            || list === undefined
            || args?.subkind !== 'indirect'
        ) {
            if (this.tiles !== undefined) c.release(this.tiles.id);
            this.tiles = undefined;
            this.boundTiles = [];
            return false;
        }
        const sources = [color, light?.view, list, args];
        if (sources.some((v, k) => v !== this.boundTiles[k])) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [skyComposite.color, color],
                    ...(light === undefined
                        ? []
                        : [[skyComposite.light, light.view] as [WgslResource, BindingSource]]),
                    [skyComposite.list, list],
                    [skyComposite.args, args],
                ]),
            );
            this.boundTiles = sources;
        }
        const id = `sky_composite_tiles${light === undefined ? '' : ':light'}`;
        if (this.tiles?.id !== id) {
            if (this.tiles !== undefined) c.release(this.tiles.id);
            c.prepare({
                id,
                role: 'compute',
                shader: skyComposite.tiles(light !== undefined),
                entryPoints: ['sky_composite_tiles_main'],
            });
        }
        this.tiles = { id, args };
        // O passe de desenho sai: o compute compõe.
        if (this.prepared !== undefined) for (const p of this.prepared) c.release(p);
        this.prepared = undefined;
        this.boundDepth = undefined;
        return true;
    }

    /** Liga a profundidade da cena e prepara os pipelines do alvo e das amostras. */
    private prepare(c: Ctx): void {
        const cloud = c.bound.slots.cloud.resource;
        // Outra camada no lugar da anterior sem quadro entre as duas (o `slotLost` não vem): os grupos eram da anterior.
        if (cloud !== this.layer) {
            this.release(c);
            this.layer = cloud;
        }
        const target = c.bound.slots.target;
        const depth = target.depth;
        if (depth === undefined || this.resources.textureViewOf(cloud, 'view') === undefined) {
            this.release(c);
            return;
        }
        if (this.prepareTiles(c, cloud)) return;
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
        const light = c.bound.slots.light !== undefined;
        const key = `${format}:${target.sampleCount}:resolved${light ? ':light' : ''}`;
        const ids = [`sky_composite_multiply:${key}`, `sky_composite_add:${key}`] as const;
        if (this.prepared?.[0] === ids[0]) return;
        if (this.prepared !== undefined) for (const id of this.prepared) c.release(id);
        this.prepared = ids;
        const shader = skyComposite.module(multisampled);
        const pipeline = (id: string, entry: string, blend: GPUBlendState): void => {
            c.prepare({
                id,
                role: 'render',
                shader,
                entryPoints: [
                    'refraction_screen_vs',
                    light ? entry.replace('_fs', '_light_fs') : entry,
                ],
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [
                    { format, blend },
                    ...(light ? [{ format: LIGHT_FORMAT, blend }] : []),
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
