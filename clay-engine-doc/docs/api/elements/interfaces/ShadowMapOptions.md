[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ShadowMapOptions

# Interface: ShadowMapOptions

Defined in: [elements/scene/ShadowMap.ts:10](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/scene/ShadowMap.ts#L10)

Opções de `ShadowMap`.

## Properties

### bias?

> `readonly` `optional` **bias?**: `number`

Defined in: [elements/scene/ShadowMap.ts:14](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/scene/ShadowMap.ts#L14)

Viés de profundidade da comparação (contra acne). Padrão 0,005.

***

### lightViewProj?

> `readonly` `optional` **lightViewProj?**: readonly `number`[]

Defined in: [elements/scene/ShadowMap.ts:12](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/scene/ShadowMap.ts#L12)

Matriz luz-vista-projeção inicial (o estágio de sombra a recalcula pela luz). Padrão: identidade.

***

### normalBias?

> `readonly` `optional` **normalBias?**: `number`

Defined in: [elements/scene/ShadowMap.ts:16](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/scene/ShadowMap.ts#L16)

Viés ao longo da normal. Padrão 0,001.

***

### size?

> `readonly` `optional` **size?**: readonly \[`number`, `number`\]

Defined in: [elements/scene/ShadowMap.ts:18](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/scene/ShadowMap.ts#L18)

Resolução do mapa em texels `[largura, altura]`. Padrão `[1024, 1024]`.
