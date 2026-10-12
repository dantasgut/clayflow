[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / NeighborSearchPipeline

# Class: NeighborSearchPipeline

Defined in: [elements/gpu/NeighborSearchPipeline.ts:55](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/NeighborSearchPipeline.ts#L55)

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

Defined in: [elements/gpu/NeighborSearchPipeline.ts:84](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/NeighborSearchPipeline.ts#L84)

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

Defined in: [elements/gpu/NeighborSearchPipeline.ts:388](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/NeighborSearchPipeline.ts#L388)

Buffer de contadores — `neighborCount[p]` é o número de vizinhos
encontrados para a partícula p (≤ maxNeighbors).

##### Returns

`StorageBufferSpec` \| `null`

***

### neighborList

#### Get Signature

> **get** **neighborList**(): `StorageBufferSpec` \| `null`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:380](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/NeighborSearchPipeline.ts#L380)

Buffer de neighbor indices flat — `neighborList[p*maxNeighbors + n]`
dá o índice da n-ésima partícula vizinha de p (até `neighborCount[p]`).
Null antes de `rebuild` ser chamado pela primeira vez.

##### Returns

`StorageBufferSpec` \| `null`

## Methods

### allocate()

> **allocate**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:124](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/NeighborSearchPipeline.ts#L124)

Aloca os buffers da busca (grade, contagens, lista de vizinhos). Idempotente. Os Flows chamam antes de montar
os próprios kernels, que ligam `neighborList`/`neighborCount`.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:196](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/NeighborSearchPipeline.ts#L196)

Libera kernels, buffers e uniforms. A instância pode ser reutilizada (realoca no próximo uso).

#### Returns

`void`

***

### invalidateParticlesBinding()

> **invalidateParticlesBinding**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:107](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/NeighborSearchPipeline.ts#L107)

Invalida bind groups que dependem do particles buffer atual.
Chamado por SPHFlow/PBFFlow quando o pool de partículas reallocate.

#### Returns

`void`

***

### rebuild()

> **rebuild**(`frame`, `particlesBuffer`, `particleCount`): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:400](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/NeighborSearchPipeline.ts#L400)

Reconstrói os buffers de vizinhos para o estado atual de partículas.
Chamado uma vez por frame (no início do dispatch do flow consumidor).
Se particleCount=0, no-op.

Sequência: assign_count → soma de prefixos (cellCount → cellStart) →
copy(cellStart, cellCursor) → scatter → find.

#### Parameters

##### frame

`Frame`

##### particlesBuffer

`StorageBufferSpec`

##### particleCount

`number`

#### Returns

`void`
