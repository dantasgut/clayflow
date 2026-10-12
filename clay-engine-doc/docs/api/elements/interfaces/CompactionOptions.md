[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CompactionOptions

# Interface: CompactionOptions

Defined in: [elements/gpu/compute/Compaction.ts:19](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L19)

Opções de `Compaction`.

## Properties

### bindings?

> `readonly` `optional` **bindings?**: readonly `ComputeKernelBinding`[]

Defined in: [elements/gpu/compute/Compaction.ts:34](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L34)

Buffers lidos pelo predicado, no `@group(1)`.

***

### capacity

> `readonly` **capacity**: `number`

Defined in: [elements/gpu/compute/Compaction.ts:28](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L28)

Tamanho máximo da saída (elementos u32).

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [elements/gpu/compute/Compaction.ts:21](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L21)

Prefixo único dos recursos da instância.

***

### inputCapacity?

> `readonly` `optional` **inputCapacity?**: `number`

Defined in: [elements/gpu/compute/Compaction.ts:32](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L32)

Maior `count` de entrada — obrigatório com `stable` (dimensiona as flags e a soma de prefixos).

***

### predicate

> `readonly` **predicate**: `WgslModule`

Defined in: [elements/gpu/compute/Compaction.ts:26](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L26)

Predicado do consumidor: define `fn compact_keep(i: u32) -> bool` e `fn compact_value(i: u32) -> u32`, e
declara no `@group(1)` os buffers que lê (ligados por `bindings`).

***

### stable?

> `readonly` `optional` **stable?**: `boolean`

Defined in: [elements/gpu/compute/Compaction.ts:30](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L30)

Preserva a ordem da entrada (flags + `PrefixSum` + espalhamento). Padrão `false` (`atomic_alloc`).
