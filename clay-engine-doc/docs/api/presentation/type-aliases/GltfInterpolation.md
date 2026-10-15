[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfInterpolation

# Type Alias: GltfInterpolation

> **GltfInterpolation** = `"LINEAR"` \| `"STEP"` \| `"CUBICSPLINE"`

Defined in: [presentation/assets/GltfLoader.ts:81](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/assets/GltfLoader.ts#L81)

Modo de interpolação entre keyframes.
  - `LINEAR`: lerp normal.
  - `STEP`: hold (sem interpolação).
  - `CUBICSPLINE`: 3 valores por keyframe (in-tangent, value, out-tangent).
