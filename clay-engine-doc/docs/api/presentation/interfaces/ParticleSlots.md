[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ParticleSlots

# Interface: ParticleSlots

Defined in: [presentation/flows/ParticleFlow.ts:41](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ParticleFlow.ts#L41)

Slots do desenho de corpos de partículas.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `EntitiesSlot`

Defined in: [presentation/flows/ParticleFlow.ts:49](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ParticleFlow.ts#L49)

Corpos de partículas com material (só `PointSpriteMaterial` é desenhado).

***

### camera

> `readonly` **camera**: `SingletonSlot`\<`false`\>

Defined in: [presentation/flows/ParticleFlow.ts:43](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ParticleFlow.ts#L43)

Câmera ativa.

***

### cameras

> `readonly` **cameras**: `PoolSlot`\<`false`\>

Defined in: [presentation/flows/ParticleFlow.ts:45](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ParticleFlow.ts#L45)

Pool `CameraMatrices` (produzido na GPU pelo estágio de câmera).

***

### lights

> `readonly` **lights**: `PoolSlot`\<`true`\>

Defined in: [presentation/flows/ParticleFlow.ts:47](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ParticleFlow.ts#L47)

Pool `Light` (direção da luz que ilumina; opcional).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/ParticleFlow.ts:51](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ParticleFlow.ts#L51)

Cor e profundidade da cena (`FrameTargets`), carregadas: o desenho vem depois do forward.
