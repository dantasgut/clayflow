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
import { Flow } from '../../scene/flows/Flow';
import type { Phase } from '../../scene/flows/Flow';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { UiTree } from '../ui/UiTree';
import { UiPanel } from '../ui/UiPanel';
import { UiButton } from '../ui/UiButton';
import { UiSlider } from '../ui/UiSlider';
import { UiText } from '../ui/UiText';
import type { UiElement } from '../ui/UiElement';
import type { LoadedFont } from '../assets/FontLoader';
import uiWGSL from './ui.wgsl?raw';

const QUAD_BYTES = 64;
const MAX_QUADS = 1024;

interface UiQuadCpu {
    rect: [number, number, number, number];
    color: [number, number, number, number];
    uv: [number, number, number, number];
    textured: number;
}

export class UIFlow extends Flow {
    readonly type = 'UIFlow';
    readonly bodyType = '';
    readonly phase: Phase = 'ui';

    private readonly tree = new UiTree();

    private screenBuffer: UniformBufferSpec | null = null;
    private quadsBuffer: StorageBufferSpec | null = null;
    private layout: LayoutSpec | null = null;
    private bindGroup: BindGroupSpec | null = null;
    private shader: ShaderModuleSpec | null = null;
    private pipeline: RenderPipelineSpec | null = null;
    private quadCount = 0;

    private font: LoadedFont | null = null;
    private atlasTexture: TextureSpec | null = null;
    private atlasView: TextureViewSpec | null = null;
    private atlasSampler: SamplerSpec | null = null;
    private dummyAtlasTexture: TextureSpec | null = null;
    private dummyAtlasView: TextureViewSpec | null = null;

    constructor(private readonly core: EngineCore, private readonly canvas: HTMLCanvasElement) {
        super();
    }

    get ui(): UiTree {
        return this.tree;
    }

    setFont(font: LoadedFont): this {
        this.font = font;
        if (font.atlas !== null && this.core !== undefined) {
            const tex = this.core.create<TextureSpec>({
                kind: 'texture', discriminator: `ui_atlas:${font.family}:${font.fontSize}`,
                width: font.atlasWidth, height: font.atlasHeight, format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            });
            this.atlasTexture = tex;
            this.atlasView = this.core.create<TextureViewSpec>({
                kind: 'textureview', discriminator: `ui_atlas_view:${font.family}:${font.fontSize}`,
                source: tex, format: 'rgba8unorm',
            });
            this.uploadAtlas(font.atlas, font.atlasWidth, font.atlasHeight, tex);
            this.bindGroup = null;
        }
        return this;
    }

    private uploadAtlas(bitmap: ImageBitmap, width: number, height: number, _tex: TextureSpec): void {
        // Convert ImageBitmap → Uint8Array (RGBA) via OffscreenCanvas, then writeTexture.
        if (typeof OffscreenCanvas === 'undefined') return;
        const oc = new OffscreenCanvas(width, height);
        const ctx = oc.getContext('2d');
        if (ctx === null) return;
        ctx.drawImage(bitmap, 0, 0);
        const imgData = ctx.getImageData(0, 0, width, height);
        this.core.writeTexture(
            _tex,
            new Uint8Array(imgData.data.buffer),
            { bytesPerRow: width * 4, rowsPerImage: height },
            { width, height, depthOrArrayLayers: 1 },
        );
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [{
            id: 'pipeline_ui_quads', role: 'render',
            shaderSource: uiWGSL,
            entryPoints: ['vs_main', 'fs_main'],
            consumes: [],
        }];
    }

    override isReady(): boolean {
        return this.tree.root.children.length > 0;
    }

