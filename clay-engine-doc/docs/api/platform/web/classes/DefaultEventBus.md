[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / DefaultEventBus

# Class: DefaultEventBus

Defined in: [src/scene/events/DefaultEventBus.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/DefaultEventBus.ts#L10)

Implementação default do EventBus — Set por tipo de evento, dispatch
sincrônico em ordem de registro. Iteração via cópia para permitir
unsubscribe durante o emit (o handler que se desregistra ainda recebe
o evento atual).

## Implements

- [`EventBus`](../interfaces/EventBus.md)

## Constructors

### Constructor

> **new DefaultEventBus**(): `DefaultEventBus`

#### Returns

`DefaultEventBus`

## Methods

### emit()

> **emit**\<`E`\>(`type`, `payload`): `void`

Defined in: [src/scene/events/DefaultEventBus.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/DefaultEventBus.ts#L39)

Dispatch sincrônico para todos os handlers registrados.

#### Type Parameters

##### E

`E` *extends* keyof [`EventMap`](../interfaces/EventMap.md)

#### Parameters

##### type

`E`

##### payload

[`EventMap`](../interfaces/EventMap.md)\[`E`\]

#### Returns

`void`

#### Implementation of

[`EventBus`](../interfaces/EventBus.md).[`emit`](../interfaces/EventBus.md#emit)

***

### listenerCount()

> **listenerCount**(`type?`): `number`

Defined in: [src/scene/events/DefaultEventBus.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/DefaultEventBus.ts#L32)

Dispatch sincrônico. Cópia da Set permite unsubscribe durante iteração.

#### Parameters

##### type?

keyof EventMap

#### Returns

`number`

#### Implementation of

[`EventBus`](../interfaces/EventBus.md).[`listenerCount`](../interfaces/EventBus.md#listenercount)

***

### off()

> **off**\<`E`\>(`type`, `handler`): `void`

Defined in: [src/scene/events/DefaultEventBus.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/DefaultEventBus.ts#L27)

Remove handler. No-op se não registrado.

#### Type Parameters

##### E

`E` *extends* keyof [`EventMap`](../interfaces/EventMap.md)

#### Parameters

##### type

`E`

##### handler

`EventHandler`\<`E`\>

#### Returns

`void`

#### Implementation of

[`EventBus`](../interfaces/EventBus.md).[`off`](../interfaces/EventBus.md#off)

***

### on()

> **on**\<`E`\>(`type`, `handler`): `Unsubscribe`

Defined in: [src/scene/events/DefaultEventBus.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/DefaultEventBus.ts#L14)

Registra handler. Retorna função de unsubscribe.

#### Type Parameters

##### E

`E` *extends* keyof [`EventMap`](../interfaces/EventMap.md)

#### Parameters

##### type

`E`

##### handler

`EventHandler`\<`E`\>

#### Returns

`Unsubscribe`

#### Implementation of

[`EventBus`](../interfaces/EventBus.md).[`on`](../interfaces/EventBus.md#on)
