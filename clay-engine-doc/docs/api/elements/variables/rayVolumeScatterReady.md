[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / rayVolumeScatterReady

# Variable: rayVolumeScatterReady

> `const` **rayVolumeScatterReady**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/raytrace/points.ts:100](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/points.ts#L100)

`fn ray_volume_scatter(origin: vec3f, dir: vec3f, t_max: f32, u: f32) -> RayVolumeScatter` — uma amostra do
espalhamento dos meios participantes no segmento (spec 034, T058), no ponto `u · t_max` (`u` uniforme em [0, 1)):
quem transporta luz por raios soma a das fontes que chega ao ponto e a luz que o meio devolve; pronto: peso 0.
