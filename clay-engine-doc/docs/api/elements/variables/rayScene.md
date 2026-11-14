[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / rayScene

# Variable: rayScene

> `const` **rayScene**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/raytrace/shaders.ts:100](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/shaders.ts#L100)

Consulta da estrutura de raios: `ray_scene_hit(origin, dir, t_max) -> RayHit` e `ray_scene_occluded(origin, dir,
t_max) -> bool` (spec 033, FR-003). O contrato não expõe a origem da geometria; liga dois buffers de storage.
