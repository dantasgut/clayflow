[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / RaySceneSlots

# Interface: RaySceneSlots

Defined in: [src/elements/raytrace/RaySceneFlow.ts:83](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L83)

Slots do estágio da estrutura de raios.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### fluids

> `readonly` **fluids**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/raytrace/RaySceneFlow.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L94)

Corpos de fluido com a função `material` (spec 034 T065d): entram como volume pelo campo dos fluidos, e a função
deles entra na composição dos acertos (o campo guarda o índice dela por corpo).

***

### particles

> `readonly` **particles**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/raytrace/RaySceneFlow.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L89)

Corpos de partículas desenhados como sprites: esferas na estrutura (a posição lida do pool do corpo).

***

### renderables

> `readonly` **renderables**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/raytrace/RaySceneFlow.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L87)

Tudo o que é desenhado: geometria, material e transformação, com o registro `Renderable` do forward.

***

### scene

> `readonly` **scene**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/raytrace/RaySceneFlow.ts:85](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L85)

A estrutura da cena (sem ela o estágio não faz nada).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`RaySceneWork`\>

Defined in: [src/elements/raytrace/RaySceneFlow.ts:96](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L96)

O espaço de trabalho da construção: temporários, a ordenação e os parâmetros por hierarquia (spec 039).
