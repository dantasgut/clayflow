[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / EmitterShape

# Interface: EmitterShape

Defined in: [scene/systems/particles/EmitterShape.ts:19](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/particles/EmitterShape.ts#L19)

Estratégia de forma de emissão. (Camada 2)

Define de onde e em que direção novas partículas nascem.
Completamente desacoplada do emitter — pode ser trocada sem recriar o emitter.

## Example

```ts
emitter.shape = new ConeEmitterShape(Math.PI / 6);
```

## Properties

### id

> `readonly` **id**: `string`

Defined in: [scene/systems/particles/EmitterShape.ts:20](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/particles/EmitterShape.ts#L20)

## Methods

### sample()

> **sample**(): [`SpawnSample`](SpawnSample.md)

Defined in: [scene/systems/particles/EmitterShape.ts:22](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/particles/EmitterShape.ts#L22)

Gera uma posição e direção inicial no espaço local do emitter.

#### Returns

[`SpawnSample`](SpawnSample.md)
