[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ResourceSystem

# Class: ResourceSystem

Defined in: [src/scene/systems/ResourceSystem.ts:341](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L341)

ResourceSystem é a Camada 2 que gerencia o ciclo de vida dos Resources GPU —
alocação, envio, crescimento de pools e descarte. Reage a:
  - `resourcesChanged` (insert/remove do World) → aloca/descarta;
  - `resourceDirty` (automático via dado reativo, ou manual) → enfileira;
  - `frameRecording` (antes da gravação do quadro) → envia a fila de sujos: objetos próprios inteiros (com
    `resourceReady`) e dados em pool por faixas contíguas de slots (com um `poolWritten` por pool);
  - `canvasReconfigured` → recria texturas declaradas com `sizeFromCanvas`.

**Bag inteira** (research R9): todo descritor de um recurso inserido é alocado, um registro por descritor —
uniform/storage (`schema.pack`, todos os `count`), vértice (stride do layout compacto do schema), índice
(`uint16`/`uint32` pelo tipo do array), indireto, staging, textura/textura de storage (+ view) e sampler. O
que foi alocado é localizado por `ResourceDirectory` (`bufferOf`/`textureOf`/`textureViewOf`/`samplerOf`).

**Conteúdo de um descritor de buffer**: `data[desc.id]` se for um typed array (bytes crus — vértices,
índices, argumentos indiretos); `data[desc.id]` como array de registros (um por elemento, `count`
elementos); senão `schema.pack(data)` para descritores de um elemento. Sem conteúdo, o buffer nasce zerado
(produzido pela GPU).

**Ciclo de vida** (research R10): toda mudança de estado passa por `transition()`, que lança em transição
inválida; as regras vêm do handler do estado (`suppressCpuUpload`, `ignoreDirtyMark`,
`reportsIgnoredMutation`). Remover e reinserir a mesma instância é válido (`Destroyed → Uninitialized`).

**Dado reativo**: ao alocar, `resource.data` passa a ser um proxy — qualquer mutação
(campo, componente de vetor, substituição de `data`) marca o recurso como sujo, sem
chamada manual.

**Política de envio por descritor** (`GPUDescriptor.upload`):
  - `'always'` (default): envia na alocação e a cada sujo;
  - `'initial'`: envia só na alocação; recurso cujos descritores são todos
    `'initial'`/`'never'` entra em `GpuManaged` (mutações ignoradas, aviso único);
  - `'never'`: buffer produzido pela GPU; nunca escrito pela CPU.

**Storage**:
  - `individual`: objetos próprios por descritor (Camera, ShadowParams, geometrias).
  - `pool`: 1 GPUBuffer de storage compartilhado por N members do mesmo schema, lido como `array<T>` (stride do
    struct). Cresce 2× quando a capacidade estoura — o conteúdo vai para o buffer novo por cópia na GPU, sem
    reempacotar na CPU — e emite `poolReallocated`. **Envio por delta** (spec 007, R5): alocação e mutação só
    marcam o slot (bitset do pool, slot achado em O(1)); no envio, cada faixa contígua de slots marcados é
    empacotada numa área reutilizável e escrita com um `core.write`.
    Um recurso com vários descritores em pool ocupa o **mesmo slot** em todos eles. `role: 'uniform'` em pool
    não é aceito (um registro por desenho viria de offset dinâmico e rebind por draw — ver `slot.entities`
    com `record`).

## Implements

- [`ResourceDirectory`](../interfaces/ResourceDirectory.md)
- [`FlowAllocator`](../interfaces/FlowAllocator.md)

## Constructors

### Constructor

> **new ResourceSystem**(`core`, `events`, `world`, `consumers?`, `inferencer?`): `ResourceSystem`

Defined in: [src/scene/systems/ResourceSystem.ts:419](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L419)

#### Parameters

##### core

[`EngineCore`](../interfaces/EngineCore.md)

##### events

[`EventBus`](../interfaces/EventBus.md)

##### world

[`World`](World.md)

##### consumers?

[`ConsumerResolverRegistry`](ConsumerResolverRegistry.md) = `...`

Registro dos fornecedores da cena: cada pool criado registra o seu `PoolResolver` (sem substituir
  um resolver já registrado com o nome do pool).

##### inferencer?

[`LayoutInferencer`](LayoutInferencer.md) = `...`

Inferência de layout usada na preparação dos pipelines dos Flows.

#### Returns

`ResourceSystem`

## Properties

### consumers

> `readonly` **consumers**: [`ConsumerResolverRegistry`](ConsumerResolverRegistry.md)

Defined in: [src/scene/systems/ResourceSystem.ts:423](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L423)

Registro dos fornecedores da cena: cada pool criado registra o seu `PoolResolver` (sem substituir
  um resolver já registrado com o nome do pool).

## Accessors

### readiness

#### Get Signature

> **get** **readiness**(): [`EngineReadiness`](EngineReadiness.md)

Defined in: [src/scene/systems/ResourceSystem.ts:486](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L486)

Prontidão do motor (spec 034): `ready` quando nenhum Flow ativo tem trabalho pendente no último quadro.

##### Returns

[`EngineReadiness`](EngineReadiness.md)

## Methods

### acquireEntityRecords()

> **acquireEntityRecords**(`all`, `declaration`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:514](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L514)

Passa a manter os registros de `declaration` para as entidades com um Resource de cada tipo de `all` (o
`record` de um slot `entities`): pool com chave `declaration.schema.name`, um registro por entidade cujos campos
são os slots de pool dos descritores nomeados, escrito em lote no `frameRecording`. Conjuntos com a mesma
declaração compartilham o pool (contagem de usuários).

#### Parameters

##### all

readonly [`ResourceType`](../type-aliases/ResourceType.md)[]

##### declaration

[`EntityRecordDeclaration`](../interfaces/EntityRecordDeclaration.md)

#### Returns

`void`

#### Throws

Error se a chave já é usada por outra declaração, se um campo não está no schema ou se o tipo de um
  campo não está em `all`.

***

### acquireInstanceList()

> **acquireInstanceList**(`schema`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:695](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L695)

Passa a manter a lista de instâncias com o schema dado (`slot.entities({ groups })`): pool com chave
`schema.name`, um `u32` por posição. Conjuntos com o mesmo schema compartilham a lista (contagem de usuários).

#### Parameters

##### schema

[`StructSchema`](StructSchema.md)

#### Returns

`void`

#### Throws

Error se o schema não tem exatamente um campo `u32`.

***

### acquireOwnership()

> **acquireOwnership**(`owner`, `resource`, `descId`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:761](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L761)

Passa à GPU a posse do descritor `descId` (em pool) de `resource`, em nome de `owner` (`slot.entities({ owns })`):
depois do primeiro envio a CPU não escreve mais o slot e mutação é ignorada com aviso único por Resource; o
crescimento do pool preserva o dado por cópia na GPU.

#### Parameters

##### owner

`object`

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

`void`

#### Throws

Error se outro dono já tem a posse do mesmo slot.

***

### bufferOf()

> **bufferOf**(`resource`, `descId`): [`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1045](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1045)

Buffer alocado para o descritor `descId` de `resource` (individual; para descritores em pool use
`poolBufferSpec`). `undefined` se o recurso não está alocado ou o descritor não é de buffer.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`bufferOf`](../interfaces/ResourceDirectory.md#bufferof)

***

### channelOf()

> **channelOf**(`resource`, `descId`): `TemporalChannel` \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1084](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1084)

Canal temporal do descritor individual `descId` (com `history`) — desde a inserção do recurso; as fatias de um
descritor `onDemand` só depois do `ensureAllocated` (`allocated`). `undefined` sem o descritor ou fora da cena.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

`TemporalChannel` \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`channelOf`](../interfaces/ResourceDirectory.md#channelof)

***

### channelOfPool()

> **channelOfPool**(`poolKey`): `TemporalChannel` \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1091](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1091)

Canal temporal do pool `poolKey` (descritor com `history`; as fatias desde o `ensurePoolAllocated`).

#### Parameters

##### poolKey

`string`

#### Returns

`TemporalChannel` \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`channelOfPool`](../interfaces/ResourceDirectory.md#channelofpool)

***

### clearInstance()

> **clearInstance**(`poolKey`, `index`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:747](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L747)

Libera a posição `index` da lista de instâncias.

#### Parameters

##### poolKey

`string`

##### index

`number`

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:1035](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1035)

Desfaz as inscrições no EventBus e descarta os Flows alocados (descarte da cena).

#### Returns

`void`

***

### ensureAllocated()

> **ensureAllocated**(`resource`, `descId`): [`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1055](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1055)

Aloca agora o descritor individual `descId` de `resource` se ainda não estiver alocado (descritores
`allocation: 'onDemand'`; spec 008) e devolve o buffer — ou `undefined` para textura (spec 017; lida por
`textureOf`/`textureViewOf`; as `sizeFromCanvas` acompanham o canvas como as demais). Chamado fora da gravação
(numa transição). Resource fora da cena ou sem o descritor: `undefined`.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`ensureAllocated`](../interfaces/ResourceDirectory.md#ensureallocated)

***

### ensureFlowAllocated()

> **ensureFlowAllocated**(`flow`, `options`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:497](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L497)

Aloca um Flow: resolve os slots, prepara os pipelines declarados (layout inferido do WGSL, fontes privadas ou
dos recursos declarados), cria layouts e bind groups e emite `flowReady` quando o Flow fica pronto. A partir daí a C2 o
mantém: recria bind groups de fontes recriadas (`bindGroupReplaced`) e entrega os eventos às transições dele.

#### Parameters

##### flow

[`Flow`](Flow.md)

##### options

[`RegisterOptions`](../interfaces/RegisterOptions.md)

#### Returns

`void`

#### Implementation of

[`FlowAllocator`](../interfaces/FlowAllocator.md).[`ensureFlowAllocated`](../interfaces/FlowAllocator.md#ensureflowallocated)

***

### ensurePool()

> **ensurePool**(`schema`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:669](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L669)

Garante o pool de chave `schema.name`: se a cena ainda não tem nenhum recurso dele, cria-o vazio (zerado, com a
capacidade inicial) e o registra como fornecedor `{ pool }` — para quem lê um pool que a cena pode não ter (ex.:
as luzes nos acertos da iluminação global num cômodo só com emissores; spec 033). Chamado numa transição.

#### Parameters

##### schema

[`Schema`](../interfaces/Schema.md)

#### Returns

`void`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`ensurePool`](../interfaces/ResourceDirectory.md#ensurepool)

***

### ensurePoolAllocated()

> **ensurePoolAllocated**(`poolKey`): [`StorageBufferSpec`](../interfaces/StorageBufferSpec.md) \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:559](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L559)

Aloca agora o pool `poolKey` declarado `allocation: 'onDemand'` (spec 037: a inversa de mundo, que só alguns
consumidores leem) com a capacidade inteira e devolve o buffer; emite `poolReallocated` na primeira vez (os
estágios religam os bind groups). Pool já alocado: o buffer dele. Sem o pool na cena: `undefined`. Chamado numa
transição, fora da gravação.

#### Parameters

##### poolKey

`string`

#### Returns

[`StorageBufferSpec`](../interfaces/StorageBufferSpec.md) \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`ensurePoolAllocated`](../interfaces/ResourceDirectory.md#ensurepoolallocated)

***

### hasGpuWriter()

> **hasGpuWriter**(`resource`, `descId`): `boolean`

Defined in: [src/scene/systems/ResourceSystem.ts:800](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L800)

O descritor individual `descId` de `resource` tem um escritor na GPU (um conjunto com `owns`, spec 008)? Serve a
quem consome dado `upload: 'never'` (ex.: o forward avisa quando desenha uma geometria que ninguém escreve).

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

`boolean`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`hasGpuWriter`](../interfaces/ResourceDirectory.md#hasgpuwriter)

***

### hasPool()

> **hasPool**(`poolKey`): `boolean`

Defined in: [src/scene/systems/ResourceSystem.ts:1030](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1030)

O pool já existe?

#### Parameters

##### poolKey

`string`

#### Returns

`boolean`

#### Implementation of

[`FlowAllocator`](../interfaces/FlowAllocator.md).[`hasPool`](../interfaces/FlowAllocator.md#haspool)

***

### invalidateChannel()

> **invalidateChannel**(`resource`, `descId`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:1103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1103)

A continuidade da série quebrou por um motivo que só o produtor conhece: nenhuma fatia anterior vale.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

`void`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`invalidateChannel`](../interfaces/ResourceDirectory.md#invalidatechannel)

***

### invalidatePoolChannel()

> **invalidatePoolChannel**(`poolKey`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:1109](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1109)

`invalidateChannel` do canal de um pool.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`invalidatePoolChannel`](../interfaces/ResourceDirectory.md#invalidatepoolchannel)

***

### isProduced()

> **isProduced**(`resource`, `descId`): `boolean`

Defined in: [src/scene/systems/ResourceSystem.ts:804](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L804)

O descritor `descId` de `resource` foi produzido no quadro corrente pelo seu produtor (spec 031, R5)? Marcado pelo
Flow que o escreve (`TransitionContext.produced`, no `framePrepare`); quem o lê só grava com o dado produzido.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

`boolean`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`isProduced`](../interfaces/ResourceDirectory.md#isproduced)

***

### markPoolWritten()

> **markPoolWritten**(`poolKey`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:1099](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1099)

`markWritten` do canal de um pool.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`markPoolWritten`](../interfaces/ResourceDirectory.md#markpoolwritten)

***

### markProduced()

> **markProduced**(`owner`, `resource`, `descId`, `produced`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:814](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L814)

O produtor `owner` declara se escreveu o descritor `descId` de `resource` neste quadro (spec 031, R5). O primeiro
Flow a marcar é o produtor; `produced: false` de quem não é produtor é ignorado, e um segundo produtor é erro.

#### Parameters

##### owner

`object`

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

##### produced

`boolean`

#### Returns

`void`

#### Throws

Error se outro produtor já marca o descritor.

***

### markWritten()

> **markWritten**(`resource`, `descId`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:1095](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1095)

O produtor gravou a fatia atual do canal no quadro (chamado no `dispatch` que a gravou): a C2 gira o anel no
próximo quadro e carimba a fatia. Sem gravação, o anel não gira.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

`void`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`markWritten`](../interfaces/ResourceDirectory.md#markwritten)

***

### poolBufferSpec()

> **poolBufferSpec**(`poolKey`): [`StorageBufferSpec`](../interfaces/StorageBufferSpec.md) \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1313](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1313)

Buffer do pool (storage, ou uniform para pools de uniforms).

#### Parameters

##### poolKey

`string`

#### Returns

[`StorageBufferSpec`](../interfaces/StorageBufferSpec.md) \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`poolBufferSpec`](../interfaces/ResourceDirectory.md#poolbufferspec)

***

### poolCount()

> **poolCount**(`poolKey`): `number`

Defined in: [src/scene/systems/ResourceSystem.ts:1213](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1213)

Número de slots ocupáveis no pool (maior slot já usado + 1). 0 se o pool não existe.

#### Parameters

##### poolKey

`string`

#### Returns

`number`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`poolCount`](../interfaces/ResourceDirectory.md#poolcount)

***

### poolEntityBySlot()

> **poolEntityBySlot**(`poolKey`, `slot`): [`EntityId`](../type-aliases/EntityId.md) \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1252](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1252)

