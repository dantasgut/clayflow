[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfInterpolation

# Type Alias: GltfInterpolation

> **GltfInterpolation** = `"LINEAR"` \| `"STEP"` \| `"CUBICSPLINE"`

Defined in: [presentation/assets/GltfLoader.ts:81](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/assets/GltfLoader.ts#L81)

Modo de interpolação entre keyframes.
  - `LINEAR`: lerp normal.
  - `STEP`: hold (sem interpolação).
  - `CUBICSPLINE`: 3 valores por keyframe (in-tangent, value, out-tangent).
