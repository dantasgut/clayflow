# Class: SphereEmitterShape

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:7](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/SphereEmitterShape.ts#L7)

Emissão na superfície de uma esfera. (Camada 3)
Posição e direção uniformes na superfície esférica.

## Implements

- [`EmitterShape`](../interfaces/EmitterShape.md)

## Constructors

### Constructor

> **new SphereEmitterShape**(`radius?`): `SphereEmitterShape`

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:10](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/SphereEmitterShape.ts#L10)

#### Parameters

##### radius?

`number` = `0.5`

#### Returns

`SphereEmitterShape`

## Properties

### id

> `readonly` **id**: `"sphere"` = `'sphere'`

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:8](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/SphereEmitterShape.ts#L8)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`id`](../interfaces/EmitterShape.md#id)

***

### radius

> **radius**: `number` = `0.5`

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:10](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/SphereEmitterShape.ts#L10)

## Methods

### sample()

> **sample**(): [`SpawnSample`](../interfaces/SpawnSample.md)

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:12](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/SphereEmitterShape.ts#L12)

Gera uma posição e direção inicial no espaço local do emitter.

#### Returns

[`SpawnSample`](../interfaces/SpawnSample.md)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`sample`](../interfaces/EmitterShape.md#sample)
