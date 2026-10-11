[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SpawnSample

# Interface: SpawnSample

Defined in: [elements/particles/shapes/EmitterShape.ts:5](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/particles/shapes/EmitterShape.ts#L5)

Sample retornado por `EmitterShape.sample()` — posição + velocidade
iniciais para uma partícula recém-spawned.

## Properties

### position

> `readonly` **position**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/particles/shapes/EmitterShape.ts:7](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/particles/shapes/EmitterShape.ts#L7)

Posição inicial em world coords.

***

### velocity

> `readonly` **velocity**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/particles/shapes/EmitterShape.ts:9](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/particles/shapes/EmitterShape.ts#L9)

Velocidade inicial em world units / segundo.
