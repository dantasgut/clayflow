[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FogDensity

# Type Alias: FogDensity

> **FogDensity** = `number` \| [`ExtensionFunctionOptions`](../../platform/web/type-aliases/ExtensionFunctionOptions.md) \| \{ `grid`: [`FogDensityGrid`](../interfaces/FogDensityGrid.md); \}

Defined in: [src/elements/media/FogVolume.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FogVolume.ts#L25)

Densidade de um `FogVolume`: a extinção constante (1/m), uma função WGSL ou um grafo de nós do ponto `fog_density`
(a densidade relativa no ponto, × `extinction`), ou uma grade de valores relativos (× `extinction`).
