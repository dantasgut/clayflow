[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / EmitterShape

# Interface: EmitterShape

Defined in: [src/elements/particles/shapes/EmitterShape.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/shapes/EmitterShape.ts#L17)

Shape de emissão — define o volume de onde partículas spawnam e
a direção inicial. Implementações: SphereEmitterShape (esfera),
ConeEmitterShape (cone direcional), etc.

## Methods

### gpu()

> **gpu**(): [`EmitterShapeGpu`](EmitterShapeGpu.md)

Defined in: [src/elements/particles/shapes/EmitterShape.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/shapes/EmitterShape.ts#L24)

A forma para a emissão na GPU (`ComputeParticleEmitter`, spec 009): tipo e vetores lidos por `emit_fn_ready`.

#### Returns

[`EmitterShapeGpu`](EmitterShapeGpu.md)

***

### sample()

> **sample**(`rng`): [`SpawnSample`](SpawnSample.md)

Defined in: [src/elements/particles/shapes/EmitterShape.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/shapes/EmitterShape.ts#L22)

Sampleia um novo spawn point. `rng` é uma função pseudo-random
(default: Math.random). Retorna position + velocity para a partícula.

#### Parameters

##### rng

() => `number`

#### Returns

[`SpawnSample`](SpawnSample.md)
