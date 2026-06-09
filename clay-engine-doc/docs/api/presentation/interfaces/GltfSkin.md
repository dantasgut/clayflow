[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfSkin

# Interface: GltfSkin

Defined in: [presentation/assets/GltfLoader.ts:128](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L128)

Skin (esqueleto) glTF — lista de joints e suas inverse-bind-matrices.
Joint = node especial usado como bone. IBMs são as matrices que
"desfazem" o bind pose para que vertex skinning funcione corretamente.

## Properties

### inverseBindMatrices

> `readonly` **inverseBindMatrices**: `Float32Array`\<`ArrayBufferLike`\> \| `null`

Defined in: [presentation/assets/GltfLoader.ts:132](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L132)

Float32Array com mat4 × jointCount (16 floats por joint).

***

### joints

> `readonly` **joints**: readonly `number`[]

Defined in: [presentation/assets/GltfLoader.ts:134](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L134)

Índices em `GltfDocument.nodes` que servem como joints.

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [presentation/assets/GltfLoader.ts:130](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L130)

Nome legível (debug).

***

### skeleton

> `readonly` **skeleton**: `number` \| `null`

Defined in: [presentation/assets/GltfLoader.ts:136](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L136)

Node raiz do esqueleto (opcional, para skin attachment).
