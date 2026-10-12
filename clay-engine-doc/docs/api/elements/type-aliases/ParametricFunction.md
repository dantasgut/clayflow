[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParametricFunction

# Type Alias: ParametricFunction

> **ParametricFunction** = (`u`, `v`) => readonly \[`number`, `number`, `number`\]

Defined in: [elements/geometry/ParametricGeometry.ts:15](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/geometry/ParametricGeometry.ts#L15)

Função paramétrica que mapeia coordenadas (u, v) ∈ [0,1]² → posição 3D.
Usada por `ParametricGeometry` para gerar superfícies (e.g. esfera,
torus, hélice) a partir de fórmulas matemáticas.

## Parameters

### u

`number`

Coordenada paramétrica horizontal (0..1).

### v

`number`

Coordenada paramétrica vertical (0..1).

## Returns

readonly \[`number`, `number`, `number`\]

Posição [x, y, z] em world coords.
