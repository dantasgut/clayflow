import type {
    BindGroupSpec,
    EngineCore,
    Frame,
    LayoutSpec,
    RenderPipelineSpec,
    RenderTarget,
    SamplerSpec,
    ShaderModuleSpec,
    StorageBufferSpec,
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../core/contracts/index';
import type { LoadedFont } from '../assets/FontLoader';
import type { UiQuadCpu } from './flatten/UiQuadCpu';
import { composeWgsl } from '../../scene/shaders/composeWgsl';
import { ui } from '../flows/shaders';
import { ScreenParamsSchema, UiQuadSchema } from '../flows/renderSchemas';

const MAX_QUADS = 1024;

/**
 * Encapsula todo o pipeline GPU do UI: shader, layouts, atlas (real ou dummy),
 * sampler, buffers de screen + quads, bind group e render pipeline.
 *
 * Uso:
 *   const gpu = new UiGpuPipeline(core, canvas);
 *   gpu.setFont(loadedFont);             // opcional — habilita texto
 *   gpu.upload(quads);                   // por frame
 *   gpu.draw(frame, target);             // emite o draw call
 */
export class UiGpuPipeline {
    private screenBuffer: UniformBufferSpec | null = null;
    private quadsBuffer: StorageBufferSpec | null = null;
    private layout: LayoutSpec | null = null;
    private bindGroup: BindGroupSpec | null = null;
    private shader: ShaderModuleSpec | null = null;
    private pipeline: RenderPipelineSpec | null = null;
    private quadCount = 0;

    private atlasTexture: TextureSpec | null = null;
    private atlasView: TextureViewSpec | null = null;
    private atlasSampler: SamplerSpec | null = null;
    private dummyAtlasTexture: TextureSpec | null = null;
    private dummyAtlasView: TextureViewSpec | null = null;

    constructor(
        private readonly core: EngineCore,
        private readonly canvas: HTMLCanvasElement,
    ) {}

    /** Libera todos os objetos de GPU do pipeline de UI. */
    dispose(): void {
        const owned = [
            this.bindGroup,
            this.pipeline,
            this.shader,
            this.layout,
            this.screenBuffer,
            this.quadsBuffer,
            this.atlasView,
            this.atlasTexture,
            this.atlasSampler,
            this.dummyAtlasView,
            this.dummyAtlasTexture,
        ];
        for (const spec of owned) if (spec !== null) this.core.destroy(spec);
        this.bindGroup = null;
        this.pipeline = null;
        this.shader = null;
        this.layout = null;
        this.screenBuffer = null;
        this.quadsBuffer = null;
        this.atlasView = null;
        this.atlasTexture = null;
        this.atlasSampler = null;
        this.dummyAtlasView = null;
        this.dummyAtlasTexture = null;
    }

    setFont(font: LoadedFont): void {
        if (font.atlas === null) return;
        // Troca de fonte: o atlas anterior e o bind group que o liga são liberados.
        if (this.bindGroup !== null) this.core.destroy(this.bindGroup);
        if (this.atlasView !== null) this.core.destroy(this.atlasView);
        if (this.atlasTexture !== null) this.core.destroy(this.atlasTexture);
        const tex = this.core.create<TextureSpec>({
            kind: 'texture',
            discriminator: `ui_atlas:${font.family}:${font.fontSize}`,
            width: font.atlasWidth,
            height: font.atlasHeight,
            format: 'rgba8unorm',
            usage:
                GPUTextureUsage.TEXTURE_BINDING
                | GPUTextureUsage.COPY_DST
                | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.atlasTexture = tex;
        this.atlasView = this.core.create<TextureViewSpec>({
            kind: 'textureview',
            discriminator: `ui_atlas_view:${font.family}:${font.fontSize}`,
            source: tex,
            format: 'rgba8unorm',
        });
        this.uploadAtlas(font.atlas, font.atlasWidth, font.atlasHeight);
        this.bindGroup = null; // reconstrói com o atlas real
    }

    private uploadAtlas(bitmap: ImageBitmap, width: number, height: number): void {
        if (typeof OffscreenCanvas === 'undefined' || this.atlasTexture === null) return;
        const oc = new OffscreenCanvas(width, height);
        const ctx = oc.getContext('2d');
        if (ctx === null) return;
        ctx.drawImage(bitmap, 0, 0);
        const imgData = ctx.getImageData(0, 0, width, height);
        this.core.writeTexture(
            this.atlasTexture,
            new Uint8Array(imgData.data.buffer),
            { bytesPerRow: width * 4, rowsPerImage: height },
            { width, height, depthOrArrayLayers: 1 },
        );
    }

    private ensureDummyAtlas(): void {
        if (this.dummyAtlasTexture !== null) return;
        this.dummyAtlasTexture = this.core.create<TextureSpec>({
            kind: 'texture',
            discriminator: 'ui_atlas_dummy',
            width: 1,
            height: 1,
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.dummyAtlasView = this.core.create<TextureViewSpec>({
            kind: 'textureview',
            discriminator: 'ui_atlas_dummy_view',
            source: this.dummyAtlasTexture,
            format: 'rgba8unorm',
        });
        this.core.writeTexture(
            this.dummyAtlasTexture,
            new Uint8Array([255, 255, 255, 255]),
            { bytesPerRow: 4, rowsPerImage: 1 },
            { width: 1, height: 1, depthOrArrayLayers: 1 },
        );
    }

    ensureGpuObjects(): void {
        if (this.shader === null)
            this.shader = this.core.create<ShaderModuleSpec>({ ...composeWgsl(ui).spec });
        if (this.screenBuffer === null)
            this.screenBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: 'ui_screen',
                byteSize: ScreenParamsSchema.stride,
            });
        if (this.quadsBuffer === null)
            this.quadsBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: 'ui_quads',
                byteSize: MAX_QUADS * UiQuadSchema.stride,
            });
        if (this.atlasSampler === null)
            this.atlasSampler = this.core.create<SamplerSpec>({
                kind: 'sampler',
                discriminator: 'ui_atlas_sampler',
                desc: {
                    magFilter: 'linear',
                    minFilter: 'linear',
                    addressModeU: 'clamp-to-edge',
                    addressModeV: 'clamp-to-edge',
                },
            });
        this.ensureDummyAtlas();
        if (this.layout === null) {
            this.layout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'ui_layout',
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX,
                        kind: 'buffer',
                        type: 'uniform',
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.VERTEX,
                        kind: 'buffer',
                        type: 'read-only-storage',
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.FRAGMENT,
                        kind: 'texture',
                        sampleType: 'float',
                        viewDimension: '2d',
                        multisampled: false,
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.FRAGMENT,
                        kind: 'sampler',
                        type: 'filtering',
                    },
                ],
            });
        }
        const view = this.atlasView ?? this.dummyAtlasView;
        if (view === null) return;
        if (this.bindGroup === null) {
            this.bindGroup = this.core.create<BindGroupSpec>({
                kind: 'bindgroup',
                discriminator: `ui_bg:${view.discriminator ?? 'd'}`,
                layout: this.layout,
                bindings: [
                    { binding: 0, kind: 'buffer', buffer: this.screenBuffer },
                    { binding: 1, kind: 'buffer', buffer: this.quadsBuffer },
                    { binding: 2, kind: 'textureview', view },
                    { binding: 3, kind: 'sampler', sampler: this.atlasSampler },
                ],
            });
        }
        if (this.pipeline === null) {
            this.pipeline = this.core.create<RenderPipelineSpec>({
                kind: 'pipeline',
                subkind: 'render',
                discriminator: 'ui_pipeline',
                layouts: [this.layout],
                vertex: { shader: this.shader, entryPoint: 'vs_main' },
                fragment: {
                    shader: this.shader,
                    entryPoint: 'fs_main',
                    targets: [
                        {
                            format: this.core.canvasFormat,
                            blend: {
                                color: {
                                    srcFactor: 'src-alpha',
                                    dstFactor: 'one-minus-src-alpha',
                                    operation: 'add',
                                },
                                alpha: {
                                    srcFactor: 'one',
                                    dstFactor: 'one-minus-src-alpha',
                                    operation: 'add',
                                },
                            },
                        },
                    ],
                },
                primitive: { topology: 'triangle-list' },
            });
        }
    }

    upload(quads: readonly UiQuadCpu[]): void {
        if (this.screenBuffer === null || this.quadsBuffer === null) return;
        this.core.write(
            this.screenBuffer,
            ScreenParamsSchema.pack({ size: [this.canvas.width, this.canvas.height] }),
        );

        this.quadCount = Math.min(quads.length, MAX_QUADS);
        const buf = new ArrayBuffer(MAX_QUADS * UiQuadSchema.stride);
        for (let i = 0; i < this.quadCount; i++) {
            const q = quads[i]!;
            UiQuadSchema.packInto(buf, i * UiQuadSchema.stride, {
                rect: q.rect,
                color: q.color,
                uv: q.uv,
                textured: [q.textured, 0, 0, 0],
            });
        }
        this.core.write(this.quadsBuffer, new Uint8Array(buf));
    }

    draw(frame: Frame, target: RenderTarget): void {
        if (this.pipeline === null || this.bindGroup === null || this.quadCount === 0) return;
        const drawCount = this.quadCount * 6;
        const pipeline = this.pipeline;
        const bindGroup = this.bindGroup;
        frame.render(target, 'UIFlow', (pass) => {
            pass.bind.setPipeline(pipeline).setBindGroup(0, bindGroup);
            pass.draw.vertices(drawCount);
        });
    }

    get hasQuads(): boolean {
        return this.quadCount > 0;
    }
}
