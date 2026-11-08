[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ProbeStateSchema

# Variable: ProbeStateSchema

> `const` **ProbeStateSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/lighting/schemas.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/schemas.ts#L73)

Estado de uma sonda: o deslocamento da relocação (xyz) e o estado em `w` (0 ativa, 1 dentro da geometria — desligada,
2 nova); `coord` = a célula de mundo que a sonda ocupa (com o endereçamento circular, a sonda que muda de célula
recomeça o histórico) e, em `w`, o quadro da última grande mudança.
