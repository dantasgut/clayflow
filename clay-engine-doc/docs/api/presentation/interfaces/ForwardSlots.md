[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardSlots

# Interface: ForwardSlots

Defined in: [presentation/flows/ForwardFlow.ts:63](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ForwardFlow.ts#L63)

Slots do render principal.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### camera

> `readonly` **camera**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:65](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ForwardFlow.ts#L65)

Câmera ativa (grupo 0, enviada pela C2 quando muda).

***

### caster

> `readonly` **caster**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:71](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ForwardFlow.ts#L71)

`ShadowMap` da luz que projeta sombra (opcional; sem ele, `shadowEnabled = 0`).

***

### renderables

> `readonly` **renderables**: `EntitiesSlot`

Defined in: [presentation/flows/ForwardFlow.ts:69](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ForwardFlow.ts#L69)

Entidades desenhadas: geometria + material + transform.

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:75](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ForwardFlow.ts#L75)

Pool `ShadowMap` (matriz da luz e vieses pelo slot do caster; opcional).

***

### shadowTexture

> `readonly` **shadowTexture**: `TextureSlot`\<`true`\>

Defined in: [presentation/flows/ForwardFlow.ts:73](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ForwardFlow.ts#L73)

Textura de profundidade do caster (opcional).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ForwardFlow.ts:77](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ForwardFlow.ts#L77)

Cor dos `FrameTargets` (com pós) ou o canvas; profundidade dos `FrameTargets`.

***

### world

> `readonly` **world**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ForwardFlow.ts:67](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ForwardFlow.ts#L67)

Pool `WorldTransform` (grupo 1, matriz de mundo pelo slot da entidade).
