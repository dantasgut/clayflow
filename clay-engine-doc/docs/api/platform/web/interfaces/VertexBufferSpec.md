[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / VertexBufferSpec

# Interface: VertexBufferSpec

Defined in: [src/core/contracts/specs/VertexBufferSpec.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/VertexBufferSpec.ts#L8)

Spec de vertex buffer (VBO). Bound via `pass.geometry.vertex(slot, spec)`
em render passes; cada slot tem seu próprio layout (positions, normals,
uvs separados ou interleaved).

## Extends

- `BufferSpec`

## Properties

### byteSize

> `readonly` **byteSize**: `number`

Defined in: [src/core/contracts/specs/VertexBufferSpec.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/VertexBufferSpec.ts#L12)

Tamanho total do buffer em bytes (= count × stride).

***

### count

> `readonly` **count**: `number`

Defined in: [src/core/contracts/specs/VertexBufferSpec.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/VertexBufferSpec.ts#L16)

Número de vértices no buffer.

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

### stride

> `readonly` **stride**: `number`

Defined in: [src/core/contracts/specs/VertexBufferSpec.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/VertexBufferSpec.ts#L14)

Bytes por vertex (stride). E.g. 32 para position+normal+uv interleaved.

***

### subkind

> `readonly` **subkind**: `"vertex"`

Defined in: [src/core/contracts/specs/VertexBufferSpec.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/VertexBufferSpec.ts#L10)

Subdiscriminador concreto — sempre `'vertex'`.

#### Overrides

`BufferSpec.subkind`
