[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / ParticleSlots

# Interface: ParticleSlots

Defined in: [src/presentation/flows/ParticleFlow.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L60)

Slots do desenho de corpos de partículas.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### antialiasing

> `readonly` **antialiasing**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/presentation/flows/ParticleFlow.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L72)

Antisserrilhado da cena: o passe de movimento vale com o modo temporal.

***

### bodies

> `readonly` **bodies**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/presentation/flows/ParticleFlow.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L66)

Corpos de partículas com material (só `PointSpriteMaterial` é desenhado).

***

### camera

> `readonly` **camera**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/presentation/flows/ParticleFlow.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L62)

Câmera ativa.

***

### cameras

> `readonly` **cameras**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/presentation/flows/ParticleFlow.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L64)

Pool `CameraMatrices` (produzido na GPU pelo estágio de câmera).

***

### motion

> `readonly` **motion**: [`TextureSlot`](../../platform/web/interfaces/TextureSlot.md)\<`true`\>

Defined in: [src/presentation/flows/ParticleFlow.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L70)

Vetores de movimento (`FrameTargets.motion`, spec 034; sem MSAA): os sprites escrevem o deles.

***

### target

> `readonly` **target**: [`TargetSlot`](../../platform/web/interfaces/TargetSlot.md)

Defined in: [src/presentation/flows/ParticleFlow.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L68)

Cor e profundidade da cena (`FrameTargets`), carregadas: o desenho vem depois do forward.

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/presentation/flows/ParticleFlow.ts:74](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L74)

Relógio da cena: o tempo simulado no quadro (o quanto a partícula andou).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`ParticleWork`\>

Defined in: [src/presentation/flows/ParticleFlow.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L76)

O espaço de trabalho do desenho: parâmetros do quadro e uma região por corpo (spec 039).
