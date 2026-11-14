[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FrameGpuTiming

# Interface: FrameGpuTiming

Defined in: [src/core/contracts/FrameStats.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L33)

Uma leitura de tempo de GPU de um quadro (spec 034): entregue uma única vez por `EngineCore.takeFrameTimings()`,
na ordem de chegada (a GPU termina 1–3 quadros depois da gravação).

## Properties

### gpuFrame

> `readonly` **gpuFrame**: `number`

Defined in: [src/core/contracts/FrameStats.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L35)

Índice do quadro medido.

***

### gpuTimeMs

> `readonly` **gpuTimeMs**: `number`

Defined in: [src/core/contracts/FrameStats.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L37)

Soma dos passes medidos, em ms.

***

### scopesNs

> `readonly` **scopesNs**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/core/contracts/FrameStats.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L46)

Pelo caminho completo do passe (`fase/Flow/rótulo`, ns).

***

### spanMs

> `readonly` **spanMs**: `number`

Defined in: [src/core/contracts/FrameStats.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L42)

Do primeiro início ao último fim dos passes, em ms: o tempo do quadro na GPU. Menor que a soma onde a GPU sobrepõe
passes seguidos (TBDR).

***

### stagesNs

> `readonly` **stagesNs**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/core/contracts/FrameStats.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L44)

Por rótulo de passe (ns).
