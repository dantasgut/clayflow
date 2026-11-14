[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / UISlots

# Interface: UISlots

Defined in: [src/presentation/flows/UIFlow.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L18)

Slots da UI.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### target

> `readonly` **target**: [`TargetSlot`](../../platform/web/interfaces/TargetSlot.md)

Defined in: [src/presentation/flows/UIFlow.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L20)

O canvas do quadro (a UI carrega o conteúdo e desenha por cima).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`UIWork`\>

Defined in: [src/presentation/flows/UIFlow.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L22)

O espaço de trabalho da UI: tela, quads e sampler (spec 039).
