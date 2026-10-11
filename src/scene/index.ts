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
export type { Resource, PoolDirectory, ResourceDirectory } from './contracts/index';

export type { GPUDescriptor, GPUDescriptorRole } from './descriptors/GPUDescriptor';
export type { PipelineDescriptor, PipelineDescriptorRole } from './descriptors/PipelineDescriptor';
export type { FlowDescriptor } from './descriptors/FlowDescriptor';
export type { TextureShape } from './descriptors/TextureShape';
export type { VertexLayout, VertexAttributeLayout } from './descriptors/index';
export type { SamplerShape } from './descriptors/SamplerShape';
export {
    FieldType,
    fieldAlign,
    fieldBytes,
    fieldCtor,
    fieldElementBytes,
    fieldElements,
    fieldWgsl,
    Schema,
    StructSchema,
    TensorSchema,
} from './descriptors/index';

export { World, ReuseError } from './world/World';
export { Time } from './time/Time';
export { asEntityId } from './world/EntityId';
export type { EntityId } from './world/EntityId';

export { Flow, RenderFlow, FlowRegistry } from './flows/index';
export type { Phase } from './flows/index';

export {
    ConsumerResolverRegistry,
    SingletonResolver,
    PerEntityResolver,
    PoolResolver,
} from './consumers/index';
export type {
    ConsumerResolver,
    ResolveContext,
    SingletonBindingFactory,
    PerEntityBindingFactory,
    PoolBindingFactory,
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
export type { WgslBinding, WgslBindingInfo } from './systems/index';
export { LayoutInferencer, ResourceSystem, ExecutionSystem } from './systems/index';
