[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / rayVolumeTypes

# Variable: rayVolumeTypes

> `const` **rayVolumeTypes**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/raytrace/points.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/points.ts#L22)

Acerto de um raio na superfície de um volume: distância, ponto, normal (para fora), o material no contribuinte, lado
da origem, o contribuinte (`source`, a ordem dele no ponto: escrito pela combinação) e se a superfície mudou desde o
quadro anterior (`moved`: quem acumula o que os raios veem encurta o histórico por ela, como pelas instâncias que se
moveram).
