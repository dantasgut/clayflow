# Interface: SoftBodyResolutionConfig

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:5](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/scene/systems/simulation/SoftBodySimConfig.ts#L5)

Config mínima de resolução para o pipeline SoftBody.
Campo reservado para futuros algoritmos (spring-mass, FEM, MPM).

## Properties

### type?

> `optional` **type?**: `"XPBD"`

Defined in: [scene/systems/simulation/SoftBodySimConfig.ts:7](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/scene/systems/simulation/SoftBodySimConfig.ts#L7)

Algoritmo de resolução. Apenas 'XPBD' é suportado atualmente.
