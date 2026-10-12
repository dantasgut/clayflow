[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PrefixSum

# Class: PrefixSum

Defined in: [elements/gpu/compute/PrefixSum.ts:67](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/PrefixSum.ts#L67)

Soma de prefixos u32 em vários níveis (research R8): por grupo de 256 (Hillis–Steele em memória de workgroup), com
os totais dos grupos subindo nível a nível até caber num grupo, e a descida somando o prefixo de cada grupo. Sem
teto de elementos além de `maxStorageBufferBindingSize`; o despacho linear da 004 cobre mais de 65 535 grupos.

O nível 0 roda no lugar em `dst` (com `src ≠ dst`, `src` é copiado antes no fluxo de comandos); os níveis acima
vivem em buffers internos dimensionados pela capacidade. `count` e modo de cada chamada vão numa região própria de
uniform (`FrameUniforms`), então a mesma instância pode ser gravada várias vezes no quadro com contagens diferentes.

## Constructors

### Constructor

> **new PrefixSum**(`core`, `options`): `PrefixSum`

Defined in: [elements/gpu/compute/PrefixSum.ts:81](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/PrefixSum.ts#L81)

#### Parameters

##### core

`EngineCore`

##### options

[`PrefixSumOptions`](../interfaces/PrefixSumOptions.md)

#### Returns

`PrefixSum`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [elements/gpu/compute/PrefixSum.ts:157](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/PrefixSum.ts#L157)

Libera kernels, buffers dos níveis e uniforms. A instância volta a alocar no próximo `record`.

#### Returns

`void`

***

### record()

> **record**(`frame`, `args`): `void`

Defined in: [elements/gpu/compute/PrefixSum.ts:100](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/PrefixSum.ts#L100)

Grava a soma de prefixos de `src[0, count)` em `dst`.

#### Parameters

##### frame

`Frame`

##### args

[`PrefixSumRecordArgs`](../interfaces/PrefixSumRecordArgs.md)

#### Returns

`void`
