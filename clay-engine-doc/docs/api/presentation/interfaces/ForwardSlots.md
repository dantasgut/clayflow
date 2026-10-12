[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardSlots

# Interface: ForwardSlots

Defined in: [presentation/flows/ForwardFlow.ts:64](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L64)

Slots do render principal.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### camera

> `readonly` **camera**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:66](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L66)

Câmera ativa (grupo 0, enviada pela C2 quando muda).

***

### caster

> `readonly` **caster**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:72](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L72)

`ShadowMap` da luz que projeta sombra (opcional; sem ele, `shadowEnabled = 0`).

***

### renderables

> `readonly` **renderables**: `EntitiesSlot`

Defined in: [presentation/flows/ForwardFlow.ts:70](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L70)

Entidades desenhadas: geometria + material + transform.

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:76](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L76)

Pool `ShadowMap` (matriz da luz e vieses pelo slot do caster; opcional).

***

### shadowTexture

> `readonly` **shadowTexture**: `TextureSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:74](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L74)

Textura de profundidade do caster (opcional).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ForwardFlow.ts:78](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L78)

Cor dos `FrameTargets` (com pós) ou o canvas; profundidade dos `FrameTargets`.

***

### world

> `readonly` **world**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:68](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L68)

Pool `WorldTransform` (grupo 1, matriz de mundo pelo slot da entidade).
