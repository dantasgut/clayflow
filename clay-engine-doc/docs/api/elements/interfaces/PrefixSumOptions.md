[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / PrefixSumOptions

# Interface: PrefixSumOptions

Defined in: [src/elements/gpu/compute/PrefixSum.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L38)

Opções de `PrefixSum`.

## Properties

### capacity

> `readonly` **capacity**: `number`

Defined in: [src/elements/gpu/compute/PrefixSum.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L42)

Maior `count` aceito por `record` (dimensiona os buffers dos níveis).

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [src/elements/gpu/compute/PrefixSum.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L40)

Prefixo único dos recursos da instância.

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [src/elements/gpu/compute/PrefixSum.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L44)

Prefixo dos rótulos dos passes (perfil por passo). Padrão `'PrefixSum'`.
