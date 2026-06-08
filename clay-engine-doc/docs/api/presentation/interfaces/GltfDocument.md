[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfDocument

# Interface: GltfDocument

Defined in: [presentation/assets/GltfLoader.ts:145](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L145)

Documento glTF parsed — saída do `gltfLoad()`. Self-contained: todos
os índices dentro do documento são números resolvíveis nas suas listas.
Use os índices para reconstruir a scene tree (recursivamente seguindo
`nodes[i].children`).

## Properties

### animations

> `readonly` **animations**: readonly [`GltfAnimation`](GltfAnimation.md)[]

Defined in: [presentation/assets/GltfLoader.ts:157](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L157)

Lista de todas as animations — aplicáveis em runtime ao traversal.

***

### materials

> `readonly` **materials**: readonly [`GltfMaterial`](GltfMaterial.md)[]

Defined in: [presentation/assets/GltfLoader.ts:155](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L155)

Lista de todos os materials — referenciados por primitive.materialIndex.

***

### meshes

> `readonly` **meshes**: readonly [`GltfMesh`](GltfMesh.md)[]

Defined in: [presentation/assets/GltfLoader.ts:153](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L153)

Lista de todas as meshes — referenciadas por node.meshIndex.

***

### nodes

> `readonly` **nodes**: readonly [`GltfNode`](GltfNode.md)[]

Defined in: [presentation/assets/GltfLoader.ts:151](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L151)

Lista de todos os nodes do glTF (transform tree).

***

### raw

> `readonly` **raw**: `unknown`

Defined in: [presentation/assets/GltfLoader.ts:147](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L147)

AST raw do JSON parsed (sem normalização) — útil para debug.

***

### scene

> `readonly` **scene**: `number`

Defined in: [presentation/assets/GltfLoader.ts:161](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L161)

Índice em `nodes` da scene root (entry point para traversal).

***

### skins

> `readonly` **skins**: readonly [`GltfSkin`](GltfSkin.md)[]

Defined in: [presentation/assets/GltfLoader.ts:159](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L159)

Lista de todos os skins (esqueletos) — referenciados por node.skinIndex.

***

### url

> `readonly` **url**: `string`

Defined in: [presentation/assets/GltfLoader.ts:149](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L149)

URL de origem (usada para resolver buffers externos via fetch).
