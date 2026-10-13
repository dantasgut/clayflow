[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RadixSort

# Class: RadixSort

Defined in: [elements/gpu/compute/RadixSort.ts:64](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/gpu/compute/RadixSort.ts#L64)

Ordenação radix LSD estável de chaves u32 (research R9 da 005), com valores u32 opcionais. Cada passe de 4 bits:
histograma dos 16 dígitos por grupo de 256 (dígito-maior), soma de prefixos exclusiva dele (`PrefixSum`) — a base
global de cada (dígito, grupo) — e espalhamento estável. Sem atômicos na saída: o resultado é determinístico.

Os passes alternam entre o buffer do chamador e um temporário interno (pingue-pongue); com número ímpar de passes,
o resultado é copiado de volta, então ele sempre termina em `keys` (e `values`).

Duas fases (spec 006): `prepare(keys, values, gravaçõesPorQuadro)` fora da gravação; `record` só grava.

## Constructors

### Constructor

> **new RadixSort**(`core`, `options`): `RadixSort`

Defined in: [elements/gpu/compute/RadixSort.ts:75](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/gpu/compute/RadixSort.ts#L75)

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

Defined in: [elements/gpu/compute/RadixSort.ts:170](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/gpu/compute/RadixSort.ts#L170)

Libera kernels, temporários, a soma de prefixos interna e os uniforms.

#### Returns

`void`

***

### prepare()

> **prepare**(`keys`, `values?`, `recordsPerFrame?`): `void`

Defined in: [elements/gpu/compute/RadixSort.ts:101](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/gpu/compute/RadixSort.ts#L101)

Prepara a ordenação de `keys` (e `values`, com `withValues`) para até `recordsPerFrame` gravações por quadro.
Idempotente; fora da gravação.

#### Parameters

##### keys

`StorageBufferSpec`

##### values?

`StorageBufferSpec`

##### recordsPerFrame?

`number` = `1`

#### Returns

`void`

***

### record()

> **record**(`frame`, `args`): `void`

Defined in: [elements/gpu/compute/RadixSort.ts:129](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/gpu/compute/RadixSort.ts#L129)

Grava a ordenação de `keys[0, count)` (e `values`) no lugar.

#### Parameters

##### frame

`Frame`

##### args

[`RadixSortRecordArgs`](../interfaces/RadixSortRecordArgs.md)

#### Returns

`void`

#### Throws

Error se (`keys`, `values`) não foi preparado.
