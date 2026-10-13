[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / GeometryData

# Interface: GeometryData

Defined in: [elements/geometry/Geometry.ts:15](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L15)

O que a base lê do `data` de uma geometria: vértices intercalados e índices (ausentes quando produzidos na GPU). As
subclasses estendem com os próprios campos.

## Extended by

- [`BoxGeometryData`](BoxGeometryData.md)
- [`SphereGeometryData`](SphereGeometryData.md)
- [`PlaneGeometryData`](PlaneGeometryData.md)
- [`PointCloudGeometryData`](PointCloudGeometryData.md)
- [`ParametricGeometryData`](ParametricGeometryData.md)

## Properties

### indices?

> `optional` **indices?**: `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:17](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L17)

***

### vertices?

> `optional` **vertices?**: `Float32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:16](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L16)
