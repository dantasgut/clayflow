[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / rayVolumeHitReady

# Variable: rayVolumeHitReady

> `const` **rayVolumeHitReady**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/raytrace/points.ts:59](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/points.ts#L59)

`fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32, side: i32) -> RayVolumeHit` — o cruzamento mais próximo do
raio (direção unitária) com a superfície de um volume até `t_max` (entrando, ou saindo quando a origem está dentro);
`side`: o lado da origem quando quem chama o sabe (0 fora, 1 dentro: a partida de uma superfície que ele acabou de
cruzar ou em que refletiu — a superfície de partida não é reacertada), −1 quando não; pronto: sem acerto.
