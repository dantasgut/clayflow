import type { Resource } from '../contracts/Resource';
import type { Schema } from '../descriptors/Schema';
import type { Flow } from '../flows/Flow';
import type { BoundFlow } from '../flows/FlowBinding';
import type { PointImplementation } from '../shaders/WgslPoint';
import type { EntityId } from '../world/EntityId';
import type { BindGroupReplacedEvent } from './BindGroupReplacedEvent';
import type { ChangedEvent } from './ChangedEvent';
import type { FrameCompleteEvent } from './FrameCompleteEvent';
import type { FrameRecordingEvent } from './FrameRecordingEvent';
import type { FrameTickEvent } from './FrameTickEvent';
import type { PoolReallocatedEvent } from './PoolReallocatedEvent';
import type { PoolWrittenEvent } from './PoolWrittenEvent';
import type { ReadyEvent } from './ReadyEvent';
import type { TimeDroppedEvent } from './TimeDroppedEvent';

/**
 * Payload de `flowReady`: a C2 resolveu os slots e compilou os pipelines do Flow, que passa a executar no quadro.
 * O `ExecutionSystem` mantém os Flows ativos por este evento e por `flowSuspended`.
 */
export interface FlowReadyPayload {
    /** Nome do estágio (`Flow.type`). */
    readonly type: string;
    /** Tipo de corpo atendido (chave do pool), nos registros com `bodyType`. */
    readonly bodyType?: string;
    /** A instância pronta. */
    readonly flow: Flow;
    /** Slots e pipelines que o `dispatch` recebe (visão viva, mantida pela C2). */
    readonly bound: BoundFlow;
}

/** Payload de `flowSuspended`: o Flow saiu de `ready` (slot obrigatório perdido ou descarte) e deixa o quadro. */
export interface FlowSuspendedPayload {
    /** `type` do Flow. */
    readonly type: string;
    /** O Flow que saiu do quadro. */
    readonly flow: Flow;
}

/** Payload de `poolCreated`: a C2 criou o pool `poolKey` (primeiro recurso com o schema/algoritmo). */
export interface PoolCreatedPayload {
    /** Chave do pool criado. */
    readonly poolKey: string;
    /** Schema do elemento do pool. */
    readonly schema: Schema;
}

/**
 * Payload do evento `resourceReady` — emitido pelo ResourceSystem após
 * alocar buffers + bindgroups + upload inicial de um Resource recém-inserido.
 */
export interface ResourceReadyPayload {
    readonly resource: Resource;
}

/**
 * Payload do evento `resourceDirty` — emitido quando o app modifica
 * `resource.data` e sinaliza re-upload via `events.emit('resourceDirty', ...)`.
 * ResourceSystem responde fazendo o GPU write.
 */
export interface ResourceDirtyPayload {
    readonly resource: Resource;
}

/**
 * Payload do evento `canvasReconfigured` — emitido por `Application.handleResize()` quando as dimensões do canvas
 * mudam. A C2 recria as texturas `sizeFromCanvas` (religando os bind groups que as usam) e entrega o evento aos Flows
 * com alvo (`canvasReconfigured` na tabela de transições), que recriam os seus recursos privados dependentes do
 * tamanho.
 */
export interface CanvasReconfiguredPayload {
    readonly width: number;
    readonly height: number;
    readonly format: GPUTextureFormat;
}

/**
 * Payload do evento `extensionRejected` (spec 009) — o compilador rejeitou o código de uma função de ponto de extensão.
 * O estágio continua com o código anterior (ou com a implementação pronta, se não havia anterior). Anunciado uma vez
 * por revisão do código de cada função.
 */
export interface ExtensionRejectedPayload {
    /** Nome do ponto (`transform`, `field`, …). */
    readonly point: string;
    /** A função rejeitada (a `ExtensionFunction`). */
    readonly resource: PointImplementation;
    /** Revisão do código rejeitado. */
    readonly revision: number;
    /** Mensagem do compilador. */
    readonly message: string;
    /** Linha no código do usuário (0 quando o erro cai fora dele). */
    readonly line: number;
    /** Pipeline em que o erro apareceu. */
    readonly pipeline: string;
}

/**
 * Payload do evento `adaptiveUnavailable` (spec 010) — o device não tem o desenho indireto com primeira instância
 * (`indirect-first-instance`): a malha adaptativa da superfície é gerada no nível máximo em todos os retalhos e desenhada
 * pela contagem conhecida (a grade de mesma precisão máxima). Anunciado uma vez por superfície.
 */
export interface AdaptiveUnavailablePayload {
    /** A superfície (a `ParametricSurface` com `adaptive`). */
    readonly resource: Resource;
    /** Motivo. */
    readonly reason: string;
}

