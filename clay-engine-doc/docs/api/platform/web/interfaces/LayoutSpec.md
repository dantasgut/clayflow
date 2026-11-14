[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / LayoutSpec

# Interface: LayoutSpec

Defined in: [src/core/contracts/specs/LayoutSpec.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/LayoutSpec.ts#L12)

Spec de bindgroup layout GPU — define a "forma" de um bindgroup:
que tipos de bindings existem em quais slots, com que visibility.
Materializado em GPUBindGroupLayout.

Pipelines referenciam layouts (não bindgroups) para validação em
compile time. Bindgroups concretos podem variar por instância mas
todos compatíveis com o mesmo layout.

## Properties

### discriminator?

> `readonly` `optional` **discriminator?**: `string`

Defined in: [src/core/contracts/specs/LayoutSpec.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/LayoutSpec.ts#L16)

Discriminador semântico (e.g. 'forward_camera_layout'). Parte do specHash.

***

### entries

> `readonly` **entries**: readonly `BindingLayoutEntry`[]

Defined in: [src/core/contracts/specs/LayoutSpec.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/LayoutSpec.ts#L20)

Entries que descrevem cada binding (slot + visibility + type-specific).

***

### kind

> `readonly` **kind**: `"layout"`

Defined in: [src/core/contracts/specs/LayoutSpec.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/LayoutSpec.ts#L14)

Discriminador de tipo — sempre `'layout'`.

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [src/core/contracts/specs/LayoutSpec.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/LayoutSpec.ts#L18)

Label para debugging.
