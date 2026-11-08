[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / InferredGroup

# Interface: InferredGroup

Defined in: [src/scene/systems/LayoutInferencer.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L82)

Entradas de um `@group(N)`. Grupos sem binding usado ficam com `entries` vazio (o índice é preservado).

## Properties

### entries

> `readonly` **entries**: readonly [`InferredEntry`](InferredEntry.md)[]

Defined in: [src/scene/systems/LayoutInferencer.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L86)

Entradas usadas pelas entradas pedidas, em ordem de binding.

***

### frequency?

> `readonly` `optional` **frequency?**: [`BindingFrequency`](../type-aliases/BindingFrequency.md)

Defined in: [src/scene/systems/LayoutInferencer.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L88)

Frequência do grupo (recursos declarados, spec 031).

***

### group

> `readonly` **group**: `number`

Defined in: [src/scene/systems/LayoutInferencer.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L84)

Índice do `@group`.
