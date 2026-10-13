[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PrefixSum

# Class: PrefixSum

Defined in: [elements/gpu/compute/PrefixSum.ts:66](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/PrefixSum.ts#L66)

Soma de prefixos u32 em vários níveis (research R8 da 005): por grupo de 256 (Hillis–Steele em memória de
workgroup), com os totais dos grupos subindo nível a nível até caber num grupo, e a descida somando o prefixo de
cada grupo. Sem teto de elementos além de `maxStorageBufferBindingSize`; o despacho linear da 004 cobre mais de
65 535 grupos.

O nível 0 roda no lugar em `dst` (com `src ≠ dst`, `src` é copiado antes no fluxo de comandos); os níveis acima
vivem em buffers internos dimensionados pela capacidade. `count` e modo de cada chamada vão numa região própria de
uniform (`FrameUniforms`), então a mesma instância pode ser gravada várias vezes no quadro com contagens diferentes.

Duas fases (spec 006): `prepare(dst, gravaçõesPorQuadro)` cria buffers, kernels e regiões de uniform — fora da
gravação, numa transição do Flow; `record` só grava.

## Constructors

### Constructor

> **new PrefixSum**(`core`, `options`): `PrefixSum`

Defined in: [elements/gpu/compute/PrefixSum.ts:78](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/PrefixSum.ts#L78)

#### Parameters

##### core

`EngineCore`

##### options

[`PrefixSumOptions`](../interfaces/PrefixSumOptions.md)

#### Returns

`PrefixSum`

## Accessors

### regionsPerRecord

#### Get Signature

> **get** **regionsPerRecord**(): `number`

Defined in: [elements/gpu/compute/PrefixSum.ts:97](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/PrefixSum.ts#L97)

Regiões de uniform que uma gravação usa no máximo (uma por nível).

##### Returns

`number`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [elements/gpu/compute/PrefixSum.ts:166](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/PrefixSum.ts#L166)

Libera kernels, buffers dos níveis e uniforms. A instância volta a alocar no próximo `prepare`.

#### Returns

`void`

***

### prepare()

> **prepare**(`dst`, `recordsPerFrame?`): `void`

Defined in: [elements/gpu/compute/PrefixSum.ts:105](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/PrefixSum.ts#L105)

Prepara a soma com saída em `dst` para até `recordsPerFrame` gravações por quadro: buffers dos níveis, kernels de
todos os níveis possíveis e regiões de uniform. Idempotente; chamado fora da gravação.

#### Parameters

##### dst

`StorageBufferSpec`

##### recordsPerFrame?

`number` = `1`

#### Returns

`void`

***

### record()

> **record**(`frame`, `args`): `void`

Defined in: [elements/gpu/compute/PrefixSum.ts:131](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/PrefixSum.ts#L131)

Grava a soma de prefixos de `src[0, count)` em `dst`.

#### Parameters

##### frame

`Frame`

##### args

[`PrefixSumRecordArgs`](../interfaces/PrefixSumRecordArgs.md)

#### Returns

`void`

#### Throws

Error se `dst` não foi preparado; RangeError para `count` inválido ou acima das regiões reservadas.
