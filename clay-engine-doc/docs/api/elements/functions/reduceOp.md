[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / reduceOp

# Function: reduceOp()

> **reduceOp**(`op`, `type`): [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/gpu/compute/shaders.ts:425](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/shaders.ts#L425)

Módulo de operação da redução (research R11): `alias ReduceT`, `const REDUCE_IDENTITY` e `fn reduce_op`. Memorizado
por (operação, tipo): a mesma combinação é o mesmo módulo, logo o mesmo pipeline.

## Parameters

### op

[`ReduceOpName`](../type-aliases/ReduceOpName.md)

### type

[`ReduceType`](../type-aliases/ReduceType.md)

## Returns

[`WgslModule`](../../platform/web/interfaces/WgslModule.md)
