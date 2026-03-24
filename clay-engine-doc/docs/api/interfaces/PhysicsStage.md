# Interface: PhysicsStage

Defined in: [scene/systems/PhysicsStage.ts:9](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/systems/PhysicsStage.ts#L9)

Interface de um estágio do pipeline de física (Pipeline pattern).

Cada estágio encapsula uma fase única da simulação.
O PhysicsWorld orquestra a execução sequencial dos estágios.

## Methods

### beginFrame()?

> `optional` **beginFrame**(): `void`

Defined in: [scene/systems/PhysicsStage.ts:11](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/systems/PhysicsStage.ts#L11)

Chamado uma vez por frame, antes do loop de substeps.

#### Returns

`void`

***

### execute()

> **execute**(`context`, `dt`): `void`

Defined in: [scene/systems/PhysicsStage.ts:12](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/systems/PhysicsStage.ts#L12)

#### Parameters

##### context

[`PhysicsStageContext`](PhysicsStageContext.md)

##### dt

`number`

#### Returns

`void`
