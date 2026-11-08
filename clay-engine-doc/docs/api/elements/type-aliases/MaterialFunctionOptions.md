[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / MaterialFunctionOptions

# Type Alias: MaterialFunctionOptions

> **MaterialFunctionOptions** = [`ExtensionFunctionOptions`](../../platform/web/type-aliases/ExtensionFunctionOptions.md) & `object`

Defined in: [src/elements/extension/MaterialFunction.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/extension/MaterialFunction.ts#L16)

Opções de uma `MaterialFunction`: código ou grafo, e os lobos que um código de fechamento usa.

## Type Declaration

### lobes?

> `readonly` `optional` **lobes?**: readonly [`LobeName`](LobeName.md)[]

Lobos que a função de código `-> Closure` produz (spec 011): o shader é especializado só com eles. Sem a lista,
todos. Ignorado num grafo (os lobos vêm dos nós) e nas funções `-> SurfaceParams` (difuso, especular e emissão).
