[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / reduceOp

# Function: reduceOp()

> **reduceOp**(`op`, `type`): `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:163](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/gpu/compute/shaders.ts#L163)

Módulo de operação da redução (research R11): `alias ReduceT`, `const REDUCE_IDENTITY` e `fn reduce_op`. Memorizado
por (operação, tipo): a mesma combinação é o mesmo módulo, logo o mesmo pipeline.

## Parameters

### op

[`ReduceOpName`](../type-aliases/ReduceOpName.md)

### type

[`ReduceType`](../type-aliases/ReduceType.md)

## Returns

`WgslModule`
