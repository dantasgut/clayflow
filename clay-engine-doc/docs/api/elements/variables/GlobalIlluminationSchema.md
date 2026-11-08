[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / GlobalIlluminationSchema

# Variable: GlobalIlluminationSchema

> `const` **GlobalIlluminationSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/lighting/schemas.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/schemas.ts#L39)

Parâmetros da iluminação global (uniform, spec 033, R2/R5/R6): a grade (sondas por eixo, cascatas), o canto de cada
cascata em mundo com o espaçamento em `w`, os raios (por sonda, quadro, primeira sonda e sondas atualizadas), o
ajuste (histerese, vieses de normal e de vista, distância máxima), os rebatimentos e a rotação dos raios do quadro.
