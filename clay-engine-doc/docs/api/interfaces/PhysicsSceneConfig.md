# Interface: PhysicsSceneConfig

Defined in: [scene/systems/PhysicsSceneConfig.ts:9](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L9)

Configuração de cena física — dados puros, sem comportamento.

Substitui os campos de configuração embutidos em `PhysicsWorldOptions`.
Injetado no `GpuPhysicsOrchestrator` no momento da construção.

GPU-only: campos `backend`, solvers CPU e pipeline CPU são omitidos.

## Properties

### gravity?

> `optional` **gravity?**: readonly \[`number`, `number`, `number`\]

Defined in: [scene/systems/PhysicsSceneConfig.ts:14](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L14)

Aceleração gravitacional (m/s²) aplicada globalmente.
Default: [0, -9.81, 0].

***

### inertiaTensorMaxRatio?

> `optional` **inertiaTensorMaxRatio?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:27](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L27)

Razão máxima entre o maior e o menor componente do tensor de inércia.
Limita instabilidade em corpos finos/longos. Default: 10.

***

### rigidBody?

> `optional` **rigidBody?**: [`RigidBodyGpuConfig`](RigidBodyGpuConfig.md)

Defined in: [scene/systems/PhysicsSceneConfig.ts:33](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L33)

Parâmetros do pipeline XPBD para RigidBody.
Presença habilita o `XPBDRigidBodyComputePass`.

***

### softBody?

> `optional` **softBody?**: [`SoftBodyGpuConfig`](SoftBodyGpuConfig.md)

Defined in: [scene/systems/PhysicsSceneConfig.ts:39](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L39)

Parâmetros do pipeline XPBD para SoftBody.
Presença habilita o `XPBDSoftBodyComputePass`.

***

### substeps?

> `optional` **substeps?**: `number`

Defined in: [scene/systems/PhysicsSceneConfig.ts:21](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/PhysicsSceneConfig.ts#L21)

Número de substeps internos por frame.
Cada `PhysicsComputePass` usa este valor para ampliar K (iterações de solve).
Default: 4.
