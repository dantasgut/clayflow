import type {
    BindGroupSpec,
    EngineCore,
    Frame,
    LayoutSpec,
    RenderPipelineSpec,
    RenderTarget,
    SamplerSpec,
    ShaderModuleSpec,
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../core/contracts/index';
import { Flow } from '../../scene/flows/Flow';
import type { Phase } from '../../scene/flows/Flow';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { PostProcessEffect } from '../resources/PostProcessEffect';
import type { ForwardFlow } from './ForwardFlow';
import effectsWGSL from './effects/effects.wgsl?raw';

interface EffectSlot {
    readonly effect: PostProcessEffect;
    readonly pipeline: RenderPipelineSpec;
    readonly paramsBuffer: UniformBufferSpec;
}

export interface PostFlowOptions {
    readonly canvas: HTMLCanvasElement;
}

export class PostFlow extends Flow {
    readonly type = 'PostFlow';
    readonly bodyType = '';
    readonly phase: Phase = 'post';

    private readonly canvas: HTMLCanvasElement | null;
    private readonly effects: PostProcessEffect[] = [];
    private readonly slots = new Map<PostProcessEffect, EffectSlot>();

    private shader: ShaderModuleSpec | null = null;
    private sampler: SamplerSpec | null = null;
    private bindLayout: LayoutSpec | null = null;
    private pingpongTextures: [TextureSpec, TextureSpec] | null = null;
    private pingpongViews: [TextureViewSpec, TextureViewSpec] | null = null;
    private currentSize = { w: 0, h: 0 };
    private readonly bindGroupCache = new Map<string, BindGroupSpec>();

    private forwardFlow: ForwardFlow | null = null;

    constructor(
        options: PostFlowOptions | undefined,
        private readonly core: EngineCore,
    ) {
        super();
        this.canvas = options?.canvas ?? null;
    }

    bindForwardFlow(flow: ForwardFlow): this {
        this.forwardFlow = flow;
        return this;
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return this.effects.map((eff) => ({
            id: `pipeline_post_${eff.name}`,
            role: 'render',
            shaderSource: effectsWGSL,
            entryPoints: ['vs_fullscreen', eff.fragmentEntry],
            consumes: [],
        }));
    }

    addEffect(effect: PostProcessEffect): this {
        this.effects.push(effect);
        return this;
    }

    override isReady(): boolean {
        return this.canvas !== null && this.forwardFlow !== null;
    }

    override onCanvasResized(_width: number, _height: number): void {
        this.pingpongTextures = null;
        this.pingpongViews = null;
        this.bindGroupCache.clear();
        this.currentSize = { w: 0, h: 0 };
    }

    private ensureShared(): void {
        if (this.shader === null) {
            this.shader = this.core.create<ShaderModuleSpec>({
                kind: 'shader',
                discriminator: 'post_effects_shader',
                source: effectsWGSL,
            });
        }
        if (this.sampler === null) {
            this.sampler = this.core.create<SamplerSpec>({
                kind: 'sampler',
                discriminator: 'post_sampler',
                desc: {
                    magFilter: 'linear',
                    minFilter: 'linear',
                    addressModeU: 'clamp-to-edge',
                    addressModeV: 'clamp-to-edge',
                },
            });
        }
        if (this.bindLayout === null) {
            this.bindLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'post_layout',
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.FRAGMENT,
                        kind: 'texture',
                        sampleType: 'float',
                        viewDimension: '2d',
                        multisampled: false,
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        kind: 'sampler',
                        type: 'filtering',
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.FRAGMENT,
                        kind: 'buffer',
                        type: 'uniform',
                    },
                ],
            });
        }
    }

    private ensurePingPong(width: number, height: number): void {
        if (
            this.pingpongTextures !== null
            && this.currentSize.w === width
            && this.currentSize.h === height
        )
            return;
        const fmt = this.core.canvasFormat;
        const t0 = this.core.create<TextureSpec>({
            kind: 'texture',
            discriminator: `post_pp_a:${width}x${height}`,
            width,
            height,
            format: fmt,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        const t1 = this.core.create<TextureSpec>({
            kind: 'texture',
            discriminator: `post_pp_b:${width}x${height}`,
            width,
            height,
            format: fmt,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        const v0 = this.core.create<TextureViewSpec>({
            kind: 'textureview',
            discriminator: `post_pp_a_v:${width}x${height}`,
            source: t0,
            format: fmt,
        });
        const v1 = this.core.create<TextureViewSpec>({
            kind: 'textureview',
            discriminator: `post_pp_b_v:${width}x${height}`,
            source: t1,
            format: fmt,
        });
        this.pingpongTextures = [t0, t1];
        this.pingpongViews = [v0, v1];
        this.bindGroupCache.clear();
        this.currentSize = { w: width, h: height };
    }

    private ensureSlot(effect: PostProcessEffect): EffectSlot {
        const cached = this.slots.get(effect);
        if (cached !== undefined) return cached;
        if (this.shader === null || this.bindLayout === null)
            throw new Error('PostFlow not initialized');
        const paramsBuffer = this.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: `post_params:${effect.name}`,
            byteSize: 16,
        });
        // Custom shader path: effect.fragmentSource() defined → shader dedicado.
        // Default: reusa o shared `effects.wgsl`.
        const customSource = effect.fragmentSource?.();
        const shader =
            customSource !== undefined
                ? this.core.create<ShaderModuleSpec>({
                      kind: 'shader',
                      discriminator: `post_custom_shader:${effect.name}`,
                      source: customSource,
                  })
                : this.shader;
        const pipeline = this.core.create<RenderPipelineSpec>({
            kind: 'pipeline',
            subkind: 'render',
            discriminator: `post_pipeline:${effect.name}`,
            layouts: [this.bindLayout],
            vertex: { shader, entryPoint: 'vs_fullscreen' },
            fragment: {
                shader,
                entryPoint: effect.fragmentEntry,
                targets: [{ format: this.core.canvasFormat }],
            },
            primitive: { topology: 'triangle-list' },
        });
        const slot: EffectSlot = { effect, pipeline, paramsBuffer };
        this.slots.set(effect, slot);
        return slot;
    }

    private bindGroupFor(srcView: TextureViewSpec, paramsBuffer: UniformBufferSpec): BindGroupSpec {
        if (this.bindLayout === null || this.sampler === null)
            throw new Error('PostFlow shared not ready');
        const cacheKey = `${srcView.discriminator ?? 'view'}|${paramsBuffer.discriminator ?? 'p'}`;
        const cached = this.bindGroupCache.get(cacheKey);
        if (cached !== undefined) return cached;
        const bg = this.core.create<BindGroupSpec>({
            kind: 'bindgroup',
            discriminator: `post_bg:${cacheKey}`,
            layout: this.bindLayout,
            bindings: [
                { binding: 0, kind: 'textureview', view: srcView },
                { binding: 1, kind: 'sampler', sampler: this.sampler },
                { binding: 2, kind: 'buffer', buffer: paramsBuffer },
            ],
        });
        this.bindGroupCache.set(cacheKey, bg);
        return bg;
    }

    override dispatch(frame: Frame): void {
        if (this.canvas === null || this.forwardFlow === null) return;
        const sceneView = this.forwardFlow.colorOutputView;
        if (sceneView === null) return;
        this.ensureShared();
        this.ensurePingPong(this.canvas.width, this.canvas.height);
        if (this.pingpongViews === null) return;

        const enabled = this.effects.filter((e) => e.isEnabled);
        for (const eff of enabled) {
            const slot = this.ensureSlot(eff);
            this.core.write(slot.paramsBuffer, eff.paramsBytes());
        }

        // No-effects path: just blit scene → canvas using passthrough.
        if (enabled.length === 0) {
            const passthroughSlot = this.ensurePassthroughSlot();
            const target: RenderTarget = {
                colorAttachments: [
                    {
                        view: frame.canvasView,
                        loadOp: 'clear',
                        clearValue: [0, 0, 0, 1],
                        storeOp: 'store',
                    },
                ],
            };
            const bg = this.bindGroupFor(sceneView, passthroughSlot.paramsBuffer);
            frame.render(target, 'PostFlow.passthrough', (pass) => {
                pass.bind.setPipeline(passthroughSlot.pipeline).setBindGroup(0, bg);
                pass.draw.vertices(3);
            });
            return;
        }

        // Ping-pong: scene → pp[0] → pp[1] → ... → canvas.
        // Source para o efeito i: scene se i=0, senão pp[(i-1) % 2].
        // Destino para o efeito i: canvas se i = enabled.length-1, senão pp[i % 2].
        for (let i = 0; i < enabled.length; i++) {
            const eff = enabled[i]!;
            const slot = this.ensureSlot(eff);
            const srcView = i === 0 ? sceneView : this.pingpongViews[(i - 1) % 2]!;
            const isLast = i === enabled.length - 1;
            const dstView = isLast ? frame.canvasView : this.pingpongViews[i % 2]!;
            const target: RenderTarget = {
                colorAttachments: [
                    {
                        view: dstView,
                        loadOp: 'clear',
                        clearValue: [0, 0, 0, 1],
                        storeOp: 'store',
                    },
                ],
            };
            const bg = this.bindGroupFor(srcView, slot.paramsBuffer);
            frame.render(target, `PostFlow.${eff.name}`, (pass) => {
                pass.bind.setPipeline(slot.pipeline).setBindGroup(0, bg);
                pass.draw.vertices(3);
            });
        }
    }

    private passthroughSlot: EffectSlot | null = null;

    private ensurePassthroughSlot(): EffectSlot {
        if (this.passthroughSlot !== null) return this.passthroughSlot;
        if (this.shader === null || this.bindLayout === null)
            throw new Error('PostFlow not initialized');
        const paramsBuffer = this.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'post_params:passthrough',
            byteSize: 16,
        });
        const pipeline = this.core.create<RenderPipelineSpec>({
            kind: 'pipeline',
            subkind: 'render',
            discriminator: 'post_pipeline:passthrough',
            layouts: [this.bindLayout],
            vertex: { shader: this.shader, entryPoint: 'vs_fullscreen' },
            fragment: {
                shader: this.shader,
                entryPoint: 'fs_passthrough',
                targets: [{ format: this.core.canvasFormat }],
            },
            primitive: { topology: 'triangle-list' },
        });
        this.passthroughSlot = {
            effect: null as unknown as PostProcessEffect,
            pipeline,
            paramsBuffer,
        };
        return this.passthroughSlot;
    }
}
