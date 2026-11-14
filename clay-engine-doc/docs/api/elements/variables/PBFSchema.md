[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / PBFSchema

# Variable: PBFSchema

> `const` **PBFSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/physics/bodies/schemas/PBFSchema.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/schemas/PBFSchema.ts#L10)

Schema da partícula PBF (5 vec4f = 80B).
Fonte única do struct WGSL `PBFParticle` (gerado deste schema pela montagem dos shaders) (pos.w=lambda, curl=vorticity).
`contact`: o sólido mais próximo ao alcance do núcleo (normal para fora dele, distância com sinal em w; sem sólido,
normal zero) — escrito pela fronteira sólida a cada iteração do solver e lido pelo campo dos fluidos (spec 034).
