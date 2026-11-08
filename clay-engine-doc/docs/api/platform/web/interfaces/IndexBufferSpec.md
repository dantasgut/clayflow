[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / IndexBufferSpec

# Interface: IndexBufferSpec

Defined in: [src/core/contracts/specs/IndexBufferSpec.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/IndexBufferSpec.ts#L10)

Spec de index buffer (IBO). Bound via `pass.geometry.index(spec)` em
render passes; usado por `pass.draw.indexed(count)`.

`format` controla o tipo de cada index ('uint16' = 2 bytes, 'uint32' = 4 bytes).
Use uint32 quando vertex count > 65535, senão uint16 economiza memória.

## Extends

- `BufferSpec`

## Properties

### byteSize

> `readonly` **byteSize**: `number`

Defined in: [src/core/contracts/specs/IndexBufferSpec.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/IndexBufferSpec.ts#L14)

Tamanho total do buffer em bytes (= count × bytesPerIndex).

***

### count

> `readonly` **count**: `number`

Defined in: [src/core/contracts/specs/IndexBufferSpec.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/IndexBufferSpec.ts#L16)

Número de índices no buffer (count = índice de triângulos × 3 para topology=triangle-list).

***

### discriminator?

> `readonly` `optional` **discriminator?**: `string`

Defined in: [src/core/contracts/specs/BufferSpec.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/BufferSpec.ts#L27)

Discriminador semântico (e.g. 'rb_pool', 'mpm_grid'). Parte do specHash.

#### Inherited from

`BufferSpec.discriminator`

***

### format

> `readonly` **format**: `GPUIndexFormat`

Defined in: [src/core/contracts/specs/IndexBufferSpec.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/IndexBufferSpec.ts#L18)

Formato dos índices: 'uint16' (até 65535 verts) ou 'uint32'.

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

> `readonly` **subkind**: `"index"`

Defined in: [src/core/contracts/specs/IndexBufferSpec.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/IndexBufferSpec.ts#L12)

Subdiscriminador concreto — sempre `'index'`.

#### Overrides

`BufferSpec.subkind`
