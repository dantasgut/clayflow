[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ShaderMessage

# Interface: ShaderMessage

Defined in: [src/core/contracts/EngineCore.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L12)

Mensagem do compilador de shader (`GPUShaderModule.getCompilationInfo()`); linha e coluna a partir de 1.

## Properties

### column

> `readonly` **column**: `number`

Defined in: [src/core/contracts/EngineCore.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L20)

Coluna na linha (0 quando o compilador não informa).

***

### line

> `readonly` **line**: `number`

Defined in: [src/core/contracts/EngineCore.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L18)

Linha no fonte do shader (0 quando o compilador não informa).

***

### message

> `readonly` **message**: `string`

Defined in: [src/core/contracts/EngineCore.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L16)

Texto do compilador.

***

### type

> `readonly` **type**: `"error"` \| `"warning"` \| `"info"`

Defined in: [src/core/contracts/EngineCore.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L14)

Gravidade da mensagem.
