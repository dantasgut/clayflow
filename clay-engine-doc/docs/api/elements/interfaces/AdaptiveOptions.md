[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / AdaptiveOptions

# Interface: AdaptiveOptions

Defined in: [elements/geometry/ParametricSurface.ts:38](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/ParametricSurface.ts#L38)

Opções da malha adaptativa.

## Properties

### budget?

> `readonly` `optional` **budget?**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:44](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/ParametricSurface.ts#L44)

Teto de triângulos (os níveis baixam juntos para caber). Default: o da malha no nível máximo.

***

### maxLevel?

> `readonly` `optional` **maxLevel?**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:42](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/ParametricSurface.ts#L42)

Nível máximo L (2^L segmentos por lado do retalho). Default 4; ≤ 6.

***

### patches?

> `readonly` `optional` **patches?**: readonly \[`number`, `number`\]

Defined in: [elements/geometry/ParametricSurface.ts:40](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/ParametricSurface.ts#L40)

Retalhos em u e v (cada um com o seu nível). Default [16, 16]; P·Q ≤ 4096.

***

### periodic?

> `readonly` `optional` **periodic?**: readonly \[`boolean`, `boolean`\]

Defined in: [elements/geometry/ParametricSurface.ts:50](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/ParametricSurface.ts#L50)

Domínio periódico em u e v (a borda encontra a oposta: sem fresta na costura). Default pela pronta.

***

### refreshDistance?

> `readonly` `optional` **refreshDistance?**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:52](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/ParametricSurface.ts#L52)

Deslocamento da câmera (m) que refaz a malha. Default 0,05.

***

### screen?

> `readonly` `optional` **screen?**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:48](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/ParametricSurface.ts#L48)

Fração da altura da imagem que um segmento pode ocupar — a distância à câmera. Default 0,01.

***

### tolerance?

> `readonly` `optional` **tolerance?**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:46](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/ParametricSurface.ts#L46)

Erro de corda tolerado (m) — a curvatura pede segmentos menores. Default 0,002.
