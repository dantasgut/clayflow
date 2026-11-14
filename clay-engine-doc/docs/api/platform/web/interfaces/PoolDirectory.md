[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PoolDirectory

# Interface: PoolDirectory

Defined in: [src/scene/contracts/PoolDirectory.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L48)

Consulta de leitura aos pools do `ResourceSystem` — o contrato que estágios (Flows) de
C3/C4 usam para ligar buffers coalescidos e indexar entidades, sem depender da classe
`ResourceSystem`.

Um recurso que declara vários descritores em pool ocupa o **mesmo slot** em todos eles
(ex.: `Transform[i]` e `WorldTransform[i]` são sempre a mesma entidade); com `count` no
descritor, uma faixa de slots contíguos (spec 008).

## Extended by

- [`ResourceDirectory`](ResourceDirectory.md)

## Methods

### poolBufferSpec()

> **poolBufferSpec**(`poolKey`): [`StorageBufferSpec`](StorageBufferSpec.md) \| `undefined`

Defined in: [src/scene/contracts/PoolDirectory.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L50)

Buffer do pool, para bind groups de estágios. `undefined` se o pool não existe.

#### Parameters

##### poolKey

`string`

#### Returns

[`StorageBufferSpec`](StorageBufferSpec.md) \| `undefined`

***

### poolCount()

> **poolCount**(`poolKey`): `number`

Defined in: [src/scene/contracts/PoolDirectory.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L54)

Número de slots ocupáveis (maior slot já usado + 1). 0 se o pool não existe.

#### Parameters

##### poolKey

`string`

#### Returns

`number`

***

### poolInfo()

> **poolInfo**(`poolKey`): [`PoolInfo`](PoolInfo.md) \| `undefined`

Defined in: [src/scene/contracts/PoolDirectory.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L52)

Buffer, stride, contagem, capacidade e geração do pool, ou `undefined` se não existe.

#### Parameters

##### poolKey

`string`

#### Returns

[`PoolInfo`](PoolInfo.md) \| `undefined`

***

### poolKeyForResource()

> **poolKeyForResource**(`resource`): `string` \| `undefined`

Defined in: [src/scene/contracts/PoolDirectory.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L84)

Pool key do primeiro descritor em pool do recurso, ou `undefined`.

#### Parameters

##### resource

[`Resource`](Resource.md)

#### Returns

`string` \| `undefined`

***

### poolLiveBuffer()

> **poolLiveBuffer**(`poolKey`): [`StorageBufferSpec`](StorageBufferSpec.md) \| `undefined`

Defined in: [src/scene/contracts/PoolDirectory.ts:75](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L75)

Bitset de slots ocupados do pool na GPU (`array<u32>`, um bit por slot; spec 008), criado no primeiro pedido e
mantido pela C2. `undefined` se o pool não existe.

#### Parameters

##### poolKey

`string`

#### Returns

[`StorageBufferSpec`](StorageBufferSpec.md) \| `undefined`

***

### poolLiveSource()

> **poolLiveSource**(`poolKey`): [`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

Defined in: [src/scene/contracts/PoolDirectory.ts:80](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L80)

Fonte do bitset de vivos do pool: o buffer próprio, ou a faixa da região dos vivos na arena de pools (T060i).
`undefined` se o pool não existe.

#### Parameters

##### poolKey

`string`

#### Returns

[`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

***

### poolRangeOf()

> **poolRangeOf**(`poolKey`, `entityId`): \{ `count`: `number`; `first`: `number`; \} \| `undefined`

Defined in: [src/scene/contracts/PoolDirectory.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L58)

Faixa da entidade no pool (`count` slots a partir de `first`; spec 008).

#### Parameters

##### poolKey

`string`

Chave do pool.

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

Entidade.

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

### poolSlotOf()

> **poolSlotOf**(`poolKey`, `entityId`): `number` \| `undefined`

Defined in: [src/scene/contracts/PoolDirectory.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L56)

Slot da entidade no pool; igual em todos os pools de um mesmo recurso.

#### Parameters

##### poolKey

`string`

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

`number` \| `undefined`

***

### poolSlotOwnedByGpu()

> **poolSlotOwnedByGpu**(`poolKey`, `slot`): `boolean`

Defined in: [src/scene/contracts/PoolDirectory.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L82)

O slot é de posse da GPU (`slot.entities({ owns })`: escrito por um estágio, não pela CPU)?

#### Parameters

##### poolKey

`string`

##### slot

`number`

#### Returns

`boolean`
