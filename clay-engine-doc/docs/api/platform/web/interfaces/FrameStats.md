[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FrameStats

# Interface: FrameStats

Defined in: [src/core/contracts/FrameStats.ts:5](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L5)

Estatísticas de um quadro, em vocabulário de domínio (sem tipos WebGPU).
Entregues em `frameComplete.stats` e por `EngineCore.lastFrameStats()`.

## Properties

### dispatches

> `readonly` **dispatches**: `number`

Defined in: [src/core/contracts/FrameStats.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L9)

Dispatches de compute no quadro (diretos + indiretos).

***

### drawCalls

> `readonly` **drawCalls**: `number`

Defined in: [src/core/contracts/FrameStats.ts:7](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L7)

Draw calls emitidos no quadro (diretos, indiretos e dentro de bundles executados).

***

### gpuFrame?

> `readonly` `optional` **gpuFrame?**: `number`

Defined in: [src/core/contracts/FrameStats.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L19)

Índice do quadro a que `gpuTimeMs` se refere.

***

### gpuTimeMs?

> `readonly` `optional` **gpuTimeMs?**: `number`

Defined in: [src/core/contracts/FrameStats.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L17)

Tempo de GPU somado de todos os passes, em ms. Ausente quando o profiling está desligado,
o dispositivo não suporta timestamps, a capacidade estourou ou ainda não há leitura resolvida.
Chega com defasagem de 1–3 quadros; ver `gpuFrame`.

***

### passes

> `readonly` **passes**: `number`

Defined in: [src/core/contracts/FrameStats.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L11)

Passes render + compute abertos no quadro.

***

### scopesNs?

> `readonly` `optional` **scopesNs?**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/core/contracts/FrameStats.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L26)

Tempo de GPU pelo caminho completo do passe (`fase/Flow/rótulo`, ns), da mesma leitura de `gpuTimeMs`.

***

### stagesNs?

> `readonly` `optional` **stagesNs?**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/core/contracts/FrameStats.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/FrameStats.ts#L24)

Tempo de GPU por rótulo de passe (ns), da mesma leitura de `gpuTimeMs`
(ex.: `{ TransformFlow: 41000, forward: 820000 }`). Ausente junto com `gpuTimeMs`.
