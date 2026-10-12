import { createScene, type SceneContext } from './SceneContext';
import type { CanvasOptions } from '../core/contracts/index';

const defaultScene: SceneContext = createScene();

export interface SceneBootstrapOptions {
    canvas?: HTMLCanvasElement;
    canvasOptions?: CanvasOptions;
}

export async function bootstrap(options: SceneBootstrapOptions = {}): Promise<void> {
    await defaultScene.initialize(options.canvas, options.canvasOptions);
}

// Singletons da scene default — backwards-compat. Para multi-Application,
// use createScene() + Application.create({ scene: ... }).
export const events = defaultScene.events;
export const flows = defaultScene.flows;
export const layoutInferencer = defaultScene.layoutInferencer;
export const consumers = defaultScene.consumers;
export const world = defaultScene.world;
export const resourceSystem = defaultScene.resourceSystem;
export const executionSystem = defaultScene.executionSystem;

export { defaultScene };
export { createScene } from './SceneContext';
export type { SceneContext, CreateSceneOptions } from './SceneContext';

export const engine = defaultScene.core;

export { Entity, ResourceState } from './contracts/index';
export type {
    Resource,
    PoolDirectory,
    PoolBufferSpec,
    PoolInfo,
    ResourceDirectory,
} from './contracts/index';

export type { GPUDescriptor, GPUDescriptorRole } from './descriptors/GPUDescriptor';
export type {
    PipelineDescriptor,
    PipelineDescriptorRole,
    ConsumesEntry,
} from './descriptors/PipelineDescriptor';
export type { FlowDescriptor } from './descriptors/FlowDescriptor';
export type { TextureShape } from './descriptors/TextureShape';
export type {
    AddressSpace,
    ArrayFieldSpec,
    FieldSpec,
    RuntimeArrayFieldSpec,
    StructFieldSpec,
    StructSchemaOptions,
    VertexLayout,
    VertexAttributeLayout,
} from './descriptors/index';
export type { SamplerShape } from './descriptors/SamplerShape';
export {
    FieldType,
    fieldAlign,
    fieldBytes,
    fieldCtor,
    fieldElementBytes,
    fieldElements,
    fieldWgsl,
    fieldArray,
    fieldRuntimeArray,
    fieldStruct,
    Schema,
    StructSchema,
    TensorSchema,
} from './descriptors/index';

export { World, ReuseError } from './world/World';
export { Time } from './time/Time';
export { asEntityId } from './world/EntityId';
export type { EntityId } from './world/EntityId';

export {
    Flow,
    RenderFlow,
    FlowRegistry,
    FlowRegistrationError,
    FlowTransitionError,
    FlowBindingError,
    PHASE_ORDER,
    slot,
} from './flows/index';
export { createComputeKernel, destroyComputeKernel } from './flows/index';
export type {
    ComputeKernel,
    ComputeKernelOptions,
    FlowLifecycle,
    RenderSlotMap,
    RegisterOptions,
    FlowContext,
    FlowFactory,
    FlowRegistration,
    FlowAllocator,
    FlowRegistryHost,
    FlowBindingErrorDetails,
    SlotDeclaration,
    SlotMap,
    PoolSlot,
    BodiesSlot,
    PoolsSlot,
    SingletonSlot,
    EntitiesSlot,
    TextureSlot,
    TargetSlot,
    TextureRef,
    ResourceType,
    BoundSlot,
    BoundSlots,
    BoundPool,
    BoundSingleton,
    BoundEntities,
    EntityEntry,
    BoundTexture,
    BoundTarget,
    FlowEvent,
    FlowEventName,
    FlowEventOf,
    FlowTransition,
    FlowTransitions,
    BindingSource,
    BindingSources,
    BoundFlow,
    PreparedPipeline,
    PreparedCompute,
    PreparedRender,
    TransitionContext,
} from './flows/index';
export { wgslModule, composeWgsl, WgslCompositionError } from './shaders/index';
export type {
    WgslModule,
    WgslModuleOptions,
    ComposedShader,
    WgslCompositionErrorKind,
    WgslSymbol,
    WgslSymbolKind,
} from './shaders/index';
export type { Phase } from './flows/index';

export {
    ConsumerResolverRegistry,
    ConsumerResolutionError,
    SingletonResolver,
    PoolResolver,
    TextureResolver,
} from './consumers/index';
export type {
    ConsumerResolver,
    ResolveContext,
    ResolvedSource,
    BindableBufferSpec,
    SingletonResolverOptions,
} from './consumers/index';

export { DefaultEventBus } from './events/DefaultEventBus';
export type {
    EventBus,
    EventHandler,
    Unsubscribe,
    EventMap,
    EventName,
    ChangedEvent,
    ReadyEvent,
    PoolReallocatedEvent,
    BindGroupReplacedEvent,
    FrameTickEvent,
    TimeDroppedEvent,
    FrameCompleteEvent,
    FrameRecordingEvent,
    FlowReadyPayload,
    FlowSuspendedPayload,
    PoolCreatedPayload,
    ResourceReadyPayload,
    ResourceDirtyPayload,
    CanvasReconfiguredPayload,
    EntitiesInsertedPayload,
    EntitiesRemovedPayload,
    ProfilerStatsPayload,
    EngineErrorPayload,
    DeviceLostPayload,
    DeviceRecoveredPayload,
    MemoryWarningPayload,
} from './events/index';

export type {
    EngineCore,
    Frame,
    ComputePass,
    RenderPass,
    RenderTarget,
    ColorAttachment,
    DepthStencilAttachment,
    ResourceSpec,
    AnyBufferSpec,
    AnyPipelineSpec,
    BufferSpec,
    VertexBufferSpec,
    IndexBufferSpec,
    UniformBufferSpec,
    StorageBufferSpec,
    IndirectBufferSpec,
    StagingBufferSpec,
    TextureSpec,
    TextureViewSpec,
    SamplerSpec,
    ShaderModuleSpec,
    LayoutSpec,
    BindGroupSpec,
    ComputePipelineSpec,
    RenderPipelineSpec,
    BundleSpec,
    BundleFormats,
    BindingLayoutEntry,
    BindingEntry,
    BufferBindingEntry,
    SamplerBindingEntry,
    TextureViewBindingEntry,
    Binder,
    Dispatcher,
    GeometryBinder,
    RenderState,
    Drawer,
    BundleRunner,
    Profiler,
    CanvasOptions,
    DeviceOptions,
    DeviceCapabilities,
    Extent3D,
    TextureDataLayout,
    TextureCopyOptions,
    VertexAttribute,
    VertexBufferLayout,
    DepthSpec,
    StencilFaceState,
    BlendComponent,
    BlendSpec,
    ColorTargetSpec,
    MultisampleSpec,
    PrimitiveSpec,
    VertexStage,
    FragmentStage,
} from './contracts/index';

export type { ResourceStateHandler } from './lifecycle/index';
export type {
    WgslBinding,
    WgslBindingInfo,
    WgslStage,
    InferredLayout,
    InferredGroup,
    InferredEntry,
    InferredResource,
} from './systems/index';
export { LayoutInferencer, ResourceSystem, ExecutionSystem } from './systems/index';
