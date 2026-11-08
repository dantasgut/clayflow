[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SoftBodySurface

# Interface: SoftBodySurface

Defined in: [src/elements/physics/bodies/SoftBody.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L82)

Superfície de um corpo mole: triângulos sobre as partículas.

## Properties

### triangles

> `readonly` **triangles**: `ArrayLike`\<`number`\>

Defined in: [src/elements/physics/bodies/SoftBody.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L84)

Triângulos: 3 índices locais de partícula por triângulo (anti-horário visto de fora).

***

### uvs?

> `readonly` `optional` **uvs?**: `ArrayLike`\<`number`\>

Defined in: [src/elements/physics/bodies/SoftBody.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L86)

Coordenadas de textura: `u, v` por partícula. Default zero.
