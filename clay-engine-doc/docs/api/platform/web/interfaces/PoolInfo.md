[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PoolInfo

# Interface: PoolInfo

Defined in: [src/scene/contracts/PoolDirectory.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L11)

Estado de um pool num instante (cópia; não acompanha mudanças posteriores).

## Properties

### allocated

> `readonly` **allocated**: `boolean`

Defined in: [src/scene/contracts/PoolDirectory.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L36)

O buffer tem a capacidade inteira. `false` só num pool `allocation: 'onDemand'` ainda não pedido
(`ResourceDirectory.ensurePoolAllocated`, spec 037): quem o produz não precisa escrever nele.

***

### buffer

> `readonly` **buffer**: [`StorageBufferSpec`](StorageBufferSpec.md)

Defined in: [src/scene/contracts/PoolDirectory.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L17)

Buffer atual (a arena de pools, para o pool que mora nela — T060i).

***

### capacity

> `readonly` **capacity**: `number`

Defined in: [src/scene/contracts/PoolDirectory.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L27)

Registros que cabem no buffer atual.

***

### count

> `readonly` **count**: `number`

Defined in: [src/scene/contracts/PoolDirectory.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L25)

Slots ocupáveis (maior slot já usado + 1).

***

### generation

> `readonly` **generation**: `number`

Defined in: [src/scene/contracts/PoolDirectory.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L29)

Incrementa a cada recriação do buffer (crescimento).

***

### gpuOwned

> `readonly` **gpuOwned**: `number`

Defined in: [src/scene/contracts/PoolDirectory.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L31)

Slots de posse da GPU (`slot.entities({ owns })`): escritos por um estágio, não pela CPU.

***

### offset

> `readonly` **offset**: `number`

Defined in: [src/scene/contracts/PoolDirectory.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L19)

Posição (bytes) dos registros no buffer: 0, salvo na arena de pools (a região do pool, alinhada a 256).

***

### poolKey

> `readonly` **poolKey**: `string`

Defined in: [src/scene/contracts/PoolDirectory.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L13)

Chave do pool (`schema.name`, ou `schema.name:algoritmo`).

***

### schema

> `readonly` **schema**: [`Schema`](Schema.md)

Defined in: [src/scene/contracts/PoolDirectory.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L15)

Schema dos registros.

***

### size

> `readonly` **size**: `number`

Defined in: [src/scene/contracts/PoolDirectory.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L21)

Bytes dos registros no buffer (a capacidade inteira; na arena, a região).

***

### stride

> `readonly` **stride**: `number`

Defined in: [src/scene/contracts/PoolDirectory.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L23)

Bytes por registro: o stride do struct gerado do schema (o do `array<T>` no WGSL).
