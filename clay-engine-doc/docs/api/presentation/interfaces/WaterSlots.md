[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / WaterSlots

# Interface: WaterSlots

Defined in: [presentation/flows/WaterFlow.ts:36](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/WaterFlow.ts#L36)

Slots da composição da água.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### camera

> `readonly` **camera**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/WaterFlow.ts:38](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/WaterFlow.ts#L38)

Câmera ativa.

***

### cameras

> `readonly` **cameras**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/WaterFlow.ts:40](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/WaterFlow.ts#L40)

Pool `CameraMatrices`.

***

### caster

> `readonly` **caster**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/WaterFlow.ts:44](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/WaterFlow.ts#L44)

`ShadowMap` da luz que projeta sombra (opcional).

***

### lights

> `readonly` **lights**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/WaterFlow.ts:42](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/WaterFlow.ts#L42)

Pool `Light` (a luz que ilumina; opcional).

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/WaterFlow.ts:48](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/WaterFlow.ts#L48)

Pool `ShadowMap` (vieses).

***

### shadowMatrices

> `readonly` **shadowMatrices**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/WaterFlow.ts:50](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/WaterFlow.ts#L50)

Pool `ShadowMatrix` (matriz da luz).

***

### shadowTexture

> `readonly` **shadowTexture**: `TextureSlot`\<`true`\>

Defined in: [presentation/flows/WaterFlow.ts:46](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/WaterFlow.ts#L46)

Textura do mapa de sombra dela.

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/WaterFlow.ts:54](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/WaterFlow.ts#L54)

Cor e profundidade da cena (a água é composta sobre elas).

***

### water

> `readonly` **water**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/WaterFlow.ts:52](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/WaterFlow.ts#L52)

A superfície de água da cena.
