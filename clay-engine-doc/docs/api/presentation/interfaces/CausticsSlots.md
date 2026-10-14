[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / CausticsSlots

# Interface: CausticsSlots

Defined in: [presentation/flows/CausticsFlow.ts:36](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/CausticsFlow.ts#L36)

Slots das cáusticas.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### caster

> `readonly` **caster**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/CausticsFlow.ts:38](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/CausticsFlow.ts#L38)

`ShadowMap` da luz que projeta sombra (as cáusticas são dela).

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/CausticsFlow.ts:42](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/CausticsFlow.ts#L42)

Pool `ShadowMap` (o slot do mapa).

***

### shadowMatrices

> `readonly` **shadowMatrices**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/CausticsFlow.ts:44](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/CausticsFlow.ts#L44)

Pool `ShadowMatrix` (matriz da luz).

***

### shadowTexture

> `readonly` **shadowTexture**: `TextureSlot`\<`true`\>

Defined in: [presentation/flows/CausticsFlow.ts:40](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/CausticsFlow.ts#L40)

Mapa de sombra dela: os receptores (fundo e objetos submersos).

***

### water

> `readonly` **water**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/CausticsFlow.ts:46](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/CausticsFlow.ts#L46)

A superfície de água da cena.
