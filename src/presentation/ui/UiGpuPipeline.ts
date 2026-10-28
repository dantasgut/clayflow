import type {
    EngineCore,
    SamplerSpec,
    StorageBufferSpec,
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { BindingSource } from '../../scene/flows/FlowBinding';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { LoadedFont } from './font';
import type { UiQuadCpu } from './flatten/UiQuadCpu';
import { ScreenParamsSchema, UiQuadSchema } from '../flows/renderSchemas';
import { uiResources } from '../flows/shaders';

const MAX_QUADS = 1024;

/**
 * Recursos de GPU privados da UI: parâmetros de tela, buffer de quads, atlas da fonte (ou um texel branco enquanto não
 * há fonte) e sampler. Ligados ao pipeline do `UIFlow` pelos recursos declarados (`uiResources`: `screen`, `quads`,
 * `atlas`, `atlas_smp`); o pipeline, o layout e o bind group são da C2.
 *
 * Uso:
 *   const gpu = new UiGpuPipeline(core);
 *   flow.bindings = gpu.sources();      // fontes privadas
 *   gpu.setFont(loadedFont);             // opcional — habilita texto; religar `atlas` (atlasChanged)
 *   gpu.upload(quads, size);             // antes da gravação
 */
export class UiGpuPipeline {
    private readonly screenBuffer: UniformBufferSpec;
    private readonly quadsBuffer: StorageBufferSpec;
    private readonly sampler: SamplerSpec;
    private readonly dummyAtlasTexture: TextureSpec;
    private readonly dummyAtlasView: TextureViewSpec;
    private atlasTexture: TextureSpec | null = null;
    private atlasView: TextureViewSpec | null = null;
    private screenSize: readonly [number, number] = [0, 0];
    private count = 0;
    /** O atlas mudou desde o último `takeAtlasChange` (precisa ser religado). */
    private atlasDirty = false;

    constructor(private readonly core: EngineCore) {
        this.screenBuffer = core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'ui_screen',
            byteSize: ScreenParamsSchema.stride,
        });
        this.quadsBuffer = core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'ui_quads',
            byteSize: MAX_QUADS * UiQuadSchema.stride,
        });
        this.sampler = core.create<SamplerSpec>({
            kind: 'sampler',
            discriminator: 'ui_atlas_sampler',
            desc: {
                magFilter: 'linear',
                minFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge',
            },
        });
        this.dummyAtlasTexture = core.create<TextureSpec>({
            kind: 'texture',
            discriminator: 'ui_atlas_dummy',
            width: 1,
            height: 1,
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.dummyAtlasView = core.create<TextureViewSpec>({
            kind: 'textureview',
            discriminator: 'ui_atlas_dummy_view',
            source: this.dummyAtlasTexture,
            format: 'rgba8unorm',
        });
        core.writeTexture(
            this.dummyAtlasTexture,
            new Uint8Array([255, 255, 255, 255]),
            { bytesPerRow: 4, rowsPerImage: 1 },
            { width: 1, height: 1, depthOrArrayLayers: 1 },
        );
    }

    /** Fontes privadas do pipeline de UI, por recurso declarado. */
    sources(): ReadonlyMap<WgslResource, BindingSource> {
        return new Map<WgslResource, BindingSource>([
            [uiResources.screen, this.screenBuffer],
            [uiResources.quads, this.quadsBuffer],
            [uiResources.atlas, this.atlasView ?? this.dummyAtlasView],
            [uiResources.sampler, this.sampler],
        ]);
    }

    /** O atlas mudou desde a última chamada (o chamador religa `atlas`)? */
    takeAtlasChange(): TextureViewSpec | undefined {
        if (!this.atlasDirty) return undefined;
        this.atlasDirty = false;
        return this.atlasView ?? this.dummyAtlasView;
    }

    /**
     * Troca o atlas pelo da fonte e libera o anterior; o Flow religa `atlas` (`takeAtlasChange`) antes da próxima
     * gravação, então nenhum bind group gravado usa o atlas liberado.
     */
    setFont(font: LoadedFont): void {
        if (font.atlas === null) return;
        const previous = [this.atlasView, this.atlasTexture];
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
        this.atlasDirty = true;
        for (const spec of previous) if (spec !== null) this.core.destroy(spec);
    }

    /** Envia os quads (até `MAX_QUADS`) e, quando a tela muda, o tamanho dela. */
    upload(quads: readonly UiQuadCpu[], size: readonly [number, number]): void {
        if (size[0] !== this.screenSize[0] || size[1] !== this.screenSize[1]) {
            this.core.write(
                this.screenBuffer,
                ScreenParamsSchema.pack({ size: [size[0], size[1]] }),
            );
            this.screenSize = size;
        }
        this.count = Math.min(quads.length, MAX_QUADS);
        if (this.count === 0) return;
        const buf = new ArrayBuffer(this.count * UiQuadSchema.stride);
        for (let i = 0; i < this.count; i++) {
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

    /** Quads enviados no último `upload`. */
    get quadCount(): number {
        return this.count;
    }

    /** Libera todos os objetos de GPU da UI. */
    dispose(): void {
        for (const spec of [
            this.screenBuffer,
            this.quadsBuffer,
            this.atlasView,
            this.atlasTexture,
            this.sampler,
            this.dummyAtlasView,
            this.dummyAtlasTexture,
        ]) {
            if (spec !== null) this.core.destroy(spec);
        }
    }

    private uploadAtlas(pixels: Uint8Array, width: number, height: number): void {
        if (this.atlasTexture === null) return;
        this.core.writeTexture(
            this.atlasTexture,
            pixels,
            { bytesPerRow: width * 4, rowsPerImage: height },
            { width, height, depthOrArrayLayers: 1 },
        );
    }
}
