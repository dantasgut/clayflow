import { GpuEngineCore } from '../core/gpu/GpuEngineCore';
import { ConsumerResolverRegistry } from './consumers/ConsumerResolverRegistry';
import { DefaultEventBus } from './events/DefaultEventBus';
import { FlowRegistry } from './flows/FlowRegistry';
import { ExecutionSystem } from './systems/ExecutionSystem';
import { LayoutInferencer } from './systems/LayoutInferencer';
import { ResourceSystem } from './systems/ResourceSystem';
import { World } from './world/World';

const core = new GpuEngineCore();

export interface SceneBootstrapOptions {
    canvas?: HTMLCanvasElement;
    canvasOptions?: Parameters<typeof core.initialize>[1];
}

export async function bootstrap(options: SceneBootstrapOptions = {}): Promise<void> {
    if (options.canvas !== undefined && options.canvasOptions !== undefined) {
        await core.initialize(options.canvas, options.canvasOptions);
    } else if (options.canvas !== undefined) {
        await core.initialize(options.canvas);
    } else {
        await core.initialize();
    }
}

export const events = new DefaultEventBus();
export const flows = new FlowRegistry();
export const layoutInferencer = new LayoutInferencer();
export const consumers = new ConsumerResolverRegistry();
export const world = new World(events);
export const resourceSystem = new ResourceSystem(core, events, world);
export const executionSystem = new ExecutionSystem(core, events, flows);

export { core as engine };

export { Entity, ResourceState } from './contracts/index';
export type { Resource } from './contracts/index';

export type { GPUDescriptor, GPUDescriptorRole } from './descriptors/GPUDescriptor';
export type { PipelineDescriptor, PipelineDescriptorRole } from './descriptors/PipelineDescriptor';
export type { FlowDescriptor } from './descriptors/FlowDescriptor';
export type { TextureShape } from './descriptors/TextureShape';
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

export { World } from './world/World';
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
    FrameCompleteEvent,
    FlowReadyPayload,
    ResourceReadyPayload,
    ResourceDirtyPayload,
    CanvasReconfiguredPayload,
    EntitiesRemovedPayload,
    ProfilerStatsPayload,
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
