[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfPrimitive

# Interface: GltfPrimitive

Defined in: [presentation/assets/GltfLoader.ts:41](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L41)

Primitive (sub-mesh) com atributos vertex deinterleaved e índices
opcionais. Todos os atributos são `null` se ausentes no source glTF
(e.g. mesh sem UVs).

## Properties

### indices

> `readonly` **indices**: `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\> \| `null`

Defined in: [presentation/assets/GltfLoader.ts:53](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L53)

Índices de triângulos (uint16 ou uint32) ou null para non-indexed.

***

### joints

> `readonly` **joints**: `Uint16Array`\<`ArrayBufferLike`\> \| `null`

Defined in: [presentation/assets/GltfLoader.ts:49](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L49)

Joint indices (4 por vértice, JOINTS_0) — para meshes skinned.

***

### materialIndex

> `readonly` **materialIndex**: `number` \| `null`

Defined in: [presentation/assets/GltfLoader.ts:55](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L55)

Índice em `GltfDocument.materials` ou null para default material.

***

### normals

> `readonly` **normals**: `Float32Array`\<`ArrayBufferLike`\> \| `null`

Defined in: [presentation/assets/GltfLoader.ts:45](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L45)

Normais XYZ flat ou null.

***

### positions

> `readonly` **positions**: `Float32Array`

Defined in: [presentation/assets/GltfLoader.ts:43](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L43)

Posições XYZ flat (3 floats por vértice).

***

### uvs

> `readonly` **uvs**: `Float32Array`\<`ArrayBufferLike`\> \| `null`

Defined in: [presentation/assets/GltfLoader.ts:47](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L47)

UVs flat (2 floats por vértice) ou null.

***

### weights

> `readonly` **weights**: `Float32Array`\<`ArrayBufferLike`\> \| `null`

Defined in: [presentation/assets/GltfLoader.ts:51](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L51)

Joint weights (4 por vértice, WEIGHTS_0) — para meshes skinned.
