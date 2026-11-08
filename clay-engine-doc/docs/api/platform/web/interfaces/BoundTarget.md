[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BoundTarget

# Interface: BoundTarget

Defined in: [src/scene/flows/slots.ts:327](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L327)

Alvo resolvido. `color: 'canvas'` → `frame.canvasView` no `dispatch`; `'none'` → sem anexo de cor.

## Properties

### color

> `readonly` **color**: [`TextureViewSpec`](TextureViewSpec.md) \| `"canvas"` \| `"none"`

Defined in: [src/scene/flows/slots.ts:329](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L329)

Cor: o canvas do quadro, nenhuma, ou a view da textura.

***

### depth?

> `readonly` `optional` **depth?**: [`TextureViewSpec`](TextureViewSpec.md)

Defined in: [src/scene/flows/slots.ts:333](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L333)

View de profundidade, quando o alvo tem.

***

### depthFormat?

> `readonly` `optional` **depthFormat?**: `GPUTextureFormat`

Defined in: [src/scene/flows/slots.ts:335](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L335)

Formato da profundidade, quando o alvo tem.

***

### format?

> `readonly` `optional` **format?**: `GPUTextureFormat`

Defined in: [src/scene/flows/slots.ts:331](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L331)

Formato de cor do alvo (o do canvas ou o da textura); ausente sem cor.

***

### sampleCount

> `readonly` **sampleCount**: `1` \| `4`

Defined in: [src/scene/flows/slots.ts:339](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L339)

Amostras por pixel do alvo (1 sem MSAA): o `multisample.count` dos pipelines que desenham nele.

***

### samples?

> `readonly` `optional` **samples?**: [`TextureViewSpec`](TextureViewSpec.md)

Defined in: [src/scene/flows/slots.ts:337](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L337)

View da cor multiamostrada (MSAA), quando o alvo tem: o passe desenha nela e resolve em `color`.
