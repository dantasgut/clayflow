[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowLifecycle

# Type Alias: FlowLifecycle

> **FlowLifecycle** = `"pending"` \| `"preparing"` \| `"ready"` \| `"disposed"`

Defined in: [src/scene/flows/Flow.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L19)

Ciclo de vida de um Flow, gerido pela Camada 2:
`pending` (slot obrigatório ausente) → `preparing` (pipelines compilando) → `ready` (executa no quadro) →
`disposed` (removido). Volta a `pending` se um slot obrigatório some.
