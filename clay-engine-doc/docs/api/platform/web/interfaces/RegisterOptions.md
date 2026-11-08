[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / RegisterOptions

# Interface: RegisterOptions

Defined in: [src/scene/flows/FlowRegistry.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L26)

Opções de registro (a ordem do quadro e a seleção vêm daqui, não do Flow).

## Properties

### bodyType?

> `readonly` `optional` **bodyType?**: `string`

Defined in: [src/scene/flows/FlowRegistry.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L36)

Chave do pool atendido (`schema.name`, ou `schema.name:algoritmo` com `FlowDescriptor`). Com `bodyType`, a C2
instancia o Flow quando o pool passa a existir (primeiro corpo), uma instância por `bodyType`; sem `bodyType`,
o Flow é instanciado no registro.

***

### phase

> `readonly` **phase**: [`Phase`](../type-aliases/Phase.md)

Defined in: [src/scene/flows/FlowRegistry.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L30)

Fase do quadro em que o Flow grava.

***

### priority?

> `readonly` `optional` **priority?**: `number`

Defined in: [src/scene/flows/FlowRegistry.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L38)

Maior roda antes na fase e vence na seleção do `bodyType`. Default 0.

***

### type

> `readonly` **type**: `string`

Defined in: [src/scene/flows/FlowRegistry.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowRegistry.ts#L28)

Nome do estágio (único na fase).
