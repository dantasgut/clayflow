[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / compactionModules

# Function: compactionModules()

> **compactionModules**(`predicate`): [`CompactionModules`](../interfaces/CompactionModules.md)

Defined in: [elements/gpu/compute/shaders.ts:96](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/compute/shaders.ts#L96)

Kernels de compactação para o predicado `predicate`, que define `fn compact_keep(i: u32) -> bool` e
`fn compact_value(i: u32) -> u32` (e os bindings que lê, no grupo 1). Memorizado por predicado.

## Parameters

### predicate

`WgslModule`

## Returns

[`CompactionModules`](../interfaces/CompactionModules.md)
