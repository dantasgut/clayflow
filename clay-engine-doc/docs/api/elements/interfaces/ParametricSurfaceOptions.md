[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParametricSurfaceOptions

# Interface: ParametricSurfaceOptions

Defined in: [elements/geometry/ParametricSurface.ts:11](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L11)

Opções de `ParametricSurface`.

## Properties

### adaptive?

> `readonly` `optional` **adaptive?**: [`AdaptiveOptions`](AdaptiveOptions.md)

Defined in: [elements/geometry/ParametricSurface.ts:34](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L34)

Malha adaptativa (spec 010): mais triângulos onde a superfície curva mais e perto da câmera, sem frestas, contada e
desenhada pela GPU (desenho indireto). Liga `differential`. A malha uniforme (sem esta opção) continua o padrão.

***

### animated?

> `readonly` `optional` **animated?**: `boolean`

Defined in: [elements/geometry/ParametricSurface.ts:24](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L24)

A função depende do tempo: reavalia a cada quadro. Default false (reavalia quando algo muda).

***

### differential?

> `readonly` `optional` **differential?**: `boolean`

Defined in: [elements/geometry/ParametricSurface.ts:29](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L29)

Geometria diferencial por vértice (spec 010): métrica, segunda forma, curvaturas e direção principal no pool
`SurfaceDiff`, lidas pelo material (`SurfaceSample`). Default false. Fixo da construção.

***

### domain?

> `readonly` `optional` **domain?**: readonly \[`number`, `number`, `number`, `number`\]

Defined in: [elements/geometry/ParametricSurface.ts:15](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L15)

Domínio [u0, u1, v0, v1]. Default pela superfície pronta (ex.: esfera [0, 2π, 0, π]).

***

### params?

> `readonly` `optional` **params?**: readonly `number`[]

Defined in: [elements/geometry/ParametricSurface.ts:22](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L22)

Valores da pronta: esfera [raio]; toro [raio maior, raio menor]; terreno [altura, escala do ruído, oitavas].
Default por superfície (esfera 1; toro [1, 0,3]; terreno [0,5, 1, 4]).

***

### preset?

> `readonly` `optional` **preset?**: [`SurfacePreset`](../type-aliases/SurfacePreset.md)

Defined in: [elements/geometry/ParametricSurface.ts:17](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L17)

Superfície pronta quando a entidade não tem `SurfaceFunction`. Default `'plane'`.

***

### resolution?

> `readonly` `optional` **resolution?**: readonly \[`number`, `number`\]

Defined in: [elements/geometry/ParametricSurface.ts:13](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L13)

Vértices em u e em v (≥ 2). Default [64, 32].
