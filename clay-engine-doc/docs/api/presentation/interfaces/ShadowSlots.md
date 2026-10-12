[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ShadowSlots

# Interface: ShadowSlots

Defined in: [presentation/flows/ShadowFlow.ts:37](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ShadowFlow.ts#L37)

Slots do estágio de sombra.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### caster

> `readonly` **caster**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:39](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ShadowFlow.ts#L39)

`ShadowMap` da primeira `DirectionalLight` que projeta sombra.

***

### casters

> `readonly` **casters**: `EntitiesSlot`

Defined in: [presentation/flows/ShadowFlow.ts:45](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ShadowFlow.ts#L45)

Entidades desenhadas no mapa (geometria + transform).

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:43](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ShadowFlow.ts#L43)

Pool `ShadowMap` (matriz da luz e vieses pelo slot do caster).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ShadowFlow.ts:47](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ShadowFlow.ts#L47)

Alvo só de profundidade: a textura `depth` do `ShadowMap` do caster.

***

### world

> `readonly` **world**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ShadowFlow.ts:41](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ShadowFlow.ts#L41)

Pool `WorldTransform` (matriz de mundo pelo slot da entidade).