EntityId que ocupa o slot dado dentro do pool. Inverso de `poolSlotOf`.

#### Parameters

##### poolKey

`string`

##### slot

`number`

#### Returns

[`EntityId`](../type-aliases/EntityId.md) \| `undefined`

***

### poolInfo()

> **poolInfo**(`poolKey`): [`PoolInfo`](../interfaces/PoolInfo.md) \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1317](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1317)

Buffer, stride, contagem, capacidade e geração do pool, ou `undefined` se não existe.

#### Parameters

##### poolKey

`string`

#### Returns

[`PoolInfo`](../interfaces/PoolInfo.md) \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`poolInfo`](../interfaces/ResourceDirectory.md#poolinfo)

***

### poolIntoArena()

> **poolIntoArena**(`poolKey`, `kind?`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:587](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L587)

Põe o pool `poolKey` na arena `kind` (T060i), para o pipeline que o acessa pela arena com `pools` no descritor: a
região fica reservada (o pool que nascer depois nasce nela) e o pool que já existe vai para ela — o conteúdo
copiado na GPU, o buffer próprio destruído e a realocação anunciada.

#### Parameters

##### poolKey

`string`

##### kind?

[`PoolArenaKind`](../type-aliases/PoolArenaKind.md) = `'cpu'`

#### Returns

`void`

#### Throws

Error pool que não cabe na arena (`placeInArena`).

***

### poolKeyForResource()

> **poolKeyForResource**(`resource`): `string` \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1341](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1341)

