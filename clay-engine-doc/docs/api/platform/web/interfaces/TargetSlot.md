[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / TargetSlot

# Interface: TargetSlot

Defined in: [src/scene/flows/slots.ts:157](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L157)

Alvo de render: a cor no canvas do quadro, na textura de um Resource, ou nenhuma (`'none'`, passe só de
profundidade — ex.: sombra), com profundidade opcional de um Resource.

## Properties

### color

> `readonly` **color**: `"canvas"` \| [`TextureRef`](TextureRef.md) \| `"none"`

Defined in: [src/scene/flows/slots.ts:161](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L161)

Cor: o canvas do quadro, nenhuma, ou a textura de um Resource.

***

### depth?

> `readonly` `optional` **depth?**: [`TextureRef`](TextureRef.md)

Defined in: [src/scene/flows/slots.ts:163](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L163)

Profundidade: a textura de um Resource (opcional).

***

### kind

> `readonly` **kind**: `"target"`

Defined in: [src/scene/flows/slots.ts:159](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L159)

Tipo do slot.

***

### samples?

> `readonly` `optional` **samples?**: [`TextureRef`](TextureRef.md)

Defined in: [src/scene/flows/slots.ts:168](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L168)

Cor multiamostrada (spec 008, MSAA): a textura de amostras de um Resource, opcional — quando o Resource a declara,
o passe desenha nela e resolve na `color`; sem ela, desenha direto na `color`.
