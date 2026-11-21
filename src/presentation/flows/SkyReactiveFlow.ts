import type { Frame } from '../../scene/contracts/gpu';
import type { IndirectBufferSpec } from '../../core/contracts/specs/IndirectBufferSpec';
import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
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
import { skySunTrackSlots } from '../../elements/scene/sky/shaders';
import { TemporalAntialiasing } from '../../elements/scene/TemporalAntialiasing';
import { CloudLayer } from '../../elements/media/clouds/CloudLayer';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import { FrameTargets } from '../app/FrameTargets';
import { skyReactive } from './shaders';

/** Slots da máscara reativa do disco do sol. */
export interface SkyReactiveSlots extends SlotMap {
    /** O céu (o sol de agora, o disco, a câmera). */
    readonly sky: SingletonSlot<false>;
    /** A direção do sol do quadro anterior (série `Sky.sunTrack`, spec 037). */
    readonly skySunTrack: ChannelSlot<false>;
    /** A máscara reativa (`FrameTargets.reactive`, só sem MSAA). Opcional: sem ela o estágio não roda. */
    readonly reactive: TextureSlot<true>;
    /** A profundidade da cena (o fundo é o que ficou no plano distante). */
    readonly depth: TextureSlot<true>;
    /** O antisserrilhado da cena: só o temporal guarda histórico. */
    readonly antialiasing: SingletonSlot<true>;
    /** A camada de nuvens: o disco atrás delas só marca onde a luz dele passa (spec 041). */
    readonly cloud: SingletonSlot<true>;
}

type Ctx = TransitionContext<SkyReactiveSlots>;

/** Id do pipeline do passe de desenho (com ou sem as nuvens na frente do disco). */
const pipelineId = (clouds: boolean): string => (clouds ? 'sky_reactive_clouds' : 'sky_reactive');
/** Ids dos pipelines do caminho por compute: o retângulo dos discos e a marcação por blocos. */
const computeIds = (clouds: boolean): readonly [string, string] => [
    `sky_reactive_rect${clouds ? '_clouds' : ''}`,
    `sky_reactive_tiles${clouds ? '_clouds' : ''}`,
];

/**
 * SkyReactiveFlow — a máscara reativa do disco do sol (spec 041; Camada 4).
 *
 * O disco do sol anda no fundo sem vetor de movimento (o fundo é reprojetado pela câmera), e o histórico parado da
 * resolução temporal guardava por onde ele passou: um traço claro ao longo do caminho do sol (o vídeo `solposto`). Na
 * fase `forward`, depois do fundo, com o antisserrilhado temporal: um retângulo em volta do disco de agora e do disco do
 * quadro anterior (a série `Sky.sunTrack`) marca na máscara reativa (`FrameTargets.reactive`, mistura pelo máximo com
 * o que a refração marca) os pixels do fundo desses discos, com margem — sobre o disco de agora a resolução temporal
 * recorta o histórico como em movimento (as nuvens na frente dele seguem acumulando); onde só o anterior estava, o
 * histórico recomeça. Sem o temporal, sem a máscara ou sem disco, nada.
 *
 * Com a máscara ligável como storage de leitura e escrita (o device com `texture-formats-tier2`; spec 041, T074), por
 * compute: uma invocação acha o retângulo e grava o despacho indireto (`Sky.diskWork`), e a marcação roda só nos blocos
 * dele — sem o disco na tela, zero grupos (o passe de desenho carregava e gravava a máscara inteira em todo quadro).
 */
