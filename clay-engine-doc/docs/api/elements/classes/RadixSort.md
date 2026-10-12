[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RadixSort

# Class: RadixSort

Defined in: [elements/gpu/compute/RadixSort.ts:59](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L59)

Ordenação radix LSD estável de chaves u32 (research R9), com valores u32 opcionais. Cada passe de 4 bits: histograma
dos 16 dígitos por grupo de 256 (dígito-maior), soma de prefixos exclusiva dele (`PrefixSum`) — a base global de cada
(dígito, grupo) — e espalhamento estável. Sem atômicos na saída: o resultado é determinístico.

Os passes alternam entre o buffer do chamador e um temporário interno (pingue-pongue); com número ímpar de passes, o
resultado é copiado de volta, então ele sempre termina em `keys` (e `values`).

## Constructors

### Constructor

> **new RadixSort**(`core`, `options`): `RadixSort`

Defined in: [elements/gpu/compute/RadixSort.ts:72](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L72)

#### Parameters

##### core

`EngineCore`

##### options

[`RadixSortOptions`](../interfaces/RadixSortOptions.md)

#### Returns

`RadixSort`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [elements/gpu/compute/RadixSort.ts:161](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L161)

Libera kernels, temporários, a soma de prefixos interna e os uniforms.

#### Returns

`void`

***

### record()

> **record**(`frame`, `args`): `void`

Defined in: [elements/gpu/compute/RadixSort.ts:95](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L95)

Grava a ordenação de `keys[0, count)` (e `values`) no lugar.

#### Parameters

##### frame

`Frame`

##### args

[`RadixSortRecordArgs`](../interfaces/RadixSortRecordArgs.md)

#### Returns

`void`
