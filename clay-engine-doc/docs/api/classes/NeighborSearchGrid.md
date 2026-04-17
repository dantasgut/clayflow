# Class: NeighborSearchGrid

Defined in: [elements/physics/shared/NeighborSearchGrid.ts:49](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shared/NeighborSearchGrid.ts#L49)

## Constructors

### Constructor

> **new NeighborSearchGrid**(`config`, `maxParticles`): `NeighborSearchGrid`

Defined in: [elements/physics/shared/NeighborSearchGrid.ts:79](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shared/NeighborSearchGrid.ts#L79)

#### Parameters

##### config

[`NeighborSearchConfig`](../interfaces/NeighborSearchConfig.md)

##### maxParticles

`number`

#### Returns

`NeighborSearchGrid`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [elements/physics/shared/NeighborSearchGrid.ts:197](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shared/NeighborSearchGrid.ts#L197)

#### Returns

`void`

***

### encodeNeighborBuild()

> **encodeNeighborBuild**(`encoder`, `particleBuffer`, `particleCount`, `strideFloats`): `void`

Defined in: [elements/physics/shared/NeighborSearchGrid.ts:111](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shared/NeighborSearchGrid.ts#L111)

Insere no encoder todos os compute passes necessários para construir
a lista de vizinhos a partir de `particleBuffer`.

#### Parameters

##### encoder

`GPUCommandEncoder`

encoder ativo (pode conter outros passes antes/depois)

##### particleBuffer

`GPUBuffer`

storage buffer com partículas; pos.xyz em offset 0

##### particleCount

`number`

número de partículas ativas

##### strideFloats

`number`

stride em float32 (bytes / 4) — ex.: 16 para 64 bytes/partícula

#### Returns

`void`

***

### getNeighborCountBuffer()

> **getNeighborCountBuffer**(): `GPUBuffer`

Defined in: [elements/physics/shared/NeighborSearchGrid.ts:98](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shared/NeighborSearchGrid.ts#L98)

#### Returns

`GPUBuffer`

***

### getNeighborListBuffer()

> **getNeighborListBuffer**(): `GPUBuffer`

Defined in: [elements/physics/shared/NeighborSearchGrid.ts:97](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shared/NeighborSearchGrid.ts#L97)

#### Returns

`GPUBuffer`
