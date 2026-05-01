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

/**
 * Entry no relatório de memória GPU. Cada entry corresponde a um spec
 * cacheado no GpuResourceStore, indexado por hash UUID-v5 do conteúdo
 * do spec.
 */
export interface MemoryUsageEntry {
    /** Hash UUID-v5 do spec (idempotência: mesmo spec = mesmo hash). */
    readonly hash: string;
    /** Categoria do recurso GPU. Apenas buffer/texture contam para totalBytes. */
    readonly kind: 'buffer' | 'texture' | 'other';
    /** Bytes alocados (0 para 'other' — pipelines/layouts/bindgroups têm custo opaco). */
    readonly bytes: number;
    /** Label opcional do spec (e.g. 'rb_pool', 'shadow_depth') — útil em logs. */
    readonly label?: string;
}

/**
 * Snapshot de memória GPU retornado por `EngineCore.memoryUsage()`.
 * `totalBytes = bufferBytes + textureBytes`. Útil para implementar memory
 * budget tracking em apps long-running.
 */
export interface MemoryUsageReport {
    /** Soma dos bytes em GPUBuffers vivos. */
    readonly bufferBytes: number;
    /** Soma dos bytes em GPUTextures vivas (mip levels + array layers + samples). */
    readonly textureBytes: number;
    /** Total geral. */
    readonly totalBytes: number;
    /** Top-N maiores allocations para diagnóstico (default N=5). */
    readonly top: readonly MemoryUsageEntry[];
}

/**
 * Tipo de binding GPU para compute kernels. Mapeia direto para
 * `GPUBindGroupLayoutEntry.buffer.type` no WebGPU.
 *   - `uniform`: UBO read-only no shader (`var<uniform>`).
 *   - `storage`: SSBO read-write (`var<storage, read_write>`).
 *   - `read-only-storage`: SSBO read-only (`var<storage, read>`).
 */
export type ComputeKernelBindingType = 'uniform' | 'storage' | 'read-only-storage';

/**
 * Configuração de um único binding dentro de um bindgroup. Cada binding
 * corresponde a `@binding(N)` no shader WGSL.
 */
export interface ComputeKernelBinding {
    /** Slot do binding dentro do bindgroup (`@binding(N)` no WGSL). */
    readonly binding: number;
    /** Tipo do binding — controla layout e visibilidade no shader. */
    readonly type: ComputeKernelBindingType;
    /** Buffer concreto que ocupa este slot. */
    readonly buffer: UniformBufferSpec | StorageBufferSpec;
}

/**
 * Bindgroup config para multi-set kernels. Cada `ComputeKernelBindGroup` vira
 * um GPU bindgroup separado no slot correspondente do pipeline (group 0, 1, ...).
 */
export interface ComputeKernelBindGroup {
    /** Bindings dentro deste bindgroup (slots `@binding(0)`, `@binding(1)`...). */
    readonly bindings: readonly ComputeKernelBinding[];
}

/**
 * Opções para criar um compute kernel via `EngineCore.compute()` ou
 * `createComputeKernel()`. Encapsula tudo necessário: shader source,
 * entry point e configuração de bindgroups.
 *
 * Use **`bindings`** (single-bindgroup atalho) para casos simples (1 group).
 * Use **`bindGroups`** (multi-bindgroup) quando o kernel WGSL declara
 * `@group(0)`, `@group(1)`, etc.
 */
export interface ComputeKernelOptions {
    /**
     * Prefixo único usado para gerar discriminator de cada artifact
     * (`{prefix}_layout`, `{prefix}_shader`, `{prefix}_pipeline`, `{prefix}_bg`).
     * Mesma string → mesmo specHash → reuso idempotente do GPU object.
     */
    readonly discriminator: string;
    /** WGSL source contendo o entry point (validado por validateWgslReferences). */
    readonly shaderSource: string;
    /** Nome da função WGSL com `@compute @workgroup_size(...)`. */
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
    /**
     * Se true, usa `core.createAsync` para compilar o pipeline em background
     * (sem bloquear o frame). O Flow consumidor deve checar `isReady()` ou
     * tolerar que o pipeline ainda não esteja no store nos primeiros frames.
     */
    readonly preferAsync?: boolean;
}

/**
 * Bag de specs retornado por `EngineCore.compute()` / `createComputeKernel()`.
 * Inclui o pipeline + bindgroups + layouts. Use durante dispatch:
 * ```ts
 * frame.compute('MyFlow.kernel', pass => {
 *     pass.bind.setPipeline(kernel.pipeline);
 *     kernel.bindGroups.forEach((bg, i) => pass.bind.setBindGroup(i, bg));
 *     pass.dispatch.workgroups(N);
 * });
 * ```
 */
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

/**
 * Opções de configuração do canvas swapchain. Aplicadas em `initialize()`
 * e `reconfigureCanvas()` via `GPUCanvasContext.configure()`.
 */
