[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / wgslLib

# Variable: wgslLib

> `const` **wgslLib**: `Readonly`\<\{ `atomicAlloc`: `WgslModule`; `brdf`: `WgslModule`; `camera`: `WgslModule`; `color`: `WgslModule`; `fem`: `WgslModule`; `fixedPoint`: `WgslModule`; `lcp`: `WgslModule`; `linalg`: `WgslModule`; `mat`: `WgslModule`; `mpmWeights`: `WgslModule`; `noise`: `WgslModule`; `poolLive`: `WgslModule`; `quat`: `WgslModule`; `sdf`: `WgslModule`; `sphKernels`: `WgslModule`; `xpbd`: `WgslModule`; \}\>

Defined in: [elements/gpu/shaders/index.ts:22](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/gpu/shaders/index.ts#L22)

Biblioteca de módulos WGSL de base do motor (spec 005): cada função matemática existe num único módulo, usado por
compute e por render. Estágios e extensões declaram os módulos de que dependem em `requires`.
