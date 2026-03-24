[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / PhysicsStage

# Interface: PhysicsStage

Defined in: [scene/systems/PhysicsStage.ts:9](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/PhysicsStage.ts#L9)

Interface de um estágio do pipeline de física (Pipeline pattern).

Cada estágio encapsula uma fase única da simulação.
O PhysicsWorld orquestra a execução sequencial dos estágios.

## Methods

### beginFrame()?

> `optional` **beginFrame**(): `void`

Defined in: [scene/systems/PhysicsStage.ts:11](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/PhysicsStage.ts#L11)

Chamado uma vez por frame, antes do loop de substeps.

#### Returns

`void`

***

### execute()

> **execute**(`context`, `dt`): `void`

Defined in: [scene/systems/PhysicsStage.ts:12](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/PhysicsStage.ts#L12)

#### Parameters

##### context

[`PhysicsStageContext`](PhysicsStageContext.md)

##### dt

`number`

#### Returns

`void`
