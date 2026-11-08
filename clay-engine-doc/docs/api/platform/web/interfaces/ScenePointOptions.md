[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ScenePointOptions

# Interface: ScenePointOptions

Defined in: [src/scene/shaders/WgslPoint.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L76)

O que faz de um ponto um ponto de cena.

## Properties

### globals

> `readonly` **globals**: `Readonly`\<`Record`\<`string`, [`ScenePointGlobal`](ScenePointGlobal.md)\>\>

Defined in: [src/scene/shaders/WgslPoint.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L82)

Variáveis globais que os kernels do ponto declaram e a C2 liga (nome → pool e parte): os registros do pool
(`'records'`) ou o bitset dos slots vivos (`'live'`), quando o pool existe; senão, um substituto zerado (nenhum
registro vivo).

## Methods

### combine()

> **combine**(`entries`): [`WgslModule`](WgslModule.md)

Defined in: [src/scene/shaders/WgslPoint.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L87)

Módulo que toma o lugar do pronto com as funções da cena (as implementações são renomeadas com o hash para
conviverem no mesmo shader). Chamado só com ao menos uma função.

#### Parameters

##### entries

readonly [`ScenePointEntry`](ScenePointEntry.md)[]

#### Returns

[`WgslModule`](WgslModule.md)
