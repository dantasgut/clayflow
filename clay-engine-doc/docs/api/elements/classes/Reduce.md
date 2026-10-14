[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Reduce

# Class: Reduce

Defined in: [elements/gpu/compute/Reduce.ts:63](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/gpu/compute/Reduce.ts#L63)

Redução de `T[count]` a um valor (research R11 da 005): árvore por grupo de 256 em memória de workgroup, níveis até
restar um valor. Soma, mínimo ou máximo de u32, i32 ou f32 (módulo de operação `reduceOp`, memorizado). Soma de f32
tem ordem de soma diferente da sequencial: tolerância relativa `1e-5 × log2(count)` (contrato).

Duas fases (spec 006): `prepare(src, out, gravaçõesPorQuadro)` cria parciais, kernels de todos os passes possíveis e
regiões de uniform, fora da gravação; `record` só grava.

## Constructors

### Constructor

> **new Reduce**(`core`, `options`): `Reduce`

Defined in: [elements/gpu/compute/Reduce.ts:74](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/gpu/compute/Reduce.ts#L74)

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

Defined in: [elements/gpu/compute/Reduce.ts:160](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/gpu/compute/Reduce.ts#L160)

Libera kernels, parciais e uniforms.

#### Returns

`void`

***

### prepare()

> **prepare**(`src`, `out`, `recordsPerFrame?`): `void`

Defined in: [elements/gpu/compute/Reduce.ts:97](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/gpu/compute/Reduce.ts#L97)

Prepara a redução de `src` em `out` para até `recordsPerFrame` gravações por quadro. Idempotente; fora da
gravação.

#### Parameters

##### src

`StorageBufferSpec`

##### out

`StorageBufferSpec`

##### recordsPerFrame?

`number` = `1`

#### Returns

`void`

***

### record()

> **record**(`frame`, `args`): `void`

Defined in: [elements/gpu/compute/Reduce.ts:117](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/gpu/compute/Reduce.ts#L117)

Grava a redução de `src[0, count)` em `out[outOffset]`.

#### Parameters

##### frame

`Frame`

##### args

[`ReduceRecordArgs`](../interfaces/ReduceRecordArgs.md)

#### Returns

`void`

#### Throws

Error se (`src`, `out`) não foi preparado.
