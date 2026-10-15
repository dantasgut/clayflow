[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / CausticsSlots

# Interface: CausticsSlots

Defined in: [presentation/flows/CausticsFlow.ts:37](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/CausticsFlow.ts#L37)

Slots das cáusticas.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### caster

> `readonly` **caster**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/CausticsFlow.ts:39](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/CausticsFlow.ts#L39)

`ShadowMap` da luz que projeta sombra (as cáusticas são dela).

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/CausticsFlow.ts:43](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/CausticsFlow.ts#L43)

Pool `ShadowMap` (o slot do mapa).

***

### shadowMatrices

> `readonly` **shadowMatrices**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/CausticsFlow.ts:45](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/CausticsFlow.ts#L45)

Pool `ShadowMatrix` (matriz da luz).

***

### shadowTexture

> `readonly` **shadowTexture**: `TextureSlot`\<`true`\>

Defined in: [presentation/flows/CausticsFlow.ts:41](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/CausticsFlow.ts#L41)

Mapa de sombra dela: os receptores (fundo e objetos submersos).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/CausticsFlow.ts:49](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/CausticsFlow.ts#L49)

Tempo da cena (fase das ondulações do material).

***

### water

> `readonly` **water**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/CausticsFlow.ts:47](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/CausticsFlow.ts#L47)

A superfície de água da cena.
