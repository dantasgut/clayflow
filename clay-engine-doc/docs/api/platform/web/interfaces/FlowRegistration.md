[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowRegistration

# Interface: FlowRegistration\<F\>

Defined in: [src/scene/flows/FlowRegistry.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L66)

Um registro (factory + opções) e a instância corrente, quando existe.

## Type Parameters

### F

`F` *extends* [`Flow`](../classes/Flow.md) = [`Flow`](../classes/Flow.md)

## Properties

### factory

> `readonly` **factory**: [`FlowFactory`](../type-aliases/FlowFactory.md)\<`F`\>

Defined in: [src/scene/flows/FlowRegistry.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L73)

Factory registrada.

***

### flow

> `readonly` **flow**: `F` \| `undefined`

Defined in: [src/scene/flows/FlowRegistry.ts:75](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L75)

Instância atual (sem `bodyType`: desde o registro; com `bodyType`: quando o pool existe e o registro vence).

***

### options

> `readonly` **options**: `Required`\<`Omit`\<[`RegisterOptions`](RegisterOptions.md), `"bodyType"`\>\> & `object`

Defined in: [src/scene/flows/FlowRegistry.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L68)

Opções do registro, com `priority` resolvida (0 por padrão).

#### Type Declaration

##### bodyType?

> `readonly` `optional` **bodyType?**: `string`

Chave do pool atendido, quando o registro é por tipo de corpo.

***

### override

> `readonly` **override**: `boolean`

Defined in: [src/scene/flows/FlowRegistry.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L77)

Substituição explícita do `bodyType` (`override`), que vence a prioridade.
