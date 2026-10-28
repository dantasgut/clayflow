import type { DeviceCapabilities, DeviceOptions } from './DeviceOptions';
import type { Frame } from './Frame';
import type { FrameGpuTiming, FrameStats } from './FrameStats';
import type { PlatformAdapter, PresentationSurface } from './PlatformAdapter';
import type { Profiler } from './Profiler';
import type { AnyBufferSpec, ResourceSpec } from './specs/ResourceSpec';
import type { ShaderModuleSpec } from './specs/ShaderModuleSpec';
import type { StagingBufferSpec } from './specs/StagingBufferSpec';
import type { TextureSpec } from './specs/TextureSpec';

/** Mensagem do compilador de shader (`GPUShaderModule.getCompilationInfo()`); linha e coluna a partir de 1. */
export interface ShaderMessage {
    /** Gravidade da mensagem. */
    readonly type: 'error' | 'warning' | 'info';
    /** Texto do compilador. */
    readonly message: string;
    /** Linha no fonte do shader (0 quando o compilador não informa). */
    readonly line: number;
    /** Coluna na linha (0 quando o compilador não informa). */
    readonly column: number;
}

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
    /**
     * Mapeamento de tons da tela (spec 011): `standard` (default) corta em [0, 1]; `extended` deixa valores acima do
     * branco de referência chegarem a uma tela HDR. Sem suporte do navegador ou da tela, a configuração volta a
     * `standard` com o formato preferido, e `canvasOutput.toneMapping` diz o que valeu.
     */
    readonly toneMapping?: 'standard' | 'extended';
    /** Formato do canvas: `preferred` (default, o de `getPreferredCanvasFormat`) ou `rgba16float` (saída HDR). */
    readonly format?: 'preferred' | 'rgba16float';
    /**
     * Permite ler o quadro apresentado (`readCanvas`, spec 034): a textura do canvas ganha o uso de cópia. Para
     * ferramentas (gravação de vídeo, comparação de imagens); sem ela o canvas fica só como alvo de desenho.
     */
    readonly capture?: boolean;
}

/** O quadro apresentado lido da GPU (`EngineCore.readCanvas`, spec 034), linhas sem preenchimento. */
export interface CanvasPixels {
    readonly width: number;
    readonly height: number;
    /** Formato da textura do canvas (`bgra8unorm`, `rgba8unorm` ou `rgba16float`). */
    readonly format: GPUTextureFormat;
    /** Bytes por pixel (4 nos formatos de 8 bits, 8 no `rgba16float`). */
    readonly bytesPerPixel: number;
    /** `width · height · bytesPerPixel` bytes, linha a linha, de cima para baixo. */
    readonly data: Uint8Array;
}

/** Saída do canvas efetivamente configurada (spec 011): o formato e o mapeamento de tons da tela. */
export interface CanvasOutput {
    /** Formato do canvas em uso. */
    readonly format: GPUTextureFormat;
    /** Mapeamento de tons da tela em uso (`standard` quando o pedido `extended` não é suportado). */
    readonly toneMapping: 'standard' | 'extended';
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

/** Granularidade do profiling por quadro: um par de timestamps por passe, ou só o total da gravação. */
export type FrameProfilingGranularity = 'passes' | 'frame';

/**
 * EngineCore é a fronteira da Camada 1 (Hardware) — abstração estável
 * sobre o WebGPU device. Todas as operações GPU passam por aqui:
 *   - **Specs como identidade**: `create(spec)` congela a spec e a identifica
 *     pelo hash do conteúdo (UUIDv5, memorizado por objeto); `destroy(spec)`
 *     libera a posse daquela spec.
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
    /** Formato do canvas em uso (o preferido, e.g. 'bgra8unorm', ou `rgba16float` na saída HDR). Setado em initialize. */
    readonly canvasFormat: GPUTextureFormat;
    /** Formato e mapeamento de tons do canvas efetivamente configurados (spec 011). */
    readonly canvasOutput: CanvasOutput;
    /** Opções de canvas guardadas (as de `initialize` ou do último `reconfigureCanvas` com opções). */
    readonly canvasOptions: CanvasOptions;

