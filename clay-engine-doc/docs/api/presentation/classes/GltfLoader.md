[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfLoader

# Class: GltfLoader

Defined in: [presentation/assets/GltfLoader.ts:277](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L277)

GltfLoader carrega arquivos glTF (`.gltf` JSON ou `.glb` binário) em
`GltfDocument`. Resolve buffers externos via fetch, decodifica
`data:` URIs base64, e parsa o BIN chunk de GLBs.

Suporte limitado vs. spec completa:
  - Mesh primitives: positions, normals, uvs, joints/weights, indices.
  - Materials: PBR metallic-roughness factors (não carrega textures).
  - Animations: samplers (LINEAR/STEP/CUBICSPLINE) + channels.
  - Skins: jointCount + IBMs.
  - Não-suportado: morphtargets, sparse accessors, KHR extensions.

## Constructors

### Constructor

> **new GltfLoader**(): `GltfLoader`

#### Returns

`GltfLoader`

## Methods

### load()

> **load**(`url`): `Promise`\<[`GltfDocument`](../interfaces/GltfDocument.md)\>

Defined in: [presentation/assets/GltfLoader.ts:287](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L287)

Load a glTF document from URL. Suporta:
  - .gltf JSON com buffers externos (URI)
  - .gltf JSON com buffers data: (base64)
  - .glb binário (magic 0x46546c67, JSON chunk + BIN chunk)

O loader detecta o formato pela extensão da URL e fallback para magic
sniffing nos primeiros 4 bytes da resposta.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<[`GltfDocument`](../interfaces/GltfDocument.md)\>

***

### parse()

> **parse**(`data`, `url`): `Promise`\<[`GltfDocument`](../interfaces/GltfDocument.md)\>

Defined in: [presentation/assets/GltfLoader.ts:297](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/GltfLoader.ts#L297)

Parse de um glTF (.gltf JSON ou .glb binário) já em memória. Útil para
testes determinísticos e para casos em que o cliente já possui os bytes.

#### Parameters

##### data

`ArrayBuffer`

##### url

`string`

#### Returns

`Promise`\<[`GltfDocument`](../interfaces/GltfDocument.md)\>
