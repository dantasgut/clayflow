[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ShadowSlots

# Interface: ShadowSlots

Defined in: [presentation/flows/ShadowFlow.ts:37](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/flows/ShadowFlow.ts#L37)

Slots do estágio de sombra.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### caster

> `readonly` **caster**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:39](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/flows/ShadowFlow.ts#L39)

`ShadowMap` da primeira `DirectionalLight` que projeta sombra.

***

### casters

> `readonly` **casters**: `EntitiesSlot`

Defined in: [presentation/flows/ShadowFlow.ts:45](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/flows/ShadowFlow.ts#L45)

Entidades desenhadas no mapa (geometria + transform), em grupos por (geometria, orientação) mantidos pela C2.

***

### matrices

> `readonly` **matrices**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:43](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/flows/ShadowFlow.ts#L43)

Pool `ShadowMatrix` (matriz da luz pelo slot do caster, produzida na GPU pelo `ShadowMatrixFlow`).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ShadowFlow.ts:47](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/flows/ShadowFlow.ts#L47)

Alvo só de profundidade: a textura `depth` do `ShadowMap` do caster.

***

### world

> `readonly` **world**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:41](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/flows/ShadowFlow.ts#L41)

Pool `WorldTransform` (matriz de mundo pelo slot da entidade).
