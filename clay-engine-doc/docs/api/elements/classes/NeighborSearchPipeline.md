[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / NeighborSearchPipeline

# Class: NeighborSearchPipeline

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:83](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L83)

Busca de vizinhos por grade uniforme (contagem por célula, soma de prefixos, espalhamento, ordem por célula, busca).
O espaço de trabalho — a grade, as listas por partícula, os parâmetros — é descritor do Resource de trabalho do Flow
dono (spec 039): a C2 aloca e libera; a instância só liga os kernels ao que a C2 alocou.

## Implements

- [`WorkPart`](../../platform/web/interfaces/WorkPart.md)

## Constructors

### Constructor

> **new NeighborSearchPipeline**(`ctx`, `options`): `NeighborSearchPipeline`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:120](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L120)

#### Parameters

##### ctx

[`WorkContext`](../../platform/web/interfaces/WorkContext.md)

##### options

[`NeighborSearchOptions`](../interfaces/NeighborSearchOptions.md)

#### Returns

`NeighborSearchPipeline`

## Accessors

### grid

#### Get Signature

> **get** **grid**(): \{ `cellCount`: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md); `cellSize`: `number`; `cellStart`: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md); `gridDim`: readonly \[`number`, `number`, `number`\]; `origin`: readonly \[`number`, `number`, `number`\]; `sortedParticles`: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md); \} \| `null`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:360](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L360)

Grade da última reconstrução (spec 010, partículas secundárias): `cellStart[c]` e `cellCount[c]` dão a faixa da
célula `c` em `sortedParticles` (índices das partículas, em ordem dentro da célula); origem, dimensões e aresta da
célula para achar a célula de um ponto qualquer. Null antes de `allocate`.

##### Returns

\{ `cellCount`: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md); `cellSize`: `number`; `cellStart`: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md); `gridDim`: readonly \[`number`, `number`, `number`\]; `origin`: readonly \[`number`, `number`, `number`\]; `sortedParticles`: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md); \} \| `null`

***

### neighborCount

#### Get Signature

> **get** **neighborCount**(): [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md) \| `null`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:388](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L388)

Buffer de contadores — `neighborCount[p]` é o número de vizinhos
encontrados para a partícula p (≤ maxNeighbors).

##### Returns

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md) \| `null`

***

### neighborList

#### Get Signature

> **get** **neighborList**(): [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md) \| `null`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:351](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L351)

Lista de vizinhos intercalada — o vizinho `n` da partícula `p` em `neighborList[n * maxParticles + p]` (leituras e
escritas contíguas entre partículas vizinhas)
dá o índice da n-ésima partícula vizinha de p (até `neighborCount[p]`).
Null antes de `rebuild` ser chamado pela primeira vez.

##### Returns

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md) \| `null`

***

### neighborOrder

#### Get Signature

> **get** **neighborOrder**(): [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md) \| `null`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:393](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L393)

A ordem por célula: no posto `t`, a partícula + 1 (0: posto vazio). Null antes de `allocate`.

##### Returns

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md) \| `null`

## Methods

### allocate()

> **allocate**(): `void`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:226](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L226)

Compatibilidade da sequência dos Flows: o espaço de trabalho já é declarado na construção e alocado pela C2 com o
Resource de trabalho (spec 039). Os Flows montam os próprios kernels depois, ligando `neighborList`/`neighborCount`.

#### Returns

`void`

***

### descriptors()

> **descriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:146](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L146)

Os descritores atuais da parte (ids únicos no Resource de trabalho).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`WorkPart`](../../platform/web/interfaces/WorkPart.md).[`descriptors`](../../platform/web/interfaces/WorkPart.md#descriptors)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:229](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L229)

Libera os kernels e tira os descritores da busca do trabalho (a C2 libera os buffers).

#### Returns

`void`

***

### prepare()

> **prepare**(`particlesBuffer`, `liveBuffer`, `rebuildsPerFrame?`): `void`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:247](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L247)

Prepara a busca para o buffer de partículas `particlesBuffer` e até `rebuildsPerFrame` reconstruções por quadro:
buffers da grade, kernels e a soma de prefixos. Idempotente; fora da gravação (numa transição do Flow — ex.: o
pool de partículas cresceu ou o número de passos do quadro mudou).

#### Parameters

##### particlesBuffer

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

##### liveBuffer

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

##### rebuildsPerFrame?

`number` = `1`

#### Returns

`void`

***

### rebuild()

> **rebuild**(`frame`, `particleCount`, `then?`): `void`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:408](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L408)

Grava a reconstrução das listas de vizinhos para as `particleCount` partículas do buffer preparado (`prepare`).
`particleCount = 0` não grava nada.

Sequência: assign_count → soma de prefixos (cellCount → cellStart) → copy(cellStart, cellCursor) → scatter →
sort_cells (cada célula em ordem de índice) → find. São três passes de computação (as cópias e zeragens ficam
entre eles): cada passe aberto custa mais que um despacho de dezenas de milhares de partículas, e dentro de um
passe cada despacho já vê o que o anterior escreveu. `then` grava, no mesmo passe da busca, os despachos do
consumidor que leem as listas.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### particleCount

`number`

##### then?

(`pass`) => `void`

#### Returns

`void`

#### Throws

Error se `prepare` não foi chamado.

***

### requireCapacity()

> `static` **requireCapacity**(`stage`, `pool`): `void`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L88)

Confere que o pool cabe no teto da busca (`NEIGHBOR_SEARCH_MAX_PARTICLES`).

#### Parameters

##### stage

`string`

##### pool

[`BoundPool`](../../platform/web/interfaces/BoundPool.md)

#### Returns

`void`

#### Throws

RangeError nomeando o estágio, a entidade do corpo que passou do teto, a contagem e o teto.
