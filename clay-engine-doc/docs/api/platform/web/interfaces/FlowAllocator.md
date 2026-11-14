[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowAllocator

# Interface: FlowAllocator

Defined in: [src/scene/flows/FlowRegistry.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L48)

Quem aloca os Flows (o `ResourceSystem` da cena).

## Methods

### ensureFlowAllocated()

> **ensureFlowAllocated**(`flow`, `options`): `void`

Defined in: [src/scene/flows/FlowRegistry.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L50)

Resolve slots, prepara pipelines e emite `flowReady` quando o Flow fica pronto.

#### Parameters

##### flow

[`Flow`](../classes/Flow.md)

##### options

[`RegisterOptions`](RegisterOptions.md)

#### Returns

`void`

***

### hasPool()

> **hasPool**(`poolKey`): `boolean`

Defined in: [src/scene/flows/FlowRegistry.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L54)

O pool já existe?

#### Parameters

##### poolKey

`string`

#### Returns

`boolean`

***

### releaseFlow()

> **releaseFlow**(`flow`): `void`

Defined in: [src/scene/flows/FlowRegistry.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L52)

Libera o que a C2 criou para o Flow e o descarta.

#### Parameters

##### flow

[`Flow`](../classes/Flow.md)

#### Returns

`void`