Resolve o poolKey do primeiro descritor em pool do Resource (schema.name +
algoritmo, quando declarado), ou undefined se não usa pool.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

#### Returns

`string` \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`poolKeyForResource`](../interfaces/ResourceDirectory.md#poolkeyforresource)

***

### poolKeyOf()

> **poolKeyOf**(`resource`, `descId`): `string` \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:852](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L852)

Chave do pool do descritor `descId` de `resource` (com algoritmo, quando declarado), ou `undefined`.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

`string` \| `undefined`

***

### poolLiveBuffer()

> **poolLiveBuffer**(`poolKey`): [`StorageBufferSpec`](../interfaces/StorageBufferSpec.md) \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1262](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1262)

Bitset de slots ocupados do pool na GPU (`array<u32>`, um bit por slot; spec 008): criado no primeiro pedido com
o estado atual e mantido por envio das palavras mudadas no mesmo quadro da alocação ou liberação; recriado no
crescimento do pool (com `poolReallocated`).

#### Parameters

##### poolKey

`string`

#### Returns

[`StorageBufferSpec`](../interfaces/StorageBufferSpec.md) \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`poolLiveBuffer`](../interfaces/ResourceDirectory.md#poollivebuffer)

***

### poolLiveSource()

> **poolLiveSource**(`poolKey`): [`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1269](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1269)

Fonte do bitset de vivos do pool: o buffer próprio, ou a faixa da região dos vivos na arena de pools (T060i).
`undefined` se o pool não existe.

#### Parameters

##### poolKey

`string`

#### Returns

[`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`poolLiveSource`](../interfaces/ResourceDirectory.md#poollivesource)

***

### poolRangeOf()

> **poolRangeOf**(`poolKey`, `entityId`): \{ `count`: `number`; `first`: `number`; \} \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1223](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1223)

Faixa de um entityId no pool (`count` slots a partir de `first`; spec 008).

#### Parameters

##### poolKey

`string`

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

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`poolRangeOf`](../interfaces/ResourceDirectory.md#poolrangeof)

***

### poolSlotOf()

> **poolSlotOf**(`poolKey`, `entityId`): `number` \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1218](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1218)

