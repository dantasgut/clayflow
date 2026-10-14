[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SoftBodySurface

# Interface: SoftBodySurface

Defined in: [elements/physics/bodies/SoftBody.ts:66](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/bodies/SoftBody.ts#L66)

Superfície de um corpo mole: triângulos sobre as partículas.

## Properties

### triangles

> `readonly` **triangles**: `ArrayLike`\<`number`\>

Defined in: [elements/physics/bodies/SoftBody.ts:68](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/bodies/SoftBody.ts#L68)

Triângulos: 3 índices locais de partícula por triângulo (anti-horário visto de fora).

***

### uvs?

> `readonly` `optional` **uvs?**: `ArrayLike`\<`number`\>

Defined in: [elements/physics/bodies/SoftBody.ts:70](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/bodies/SoftBody.ts#L70)

Coordenadas de textura: `u, v` por partícula. Default zero.
