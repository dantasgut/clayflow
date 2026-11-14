[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / StagingBufferSpec

# Interface: StagingBufferSpec

Defined in: [src/core/contracts/specs/StagingBufferSpec.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/StagingBufferSpec.ts#L11)

Spec de staging buffer (`COPY_DST | MAP_READ`) — usado para readback
GPU → CPU. Pipeline típico: compute escreve em StorageBuffer →
`frame.copy(storage, staging, size)` → `await core.readback(staging)`
→ ArrayBuffer no CPU.

Não é usado dentro de shaders (não tem `read` access em WGSL).

## Extends

- `BufferSpec`

## Properties

### byteSize

> `readonly` **byteSize**: `number`

Defined in: [src/core/contracts/specs/StagingBufferSpec.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/StagingBufferSpec.ts#L15)

Tamanho em bytes do buffer (deve acomodar os dados a serem readback).

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

> `readonly` **subkind**: `"staging"`

Defined in: [src/core/contracts/specs/StagingBufferSpec.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/StagingBufferSpec.ts#L13)

Subdiscriminador concreto — sempre `'staging'`.

#### Overrides

`BufferSpec.subkind`
