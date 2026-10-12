[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / compactionModules

# Function: compactionModules()

> **compactionModules**(`predicate`): [`CompactionModules`](../interfaces/CompactionModules.md)

Defined in: [elements/gpu/compute/shaders.ts:92](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/gpu/compute/shaders.ts#L92)

Kernels de compactação para o predicado `predicate`, que define `fn compact_keep(i: u32) -> bool` e
`fn compact_value(i: u32) -> u32` (e os bindings que lê, no grupo 1). Memorizado por predicado.

## Parameters

### predicate

`WgslModule`

## Returns

[`CompactionModules`](../interfaces/CompactionModules.md)
