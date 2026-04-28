import type { Frame } from './Frame';
import type { Profiler } from './Profiler';
import type { AnyBufferSpec, ResourceSpec } from './specs/ResourceSpec';
import type { StagingBufferSpec } from './specs/StagingBufferSpec';
import type { TextureSpec } from './specs/TextureSpec';

export interface CanvasOptions {
    readonly alphaMode?: 'opaque' | 'premultiplied';
    readonly colorSpace?: 'srgb' | 'display-p3';
}

export interface EngineCore {
    readonly profiler: Profiler;
    readonly canvasFormat: GPUTextureFormat;

    initialize(canvas?: HTMLCanvasElement, options?: CanvasOptions): Promise<void>;
    reconfigureCanvas(options?: CanvasOptions): void;

    create<S extends ResourceSpec>(spec: S): S;
    createAsync<S extends ResourceSpec>(spec: S): Promise<S>;

    write(spec: AnyBufferSpec, data: ArrayBufferView, offset?: number): void;
    writeTexture(
        spec: TextureSpec,
        data: ArrayBufferView,
        layout: GPUImageDataLayout,
        size: GPUExtent3DStrict,
    ): void;

    destroy(spec: ResourceSpec): void;
    readback(spec: StagingBufferSpec): Promise<ArrayBuffer>;

    record(body: (frame: Frame) => void): void;
    record(label: string, body: (frame: Frame) => void): void;
    submit(): void;

    withErrorScope<T>(filter: GPUErrorFilter, body: () => T | Promise<T>): Promise<T>;
    shutdown(): void;
}
