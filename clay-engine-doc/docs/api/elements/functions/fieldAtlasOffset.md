[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / fieldAtlasOffset

# Function: fieldAtlasOffset()

> **fieldAtlasOffset**(`c`): `number`

Defined in: [src/elements/fields/FluidField.ts:96](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L96)

Primeira palavra do atlas dos voxels (T060f), no fim do buffer das consultas, depois do meio dos corpos: a página do
bloco i (os 12³ voxels com a borda, f32) a partir de `fieldAtlasOffset + i · 12³`. As páginas são a série por páginas
do buffer (`history.pages.offset`): uma ligação de storage só para tudo o que quem consulta lê.

## Parameters

### c

[`FluidFieldCapacity`](../interfaces/FluidFieldCapacity.md)

## Returns

`number`
