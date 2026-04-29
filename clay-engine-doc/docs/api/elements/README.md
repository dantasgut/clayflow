[**webgpu-engine**](../README.md)

***

[webgpu-engine](../modules.md) / elements

# elements

Camada 3 — Elements API pública.

Resources user-facing: geometrias paramétricas, materiais, lights,
physics bodies (RigidBody, SoftBody, MPMBody, SPHBody, PBFBody), colliders,
constraints, force fields, particle emitters, e os Flows que processam
cada categoria (LCPFlow, XPBDFlow, FEMFlow, MPMFlow, SPHFlow, PBFFlow).

Cada classe expõe `getDescriptors()` (camadas C2 alocam buffers/bindings
automaticamente) e, quando relevante, `getFlowDescriptors()` (associa o
resource a um pool por algoritmo).

## Classes

- [BoxCollider](classes/BoxCollider.md)
- [BoxGeometry](classes/BoxGeometry.md)
- [BuoyancyField](classes/BuoyancyField.md)
- [Camera](classes/Camera.md)
- [CanvasRenderTarget](classes/CanvasRenderTarget.md)
- [Collider](classes/Collider.md)
- [ComputeParticleEmitter](classes/ComputeParticleEmitter.md)
- [ConeEmitterShape](classes/ConeEmitterShape.md)
- [Constraint](classes/Constraint.md)
- [DirectionalLight](classes/DirectionalLight.md)
- [DistanceConstraint](classes/DistanceConstraint.md)
- [DragField](classes/DragField.md)
- [Entity](classes/Entity.md)
- [EulerianGrid](classes/EulerianGrid.md)
- [FEMFlow](classes/FEMFlow.md)
- [FluidBody](classes/FluidBody.md)
- [ForceField](classes/ForceField.md)
- [Geometry](classes/Geometry.md)
- [GraphColorSolver](classes/GraphColorSolver.md)
- [GravityField](classes/GravityField.md)
- [JointConstraint](classes/JointConstraint.md)
- [LCPFlow](classes/LCPFlow.md)
- [Light](classes/Light.md)
- [Material](classes/Material.md)
- [MeshCollider](classes/MeshCollider.md)
- [MPMBody](classes/MPMBody.md)
- [MPMFlow](classes/MPMFlow.md)
- [NeighborSearchGrid](classes/NeighborSearchGrid.md)
- [NeighborSearchPipeline](classes/NeighborSearchPipeline.md)
- [OffscreenRenderTarget](classes/OffscreenRenderTarget.md)
- [ParametricGeometry](classes/ParametricGeometry.md)
- [ParametricSurfaceGeometry](classes/ParametricSurfaceGeometry.md)
- [ParticleEmitter](classes/ParticleEmitter.md)
- [PBFBody](classes/PBFBody.md)
- [PBFFlow](classes/PBFFlow.md)
- [PhysicsBody](classes/PhysicsBody.md)
- [PlaneCollider](classes/PlaneCollider.md)
- [PlaneGeometry](classes/PlaneGeometry.md)
- [PointCloudGeometry](classes/PointCloudGeometry.md)
- [PointEmitterShape](classes/PointEmitterShape.md)
- [PointLight](classes/PointLight.md)
- [PointSpriteMaterial](classes/PointSpriteMaterial.md)
- [RigidBody](classes/RigidBody.md)
- [Scene](classes/Scene.md)
- [ScriptedParticleEmitter](classes/ScriptedParticleEmitter.md)
- [ShadowMap](classes/ShadowMap.md)
- [SoftBody](classes/SoftBody.md)
- [SPHBody](classes/SPHBody.md)
- [SphereCollider](classes/SphereCollider.md)
- [SphereEmitterShape](classes/SphereEmitterShape.md)
- [SphereGeometry](classes/SphereGeometry.md)
- [SPHFlow](classes/SPHFlow.md)
- [SpringConstraint](classes/SpringConstraint.md)
- [StandardMaterial](classes/StandardMaterial.md)
- [Transform](classes/Transform.md)
- [VortexField](classes/VortexField.md)
- [WindField](classes/WindField.md)
- [WireframeMaterial](classes/WireframeMaterial.md)
- [XPBDFlow](classes/XPBDFlow.md)

## Interfaces

- [Edge](interfaces/Edge.md)
- [EmitterShape](interfaces/EmitterShape.md)
- [FluidBodyOptions](interfaces/FluidBodyOptions.md)
- [LCPFlowOptions](interfaces/LCPFlowOptions.md)
- [NeighborSearchOptions](interfaces/NeighborSearchOptions.md)
- [ParticleEmitterOptions](interfaces/ParticleEmitterOptions.md)
- [RenderTargetOptions](interfaces/RenderTargetOptions.md)
- [RigidBodyOptions](interfaces/RigidBodyOptions.md)
- [SoftBodyOptions](interfaces/SoftBodyOptions.md)
- [SpawnSample](interfaces/SpawnSample.md)

## Type Aliases

- [FluidBodyAlgorithm](type-aliases/FluidBodyAlgorithm.md)
- [ParametricFunction](type-aliases/ParametricFunction.md)
- [RigidBodyAlgorithm](type-aliases/RigidBodyAlgorithm.md)
- [SoftBodyAlgorithm](type-aliases/SoftBodyAlgorithm.md)
