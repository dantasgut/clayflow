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
    AnyBufferSpec,
    IndirectBufferSpec,
    TextureSpec,
    TextureViewSpec,
    RenderTarget,
    FrameStats,
    DeviceOptions,
    DeviceCapabilities,
    AdapterDescription,
    ClampedLimit,
    ComputeKernel,
    ComputeKernelBinding,
    ComputeKernelBindingType,
    ComputeKernelBindGroup,
} from './core/contracts/index';

export {
    Flow,
    FlowRegistry,
    World,
    ReuseError,
    DefaultEventBus,
    ResourceSystem,
    ExecutionSystem,
    LayoutInferencer,
    ResourceState,
    Entity as SceneEntity,
    StructSchema,
    FieldType,
    fieldArray,
    fieldRuntimeArray,
    fieldStruct,
    createScene,
    createComputeKernel,
    destroyComputeKernel,
    wgslModule,
    composeWgsl,
    WgslCompositionError,
} from './scene/index';

export type {
    EventBus,
    EventMap,
    EventName,
    GPUDescriptor,
    PipelineDescriptor,
    FlowDescriptor,
    Resource,
    PoolDirectory,
    ResourceDirectory,
    Schema,
    EntityId,
    Phase,
    ProfilerStatsPayload,
    FrameTickEvent,
    TimeDroppedEvent,
    FrameCompleteEvent,
    FrameRecordingEvent,
    EntitiesInsertedPayload,
    EntitiesRemovedPayload,
    SceneContext,
    CreateSceneOptions,
    ComputeKernelOptions,
    WgslModule,
    WgslModuleOptions,
    ComposedShader,
    WgslCompositionErrorKind,
    FieldSpec,
    ArrayFieldSpec,
    StructFieldSpec,
    RuntimeArrayFieldSpec,
    WgslSymbol,
    WgslSymbolKind,
    StructSchemaOptions,
    AddressSpace,
    VertexLayout,
    VertexAttributeLayout,
} from './scene/index';
