[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / FluidSurfaceSlots

# Interface: FluidSurfaceSlots

Defined in: [presentation/flows/FluidSurfaceFlow.ts:65](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/FluidSurfaceFlow.ts#L65)

Slots do produtor da superfície de água a partir das partículas.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `EntitiesSlot`

Defined in: [presentation/flows/FluidSurfaceFlow.ts:79](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/FluidSurfaceFlow.ts#L79)

Corpos de partículas com material de água.

***

### camera

> `readonly` **camera**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/FluidSurfaceFlow.ts:67](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/FluidSurfaceFlow.ts#L67)

Câmera ativa.

***

### cameras

> `readonly` **cameras**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/FluidSurfaceFlow.ts:69](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/FluidSurfaceFlow.ts#L69)

Pool `CameraMatrices` (produzido na GPU pelo estágio de câmera).

***

### caster

> `readonly` **caster**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/FluidSurfaceFlow.ts:71](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/FluidSurfaceFlow.ts#L71)

`ShadowMap` da luz que projeta sombra (vista da luz; opcional).

***

### particleMaterial

> `readonly` **particleMaterial**: `SingletonSlot`\<`true`\>

Defined in: [presentation/flows/FluidSurfaceFlow.ts:77](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/FluidSurfaceFlow.ts#L77)

Parâmetros do material de partícula (espaçamento: raio automático das esferas).

***

### sceneDepth

> `readonly` **sceneDepth**: `TextureSlot`\<`true`\>

Defined in: [presentation/flows/FluidSurfaceFlow.ts:83](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/FluidSurfaceFlow.ts#L83)

Profundidade da cena (vista da câmera: a água atrás dos objetos não entra).

***

### shadowMaps

> `readonly` **shadowMaps**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/FluidSurfaceFlow.ts:73](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/FluidSurfaceFlow.ts#L73)

Pool `ShadowMap` (o slot do mapa da luz que projeta).

***

### shadowMatrices

> `readonly` **shadowMatrices**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/FluidSurfaceFlow.ts:75](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/FluidSurfaceFlow.ts#L75)

Pool `ShadowMatrix` (matriz da luz, produzida na GPU).

***

### water

> `readonly` **water**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/FluidSurfaceFlow.ts:81](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/FluidSurfaceFlow.ts#L81)

A superfície de água da cena (texturas compartilhadas com os consumidores).
