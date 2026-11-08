[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / RayMaterialFunction

# Interface: RayMaterialFunction

Defined in: [src/elements/raytrace/RayScene.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RayScene.ts#L39)

Função `material` reunida nos acertos dos raios (a versão renomeada, spec 033 R3).

## Properties

### functionName

> `readonly` **functionName**: `string`

Defined in: [src/elements/raytrace/RayScene.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RayScene.ts#L43)

Nome da função no módulo.

***

### loaderName

> `readonly` **loaderName**: `string`

Defined in: [src/elements/raytrace/RayScene.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RayScene.ts#L45)

Nome do carregador de parâmetros no módulo.

***

### module

> `readonly` **module**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/raytrace/RayScene.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RayScene.ts#L41)

Módulo com a função e o carregador renomeados.

***

### returnsClosure

> `readonly` **returnsClosure**: `boolean`

Defined in: [src/elements/raytrace/RayScene.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RayScene.ts#L47)

A função devolve um fechamento (senão, `SurfaceParams`).
