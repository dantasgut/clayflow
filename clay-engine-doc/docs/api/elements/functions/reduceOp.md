[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / reduceOp

# Function: reduceOp()

> **reduceOp**(`op`, `type`): `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:152](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/shaders.ts#L152)

Módulo de operação da redução (research R11): `alias ReduceT`, `const REDUCE_IDENTITY` e `fn reduce_op`. Memorizado
por (operação, tipo): a mesma combinação é o mesmo módulo, logo o mesmo pipeline.

## Parameters

### op

[`ReduceOpName`](../type-aliases/ReduceOpName.md)

### type

[`ReduceType`](../type-aliases/ReduceType.md)

## Returns

`WgslModule`
