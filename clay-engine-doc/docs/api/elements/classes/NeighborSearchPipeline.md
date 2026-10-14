[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / NeighborSearchPipeline

# Class: NeighborSearchPipeline

Defined in: [elements/gpu/NeighborSearchPipeline.ts:64](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/NeighborSearchPipeline.ts#L64)

NeighborSearchPipeline implementa busca de vizinhos GPU via spatial
hashing + parallel prefix scan + scatter:
  1. `assign_count`: cada partícula computa cell index + atomicAdd em cellCount.
  2. soma de prefixos exclusiva cellCount → cellStart (offsets por cell) pelo `PrefixSum` genérico — qualquer
     número de células.
  3. `scatter`: cada partícula é escrita em sortedParticles[cellStart[cell] + cursor].
  4. `sort_cells` (spec 008): cada célula é ordenada por índice — o espalhamento atômico varia a ordem entre execuções.
  5. `find`: cada partícula busca vizinhos nas 27 cells adjacentes, numa ordem fixa, via
     sortedParticles[cellStart[c]..cellStart[c]+cellCount[c]] — a lista sai determinística, gravada direto.

Usado por SPHFlow e PBFFlow para acelerar density/forces computation.

## Constructors

### Constructor

> **new NeighborSearchPipeline**(`core`, `options`): `NeighborSearchPipeline`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:110](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/NeighborSearchPipeline.ts#L110)

#### Parameters

##### core

`EngineCore`

##### options

[`NeighborSearchOptions`](../interfaces/NeighborSearchOptions.md)

#### Returns

`NeighborSearchPipeline`

## Accessors

### neighborCount

#### Get Signature

> **get** **neighborCount**(): `StorageBufferSpec` \| `null`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:368](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/NeighborSearchPipeline.ts#L368)

Buffer de contadores — `neighborCount[p]` é o número de vizinhos
encontrados para a partícula p (≤ maxNeighbors).

##### Returns

`StorageBufferSpec` \| `null`

***

### neighborList

#### Get Signature

> **get** **neighborList**(): `StorageBufferSpec` \| `null`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:360](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/NeighborSearchPipeline.ts#L360)

Lista de vizinhos intercalada — o vizinho `n` da partícula `p` em `neighborList[n * maxParticles + p]` (leituras e
escritas contíguas entre partículas vizinhas)
dá o índice da n-ésima partícula vizinha de p (até `neighborCount[p]`).
Null antes de `rebuild` ser chamado pela primeira vez.

##### Returns

`StorageBufferSpec` \| `null`

## Methods

### allocate()

> **allocate**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:143](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/NeighborSearchPipeline.ts#L143)

Aloca os buffers da busca (grade, contagens, lista de vizinhos). Idempotente. Os Flows chamam antes de montar
os próprios kernels, que ligam `neighborList`/`neighborCount`.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:223](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/NeighborSearchPipeline.ts#L223)

Libera kernels, buffers e uniforms. A instância pode ser reutilizada (realoca no próximo uso).

#### Returns

`void`

***

### prepare()

> **prepare**(`particlesBuffer`, `liveBuffer`, `rebuildsPerFrame?`): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:260](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/NeighborSearchPipeline.ts#L260)

Prepara a busca para o buffer de partículas `particlesBuffer` e até `rebuildsPerFrame` reconstruções por quadro:
buffers da grade, kernels e a soma de prefixos. Idempotente; fora da gravação (numa transição do Flow — ex.: o
pool de partículas cresceu ou o número de passos do quadro mudou).

#### Parameters

##### particlesBuffer

`StorageBufferSpec`

##### liveBuffer

`StorageBufferSpec`

##### rebuildsPerFrame?

`number` = `1`

#### Returns

`void`

***

### rebuild()

> **rebuild**(`frame`, `particleCount`): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:380](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/NeighborSearchPipeline.ts#L380)

Grava a reconstrução das listas de vizinhos para as `particleCount` partículas do buffer preparado (`prepare`).
`particleCount = 0` não grava nada.

Sequência: assign_count → soma de prefixos (cellCount → cellStart) → copy(cellStart, cellCursor) → scatter →
sort_cells (cada célula em ordem de índice) → find.

#### Parameters

##### frame

`Frame`

##### particleCount

`number`

#### Returns

`void`

#### Throws

Error se `prepare` não foi chamado.

***

### requireCapacity()

> `static` **requireCapacity**(`stage`, `pool`): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:69](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/NeighborSearchPipeline.ts#L69)

Confere que o pool cabe no teto da busca (`NEIGHBOR_SEARCH_MAX_PARTICLES`).

#### Parameters

##### stage

`string`

##### pool

`BoundPool`

#### Returns

`void`

#### Throws

RangeError nomeando o estágio, a entidade do corpo que passou do teto, a contagem e o teto.
