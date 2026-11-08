[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ComputePipelineSpec

# Interface: ComputePipelineSpec

Defined in: [src/core/contracts/specs/ComputePipelineSpec.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/ComputePipelineSpec.ts#L13)

Spec de compute pipeline GPU — shader module + entry point + override
constants. Materializado em GPUComputePipeline via
`device.createComputePipeline({...})` ou `createComputePipelineAsync`.

O entry point é a função `@compute @workgroup_size(...)` no WGSL.
Override constants permitem parametrizar o shader sem recompile
(e.g. workgroup size dinâmico via `override WG_SIZE: u32 = 64`).

## Extends

- `PipelineSpec`

## Properties

### constants?

> `readonly` `optional` **constants?**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/core/contracts/specs/ComputePipelineSpec.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/ComputePipelineSpec.ts#L21)

Override constants WGSL (`override foo: f32 = 1.0`).

***

### discriminator?

> `readonly` `optional` **discriminator?**: `string`

Defined in: [src/core/contracts/specs/PipelineSpec.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/PipelineSpec.ts#L23)

Discriminador semântico (e.g. 'lcp_predict_pipeline'). Parte do specHash.

#### Inherited from

`PipelineSpec.discriminator`

***

### entryPoint

> `readonly` **entryPoint**: `string`

Defined in: [src/core/contracts/specs/ComputePipelineSpec.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/ComputePipelineSpec.ts#L19)

Nome da função `@compute @workgroup_size(...)`.

***

### kind

> `readonly` **kind**: `"pipeline"`

Defined in: [src/core/contracts/specs/PipelineSpec.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/PipelineSpec.ts#L19)

Discriminador de tipo — sempre `'pipeline'`.

#### Inherited from

`PipelineSpec.kind`

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [src/core/contracts/specs/PipelineSpec.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/PipelineSpec.ts#L25)

Label para debugging.

#### Inherited from

`PipelineSpec.label`

***

### layouts

> `readonly` **layouts**: readonly [`LayoutSpec`](LayoutSpec.md)[]

Defined in: [src/core/contracts/specs/PipelineSpec.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/PipelineSpec.ts#L30)

Layouts dos bindgroups esperados pelo pipeline. `layouts[N]` corresponde
a `@group(N)` no WGSL. Ordem importa.

#### Inherited from

`PipelineSpec.layouts`

***

### shader

> `readonly` **shader**: [`ShaderModuleSpec`](ShaderModuleSpec.md)

Defined in: [src/core/contracts/specs/ComputePipelineSpec.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/ComputePipelineSpec.ts#L17)

Shader module contendo a função compute.

***

### subkind

> `readonly` **subkind**: `"compute"`

Defined in: [src/core/contracts/specs/ComputePipelineSpec.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/ComputePipelineSpec.ts#L15)

Discriminador concreto — sempre `'compute'`.

#### Overrides

`PipelineSpec.subkind`
