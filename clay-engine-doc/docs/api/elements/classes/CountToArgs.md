[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / CountToArgs

# Class: CountToArgs

Defined in: [src/elements/gpu/compute/CountToArgs.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L50)

Contagem → argumentos indiretos (spec 031, R10): um kernel de uma invocação lê a contagem de um registro `SetCount`,
escrita na GPU por um nó, e escreve no mesmo registro o despacho linear (`workgroupsIndirect` no byte 4, dividido em
x/y como `Dispatcher.invocations`) e o desenho (byte 16). A contagem nunca volta à CPU.

Duas fases (spec 006): `prepare(counts, gravaçõesPorQuadro)` prepara o kernel pela C2 (um pipeline do Flow dono por
registro `counts`, T060g) e reserva as regiões de uniform (no Resource de trabalho, spec 039), fora da gravação;
`record` só grava.

## Constructors

### Constructor

> **new CountToArgs**(`ctx`, `options`): `CountToArgs`

Defined in: [src/elements/gpu/compute/CountToArgs.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L79)

#### Parameters

##### ctx

[`WorkContext`](../../platform/web/interfaces/WorkContext.md)

##### options

[`CountToArgsOptions`](../interfaces/CountToArgsOptions.md)

#### Returns

`CountToArgs`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [src/elements/gpu/compute/CountToArgs.ts:157](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L157)

Libera os pipelines (as regiões de uniform são do Resource de trabalho).

#### Returns

`void`

***

### prepare()

> **prepare**(`counts`, `recordsPerFrame?`): `void`

Defined in: [src/elements/gpu/compute/CountToArgs.ts:91](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L91)

Prepara a conversão sobre `counts` para até `recordsPerFrame` gravações por quadro. Idempotente.

#### Parameters

##### counts

[`IndirectBufferSpec`](../../platform/web/interfaces/IndirectBufferSpec.md)

##### recordsPerFrame?

`number` = `1`

#### Returns

`void`

***

### record()

> **record**(`frame`, `args`): `void`

Defined in: [src/elements/gpu/compute/CountToArgs.ts:123](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L123)

Grava a conversão do registro `index`.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### args

[`CountToArgsRecordArgs`](../interfaces/CountToArgsRecordArgs.md)

#### Returns

`void`

#### Throws

Error se `counts` não foi preparado; RangeError para argumentos inválidos.

***

### check()

> `static` **check**(`owner`, `count`): `void`

Defined in: [src/elements/gpu/compute/CountToArgs.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L60)

Confere uma contagem da GPU recebida por `owner`: índice inteiro ≥ 0 com o registro inteiro dentro de `counts`.

#### Parameters

##### owner

`string`

##### count

[`GpuCount`](../interfaces/GpuCount.md)

#### Returns

`void`

#### Throws

RangeError caso contrário.

***

### dispatchOffset()

> `static` **dispatchOffset**(`count`): `number`

Defined in: [src/elements/gpu/compute/CountToArgs.ts:75](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L75)

Byte, em `count.counts`, dos argumentos de despacho do registro (para `workgroupsIndirect`).

#### Parameters

##### count

[`GpuCount`](../interfaces/GpuCount.md)

#### Returns

`number`
