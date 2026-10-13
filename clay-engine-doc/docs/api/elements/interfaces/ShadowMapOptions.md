[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ShadowMapOptions

# Interface: ShadowMapOptions

Defined in: [elements/scene/ShadowMap.ts:10](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/ShadowMap.ts#L10)

Opções de `ShadowMap`.

## Properties

### bias?

> `readonly` `optional` **bias?**: `number`

Defined in: [elements/scene/ShadowMap.ts:12](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/ShadowMap.ts#L12)

Viés de profundidade da comparação (contra acne). Padrão 0,005.

***

### normalBias?

> `readonly` `optional` **normalBias?**: `number`

Defined in: [elements/scene/ShadowMap.ts:14](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/ShadowMap.ts#L14)

Viés ao longo da normal. Padrão 0,001.

***

### size?

> `readonly` `optional` **size?**: readonly \[`number`, `number`\]

Defined in: [elements/scene/ShadowMap.ts:16](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/ShadowMap.ts#L16)

Resolução do mapa em texels `[largura, altura]`. Padrão `[1024, 1024]`.
