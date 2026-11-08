[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BoundPool

# Interface: BoundPool

Defined in: [src/scene/flows/slots.ts:199](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L199)

Pool resolvido. Visão viva: contagem, buffer e geração acompanham a C2.

## Properties

### buffer

> `readonly` **buffer**: [`StorageBufferSpec`](StorageBufferSpec.md)

Defined in: [src/scene/flows/slots.ts:205](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L205)

Buffer atual do pool (storage, `array<T>` no shader).

***

### capacity

> `readonly` **capacity**: `number`

Defined in: [src/scene/flows/slots.ts:211](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L211)

Registros que cabem no buffer atual (cresce por realocação).

***

### count

> `readonly` **count**: `number`

Defined in: [src/scene/flows/slots.ts:207](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L207)

Slots ocupáveis (maior slot já usado + 1).

***

### generation

> `readonly` **generation**: `number`

Defined in: [src/scene/flows/slots.ts:213](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L213)

Incrementa a cada recriação do buffer.

***

### gpuOwned

> `readonly` **gpuOwned**: `number`

Defined in: [src/scene/flows/slots.ts:215](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L215)

Slots de posse da GPU (escritos por um estágio, não pela CPU).

***

### live

> `readonly` **live**: [`StorageBufferSpec`](StorageBufferSpec.md)

Defined in: [src/scene/flows/slots.ts:220](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L220)

Bitset de slots ocupados na GPU (`array<u32>`, um bit por slot; spec 008) — o que um kernel que percorre
`[0, count)` testa para ignorar faixas liberadas (`pool_live`). Também como fornecedor `{ consumer: '<poolKey>.live' }`.

***

### poolKey

> `readonly` **poolKey**: `string`

Defined in: [src/scene/flows/slots.ts:201](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L201)

Chave do pool.

***

### schema

> `readonly` **schema**: [`Schema`](Schema.md)

Defined in: [src/scene/flows/slots.ts:203](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L203)

Schema do elemento do pool.

***

### stride

> `readonly` **stride**: `number`

Defined in: [src/scene/flows/slots.ts:209](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L209)

Bytes por registro.

## Methods

### entityAt()

> **entityAt**(`slot`): [`EntityId`](../type-aliases/EntityId.md) \| `undefined`

Defined in: [src/scene/flows/slots.ts:235](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L235)

Entidade que ocupa o slot, ou `undefined`.

#### Parameters

##### slot

`number`

#### Returns

[`EntityId`](../type-aliases/EntityId.md) \| `undefined`

***

### ownedByGpu()

> **ownedByGpu**(`slot`): `boolean`

Defined in: [src/scene/flows/slots.ts:233](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L233)

O slot é de posse da GPU (escrito por um estágio, não pela CPU)?

#### Parameters

##### slot

`number`

#### Returns

`boolean`

***

### rangeOf()

> **rangeOf**(`entityId`): \{ `count`: `number`; `first`: `number`; \} \| `undefined`

Defined in: [src/scene/flows/slots.ts:224](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L224)

Faixa da entidade no pool (`count` slots contíguos a partir de `first`, spec 008), ou `undefined`.

#### Parameters

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

##### Type Literal

\{ `count`: `number`; `first`: `number`; \}

###### count

> `readonly` **count**: `number`

Slots da faixa.

###### first

> `readonly` **first**: `number`

Primeiro slot da faixa.

***

`undefined`

***

### slotOf()

> **slotOf**(`entityId`): `number` \| `undefined`

Defined in: [src/scene/flows/slots.ts:222](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L222)

Slot da entidade no pool (o primeiro da faixa), ou `undefined`.

#### Parameters

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

`number` \| `undefined`
