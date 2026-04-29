[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfLoader

# Class: GltfLoader

Defined in: [presentation/assets/GltfLoader.ts:111](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/assets/GltfLoader.ts#L111)

## Constructors

### Constructor

> **new GltfLoader**(): `GltfLoader`

#### Returns

`GltfLoader`

## Methods

### load()

> **load**(`url`): `Promise`\<[`GltfDocument`](../interfaces/GltfDocument.md)\>

Defined in: [presentation/assets/GltfLoader.ts:121](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/assets/GltfLoader.ts#L121)

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

Defined in: [presentation/assets/GltfLoader.ts:131](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/assets/GltfLoader.ts#L131)

Parse de um glTF (.gltf JSON ou .glb binário) já em memória. Útil para
testes determinísticos e para casos em que o cliente já possui os bytes.

#### Parameters

##### data

`ArrayBuffer`

##### url

`string`

#### Returns

`Promise`\<[`GltfDocument`](../interfaces/GltfDocument.md)\>
