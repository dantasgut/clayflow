[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SURFACE\_COLLIDER\_HEADER

# Variable: SURFACE\_COLLIDER\_HEADER

> `const` **SURFACE\_COLLIDER\_HEADER**: `64` = `64`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:20](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L20)

Floats do cabeçalho de cada cópia do campo, escrito pela GPU na construção: caixa local (mín. e máx.) com o tamanho
da célula, a inversa da matriz de mundo, a matriz normal (mundo ← local), a escala local → mundo das distâncias e o
número de cópias construídas no quadro e os tempos delas (`surface_collider_hit.wgsl`).
