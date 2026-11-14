[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ResourceDirectory

# Interface: ResourceDirectory

Defined in: [src/scene/contracts/ResourceDirectory.ts:71](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L71)

Localização do que a C2 alocou para cada descritor de cada recurso (`ResourceSystem`): buffers de qualquer
papel (uniform, storage, vértice, índice, indireto, staging), texturas, views e samplers. Estende
`PoolDirectory` (pools coalescidos).

É o contrato pelo qual os estágios (Flows) de C3/C4 passam a consumir os objetos que a C2 aloca, em vez de
criar cópias próprias — a migração dos estágios para esse consumo é a spec 006.

## Extends

- [`PoolDirectory`](PoolDirectory.md)

## Methods

### bufferOf()

> **bufferOf**(`resource`, `descId`): [`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

Defined in: [src/scene/contracts/ResourceDirectory.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L76)

Buffer alocado para o descritor `descId` de `resource` (individual; para descritores em pool use
`poolBufferSpec`). `undefined` se o recurso não está alocado ou o descritor não é de buffer.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

#### Returns

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

***

### channelOf()

> **channelOf**(`resource`, `descId`): `ChannelInfo` \| `undefined`

Defined in: [src/scene/contracts/ResourceDirectory.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L149)

Canal temporal do descritor individual `descId` (com `history`) — desde a inserção do recurso; as fatias de um
descritor `onDemand` só depois do `ensureAllocated` (`allocated`). `undefined` sem o descritor ou fora da cena.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

#### Returns

`ChannelInfo` \| `undefined`

***

### channelOfPool()

> **channelOfPool**(`poolKey`): `ChannelInfo` \| `undefined`

Defined in: [src/scene/contracts/ResourceDirectory.ts:151](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L151)

Canal temporal do pool `poolKey` (descritor com `history`; as fatias desde o `ensurePoolAllocated`).

#### Parameters

##### poolKey

`string`

#### Returns

`ChannelInfo` \| `undefined`

***

### ensureAllocated()

> **ensureAllocated**(`resource`, `descId`): [`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

Defined in: [src/scene/contracts/ResourceDirectory.ts:131](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L131)

Aloca agora um descritor individual `allocation: 'onDemand'` de `resource` (se ainda não estiver) e devolve o
buffer (spec 008). Descritores de textura também (spec 017: a superfície de água só ocupa memória quando há
água): alocados com o tamanho do canvas ou o declarado, e lidos por `textureOf`/`textureViewOf` — o retorno é
`undefined` para eles. Chamado numa transição, fora da gravação.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

#### Returns

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

***

### ensurePool()

> **ensurePool**(`schema`): `void`

Defined in: [src/scene/contracts/ResourceDirectory.ts:144](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L144)

Garante o pool de chave `schema.name`: se a cena ainda não tem nenhum recurso dele, cria-o vazio (zerado, com a
capacidade inicial) e o registra como fornecedor `{ pool }` — para quem lê um pool que a cena pode não ter (ex.:
as luzes nos acertos da iluminação global num cômodo só com emissores; spec 033). Chamado numa transição.

#### Parameters

##### schema

[`Schema`](Schema.md)

#### Returns

`void`

***

### ensurePoolAllocated()

> **ensurePoolAllocated**(`poolKey`): [`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

Defined in: [src/scene/contracts/ResourceDirectory.ts:138](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L138)

Aloca agora o pool `poolKey` declarado `allocation: 'onDemand'` (spec 037: a inversa de mundo, que só alguns
consumidores leem) com a capacidade inteira e devolve o buffer; emite `poolReallocated` na primeira vez (os
estágios religam os bind groups). Pool já alocado: o buffer dele. Sem o pool na cena: `undefined`. Chamado numa
transição, fora da gravação.

#### Parameters

##### poolKey

`string`

#### Returns

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

***

### hasGpuWriter()

> **hasGpuWriter**(`resource`, `descId`): `boolean`

Defined in: [src/scene/contracts/ResourceDirectory.ts:119](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L119)

O descritor individual `descId` de `resource` tem um escritor na GPU (um conjunto com `owns`, spec 008)? Serve a
quem consome dado `upload: 'never'` (ex.: o forward avisa quando desenha uma geometria que ninguém escreve).

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

#### Returns

`boolean`

***

### invalidateChannel()

> **invalidateChannel**(`resource`, `descId`): `void`

Defined in: [src/scene/contracts/ResourceDirectory.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L160)

A continuidade da série quebrou por um motivo que só o produtor conhece: nenhuma fatia anterior vale.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

#### Returns

`void`

***

### invalidatePoolChannel()

> **invalidatePoolChannel**(`poolKey`): `void`

Defined in: [src/scene/contracts/ResourceDirectory.ts:162](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L162)

`invalidateChannel` do canal de um pool.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

***

### isProduced()

> **isProduced**(`resource`, `descId`): `boolean`

Defined in: [src/scene/contracts/ResourceDirectory.ts:124](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L124)

O descritor `descId` de `resource` foi produzido no quadro corrente pelo seu produtor (spec 031, R5)? Marcado pelo
Flow que o escreve (`TransitionContext.produced`, no `framePrepare`); quem o lê só grava com o dado produzido.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

#### Returns

`boolean`

***

### markPoolWritten()

> **markPoolWritten**(`poolKey`): `void`

Defined in: [src/scene/contracts/ResourceDirectory.ts:158](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L158)

`markWritten` do canal de um pool.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

***

### markWritten()

> **markWritten**(`resource`, `descId`): `void`

Defined in: [src/scene/contracts/ResourceDirectory.ts:156](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L156)

O produtor gravou a fatia atual do canal no quadro (chamado no `dispatch` que a gravou): a C2 gira o anel no
próximo quadro e carimba a fatia. Sem gravação, o anel não gira.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

#### Returns

`void`

***

### poolBufferSpec()

> **poolBufferSpec**(`poolKey`): [`StorageBufferSpec`](StorageBufferSpec.md) \| `undefined`

Defined in: [src/scene/contracts/PoolDirectory.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/PoolDirectory.ts#L50)

Buffer do pool, para bind groups de estágios. `undefined` se o pool não existe.

#### Parameters

##### poolKey

`string`

#### Returns

[`StorageBufferSpec`](StorageBufferSpec.md) \| `undefined`

#### Inherited from

[`PoolDirectory`](PoolDirectory.md).[`poolBufferSpec`](PoolDirectory.md#poolbufferspec)

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

#### Inherited from

[`PoolDirectory`](PoolDirectory.md).[`poolCount`](PoolDirectory.md#poolcount)

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

#### Inherited from

[`PoolDirectory`](PoolDirectory.md).[`poolInfo`](PoolDirectory.md#poolinfo)

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

#### Inherited from

[`PoolDirectory`](PoolDirectory.md).[`poolKeyForResource`](PoolDirectory.md#poolkeyforresource)

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

#### Inherited from

[`PoolDirectory`](PoolDirectory.md).[`poolLiveBuffer`](PoolDirectory.md#poollivebuffer)

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

#### Inherited from

[`PoolDirectory`](PoolDirectory.md).[`poolLiveSource`](PoolDirectory.md#poollivesource)

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

#### Inherited from

[`PoolDirectory`](PoolDirectory.md).[`poolRangeOf`](PoolDirectory.md#poolrangeof)

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

#### Inherited from

[`PoolDirectory`](PoolDirectory.md).[`poolSlotOf`](PoolDirectory.md#poolslotof)

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

#### Inherited from

[`PoolDirectory`](PoolDirectory.md).[`poolSlotOwnedByGpu`](PoolDirectory.md#poolslotownedbygpu)

***

### read()

> **read**(`resource`, `descId?`): `Promise`\<`Record`\<`string`, `unknown`\> \| `undefined`\>

Defined in: [src/scene/contracts/ResourceDirectory.ts:114](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L114)

Lê da GPU o dado do descritor `descId` de `resource` (ou o primeiro com schema), desempacotado pelo schema — a
leitura sob demanda da spec 007: os pedidos da mesma tarefa saem num lote, uma cópia por faixa contígua; o valor é
o do último quadro enviado. Resource fora da cena (ou removido antes da resposta) resolve `undefined`. É o caminho
de um Flow para um contador da GPU (a fila da refração, os contatos do LCP), sem staging próprio.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId?

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\> \| `undefined`\>

***

### regionStrideOf()

> **regionStrideOf**(`resource`, `descId`): `number` \| `undefined`

Defined in: [src/scene/contracts/ResourceDirectory.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L87)

Distância em bytes entre as regiões do uniforme por região `descId` de `resource` (o stride do schema alinhado ao
`minUniformBufferOffsetAlignment` do adaptador; spec 039), ou `undefined` se o descritor não tem `regions`.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

#### Returns

`number` \| `undefined`

***

### samplerOf()

> **samplerOf**(`resource`, `descId`): [`SamplerSpec`](SamplerSpec.md) \| `undefined`

Defined in: [src/scene/contracts/ResourceDirectory.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L82)

Sampler alocado para o descritor `sampler`, ou `undefined`.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

#### Returns

[`SamplerSpec`](SamplerSpec.md) \| `undefined`

***

### textureOf()

> **textureOf**(`resource`, `descId`): [`TextureSpec`](TextureSpec.md) \| `undefined`

Defined in: [src/scene/contracts/ResourceDirectory.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L78)

Textura alocada para o descritor (`texture`/`storage-texture`), ou `undefined`.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

#### Returns

[`TextureSpec`](TextureSpec.md) \| `undefined`

***

### textureViewOf()

> **textureViewOf**(`resource`, `descId`): [`TextureViewSpec`](TextureViewSpec.md) \| `undefined`

Defined in: [src/scene/contracts/ResourceDirectory.ts:80](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L80)

View da textura alocada para o descritor (`texture`/`storage-texture`), ou `undefined`.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

#### Returns

[`TextureViewSpec`](TextureViewSpec.md) \| `undefined`

***

### writeNow()

> **writeNow**(`resource`, `descId`, `bytes`, `offset?`): `void`

Defined in: [src/scene/contracts/ResourceDirectory.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L107)

Grava agora `bytes` no buffer do descritor `descId` de `resource` — o próprio, ou, em pool, a faixa do Resource (o
`offset` relativo ao início dela) —, a partir de `offset` (spec 039) — o
envio de um valor conhecido só na gravação (a contagem de uma reconstrução, os parâmetros de um despacho). Vale
durante a gravação: a escrita entra na fila antes do envio do quadro. O dado vai só à GPU (não a `data`).

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

##### bytes

`ArrayBufferView`

##### offset?

`number`

#### Returns

`void`

#### Throws

Error se o descritor não tem buffer alocado; RangeError fora da faixa em pool.

***

### writeRegions()

> **writeRegions**(`resource`, `descId`, `records`, `first?`): `void`

Defined in: [src/scene/contracts/ResourceDirectory.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ResourceDirectory.ts#L94)

Grava agora as regiões `[first, first + records.length)` do uniforme por região `descId` de `resource`, numa escrita
(spec 039). Vale também durante a gravação do quadro: a escrita entra na fila antes do envio, então cada chamada
gravada lê a sua região. O dado vai só à GPU (não a `data`).

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

##### records

readonly `Record`\<`string`, `unknown`\>[]

##### first?

`number`

#### Returns

`void`

#### Throws

Error se o descritor não tem `regions` ou não está alocado; RangeError fora das regiões.
