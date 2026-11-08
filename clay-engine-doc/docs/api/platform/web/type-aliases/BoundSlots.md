[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BoundSlots

# Type Alias: BoundSlots\<TSlots\>

> **BoundSlots**\<`TSlots`\> = `{ readonly [K in keyof TSlots]: BoundSlot<TSlots[K]> }`

Defined in: [src/scene/flows/slots.ts:373](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L373)

Slots resolvidos de um Flow.

## Type Parameters

### TSlots

`TSlots` *extends* [`SlotMap`](SlotMap.md)
