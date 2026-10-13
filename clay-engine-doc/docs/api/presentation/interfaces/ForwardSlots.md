[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardSlots

# Interface: ForwardSlots

Defined in: [presentation/flows/ForwardFlow.ts:63](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/ForwardFlow.ts#L63)

Slots do render principal.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### camera

> `readonly` **camera**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:65](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/ForwardFlow.ts#L65)

Câmera ativa: o seu slot em `cameras` vai nos parâmetros do quadro.

***

### cameras

> `readonly` **cameras**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:67](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/ForwardFlow.ts#L67)

Pool `CameraMatrices` (grupo 0), produzido na GPU pelo estágio de câmera.

***

### caster

> `readonly` **caster**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:76](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/ForwardFlow.ts#L76)

`ShadowMap` da luz que projeta sombra (opcional; sem ele, `shadowEnabled = 0`).

***

### lights

> `readonly` **lights**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:84](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/ForwardFlow.ts#L84)

Pool `Light` (direção da luz que ilumina pelo `lightSlot`; opcional).

***

### renderables

> `readonly` **renderables**: `EntitiesSlot`

Defined in: [presentation/flows/ForwardFlow.ts:74](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/ForwardFlow.ts#L74)

Entidades desenhadas (geometria + material + transform), com o registro `Renderable` e os grupos de instâncias
por (geometria, shader do material, orientação) mantidos pela C2.

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:80](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/ForwardFlow.ts#L80)

Pool `ShadowMap` (vieses pelo slot do caster; opcional).

***

### shadowMatrices

> `readonly` **shadowMatrices**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:82](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/ForwardFlow.ts#L82)

Pool `ShadowMatrix` (matriz da luz pelo slot do caster, produzida na GPU; opcional).

***

### shadowTexture

> `readonly` **shadowTexture**: `TextureSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:78](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/ForwardFlow.ts#L78)

Textura de profundidade do caster (opcional).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ForwardFlow.ts:86](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/ForwardFlow.ts#L86)

Cor dos `FrameTargets` (com pós) ou o canvas; profundidade dos `FrameTargets`.

***

### world

> `readonly` **world**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:69](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/ForwardFlow.ts#L69)

Pool `WorldTransform` (grupo 1, matriz de mundo pelo `transformSlot` do registro).
