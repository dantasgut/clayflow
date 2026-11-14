[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FluidFieldSchema

# Variable: FluidFieldSchema

> `const` **FluidFieldSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/fields/schemas.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/schemas.ts#L58)

Parâmetros do campo dos fluidos (uniform, spec 033, R11): `sizes` = (partículas, capacidade de blocos, máscara da
tabela, iterações da eikonal); `grid` = (espaçamento, voxel, raio do núcleo, faixa útil); `tuning` = (suavização, razão máxima, raio dos
núcleos esparsos em fração, nível da superfície); `limits` = (vizinhos do núcleo anisotrópico, sondagens da tabela,
a primeira palavra dos blocos, a do atlas dos voxels — T060f); `contact` = (raio lateral e normal da gota pousada num sólido em frações do raio esparso, 0, 0; x = 0 sem
calota).