export class SkyReactiveFlow extends Flow<SkyReactiveSlots, 'idle'> {
    readonly type = 'SkyReactiveFlow';
    readonly slots: SkyReactiveSlots = {
        sky: slot.singleton(Sky.schema),
        ...skySunTrackSlots,
        reactive: slot.texture(FrameTargets.schema, 'reactive', { optional: true }),
        depth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
        antialiasing: slot.singleton(TemporalAntialiasing.schema, { optional: true }),
        cloud: slot.singleton(CloudLayer.schema, { optional: true }),
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    /** Pipelines preparados. */
    private readonly prepared = new Set<string>();
    /** Os pipelines do quadro: o do desenho, ou os do retângulo e da marcação por compute. */
    private current: readonly string[] = [pipelineId(false)];
    /** As palavras da marcação por compute (`Sky.diskWork`), com o caminho por compute. */
    private work: IndirectBufferSpec | undefined;
    /** A máscara e as palavras ligadas (outras = religa). */
    private boundMask: unknown;
    private boundWork: unknown;
    private readonly resources: ResourceDirectory;
    /** A profundidade ligada (outra = religa: redimensionamento). */
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
                    },
                },
                poolReallocated: 'ignore',
                // A camada de nuvens saiu ou trocou: a variante ligada às texturas dela é solta.
                slotLost: {
                    to: 'idle',
                    run: (_e, c) => {
                        for (const id of this.prepared) c.release(id);
                        this.prepared.clear();
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

    /** Marca os discos de agora e do quadro anterior na máscara. */
    dispatch(frame: Frame, bound: BoundFlow<SkyReactiveSlots>): void {
        const aa = bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        const mask = bound.slots.reactive;
        const prepared = this.current.map((id) => bound.pipelines.get(id));
        if (aa?.mode !== 'temporal' || mask === undefined || prepared.some((p) => !p?.ready)) return;
        if (prepared.length === 2) {
            const [rect, tiles] = prepared;
            const work = this.work;
            if (rect?.role !== 'compute' || tiles?.role !== 'compute' || work === undefined) return;
            frame.compute('SkyReactiveFlow.rect', (pass) => {
                pass.bind.setPipeline(rect.spec);
                rect.bindTo(pass.bind);
                pass.dispatch.workgroups(1);
            });
            frame.compute('SkyReactiveFlow', (pass) => {
                pass.bind.setPipeline(tiles.spec);
                tiles.bindTo(pass.bind);
                pass.dispatch.workgroupsIndirect(work, 0);
            });
            return;
        }
        const draw = prepared[0];
        if (draw?.role !== 'render') return;
        frame.render(
            { colorAttachments: [{ view: mask.view, loadOp: 'load', storeOp: 'store' }] },
            'SkyReactiveFlow',
            (pass) => {
                pass.bind.setPipeline(draw.spec);
                draw.bindTo(pass.bind);
                pass.draw.vertices(6);
            },
        );
    }

    /** Com o antisserrilhado temporal e a máscara: liga a profundidade (quando muda) e prepara o pipeline. */
    private prepare(c: Ctx): void {
        const aa = c.bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        const depth = c.bound.slots.depth;
        if (aa?.mode !== 'temporal' || c.bound.slots.reactive === undefined || depth === undefined)
            return;
        if (depth.view !== this.boundDepth) {
            c.bind(new Map<WgslResource, BindingSource>([[skyReactive.depth, depth.view]]));
            this.boundDepth = depth.view;
        }
        // Com as nuvens (a vista delas alocada), o disco atrás delas só marca onde a luz dele passa.
        const cloud = c.bound.slots.cloud?.resource;
        const clouds =
            cloud !== undefined && this.resources.textureViewOf(cloud, 'view') !== undefined;
        // Por compute quando a máscara alocada é ligável como storage (o device permite o `r8unorm` de leitura e escrita).
        const mask = c.bound.slots.reactive;
        const storage =
            mask !== undefined
            && (mask.texture.usage & GPUTextureUsage.STORAGE_BINDING) !== 0;
        const sky = c.bound.slots.sky.resource;
        if (storage) this.resources.ensureAllocated(sky, 'diskWork');
        const work = storage
            ? (this.resources.bufferOf(sky, 'diskWork') as IndirectBufferSpec | undefined)
            : undefined;
        this.work = work?.subkind === 'indirect' ? work : undefined;
        const compute = this.work !== undefined && mask !== undefined;
        if (compute && (mask.view !== this.boundMask || this.work !== this.boundWork)) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [skyReactive.mask, mask.view],
                    [skyReactive.work.write, this.work!],
                    [skyReactive.work.read, this.work!],
                ]),
            );
            this.boundMask = mask.view;
            this.boundWork = this.work;
        }
        this.current = compute ? computeIds(clouds) : [pipelineId(clouds)];
        // A variante que saiu (as nuvens entraram ou saíram) é solta: esperaria pelas texturas de quem saiu.
        for (const old of this.prepared)
            if (!this.current.includes(old)) {
                c.release(old);
                this.prepared.delete(old);
            }
        if (this.current.every((id) => this.prepared.has(id))) return;
        for (const id of this.current) this.prepared.add(id);
        const modules = skyReactive.module(clouds);
        if (compute) {
            const [rect, tiles] = computeIds(clouds);
            c.prepare({
                id: rect,
                role: 'compute',
                shader: modules.rect,
                entryPoints: ['sky_reactive_rect_main'],
            });
            c.prepare({
                id: tiles,
                role: 'compute',
                shader: modules.tiles,
                entryPoints: ['sky_reactive_tiles_main'],
            });
            return;
        }
        c.prepare({
            id: pipelineId(clouds),
            role: 'render',
            shader: modules.draw,
            entryPoints: ['sky_reactive_vs', 'sky_reactive_fs'],
            topology: 'triangle-list',
            cullMode: 'none',
            colorTargets: [
                {
                    format: 'r8unorm',
                    // O máximo com o que outro estágio marcou no quadro (a refração recomeça, o disco recorta).
                    blend: {
                        color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
                        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
                    },
                },
            ],
        });
    }
}
