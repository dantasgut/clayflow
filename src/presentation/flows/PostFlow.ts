import type {
    EngineCore,
    Frame,
    RenderTarget,
    SamplerSpec,
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
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
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TargetSlot,
    type TextureSlot,
} from '../../scene/flows/slots';
import type { World } from '../../scene/world/World';
import { Camera } from '../../elements/scene/Camera';
import { TemporalAntialiasing } from '../../elements/scene/TemporalAntialiasing';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { PostProcessEffect } from '../resources/PostProcessEffect';
import { ToneMapping, operatorIndex } from '../resources/ToneMapping';
import { FrameTargets, LIGHT_FORMAT, SCENE_COLOR_FORMAT } from '../app/FrameTargets';
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
    temporalResolve,
    temporalResources,
    temporalSharpen,
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
    /** A luz que chega a cada pixel (`FrameTargets.light`: direta, total). */
    readonly light: TextureSlot<true>;
    /** A câmera ativa e o pool das matrizes (o deslocamento, a anterior e o corte). */
    readonly camera: SingletonSlot<true>;
    readonly cameras: PoolSlot<true>;
}

const slots: PostSlots = {
    scene: slot.texture(FrameTargets.schema, 'color'),
    samples: slot.texture(FrameTargets.schema, 'samples', { optional: true }),
    presentation: slot.singleton(ToneMapping.schema, { optional: true }),
    target: slot.target('canvas'),
    antialiasing: slot.singleton(TemporalAntialiasing.schema, { optional: true }),
    depth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
    motion: slot.texture(FrameTargets.schema, 'motion', { optional: true }),
    light: slot.texture(FrameTargets.schema, 'light', { optional: true }),
    camera: slot.singleton(Camera.schema, { optional: true }),
    cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
};

type Ctx = TransitionContext<PostSlots>;

/** Pipeline e uniform de parâmetros de um efeito. */
interface EffectPass {
    readonly pipeline: string;
    readonly descriptor: PipelineDescriptor;
    readonly params: UniformBufferSpec;
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
 * Recursos privados — as duas texturas de pingue-pongue (do tamanho do canvas, recriadas em `canvasReconfigured`), o
 * sampler, um pipeline e um uniform de parâmetros por efeito, o uniform e os pipelines da apresentação (um por formato
 * do canvas) — são preparados e religados em transições. A saída HDR (`output: 'hdr'`) reconfigura o canvas no
 * `framePrepare` em que é pedida; sem suporte, cai no padrão e emite `presentationFallback` uma vez.
 */
export class PostFlow extends RenderFlow<PostSlots, 'idle'> {
    readonly type = 'PostFlow';
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource>;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<PostSlots>>;

