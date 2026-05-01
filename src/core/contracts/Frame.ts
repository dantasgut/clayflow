import type { ComputePass } from './passes/ComputePass';
import type { RenderPass } from './passes/RenderPass';
import type { RenderTarget } from './render_target/RenderTarget';
import type { AnyBufferSpec } from './specs/ResourceSpec';
import type { StagingBufferSpec } from './specs/StagingBufferSpec';
import type { TextureSpec } from './specs/TextureSpec';
import type { TextureViewSpec } from './specs/TextureViewSpec';

/**
 * Layout de dados em buffer→texture / texture→buffer copies. Mapeia direto
 * pra `GPUTexelCopyBufferLayout` no WebGPU.
 */
export interface TextureDataLayout {
    /** Bytes entre o início de cada row (deve ser múltiplo de 256 quando >0). */
    readonly bytesPerRow: number;
    /** Rows entre o início de cada image (slice 3D ou array layer). */
    readonly rowsPerImage?: number;
    /** Offset em bytes desde o início do buffer. Default: 0. */
    readonly offset?: number;
}

/**
 * Tupla de dimensões 3D. `[width, height?, depthOrArrayLayers?]` —
 * dimensões omitidas defaultam para 1.
 */
export type Extent3D = readonly [width: number, height?: number, depthOrArrayLayers?: number];

/**
 * Options de copy entre texturas/buffers — controla mip level, offset
 * espacial e aspect (depth/stencil/all) para texturas combinadas.
 */
export interface TextureCopyOptions {
    /** Mip level de origem ou destino. Default: 0. */
    readonly mipLevel?: number;
    /** Offset 3D dentro da textura. Default: [0, 0, 0]. */
    readonly origin?: readonly [x: number, y?: number, z?: number];
    /**
     * Aspect a copiar:
     *   - `all`: depth+stencil (default).
     *   - `depth-only`: apenas componente depth.
     *   - `stencil-only`: apenas componente stencil.
     */
    readonly aspect?: 'all' | 'depth-only' | 'stencil-only';
}

/**
 * Frame é o handle passado pelo `core.record(body)` ao body. Encapsula
 * o command encoder ativo e expõe APIs para emitir compute/render passes,
 * copies entre buffers/texturas, debug markers e resolve de timestamps.
 *
 * Lifecycle: válido apenas dentro do callback `body` de `record`. Após
 * record retornar, o Frame é descartado e referências viram dangling.
 */
export interface Frame {
    /**
     * View do swapchain attachable do canvas. Use como render target
     * para escrever direto no canvas (após PostFlow no pipeline padrão).
     */
    readonly canvasView: TextureViewSpec;

    /** Abre um compute pass (sem label) e passa para o body. */
    compute(body: (pass: ComputePass) => void): void;
    /** Versão labeled — útil pra Chrome DevTools / RenderDoc / profiler. */
    compute(label: string, body: (pass: ComputePass) => void): void;

    /** Abre um render pass com `target` (color/depth attachments) e passa para o body. */
    render(target: RenderTarget, body: (pass: RenderPass) => void): void;
    /** Versão labeled. */
    render(target: RenderTarget, label: string, body: (pass: RenderPass) => void): void;

    /**
     * Copy de buffer → buffer dentro do command encoder. Use para readback
     * pipelines (storage → staging) e para cell_cursor=cell_start no NS.
     */
    copy(
        src: AnyBufferSpec,
        dst: AnyBufferSpec,
        size: number,
        srcOffset?: number,
        dstOffset?: number,
    ): void;

    /** Buffer → Texture copy. Útil para upload de bitmap data já em buffer. */
    copyBufferToTexture(
        src: AnyBufferSpec,
        dst: TextureSpec,
        layout: TextureDataLayout,
        size: Extent3D,
        options?: TextureCopyOptions,
    ): void;

    /** Texture → Buffer copy. Útil para readback de render target para CPU. */
    copyTextureToBuffer(
        src: TextureSpec,
        dst: AnyBufferSpec,
        layout: TextureDataLayout,
        size: Extent3D,
        options?: TextureCopyOptions,
    ): void;

    /** Texture → Texture copy. Para mip generation manual ou downscale. */
    copyTextureToTexture(
        src: TextureSpec,
        dst: TextureSpec,
        size: Extent3D,
        options?: TextureCopyOptions,
    ): void;

    /**
     * Debug marker — agrupa comandos no encoder para visualização em
     * RenderDoc/PIX. Não tem efeito em runtime, só metadado.
     */
    marker(label: string, body: () => void): void;

    /**
     * Resolve timestamp queries do Profiler para um staging buffer.
     * Chamado uma vez por frame após todos os passes que usaram timestamps.
     * No-op se device não suporta `timestamp-query` feature.
     */
    resolveTimestamps(dst: StagingBufferSpec, first: number, count: number): void;
}
