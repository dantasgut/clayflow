[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / NeighborSearchPipeline

# Class: NeighborSearchPipeline

Defined in: [elements/gpu/NeighborSearchPipeline.ts:56](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/NeighborSearchPipeline.ts#L56)

NeighborSearchPipeline implementa busca de vizinhos GPU via spatial
hashing + parallel prefix scan + scatter:
  1. `assign_count`: cada partícula computa cell index + atomicAdd em cellCount.
  2. soma de prefixos exclusiva cellCount → cellStart (offsets por cell) pelo `PrefixSum` genérico — qualquer
     número de células.
  3. `scatter`: cada partícula é escrita em sortedParticles[cellStart[cell] + cursor].
  4. `find`: cada partícula busca vizinhos nas 27 cells adjacentes via
     sortedParticles[cellStart[c]..cellStart[c]+cellCount[c]].

Usado por SPHFlow e PBFFlow para acelerar density/forces computation.

## Constructors

### Constructor

> **new NeighborSearchPipeline**(`core`, `options`): `NeighborSearchPipeline`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:85](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/NeighborSearchPipeline.ts#L85)

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

Defined in: [elements/gpu/NeighborSearchPipeline.ts:304](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/NeighborSearchPipeline.ts#L304)

Buffer de contadores — `neighborCount[p]` é o número de vizinhos
encontrados para a partícula p (≤ maxNeighbors).

##### Returns

`StorageBufferSpec` \| `null`

***

### neighborList

#### Get Signature

> **get** **neighborList**(): `StorageBufferSpec` \| `null`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:296](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/NeighborSearchPipeline.ts#L296)

Buffer de neighbor indices flat — `neighborList[p*maxNeighbors + n]`
dá o índice da n-ésima partícula vizinha de p (até `neighborCount[p]`).
Null antes de `rebuild` ser chamado pela primeira vez.

##### Returns

`StorageBufferSpec` \| `null`

## Methods

### allocate()

> **allocate**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:116](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/NeighborSearchPipeline.ts#L116)

Aloca os buffers da busca (grade, contagens, lista de vizinhos). Idempotente. Os Flows chamam antes de montar
os próprios kernels, que ligam `neighborList`/`neighborCount`.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:188](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/NeighborSearchPipeline.ts#L188)

Libera kernels, buffers e uniforms. A instância pode ser reutilizada (realoca no próximo uso).

#### Returns

`void`

***

### prepare()

> **prepare**(`particlesBuffer`, `rebuildsPerFrame?`): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:222](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/NeighborSearchPipeline.ts#L222)

Prepara a busca para o buffer de partículas `particlesBuffer` e até `rebuildsPerFrame` reconstruções por quadro:
buffers da grade, kernels e a soma de prefixos. Idempotente; fora da gravação (numa transição do Flow — ex.: o
pool de partículas cresceu ou o número de passos do quadro mudou).

#### Parameters

##### particlesBuffer

`StorageBufferSpec`

##### rebuildsPerFrame?

`number` = `1`

#### Returns

`void`

***

### rebuild()

> **rebuild**(`frame`, `particleCount`): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:316](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/NeighborSearchPipeline.ts#L316)

Grava a reconstrução das listas de vizinhos para as `particleCount` partículas do buffer preparado (`prepare`).
`particleCount = 0` não grava nada.

Sequência: assign_count → soma de prefixos (cellCount → cellStart) → copy(cellStart, cellCursor) → scatter →
find.

#### Parameters

##### frame

`Frame`

##### particleCount

`number`

#### Returns

`void`

#### Throws

Error se `prepare` não foi chamado.
