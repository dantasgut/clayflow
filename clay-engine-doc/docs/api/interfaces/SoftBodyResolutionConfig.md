# Interface: SoftBodyResolutionConfig

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:5](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/SoftBodySimConfig.ts#L5)

Config mínima de resolução para o pipeline SoftBody.
Campo reservado para futuros algoritmos (spring-mass, FEM, MPM).

## Properties

### type?

> `optional` **type?**: `"XPBD"`

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:7](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/SoftBodySimConfig.ts#L7)

Algoritmo de resolução. Apenas 'XPBD' é suportado atualmente.
