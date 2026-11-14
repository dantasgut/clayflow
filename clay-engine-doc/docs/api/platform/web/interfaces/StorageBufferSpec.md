[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / StorageBufferSpec

# Interface: StorageBufferSpec

Defined in: [src/core/contracts/specs/StorageBufferSpec.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/StorageBufferSpec.ts#L11)

Spec de storage buffer (SSBO em WGSL). Read-write em compute shaders
(`var<storage, read_write>`) ou read-only em vertex/fragment
(`var<storage, read>`). Tamanho arbitrário (até device limit).

Usado em pools (RigidBodies, particles), constraint lists, neighbor
search results, etc.

## Extends

- `BufferSpec`

## Properties

### byteSize

> `readonly` **byteSize**: `number`

Defined in: [src/core/contracts/specs/StorageBufferSpec.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/StorageBufferSpec.ts#L15)

Tamanho em bytes. Deve acomodar todos os elementos com align WGSL.

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

> `readonly` **subkind**: `"storage"`

Defined in: [src/core/contracts/specs/StorageBufferSpec.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/StorageBufferSpec.ts#L13)

Subdiscriminador concreto — sempre `'storage'`.

#### Overrides

`BufferSpec.subkind`
