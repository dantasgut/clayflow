[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SphereEmitterShape

# Class: SphereEmitterShape

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:3](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/shapes/SphereEmitterShape.ts#L3)

Shape de emissão — define o volume de onde partículas spawnam e
a direção inicial. Implementações: SphereEmitterShape (esfera),
ConeEmitterShape (cone direcional), etc.

## Implements

- [`EmitterShape`](../interfaces/EmitterShape.md)

## Constructors

### Constructor

> **new SphereEmitterShape**(`radius?`, `center?`, `speed?`): `SphereEmitterShape`

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:4](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/shapes/SphereEmitterShape.ts#L4)

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

### gpu()

> **gpu**(): [`EmitterShapeGpu`](../interfaces/EmitterShapeGpu.md)

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:31](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/shapes/SphereEmitterShape.ts#L31)

Esfera na GPU: superfície do raio em torno do centro, velocidade radial.

#### Returns

[`EmitterShapeGpu`](../interfaces/EmitterShapeGpu.md)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`gpu`](../interfaces/EmitterShape.md#gpu)

***

### sample()

> **sample**(`rng`): [`SpawnSample`](../interfaces/SpawnSample.md)

Defined in: [elements/particles/shapes/SphereEmitterShape.ts:10](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/shapes/SphereEmitterShape.ts#L10)

Sampleia um novo spawn point. `rng` é uma função pseudo-random
(default: Math.random). Retorna position + velocity para a partícula.

#### Parameters

##### rng

() => `number`

#### Returns

[`SpawnSample`](../interfaces/SpawnSample.md)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`sample`](../interfaces/EmitterShape.md#sample)
