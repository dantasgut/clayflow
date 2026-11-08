[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / AdapterDescription

# Interface: AdapterDescription

Defined in: [src/core/contracts/DeviceOptions.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L28)

Identificação do adaptador GPU obtido (`GPUAdapterInfo` + fallback).

## Properties

### architecture

> `readonly` **architecture**: `string`

Defined in: [src/core/contracts/DeviceOptions.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L32)

Família/arquitetura (ex.: `metal-3`). Pode vir vazia.

***

### description

> `readonly` **description**: `string`

Defined in: [src/core/contracts/DeviceOptions.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L36)

Descrição legível. Pode vir vazia.

***

### device

> `readonly` **device**: `string`

Defined in: [src/core/contracts/DeviceOptions.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L34)

Identificador do dispositivo. Pode vir vazio.

***

### isFallbackAdapter

> `readonly` **isFallbackAdapter**: `boolean`

Defined in: [src/core/contracts/DeviceOptions.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L38)

`true` quando o adaptador é a implementação de software de fallback.

***

### vendor

> `readonly` **vendor**: `string`

Defined in: [src/core/contracts/DeviceOptions.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L30)

Fabricante (ex.: `apple`, `nvidia`). Pode vir vazio por privacidade do navegador.