Slot de um entityId dentro do pool (offset = slot × stride).

#### Parameters

##### poolKey

`string`

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

`number` \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`poolSlotOf`](../interfaces/ResourceDirectory.md#poolslotof)

***

### poolSlotOwnedByGpu()

> **poolSlotOwnedByGpu**(`poolKey`, `slot`): `boolean`

Defined in: [src/scene/systems/ResourceSystem.ts:1246](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1246)

O slot do pool é de posse da GPU (`acquireOwnership`)?

#### Parameters

##### poolKey

`string`

##### slot

`number`

#### Returns

`boolean`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`poolSlotOwnedByGpu`](../interfaces/ResourceDirectory.md#poolslotownedbygpu)

***

### read()

> **read**(`resource`, `descId?`): `Promise`\<`Record`\<`string`, `unknown`\> \| `undefined`\>

Defined in: [src/scene/systems/ResourceSystem.ts:880](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L880)

Lê da GPU o dado de `resource` (o descritor `descId`, ou o primeiro com schema) e o devolve desempacotado pelo
schema — o caminho para a CPU ver um dado de posse da GPU (ex.: a pose de um corpo). Os pedidos da mesma
tarefa são agrupados: uma cópia por faixa contígua de slots de cada pool, um envio e uma leitura de volta; a
cópia entra depois do trabalho já enviado, então o valor é o do último quadro enviado. Resource fora da cena (ou
removido antes da resposta) resolve `undefined`. Nenhuma leitura acontece sem pedido.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId?

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\> \| `undefined`\>

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`read`](../interfaces/ResourceDirectory.md#read)

***

### readAll()

> **readAll**(`resources`, `descId?`): `Promise`\<(`Record`\<`string`, `unknown`\> \| `undefined`)[]\>

Defined in: [src/scene/systems/ResourceSystem.ts:892](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L892)

`read` de vários Resources, num lote só.

#### Parameters

##### resources

readonly [`Resource`](../interfaces/Resource.md)[]

##### descId?

`string`

#### Returns

`Promise`\<(`Record`\<`string`, `unknown`\> \| `undefined`)[]\>

***

### regionStrideOf()

> **regionStrideOf**(`resource`, `descId`): `number` \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1958](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1958)

