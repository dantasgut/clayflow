[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfInterpolation

# Type Alias: GltfInterpolation

> **GltfInterpolation** = `"LINEAR"` \| `"STEP"` \| `"CUBICSPLINE"`

Defined in: [presentation/assets/GltfLoader.ts:81](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L81)

Modo de interpolação entre keyframes.
  - `LINEAR`: lerp normal.
  - `STEP`: hold (sem interpolação).
  - `CUBICSPLINE`: 3 valores por keyframe (in-tangent, value, out-tangent).
