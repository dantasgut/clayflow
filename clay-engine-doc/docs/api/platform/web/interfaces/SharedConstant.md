[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SharedConstant

# Interface: SharedConstant\<V\>

Defined in: [src/scene/shaders/SharedConstant.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/SharedConstant.ts#L10)

Constante com fonte única para TypeScript e WGSL (spec 031, R6): `value` no TS e `module` (um `const` WGSL) para
`requires`. Ex.: `@compute @workgroup_size(WORKGROUP_SIZE)`.

## Type Parameters

### V

`V` *extends* `number` \| readonly `number`[] = `number` \| readonly `number`[]

## Properties

### module

> `readonly` **module**: [`WgslModule`](WgslModule.md)

Defined in: [src/scene/shaders/SharedConstant.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/SharedConstant.ts#L18)

Módulo com a declaração `const`.

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/shaders/SharedConstant.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/SharedConstant.ts#L12)

Nome do `const` WGSL.

***

### type

> `readonly` **type**: [`SharedConstantType`](../type-aliases/SharedConstantType.md)

Defined in: [src/scene/shaders/SharedConstant.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/SharedConstant.ts#L16)

Tipo WGSL.

***

### value

> `readonly` **value**: `V`

Defined in: [src/scene/shaders/SharedConstant.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/SharedConstant.ts#L14)

Valor.