    private readonly core: EngineCore;
    private readonly events: EventBus;
    private readonly effects: PostProcessEffect[] = [];
    private readonly passes = new Map<PostProcessEffect, EffectPass>();
    private readonly sampler: SamplerSpec;
    private readonly presentParams: UniformBufferSpec;
    /** Pipelines de apresentação já preparados (por id: entrada + formato do canvas). */
    private readonly presentPrepared = new Set<string>();
    private pingpong: {
        textures: [TextureSpec, TextureSpec];
        views: [TextureViewSpec, TextureViewSpec];
    } | null = null;
    /** Efeitos ligados no último `framePrepare`, em ordem. */
    private chain: readonly EffectPass[] = [];
    /** Pipeline da apresentação do último `framePrepare`. */
    private presentPipeline = '';
    private chainKey = '';
    /** Saída pedida da última vez que o canvas foi configurado por este estágio. */
    private requestedOutput: 'sdr' | 'hdr' = 'sdr';
    private readonly world: World;
    /** Parâmetros da resolução temporal (spec 034). */
    private readonly taaParams: UniformBufferSpec;
    /** Os dois históricos (escreve um, lê o outro; trocam a cada quadro): a cor e a distância à câmera. */
    private history: {
        textures: [TextureSpec, TextureSpec];
        views: [TextureViewSpec, TextureViewSpec];
        distanceTextures: [TextureSpec, TextureSpec];
        distanceViews: [TextureViewSpec, TextureViewSpec];
        /** A luz que chegava a cada pixel (direta, total; acumulada): a mudança de iluminação do quadro seguinte. */
        lightTextures: [TextureSpec, TextureSpec];
        lightViews: [TextureViewSpec, TextureViewSpec];
        /** A imagem resolvida com a nitidez adaptativa (o que a cadeia e a apresentação leem). */
        outTexture: TextureSpec;
        outView: TextureViewSpec;
    } | null = null;
    /** Histórico escrito neste quadro (0 ou 1); `-1` sem resolução temporal. */
    private taaWrite = -1;
    /**
     * Paridade do histórico, avançada uma vez por quadro (`framePrepare`): a cadeia também é religada fora do quadro
     * (`slotChanged`, redimensionamento), e trocar o histórico ali faria a resolução ler o de dois quadros atrás com a
     * câmera de um.
     */
    private taaParity = 0;
    private readonly taaPrepared = new Set<string>();

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.events = ctx.events;
        this.world = ctx.world;
        this.taaParams = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'post_taa_params',
            byteSize: TemporalResolveParamsSchema.stride,
        });
        this.sampler = ctx.core.create<SamplerSpec>({
            kind: 'sampler',
            discriminator: 'post_sampler',
            desc: {
                magFilter: 'linear',
                minFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge',
            },
        });
        this.presentParams = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'post_present_params',
            byteSize: PresentationParamsSchema.stride,
        });
        this.bindings = new Map<WgslResource, BindingSource>([
            [effectResources.sampler, this.sampler],
            [presentResources.params, this.presentParams],
            [temporalResources.params, this.taaParams],
        ]);
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
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
                        this.taaParity = 1 - this.taaParity;
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
     * (`Bloom → Fxaa → …`), todos sobre o HDR; desligar um (`data.enabled = false`) o tira da cadeia sem removê-lo.
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
        if (this.taaWrite >= 0 && this.history !== null) {
            // A resolução temporal abre a cadeia: escreve o histórico deste quadro, que a cadeia e a apresentação leem.
            const resolve = bound.pipelines.get(`post:taa:${this.taaWrite}`);
            if (resolve?.role !== 'render' || !resolve.ready) return;
            const target: RenderTarget = {
                colorAttachments: [
                    {
                        view: this.history.views[this.taaWrite]!,
                        loadOp: 'clear',
                        clearValue: [0, 0, 0, 0],
                        storeOp: 'store',
                    },
                    {
                        view: this.history.distanceViews[this.taaWrite]!,
                        loadOp: 'clear',
                        clearValue: [0, 0, 0, 0],
                        storeOp: 'store',
                    },
                    {
                        view: this.history.lightViews[this.taaWrite]!,
                        loadOp: 'clear',
                        clearValue: [0, 0, 0, 0],
                        storeOp: 'store',
                    },
                ],
            };
            frame.render(target, 'PostFlow.temporalResolve', (p) => {
                p.bind.setPipeline(resolve.spec);
                resolve.bindTo(p.bind);
                p.draw.vertices(3);
            });
            // Nitidez adaptativa ao movimento, fora do histórico.
            const sharpen = bound.pipelines.get(`post:taa_sharpen:${this.taaWrite}`);
            if (sharpen?.role !== 'render' || !sharpen.ready) return;
            frame.render(
                {
                    colorAttachments: [
                        {
                            view: this.history.outView,
                            loadOp: 'clear',
                            clearValue: [0, 0, 0, 1],
                            storeOp: 'store',
                        },
                    ],
                },
                'PostFlow.temporalSharpen',
                (p) => {
                    p.bind.setPipeline(sharpen.spec);
                    sharpen.bindTo(p.bind);
                    p.draw.vertices(3);
                },
            );
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

    /** Libera pingue-pongue, sampler e os uniforms dos efeitos e da apresentação. */
    override dispose(): void {
        this.releasePingPong();
        this.core.destroy(this.sampler);
        this.core.destroy(this.presentParams);
        this.core.destroy(this.taaParams);
        for (const pass of this.passes.values()) this.core.destroy(pass.params);
        this.passes.clear();
    }

    /** Texturas de pingue-pongue HDR do tamanho do canvas (recriadas quando ele muda); a cadeia é religada. */
    private resizePingPong(ctx: Ctx): void {
        const size = this.core.canvasSize();
        this.releasePingPong();
        if (size === undefined || size.width === 0 || size.height === 0) return;
        const { width, height } = size;
        const format = SCENE_COLOR_FORMAT;
        const texture = (name: string): TextureSpec =>
            this.core.create<TextureSpec>({
                kind: 'texture',
                discriminator: `post_pp_${name}:${width}x${height}`,
                width,
                height,
                format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
        const view = (source: TextureSpec, name: string): TextureViewSpec =>
            this.core.create<TextureViewSpec>({
                kind: 'textureview',
                discriminator: `post_pp_${name}_v:${width}x${height}`,
                source,
                format,
            });
        const a = texture('a');
        const b = texture('b');
        this.pingpong = { textures: [a, b], views: [view(a, 'a'), view(b, 'b')] };
        // Históricos da resolução temporal: recomeçam vazios no redimensionamento (o alfa 0 = nenhum quadro).
        const h0 = texture('taa0');
        const h1 = texture('taa1');
        const distance = (name: string): TextureSpec =>
            this.core.create<TextureSpec>({
                kind: 'texture',
                discriminator: `post_taa_${name}:${width}x${height}`,
                width,
                height,
                format: 'rg32float',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
        const distanceView = (source: TextureSpec, name: string): TextureViewSpec =>
            this.core.create<TextureViewSpec>({
                kind: 'textureview',
                discriminator: `post_taa_${name}_v:${width}x${height}`,
                source,
                format: 'rg32float',
            });
        // Estado por pixel (distância à câmera, quanto se movia) para a desoclusão do quadro seguinte.
        const d0 = distance('s0');
        const d1 = distance('s1');
        // A luz que chegava a cada pixel, para a mudança de iluminação do quadro seguinte.
        const light = (name: string): TextureSpec =>
            this.core.create<TextureSpec>({
                kind: 'texture',
                discriminator: `post_taa_${name}:${width}x${height}`,
                width,
                height,
                format: LIGHT_FORMAT,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
        const lightView = (source: TextureSpec, name: string): TextureViewSpec =>
            this.core.create<TextureViewSpec>({
                kind: 'textureview',
                discriminator: `post_taa_${name}_v:${width}x${height}`,
                source,
                format: LIGHT_FORMAT,
            });
        const l0 = light('l0');
        const l1 = light('l1');
        const out = texture('taa_out');
        this.history = {
            textures: [h0, h1],
            views: [view(h0, 'taa0'), view(h1, 'taa1')],
            distanceTextures: [d0, d1],
            distanceViews: [distanceView(d0, 'd0'), distanceView(d1, 'd1')],
            lightTextures: [l0, l1],
            lightViews: [lightView(l0, 'l0'), lightView(l1, 'l1')],
            outTexture: out,
            outView: view(out, 'taa_out'),
        };
        this.chainKey = '';
        this.prepareChain(ctx);
    }

    private releasePingPong(): void {
        if (this.history !== null) {
            for (const v of [
                ...this.history.views,
                ...this.history.distanceViews,
                ...this.history.lightViews,
                this.history.outView,
            ])
                this.core.destroy(v);
            for (const t of [
                ...this.history.textures,
                ...this.history.distanceTextures,
                ...this.history.lightTextures,
                this.history.outTexture,
            ])
                this.core.destroy(t);
            this.history = null;
        }
        if (this.pingpong === null) return;
        for (const v of this.pingpong.views) this.core.destroy(v);
        for (const t of this.pingpong.textures) this.core.destroy(t);
        this.pingpong = null;
    }

    /**
     * Resolução temporal do quadro (spec 034): ativa com o antisserrilhado temporal ou de acumulação, a profundidade
     * sem MSAA e uma câmera. Troca o histórico escrito, escreve os parâmetros e liga/prepara o pipeline da paridade.
     * Devolve a vista da imagem resolvida deste quadro, ou `undefined` sem a resolução.
     */
    private prepareTemporal(ctx: Ctx): TextureViewSpec | undefined {
        const aa = ctx.bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        const depth = ctx.bound.slots.depth;
        const motion = ctx.bound.slots.motion;
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
            || light === undefined
            || ctx.bound.slots.samples !== undefined
            || cameraSlot === undefined
            || this.history === null
        ) {
            this.taaWrite = -1;
            return undefined;
        }
        this.taaWrite = this.taaParity;
        this.core.write(
            this.taaParams,
            TemporalResolveParamsSchema.pack({
                cameraSlot,
                mode: aa.data.mode,
            }),
        );
        const id = `post:taa:${this.taaWrite}`;
        const read = this.history.views[1 - this.taaWrite]!;
        ctx.bind(
            new Map<BindingKey, BindingSource>([
                [{ pipeline: id, resource: effectResources.source }, ctx.bound.slots.scene.view],
                [{ pipeline: id, resource: temporalResources.history }, read],
                [
                    { pipeline: id, resource: temporalResources.historyDistance },
                    this.history.distanceViews[1 - this.taaWrite]!,
                ],
                [
                    { pipeline: id, resource: temporalResources.historyLight },
                    this.history.lightViews[1 - this.taaWrite]!,
                ],
                [{ pipeline: id, resource: temporalResources.depth }, depth.view],
                [{ pipeline: id, resource: temporalResources.motion }, motion.view],
                [{ pipeline: id, resource: temporalResources.light }, light.view],
            ]),
        );
        // A nitidez lê o histórico e o estado (o movimento de cada pixel) que a resolução acabou de escrever.
        const sharpenId = `post:taa_sharpen:${this.taaWrite}`;
        ctx.bind(
            new Map<BindingKey, BindingSource>([
                [
                    { pipeline: sharpenId, resource: temporalResources.history },
                    this.history.views[this.taaWrite]!,
                ],
                [
                    { pipeline: sharpenId, resource: temporalResources.historyDistance },
                    this.history.distanceViews[this.taaWrite]!,
                ],
                [
                    { pipeline: sharpenId, resource: temporalResources.historyLight },
                    this.history.lightViews[this.taaWrite]!,
                ],
                [{ pipeline: sharpenId, resource: temporalResources.depth }, depth.view],
                [{ pipeline: sharpenId, resource: temporalResources.motion }, motion.view],
                [{ pipeline: sharpenId, resource: temporalResources.light }, light.view],
            ]),
        );
        if (!this.taaPrepared.has(sharpenId)) {
            ctx.prepare({
                id: sharpenId,
                role: 'render',
                shader: temporalSharpen,
                entryPoints: ['vs_fullscreen', 'fs_temporal_sharpen'],
                topology: 'triangle-list',
                colorTargets: [{ format: SCENE_COLOR_FORMAT }],
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
                    { format: SCENE_COLOR_FORMAT },
                    { format: 'rg32float' },
                    { format: LIGHT_FORMAT },
                ],
            });
            this.taaPrepared.add(id);
        }
        return this.history.outView;
    }

    /** Descritor e uniform de parâmetros do efeito, criados uma vez; o efeito escreve no pingue-pongue HDR. */
    private passOf(effect: PostProcessEffect, ctx: Ctx): EffectPass {
        const cached = this.passes.get(effect);
        if (cached !== undefined) return cached;
        const params = this.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: `post_params:${effect.name}`,
            byteSize: EffectParamsSchema.stride,
        });
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
                [{ pipeline: id, resource: effectResources.params }, params],
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
        this.core.write(
            this.presentParams,
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
            this.core.write(chain[i]!.params, enabled[i]!.paramsBytes());
        // Com a resolução temporal, a cadeia e a apresentação leem a imagem resolvida, não a cor crua da cena.
        const scene = this.prepareTemporal(ctx) ?? ctx.bound.slots.scene.view;
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
