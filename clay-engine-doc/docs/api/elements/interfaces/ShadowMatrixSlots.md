[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ShadowMatrixSlots

# Interface: ShadowMatrixSlots

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:21](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/scene/flows/ShadowMatrixFlow.ts#L21)

Slots do estágio da matriz de sombra.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### casters

> `readonly` **casters**: `EntitiesSlot`

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:27](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/scene/flows/ShadowMatrixFlow.ts#L27)

Luzes direcionais com mapa de sombra: registro `ShadowRecord` e a lista das vivas (grupo único).

***

### lights

> `readonly` **lights**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:23](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/scene/flows/ShadowMatrixFlow.ts#L23)

Pool `Light` (direção da luz).

***

### matrices

> `readonly` **matrices**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:25](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/scene/flows/ShadowMatrixFlow.ts#L25)

Pool `ShadowMatrix` (saída).
