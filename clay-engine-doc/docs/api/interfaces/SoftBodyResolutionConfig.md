# Interface: SoftBodyResolutionConfig

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:5](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/systems/simulation/SoftBodySimConfig.ts#L5)

Config mínima de resolução para o pipeline SoftBody.
Campo reservado para futuros algoritmos (spring-mass, FEM, MPM).

## Properties

### type?

> `optional` **type?**: `"XPBD"`

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:7](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/systems/simulation/SoftBodySimConfig.ts#L7)

Algoritmo de resolução. Apenas 'XPBD' é suportado atualmente.
