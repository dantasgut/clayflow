[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / fogDensityPoint

# Variable: fogDensityPoint

> `const` **fogDensityPoint**: [`WgslPoint`](../../platform/web/interfaces/WgslPoint.md)

Defined in: [src/elements/media/shaders.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/shaders.ts#L149)

Ponto `fog_density` (spec 033, R12): `fn density_fn(p: vec3f, time: f32, data: DensityFnParams) -> f32` — a densidade
relativa do meio no ponto (mundo) no tempo simulado (multiplica a extinção do `FogVolume`). Por volume: a composição
das funções da cena escolhe pela do volume (`fogDensityAtPoint`). Disponíveis para a função: os módulos declarados
em `requires` (ex.: `wgslLib.noise`) ou os dos nós.
