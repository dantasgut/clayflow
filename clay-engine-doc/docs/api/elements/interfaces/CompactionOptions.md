[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / CompactionOptions

# Interface: CompactionOptions

Defined in: [src/elements/gpu/compute/Compaction.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L20)

Opções de `Compaction`.

## Properties

### bindings?

> `readonly` `optional` **bindings?**: `ReadonlyMap`\<[`BindingKey`](../../platform/web/type-aliases/BindingKey.md), [`BindingSource`](../../platform/web/type-aliases/BindingSource.md)\>

Defined in: [src/elements/gpu/compute/Compaction.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L35)

Fontes dos recursos privados lidos pelo predicado.

***

### capacity

> `readonly` **capacity**: `number`

Defined in: [src/elements/gpu/compute/Compaction.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L29)

Tamanho máximo da saída (elementos u32).

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [src/elements/gpu/compute/Compaction.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L22)

Prefixo único dos recursos da instância.

***

### inputCapacity?

> `readonly` `optional` **inputCapacity?**: `number`

Defined in: [src/elements/gpu/compute/Compaction.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L33)

Maior `count` de entrada — obrigatório com `stable` (dimensiona as flags e a soma de prefixos).

***

### predicate

> `readonly` **predicate**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/gpu/compute/Compaction.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L27)

Predicado do consumidor: define `fn compact_keep(i: u32) -> bool` e `fn compact_value(i: u32) -> u32` e requer
os recursos que lê (spec 031; fontes em `bindings`, pelo objeto do recurso).

***

### stable?

> `readonly` `optional` **stable?**: `boolean`

Defined in: [src/elements/gpu/compute/Compaction.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L31)

Preserva a ordem da entrada (flags + `PrefixSum` + espalhamento). Padrão `false` (`atomic_alloc`).
