[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfMaterial

# Interface: GltfMaterial

Defined in: [presentation/assets/GltfLoader.ts:62](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/assets/GltfLoader.ts#L62)

Material glTF metallic-roughness (PBR). Mapeamento direto pra
`StandardMaterial` da engine: baseColor → albedo, etc.

## Properties

### baseColorFactor

> `readonly` **baseColorFactor**: readonly \[`number`, `number`, `number`, `number`\]

Defined in: [presentation/assets/GltfLoader.ts:66](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/assets/GltfLoader.ts#L66)

Cor base RGBA (multiplicada com baseColorTexture quando presente).

***

### metallicFactor

> `readonly` **metallicFactor**: `number`

Defined in: [presentation/assets/GltfLoader.ts:70](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/assets/GltfLoader.ts#L70)

Metallic 0..1 (0 = dielétrico, 1 = metal).

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [presentation/assets/GltfLoader.ts:64](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/assets/GltfLoader.ts#L64)

Nome legível (debug).

***

### roughnessFactor

> `readonly` **roughnessFactor**: `number`

Defined in: [presentation/assets/GltfLoader.ts:68](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/assets/GltfLoader.ts#L68)

Roughness 0..1 (0 = mirror, 1 = totalmente difuso).