/**
 * Payload do evento `entitiesInserted` — emitido pelo World depois de `resourcesChanged` quando uma entidade raiz
 * é inserida. A C2 atualiza os slots de entidades dos Flows (`entitiesChanged`).
 */
export interface EntitiesInsertedPayload {
    /** Ids das entidades raiz inseridas. */
    readonly entityIds: readonly EntityId[];
}

/**
 * Payload do evento `entitiesRecomposed` — emitido pelo World depois de `resourcesChanged` quando recursos são anexados
 * ou desanexados de entidades já inseridas (`World.attach`/`detach`), e pela C2 quando um Resource da entidade troca de
 * pools (`Entity.redescribe`: o registro tipado de uma função de ponto que mudou de forma, spec 031). A C2 reavalia os
 * registros e os slots de entidades delas (uma entidade pode entrar, sair ou mudar de entrada num conjunto).
 */
export interface EntitiesRecomposedPayload {
    /** Ids das entidades raiz recompostas. */
    readonly entityIds: readonly EntityId[];
}

/**
 * Payload do evento `entitiesRemoved` — emitido pelo World quando uma ou mais entidades são removidas. A C2 libera os
 * recursos delas e atualiza os slots de entidades dos Flows (`entitiesChanged`).
 */
export interface EntitiesRemovedPayload {
    /** Ids das entidades raiz removidas. */
    readonly entityIds: readonly EntityId[];
}

/** Payload do evento `presentationFallback` (spec 011): a saída pedida e o motivo de ter caído no padrão. */
export interface PresentationFallbackPayload {
    /** Saída pedida. */
    readonly requested: 'hdr';
    /** Motivo (ex.: navegador ou tela sem mapeamento de tons estendido). */
    readonly reason: string;
}

/**
 * Payload do evento `globalIlluminationUnsupported` (spec 033, R10): o dispositivo não comporta a estrutura de raios
 * (ou a iluminação global) da cena; ela se desliga e a cena segue com o hemisfério.
 */
export interface GlobalIlluminationUnsupportedPayload {
    /** Motivo (o limite do dispositivo que faltou). */
    readonly reason: string;
}

/**
 * Payload do evento `globalIlluminationReady` (spec 033): os kernels da iluminação global da composição atual das
 * funções `material` da cena compilaram e o estágio passou a acumular luz (emitido a cada composição nova que fica
 * pronta). Antes dele, a cena não tem luz rebatida — quem mede espera por ele.
 */
export interface GlobalIlluminationReadyPayload {
    /** Revisão da composição das funções `material` (a da estrutura de raios). */
    readonly revision: number;
}

/** Um trabalho que impede o quadro de sair completo (spec 034, prontidão do motor). */
export interface PendingWork {
    /** Tipo do Flow. */
    readonly flow: string;
    /** Pipeline do Flow. */
    readonly pipeline: string;
    /**
     * `waiting`: um binding sem fonte na cena; `verifying`: conferência do compilador em voo; `compiling`: compilação
     * em voo; `swapping`: o pipeline refeito com a composição nova da cena ainda não entrou no lugar do atual;
     * `settling`: entidades entraram ou saíram da cena e as reações delas (envio, Flows novos, composição) ainda não
     * apareceram — vale nos dois quadros seguintes à mudança (`flow` = `World`).
     */
    readonly reason: 'waiting' | 'verifying' | 'compiling' | 'swapping' | 'settling';
    /** Binding sem fonte (`waiting`). */
    readonly name?: string;
}

/**
 * Payload do evento `gpuFrameTimed` (spec 034): o tempo de GPU de um quadro, uma única vez por quadro, agregado pelos
 * grupos de depuração da gravação (fase → Flow → passe). Chega 1–3 quadros depois da gravação.
 */
export interface GpuFrameTimedPayload {
    /** Índice do quadro medido. */
    readonly gpuFrame: number;
    /** Soma dos passes medidos (ms). Onde a GPU sobrepõe passes seguidos (TBDR), conta a sobreposição mais de uma vez. */
    readonly totalMs: number;
    /** Do primeiro início ao último fim dos passes (ms): o tempo do quadro na GPU. */
    readonly spanMs: number;
    /** Por fase (`transform`, `shadow`, `forward`, `post`, `ui`; `outros` fora dos grupos), em ms. */
    readonly phasesMs: Readonly<Record<string, number>>;
    /** Por tipo de Flow, em ms. */
    readonly flowsMs: Readonly<Record<string, number>>;
    /** Por caminho completo do passe (`fase/Flow/rótulo`), em ms. */
    readonly passesMs: Readonly<Record<string, number>>;
}

/** Payload do evento `enginePreparing` (spec 034): o que falta para o quadro sair completo. */
export interface EnginePreparingPayload {
    /** Revisão da prontidão (sobe a cada transição). */
    readonly revision: number;
    /** Trabalho pendente: Flow, pipeline, motivo e, sem fonte, o binding. */
    readonly pending: readonly PendingWork[];
}

