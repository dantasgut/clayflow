[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BindingSources

# Type Alias: BindingSources

> **BindingSources** = `ReadonlyMap`\<[`BindingKey`](BindingKey.md), [`BindingSource`](BindingSource.md)\>

Defined in: [src/scene/flows/FlowBinding.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L28)

Fontes privadas pela identidade do recurso declarado (spec 031). A chave recurso vale para todos os pipelines do
Flow; a chave `{ pipeline, resource }` vale só para o pipeline de id `pipeline` e vence a anterior (ex.: o mesmo
recurso `np_params` com um buffer por variante de narrowphase).
