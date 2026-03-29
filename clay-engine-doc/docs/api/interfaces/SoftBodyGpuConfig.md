# Interface: SoftBodyGpuConfig

Defined in: [scene/systems/PhysicsSceneConfig.ts:63](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L63)

Parâmetros GPU do pipeline de corpo deformável.

## Properties

### iterations?

> `optional` **iterations?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:65](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L65)

Número de iterações do solver XPBD por substep. Default: 15.

***

### profilerLogInterval?

> `optional` **profilerLogInterval?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:75](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L75)

Intervalo de frames entre leituras do profiler GPU. Default: 60.

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:67](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L67)

Coeficiente de restituição na colisão partícula-colissor [0–1]. Default: 0.05.

***

### shapeStiffness?

> `optional` **shapeStiffness?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:71](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L71)

Rigidez do Shape Matching [0–1]. Default: 0.5.

***

### useJacobiSolve?

> `optional` **useJacobiSolve?**: `boolean`

Defined in: [scene/systems/PhysicsSceneConfig.ts:73](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L73)

Ativa solver Jacobi XPBD em vez de graph coloring. Default: false.

***

### useShapeMatching?

> `optional` **useShapeMatching?**: `boolean`

Defined in: [scene/systems/PhysicsSceneConfig.ts:69](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L69)

Ativa Shape Matching. Default: false.
