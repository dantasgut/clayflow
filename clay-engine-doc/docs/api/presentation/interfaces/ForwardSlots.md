[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardSlots

# Interface: ForwardSlots

Defined in: [presentation/flows/ForwardFlow.ts:91](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L91)

Slots do render principal.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### camera

> `readonly` **camera**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:93](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L93)

Câmera ativa: o seu slot em `cameras` vai nos parâmetros do quadro.

***

### cameraFnRecords

> `readonly` **cameraFnRecords**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:120](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L120)

Pool dos registros de parâmetros das `CameraFunction` (opcional).

***

### cameraFunctions

> `readonly` **cameraFunctions**: `EntitiesSlot`

Defined in: [presentation/flows/ForwardFlow.ts:118](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L118)

Câmeras com `CameraFunction` (projeção de ponto da câmera ativa, spec 009).

***

### cameras

> `readonly` **cameras**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:95](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L95)

Pool `CameraMatrices` (grupo 0), produzido na GPU pelo estágio de câmera.

***

### caster

> `readonly` **caster**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:104](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L104)

`ShadowMap` da luz que projeta sombra (opcional; sem ele, `shadowEnabled = 0`).

***

### lights

> `readonly` **lights**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:114](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L114)

Pool `Light` (direção da luz que ilumina pelo `lightSlot`; opcional).

***

### renderables

> `readonly` **renderables**: `EntitiesSlot`

Defined in: [presentation/flows/ForwardFlow.ts:102](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L102)

Entidades desenhadas (geometria + material + transform), com o registro `Renderable` e os grupos de instâncias
por (geometria, shader do material, orientação) mantidos pela C2.

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:108](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L108)

Pool `ShadowMap` (vieses pelo slot do caster; opcional).

***

### shadowMatrices

> `readonly` **shadowMatrices**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:110](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L110)

Pool `ShadowMatrix` (matriz da luz pelo slot do caster, produzida na GPU; opcional).

***

### shadowTexture

> `readonly` **shadowTexture**: `TextureSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:106](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L106)

Textura de profundidade do caster (opcional).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ForwardFlow.ts:116](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L116)

Cor dos `FrameTargets` (com pós) ou o canvas; profundidade dos `FrameTargets`.

***

### time

> `readonly` **time**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:122](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L122)

Relógio da cena (tempo das funções `material`; opcional).

***

### water

> `readonly` **water**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:112](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L112)

Superfície de água da cena (cáusticas da luz que projeta sombra, spec 017; opcional).

***

### world

> `readonly` **world**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:97](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/ForwardFlow.ts#L97)

Pool `WorldTransform` (grupo 1, matriz de mundo pelo `transformSlot` do registro).
