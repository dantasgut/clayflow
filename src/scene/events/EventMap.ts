import type { Resource } from '../contracts/Resource';
import type { EntityId } from '../world/EntityId';
import type { BindGroupReplacedEvent } from './BindGroupReplacedEvent';
import type { ChangedEvent } from './ChangedEvent';
import type { FrameCompleteEvent } from './FrameCompleteEvent';
import type { FrameTickEvent } from './FrameTickEvent';
import type { PoolReallocatedEvent } from './PoolReallocatedEvent';
import type { ReadyEvent } from './ReadyEvent';

/**
 * Payload disparado quando um Flow termina sua inicialização e está
 * pronto para dispatch. Útil para sistemas que dependem de um flow
 * específico estar ativo (e.g. UI mostrando "Loading..." até ForwardFlow ready).
 */
export interface FlowReadyPayload {
    /** Identificador do flow (`Flow.type`, e.g. 'ForwardFlow'). */
    readonly type: string;
    /** Body type associado ao flow (e.g. 'LCPSchema'); vazio se não-bound. */
    readonly bodyType?: string;
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
 * Payload do evento `canvasReconfigured` — emitido por `Application.handleResize()`
 * quando canvas dimensões mudam. Flows que mantêm textures dependentes do
 * tamanho do canvas devem invalidar+recriar via `Flow.onCanvasResized`.
 */
export interface CanvasReconfiguredPayload {
    readonly width: number;
    readonly height: number;
    readonly format: GPUTextureFormat;
}

/**
 * Payload do evento `entitiesRemoved` — emitido pelo World quando uma ou
 * mais entidades são removidas. Flows com cache por EntityId devem limpar
 * os entries afetados via `Flow.onEntitiesRemoved`.
 */
export interface EntitiesRemovedPayload {
    readonly entityIds: readonly EntityId[];
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
    /** ResourceSystem confirmou alocação + upload inicial de um Resource. */
    resourceReady: ReadyEvent<ResourceReadyPayload>;
    /** App marcou Resource como modificado — re-upload pendente. */
    resourceDirty: ReadyEvent<ResourceDirtyPayload>;
    /** Flow concluiu inicialização e está pronto para dispatch. */
    flowReady: ReadyEvent<FlowReadyPayload>;
    /** Pool teve buffer realocado (capacity 2× growth) — flows invalidam bindings. */
    poolReallocated: PoolReallocatedEvent;
    /** BindGroup foi substituído (e.g. textura source mudou). */
    bindGroupReplaced: BindGroupReplacedEvent;
    /** GameLoop emite a cada RAF — sinaliza início do frame. */
    frameTick: FrameTickEvent;
    /** ExecutionSystem emite após record+submit — fim do frame. */
    frameComplete: FrameCompleteEvent;
    /** Application emite após resize do canvas — flows recriam textures. */
    canvasReconfigured: CanvasReconfiguredPayload;
    /** World emite quando entidades removidas — flows limpam slots cacheados. */
    entitiesRemoved: EntitiesRemovedPayload;
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
}

/** União dos nomes de evento conhecidos (chaves do EventMap). */
export type EventName = keyof EventMap;
