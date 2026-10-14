[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Compaction

# Class: Compaction

Defined in: [elements/gpu/compute/Compaction.ts:59](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/compute/Compaction.ts#L59)

Compactação de índices ou valores por predicado (research R10 da 005): os elementos `i` com `compact_keep(i)` viram
`compact_value(i)` numa lista densa. Modo padrão: um passe com `atomic_alloc` (ordem não garantida). Modo
`stable`: flags, soma de prefixos exclusiva e espalhamento — ordem da entrada preservada, resultado determinístico.
Nos dois modos o excedente acima de `capacity` é contado (`overflow`) e nada é escrito fora da saída.

Duas fases (spec 006): `prepare(out, counter, gravaçõesPorQuadro)` fora da gravação; `record` só grava.

## Constructors

### Constructor

> **new Compaction**(`core`, `options`): `Compaction`

Defined in: [elements/gpu/compute/Compaction.ts:71](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/compute/Compaction.ts#L71)

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

Defined in: [elements/gpu/compute/Compaction.ts:158](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/compute/Compaction.ts#L158)

Libera kernels, flags, soma de prefixos e uniforms.

#### Returns

`void`

***

### prepare()

> **prepare**(`out`, `counter`, `recordsPerFrame?`): `void`

Defined in: [elements/gpu/compute/Compaction.ts:108](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/compute/Compaction.ts#L108)

Prepara a compactação para a saída `out` e o contador `counter`, para até `recordsPerFrame` gravações por
quadro. Idempotente; chamado fora da gravação.

#### Parameters

##### out

`StorageBufferSpec`

##### counter

`StorageBufferSpec`

##### recordsPerFrame?

`number` = `1`

#### Returns

`void`

***

### record()

> **record**(`frame`, `args`): `void`

Defined in: [elements/gpu/compute/Compaction.ts:129](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/compute/Compaction.ts#L129)

Grava a compactação de `[0, count)` em `out`; o contador é zerado no fluxo de comandos antes.

#### Parameters

##### frame

`Frame`

##### args

[`CompactionRecordArgs`](../interfaces/CompactionRecordArgs.md)

#### Returns

`void`

#### Throws

Error se (`out`, `counter`) não foi preparado.
