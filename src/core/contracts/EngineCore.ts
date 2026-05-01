import type { Frame } from './Frame';
import type { Profiler } from './Profiler';
import type { BindGroupSpec } from './specs/BindGroupSpec';
import type { ComputePipelineSpec } from './specs/ComputePipelineSpec';
import type { LayoutSpec } from './specs/LayoutSpec';
import type { AnyBufferSpec, ResourceSpec } from './specs/ResourceSpec';
import type { StagingBufferSpec } from './specs/StagingBufferSpec';
import type { StorageBufferSpec } from './specs/StorageBufferSpec';
import type { TextureSpec } from './specs/TextureSpec';
import type { UniformBufferSpec } from './specs/UniformBufferSpec';

export interface MemoryUsageEntry {
    readonly hash: string;
    readonly kind: 'buffer' | 'texture' | 'other';
    readonly bytes: number;
    readonly label?: string;
}

export interface MemoryUsageReport {
    readonly bufferBytes: number;
    readonly textureBytes: number;
    readonly totalBytes: number;
    readonly top: readonly MemoryUsageEntry[];
}

export type ComputeKernelBindingType = 'uniform' | 'storage' | 'read-only-storage';

export interface ComputeKernelBinding {
    readonly binding: number;
    readonly type: ComputeKernelBindingType;
    readonly buffer: UniformBufferSpec | StorageBufferSpec;
}

/**
 * Bindgroup config para multi-set kernels. Cada `ComputeKernelBindGroup` vira
 * um GPU bindgroup separado no slot correspondente do pipeline (group 0, 1, ...).
 */
export interface ComputeKernelBindGroup {
    readonly bindings: readonly ComputeKernelBinding[];
}

export interface ComputeKernelOptions {
    readonly discriminator: string;
    readonly shaderSource: string;
    readonly entryPoint: string;
    /**
     * Single-bindgroup form (atalho para casos simples). Use OU `bindings` OU
     * `bindGroups`, não os dois.
     */
    readonly bindings?: readonly ComputeKernelBinding[];
    /**
     * Multi-bindgroup form. Cada entry vira um GPU bindgroup no slot
     * correspondente (`bindGroups[0]` → @group(0), [1] → @group(1)...).
     */
    readonly bindGroups?: readonly ComputeKernelBindGroup[];
    readonly preferAsync?: boolean;
}

export interface ComputeKernel {
    readonly pipeline: ComputePipelineSpec;
    /** Primeiro bindgroup. Atalho para casos single-set; equivale a `bindGroups[0]`. */
    readonly bindGroup: BindGroupSpec;
    /** Primeiro layout. Atalho equivalente a `layouts[0]`. */
    readonly layout: LayoutSpec;
    /** Todos os bindgroups (ordem = slot do pipeline). */
    readonly bindGroups: readonly BindGroupSpec[];
    /** Todos os layouts (ordem = slot do pipeline). */
    readonly layouts: readonly LayoutSpec[];
}

export interface CanvasOptions {
    readonly alphaMode?: 'opaque' | 'premultiplied';
    readonly colorSpace?: 'srgb' | 'display-p3';
}

export interface DeviceLostInfo {
    readonly reason: GPUDeviceLostReason;
    readonly message: string;
}

export type DeviceLostHandler = (info: DeviceLostInfo) => void;

export interface EngineCore {
    readonly profiler: Profiler;
    readonly canvasFormat: GPUTextureFormat;

    initialize(canvas?: HTMLCanvasElement, options?: CanvasOptions): Promise<void>;
    reconfigureCanvas(options?: CanvasOptions): void;

    /**
     * Registra handler para device-lost. Disparado quando o GPU device é perdido
     * (driver crash, reset, OOM no nível de driver). Retorna função de unsubscribe.
     * Após o handler rodar, o store interno está limpo e o próximo `initialize()`
     * (ou `requestRecover()`) cria um device novo.
     */
    onDeviceLost(handler: DeviceLostHandler): () => void;

    /**
     * Recupera após device-lost: cria um GPUAdapter+GPUDevice novos e re-attacha
     * o canvas. Resources cacheados precisam ser recriados pelos sistemas
     * consumidores (ResourceSystem reage a poolReallocated, e Flows checam
     * isReady()).
     */
    requestRecover(canvas?: HTMLCanvasElement, options?: CanvasOptions): Promise<void>;

    /**
     * Bytes alocados em GPU memory neste momento. `top` lista as N maiores
     * allocations (default N=5) para diagnóstico. Apenas buffers e texturas
     * contam — pipelines/layouts/bindgroups são reportados como kind='other'
     * com bytes=0 (custo opaco).
     */
    memoryUsage(topN?: number): MemoryUsageReport;

    /**
     * Higher-level helper para compute kernels paramétricos. Encapsula a
     * sequência shader + layout + bindgroup + pipeline em 1 chamada. Equivalente
     * a `createComputeKernel(this, opts)` (Camada 2) — exposto na interface
     * para descoberta direta a partir do core. Use para casos simples; para
     * custom layouts ou multi-kernel-shared-bindings, use `create()` baixo nível.
     */
    compute(opts: ComputeKernelOptions): ComputeKernel;

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
