import type { Resource } from '../contracts/Resource';
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
}

export type EventName = keyof EventMap;
