[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / compactionModules

# Function: compactionModules()

> **compactionModules**(`predicate`): [`CompactionModules`](../interfaces/CompactionModules.md)

Defined in: [src/elements/gpu/compute/shaders.ts:346](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/shaders.ts#L346)

Kernels de compactação para o predicado `predicate`, que define `fn compact_keep(i: u32) -> bool` e
`fn compact_value(i: u32) -> u32` (e os bindings que lê, no grupo 1). Memorizado por predicado.

## Parameters

### predicate

[`WgslModule`](../../platform/web/interfaces/WgslModule.md)

## Returns

[`CompactionModules`](../interfaces/CompactionModules.md)
