[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowContext

# Interface: FlowContext

Defined in: [src/scene/flows/FlowRegistry.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L9)

O que uma factory recebe para construir o Flow.

## Properties

### bodyType?

> `readonly` `optional` **bodyType?**: `string`

Defined in: [src/scene/flows/FlowRegistry.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L19)

Tipo de corpo (chave do pool) da instância, nos registros com `bodyType`.

***

### core

> `readonly` **core**: [`EngineCore`](EngineCore.md)

Defined in: [src/scene/flows/FlowRegistry.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L11)

Core da cena (criação dos recursos privados do Flow).

***

### events

> `readonly` **events**: [`EventBus`](EventBus.md)

Defined in: [src/scene/flows/FlowRegistry.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L17)

EventBus da cena.

***

### resources

> `readonly` **resources**: [`ResourceDirectory`](ResourceDirectory.md)

Defined in: [src/scene/flows/FlowRegistry.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L15)

Objetos de GPU alocados pela C2 (buffers dos Resources, pools).

***

### world

> `readonly` **world**: [`World`](../classes/World.md)

Defined in: [src/scene/flows/FlowRegistry.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L13)

World da cena.
