[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / LoadedAudio

# Interface: LoadedAudio

Defined in: [presentation/assets/AudioLoader.ts:6](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/AudioLoader.ts#L6)

Audio asset carregado pelo `AudioLoader`. `decoded` é null em ambientes
sem AudioContext (Node-side rendering, tests, browsers que negaram
permissão de audio).

## Properties

### buffer

> `readonly` **buffer**: `ArrayBuffer`

Defined in: [presentation/assets/AudioLoader.ts:10](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/AudioLoader.ts#L10)

Bytes raw do arquivo audio (preservados para re-decode ou análise).

***

### decoded

> `readonly` **decoded**: `AudioBuffer` \| `null`

Defined in: [presentation/assets/AudioLoader.ts:12](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/AudioLoader.ts#L12)

AudioBuffer decoded pelo Web Audio API, ou null se decode falhou.

***

### duration

> `readonly` **duration**: `number`

Defined in: [presentation/assets/AudioLoader.ts:14](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/AudioLoader.ts#L14)

Duração em segundos (0 se decode falhou).

***

### numberOfChannels

> `readonly` **numberOfChannels**: `number`

Defined in: [presentation/assets/AudioLoader.ts:16](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/AudioLoader.ts#L16)

Número de canais (1 = mono, 2 = stereo, etc.).

***

### sampleRate

> `readonly` **sampleRate**: `number`

Defined in: [presentation/assets/AudioLoader.ts:18](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/AudioLoader.ts#L18)

Sample rate em Hz (e.g. 44100).

***

### url

> `readonly` **url**: `string`

Defined in: [presentation/assets/AudioLoader.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/AudioLoader.ts#L8)

URL de origem (debug).
