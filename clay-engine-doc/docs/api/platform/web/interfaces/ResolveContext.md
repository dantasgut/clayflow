[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ResolveContext

# Interface: ResolveContext

Defined in: [src/scene/consumers/ConsumerResolver.ts:6](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolver.ts#L6)

O que um resolver consulta: o World da cena e o que a C2 alocou.

## Properties

### resources

> `readonly` **resources**: [`ResourceDirectory`](ResourceDirectory.md)

Defined in: [src/scene/consumers/ConsumerResolver.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolver.ts#L10)

Objetos de GPU alocados pela C2 (buffers, texturas, pools).

***

### world

> `readonly` **world**: [`World`](../classes/World.md)

Defined in: [src/scene/consumers/ConsumerResolver.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolver.ts#L8)

World da cena.
