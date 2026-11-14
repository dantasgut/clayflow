[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / rayVolumeTransmittanceReady

# Variable: rayVolumeTransmittanceReady

> `const` **rayVolumeTransmittanceReady**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/raytrace/points.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/points.ts#L72)

`fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32, time: f32) -> vec3f` — a fração da luz que
atravessa os volumes no segmento (absorção pelo trecho dentro de cada um; `time`, o tempo simulado das funções
`material`); pronto: 1.
