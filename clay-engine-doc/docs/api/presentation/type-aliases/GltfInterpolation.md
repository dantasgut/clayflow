[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfInterpolation

# Type Alias: GltfInterpolation

> **GltfInterpolation** = `"LINEAR"` \| `"STEP"` \| `"CUBICSPLINE"`

Defined in: [presentation/assets/GltfLoader.ts:81](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/assets/GltfLoader.ts#L81)

Modo de interpolação entre keyframes.
  - `LINEAR`: lerp normal.
  - `STEP`: hold (sem interpolação).
  - `CUBICSPLINE`: 3 valores por keyframe (in-tangent, value, out-tangent).
