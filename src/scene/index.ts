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

export { Entity, ResourceState, ExtensionFunction } from './contracts/index';
export type {
    Resource,
    PoolDirectory,
    PoolBufferSpec,
    PoolInfo,
    ResourceDirectory,
    ExtensionFunctionOptions,
    ExtensionCodeOptions,
    ExtensionGraphOptions,
    ExtensionParamType,
    ExtensionParamValue,
    ExtensionParamsData,
} from './contracts/index';

export {
    defineNode,
    structFields,
    NodeGraph,
    graphArgument,
    NodeGraphError,
    NodeRegistry,
    defineSetNode,
    setType,
    setPointInput,
    SetGraph,
    GraphFlow,
    SET_GROUP,
    setDispatchOffset,
    compileSetGraph,
    SetCountSchema,
    SET_COUNT_DISPATCH_OFFSET,
    SET_COUNT_DRAW_OFFSET,
    Subgraph,
    subgraphOrigin,
    toJSON,
    fromJSON,
    GRAPH_JSON_VERSION,
} from './graph/index';
export type {
    NodeDefinition,
    NodeDefinitionOptions,
    NodeUse,
    NodeParam,
    NodeContext,
    PortType,
    NodeGraphOptions,
    GraphNode,
    GraphLink,
    GraphArgument,
    ResolvedNode,
    NodeGraphErrorKind,
    SetType,
    PointTarget,
    SetPointInput,
    SetBuffer,
    FusedPoint,
    SetNodeContext,
    SetNodeInstance,
    CapacityContext,
    SetCountRule,
    SetNodeDefinitionOptions,
    SetNodeDefinition,
    SetNodeUse,
    SetGraphData,
    SetGraphOptions,
    GraphFlowOptions,
    GraphFlowSlots,
    PlannedSet,
    PlannedNode,
    FusedPointPlan,
    SetGraphPlan,
    PointSubgraphOptions,
    SetSubgraphOptions,
    SetSubgraph,
    SetSubgraphUse,
    GraphJSON,
    NodeJSON,
    SubgraphJSON,
    InlineNodeJSON,
    AnyNodeDefinition,
    FlatNode,
} from './graph/index';

export type {
    GPUDescriptor,
    GPUDescriptorRole,
    SlotRef,
    SlotRefTarget,
} from './descriptors/GPUDescriptor';
export type { PipelineDescriptor, PipelineDescriptorRole } from './descriptors/PipelineDescriptor';
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
export { Time, type TimeData } from './time/Time';
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
export {
    createComputeKernel,
    destroyComputeKernel,
    sameBindGroup,
    bindGroupsTo,
    bindingKeyParts,
} from './flows/index';
export type {
    ComputeKernel,
    ComputeKernelOptions,
    FlowLifecycle,
    Listened,
    SchemaFamily,
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
    EntityRecordDeclaration,
    EntityGroupsDeclaration,
    DrawGroup,
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
    BindingKey,
    PreparedGroup,
    GroupOffsets,
    BoundFlow,
    PreparedPipeline,
    PreparedCompute,
    PreparedRender,
    TransitionContext,
} from './flows/index';
export {
    wgslModule,
    composeWgsl,
    WgslCompositionError,
    wgslPoint,
    scenePointsIn,
    POINT_PARAMS,
    bindPoints,
    wgslResource,
    isWgslResource,
    resourceTypeText,
    BINDING_FREQUENCIES,
    sharedConstant,
    NONE,
    WORKGROUP_SIZE,
    instantiateModule,
} from './shaders/index';
export type {
    WgslModule,
    WgslModuleOptions,
    ComposedShader,
    WgslCompositionErrorKind,
    WgslSymbol,
    WgslSymbolKind,
    WgslPoint,
    WgslPointOptions,
    WgslPointSignature,
    BindablePoint,
    PointImplementation,
    PointRecord,
    ScenePointEntry,
    ScenePointOptions,
    ScenePointGlobal,
    ContributionPoint,
    SceneContribution,
    ComposedBinding,
    WgslResource,
    WgslResourceOptions,
    WgslResourceDeclaration,
    WgslResourceType,
    WgslBindingKind,
    WgslTextureDimension,
    BindingFrequency,
    ResourceProvider,
    SharedConstant,
    SharedConstantType,
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
    PoolWrittenEvent,
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
    ExtensionRejectedPayload,
    EntitiesRemovedPayload,
    ProfilerStatsPayload,
    EngineErrorPayload,
    DeviceLostPayload,
    FrameRetiredPayload,
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
    WgslStage,
    InferredLayout,
    InferredGroup,
    InferredEntry,
    InferredResource,
} from './systems/index';
export { LayoutInferencer, ResourceSystem, ExecutionSystem } from './systems/index';
