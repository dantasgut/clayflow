[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / UniformBufferSpec

# Interface: UniformBufferSpec

Defined in: [src/core/contracts/specs/UniformBufferSpec.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/UniformBufferSpec.ts#L11)

Spec de uniform buffer (UBO em WGSL). Read-only em todos os stages
(`var<uniform>`). Tipicamente pequeno (até 16 KiB por device limit
em alguns GPUs) e usado para parâmetros que não mudam durante o frame
(camera, material, sim params).

Para datasets maiores ou writable, use `StorageBufferSpec`.

## Extends

- `BufferSpec`

## Properties

### byteSize

> `readonly` **byteSize**: `number`

Defined in: [src/core/contracts/specs/UniformBufferSpec.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/UniformBufferSpec.ts#L15)

Tamanho em bytes. Alinhe com schema.stride para layouts WGSL corretos.

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

> `readonly` **subkind**: `"uniform"`

Defined in: [src/core/contracts/specs/UniformBufferSpec.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/UniformBufferSpec.ts#L13)

Subdiscriminador concreto — sempre `'uniform'`.

#### Overrides

`BufferSpec.subkind`
