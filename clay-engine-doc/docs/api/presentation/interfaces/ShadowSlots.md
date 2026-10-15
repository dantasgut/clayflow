[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ShadowSlots

# Interface: ShadowSlots

Defined in: [presentation/flows/ShadowFlow.ts:44](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/ShadowFlow.ts#L44)

Slots do estágio de sombra.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### caster

> `readonly` **caster**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:46](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/ShadowFlow.ts#L46)

`ShadowMap` da primeira `DirectionalLight` que projeta sombra.

***

### casters

> `readonly` **casters**: `EntitiesSlot`

Defined in: [presentation/flows/ShadowFlow.ts:52](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/ShadowFlow.ts#L52)

Entidades desenhadas no mapa (geometria + transform), em grupos por (geometria, orientação) mantidos pela C2.

***

### matrices

> `readonly` **matrices**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:50](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/ShadowFlow.ts#L50)

Pool `ShadowMatrix` (matriz da luz pelo slot do caster, produzida na GPU pelo `ShadowMatrixFlow`).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ShadowFlow.ts:54](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/ShadowFlow.ts#L54)

Alvo só de profundidade: a textura `depth` do `ShadowMap` do caster.

***

### world

> `readonly` **world**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:48](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/ShadowFlow.ts#L48)

Pool `WorldTransform` (matriz de mundo pelo slot da entidade).