Distância em bytes entre as regiões do uniforme por região `descId` de `resource` (o stride do schema alinhado ao
`minUniformBufferOffsetAlignment` do adaptador; spec 039), ou `undefined` se o descritor não tem `regions`.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

`number` \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`regionStrideOf`](../interfaces/ResourceDirectory.md#regionstrideof)

***

### releaseEntityRecords()

> **releaseEntityRecords**(`declaration`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:682](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L682)

Desfaz um `acquireEntityRecords`; sem usuários, os registros são liberados (o pool fica).

#### Parameters

##### declaration

[`EntityRecordDeclaration`](../interfaces/EntityRecordDeclaration.md)

#### Returns

`void`

***

### releaseFlow()

> **releaseFlow**(`flow`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:502](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L502)

Libera os pipelines e bind groups do Flow, emite `flowSuspended` se estava pronto e o descarta.

#### Parameters

##### flow

[`Flow`](Flow.md)

#### Returns

`void`

#### Implementation of

[`FlowAllocator`](../interfaces/FlowAllocator.md).[`releaseFlow`](../interfaces/FlowAllocator.md#releaseflow)

***

### releaseInstanceList()

> **releaseInstanceList**(`schema`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:722](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L722)

Desfaz um `acquireInstanceList`; sem usuários, as posições são liberadas (o pool fica).

#### Parameters

##### schema

[`StructSchema`](StructSchema.md)

#### Returns

`void`

***

### releaseOwnership()

> **releaseOwnership**(`owner`, `resource`, `descId`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:783](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L783)

Devolve à CPU a posse tomada por `owner`; o dado de intenção é reenviado no próximo envio.

#### Parameters

##### owner

`object`

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

`void`

***

### samplerOf()

> **samplerOf**(`resource`, `descId`): [`SamplerSpec`](../interfaces/SamplerSpec.md) \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1080](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1080)

Sampler alocado para o descritor `sampler`, ou `undefined`.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

[`SamplerSpec`](../interfaces/SamplerSpec.md) \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`samplerOf`](../interfaces/ResourceDirectory.md#samplerof)

***

### setInstance()

> **setInstance**(`poolKey`, `index`, `value`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:734](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L734)

Escreve `value` na posição `index` da lista de instâncias (enviado em faixas no próximo envio).

#### Parameters

##### poolKey

`string`

##### index

`number`

##### value

`number`

#### Returns

`void`

***

### textureOf()

> **textureOf**(`resource`, `descId`): [`TextureSpec`](../interfaces/TextureSpec.md) \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1072](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1072)

