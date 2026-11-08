[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / RenderPipelineSpec

# Interface: RenderPipelineSpec

Defined in: [src/core/contracts/specs/RenderPipelineSpec.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/RenderPipelineSpec.ts#L64)

Spec de render pipeline GPU — vertex + fragment + primitive + depth/multisample.
Materializado por `core.create<RenderPipelineSpec>()` em GPURenderPipeline.

Use `core.createAsync` para compilação não-bloqueante (recomendado para
pipelines pesados como Forward com shadow PCF + 4 cascades).

## Extends

- `PipelineSpec`

## Properties

### depthStencil?

> `readonly` `optional` **depthStencil?**: `DepthSpec`

Defined in: [src/core/contracts/specs/RenderPipelineSpec.ts:74](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/RenderPipelineSpec.ts#L74)

Depth-stencil attachment config. Omitir = sem depth test.

***

### discriminator?

> `readonly` `optional` **discriminator?**: `string`

Defined in: [src/core/contracts/specs/PipelineSpec.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/PipelineSpec.ts#L23)

Discriminador semântico (e.g. 'lcp_predict_pipeline'). Parte do specHash.

#### Inherited from

`PipelineSpec.discriminator`

***

### fragment?

> `readonly` `optional` **fragment?**: `FragmentStage`

Defined in: [src/core/contracts/specs/RenderPipelineSpec.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/RenderPipelineSpec.ts#L70)

Opcional para pipelines depth-only (e.g. shadow map vs. light POV).

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

### multisample?

> `readonly` `optional` **multisample?**: `MultisampleSpec`

Defined in: [src/core/contracts/specs/RenderPipelineSpec.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/RenderPipelineSpec.ts#L76)

MSAA count + alpha-to-coverage. Default: 1× sem alpha-to-coverage.

***

### primitive?

> `readonly` `optional` **primitive?**: `PrimitiveSpec`

Defined in: [src/core/contracts/specs/RenderPipelineSpec.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/RenderPipelineSpec.ts#L72)

Primitive assembly config (topology, cull mode, etc.).

***

### subkind

> `readonly` **subkind**: `"render"`

Defined in: [src/core/contracts/specs/RenderPipelineSpec.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/RenderPipelineSpec.ts#L66)

Discriminador concreto — sempre `'render'`.

#### Overrides

`PipelineSpec.subkind`

***

### vertex

> `readonly` **vertex**: `VertexStage`

Defined in: [src/core/contracts/specs/RenderPipelineSpec.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/RenderPipelineSpec.ts#L68)

Vertex stage — shader + entry point + buffer layouts.
