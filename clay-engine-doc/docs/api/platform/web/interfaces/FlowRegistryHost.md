[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowRegistryHost

# Interface: FlowRegistryHost

Defined in: [src/scene/flows/FlowRegistry.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L58)

Contexto e alocador da cena, ligados na criação da cena.

## Properties

### allocator

> `readonly` **allocator**: [`FlowAllocator`](FlowAllocator.md)

Defined in: [src/scene/flows/FlowRegistry.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L62)

Quem aloca as instâncias (`ResourceSystem`).

***

### context

> `readonly` **context**: `Omit`\<[`FlowContext`](FlowContext.md), `"bodyType"`\>

Defined in: [src/scene/flows/FlowRegistry.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L60)

Contexto passado às factories (sem `bodyType`, que vem do registro).
