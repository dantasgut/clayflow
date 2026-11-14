[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / Compaction

# Class: Compaction

Defined in: [src/elements/gpu/compute/Compaction.ts:75](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L75)

Compactação de índices ou valores por predicado (research R10 da 005): os elementos `i` com `compact_keep(i)` viram
`compact_value(i)` numa lista densa. Modo padrão: um passe com `atomic_alloc` (ordem não garantida). Modo
`stable`: flags, soma de prefixos exclusiva e espalhamento — ordem da entrada preservada, resultado determinístico.
Nos dois modos o excedente acima de `capacity` é contado (`overflow`) e nada é escrito fora da saída.

Contagem da GPU (spec 031, R10): preparada com `counts`, a compactação aceita `count: { counts, index }` — a
entrada vem do registro `SetCount` no próprio kernel (ponto `compact_count`), sem leitura de volta; os passes por
elemento despacham pelo argumento indireto do registro, que precisa já trazer o despacho para grupos de 256
(`CountToArgs` com `workgroupSize: 256` gravado antes no mesmo fluxo), e a soma de prefixos do modo `stable` usa a
mesma contagem. O total vai para o contador como no caminho da CPU (quem o consome copia para um `SetCount` na GPU).
No modo `stable`, a contagem do registro deve ser ≤ `inputCapacity`.

Duas fases (spec 006): `prepare(out, counter, gravaçõesPorQuadro, counts?)` fora da gravação; `record` só grava. As
flags do modo `stable` são um descritor do Resource de trabalho (spec 039).

## Implements

- [`WorkPart`](../../platform/web/interfaces/WorkPart.md)

## Constructors

### Constructor

> **new Compaction**(`ctx`, `options`): `Compaction`

Defined in: [src/elements/gpu/compute/Compaction.ts:92](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L92)

#### Parameters

##### ctx

[`WorkContext`](../../platform/web/interfaces/WorkContext.md)

##### options

[`CompactionOptions`](../interfaces/CompactionOptions.md)

#### Returns

`Compaction`

## Methods

### descriptors()

> **descriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/gpu/compute/Compaction.ts:127](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L127)

As flags do modo `stable` (u32 por elemento de entrada).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`WorkPart`](../../platform/web/interfaces/WorkPart.md).[`descriptors`](../../platform/web/interfaces/WorkPart.md#descriptors)

***

### destroy()

> **destroy**(): `void`

Defined in: [src/elements/gpu/compute/Compaction.ts:234](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L234)

Libera os kernels e solta as flags e a soma de prefixos (a C2 libera os buffers); `prepare` os declara de novo.

#### Returns

`void`

***

### prepare()

> **prepare**(`out`, `counter`, `recordsPerFrame?`, `counts?`): `void`

Defined in: [src/elements/gpu/compute/Compaction.ts:146](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L146)

Prepara a compactação para a saída `out` e o contador `counter`, para até `recordsPerFrame` gravações por
quadro. Com `counts`, também os kernels da variante de contagem da GPU ligados a esse buffer de registros
`SetCount` (memorizados por buffer). Idempotente; chamado fora da gravação.

#### Parameters

##### out

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

##### counter

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

Defined in: [src/elements/gpu/compute/Compaction.ts:174](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L174)

Grava a compactação de `[0, count)` em `out`; o contador é zerado no fluxo de comandos antes.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### args

[`CompactionRecordArgs`](../interfaces/CompactionRecordArgs.md)

#### Returns

`void`

#### Throws

Error se (`out`, `counter`) não foi preparado.
