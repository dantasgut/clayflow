[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ExtensionCodeOptions

# Interface: ExtensionCodeOptions

Defined in: [src/scene/contracts/ExtensionFunction.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L17)

Opções de uma função de ponto escrita em WGSL.

## Properties

### code

> `readonly` **code**: `string`

Defined in: [src/scene/contracts/ExtensionFunction.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L19)

Código WGSL com a função do ponto (e auxiliares). Usa o struct de parâmetros pelo alias do ponto.

***

### graph?

> `readonly` `optional` **graph?**: `undefined`

Defined in: [src/scene/contracts/ExtensionFunction.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L20)

***

### params?

> `readonly` `optional` **params?**: `Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../type-aliases/ExtensionParamType.md)\>\>

Defined in: [src/scene/contracts/ExtensionFunction.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L22)

Parâmetros: nome → tipo (campos do registro tipado da forma; sem teto; `revision` é reservado).

***

### requires?

> `readonly` `optional` **requires?**: readonly [`WgslModule`](WgslModule.md)[]

Defined in: [src/scene/contracts/ExtensionFunction.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L26)

Módulos do núcleo que o código usa (ex.: `wgslLib.quat`, `wgslLib.noise`).

***

### values?

> `readonly` `optional` **values?**: `Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

Defined in: [src/scene/contracts/ExtensionFunction.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L24)

Valores iniciais (default 0).
