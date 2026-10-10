[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / NeighborSearchPipeline

# Class: NeighborSearchPipeline

Defined in: [elements/gpu/NeighborSearchPipeline.ts:82](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/gpu/NeighborSearchPipeline.ts#L82)

NeighborSearchPipeline implementa busca de vizinhos GPU via spatial
hashing + parallel prefix scan + scatter. Pipeline com 6 kernels:
  1. `assign_count`: cada partícula computa cell index + atomicAdd em cellCount.
  2. soma de prefixos hierárquica cellCount → cellStart (offsets por cell): `scan_local` sobe nível a
     nível (totais por grupo de 256), `scan_groups` escaneia o topo num grupo, `scan_combine` desce somando o
     prefixo do grupo — qualquer número de células (spec 004, R17).
  3. `scatter`: cada partícula é escrita em sortedParticles[cellStart[cell] + cursor].
  4. `find`: cada partícula busca vizinhos nas 27 cells adjacentes via
     sortedParticles[cellStart[c]..cellStart[c]+cellCount[c]].

Usado por SPHFlow e PBFFlow para acelerar density/forces computation.

## Constructors

### Constructor

> **new NeighborSearchPipeline**(`core`, `options`): `NeighborSearchPipeline`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:119](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/gpu/NeighborSearchPipeline.ts#L119)

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

Defined in: [elements/gpu/NeighborSearchPipeline.ts:538](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/gpu/NeighborSearchPipeline.ts#L538)

Buffer de contadores — `neighborCount[p]` é o número de vizinhos
encontrados para a partícula p (≤ maxNeighbors).

##### Returns

`StorageBufferSpec` \| `null`

***

### neighborList

#### Get Signature

> **get** **neighborList**(): `StorageBufferSpec` \| `null`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:530](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/gpu/NeighborSearchPipeline.ts#L530)

Buffer de neighbor indices flat — `neighborList[p*maxNeighbors + n]`
dá o índice da n-ésima partícula vizinha de p (até `neighborCount[p]`).
Null antes de `rebuild` ser chamado pela primeira vez.

##### Returns

`StorageBufferSpec` \| `null`

## Methods

### allocate()

> **allocate**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:158](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/gpu/NeighborSearchPipeline.ts#L158)

Aloca os buffers da busca (grade, contagens, lista de vizinhos). Idempotente. Os Flows chamam antes de montar
os próprios kernels, que ligam `neighborList`/`neighborCount`.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:329](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/gpu/NeighborSearchPipeline.ts#L329)

Libera kernels, buffers e uniforms. A instância pode ser reutilizada (realoca no próximo uso).

#### Returns

`void`

***

### invalidateParticlesBinding()

> **invalidateParticlesBinding**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:141](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/gpu/NeighborSearchPipeline.ts#L141)

Invalida bind groups que dependem do particles buffer atual.
Chamado por SPHFlow/PBFFlow quando o pool de partículas reallocate.

#### Returns

`void`

***

### rebuild()

> **rebuild**(`frame`, `particlesBuffer`, `particleCount`): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:550](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/gpu/NeighborSearchPipeline.ts#L550)

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