/** Payload do evento `engineReady` (spec 034): nenhum trabalho pendente. */
export interface EngineReadyPayload {
    /** Revisão da prontidão (sobe a cada transição). */
    readonly revision: number;
}

/**
 * Payload do evento `consumerMissing` (spec 034, H2): o binding de um pipeline de um Flow ativo continua sem fonte
 * depois de 120 quadros — falta o resolvedor ou o pool que o fornece; o pipeline espera e o Flow não grava.
 */
export interface ConsumerMissingPayload {
    /** Tipo do Flow. */
    readonly flow: string;
    /** Pipeline do Flow. */
    readonly pipeline: string;
    /** Binding sem fonte. */
    readonly name: string;
}

/**
 * Payload do evento `profilerStats` — emitido periodicamente (throttle
 * 250ms) pelo `DebugFlow` quando habilitado. Permite UI overlays exibirem
 * FPS, frame time e tempo gasto por stage GPU (via timestamp-query).
 */
export interface ProfilerStatsPayload {
    /** Frames por segundo calculados sobre janela móvel. */
    readonly fps: number;
    /** Tempo do último frame (ms, wall clock). */
    readonly frameTimeMs: number;
    /** Média móvel do frame time (ms). */
    readonly avgFrameTimeMs: number;
    /**
     * Tempos por stage GPU em nanosegundos (timestamp-query). Vazio se
     * o device não suporta `timestamp-query` feature.
     */
    readonly stagesNs: Readonly<Record<string, number>>;
    /** Tempo de GPU da última leitura por fase, por Flow e por passe (ms; spec 034). Vazio sem leitura. */
    readonly gpu?: Omit<GpuFrameTimedPayload, 'gpuFrame'>;
}

/**
 * Payload do evento `engineError` — emitido quando `Application.captureErrors`
 * está ligado e um WebGPU validation error é capturado durante o frame.
 * O GameLoop continua o próximo frame normalmente; o app decide como reagir
 * (logar, suspender flow, mostrar toast).
 */
export interface EngineErrorPayload {
    /** Stage onde o erro foi capturado (e.g. 'frame', 'create', 'createAsync'). */
    readonly stage: string;
    /** Filtro do error scope GPU ('validation' | 'out-of-memory' | 'internal'). */
    readonly filter: GPUErrorFilter;
    /** Mensagem completa do GPUError. */
    readonly message: string;
}

/**
 * Payload do evento `deviceLost` — emitido pelo core quando GPU device é
 * perdido (driver crash, reset, OOM). O store interno já foi limpo; o app
 * decide se quer chamar `requestNewDevice()` para recovery automático.
 */
export interface DeviceLostPayload {
    readonly reason: GPUDeviceLostReason;
    readonly message: string;
}

/**
 * Payload do evento `frameRetired` — emitido quando um quadro submetido termina na GPU (ou a contagem é zerada
 * por device perdido/`shutdown`). Quem espera espaço na GPU (`GameLoop`, laços externos) reage a isto em vez de
 * consultar `framesInFlight` a cada quadro de vídeo.
 */
export interface FrameRetiredPayload {
    /** Quadros ainda em execução na GPU depois desta conclusão. */
    readonly framesInFlight: number;
}

/**
 * Payload do evento `deviceRecovered` — emitido por `Application.requestNewDevice()`
 * após recriar device e reattach canvas. Sistemas reativos (ResourceSystem,
 * Flows) devem reconstruir buffers/pipelines.
 */
export interface DeviceRecoveredPayload {
    readonly reason: GPUDeviceLostReason;
}

/**
 * Payload do evento `memoryWarning` — emitido quando `Application.memoryBudgetMB`
 * é configurado e GPU memory excede o threshold. Inclui `top` (maiores
 * allocations) para diagnóstico. Histerese: dispara apenas na transição
 * abaixo→acima (não a cada frame).
 */
export interface MemoryWarningPayload {
    readonly totalBytes: number;
    readonly budgetBytes: number;
    /** Top-N maiores allocations (default N=5) para diagnóstico de leak. */
    readonly top: readonly {
        readonly kind: 'buffer' | 'texture' | 'other';
        readonly bytes: number;
        readonly label?: string;
    }[];
}

/**
 * Tipo central que mapeia nome do evento → payload. Usado pelo `EventBus`
 * para tipar `on(name, handler)` e `emit(name, payload)` em compile-time.
 *
 * Adicionar evento novo:
 *   1. Defina o payload interface acima.
 *   2. Adicione `name: PayloadType` aqui.
 *   3. Re-export do payload em `events/index.ts`.
 */