    /**
     * Adquire GPUAdapter + GPUDevice (assíncrono) pelo adaptador de plataforma (`platform`, spec 038: obrigatório na
     * primeira vez, guardado para a recuperação) aplicando `device` (potência, features, limites) e configura a
     * superfície de apresentação (`surface`: o canvas, a janela ou a textura) com `canvasOptions`. As opções ficam guardadas e são reaplicadas em `requestRecover` e
     * `reconfigureCanvas`. Idempotente quando o device já existe — apenas reaplica canvas/opções de canvas.
     * Rejeita se WebGPU não está disponível ou se uma feature de `device.requiredFeatures` falta no adaptador
     * (a mensagem nomeia a feature).
     */
    initialize(
        surface?: PresentationSurface,
        canvasOptions?: CanvasOptions,
        device?: DeviceOptions,
        platform?: PlatformAdapter,
    ): Promise<void>;
    /**
     * Re-configura o canvas swapchain (chamado após resize). Não recria o device. Sem `options`, reaplica as
     * opções de canvas guardadas (as de `initialize`); com `options`, elas passam a ser as guardadas.
     */
    reconfigureCanvas(options?: CanvasOptions): void;

    /**
     * Tamanho atual do canvas anexado (pixels do backbuffer), ou `undefined` sem canvas. Usado pela C2 para
     * alocar texturas declaradas com `sizeFromCanvas`.
     */
    canvasSize():
        | {
              /** Largura em pixels do backbuffer. */
              readonly width: number;
              /** Altura em pixels do backbuffer. */
              readonly height: number;
          }
        | undefined;

    /**
     * Capacidades efetivas do device atual: adaptador, preferência de potência, features obtidas e ausentes,
     * limites efetivos e limites pedidos que foram reduzidos ao máximo do adaptador. Só dados; recalculado a cada
     * criação de device (`initialize` e `requestRecover`). Lança se o core não foi inicializado.
     */
    capabilities(): DeviceCapabilities;

    /**
     * Registra handler para device-lost. Disparado quando o GPU device é perdido
     * (driver crash, reset, OOM no nível de driver). Retorna função de unsubscribe.
     * Após o handler rodar, o store interno está limpo e o próximo `initialize()`
     * (ou `requestRecover()`) cria um device novo.
     */
    onDeviceLost(handler: DeviceLostHandler): () => void;

    /**
     * Recupera após device-lost: cria um GPUAdapter+GPUDevice novos com as `DeviceOptions` guardadas e re-attacha
     * o canvas (o informado ou o anterior) com as `CanvasOptions` guardadas — ou com `options`, que passam a ser
     * as guardadas. Resources cacheados precisam ser recriados pelos sistemas consumidores.
     */
    requestRecover(surface?: PresentationSurface, options?: CanvasOptions): Promise<void>;

    /**
     * Bytes alocados em GPU memory neste momento. `top` lista as N maiores
     * allocations (default N=5) para diagnóstico. Apenas buffers e texturas
     * contam — pipelines/layouts/bindgroups são reportados como kind='other'
     * com bytes=0 (custo opaco).
     */
    memoryUsage(topN?: number): MemoryUsageReport;

    /**
     * Liga/desliga o profiling de GPU por quadro: `lastFrameStats().gpuTimeMs` passa a ser preenchido. Com
     * `granularity: 'passes'` (padrão), todo passe sem timestamps explícitos recebe um par automático e `stagesNs`
     * traz o tempo de cada um; com `'frame'`, só dois timestamps por gravação (um passe vazio no início e outro no
     * fim) medem o total — sem o custo de amostrar em cada passe, que em quadros com dezenas de passes (física)
     * pesa no próprio tempo medido. `capacity` = timestamps por quadro (default 256 = 128 passes). No-op com aviso
     * único quando o device não tem `timestamp-query`.
     */
    setFrameProfiling(
        enabled: boolean,
        capacity?: number,
        granularity?: FrameProfilingGranularity,
    ): void;
    /**
     * Estatísticas da última gravação submetida (draws, dispatches, passes) e a leitura de
     * GPU mais recente resolvida até o momento da chamada (`gpuTimeMs`, com defasagem de
     * 1–3 quadros; `gpuFrame` diz a que quadro pertence).
     */
    lastFrameStats(): FrameStats;

    /**
     * Leituras de tempo de GPU chegadas desde a última chamada, cada uma uma única vez, na ordem de chegada (spec
     * 034). Vazio sem profiling por quadro ou sem `timestamp-query`.
     */
    takeFrameTimings(): readonly FrameGpuTiming[];

