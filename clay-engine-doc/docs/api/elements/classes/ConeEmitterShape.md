[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ConeEmitterShape

# Class: ConeEmitterShape

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:3](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/shapes/ConeEmitterShape.ts#L3)

Shape de emissão — define o volume de onde partículas spawnam e
a direção inicial. Implementações: SphereEmitterShape (esfera),
ConeEmitterShape (cone direcional), etc.

## Implements

- [`EmitterShape`](../interfaces/EmitterShape.md)

## Constructors

### Constructor

> **new ConeEmitterShape**(`origin?`, `direction?`, `halfAngle?`, `speed?`): `ConeEmitterShape`

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:4](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/shapes/ConeEmitterShape.ts#L4)

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

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:11](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/shapes/ConeEmitterShape.ts#L11)

Sampleia um novo spawn point. `rng` é uma função pseudo-random
(default: Math.random). Retorna position + velocity para a partícula.

#### Parameters

##### rng

() => `number`

#### Returns

[`SpawnSample`](../interfaces/SpawnSample.md)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`sample`](../interfaces/EmitterShape.md#sample)
