[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SphereEmitterShape

# Class: SphereEmitterShape

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:3](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/shapes/SphereEmitterShape.ts#L3)

## Implements

- [`EmitterShape`](../interfaces/EmitterShape.md)

## Constructors

### Constructor

> **new SphereEmitterShape**(`radius?`, `center?`, `speed?`): `SphereEmitterShape`

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:4](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/shapes/SphereEmitterShape.ts#L4)

#### Parameters

##### radius?

`number` = `1`

##### center?

readonly \[`number`, `number`, `number`\] = `...`

##### speed?

`number` = `1`

#### Returns

`SphereEmitterShape`

## Methods

### sample()

> **sample**(`rng`): [`SpawnSample`](../interfaces/SpawnSample.md)

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/shapes/SphereEmitterShape.ts#L10)

#### Parameters

##### rng

() => `number`

#### Returns

[`SpawnSample`](../interfaces/SpawnSample.md)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`sample`](../interfaces/EmitterShape.md#sample)
