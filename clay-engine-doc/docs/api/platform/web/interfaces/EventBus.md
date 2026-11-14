[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EventBus

# Interface: EventBus

Defined in: [src/scene/events/EventBus.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventBus.ts#L19)

EventBus tipado — pub/sub com type safety em compile time. O `EventMap`
mapeia nomes de evento para tipos de payload; o EventBus só aceita
combinações válidas.

Implementação default: `DefaultEventBus`.

## Methods

### emit()

> **emit**\<`E`\>(`type`, `payload`): `void`

Defined in: [src/scene/events/EventBus.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventBus.ts#L25)

Dispatch sincrônico para todos os handlers registrados.

#### Type Parameters

##### E

`E` *extends* keyof [`EventMap`](EventMap.md)

#### Parameters

##### type

`E`

##### payload

[`EventMap`](EventMap.md)\[`E`\]

#### Returns

`void`

***

### listenerCount()

> **listenerCount**(`type?`): `number`

Defined in: [src/scene/events/EventBus.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventBus.ts#L30)

Quantidade de ouvintes registrados (de `type`, ou de todos os eventos). Diagnóstico de vazamento: depois de
descartar aplicações e estágios, a contagem volta ao valor anterior.

#### Parameters

##### type?

keyof EventMap

#### Returns

`number`

***

### off()

> **off**\<`E`\>(`type`, `handler`): `void`

Defined in: [src/scene/events/EventBus.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventBus.ts#L23)

Remove handler manualmente (alternativa ao Unsubscribe retornado por on).

#### Type Parameters

##### E

`E` *extends* keyof [`EventMap`](EventMap.md)

#### Parameters

##### type

`E`

##### handler

`EventHandler`\<`E`\>

#### Returns

`void`

***

### on()

> **on**\<`E`\>(`type`, `handler`): `Unsubscribe`

Defined in: [src/scene/events/EventBus.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventBus.ts#L21)

Registra handler. Retorna função para deregistrar (Unsubscribe pattern).

#### Type Parameters

##### E

`E` *extends* keyof [`EventMap`](EventMap.md)

#### Parameters

##### type

`E`

##### handler

`EventHandler`\<`E`\>

#### Returns

`Unsubscribe`
