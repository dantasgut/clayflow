[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / AudioLoader

# Class: AudioLoader

Defined in: [presentation/assets/AudioLoader.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/assets/AudioLoader.ts#L10)

## Constructors

### Constructor

> **new AudioLoader**(): `AudioLoader`

#### Returns

`AudioLoader`

## Methods

### load()

> **load**(`url`): `Promise`\<[`LoadedAudio`](../interfaces/LoadedAudio.md)\>

Defined in: [presentation/assets/AudioLoader.ts:19](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/assets/AudioLoader.ts#L19)

#### Parameters

##### url

`string`

#### Returns

`Promise`\<[`LoadedAudio`](../interfaces/LoadedAudio.md)\>

***

### play()

> **play**(`audio`, `options?`): `AudioBufferSourceNode` \| `null`

Defined in: [presentation/assets/AudioLoader.ts:39](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/assets/AudioLoader.ts#L39)

#### Parameters

##### audio

[`LoadedAudio`](../interfaces/LoadedAudio.md)

##### options?

###### loop?

`boolean`

###### volume?

`number`

#### Returns

`AudioBufferSourceNode` \| `null`
