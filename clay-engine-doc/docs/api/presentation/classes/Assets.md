[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / Assets

# Class: Assets

Defined in: [presentation/assets/Assets.ts:15](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/Assets.ts#L15)

Assets é o ponto de acesso unificado para os asset loaders. Cria
uma instância de cada loader; consumers acessam via `assets.texture.load(...)`,
`assets.gltf.load(...)`, etc.

Loaders são stateful (alguns mantêm cache), então criar um Assets
por Application é a prática recomendada.

## Constructors

### Constructor

> **new Assets**(): `Assets`

#### Returns

`Assets`

## Properties

### audio

> `readonly` **audio**: [`AudioLoader`](AudioLoader.md)

Defined in: [presentation/assets/Assets.ts:23](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/Assets.ts#L23)

Loader de audio (mp3/ogg/wav via Web Audio API).

***

### font

> `readonly` **font**: [`FontLoader`](FontLoader.md)

Defined in: [presentation/assets/Assets.ts:25](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/Assets.ts#L25)

Loader de fonts (woff/ttf via FontFace + atlas glyph).

***

### gltf

> `readonly` **gltf**: [`GltfLoader`](GltfLoader.md)

Defined in: [presentation/assets/Assets.ts:19](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/Assets.ts#L19)

Loader de glTF/GLB models (mesh + materials + animations + skins).

***

### heightmap

> `readonly` **heightmap**: [`HeightmapLoader`](HeightmapLoader.md)

Defined in: [presentation/assets/Assets.ts:21](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/Assets.ts#L21)

Loader de heightmaps (RGBA → terrain mesh tessellated).

***

### texture

> `readonly` **texture**: [`TextureLoader`](TextureLoader.md)

Defined in: [presentation/assets/Assets.ts:17](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/Assets.ts#L17)

Loader de texturas 2D (PNG/JPG/HDR via fetch + ImageBitmap).
