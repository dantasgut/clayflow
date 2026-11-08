[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / IndirectBufferSpec

# Interface: IndirectBufferSpec

Defined in: [src/core/contracts/specs/IndirectBufferSpec.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/IndirectBufferSpec.ts#L17)

Spec de indirect buffer — armazena draw/dispatch parameters lidos pela
GPU em runtime (vs. valores constantes hardcoded em JS). Permite
GPU-driven rendering: compute shader popula o buffer e o draw
call lê dele.

Layouts típicos:
  - Indexed indirect draw: 5 u32 (indexCount, instanceCount, firstIndex,
    baseVertex, firstInstance).
  - Compute dispatch indirect: 3 u32 (groupCountX, Y, Z).

Usado por `pass.draw.indexedIndirect(spec, offset)` e
`pass.dispatch.indirect(spec, offset)`.

## Extends

- `BufferSpec`

## Properties

### byteSize

> `readonly` **byteSize**: `number`

Defined in: [src/core/contracts/specs/IndirectBufferSpec.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/IndirectBufferSpec.ts#L21)

Tamanho em bytes (múltiplos de draw/dispatch struct size).

***

### discriminator?

> `readonly` `optional` **discriminator?**: `string`

Defined in: [src/core/contracts/specs/BufferSpec.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/BufferSpec.ts#L27)

Discriminador semântico (e.g. 'rb_pool', 'mpm_grid'). Parte do specHash.

#### Inherited from

`BufferSpec.discriminator`

***

### kind

> `readonly` **kind**: `"buffer"`

Defined in: [src/core/contracts/specs/BufferSpec.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/BufferSpec.ts#L24)

Discriminador de tipo — sempre `'buffer'` em buffer specs.

#### Inherited from

`BufferSpec.kind`

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [src/core/contracts/specs/BufferSpec.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/BufferSpec.ts#L29)

Label para debugging (mostra em DevTools / profilers).

#### Inherited from

`BufferSpec.label`

***

### subkind

> `readonly` **subkind**: `"indirect"`

Defined in: [src/core/contracts/specs/IndirectBufferSpec.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/IndirectBufferSpec.ts#L19)

Subdiscriminador concreto — sempre `'indirect'`.

#### Overrides

`BufferSpec.subkind`
