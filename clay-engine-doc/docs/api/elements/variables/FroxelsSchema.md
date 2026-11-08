[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FroxelsSchema

# Variable: FroxelsSchema

> `const` **FroxelsSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/media/schemas.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/schemas.ts#L62)

Parâmetros dos froxels (uniform, R12): `grid` = (x, y, z, slot da câmera); `depth` = (distância da primeira fatia, da
última, ln(última/primeira), 1 com névoa no quadro); `frame` = (jitter x, y, z em [0, 1), tempo); `counts` = (slots do
pool dos volumes, slots das luzes, quadro, 1 com histórico válido). A câmera (matrizes e posição) vem do pool
`CameraMatrices` pelo slot.
