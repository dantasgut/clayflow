[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / NeighborSearchPipeline

# Class: NeighborSearchPipeline

Defined in: [elements/gpu/NeighborSearchPipeline.ts:29](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/NeighborSearchPipeline.ts#L29)

## Constructors

### Constructor

> **new NeighborSearchPipeline**(`core`, `options`): `NeighborSearchPipeline`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:84](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/NeighborSearchPipeline.ts#L84)

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

Defined in: [elements/gpu/NeighborSearchPipeline.ts:322](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/NeighborSearchPipeline.ts#L322)

##### Returns

`StorageBufferSpec` \| `null`

***

### neighborList

#### Get Signature

> **get** **neighborList**(): `StorageBufferSpec` \| `null`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:318](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/NeighborSearchPipeline.ts#L318)

##### Returns

`StorageBufferSpec` \| `null`

## Methods

### invalidateParticlesBinding()

> **invalidateParticlesBinding**(): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:103](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/NeighborSearchPipeline.ts#L103)

Invalida bind groups que dependem do particles buffer atual.
Chamado por SPHFlow/PBFFlow quando o pool de partículas reallocate.

#### Returns

`void`

***

### rebuild()

> **rebuild**(`frame`, `particlesBuffer`, `particleCount`): `void`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:331](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/NeighborSearchPipeline.ts#L331)

#### Parameters

##### frame

`Frame`

##### particlesBuffer

`StorageBufferSpec`

##### particleCount

`number`

#### Returns

`void`
