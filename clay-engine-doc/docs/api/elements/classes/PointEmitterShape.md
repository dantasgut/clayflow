[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PointEmitterShape

# Class: PointEmitterShape

Defined in: [elements/particles/shapes/PointEmitterShape.ts:3](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/shapes/PointEmitterShape.ts#L3)

## Implements

- [`EmitterShape`](../interfaces/EmitterShape.md)

## Constructors

### Constructor

> **new PointEmitterShape**(`position?`, `velocity?`): `PointEmitterShape`

Defined in: [elements/particles/shapes/PointEmitterShape.ts:4](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/shapes/PointEmitterShape.ts#L4)

#### Parameters

##### position?

readonly \[`number`, `number`, `number`\] = `...`

##### velocity?

readonly \[`number`, `number`, `number`\] = `...`

#### Returns

`PointEmitterShape`

## Methods

### sample()

> **sample**(`_rng`): [`SpawnSample`](../interfaces/SpawnSample.md)

Defined in: [elements/particles/shapes/PointEmitterShape.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/shapes/PointEmitterShape.ts#L9)

#### Parameters

##### \_rng

() => `number`

#### Returns

[`SpawnSample`](../interfaces/SpawnSample.md)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`sample`](../interfaces/EmitterShape.md#sample)
