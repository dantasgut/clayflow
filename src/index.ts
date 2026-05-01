/**
 * webgpu-engine — Clay Engine public API.
 *
 * 4 camadas:
 *   - C1 Hardware (`./core`)         — EngineCore facade sobre WebGPU
 *   - C2 Sync     (`./scene`)        — World, EventBus, Flows, ResourceSystem
 *   - C3 Elements (`./elements`)     — Geometries, materials, physics, particles
 *   - C4 Presentation (`./presentation`) — Application, controllers, post effects
 *
 * Uso típico:
 * ```typescript
 * import { Application, BoxGeometry, Camera } from 'webgpu-engine';
 * const app = await Application.create({ canvas });
 * ```
 *
 * Para low-level customization, importe diretamente das subpastas:
 * ```typescript
 * import type { EngineCore, Frame } from 'webgpu-engine/core';
 * import { Flow } from 'webgpu-engine/scene';
 * ```
 *
 * @packageDocumentation
 */
export * from './presentation/index';
export * from './elements/index';

// Re-export tipos de C1 e C2 que são frequentemente úteis ao escrever
// Resources/Flows custom (a barreira pública estável).
export type {
    EngineCore,
    Frame,
    BindGroupSpec,
    ComputePipelineSpec,
    RenderPipelineSpec,
    LayoutSpec,
    ShaderModuleSpec,
    SamplerSpec,
    StorageBufferSpec,
    UniformBufferSpec,
    IndexBufferSpec,
    VertexBufferSpec,
    StagingBufferSpec,
    TextureSpec,
    TextureViewSpec,
    RenderTarget,
} from './core/contracts/index';

export {
    Flow,
    FlowRegistry,
    World,
    DefaultEventBus,
    ResourceSystem,
    ExecutionSystem,
    LayoutInferencer,
    ResourceState,
    Entity as SceneEntity,
    StructSchema,
    FieldType,
    createScene,
} from './scene/index';

export type {
    EventBus,
    EventMap,
    EventName,
    GPUDescriptor,
    PipelineDescriptor,
    FlowDescriptor,
    Resource,
    Schema,
    EntityId,
    Phase,
    ProfilerStatsPayload,
    FrameTickEvent,
    FrameCompleteEvent,
    SceneContext,
} from './scene/index';