    private ensureDummyAtlas(): void {
        if (this.dummyAtlasTexture !== null) return;
        this.dummyAtlasTexture = this.core.create<TextureSpec>({
            kind: 'texture', discriminator: 'ui_atlas_dummy',
            width: 1, height: 1, format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.dummyAtlasView = this.core.create<TextureViewSpec>({
            kind: 'textureview', discriminator: 'ui_atlas_dummy_view',
            source: this.dummyAtlasTexture, format: 'rgba8unorm',
        });
        this.core.writeTexture(this.dummyAtlasTexture, new Uint8Array([255, 255, 255, 255]),
            { bytesPerRow: 4, rowsPerImage: 1 },
            { width: 1, height: 1, depthOrArrayLayers: 1 },
        );
    }

    private ensureGpuObjects(): void {
        if (this.shader === null) this.shader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'ui_shader', source: uiWGSL });
        if (this.screenBuffer === null) this.screenBuffer = this.core.create<UniformBufferSpec>({ kind: 'buffer', subkind: 'uniform', discriminator: 'ui_screen', byteSize: 16 });
        if (this.quadsBuffer === null) this.quadsBuffer = this.core.create<StorageBufferSpec>({ kind: 'buffer', subkind: 'storage', discriminator: 'ui_quads', byteSize: MAX_QUADS * QUAD_BYTES });
        if (this.atlasSampler === null) {
            this.atlasSampler = this.core.create<SamplerSpec>({
                kind: 'sampler', discriminator: 'ui_atlas_sampler',
                desc: { magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' },
            });
        }
        this.ensureDummyAtlas();
        if (this.layout === null) {
            this.layout = this.core.create<LayoutSpec>({
                kind: 'layout', discriminator: 'ui_layout',
                entries: [
                    { binding: 0, visibility: GPUShaderStage.VERTEX, kind: 'buffer', type: 'uniform' },
                    { binding: 1, visibility: GPUShaderStage.VERTEX, kind: 'buffer', type: 'read-only-storage' },
                    { binding: 2, visibility: GPUShaderStage.FRAGMENT, kind: 'texture', sampleType: 'float', viewDimension: '2d', multisampled: false },
                    { binding: 3, visibility: GPUShaderStage.FRAGMENT, kind: 'sampler', type: 'filtering' },
                ],
            });
        }
        const view = this.atlasView ?? this.dummyAtlasView;
        if (view === null) return;
        if (this.bindGroup === null) {
            this.bindGroup = this.core.create<BindGroupSpec>({
                kind: 'bindgroup', discriminator: `ui_bg:${view.discriminator ?? 'd'}`,
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
                kind: 'pipeline', subkind: 'render', discriminator: 'ui_pipeline',
                layouts: [this.layout],
                vertex: { shader: this.shader, entryPoint: 'vs_main' },
                fragment: { shader: this.shader, entryPoint: 'fs_main', targets: [{ format: this.core.canvasFormat, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
                primitive: { topology: 'triangle-list' },
            });
        }
    }

    private flatten(): UiQuadCpu[] {
        const out: UiQuadCpu[] = [];
        const walk = (el: UiElement): void => {
            if (!el.visible) return;
            if (el instanceof UiPanel) {
                out.push({ rect: [el.bounds.x, el.bounds.y, el.bounds.width, el.bounds.height], color: [...el.background] as [number, number, number, number], uv: [0, 0, 0, 0], textured: 0 });
            } else if (el instanceof UiButton) {
                const c: [number, number, number, number] = el.pressed
                    ? [0.15, 0.15, 0.20, 0.95]
                    : el.hovered
                        ? [0.40, 0.40, 0.50, 0.90]
                        : [0.25, 0.25, 0.30, 0.85];
                out.push({ rect: [el.bounds.x, el.bounds.y, el.bounds.width, el.bounds.height], color: c, uv: [0, 0, 0, 0], textured: 0 });
            } else if (el instanceof UiSlider) {
                out.push({ rect: [el.bounds.x, el.bounds.y, el.bounds.width, el.bounds.height], color: [0.20, 0.20, 0.25, 0.85], uv: [0, 0, 0, 0], textured: 0 });
                const t = (el.value - el.min) / Math.max(el.max - el.min, 1e-6);
                const handleW = 8;
                out.push({ rect: [el.bounds.x + t * (el.bounds.width - handleW), el.bounds.y, handleW, el.bounds.height], color: [0.85, 0.85, 0.95, 1], uv: [0, 0, 0, 0], textured: 0 });
            } else if (el instanceof UiText) {
                this.layoutText(el, out);
            }
            for (const c of el.children) walk(c);
        };
        for (const c of this.tree.root.children) walk(c);
        return out;
    }

    private layoutText(el: UiText, out: UiQuadCpu[]): void {
        if (this.font === null || el.text.length === 0) return;
        const baseSize = this.font.fontSize;
        const scale = el.fontSize / baseSize;
        const lineHeight = baseSize * scale * 1.2;
        const maxWidth = el.bounds.width > 0 ? el.bounds.width : Number.POSITIVE_INFINITY;
        const startX = el.bounds.x;
        let cursorX = startX;
        let cursorY = el.bounds.y;

        // Word-wrap simples por palavras (split em ' ', '\n' começa nova linha).
        // Glifos ausentes usam metade do font-size como advance default.
        const words = el.text.split(/(\s+)/); // mantém whitespace
        for (const word of words) {
            if (word === '') continue;
            if (word === '\n') {
                cursorX = startX;
                cursorY += lineHeight;
                continue;
            }
            const wordWidth = this.measureText(word, scale);
            if (wordWidth + (cursorX - startX) > maxWidth && cursorX > startX && /\S/.test(word)) {
                cursorX = startX;
                cursorY += lineHeight;
            }
            for (const ch of word) {
                const glyph = this.font.glyphs.get(ch);
                if (glyph === undefined) {
                    cursorX += baseSize * 0.5 * scale;
                    continue;
                }
                const w = glyph.width * scale;
                const h = glyph.height * scale;
                out.push({
                    rect: [cursorX, cursorY, w, h],
                    color: [...el.color] as [number, number, number, number],
                    uv: [
                        glyph.x / this.font.atlasWidth,
                        glyph.y / this.font.atlasHeight,
                        (glyph.x + glyph.width) / this.font.atlasWidth,
                        (glyph.y + glyph.height) / this.font.atlasHeight,
                    ],
                    textured: 1,
                });
                cursorX += glyph.advance * scale;
            }
        }
    }

    private measureText(s: string, scale: number): number {
        if (this.font === null) return 0;
        let w = 0;
        for (const ch of s) {
            const glyph = this.font.glyphs.get(ch);
            w += (glyph?.advance ?? this.font.fontSize * 0.5) * scale;
        }
        return w;
    }

    private uploadGeometry(): void {
        if (this.screenBuffer === null || this.quadsBuffer === null) return;
        const screenBytes = new Float32Array([this.canvas.width, this.canvas.height, 0, 0]);
        this.core.write(this.screenBuffer, screenBytes);

        const quads = this.flatten();
        this.quadCount = Math.min(quads.length, MAX_QUADS);
        const buf = new ArrayBuffer(MAX_QUADS * QUAD_BYTES);
        const f32 = new Float32Array(buf);
        for (let i = 0; i < this.quadCount; i++) {
            const q = quads[i]!;
            const base = i * 16;
            f32[base + 0] = q.rect[0]; f32[base + 1] = q.rect[1];
            f32[base + 2] = q.rect[2]; f32[base + 3] = q.rect[3];
            f32[base + 4] = q.color[0]; f32[base + 5] = q.color[1];
            f32[base + 6] = q.color[2]; f32[base + 7] = q.color[3];
            f32[base + 8] = q.uv[0]; f32[base + 9] = q.uv[1];
            f32[base + 10] = q.uv[2]; f32[base + 11] = q.uv[3];
            f32[base + 12] = q.textured;
            f32[base + 13] = 0; f32[base + 14] = 0; f32[base + 15] = 0;
        }
        this.core.write(this.quadsBuffer, new Uint8Array(buf));
    }

    dispatch(frame: Frame): void {
        if (this.tree.root.children.length === 0) return;
        this.ensureGpuObjects();
        if (this.pipeline === null || this.bindGroup === null) return;
        this.uploadGeometry();
        if (this.quadCount === 0) return;

        const target: RenderTarget = {
            colorAttachments: [{
                view: frame.canvasView,
                loadOp: 'load',
                storeOp: 'store',
            }],
        };
        const drawCount = this.quadCount * 6;
        frame.render(target, 'UIFlow', pass => {
            pass.bind.setPipeline(this.pipeline as RenderPipelineSpec).setBindGroup(0, this.bindGroup as BindGroupSpec);
            pass.draw.vertices(drawCount);
        });
    }
}
