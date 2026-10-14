[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ParticleSlots

# Interface: ParticleSlots

Defined in: [presentation/flows/ParticleFlow.ts:40](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L40)

Slots do desenho de corpos de partículas.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `EntitiesSlot`

Defined in: [presentation/flows/ParticleFlow.ts:48](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L48)

Corpos de partículas com material (só `PointSpriteMaterial` é desenhado).

***

### camera

> `readonly` **camera**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ParticleFlow.ts:42](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L42)

Câmera ativa.

***

### cameras

> `readonly` **cameras**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ParticleFlow.ts:44](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L44)

Pool `CameraMatrices` (produzido na GPU pelo estágio de câmera).

***

### lights

> `readonly` **lights**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ParticleFlow.ts:46](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L46)

Pool `Light` (direção da luz que ilumina; opcional).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ParticleFlow.ts:50](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L50)

Cor e profundidade da cena (`FrameTargets`), carregadas: o desenho vem depois do forward.
