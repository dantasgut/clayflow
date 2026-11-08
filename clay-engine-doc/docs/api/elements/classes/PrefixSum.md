[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / PrefixSum

# Class: PrefixSum

Defined in: [src/elements/gpu/compute/PrefixSum.ts:104](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L104)

Soma de prefixos u32 em vários níveis (research R8 da 005): por grupo de 256 (Hillis–Steele em memória de
workgroup), com os totais dos grupos subindo nível a nível até caber num grupo, e a descida somando o prefixo de
cada grupo. Sem teto de elementos além de `maxStorageBufferBindingSize`; o despacho linear da 004 cobre mais de
65 535 grupos.

O nível 0 roda no lugar em `dst` (com `src ≠ dst`, `src` é copiado antes no fluxo de comandos); os níveis acima
vivem em buffers internos dimensionados pela capacidade. `count` e modo de cada chamada vão numa região própria de
uniform (`FrameUniforms`), então a mesma instância pode ser gravada várias vezes no quadro com contagens diferentes.

Contagem da GPU (spec 031, R10): preparada com `counts`, a soma aceita `count: { counts, index }` — a contagem vem
do registro `SetCount` no próprio kernel (ponto `scan_count`, nível pela profundidade), sem leitura de volta. O nível
0 despacha pelo argumento indireto do registro, que precisa já trazer o despacho para grupos de 256 (`CountToArgs`
com `workgroupSize: 256` gravado antes no mesmo fluxo); os níveis de cima despacham pela capacidade e os acima do
topo real rodam com contagem 1 (o total, cujo prefixo exclusivo é 0) ou 0, o que não muda o resultado. Com
`src ≠ dst`, a cópia leva a capacidade (limitada pelos dois buffers). A contagem do registro deve ser ≤ `capacity`.

Duas fases (spec 006): `prepare(dst, gravaçõesPorQuadro, counts?)` cria kernels e regiões de uniform — fora da
gravação, numa transição do Flow; `record` só grava. Os buffers dos níveis são descritores do Resource de trabalho
(spec 039), alocados pela C2.

## Implements

- [`WorkPart`](../../platform/web/interfaces/WorkPart.md)

## Constructors

### Constructor

> **new PrefixSum**(`ctx`, `options`): `PrefixSum`

Defined in: [src/elements/gpu/compute/PrefixSum.ts:115](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L115)

#### Parameters

##### ctx

[`WorkContext`](../../platform/web/interfaces/WorkContext.md)

##### options

[`PrefixSumOptions`](../interfaces/PrefixSumOptions.md)

#### Returns

`PrefixSum`

## Accessors

### regionsPerRecord

#### Get Signature

> **get** **regionsPerRecord**(): `number`

Defined in: [src/elements/gpu/compute/PrefixSum.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L149)

Regiões de uniform que uma gravação usa no máximo (uma por nível).

##### Returns

`number`

## Methods

### descriptors()

> **descriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/gpu/compute/PrefixSum.ts:133](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L133)

Valores dos níveis k ≥ 1 (`upper[k - 1]` = nível k), em palavras u32.

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`WorkPart`](../../platform/web/interfaces/WorkPart.md).[`descriptors`](../../platform/web/interfaces/WorkPart.md#descriptors)

***

### destroy()

> **destroy**(): `void`

Defined in: [src/elements/gpu/compute/PrefixSum.ts:210](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L210)

Libera os kernels e solta os buffers dos níveis (a C2 os libera com a redescrição do trabalho). A instância volta
a declará-los no próximo `prepare`.

#### Returns

`void`

***

### prepare()

> **prepare**(`dst`, `recordsPerFrame?`, `counts?`): `void`

Defined in: [src/elements/gpu/compute/PrefixSum.ts:158](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L158)

Prepara a soma com saída em `dst` para até `recordsPerFrame` gravações por quadro: buffers dos níveis, kernels de
todos os níveis possíveis e regiões de uniform. Com `counts`, também os kernels da variante de contagem da GPU
ligados a esse buffer de registros `SetCount` (memorizados por buffer). Idempotente; chamado fora da gravação.

#### Parameters

##### dst

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

Defined in: [src/elements/gpu/compute/PrefixSum.ts:173](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L173)

Grava a soma de prefixos de `src[0, count)` em `dst`.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### args

[`PrefixSumRecordArgs`](../interfaces/PrefixSumRecordArgs.md)

#### Returns

`void`

#### Throws

Error se `dst` não foi preparado; RangeError para `count` inválido ou acima das regiões reservadas.
