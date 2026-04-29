[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ConeEmitterShape

# Class: ConeEmitterShape

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:3](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/shapes/ConeEmitterShape.ts#L3)

## Implements

- [`EmitterShape`](../interfaces/EmitterShape.md)

## Constructors

### Constructor

> **new ConeEmitterShape**(`origin?`, `direction?`, `halfAngle?`, `speed?`): `ConeEmitterShape`

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:4](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/shapes/ConeEmitterShape.ts#L4)

#### Parameters

##### origin?

readonly \[`number`, `number`, `number`\] = `...`

##### direction?

readonly \[`number`, `number`, `number`\] = `...`

##### halfAngle?

`number` = `...`

##### speed?

`number` = `1`

#### Returns

`ConeEmitterShape`

## Methods

### sample()

> **sample**(`rng`): [`SpawnSample`](../interfaces/SpawnSample.md)

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:11](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/shapes/ConeEmitterShape.ts#L11)

#### Parameters

##### rng

() => `number`

#### Returns

[`SpawnSample`](../interfaces/SpawnSample.md)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`sample`](../interfaces/EmitterShape.md#sample)
