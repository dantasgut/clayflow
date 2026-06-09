[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / AudioLoader

# Class: AudioLoader

Defined in: [presentation/assets/AudioLoader.ts:30](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/AudioLoader.ts#L30)

AudioLoader carrega arquivos de audio (mp3, ogg, wav) via fetch +
Web Audio API decodeAudioData. Cria um AudioContext lazy na primeira
chamada (compartilhado entre loads/plays).

Suporte limitado: não faz spatial audio (PannerNode), apenas decode +
play simples com volume + loop. Apps que precisam de mais devem
acessar `audio.decoded` direto e usar Web Audio API completa.

## Constructors

### Constructor

> **new AudioLoader**(): `AudioLoader`

#### Returns

`AudioLoader`

## Methods

### load()

> **load**(`url`): `Promise`\<[`LoadedAudio`](../interfaces/LoadedAudio.md)\>

Defined in: [presentation/assets/AudioLoader.ts:43](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/AudioLoader.ts#L43)

Carrega um audio asset. Em ambientes sem AudioContext, retorna
LoadedAudio com `decoded: null` mas preserva o `buffer` raw.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<[`LoadedAudio`](../interfaces/LoadedAudio.md)\>

***

### play()

> **play**(`audio`, `options?`): `AudioBufferSourceNode` \| `null`

Defined in: [presentation/assets/AudioLoader.ts:70](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/AudioLoader.ts#L70)

Reproduz um audio decoded com gain (volume) e loop opcionais.
Returns o source node (chame `.stop()` para interromper) ou null
se sem AudioContext / sem decoded.

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
