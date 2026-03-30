// ─────────────────────────────────────────────────────────────────────────────
// WebGPU Engine — Public API
// ─────────────────────────────────────────────────────────────────────────────

// ── Camada 2: Scene — grafo e componentes abstratos ────────────────────────────

// Grafo de cena
export { Scene }                  from './scene/core/Scene';
export { Entity }                 from './scene/core/Entity';
export { Mesh }                   from './scene/objects/Mesh';

// Câmeras
export { Camera }                 from './elements/cameras/Camera';
export { PerspectiveCamera }      from './elements/cameras/PerspectiveCamera';

// Matemática / Transform
export { Transform }              from './scene/math/Transform';

// Luzes
export { Light, AmbientLight, DirectionalLight, PointLight } from './scene/lights/Light';

// Componentes abstratos (para quem quiser estender a engine)
export { Geometry }               from './scene/components/Geometry';
export { Material }               from './scene/components/Material';
export { PhysicsBody }            from './scene/components/physics/PhysicsBody';
export { Collider }               from './scene/components/physics/Collider';
export { ParticleEmitter }        from './scene/components/particles/ParticleEmitter';

// Dados e layouts
export { VertexLayout }           from './scene/data/VertexLayout';
export type { VertexAttributeDescriptor, VertexFormatType } from './scene/data/VertexLayout';

// Enums de ciclo de vida
export { ResourceState }          from './scene/core/ResourceState';
export { ResourceType }           from './scene/core/ResourceType';

// Interfaces de contrato (para extensibilidade)
export type { Component }         from './scene/core/Component';
export type { Physic }            from './scene/core/Physic';
export type { Resource }          from './scene/core/Resource';
export type { SimulationWorld }   from './scene/systems/SimulationWorld';
export type { Force }             from './scene/systems/forces/Force';
export type { PhysicsSolver }     from './scene/systems/solvers/PhysicsSolver';
export type { EmitterShape, SpawnSample } from './scene/systems/particles/EmitterShape';
export type { RigidBodySimConfig }        from './scene/systems/simulation/RigidBodySimConfig';
export type { SoftBodySimConfig, SoftBodyResolutionConfig } from './scene/systems/simulation/SoftBodySimConfig';
export type { CollisionSimConfig }        from './scene/systems/simulation/CollisionSimConfig';
export type { BodyEntry, ColliderReg }    from './scene/systems/GpuSimContext';
export type { GpuSimContext }             from './scene/systems/GpuSimContext';
export type { PhysicsComputePass }        from './scene/systems/PhysicsComputePass';
export type { PhysicsSceneConfig, RigidBodyGpuConfig, SoftBodyGpuConfig } from './scene/systems/PhysicsSceneConfig';
export { GpuComputePassRegistry }         from './scene/systems/gpu/GpuComputePassRegistry';
export { GpuPhysicsOrchestrator }         from './scene/rendering/GpuPhysicsOrchestrator';
export type { GpuPipelineEventBus }       from './scene/systems/gpu/GpuPipelineEventBus';
export { DefaultGpuPipelineEventBus }     from './scene/systems/gpu/DefaultGpuPipelineEventBus';
export { PhysicsBodyState }               from './scene/core/physics/PhysicsBodyState';
export type { ExtractionStrategy } from './scene/rendering/strategies/ExtractionStrategy';
export type { RenderCommand, RenderQueue, RenderLight } from './scene/rendering/RenderQueue';

// ── Camada 3: Elements — implementações concretas ──────────────────────────────

// Geometrias
export { BoxGeometry }            from './elements/geometry/BoxGeometry';
export { SphereGeometry }         from './elements/geometry/SphereGeometry';
export { PlaneGeometry }          from './elements/geometry/PlaneGeometry';
export { ParametricGeometry }     from './elements/geometry/ParametricGeometry';

// Materiais
export { StandardMaterial }       from './elements/materials/StandardMaterial';
export { WireframeMaterial }      from './elements/materials/WireframeMaterial';

// Mundo físico
export { PhysicsWorld }                       from './elements/physics/PhysicsWorld';
export type { PhysicsWorldOptions }           from './elements/physics/PhysicsWorld';

// Corpos físicos
export { RigidBody }              from './elements/physics/RigidBody';
export type { RigidBodyOptions }  from './elements/physics/RigidBody';
export { SoftBody }               from './elements/physics/SoftBody';
export type { SoftBodyOptions, SoftParticle, SoftConstraint } from './elements/physics/SoftBody';
export { FEMBody }                from './elements/physics/FEMBody';
export type { FEMBodyOptions, FEMNode, FEMTetrahedron } from './elements/physics/FEMBody';
export { MPMBody }                from './elements/physics/MPMBody';
export type { MPMBodyOptions, MPMMaterialType, MPMParticleData } from './elements/physics/MPMBody';

// Geometrias FEM / MPM
export { FEMBoxGeometry }         from './elements/geometry/FEMBoxGeometry';
export { PointCloudGeometry }     from './elements/geometry/PointCloudGeometry';
export { boxToFEMBody }           from './elements/physics/fem/boxToFEMBody';
export type { BoxFEMResult, BoxFEMOptions } from './elements/physics/fem/boxToFEMBody';

// Fábrica de mundo físico GPU
export { createGpuPhysicsWorld }  from './elements/physics/createGpuPhysicsWorld';

// Formas de colisão
export { SphereShape }            from './elements/physics/shapes/SphereShape';
export { BoxShape }               from './elements/physics/shapes/BoxShape';
export { PlaneShape }             from './elements/physics/shapes/PlaneShape';

// Colisores SDF
export { SDFCollider }            from './elements/physics/shapes/SDFCollider';

// Forças
export { ConstantForce }          from './elements/physics/forces/ConstantForce';
export { FunctionalForce }        from './elements/physics/forces/FunctionalForce';

// Solvers GPU
export { GPUSpringMassSolver }    from './elements/physics/solvers/GPUSpringMassSolver';

// Partículas
export { CPUParticleEmitter }     from './elements/particles/CPUParticleEmitter';
export { GPUParticleEmitter }     from './elements/particles/GPUParticleEmitter';
export { PointEmitterShape }      from './elements/particles/shapes/PointEmitterShape';
export { SphereEmitterShape }     from './elements/particles/shapes/SphereEmitterShape';
export { ConeEmitterShape }       from './elements/particles/shapes/ConeEmitterShape';

// ── Camada 4: Presentation — renderizador ──────────────────────────────────────
export { WebGPURenderer }         from './presentation/renderers/WebGPURenderer';
export type { Renderer }          from './presentation/interfaces/Renderer';

// ── Debug & Logging ────────────────────────────────────────────────────────────
export { Logger }                 from './core/debug/Logger';
export { LogLevel }               from './core/debug/LogLevel';
export { Loggable }               from './core/debug/Loggable';
export { LogCall }                from './core/debug/LogCall';
export { DebugMarker }            from './core/debug/DebugMarker';
