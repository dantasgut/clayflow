[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / reduceOp

# Function: reduceOp()

> **reduceOp**(`op`, `type`): `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:163](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/shaders.ts#L163)

Módulo de operação da redução (research R11): `alias ReduceT`, `const REDUCE_IDENTITY` e `fn reduce_op`. Memorizado
por (operação, tipo): a mesma combinação é o mesmo módulo, logo o mesmo pipeline.

## Parameters

### op

[`ReduceOpName`](../type-aliases/ReduceOpName.md)

### type

[`ReduceType`](../type-aliases/ReduceType.md)

## Returns

`WgslModule`