export interface EventMap {
    /** World.insert/remove disparam — added/removed Resources. */
    resourcesChanged: ChangedEvent<Resource>;
    /**
     * ResourceSystem alocou ou enviou um Resource com objetos próprios (descritores individuais). Dado em pool é
     * anunciado por `poolWritten`, um por pool.
     */
    resourceReady: ReadyEvent<ResourceReadyPayload>;
    /** ResourceSystem enviou faixas de slots de um pool (um evento por pool por rodada de envio). */
    poolWritten: PoolWrittenEvent;
    /** App marcou Resource como modificado — re-upload pendente. */
    resourceDirty: ReadyEvent<ResourceDirtyPayload>;
    /** A C2 deixou um Flow pronto (slots resolvidos, pipelines compilados) — entra no quadro. */
    flowReady: ReadyEvent<FlowReadyPayload>;
    /** Um Flow saiu de `ready` — deixa o quadro. */
    flowSuspended: ReadyEvent<FlowSuspendedPayload>;
    /** A C2 criou um pool — registros de Flow com esse `bodyType` são instanciados. */
    poolCreated: PoolCreatedPayload;
    /** Pool teve buffer realocado (capacity 2× growth) — flows invalidam bindings. */
    poolReallocated: PoolReallocatedEvent;
    /** A C2 recriou um bind group de um pipeline de Flow porque uma fonte foi recriada. */
    bindGroupReplaced: BindGroupReplacedEvent;
    /** O compilador rejeitou o código de uma função de ponto de extensão (spec 009). */
    extensionRejected: ExtensionRejectedPayload;
    /** A malha adaptativa de uma superfície ficou no nível máximo (sem desenho indireto no device; spec 010). */
    adaptiveUnavailable: AdaptiveUnavailablePayload;
    /** `Application.step()`/`GameLoop` emitem a cada quadro, depois de `time.advance()`. */
    frameTick: FrameTickEvent;
    /** `Time` emite quando o teto de passos por quadro descarta tempo de física. */
    timeDropped: TimeDroppedEvent;
    /** ExecutionSystem emite antes de gravar o quadro — ResourceSystem envia os recursos sujos. */
    frameRecording: FrameRecordingEvent;
    /** ExecutionSystem emite após record+submit — fim do frame. */
    frameComplete: FrameCompleteEvent;
    /** Core emite quando um quadro submetido termina na GPU — há espaço para mais um. */
    frameRetired: FrameRetiredPayload;
    /** Application emite após resize do canvas — flows recriam textures. */
    canvasReconfigured: CanvasReconfiguredPayload;
    /** World emite quando entidades são inseridas — flows atualizam seus conjuntos de entidades. */
    entitiesInserted: EntitiesInsertedPayload;
    /** World emite quando entidades removidas — flows limpam slots cacheados. */
    entitiesRemoved: EntitiesRemovedPayload;
    /** World emite quando a composição de entidades inseridas muda (`attach`/`detach`). */
    entitiesRecomposed: EntitiesRecomposedPayload;
    /** DebugFlow emite (throttled 250ms) com FPS + frame time + stages timestamps. */
    profilerStats: ProfilerStatsPayload;
    /** ExecutionSystem emite quando captureErrors=true e há erro WebGPU. */
    engineError: EngineErrorPayload;
    /** Core emite quando GPU device é perdido — recovery via Application.requestNewDevice. */
    deviceLost: DeviceLostPayload;
    /** Application emite após recovery bem-sucedido. */
    deviceRecovered: DeviceRecoveredPayload;
    /** Application emite quando memoryBudgetMB threshold é cruzado. */
    memoryWarning: MemoryWarningPayload;
    /** A apresentação emite (uma vez) quando a saída pedida não é suportada e cai no padrão (spec 011). */
    presentationFallback: PresentationFallbackPayload;
    /** A estrutura de raios ou a iluminação global emite (uma vez) quando o dispositivo não a comporta (spec 033). */
    globalIlluminationUnsupported: GlobalIlluminationUnsupportedPayload;
    /** As sondas da iluminação global emitem quando os kernels da composição atual ficam prontos (spec 033). */
    globalIlluminationReady: GlobalIlluminationReadyPayload;
    /** A C2 emite quando o motor passa a ter trabalho pendente (compilação, conferência, troca, fonte ausente). */
    enginePreparing: EnginePreparingPayload;
    /** A C2 emite quando não resta trabalho pendente: o quadro sai completo (spec 034). */
    engineReady: EngineReadyPayload;
    /** A C2 emite (uma vez por Flow, pipeline e binding) quando um binding de um Flow ativo segue sem fonte (H2). */
    consumerMissing: ConsumerMissingPayload;
    /** A C2 emite uma vez por quadro medido, quando a leitura de tempo de GPU dele chega (spec 034). */
    gpuFrameTimed: GpuFrameTimedPayload;
}

/** União dos nomes de evento conhecidos (chaves do EventMap). */
export type EventName = keyof EventMap;
