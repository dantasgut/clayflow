[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / EmitterShape

# Interface: EmitterShape

Defined in: [elements/particles/shapes/EmitterShape.ts:17](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/particles/shapes/EmitterShape.ts#L17)

Shape de emissão — define o volume de onde partículas spawnam e
a direção inicial. Implementações: SphereEmitterShape (esfera),
ConeEmitterShape (cone direcional), etc.

## Methods

### sample()

> **sample**(`rng`): [`SpawnSample`](SpawnSample.md)

Defined in: [elements/particles/shapes/EmitterShape.ts:22](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/particles/shapes/EmitterShape.ts#L22)

Sampleia um novo spawn point. `rng` é uma função pseudo-random
(default: Math.random). Retorna position + velocity para a partícula.

#### Parameters

##### rng

() => `number`

#### Returns

[`SpawnSample`](SpawnSample.md)
