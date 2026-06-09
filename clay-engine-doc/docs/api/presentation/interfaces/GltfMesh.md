[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfMesh

# Interface: GltfMesh

Defined in: [presentation/assets/GltfLoader.ts:29](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L29)

Mesh em glTF — agregado de primitives. Cada primitive tem seu próprio
material e atributos vertex (positions/normals/uvs/etc.). Padrão glTF
permite mesh com múltiplos primitives quando partes têm materials diferentes.

## Properties

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [presentation/assets/GltfLoader.ts:31](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L31)

Nome legível (debug).

***

### primitives

> `readonly` **primitives**: readonly [`GltfPrimitive`](GltfPrimitive.md)[]

Defined in: [presentation/assets/GltfLoader.ts:33](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L33)

Primitives sub-mesh — múltiplos quando partes têm materials diferentes.
