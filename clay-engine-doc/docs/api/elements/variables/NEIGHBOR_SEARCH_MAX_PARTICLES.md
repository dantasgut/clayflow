[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / NEIGHBOR\_SEARCH\_MAX\_PARTICLES

# Variable: NEIGHBOR\_SEARCH\_MAX\_PARTICLES

> `const` **NEIGHBOR\_SEARCH\_MAX\_PARTICLES**: `131072` = `131072`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L63)

Teto de partículas por pool dos estágios que usam a busca de vizinhança (SPH, PBF): o tamanho das listas da grade.
A lista de vizinhos (128 por partícula, 4 bytes cada) fica em 64 MiB — metade do limite padrão do WebGPU por ligação
de storage (128 MiB), em qualquer plataforma; alocada só quando um estágio de fluido a usa.
