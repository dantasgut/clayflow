[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / GpuCount

# Interface: GpuCount

Defined in: [src/elements/gpu/compute/CountToArgs.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L14)

Contagem lida na GPU (spec 031): o registro `SetCount` de índice `index` em `counts`, com o despacho para grupos de
256 já derivado no mesmo fluxo (`CountToArgs` com `workgroupSize: 256` gravado antes). Aceito no lugar de um número
pelo `record` de `PrefixSum`, `RadixSort`, `Compaction` e `Reduce` preparados com `counts`.

## Properties

### counts

> `readonly` **counts**: [`IndirectBufferSpec`](../../platform/web/interfaces/IndirectBufferSpec.md)

Defined in: [src/elements/gpu/compute/CountToArgs.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L16)

Registros `SetCount` (descritor `indirect`).

***

### index

> `readonly` **index**: `number`

Defined in: [src/elements/gpu/compute/CountToArgs.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/CountToArgs.ts#L18)

Índice do registro.