Textura alocada para o descritor (`texture`/`storage-texture`), ou `undefined`.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

[`TextureSpec`](../interfaces/TextureSpec.md) \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`textureOf`](../interfaces/ResourceDirectory.md#textureof)

***

### textureViewOf()

> **textureViewOf**(`resource`, `descId`): [`TextureViewSpec`](../interfaces/TextureViewSpec.md) \| `undefined`

Defined in: [src/scene/systems/ResourceSystem.ts:1076](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1076)

View da textura alocada para o descritor (`texture`/`storage-texture`), ou `undefined`.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

#### Returns

[`TextureViewSpec`](../interfaces/TextureViewSpec.md) \| `undefined`

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`textureViewOf`](../interfaces/ResourceDirectory.md#textureviewof)

***

### transition()

> **transition**(`resource`, `to`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:1356](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1356)

Muda o estado de `resource` para `to`, validando contra as transições do handler do estado atual.

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### to

[`ResourceState`](../enumerations/ResourceState.md)

#### Returns

`void`

#### Throws

Error com estado atual, destino e schema quando a transição não é válida.

***

### writeNow()

> **writeNow**(`resource`, `descId`, `bytes`, `offset?`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:1899](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1899)

Grava agora `bytes` no buffer do descritor `descId` de `resource` — o próprio, ou, em pool, a faixa do Resource (o
`offset` relativo ao início dela) —, a partir de `offset` (spec 039) — o
envio de um valor conhecido só na gravação (a contagem de uma reconstrução, os parâmetros de um despacho). Vale
durante a gravação: a escrita entra na fila antes do envio do quadro. O dado vai só à GPU (não a `data`).

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

##### bytes

`ArrayBufferView`

##### offset?

`number` = `0`

#### Returns

`void`

#### Throws

Error se o descritor não tem buffer alocado; RangeError fora da faixa em pool.

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`writeNow`](../interfaces/ResourceDirectory.md#writenow)

***

### writeRegions()

> **writeRegions**(`resource`, `descId`, `records`, `first?`): `void`

Defined in: [src/scene/systems/ResourceSystem.ts:1926](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ResourceSystem.ts#L1926)

Grava agora as regiões `[first, first + records.length)` do uniforme por região `descId` de `resource`, numa escrita
(spec 039). Vale também durante a gravação do quadro: a escrita entra na fila antes do envio, então cada chamada
gravada lê a sua região. O dado vai só à GPU (não a `data`).

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

##### descId

`string`

##### records

readonly `Record`\<`string`, `unknown`\>[]

##### first?

`number` = `0`

#### Returns

`void`

#### Throws

Error se o descritor não tem `regions` ou não está alocado; RangeError fora das regiões.

#### Implementation of

[`ResourceDirectory`](../interfaces/ResourceDirectory.md).[`writeRegions`](../interfaces/ResourceDirectory.md#writeregions)
