[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / Reduce

# Class: Reduce

Defined in: [src/elements/gpu/compute/Reduce.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L84)

Redução de `T[count]` a um valor (research R11 da 005): árvore por grupo de 256 em memória de workgroup, níveis até
restar um valor. Soma, mínimo ou máximo de u32, i32 ou f32 (módulo de operação `reduceOp`, memorizado). Soma de f32
tem ordem de soma diferente da sequencial: tolerância relativa `1e-5 × log2(count)` (contrato).

Contagem da GPU (spec 031, R10): preparada com `counts`, a redução aceita `count: { counts, index }` — a contagem
vem do registro `SetCount` no próprio kernel (ponto `reduce_count`, nível pela profundidade), sem leitura de volta. O
primeiro passe despacha pelo argumento indireto do registro, que precisa já trazer o despacho para grupos de 256
(`CountToArgs` com `workgroupSize: 256` gravado antes no mesmo fluxo); os seguintes despacham pela capacidade do
nível. Os passes além do último real reduzem um valor só (`reduce_op(v, identidade) = v`); contagem 0 não escreve
nada. A contagem do registro deve ser ≤ `capacity`.

Duas fases (spec 006): `prepare(src, out, gravaçõesPorQuadro, counts?)` cria parciais, kernels de todos os passes
possíveis e regiões de uniform, fora da gravação; `record` só grava. Os parciais são descritores do Resource de
trabalho (spec 039).

## Implements

- [`WorkPart`](../../platform/web/interfaces/WorkPart.md)

## Constructors

### Constructor

> **new Reduce**(`ctx`, `options`): `Reduce`

Defined in: [src/elements/gpu/compute/Reduce.ts:98](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L98)

#### Parameters

##### ctx

[`WorkContext`](../../platform/web/interfaces/WorkContext.md)

##### options

[`ReduceOptions`](../interfaces/ReduceOptions.md)

#### Returns

`Reduce`

## Methods

### descriptors()

> **descriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/gpu/compute/Reduce.ts:137](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L137)

Parciais dos níveis 1..L-1 pela capacidade (o último passe escreve na saída do chamador).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`WorkPart`](../../platform/web/interfaces/WorkPart.md).[`descriptors`](../../platform/web/interfaces/WorkPart.md#descriptors)

***

### destroy()

> **destroy**(): `void`

Defined in: [src/elements/gpu/compute/Reduce.ts:270](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L270)

Libera os kernels e solta os parciais (a C2 os libera); o próximo `prepare` os declara de novo.

#### Returns

`void`

***

### prepare()

> **prepare**(`src`, `out`, `recordsPerFrame?`, `counts?`): `void`

Defined in: [src/elements/gpu/compute/Reduce.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L149)

Prepara a redução de `src` em `out` para até `recordsPerFrame` gravações por quadro. Com `counts`, também os
kernels da variante de contagem da GPU ligados a esse buffer de registros `SetCount` (memorizados por buffer).
Idempotente; fora da gravação.

#### Parameters

##### src

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

##### out

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

Defined in: [src/elements/gpu/compute/Reduce.ts:184](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L184)

Grava a redução de `src[0, count)` em `out[outOffset]`.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### args

[`ReduceRecordArgs`](../interfaces/ReduceRecordArgs.md)

#### Returns

`void`

#### Throws

Error se (`src`, `out`) não foi preparado.

***

### reserve()

> **reserve**(`capacity`): `boolean`

Defined in: [src/elements/gpu/compute/Reduce.ts:122](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L122)

Garante `capacity` elementos (fora da gravação): os parciais crescem (o trabalho se redescreve) e os kernels são
refeitos no próximo `prepare`. Devolve `true` quando cresceu.

#### Parameters

##### capacity

`number`

#### Returns

`boolean`