export interface CanvasOptions {
    /**
     * Modo de composição alpha do canvas. `opaque` (default) ignora alpha;
     * `premultiplied` permite blend com elementos HTML por trás.
     */
    readonly alphaMode?: 'opaque' | 'premultiplied';
    /** Color space do canvas. Default: srgb. Use display-p3 para wide-gamut. */
    readonly colorSpace?: 'srgb' | 'display-p3';
}

/**
 * Informação sobre um device-lost event, passada pelo handler registrado
 * via `EngineCore.onDeviceLost(handler)`.
 */
export interface DeviceLostInfo {
    /** Razão do device-lost (`'unknown'` ou `'destroyed'` em GPUDeviceLostReason). */
    readonly reason: GPUDeviceLostReason;
    /** Mensagem do driver descrevendo a causa (driver-specific). */
    readonly message: string;
}

/** Handler chamado quando o GPU device é perdido. */
export type DeviceLostHandler = (info: DeviceLostInfo) => void;

/**
 * EngineCore é a fronteira da Camada 1 (Hardware) — abstração estável
 * sobre o WebGPU device. Todas as operações GPU passam por aqui:
 *   - **Specs como identidade**: `create(spec)` e `destroy(spec)` operam por
 *     hash do conteúdo (idempotência built-in via UUIDv5).
 *   - **Frame-scoped recording**: `record(body)` abre um command encoder e
 *     passa um `Frame` para o body emitir compute/render passes; `submit()`
 *     finaliza e enfileira na queue.
 *   - **Lifecycle resiliente**: `initialize`/`shutdown`, recovery de
 *     device-lost, error scope opt-in, memory budget tracking.
 *
 * Implementação concreta: `GpuEngineCore` (em `core/gpu/`).
 * Camadas 2-4 dependem desta interface, não da implementação.
 */
export interface EngineCore {
    /** Profiler de timestamp-query (no-op se device não suporta a feature). */
    readonly profiler: Profiler;
    /** Formato preferido do canvas (e.g. 'bgra8unorm'). Setado em initialize. */
    readonly canvasFormat: GPUTextureFormat;

    /**
     * Adquire GPUAdapter + GPUDevice (assíncrono) e configura o canvas
     * swapchain. Idempotente quando context já existe — apenas re-aplica
     * canvas/options. Lança se WebGPU não está disponível.
     */
    initialize(canvas?: HTMLCanvasElement, options?: CanvasOptions): Promise<void>;
    /**
     * Re-configura o canvas swapchain (chamado após resize). Não recria o
     * device — usa o existente.
     */
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

    /**
     * Materializa o spec em GPU object e indexa no store interno por specHash.
     * Idempotente: chamadas subsequentes com spec equivalente retornam o
     * spec direto sem recriar o GPU object. Retorna o próprio spec para
     * permitir chaining/storage do consumer.
     */
    create<S extends ResourceSpec>(spec: S): S;
    /**
     * Versão async para pipelines (compute/render). Usa `device.createXxxPipelineAsync()`
     * que compila o shader em background. Para outros kinds, comporta-se como
     * `create()` síncrono.
     */
    createAsync<S extends ResourceSpec>(spec: S): Promise<S>;

    /** Escreve dados CPU → GPU buffer no offset especificado (default 0). */
    write(spec: AnyBufferSpec, data: ArrayBufferView, offset?: number): void;
    /** Escreve dados CPU → GPU texture (uma sub-região definida por size+layout). */
    writeTexture(
        spec: TextureSpec,
        data: ArrayBufferView,
        layout: GPUImageDataLayout,
        size: GPUExtent3DStrict,
    ): void;

    /**
     * Destrói o GPU object associado e remove do store. Chamadas a `create()`
     * com o mesmo spec depois disso vão re-materializar. Use para liberar
     * memória de specs que não são mais referenciados.
     */
    destroy(spec: ResourceSpec): void;
    /**
     * Lê staging buffer GPU → CPU (mapAsync + getMappedRange + unmap).
     * Retorna ArrayBuffer com cópia dos dados.
     */
    readback(spec: StagingBufferSpec): Promise<ArrayBuffer>;

    /**
     * Abre um command encoder, passa um Frame para o body emitir comandos,
     * fecha o encoder ao final do callback. Use `frame.compute(...)` ou
     * `frame.render(target, ...)` dentro do body. Após record retornar,
     * chame `submit()` para enfileirar na queue GPU.
     */
    record(body: (frame: Frame) => void): void;
    record(label: string, body: (frame: Frame) => void): void;
    /** Enfileira o último command buffer construído por `record()` na queue GPU. */
    submit(): void;

    /**
     * Wrap um body em error scope GPU. Erros (validation/oom/internal) viram
     * Promise rejection ao invés de logs no console. Útil para captureErrors
     * em runtime via Application option.
     */
    withErrorScope<T>(filter: GPUErrorFilter, body: () => T | Promise<T>): Promise<T>;
    /**
     * Destrói o GPU device + libera todos os recursos. Após shutdown, o core
     * volta a estado uninitialized — pode ser re-inicializado via `initialize()`.
     */
    shutdown(): void;
}
