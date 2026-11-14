import type {
    EngineCore,
    Frame,
    RenderTarget,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { FlowWork } from '../../scene/flows/FlowWork';
import type { EventBus } from '../../scene/events/EventBus';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type {
    BindingKey,
    BindingSource,
    BoundFlow,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import {
    slot,
    type ChannelSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TargetSlot,
    type TextureSlot,
    type WorkSlot,
} from '../../scene/flows/slots';
import type { World } from '../../scene/world/World';
import { Camera } from '../../elements/scene/Camera';
import {
    TAA_LIGHT_FORMAT,
    TAA_STATE_FORMAT,
    TemporalAntialiasing,
} from '../../elements/scene/TemporalAntialiasing';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { PostProcessEffect } from '../resources/PostProcessEffect';
import { ToneMapping, operatorIndex } from '../resources/ToneMapping';
import { FrameTargets, SCENE_COLOR_FORMAT } from '../app/FrameTargets';
import {
    EffectParamsSchema,
    PresentationParamsSchema,
    TemporalResolveParamsSchema,
} from './renderSchemas';
import {
    effectResources,
    effectsBase,
    presentMultisampled,
    presentResources,
    presentSingle,
    temporalPresent,
    temporalResolve,
    temporalResources,
    temporalSharpen,
    temporalSlots,
} from './shaders';

/** Slots do pós-processamento. */
export interface PostSlots extends SlotMap {
    /** Cor HDR resolvida da cena (`FrameTargets.color`). */
    readonly scene: TextureSlot<false>;
    /** Cor multiamostrada da cena (`FrameTargets.samples`; ausente sem MSAA), para o resolve mapeado por amostra. */
    readonly samples: TextureSlot<true>;
    /** A apresentação da cena (`ToneMapping`); sem ela, a padrão (AgX, 0 EV, pontilhamento). */
    readonly presentation: SingletonSlot<true>;
    /** O canvas do quadro (o passe de apresentação). */
    readonly target: TargetSlot;
    /** Antisserrilhado da cena (spec 034): no modo temporal ou de acumulação, a resolução abre a cadeia. */
    readonly antialiasing: SingletonSlot<true>;
    /** Profundidade da cena (`FrameTargets.depth`): a reprojeção do histórico. */
    readonly depth: TextureSlot<true>;
    /** Vetores de movimento (`FrameTargets.motion`). */
    readonly motion: TextureSlot<true>;
    /** Máscara reativa (`FrameTargets.reactive`): onde o histórico recomeça. */
    readonly reactive: TextureSlot<true>;
    /** A luz que chega a cada pixel (`FrameTargets.light`: direta, total). */
    readonly light: TextureSlot<true>;
    /** A câmera ativa e o pool das matrizes (o deslocamento, a anterior e o corte). */
    readonly camera: SingletonSlot<true>;
    readonly cameras: PoolSlot<true>;
    /** As séries da resolução temporal (spec 037): a cor, o estado e a luz de cada pixel, a anterior e a do quadro. */
    readonly taaHistory: ChannelSlot<true>;
    readonly taaState: ChannelSlot<true>;
    readonly taaLight: ChannelSlot<true>;
    /** O espaço de trabalho da cadeia: pingue-pongue, sampler, parâmetros (spec 039). */
    readonly work: WorkSlot<PostWork>;
}

/** Ids do trabalho. */
const TAA_PARAMS = 'post_taa_params';
const SAMPLER = 'post_sampler';
const PRESENT_PARAMS = 'post_present_params';
const PINGPONG = ['post_pp_a', 'post_pp_b'] as const;
const TAA_OUT = 'post_pp_taa_out';
const effectParamsId = (effect: PostProcessEffect): string => `post_params:${effect.name}`;

/**
 * Resource de trabalho do `PostFlow` (spec 039): os parâmetros da resolução temporal e da apresentação, o sampler, um
 * uniform de parâmetros por efeito e — com o canvas dimensionado — as duas texturas de pingue-pongue HDR e a imagem
 * resolvida, do tamanho do canvas (`sizeFromCanvas`: a C2 as recria no redimensionamento).
 */
class PostWork extends FlowWork {
    static readonly schema = new StructSchema('PostWork', {});
    /** O canvas tem tamanho: as texturas do tamanho dele entram no trabalho. */
    sized = false;
    /** Efeitos com uniform de parâmetros. */
    readonly effects: PostProcessEffect[] = [];

    constructor() {
        super();
        this.use({
            descriptors: (): readonly GPUDescriptor[] => [
                // Escritos da CPU (`writeNow`), cada um por si.
                {
                    id: TAA_PARAMS,
                    role: 'uniform',
                    schema: TemporalResolveParamsSchema,
                    upload: 'never',
                },
                {
                    id: SAMPLER,
                    role: 'sampler',
                    samplerShape: {
                        magFilter: 'linear',
                        minFilter: 'linear',
                        addressModeU: 'clamp-to-edge',
                        addressModeV: 'clamp-to-edge',
                    },
                },
                {
                    id: PRESENT_PARAMS,
                    role: 'uniform',
                    schema: PresentationParamsSchema,
                    upload: 'never',
                },
                ...this.effects.map(
                    (e): GPUDescriptor => ({
                        id: effectParamsId(e),
                        role: 'uniform',
                        schema: EffectParamsSchema,
                        upload: 'never',
                    }),
                ),
                ...(this.sized
                    ? [...PINGPONG, TAA_OUT].map(
                          (id): GPUDescriptor => ({
                              id,
                              role: 'texture',
                              textureShape: { format: SCENE_COLOR_FORMAT, sizeFromCanvas: true },
                          }),
                      )
                    : []),
            ],
        });
    }
}

const baseSlots = {
    scene: slot.texture(FrameTargets.schema, 'color'),
    samples: slot.texture(FrameTargets.schema, 'samples', { optional: true }),
    presentation: slot.singleton(ToneMapping.schema, { optional: true }),
    target: slot.target('canvas'),
    antialiasing: slot.singleton(TemporalAntialiasing.schema, { optional: true }),
    depth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
    motion: slot.texture(FrameTargets.schema, 'motion', { optional: true }),
    reactive: slot.texture(FrameTargets.schema, 'reactive', { optional: true }),
    light: slot.texture(FrameTargets.schema, 'light', { optional: true }),
    camera: slot.singleton(Camera.schema, { optional: true }),
    cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
    ...temporalSlots,
} as const;

type Ctx = TransitionContext<PostSlots>;

/** Pipeline e uniform de parâmetros de um efeito (o id do uniform no trabalho). */
interface EffectPass {
    readonly pipeline: string;
    readonly descriptor: PipelineDescriptor;
    readonly params: string;
    /** Já preparado pela C2 (depois de a origem ser ligada). */
    prepared: boolean;
}

/** Apresentação padrão sem `ToneMapping` na cena. */
const DEFAULT_PRESENTATION = new ToneMapping();

/**
 * PostFlow — cadeia de pós-processamento e apresentação (spec 011): lê a cor HDR da cena (`FrameTargets.color`), aplica
 * os efeitos ligados em pingue-pongue `rgba16float` (`scene → pp[0] → pp[1] → …`) e termina na **apresentação** no
 * canvas — exposição, mapeamento de tons, sRGB e pontilhamento (`ToneMapping` da cena). Sem efeitos e com MSAA, a
 * apresentação lê a cor multiamostrada e mapeia cada amostra antes da média; sem MSAA, lê a cor resolvida.
 *
 * O espaço de trabalho — as duas texturas de pingue-pongue (do tamanho do canvas, recriadas pela C2 no
 * redimensionamento), o sampler, um uniform de parâmetros por efeito e o da apresentação — é do `PostWork` (spec 039);
 * os pipelines (um por efeito, os da apresentação por formato do canvas) são preparados e religados em transições. A saída HDR (`output: 'hdr'`) reconfigura o canvas no
 * `framePrepare` em que é pedida; sem suporte, cai no padrão e emite `presentationFallback` uma vez.
 */
export class PostFlow extends RenderFlow<PostSlots, 'idle'> {
    readonly type = 'PostFlow';
    readonly slots: PostSlots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<PostSlots>>;

    private readonly core: EngineCore;
    private readonly events: EventBus;
    private readonly effects: PostProcessEffect[] = [];
    private readonly passes = new Map<PostProcessEffect, EffectPass>();
    private readonly work: PostWork;
    /** Pipelines de apresentação já preparados (por id: entrada + formato do canvas). */
    private readonly presentPrepared = new Set<string>();

    /** Efeitos ligados no último `framePrepare`, em ordem. */
    private chain: readonly EffectPass[] = [];
    /** Pipeline da apresentação do último `framePrepare`. */
    private presentPipeline = '';
    private chainKey = '';
    /** Saída pedida da última vez que o canvas foi configurado por este estágio. */
    private requestedOutput: 'sdr' | 'hdr' = 'sdr';
    private readonly world: World;
    private readonly resources: ResourceDirectory;

    /**
     * O formato da série da cor neste quadro (o resolvido pela C2: `historyPrecision`, com o recuo sem
     * `float32-filterable`; spec 037) — o pipeline da resolução é um por formato.
     */
    private historyFormat: GPUTextureFormat = SCENE_COLOR_FORMAT;
    /** A resolução temporal grava neste quadro. */
    private taaActive = false;
    /**
     * O passe depois da resolução: a nitidez para os efeitos (`post:taa_sharpen`, no HDR) ou, sem efeitos, a nitidez
     * já apresentada no canvas (`post:taa_present:*`, G2).
     */
    private taaFinal = '';
    private readonly taaPrepared = new Set<string>();

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.events = ctx.events;
        this.world = ctx.world;
        this.resources = ctx.resources;
        const work = new PostWork();
        this.work = work;
        this.slots = { ...baseSlots, work: slot.work(() => work) };
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        // O trabalho já está na cena: as fontes privadas ligam ao que a C2 alocou.
                        c.bind(
                            new Map<WgslResource, BindingSource>([
                                [effectResources.sampler, this.resources.samplerOf(work, SAMPLER)!],
                                [presentResources.params, this.uniform(PRESENT_PARAMS)],
                                [temporalResources.params, this.uniform(TAA_PARAMS)],
                            ]),
                        );
                        this.resizePingPong(c);
                    },
                },
                canvasReconfigured: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.resizePingPong(c);
                    },
                },
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepareChain(c);
                    },
                },
                // A apresentação ou a cor multiamostrada trocou (Resource novo): religa a cadeia.
                slotChanged: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.chainKey = '';
                        this.prepareChain(c);
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                // O pool das matrizes de câmera realocado: a C2 religa a fonte.
                poolReallocated: 'ignore',
            },
        };
    }

    /**
     * Empilha um efeito na cadeia (antes da apresentação). A ordem importa: efeitos são aplicados em sequência
     * (`Bloom → Vignette → …`), todos sobre o HDR; desligar um (`data.enabled = false`) o tira da cadeia sem removê-lo.
     * Builder fluente.
     */
    addEffect(effect: PostProcessEffect): this {
        this.effects.push(effect);
        return this;
    }

    /** Grava os efeitos e a apresentação preparados em `framePrepare`. */
    dispatch(frame: Frame, bound: BoundFlow<PostSlots>): void {
        const canvas = this.colorView(frame, bound.slots.target);
        if (canvas === undefined || this.presentPipeline === '') return;
        const { taaHistory, taaState, taaLight } = bound.slots;
        if (
            this.taaActive
            && this.taaOut !== null
            && taaHistory !== undefined
            && taaState !== undefined
            && taaLight !== undefined
        ) {
            // A resolução temporal abre a cadeia: escreve as fatias do quadro das séries (a cor, o estado e a luz), que a
            // cadeia e a apresentação leem e o quadro seguinte lê como as anteriores.
            const resolve = bound.pipelines.get(`post:taa:${this.historyFormat}`);
            if (resolve?.role !== 'render' || !resolve.ready) return;
            const attachment = (view: TextureViewSpec) =>
                ({ view, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }) as const;
            const target: RenderTarget = {
                colorAttachments: [
                    attachment(taaHistory.view(0)!),
                    attachment(taaState.view(0)!),
                    attachment(taaLight.view(0)!),
                ],
            };
            frame.render(target, 'PostFlow.temporalResolve', (p) => {
                p.bind.setPipeline(resolve.spec);
                resolve.bindTo(p.bind);
                p.draw.vertices(3);
            });
            taaHistory.written();
            taaState.written();
            taaLight.written();
            // Nitidez adaptativa ao movimento, fora do histórico; sem efeitos, já apresentada no canvas (G2).
            const sharpen = bound.pipelines.get(this.taaFinal);
            if (sharpen?.role !== 'render' || !sharpen.ready) return;
            const presents = this.chain.length === 0;
            frame.render(
                {
                    colorAttachments: [
                        {
                            view: presents ? canvas : this.taaOut.view,
                            loadOp: 'clear',
                            clearValue: [0, 0, 0, 1],
                            storeOp: 'store',
                        },
                    ],
                },
                presents ? 'PostFlow.present' : 'PostFlow.temporalSharpen',
                (p) => {
                    p.bind.setPipeline(sharpen.spec);
                    sharpen.bindTo(p.bind);
                    p.draw.vertices(3);
                },
            );
            if (presents) return;
        }
        const passes = [...this.chain.map((p) => p.pipeline), this.presentPipeline];
        for (let i = 0; i < passes.length; i++) {
            const id = passes[i]!;
            const prepared = bound.pipelines.get(id);
            if (prepared?.role !== 'render' || !prepared.ready) return;
            const isLast = i === passes.length - 1;
            const view = isLast ? canvas : this.pingpong!.views[i % 2]!;
            const target: RenderTarget = {
                colorAttachments: [
                    { view, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' },
                ],
            };
            frame.render(target, isLast ? 'PostFlow.present' : `PostFlow.${id.slice(5)}`, (p) => {
                p.bind.setPipeline(prepared.spec);
                prepared.bindTo(p.bind);
                p.draw.vertices(3);
            });
        }
    }

    /** O pingue-pongue, o sampler e os uniforms são do `PostWork` (a C2 os libera com ele). */
    override dispose(): void {
        this.passes.clear();
    }

    /** O uniform do trabalho `id` alocado pela C2. */
    private uniform(id: string): UniformBufferSpec {
        return this.resources.bufferOf(this.work, id) as UniformBufferSpec;
    }

    /** As vistas do pingue-pongue HDR (do tamanho do canvas), ou `null` antes de o canvas ter tamanho. */
    private get pingpong(): { readonly views: readonly [TextureViewSpec, TextureViewSpec] } | null {
        const a = this.resources.textureViewOf(this.work, PINGPONG[0]);
        const b = this.resources.textureViewOf(this.work, PINGPONG[1]);
        return a === undefined || b === undefined ? null : { views: [a, b] };
    }

    /** A imagem resolvida com a nitidez adaptativa (o que a cadeia e a apresentação leem; do tamanho do canvas). */
    private get taaOut(): { readonly view: TextureViewSpec } | null {
        const view = this.resources.textureViewOf(this.work, TAA_OUT);
        return view === undefined ? null : { view };
    }

    /**
     * Texturas de pingue-pongue HDR do tamanho do canvas: declaradas no trabalho quando o canvas tem tamanho (a C2 as
     * recria quando ele muda, antes de os Flows reagirem); a cadeia é religada às vistas novas.
     */
    private resizePingPong(ctx: Ctx): void {
        const size = this.core.canvasSize();
        if (size === undefined || size.width === 0 || size.height === 0) return;
        if (!this.work.sized) {
            this.work.sized = true;
            this.work.refresh();
        }
        this.chainKey = '';
        this.prepareChain(ctx);
    }

    /**
     * Resolução temporal do quadro (spec 034): ativa com o antisserrilhado temporal ou de acumulação, a profundidade
     * sem MSAA e uma câmera. Pede as séries (os canais temporais do `TemporalAntialiasing`, spec 037), escreve os
     * parâmetros e liga/prepara o pipeline do formato da série da cor.
     * Com `presents` (nenhum efeito), a nitidez apresenta no canvas (G2). Devolve a vista da imagem resolvida deste
     * quadro, ou `undefined` sem a resolução.
     */
    private prepareTemporal(ctx: Ctx, presents: boolean): TextureViewSpec | undefined {
        const aa = ctx.bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        const depth = ctx.bound.slots.depth;
        const motion = ctx.bound.slots.motion;
        const reactive = ctx.bound.slots.reactive;
        const light = ctx.bound.slots.light;
        const camera = ctx.bound.slots.camera?.resource;
        const cameraId = camera === undefined ? undefined : this.world.entityIdOfResource(camera);
        const cameraSlot =
            cameraId === undefined ? undefined : ctx.bound.slots.cameras?.slotOf(cameraId);
        if (
            aa === undefined
            || !aa.jitters
            || depth === undefined
            || motion === undefined
            || reactive === undefined
            || light === undefined
            || ctx.bound.slots.samples !== undefined
            || cameraSlot === undefined
            || this.taaOut === null
        ) {
            this.taaActive = false;
            return undefined;
        }
        // As séries sob demanda: alocadas com a primeira resolução (a C2 as recria no redimensionamento).
        for (const id of ['history', 'state', 'light']) this.resources.ensureAllocated(aa, id);
        const series = ctx.bound.slots.taaHistory;
        if (series?.allocated !== true || series.format === undefined) {
            this.taaActive = false;
            return undefined;
        }
        this.historyFormat = series.format;
        this.taaActive = true;
        this.resources.writeNow(
            this.work,
            TAA_PARAMS,
            TemporalResolveParamsSchema.pack({ cameraSlot, mode: aa.data.mode }),
        );
        const id = `post:taa:${this.historyFormat}`;
        // O que cada passe lê do quadro (as séries vêm dos slots: a resolução lê as anteriores, a nitidez as do quadro).
        const frameInputs = (pipeline: string): [BindingKey, BindingSource][] => [
            [{ pipeline, resource: temporalResources.depth }, depth.view],
            [{ pipeline, resource: temporalResources.motion }, motion.view],
            [{ pipeline, resource: temporalResources.reactive }, reactive.view],
            [{ pipeline, resource: temporalResources.light }, light.view],
        ];
        ctx.bind(
            new Map<BindingKey, BindingSource>([
                [{ pipeline: id, resource: effectResources.source }, ctx.bound.slots.scene.view],
                ...frameInputs(id),
            ]),
        );
        const format = this.core.canvasFormat;
        const sharpenId = presents ? `post:taa_present:${format}` : 'post:taa_sharpen';
        this.taaFinal = sharpenId;
        ctx.bind(new Map<BindingKey, BindingSource>(frameInputs(sharpenId)));
        if (!this.taaPrepared.has(sharpenId)) {
            ctx.prepare({
                id: sharpenId,
                role: 'render',
                shader: presents ? temporalPresent : temporalSharpen,
                entryPoints: [
                    'vs_fullscreen',
                    presents ? 'fs_temporal_present' : 'fs_temporal_sharpen',
                ],
                topology: 'triangle-list',
                colorTargets: [{ format: presents ? format : SCENE_COLOR_FORMAT }],
            });
            this.taaPrepared.add(sharpenId);
        }
        if (!this.taaPrepared.has(id)) {
            ctx.prepare({
                id,
                role: 'render',
                shader: temporalResolve,
                entryPoints: ['vs_fullscreen', 'fs_temporal_resolve'],
                topology: 'triangle-list',
                colorTargets: [
                    { format: this.historyFormat },
                    { format: TAA_STATE_FORMAT },
                    { format: TAA_LIGHT_FORMAT },
                ],
            });
            this.taaPrepared.add(id);
        }
        return this.taaOut.view;
    }

    /** Descritor e uniform de parâmetros do efeito, criados uma vez; o efeito escreve no pingue-pongue HDR. */
    private passOf(effect: PostProcessEffect, ctx: Ctx): EffectPass {
        const cached = this.passes.get(effect);
        if (cached !== undefined) return cached;
        // O uniform do efeito entra no trabalho (a C2 o aloca na redescrição).
        const params = effectParamsId(effect);
        this.work.effects.push(effect);
        this.work.refresh();
        const id = `post:${effect.name}`;
        // Efeito próprio (fragmentModule, com requires: [effectsBase]) → shader dele; padrão: o comum.
        const descriptor: PipelineDescriptor = {
            id,
            role: 'render',
            shader: effect.fragmentModule?.() ?? effectsBase,
            entryPoints: ['vs_fullscreen', effect.fragmentEntry],
            topology: 'triangle-list',
            colorTargets: [{ format: SCENE_COLOR_FORMAT }],
        };
        ctx.bind(
            new Map<BindingKey, BindingSource>([
                [{ pipeline: id, resource: effectResources.params }, this.uniform(params)],
            ]),
        );
        const pass = { pipeline: id, descriptor, params, prepared: false };
        this.passes.set(effect, pass);
        return pass;
    }

    /** Pipeline da apresentação para a origem (multiamostrada ou resolvida) e o formato atual do canvas. */
    private presentDescriptor(multisampled: boolean): PipelineDescriptor {
        const format = this.core.canvasFormat;
        return {
            id: `post:present${multisampled ? '_ms' : ''}:${format}`,
            role: 'render',
            shader: multisampled ? presentMultisampled : presentSingle,
            entryPoints: ['vs_fullscreen', multisampled ? 'fs_present_ms' : 'fs_present'],
            topology: 'triangle-list',
            colorTargets: [{ format }],
        };
    }

    /**
     * Saída do canvas conforme a apresentação: `hdr` reconfigura o canvas (rgba16float, mapeamento estendido) no
     * quadro em que é pedida; sem suporte, o núcleo volta ao padrão e a cena recebe `presentationFallback`.
     */
    private applyOutput(requested: 'sdr' | 'hdr'): void {
        if (requested === this.requestedOutput || this.core.canvasSize() === undefined) return;
        this.requestedOutput = requested;
        const hdr = requested === 'hdr';
        this.core.reconfigureCanvas({
            ...this.core.canvasOptions,
            toneMapping: hdr ? 'extended' : 'standard',
            format: hdr ? 'rgba16float' : 'preferred',
        });
        if (hdr && this.core.canvasOutput.toneMapping !== 'extended') {
            this.events.emit('presentationFallback', {
                requested: 'hdr',
                reason: 'o navegador ou a tela não aceitam o mapeamento de tons estendido do canvas',
            });
        }
    }

    /**
     * Antes da gravação: a apresentação (saída do canvas e parâmetros), a cadeia dos efeitos ligados e, quando ela
     * muda, a origem de cada passe religada (`scene` para o primeiro; senão o pingue-pongue anterior; a apresentação lê
     * o último efeito, ou a cena — multiamostrada quando há MSAA e nenhum efeito). Passes novos são preparados depois de
     * terem a origem ligada.
     */
    private prepareChain(ctx: Ctx): void {
        if (this.pingpong === null) return;
        const presentation = (ctx.bound.slots.presentation?.resource
            ?? DEFAULT_PRESENTATION) as ToneMapping;
        const data = presentation.data;
        this.applyOutput(data.output);
        const extended = this.core.canvasOutput.toneMapping === 'extended';
        this.resources.writeNow(
            this.work,
            PRESENT_PARAMS,
            PresentationParamsSchema.pack({
                toneOperator: operatorIndex(data.operator),
                exposure: Math.pow(2, data.exposure),
                dither: data.dither ? 1 : 0,
                output: extended ? 1 : 0,
            }),
        );

        const enabled = this.effects.filter((e) => e.isEnabled);
        const chain = enabled.map((e) => this.passOf(e, ctx));
        for (let i = 0; i < enabled.length; i++)
            this.resources.writeNow(this.work, chain[i]!.params, enabled[i]!.paramsBytes());
        // Com a resolução temporal, a cadeia e a apresentação leem a imagem resolvida, não a cor crua da cena.
        const resolved = this.prepareTemporal(ctx, chain.length === 0);
        this.chain = chain;
        if (resolved !== undefined && chain.length === 0) {
            // A resolução já apresenta no canvas (G2): sem passe de apresentação.
            this.presentPipeline = this.taaFinal;
            return;
        }
        const scene = resolved ?? ctx.bound.slots.scene.view;
        const samples = ctx.bound.slots.samples;
        const multisampled = chain.length === 0 && samples !== undefined;
        const present = this.presentDescriptor(multisampled);
        const presentSource =
            chain.length === 0
                ? multisampled
                    ? samples.view
                    : scene
                : this.pingpong.views[(chain.length - 1) % 2]!;
        const key = `${chain.map((p) => p.pipeline).join('|')}>${present.id}#${scene.discriminator ?? ''}#${presentSource.discriminator ?? ''}`;
        if (key !== this.chainKey) {
            const sources = new Map<BindingKey, BindingSource>();
            chain.forEach((pass, i) => {
                sources.set(
                    { pipeline: pass.pipeline, resource: effectResources.source },
                    i === 0 ? scene : this.pingpong!.views[(i - 1) % 2]!,
                );
            });
            sources.set(
                {
                    pipeline: present.id,
                    resource: multisampled ? presentResources.samples : effectResources.source,
                },
                presentSource,
            );
            ctx.bind(sources);
            this.chainKey = key;
        }
        for (const pass of chain) {
            if (pass.prepared) continue;
            ctx.prepare(pass.descriptor);
            pass.prepared = true;
        }
        if (!this.presentPrepared.has(present.id)) {
            ctx.prepare(present);
            this.presentPrepared.add(present.id);
        }
        this.chain = chain;
        this.presentPipeline = present.id;
    }
}
