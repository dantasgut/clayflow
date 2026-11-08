[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / DeviceOptions

# Interface: DeviceOptions

Defined in: [src/core/contracts/DeviceOptions.ts:6](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L6)

Preferências do usuário para o device GPU, aplicadas em `EngineCore.initialize()` e reaplicadas em
`requestRecover()`. Todas opcionais: sem elas o motor pede o adaptador padrão, as features opcionais que
usa (quando disponíveis) e os limites de escala no máximo do adaptador.

## Properties

### limitsCeiling?

> `readonly` `optional` **limitsCeiling?**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/core/contracts/DeviceOptions.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L24)

Teto dos limites do device (nome → valor máximo), aplicado depois dos limites de escala e dos pedidos: o device
fica com o menor entre o teto e o que seria pedido (nunca abaixo do padrão do WebGPU). Serve para validar numa
GPU maior o piso de outra (ex.: `maxStorageBuffersPerShaderStage: 10`, o do Apple M4) — o que não cabe falha
igual nas duas.

***

### optionalFeatures?

> `readonly` `optional` **optionalFeatures?**: readonly `GPUFeatureName`[]

Defined in: [src/core/contracts/DeviceOptions.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L12)

Features desejadas: pedidas se disponíveis; as ausentes aparecem em `missingFeatures`.

***

### powerPreference?

> `readonly` `optional` **powerPreference?**: `"low-power"` \| `"high-performance"`

Defined in: [src/core/contracts/DeviceOptions.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L8)

Preferência de potência repassada a `requestAdapter`. Ausente = escolha do navegador.

***

### requiredFeatures?

> `readonly` `optional` **requiredFeatures?**: readonly `GPUFeatureName`[]

Defined in: [src/core/contracts/DeviceOptions.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L10)

Features obrigatórias: se o adaptador não oferece alguma, a criação do device falha nomeando-a.

***

### requiredLimits?

> `readonly` `optional` **requiredLimits?**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/core/contracts/DeviceOptions.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/DeviceOptions.ts#L17)

Limites pedidos pelo usuário. Valor acima do máximo do adaptador → usa o máximo e registra em
`DeviceCapabilities.clampedLimits`.
