[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / PhysicsStageContext

# Interface: PhysicsStageContext

Defined in: [scene/systems/PhysicsStageContext.ts:41](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/PhysicsStageContext.ts#L41)

Contexto compartilhado entre os estágios do pipeline de física.
Contém o estado de simulação do frame atual.
Estágios leem e escrevem neste contexto em sequência.

## Properties

### bodies

> `readonly` **bodies**: `ReadonlyMap`\<`string`, [`BodyEntry`](BodyEntry.md)\>

Defined in: [scene/systems/PhysicsStageContext.ts:42](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/PhysicsStageContext.ts#L42)

***

### candidatePairs

> **candidatePairs**: \[`ColliderEntry`, `ColliderEntry`\][]

Defined in: [scene/systems/PhysicsStageContext.ts:46](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/PhysicsStageContext.ts#L46)

Preenchido pelo BroadphaseStage, consumido pelo NarrowphaseStage.

***

### colliders

> `readonly` **colliders**: `ReadonlyMap`\<`number`, [`ColliderReg`](ColliderReg.md)\>

Defined in: [scene/systems/PhysicsStageContext.ts:44](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/PhysicsStageContext.ts#L44)

***

### contacts

> **contacts**: [`CollisionContact`](CollisionContact.md)[]

Defined in: [scene/systems/PhysicsStageContext.ts:48](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/PhysicsStageContext.ts#L48)

Preenchido pelo NarrowphaseStage, consumido pelo CollisionResolutionStage.

***

### entityBodies

> `readonly` **entityBodies**: `ReadonlyMap`\<`number`, [`BodyEntry`](BodyEntry.md)\>

Defined in: [scene/systems/PhysicsStageContext.ts:43](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/PhysicsStageContext.ts#L43)
