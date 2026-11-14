[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / RadixSort

# Class: RadixSort

Defined in: [src/elements/gpu/compute/RadixSort.ts:91](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L91)

Ordenação radix LSD estável de chaves u32 (research R9 da 005), com valores u32 opcionais. Cada passe de 4 bits:
histograma dos 16 dígitos por grupo de 256 (dígito-maior), soma de prefixos exclusiva dele (`PrefixSum`) — a base
global de cada (dígito, grupo) — e espalhamento estável. Sem atômicos na saída: o resultado é determinístico.

Os passes alternam entre o buffer do chamador e um temporário interno (pingue-pongue); com número ímpar de passes,
o resultado é copiado de volta, então ele sempre termina em `keys` (e `values`).

Contagem da GPU (spec 031, R10): preparada com `counts`, a ordenação aceita `count: { counts, index }` — os
elementos vêm do registro `SetCount` no próprio kernel (ponto `radix_count`), sem leitura de volta. O histograma usa
os grupos da capacidade (os além da contagem real ficam zerados, sem mudar as bases) e despacha pela capacidade; a
soma de prefixos dele tem tamanho conhecido na CPU; o espalhamento despacha pelo argumento indireto do registro, que
precisa já trazer o despacho para grupos de 256 (`CountToArgs` com `workgroupSize: 256` gravado antes no mesmo
fluxo). Com número ímpar de passes, as chaves (e valores) são copiadas para o temporário antes e de volta depois,
pela capacidade (limitada pelos buffers) — a cauda além da contagem volta intacta. A contagem deve ser ≤ `capacity`.

Duas fases (spec 006): `prepare(keys, values, gravaçõesPorQuadro, counts?)` fora da gravação; `record` só grava.
Os temporários e o histograma são descritores do Resource de trabalho (spec 039).

## Implements

- [`WorkPart`](../../platform/web/interfaces/WorkPart.md)

## Constructors

### Constructor

> **new RadixSort**(`ctx`, `options`): `RadixSort`

Defined in: [src/elements/gpu/compute/RadixSort.ts:105](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L105)

#### Parameters

##### ctx

[`WorkContext`](../../platform/web/interfaces/WorkContext.md)

##### options

[`RadixSortOptions`](../interfaces/RadixSortOptions.md)

#### Returns

`RadixSort`

## Methods

### descriptors()

> **descriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/gpu/compute/RadixSort.ts:129](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L129)

Temporários do pingue-pongue (chaves e, com `withValues`, valores) e o histograma dos grupos.

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`WorkPart`](../../platform/web/interfaces/WorkPart.md).[`descriptors`](../../platform/web/interfaces/WorkPart.md#descriptors)

***

### destroy()

> **destroy**(): `void`

Defined in: [src/elements/gpu/compute/RadixSort.ts:316](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L316)

Libera os kernels e solta os temporários e a soma interna (a C2 os libera); `prepare` os declara de novo.

#### Returns

`void`

***

### prepare()

> **prepare**(`keys`, `values?`, `recordsPerFrame?`, `counts?`): `void`

Defined in: [src/elements/gpu/compute/RadixSort.ts:167](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L167)

Prepara a ordenação de `keys` (e `values`, com `withValues`) para até `recordsPerFrame` gravações por quadro.
Com `counts`, também os kernels da variante de contagem da GPU ligados a esse buffer de registros `SetCount`
(memorizados por buffer). Idempotente; fora da gravação.

#### Parameters

##### keys

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

##### values?

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

##### recordsPerFrame?

`number` = `1`

##### counts?

[`IndirectBufferSpec`](../../platform/web/interfaces/IndirectBufferSpec.md)

#### Returns

`void`

***

### record()

> **record**(`frame`, `args`): `void`

Defined in: [src/elements/gpu/compute/RadixSort.ts:209](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L209)

Grava a ordenação de `keys[0, count)` (e `values`) no lugar.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### args

[`RadixSortRecordArgs`](../interfaces/RadixSortRecordArgs.md)

#### Returns

`void`

#### Throws

Error se (`keys`, `values`) não foi preparado.
