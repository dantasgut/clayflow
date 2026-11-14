[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FluidFieldData

# Interface: FluidFieldData

Defined in: [src/elements/fields/FluidField.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L53)

Dado de um `FluidField`: as capacidades, o uniform (escrito pelo estágio quando muda) e se há fluido na cena.

## Extends

- [`FluidFieldCapacity`](FluidFieldCapacity.md)

## Properties

### bricks

> `readonly` **bricks**: `number`

Defined in: [src/elements/fields/FluidField.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L48)

#### Inherited from

[`FluidFieldCapacity`](FluidFieldCapacity.md).[`bricks`](FluidFieldCapacity.md#bricks)

***

### params

> **params**: \[`Record`\<`string`, `number`[] \| `number`[][]\>\]

Defined in: [src/elements/fields/FluidField.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L54)

***

### table

> `readonly` **table**: `number`

Defined in: [src/elements/fields/FluidField.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L49)

#### Inherited from

[`FluidFieldCapacity`](FluidFieldCapacity.md).[`table`](FluidFieldCapacity.md#table)

***

### volume

> **volume**: `number`

Defined in: [src/elements/fields/FluidField.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L56)

1 com corpos de fluido na cena (o campo contribui para os raios); 0 sem. Escrito só quando muda.
