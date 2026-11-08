[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / rayVolumeMaterial

# Variable: rayVolumeMaterial

> `const` **rayVolumeMaterial**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/raytrace/points.ts:343](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/points.ts#L343)

O material de um acerto de volume avaliado: a amostra de superfície do acerto (`ray_volume_sample`: o ponto, a
normal e o tempo; sem uv nem geometria diferencial), as constantes padrão do `StandardMaterial` (o volume não tem
material de desenho, `ray_volume_standard`) e `ray_volume_closure(hit, time)` — a função pela composição dos
acertos ou o fechamento pronto do contribuinte.