    /**
     * Cria (ou reutiliza, por conteúdo) o objeto de GPU descrito por `spec` e devolve `spec`.
     *
     * A spec passa a ser **imutável em profundidade**: qualquer atribuição posterior lança `TypeError`. Specs
     * aninhadas (shader num pipeline, layout/buffers num bind group) também ficam congeladas — para mudar um
     * recurso, crie uma spec nova. A identidade (`specHash`) é calculada no máximo uma vez por objeto de spec.
     *
     * Specs de conteúdo igual (inclusive aninhado) compartilham o mesmo objeto de GPU. Cada chamada registra `spec`
     * como dona desse objeto; `destroy(spec)` remove só essa posse.
     */
    create<S extends ResourceSpec>(spec: S): S;
    /**
     * Como `create`, mas pipelines (compute/render) compilam em background via `createXxxPipelineAsync()`.
     * Chamadas concorrentes com specs de mesmo conteúdo compilam uma única vez. Para outros kinds, equivale a
     * `create()`.
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
     * Remove a posse de `spec` sobre o objeto de GPU. O objeto é destruído quando nenhuma spec dona resta; specs
     * de mesmo conteúdo criadas por outros donos continuam válidas. `spec` que não é dona não altera nada.
     */
    destroy(spec: ResourceSpec): void;
    /**
     * Lê staging buffer GPU → CPU (mapAsync + getMappedRange + unmap).
     * Retorna ArrayBuffer com cópia dos dados.
     */
    readback(spec: StagingBufferSpec): Promise<ArrayBuffer>;

    /**
     * Lê da GPU o quadro apresentado no canvas (spec 034): copia a textura atual do canvas para um buffer de leitura e
     * devolve os pixels. Chame na mesma tarefa do quadro (a textura do canvas só vale até a tarefa ceder) e com o canvas
     * configurado com `capture: true`. Para ferramentas — o motor nunca lê de volta por quadro por conta própria.
     * @throws Error sem canvas, sem `capture` ou depois de a tarefa do quadro ceder.
     */
    readCanvas(): Promise<CanvasPixels>;

    /**
     * Abre um command encoder, passa um Frame para o body emitir comandos,
     * fecha o encoder ao final do callback. Use `frame.compute(...)` ou
     * `frame.render(target, ...)` dentro do body. Após record retornar,
     * chame `submit()` para enfileirar na queue GPU.
     */
    record(body: (frame: Frame) => void): void;
    /** Variante com label (aparece em DevTools/RenderDoc para identificar o command buffer). */
    record(label: string, body: (frame: Frame) => void): void;
    /** Enfileira o último command buffer construído por `record()` na queue GPU. */
    submit(): void;
    /**
     * Quadros submetidos cuja execução na GPU ainda não terminou (`queue.onSubmittedWorkDone`). O laço usa para não
     * acumular quadros na GPU sem limite (`ApplicationOptions.maxFramesInFlight`). Device perdido ou `shutdown`
     * zeram a contagem.
     */
    framesInFlight(): number;
    /**
     * Registra handler chamado quando a contagem de `framesInFlight()` cai: um quadro submetido terminou na GPU, ou
     * a contagem foi zerada (device perdido, `shutdown`). Recebe a contagem nova. Quem espera espaço na GPU reage a
     * isto em vez de consultar a contagem a cada quadro. Retorna função de unsubscribe.
     */
    onFrameRetired(handler: (framesInFlight: number) => void): () => void;

    /**
     * Wrap um body em error scope GPU. Erros (validation/oom/internal) viram
     * Promise rejection ao invés de logs no console. Útil para captureErrors
     * em runtime via Application option.
     */
    withErrorScope<T>(filter: GPUErrorFilter, body: () => T | Promise<T>): Promise<T>;
    /**
     * Compila o fonte de `spec` à parte (sem registrar o módulo) e devolve as mensagens do compilador. Erros de
     * validação ficam no escopo da chamada — não chegam ao device como erro não capturado. Quem aceita código de fora
     * (funções de ponto de extensão) confere antes de criar o pipeline.
     */
    shaderMessages(spec: ShaderModuleSpec): Promise<readonly ShaderMessage[]>;
    /**
     * Destrói o GPU device + libera todos os recursos. Após shutdown, o core
     * volta a estado uninitialized — pode ser re-inicializado via `initialize()`.
     */
    shutdown(): void;
}
