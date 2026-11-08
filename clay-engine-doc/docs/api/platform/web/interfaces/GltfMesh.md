[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / GltfMesh

# Interface: GltfMesh

Defined in: [src/platform/web/assets/GltfLoader.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/GltfLoader.ts#L29)

Mesh em glTF — agregado de primitives. Cada primitive tem seu próprio
material e atributos vertex (positions/normals/uvs/etc.). Padrão glTF
permite mesh com múltiplos primitives quando partes têm materials diferentes.

## Properties

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [src/platform/web/assets/GltfLoader.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/GltfLoader.ts#L31)

Nome legível (debug).

***

### primitives

> `readonly` **primitives**: readonly [`GltfPrimitive`](GltfPrimitive.md)[]

Defined in: [src/platform/web/assets/GltfLoader.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/GltfLoader.ts#L33)

Primitives sub-mesh — múltiplos quando partes têm materials diferentes.
