[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ClampedLimit

# Interface: ClampedLimit

Defined in: [src/core/contracts/DeviceOptions.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L42)

Limite pedido que excedia o máximo do adaptador e foi reduzido.

## Properties

### granted

> `readonly` **granted**: `number`

Defined in: [src/core/contracts/DeviceOptions.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L48)

Valor concedido (máximo do adaptador).

***

### name

> `readonly` **name**: `string`

Defined in: [src/core/contracts/DeviceOptions.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L44)

Nome do limite (`GPUSupportedLimits`).

***

### requested

> `readonly` **requested**: `number`

Defined in: [src/core/contracts/DeviceOptions.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L46)

Valor pedido em `DeviceOptions.requiredLimits`.
