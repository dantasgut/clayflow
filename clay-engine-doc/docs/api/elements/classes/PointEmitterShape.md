[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PointEmitterShape

# Class: PointEmitterShape

Defined in: [elements/particles/shapes/PointEmitterShape.ts:3](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/particles/shapes/PointEmitterShape.ts#L3)

Shape de emissão — define o volume de onde partículas spawnam e
a direção inicial. Implementações: SphereEmitterShape (esfera),
ConeEmitterShape (cone direcional), etc.

## Implements

- [`EmitterShape`](../interfaces/EmitterShape.md)

## Constructors

### Constructor

> **new PointEmitterShape**(`position?`, `velocity?`): `PointEmitterShape`

Defined in: [elements/particles/shapes/PointEmitterShape.ts:4](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/particles/shapes/PointEmitterShape.ts#L4)

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

Defined in: [elements/particles/shapes/PointEmitterShape.ts:9](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/particles/shapes/PointEmitterShape.ts#L9)

Sampleia um novo spawn point. `rng` é uma função pseudo-random
(default: Math.random). Retorna position + velocity para a partícula.

#### Parameters

##### \_rng

() => `number`

#### Returns

[`SpawnSample`](../interfaces/SpawnSample.md)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`sample`](../interfaces/EmitterShape.md#sample)
