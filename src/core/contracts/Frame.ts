import type { ComputePass } from './passes/ComputePass';
import type { RenderPass } from './passes/RenderPass';
import type { RenderTarget } from './render_target/RenderTarget';
import type { AnyBufferSpec } from './specs/ResourceSpec';
import type { StagingBufferSpec } from './specs/StagingBufferSpec';
import type { TextureSpec } from './specs/TextureSpec';
import type { TextureViewSpec } from './specs/TextureViewSpec';

export interface TextureDataLayout {
    readonly bytesPerRow: number;
    readonly rowsPerImage?: number;
    readonly offset?: number;
}

export type Extent3D = readonly [width: number, height?: number, depthOrArrayLayers?: number];

export interface TextureCopyOptions {
    readonly mipLevel?: number;
    readonly origin?: readonly [x: number, y?: number, z?: number];
    readonly aspect?: 'all' | 'depth-only' | 'stencil-only';
}

export interface Frame {
    readonly canvasView: TextureViewSpec;

    compute(body: (pass: ComputePass) => void): void;
    compute(label: string, body: (pass: ComputePass) => void): void;

    render(target: RenderTarget, body: (pass: RenderPass) => void): void;
    render(target: RenderTarget, label: string, body: (pass: RenderPass) => void): void;

    copy(
        src: AnyBufferSpec,
        dst: AnyBufferSpec,
        size: number,
        srcOffset?: number,
        dstOffset?: number,
    ): void;

    copyBufferToTexture(
        src: AnyBufferSpec,
        dst: TextureSpec,
        layout: TextureDataLayout,
        size: Extent3D,
        options?: TextureCopyOptions,
    ): void;

    copyTextureToBuffer(
        src: TextureSpec,
        dst: AnyBufferSpec,
        layout: TextureDataLayout,
        size: Extent3D,
        options?: TextureCopyOptions,
    ): void;

    copyTextureToTexture(
        src: TextureSpec,
        dst: TextureSpec,
        size: Extent3D,
        options?: TextureCopyOptions,
    ): void;

    marker(label: string, body: () => void): void;

    resolveTimestamps(dst: StagingBufferSpec, first: number, count: number): void;
}
