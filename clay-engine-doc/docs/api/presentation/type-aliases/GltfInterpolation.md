[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfInterpolation

# Type Alias: GltfInterpolation

> **GltfInterpolation** = `"LINEAR"` \| `"STEP"` \| `"CUBICSPLINE"`

Defined in: [presentation/assets/GltfLoader.ts:81](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/assets/GltfLoader.ts#L81)

Modo de interpolação entre keyframes.
  - `LINEAR`: lerp normal.
  - `STEP`: hold (sem interpolação).
  - `CUBICSPLINE`: 3 valores por keyframe (in-tangent, value, out-tangent).
