[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / wgslLib

# Variable: wgslLib

> `const` **wgslLib**: `Readonly`\<\{ `atomicAlloc`: `WgslModule`; `brdf`: `WgslModule`; `color`: `WgslModule`; `fem`: `WgslModule`; `fixedPoint`: `WgslModule`; `lcp`: `WgslModule`; `linalg`: `WgslModule`; `mat`: `WgslModule`; `mpmWeights`: `WgslModule`; `noise`: `WgslModule`; `quat`: `WgslModule`; `sdf`: `WgslModule`; `sphKernels`: `WgslModule`; `xpbd`: `WgslModule`; \}\>

Defined in: [elements/gpu/shaders/index.ts:21](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/gpu/shaders/index.ts#L21)

Biblioteca de módulos WGSL de base do motor (spec 005): cada função matemática existe num único módulo, usado por
compute e por render. Estágios e extensões declaram os módulos de que dependem em `requires`.
