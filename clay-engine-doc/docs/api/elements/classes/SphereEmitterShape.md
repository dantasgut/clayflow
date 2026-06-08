[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SphereEmitterShape

# Class: SphereEmitterShape

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:3](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/shapes/SphereEmitterShape.ts#L3)

Shape de emissão — define o volume de onde partículas spawnam e
a direção inicial. Implementações: SphereEmitterShape (esfera),
ConeEmitterShape (cone direcional), etc.

## Implements

- [`EmitterShape`](../interfaces/EmitterShape.md)

## Constructors

### Constructor

> **new SphereEmitterShape**(`radius?`, `center?`, `speed?`): `SphereEmitterShape`

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:4](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/shapes/SphereEmitterShape.ts#L4)

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

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:10](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/shapes/SphereEmitterShape.ts#L10)

Sampleia um novo spawn point. `rng` é uma função pseudo-random
(default: Math.random). Retorna position + velocity para a partícula.

#### Parameters

##### rng

() => `number`

#### Returns

[`SpawnSample`](../interfaces/SpawnSample.md)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`sample`](../interfaces/EmitterShape.md#sample)
