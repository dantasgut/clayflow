[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfNode

# Interface: GltfNode

Defined in: [presentation/assets/GltfLoader.ts:7](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L7)

Node em uma cena glTF. Representa um transform na hierarquia, opcionalmente
referenciando uma mesh (geometria) e/ou skin (skeleton para animação).
Filhos são índices em GltfDocument.nodes (referência por inteiro,
não por ponteiro — o documento é totalmente self-contained).

## Properties

### children

> `readonly` **children**: readonly `number`[]

Defined in: [presentation/assets/GltfLoader.ts:21](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L21)

Índices dos nodes filhos em `GltfDocument.nodes`.

***

### meshIndex?

> `readonly` `optional` **meshIndex?**: `number`

Defined in: [presentation/assets/GltfLoader.ts:11](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L11)

Índice em `GltfDocument.meshes`, undefined se o node é só transform.

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [presentation/assets/GltfLoader.ts:9](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L9)

Nome legível do node (debugging).

***

### rotation

> `readonly` **rotation**: readonly \[`number`, `number`, `number`, `number`\]

Defined in: [presentation/assets/GltfLoader.ts:17](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L17)

Rotação local como quaternion (x, y, z, w).

***

### scale

> `readonly` **scale**: readonly \[`number`, `number`, `number`\]

Defined in: [presentation/assets/GltfLoader.ts:19](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L19)

Scale local.

***

### skinIndex?

> `readonly` `optional` **skinIndex?**: `number`

Defined in: [presentation/assets/GltfLoader.ts:13](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L13)

Índice em `GltfDocument.skins`, undefined se o node não é skinned.

***

### translation

> `readonly` **translation**: readonly \[`number`, `number`, `number`\]

Defined in: [presentation/assets/GltfLoader.ts:15](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L15)

Translação local (relativa ao parent).
