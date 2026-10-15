[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParametricSurfaceOptions

# Interface: ParametricSurfaceOptions

Defined in: [elements/geometry/ParametricSurface.ts:10](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L10)

Opções de `ParametricSurface`.

## Properties

### animated?

> `readonly` `optional` **animated?**: `boolean`

Defined in: [elements/geometry/ParametricSurface.ts:23](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L23)

A função depende do tempo: reavalia a cada quadro. Default false (reavalia quando algo muda).

***

### domain?

> `readonly` `optional` **domain?**: readonly \[`number`, `number`, `number`, `number`\]

Defined in: [elements/geometry/ParametricSurface.ts:14](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L14)

Domínio [u0, u1, v0, v1]. Default pela superfície pronta (ex.: esfera [0, 2π, 0, π]).

***

### params?

> `readonly` `optional` **params?**: readonly `number`[]

Defined in: [elements/geometry/ParametricSurface.ts:21](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L21)

Valores da pronta: esfera [raio]; toro [raio maior, raio menor]; terreno [altura, escala do ruído, oitavas].
Default por superfície (esfera 1; toro [1, 0,3]; terreno [0,5, 1, 4]).

***

### preset?

> `readonly` `optional` **preset?**: [`SurfacePreset`](../type-aliases/SurfacePreset.md)

Defined in: [elements/geometry/ParametricSurface.ts:16](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L16)

Superfície pronta quando a entidade não tem `SurfaceFunction`. Default `'plane'`.

***

### resolution?

> `readonly` `optional` **resolution?**: readonly \[`number`, `number`\]

Defined in: [elements/geometry/ParametricSurface.ts:12](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L12)

Vértices em u e em v (≥ 2). Default [64, 32].
