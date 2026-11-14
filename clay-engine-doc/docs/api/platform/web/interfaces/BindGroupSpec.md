[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BindGroupSpec

# Interface: BindGroupSpec

Defined in: [src/core/contracts/specs/BindGroupSpec.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/BindGroupSpec.ts#L12)

Spec de bindgroup GPU — agrupa N bindings (buffers, texturas, samplers)
referenciáveis em um único `@group(N)` no shader. Materializado por
`core.create<BindGroupSpec>()` em GPUBindGroup.

O `layout` define o tipo/visibility de cada binding; `bindings` aponta
para os specs concretos (UniformBufferSpec, TextureViewSpec, etc.).

## Properties

### bindings

> `readonly` **bindings**: readonly `BindingEntry`[]

Defined in: [src/core/contracts/specs/BindGroupSpec.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/BindGroupSpec.ts#L22)

Bindings concretas (buffer/texture-view/sampler). Indices match layout entries.

***

### discriminator?

> `readonly` `optional` **discriminator?**: `string`

Defined in: [src/core/contracts/specs/BindGroupSpec.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/BindGroupSpec.ts#L16)

Discriminador semântico (e.g. 'forward_camera_bg:42'). Parte do specHash.

***

### kind

> `readonly` **kind**: `"bindgroup"`

Defined in: [src/core/contracts/specs/BindGroupSpec.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/BindGroupSpec.ts#L14)

Discriminador de tipo — sempre `'bindgroup'`.

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [src/core/contracts/specs/BindGroupSpec.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/BindGroupSpec.ts#L18)

Label para debugging.

***

### layout

> `readonly` **layout**: [`LayoutSpec`](LayoutSpec.md)

Defined in: [src/core/contracts/specs/BindGroupSpec.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/BindGroupSpec.ts#L20)

Layout que define visibility + types das bindings.
