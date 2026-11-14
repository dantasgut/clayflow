[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SURFACE\_COLLIDER\_HEADER

# Variable: SURFACE\_COLLIDER\_HEADER

> `const` **SURFACE\_COLLIDER\_HEADER**: `64` = `64`

Defined in: [src/elements/physics/colliders/SurfaceCollider.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/SurfaceCollider.ts#L20)

Floats do cabeçalho de cada cópia do campo, escrito pela GPU na construção: caixa local (mín. e máx.) com o tamanho
da célula, a inversa da matriz de mundo, a matriz normal (mundo ← local), a escala local → mundo das distâncias e o
número de cópias construídas no quadro e os tempos delas (`surface_collider_hit.wgsl`).
