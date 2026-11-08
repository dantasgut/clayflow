[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / DeviceCapabilities

# Interface: DeviceCapabilities

Defined in: [src/core/contracts/DeviceOptions.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L55)

Relatório das capacidades efetivas do device atual, devolvido por `EngineCore.capabilities()` (só dados).
Recalculado a cada criação de device (inicialização e recuperação).

## Properties

### adapter

> `readonly` **adapter**: [`AdapterDescription`](AdapterDescription.md)

Defined in: [src/core/contracts/DeviceOptions.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L57)

Adaptador obtido.

***

### clampedLimits

> `readonly` **clampedLimits**: readonly [`ClampedLimit`](ClampedLimit.md)[]

Defined in: [src/core/contracts/DeviceOptions.ts:67](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L67)

Limites pedidos acima do máximo do adaptador, com o valor concedido.

***

### features

> `readonly` **features**: readonly `GPUFeatureName`[]

Defined in: [src/core/contracts/DeviceOptions.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L61)

Features habilitadas no device.

***

### limits

> `readonly` **limits**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/core/contracts/DeviceOptions.ts:65](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L65)

Limites efetivos do device (nome → valor).

***

### missingFeatures

> `readonly` **missingFeatures**: readonly `GPUFeatureName`[]

Defined in: [src/core/contracts/DeviceOptions.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L63)

Features desejadas (pelo motor ou pelo usuário) que o adaptador não oferece.

***

### powerPreference

> `readonly` **powerPreference**: `"low-power"` \| `"high-performance"` \| `"default"`

Defined in: [src/core/contracts/DeviceOptions.ts:59](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L59)

Preferência de potência pedida (`'default'` quando não informada).
