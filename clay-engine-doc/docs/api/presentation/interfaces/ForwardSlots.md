[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardSlots

# Interface: ForwardSlots

Defined in: [presentation/flows/ForwardFlow.ts:74](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L74)

Slots do render principal.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### camera

> `readonly` **camera**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:76](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L76)

Câmera ativa: o seu slot em `cameras` vai nos parâmetros do quadro.

***

### cameras

> `readonly` **cameras**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:78](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L78)

Pool `CameraMatrices` (grupo 0), produzido na GPU pelo estágio de câmera.

***

### caster

> `readonly` **caster**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:87](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L87)

`ShadowMap` da luz que projeta sombra (opcional; sem ele, `shadowEnabled = 0`).

***

### lights

> `readonly` **lights**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:95](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L95)

Pool `Light` (direção da luz que ilumina pelo `lightSlot`; opcional).

***

### renderables

> `readonly` **renderables**: `EntitiesSlot`

Defined in: [presentation/flows/ForwardFlow.ts:85](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L85)

Entidades desenhadas (geometria + material + transform), com o registro `Renderable` e os grupos de instâncias
por (geometria, shader do material, orientação) mantidos pela C2.

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:91](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L91)

Pool `ShadowMap` (vieses pelo slot do caster; opcional).

***

### shadowMatrices

> `readonly` **shadowMatrices**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:93](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L93)

Pool `ShadowMatrix` (matriz da luz pelo slot do caster, produzida na GPU; opcional).

***

### shadowTexture

> `readonly` **shadowTexture**: `TextureSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:89](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L89)

Textura de profundidade do caster (opcional).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ForwardFlow.ts:97](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L97)

Cor dos `FrameTargets` (com pós) ou o canvas; profundidade dos `FrameTargets`.

***

### world

> `readonly` **world**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:80](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L80)

Pool `WorldTransform` (grupo 1, matriz de mundo pelo `transformSlot` do registro).
