[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / EmitterShape

# Interface: EmitterShape

Defined in: [elements/particles/shapes/EmitterShape.ts:17](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/shapes/EmitterShape.ts#L17)

Shape de emissão — define o volume de onde partículas spawnam e
a direção inicial. Implementações: SphereEmitterShape (esfera),
ConeEmitterShape (cone direcional), etc.

## Methods

### gpu()

> **gpu**(): [`EmitterShapeGpu`](EmitterShapeGpu.md)

Defined in: [elements/particles/shapes/EmitterShape.ts:24](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/shapes/EmitterShape.ts#L24)

A forma para a emissão na GPU (`ComputeParticleEmitter`, spec 009): tipo e vetores lidos por `emit_fn_ready`.

#### Returns

[`EmitterShapeGpu`](EmitterShapeGpu.md)

***

### sample()

> **sample**(`rng`): [`SpawnSample`](SpawnSample.md)

Defined in: [elements/particles/shapes/EmitterShape.ts:22](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/shapes/EmitterShape.ts#L22)

Sampleia um novo spawn point. `rng` é uma função pseudo-random
(default: Math.random). Retorna position + velocity para a partícula.

#### Parameters

##### rng

() => `number`

#### Returns

[`SpawnSample`](SpawnSample.md)
