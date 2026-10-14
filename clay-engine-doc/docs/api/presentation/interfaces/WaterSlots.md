[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / WaterSlots

# Interface: WaterSlots

Defined in: [presentation/flows/WaterFlow.ts:37](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/WaterFlow.ts#L37)

Slots da composição da água.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### camera

> `readonly` **camera**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/WaterFlow.ts:39](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/WaterFlow.ts#L39)

Câmera ativa.

***

### cameras

> `readonly` **cameras**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/WaterFlow.ts:41](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/WaterFlow.ts#L41)

Pool `CameraMatrices`.

***

### caster

> `readonly` **caster**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/WaterFlow.ts:45](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/WaterFlow.ts#L45)

`ShadowMap` da luz que projeta sombra (opcional).

***

### lights

> `readonly` **lights**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/WaterFlow.ts:43](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/WaterFlow.ts#L43)

Pool `Light` (a luz que ilumina; opcional).

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/WaterFlow.ts:49](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/WaterFlow.ts#L49)

Pool `ShadowMap` (vieses).

***

### shadowMatrices

> `readonly` **shadowMatrices**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/WaterFlow.ts:51](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/WaterFlow.ts#L51)

Pool `ShadowMatrix` (matriz da luz).

***

### shadowTexture

> `readonly` **shadowTexture**: `TextureSlot`\<`true`\>

Defined in: [presentation/flows/WaterFlow.ts:47](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/WaterFlow.ts#L47)

Textura do mapa de sombra dela.

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/WaterFlow.ts:57](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/WaterFlow.ts#L57)

Cor e profundidade da cena (a água é composta sobre elas).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/WaterFlow.ts:55](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/WaterFlow.ts#L55)

Tempo da cena (fase das ondulações do material).

***

### water

> `readonly` **water**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/WaterFlow.ts:53](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/WaterFlow.ts#L53)

A superfície de água da cena.
