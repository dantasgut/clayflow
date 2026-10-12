[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Compaction

# Class: Compaction

Defined in: [elements/gpu/compute/Compaction.ts:61](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L61)

Compactação de índices ou valores por predicado (research R10): os elementos `i` com `compact_keep(i)` viram
`compact_value(i)` numa lista densa. Modo padrão: um passe com `atomic_alloc` (ordem não garantida). Modo
`stable`: flags, soma de prefixos exclusiva e espalhamento — ordem da entrada preservada, resultado determinístico.
Nos dois modos o excedente acima de `capacity` é contado (`overflow`) e nada é escrito fora da saída.

## Constructors

### Constructor

> **new Compaction**(`core`, `options`): `Compaction`

Defined in: [elements/gpu/compute/Compaction.ts:74](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L74)

#### Parameters

##### core

`EngineCore`

##### options

[`CompactionOptions`](../interfaces/CompactionOptions.md)

#### Returns

`Compaction`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [elements/gpu/compute/Compaction.ts:138](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L138)

Libera kernels, flags, soma de prefixos e uniforms.

#### Returns

`void`

***

### record()

> **record**(`frame`, `args`): `void`

Defined in: [elements/gpu/compute/Compaction.ts:108](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L108)

Grava a compactação de `[0, count)` em `out`; o contador é zerado no fluxo de comandos antes.

#### Parameters

##### frame

`Frame`

##### args

[`CompactionRecordArgs`](../interfaces/CompactionRecordArgs.md)

#### Returns

`void`
