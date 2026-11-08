[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SkySchema

# Variable: SkySchema

> `const` **SkySchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/scene/sky/SkySchema.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/sky/SkySchema.ts#L10)

Parâmetros do céu físico (uniform, spec 033, R4): o sol (direção para ele, iluminância com o raio angular em `w`), os
coeficientes da atmosfera em km — Rayleigh (espalhamento, altura de escala), Mie (espalhamento, extinção, altura de
escala, assimetria), ozônio (absorção, centro) —, os raios (chão, topo, meia largura do ozônio, altitude do
observador), o albedo do chão, o piso noturno e o slot da luz do sol no pool `Light`.
