[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / NeighborSearchPipeline

# Class: NeighborSearchPipeline

Defined in: [elements/gpu/NeighborSearchPipeline.ts:52](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L52)

NeighborSearchPipeline implementa busca de vizinhos GPU via spatial
hashing + parallel prefix scan + scatter. Pipeline com 6 kernels:
  1. `assign_count`: cada partícula computa cell index + atomicAdd em cellCount.
  2. `scan_local` + `scan_groups` + `scan_combine`: prefix sum sobre
     cellCount → cellStart (offsets para cada cell).
  3. `scatter`: cada partícula é escrita em sortedParticles[cellStart[cell] + cursor].
  4. `find`: cada partícula busca vizinhos nas 27 cells adjacentes via
     sortedParticles[cellStart[c]..cellStart[c]+cellCount[c]].

Usado por SPHFlow e PBFFlow para acelerar density/forces computation.

## Constructors

### Constructor

> **new NeighborSearchPipeline**(`core`, `options`): `NeighborSearchPipeline`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:82](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L82)

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

Defined in: [elements/gpu/NeighborSearchPipeline.ts:413](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L413)

Buffer de contadores — `neighborCount[p]` é o número de vizinhos
encontrados para a partícula p (≤ maxNeighbors).

##### Returns

`StorageBufferSpec` \| `null`

***

### neighborList

#### Get Signature

> **get** **neighborList**(): `StorageBufferSpec` \| `null`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:405](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L405)

Buffer de neighbor indices flat — `neighborList[p*maxNeighbors + n]`
dá o índice da n-ésima partícula vizinha de p (até `neighborCount[p]`).
Null antes de `rebuild` ser chamado pela primeira vez.

##### Returns

`StorageBufferSpec` \| `null`

## Methods

### invalidateParticlesBinding()

> **invalidateParticlesBinding**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:104](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L104)

Invalida bind groups que dependem do particles buffer atual.
Chamado por SPHFlow/PBFFlow quando o pool de partículas reallocate.

#### Returns

`void`

***

### rebuild()

> **rebuild**(`frame`, `particlesBuffer`, `particleCount`): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:430](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L430)

Reconstrói os buffers de vizinhos para o estado atual de partículas.
Chamado uma vez por frame (no início do dispatch do flow consumidor).
Se particleCount=0, no-op.

Sequência de kernels: assign_count → scan_local → scan_groups →
scan_combine → copy(cellStart, cellCursor) → scatter → find.

#### Parameters

##### frame

`Frame`

##### particlesBuffer

`StorageBufferSpec`

##### particleCount

`number`

#### Returns

`void`
