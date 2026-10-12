[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Reduce

# Class: Reduce

Defined in: [elements/gpu/compute/Reduce.ts:63](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Reduce.ts#L63)

Redução de `T[count]` a um valor (research R11): árvore por grupo de 256 em memória de workgroup, níveis até restar
um valor. Soma, mínimo ou máximo de u32, i32 ou f32 (módulo de operação `reduceOp`, memorizado). Soma de f32 tem
ordem de soma diferente da sequencial: tolerância relativa `1e-5 × log2(count)` (contrato).

## Constructors

### Constructor

> **new Reduce**(`core`, `options`): `Reduce`

Defined in: [elements/gpu/compute/Reduce.ts:75](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Reduce.ts#L75)

#### Parameters

##### core

`EngineCore`

##### options

[`ReduceOptions`](../interfaces/ReduceOptions.md)

#### Returns

`Reduce`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [elements/gpu/compute/Reduce.ts:142](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Reduce.ts#L142)

Libera kernels, parciais e uniforms.

#### Returns

`void`

***

### record()

> **record**(`frame`, `args`): `void`

Defined in: [elements/gpu/compute/Reduce.ts:95](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Reduce.ts#L95)

Grava a redução de `src[0, count)` em `out[outOffset]`.

#### Parameters

##### frame

`Frame`

##### args

[`ReduceRecordArgs`](../interfaces/ReduceRecordArgs.md)

#### Returns

`void`
