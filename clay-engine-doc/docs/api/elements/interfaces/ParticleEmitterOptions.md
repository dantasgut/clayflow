[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ParticleEmitterOptions

# Interface: ParticleEmitterOptions

Defined in: [src/elements/particles/ParticleEmitter.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/ParticleEmitter.ts#L13)

Opções comuns a todos os particle emitters. Subclasses concretas
(ComputeParticleEmitter, ScriptedParticleEmitter) podem adicionar opções
específicas via cast em `data`.

## Properties

### lifetime?

> `readonly` `optional` **lifetime?**: `number`

Defined in: [src/elements/particles/ParticleEmitter.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/ParticleEmitter.ts#L19)

Lifetime de cada partícula em segundos antes de morrer. Default: 2.0.

***

### maxParticles?

> `readonly` `optional` **maxParticles?**: `number`

Defined in: [src/elements/particles/ParticleEmitter.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/ParticleEmitter.ts#L15)

Capacidade máxima do pool de partículas. Default: 1024.

***

### rate?

> `readonly` `optional` **rate?**: `number`

Defined in: [src/elements/particles/ParticleEmitter.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/ParticleEmitter.ts#L17)

Taxa de emissão (partículas por segundo). Default: 100.

***

### seed?

> `readonly` `optional` **seed?**: `number`

Defined in: [src/elements/particles/ParticleEmitter.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/ParticleEmitter.ts#L23)

Semente do sorteio da emissão na GPU (padrão 1).

***

### shape?

> `readonly` `optional` **shape?**: [`EmitterShape`](EmitterShape.md)

Defined in: [src/elements/particles/ParticleEmitter.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/ParticleEmitter.ts#L21)

Shape de emissão (sphere, cone, box, point). Default: ponto na origem.
