[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / reduceOp

# Function: reduceOp()

> **reduceOp**(`op`, `type`): `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:156](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/compute/shaders.ts#L156)

Módulo de operação da redução (research R11): `alias ReduceT`, `const REDUCE_IDENTITY` e `fn reduce_op`. Memorizado
por (operação, tipo): a mesma combinação é o mesmo módulo, logo o mesmo pipeline.

## Parameters

### op

[`ReduceOpName`](../type-aliases/ReduceOpName.md)

### type

[`ReduceType`](../type-aliases/ReduceType.md)

## Returns

`WgslModule`
