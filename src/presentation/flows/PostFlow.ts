import type {
    EngineCore,
    Frame,
    RenderTarget,
    SamplerSpec,
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
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
import { slot, type SlotMap, type TargetSlot, type TextureSlot } from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { PostProcessEffect } from '../resources/PostProcessEffect';
import { FrameTargets } from '../app/FrameTargets';
import { EffectParamsSchema } from './renderSchemas';
import { effectResources, effectsBase } from './shaders';

/** Slots do pós-processamento. */
export interface PostSlots extends SlotMap {
    /** Cor da cena desenhada pelo render principal (`FrameTargets.color`). */
    readonly scene: TextureSlot<false>;
    /** O canvas do quadro (último passe da cadeia). */
    readonly target: TargetSlot;
}

const slots: PostSlots = {
    scene: slot.texture(FrameTargets.schema, 'color'),
    target: slot.target('canvas'),
};

type Ctx = TransitionContext<PostSlots>;

const PASSTHROUGH = 'post:passthrough';

/** Pipeline e uniform de parâmetros de um efeito (ou da passagem direta). */
interface EffectPass {
    readonly pipeline: string;
    readonly descriptor: PipelineDescriptor;
    readonly params: UniformBufferSpec;
    /** Já preparado pela C2 (depois de a origem ser ligada). */
    prepared: boolean;
}

/**
 * PostFlow — cadeia de pós-processamento: lê a cor da cena (`FrameTargets.color`, slot `scene`) e aplica os efeitos
 * ligados em pingue-pongue até o canvas (`scene → pp[0] → pp[1] → … → canvas`); sem efeitos, copia a cena para o
 * canvas.
 *
 * Recursos privados — as duas texturas de pingue-pongue (do tamanho do canvas, recriadas em `canvasReconfigured`), o
 * sampler, um pipeline e um uniform de parâmetros por efeito — são preparados e religados em transições: em
 * `framePrepare`, efeitos novos ganham pipeline, os parâmetros são escritos e a origem de cada efeito na cadeia é
 * religada quando a cadeia muda.
 */
export class PostFlow extends RenderFlow<PostSlots, 'idle'> {
    readonly type = 'PostFlow';
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource>;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<PostSlots>>;

    private readonly core: EngineCore;
    private readonly effects: PostProcessEffect[] = [];
    private readonly passes = new Map<PostProcessEffect | null, EffectPass>();
    private readonly sampler: SamplerSpec;
    private pingpong: {
        textures: [TextureSpec, TextureSpec];
        views: [TextureViewSpec, TextureViewSpec];
    } | null = null;
    /** Cadeia ligada no último `framePrepare` (efeitos em ordem, com a origem de cada um). */
    private chain: readonly EffectPass[] = [];
    private chainKey = '';

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
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
        this.bindings = new Map<WgslResource, BindingSource>([
            [effectResources.sampler, this.sampler],
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
                        this.prepareChain(c);
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
            },
        };
    }

    /**
     * Empilha um efeito na cadeia. A ordem importa: efeitos são aplicados em sequência (`Bloom → ToneMapping → Fxaa →
     * …`); desligar um (`data.enabled = false`) o tira da cadeia sem removê-lo. Builder fluente.
     */
    addEffect(effect: PostProcessEffect): this {
        this.effects.push(effect);
        return this;
    }

    /** Grava a cadeia preparada em `framePrepare`. */
    dispatch(frame: Frame, bound: BoundFlow<PostSlots>): void {
        const canvas = this.colorView(frame, bound.slots.target);
        if (canvas === undefined || this.chain.length === 0) return;
        for (let i = 0; i < this.chain.length; i++) {
            const pass = this.chain[i]!;
            const prepared = bound.pipelines.get(pass.pipeline);
            if (prepared?.role !== 'render' || !prepared.ready) return;
            const isLast = i === this.chain.length - 1;
            const view = isLast ? canvas : this.pingpong!.views[i % 2]!;
            const target: RenderTarget = {
                colorAttachments: [
                    { view, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' },
                ],
            };
            const label =
                pass.pipeline === PASSTHROUGH
                    ? 'PostFlow.passthrough'
                    : `PostFlow.${pass.pipeline.slice(5)}`;
            frame.render(target, label, (p) => {
                p.bind.setPipeline(prepared.spec);
                prepared.bindTo(p.bind);
                p.draw.vertices(3);
            });
        }
    }

    /** Libera pingue-pongue, sampler e os uniforms dos efeitos. */
    override dispose(): void {
        this.releasePingPong();
        this.core.destroy(this.sampler);
        for (const pass of this.passes.values()) this.core.destroy(pass.params);
        this.passes.clear();
    }

    /** Texturas de pingue-pongue do tamanho do canvas (recriadas quando ele muda); a cadeia é religada. */
    private resizePingPong(ctx: Ctx): void {
        const size = this.core.canvasSize();
        this.releasePingPong();
        if (size === undefined || size.width === 0 || size.height === 0) return;
        const { width, height } = size;
        const format = this.core.canvasFormat;
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
        this.chainKey = '';
        this.prepareChain(ctx);
    }

    private releasePingPong(): void {
        if (this.pingpong === null) return;
        for (const v of this.pingpong.views) this.core.destroy(v);
        for (const t of this.pingpong.textures) this.core.destroy(t);
        this.pingpong = null;
    }

    /** Descritor e uniform de parâmetros do efeito (ou da passagem direta, `null`), criados uma vez. */
    private passOf(effect: PostProcessEffect | null, ctx: Ctx): EffectPass {
        const cached = this.passes.get(effect);
        if (cached !== undefined) return cached;
        const name = effect === null ? 'passthrough' : effect.name;
        const params = this.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: `post_params:${name}`,
            byteSize: EffectParamsSchema.stride,
        });
        const id = effect === null ? PASSTHROUGH : `post:${name}`;
        // Efeito próprio (fragmentModule, com requires: [effectsBase]) → shader dele; padrão: o comum.
        const descriptor: PipelineDescriptor = {
            id,
            role: 'render',
            shader: effect?.fragmentModule?.() ?? effectsBase,
            entryPoints: [
                'vs_fullscreen',
                effect === null ? 'fs_passthrough' : effect.fragmentEntry,
            ],
            consumes: [],
            topology: 'triangle-list',
            colorTargets: [{ format: this.core.canvasFormat }],
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

    /**
     * Antes da gravação: a cadeia dos efeitos ligados (ou a passagem direta), parâmetros escritos e, quando a cadeia
     * muda, a origem de cada passe religada (`scene` para o primeiro; senão o pingue-pongue anterior). Um passe novo
     * é preparado depois de ter a origem ligada.
     */
    private prepareChain(ctx: Ctx): void {
        if (this.pingpong === null) return;
        const enabled = this.effects.filter((e) => e.isEnabled);
        const chain =
            enabled.length === 0
                ? [this.passOf(null, ctx)]
                : enabled.map((e) => this.passOf(e, ctx));
        for (let i = 0; i < enabled.length; i++)
            this.core.write(chain[i]!.params, enabled[i]!.paramsBytes());
        const scene = ctx.bound.slots.scene.view;
        const key = `${chain.map((p) => p.pipeline).join('|')}#${scene.discriminator ?? ''}`;
        if (key !== this.chainKey) {
            const sources = new Map<BindingKey, BindingSource>();
            chain.forEach((pass, i) => {
                sources.set(
                    { pipeline: pass.pipeline, resource: effectResources.source },
                    i === 0 ? scene : this.pingpong!.views[(i - 1) % 2]!,
                );
            });
            ctx.bind(sources);
            this.chainKey = key;
        }
        for (const pass of chain) {
            if (pass.prepared) continue;
            ctx.prepare(pass.descriptor);
            pass.prepared = true;
        }
        this.chain = chain;
    }
}
