[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / HemisphereLightValues

# Interface: HemisphereLightValues

Defined in: [src/elements/scene/HemisphereLight.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L16)

Valores de uma `HemisphereLight`.

## Properties

### background?

> `readonly` `optional` **background?**: `boolean`

Defined in: [src/elements/scene/HemisphereLight.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L29)

O hemisfério também é o fundo visível (spec 034): a câmera vê atrás da cena o céu e o chão que a água e o vidro
refletem e refratam. Default `false` (o fundo é a cor da limpeza, ou o `Sky`).

***

### groundColor?

> `readonly` `optional` **groundColor?**: readonly `number`[]

Defined in: [src/elements/scene/HemisphereLight.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L20)

Radiância relativa do chão (RGBA linear). Default `[0.35, 0.3, 0.25, 1]`.

***

### intensity?

> `readonly` `optional` **intensity?**: `number`

Defined in: [src/elements/scene/HemisphereLight.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L22)

Intensidade (nits) que multiplica as duas cores. Default 0,3.

***

### skyColor?

> `readonly` `optional` **skyColor?**: readonly `number`[]

Defined in: [src/elements/scene/HemisphereLight.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L18)

Radiância relativa do céu (RGBA linear). Default `[0.8, 0.9, 1, 1]`.

***

### up?

> `readonly` `optional` **up?**: readonly `number`[]

Defined in: [src/elements/scene/HemisphereLight.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L24)

Eixo "para cima" do hemisfério. Default `[0, 1, 0, 0]`.
