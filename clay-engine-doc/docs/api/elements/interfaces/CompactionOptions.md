[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CompactionOptions

# Interface: CompactionOptions

Defined in: [elements/gpu/compute/Compaction.ts:15](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/gpu/compute/Compaction.ts#L15)

Opções de `Compaction`.

## Properties

### bindings?

> `readonly` `optional` **bindings?**: `Readonly`\<`Record`\<`string`, `BindingSource`\>\>

Defined in: [elements/gpu/compute/Compaction.ts:30](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/gpu/compute/Compaction.ts#L30)

Fontes dos buffers lidos pelo predicado, pelo nome da variável WGSL.

***

### capacity

> `readonly` **capacity**: `number`

Defined in: [elements/gpu/compute/Compaction.ts:24](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/gpu/compute/Compaction.ts#L24)

Tamanho máximo da saída (elementos u32).

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [elements/gpu/compute/Compaction.ts:17](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/gpu/compute/Compaction.ts#L17)

Prefixo único dos recursos da instância.

***

### inputCapacity?

> `readonly` `optional` **inputCapacity?**: `number`

Defined in: [elements/gpu/compute/Compaction.ts:28](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/gpu/compute/Compaction.ts#L28)

Maior `count` de entrada — obrigatório com `stable` (dimensiona as flags e a soma de prefixos).

***

### predicate

> `readonly` **predicate**: `WgslModule`

Defined in: [elements/gpu/compute/Compaction.ts:22](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/gpu/compute/Compaction.ts#L22)

Predicado do consumidor: define `fn compact_keep(i: u32) -> bool` e `fn compact_value(i: u32) -> u32`, e
declara no `@group(1)` os buffers que lê (fontes em `bindings`, pelo nome da variável).

***

### stable?

> `readonly` `optional` **stable?**: `boolean`

Defined in: [elements/gpu/compute/Compaction.ts:26](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/gpu/compute/Compaction.ts#L26)

Preserva a ordem da entrada (flags + `PrefixSum` + espalhamento). Padrão `false` (`atomic_alloc`).
