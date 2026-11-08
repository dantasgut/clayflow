[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / CountToArgsRecordArgs

# Interface: CountToArgsRecordArgs

Defined in: [src/elements/gpu/compute/CountToArgs.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L28)

Argumentos de `CountToArgs.record`.

## Properties

### counts

> `readonly` **counts**: [`IndirectBufferSpec`](../../platform/web/interfaces/IndirectBufferSpec.md)

Defined in: [src/elements/gpu/compute/CountToArgs.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L30)

Registros `SetCount` (descritor `indirect`), preparados antes (`prepare`).

***

### index

> `readonly` **index**: `number`

Defined in: [src/elements/gpu/compute/CountToArgs.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L32)

Índice do registro.

***

### instanced?

> `readonly` `optional` **instanced?**: `boolean`

Defined in: [src/elements/gpu/compute/CountToArgs.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L38)

Instanciado: `count` instâncias de `perElement` índices. Padrão: uma instância de `count · perElement`.

***

### perElement?

> `readonly` `optional` **perElement?**: `number`

Defined in: [src/elements/gpu/compute/CountToArgs.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L36)

Índices (ou vértices) por elemento no desenho; instanciado, índices por instância. Padrão 0 (sem desenho).

***

### workgroupSize

> `readonly` **workgroupSize**: `number`

Defined in: [src/elements/gpu/compute/CountToArgs.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L34)

Invocações por grupo do despacho derivado.
