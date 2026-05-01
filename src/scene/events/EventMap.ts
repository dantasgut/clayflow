import type { Resource } from '../contracts/Resource';
import type { EntityId } from '../world/EntityId';
import type { BindGroupReplacedEvent } from './BindGroupReplacedEvent';
import type { ChangedEvent } from './ChangedEvent';
import type { FrameCompleteEvent } from './FrameCompleteEvent';
import type { FrameTickEvent } from './FrameTickEvent';
import type { PoolReallocatedEvent } from './PoolReallocatedEvent';
import type { ReadyEvent } from './ReadyEvent';

export interface FlowReadyPayload {
    readonly type: string;
    readonly bodyType?: string;
}

export interface ResourceReadyPayload {
    readonly resource: Resource;
}

export interface ResourceDirtyPayload {
    readonly resource: Resource;
}

export interface CanvasReconfiguredPayload {
    readonly width: number;
    readonly height: number;
    readonly format: GPUTextureFormat;
}

export interface EntitiesRemovedPayload {
    readonly entityIds: readonly EntityId[];
}

export interface ProfilerStatsPayload {
    readonly fps: number;
    readonly frameTimeMs: number;
    readonly avgFrameTimeMs: number;
    readonly stagesNs: Readonly<Record<string, number>>;
}

export interface EngineErrorPayload {
    readonly stage: string;
    readonly filter: GPUErrorFilter;
    readonly message: string;
}

export interface DeviceLostPayload {
    readonly reason: GPUDeviceLostReason;
    readonly message: string;
}

export interface DeviceRecoveredPayload {
    readonly reason: GPUDeviceLostReason;
}

export interface MemoryWarningPayload {
    readonly totalBytes: number;
    readonly budgetBytes: number;
    readonly top: readonly {
        readonly kind: 'buffer' | 'texture' | 'other';
        readonly bytes: number;
        readonly label?: string;
    }[];
}

export interface EventMap {
    resourcesChanged: ChangedEvent<Resource>;
    resourceReady: ReadyEvent<ResourceReadyPayload>;
    resourceDirty: ReadyEvent<ResourceDirtyPayload>;
    flowReady: ReadyEvent<FlowReadyPayload>;
    poolReallocated: PoolReallocatedEvent;
    bindGroupReplaced: BindGroupReplacedEvent;
    frameTick: FrameTickEvent;
    frameComplete: FrameCompleteEvent;
    canvasReconfigured: CanvasReconfiguredPayload;
    entitiesRemoved: EntitiesRemovedPayload;
    profilerStats: ProfilerStatsPayload;
    engineError: EngineErrorPayload;
    deviceLost: DeviceLostPayload;
    deviceRecovered: DeviceRecoveredPayload;
    memoryWarning: MemoryWarningPayload;
}

export type EventName = keyof EventMap;
