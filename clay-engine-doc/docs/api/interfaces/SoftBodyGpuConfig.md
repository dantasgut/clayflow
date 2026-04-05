# Interface: SoftBodyGpuConfig

Defined in: [scene/systems/PhysicsSceneConfig.ts:88](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L88)

Parâmetros GPU do pipeline de corpo deformável (XPBD).

## Properties

### iterations?

> `optional` **iterations?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:96](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L96)

Número de iterações do solver XPBD por substep. Default: 15.

***

### profilerLogInterval?

> `optional` **profilerLogInterval?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:106](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L106)

Intervalo de frames entre leituras do profiler GPU. Default: 60.

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:98](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L98)

Coeficiente de restituição na colisão partícula-colissor [0–1]. Default: 0.05.

***

### shapeStiffness?

> `optional` **shapeStiffness?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:102](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L102)

Rigidez do Shape Matching [0–1]. Default: 0.5.

***

### substeps?

> `optional` **substeps?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:94](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L94)

Substeps por frame para o pipeline de soft body.
Sobrescreve `PhysicsSceneConfig.substeps` para este algoritmo.
Default: 4 (position-space; mais substeps = constraints mais rígidas).

***

### useJacobiSolve?

> `optional` **useJacobiSolve?**: `boolean`

Defined in: [scene/systems/PhysicsSceneConfig.ts:104](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L104)

Ativa solver Jacobi XPBD em vez de graph coloring. Default: false.

***

### useShapeMatching?

> `optional` **useShapeMatching?**: `boolean`

Defined in: [scene/systems/PhysicsSceneConfig.ts:100](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsSceneConfig.ts#L100)

Ativa Shape Matching. Default: false.
