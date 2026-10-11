[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / Input

# Class: Input

Defined in: [presentation/input/Input.ts:34](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/input/Input.ts#L34)

Input centraliza o estado dos input devices em uma struct compartilhada.
Devices escrevem em `state` quando handlers de DOM eventos disparam;
controllers lêem em cada tick.

## Constructors

### Constructor

> **new Input**(): `Input`

#### Returns

`Input`

## Properties

### state

> `readonly` **state**: [`InputState`](../interfaces/InputState.md)

Defined in: [presentation/input/Input.ts:36](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/input/Input.ts#L36)

Estado compartilhado mutável — devices escrevem, controllers lêem.

## Methods

### consumeFrameDeltas()

> **consumeFrameDeltas**(): `void`

Defined in: [presentation/input/Input.ts:57](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/input/Input.ts#L57)

Zera todos os deltas (pointer, wheel, pinch). Chamado pelo
InteractionSystem ao fim de cada tick para evitar acúmulo entre
frames — controllers devem ter lido os deltas antes.

#### Returns

`void`

***

### isKeyDown()

> **isKeyDown**(`code`): `boolean`

Defined in: [presentation/input/Input.ts:48](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/input/Input.ts#L48)

Convenience: testa se uma key está pressionada agora.

#### Parameters

##### code

`string`

#### Returns

`boolean`
