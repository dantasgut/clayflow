[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardSlots

# Interface: ForwardSlots

Defined in: [presentation/flows/ForwardFlow.ts:93](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L93)

Slots do render principal.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### camera

> `readonly` **camera**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:95](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L95)

Câmera ativa: o seu slot em `cameras` vai nos parâmetros do quadro.

***

### cameraFnRecords

> `readonly` **cameraFnRecords**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:124](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L124)

Pool dos registros de parâmetros das `CameraFunction` (opcional).

***

### cameraFunctions

> `readonly` **cameraFunctions**: `EntitiesSlot`

Defined in: [presentation/flows/ForwardFlow.ts:122](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L122)

Câmeras com `CameraFunction` (projeção de ponto da câmera ativa, spec 009).

***

### cameras

> `readonly` **cameras**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:97](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L97)

Pool `CameraMatrices` (grupo 0), produzido na GPU pelo estágio de câmera.

***

### caster

> `readonly` **caster**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:106](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L106)

`ShadowMap` da luz que projeta sombra (opcional; sem ele, `shadowEnabled = 0`).

***

### diffs

> `readonly` **diffs**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:118](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L118)

Pool da geometria diferencial das superfícies (spec 010; opcional).

***

### lights

> `readonly` **lights**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:116](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L116)

Pool `Light` (direção da luz que ilumina pelo `lightSlot`; opcional).

***

### renderables

> `readonly` **renderables**: `EntitiesSlot`

Defined in: [presentation/flows/ForwardFlow.ts:104](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L104)

Entidades desenhadas (geometria + material + transform), com o registro `Renderable` e os grupos de instâncias
por (geometria, shader do material, orientação) mantidos pela C2.

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:110](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L110)

Pool `ShadowMap` (vieses pelo slot do caster; opcional).

***

### shadowMatrices

> `readonly` **shadowMatrices**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:112](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L112)

Pool `ShadowMatrix` (matriz da luz pelo slot do caster, produzida na GPU; opcional).

***

### shadowTexture

> `readonly` **shadowTexture**: `TextureSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:108](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L108)

Textura de profundidade do caster (opcional).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ForwardFlow.ts:120](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L120)

Cor dos `FrameTargets` (com pós) ou o canvas; profundidade dos `FrameTargets`.

***

### time

> `readonly` **time**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:126](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L126)

Relógio da cena (tempo das funções `material`; opcional).

***

### water

> `readonly` **water**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:114](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L114)

Superfície de água da cena (cáusticas da luz que projeta sombra, spec 017; opcional).

***

### world

> `readonly` **world**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:99](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L99)

Pool `WorldTransform` (grupo 1, matriz de mundo pelo `transformSlot` do registro).
