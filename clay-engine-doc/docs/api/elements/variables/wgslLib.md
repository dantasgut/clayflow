[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / wgslLib

# Variable: wgslLib

> `const` **wgslLib**: `Readonly`\<\{ `atomicAlloc`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `bsdf`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `camera`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `color`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `fem`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `finite`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `fixedPoint`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `lcp`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `linalg`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `mat`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `mpmWeights`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `noise`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `poolLive`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `present`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `quat`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `sdf`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `shadowVirtual`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `sphKernels`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `viewSpace`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `xformAffine`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `xformProjective`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `xformRigid`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `xformTrs`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); `xpbd`: [`WgslModule`](../../platform/web/interfaces/WgslModule.md); \}\>

Defined in: [src/elements/gpu/shaders/index.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/shaders/index.ts#L30)

Biblioteca de módulos WGSL de base do motor (spec 005): cada função matemática existe num único módulo, usado por
compute e por render. Estágios e extensões declaram os módulos de que dependem em `requires`.
