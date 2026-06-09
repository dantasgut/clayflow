[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / Heightmap

# Interface: Heightmap

Defined in: [presentation/assets/HeightmapLoader.ts:6](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/HeightmapLoader.ts#L6)

Heightmap carregado — array de alturas normalizadas (0..1) em layout
row-major `heights[y*width + x]`. Apps usam para gerar terrain meshes
via `ParametricGeometry` ou displacement mapping.

## Properties

### height

> `readonly` **height**: `number`

Defined in: [presentation/assets/HeightmapLoader.ts:10](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/HeightmapLoader.ts#L10)

Altura em texels.

***

### heights

> `readonly` **heights**: `Float32Array`

Defined in: [presentation/assets/HeightmapLoader.ts:12](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/HeightmapLoader.ts#L12)

Float32Array com width × height alturas (canal R do PNG, normalizado 0..1).

***

### width

> `readonly` **width**: `number`

Defined in: [presentation/assets/HeightmapLoader.ts:8](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/HeightmapLoader.ts#L8)

Largura em texels.
