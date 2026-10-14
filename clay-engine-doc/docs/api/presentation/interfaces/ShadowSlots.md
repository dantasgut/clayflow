[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ShadowSlots

# Interface: ShadowSlots

Defined in: [presentation/flows/ShadowFlow.ts:38](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/ShadowFlow.ts#L38)

Slots do estágio de sombra.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### caster

> `readonly` **caster**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:40](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/ShadowFlow.ts#L40)

`ShadowMap` da primeira `DirectionalLight` que projeta sombra.

***

### casters

> `readonly` **casters**: `EntitiesSlot`

Defined in: [presentation/flows/ShadowFlow.ts:46](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/ShadowFlow.ts#L46)

Entidades desenhadas no mapa (geometria + transform), em grupos por (geometria, orientação) mantidos pela C2.

***

### matrices

> `readonly` **matrices**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:44](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/ShadowFlow.ts#L44)

Pool `ShadowMatrix` (matriz da luz pelo slot do caster, produzida na GPU pelo `ShadowMatrixFlow`).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ShadowFlow.ts:48](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/ShadowFlow.ts#L48)

Alvo só de profundidade: a textura `depth` do `ShadowMap` do caster.

***

### world

> `readonly` **world**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:42](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/ShadowFlow.ts#L42)

Pool `WorldTransform` (matriz de mundo pelo slot da entidade).
