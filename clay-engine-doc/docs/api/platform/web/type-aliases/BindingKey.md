[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BindingKey

# Type Alias: BindingKey

> **BindingKey** = [`WgslResource`](../interfaces/WgslResource.md) \| \{ `pipeline`: `string`; `resource`: [`WgslResource`](../interfaces/WgslResource.md); \}

Defined in: [src/scene/flows/FlowBinding.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L34)

Chave de um binding privado declarado (spec 031): o próprio recurso (vale para todos os pipelines do Flow) ou o
recurso num pipeline (`{ pipeline, resource }`, vence o anterior).

## Union Members

[`WgslResource`](../interfaces/WgslResource.md)

***

### Type Literal

\{ `pipeline`: `string`; `resource`: [`WgslResource`](../interfaces/WgslResource.md); \}

#### pipeline

> `readonly` **pipeline**: `string`

Id do pipeline.

#### resource

> `readonly` **resource**: [`WgslResource`](../interfaces/WgslResource.md)

O recurso.
