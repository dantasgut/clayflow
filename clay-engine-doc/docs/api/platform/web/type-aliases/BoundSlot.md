[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BoundSlot

# Type Alias: BoundSlot\<D\>

> **BoundSlot**\<`D`\> = `D` *extends* [`PoolSlot`](../interfaces/PoolSlot.md)\<infer O\> ? `O` *extends* `true` ? [`BoundPool`](../interfaces/BoundPool.md) \| `undefined` : [`BoundPool`](../interfaces/BoundPool.md) : `D` *extends* [`BodiesSlot`](../interfaces/BodiesSlot.md) ? [`BoundPool`](../interfaces/BoundPool.md) : `D` *extends* [`PoolsSlot`](../interfaces/PoolsSlot.md) ? `ReadonlyMap`\<`string`, [`BoundPool`](../interfaces/BoundPool.md) \| `undefined`\> : `D` *extends* [`SingletonSlot`](../interfaces/SingletonSlot.md)\<infer O\> ? `O` *extends* `true` ? [`BoundSingleton`](../interfaces/BoundSingleton.md) \| `undefined` : [`BoundSingleton`](../interfaces/BoundSingleton.md) : `D` *extends* [`EntitiesSlot`](../interfaces/EntitiesSlot.md) ? [`BoundEntities`](../interfaces/BoundEntities.md) : `D` *extends* [`TextureSlot`](../interfaces/TextureSlot.md)\<infer O\> ? `O` *extends* `true` ? [`BoundTexture`](../interfaces/BoundTexture.md) \| `undefined` : [`BoundTexture`](../interfaces/BoundTexture.md) : `D` *extends* `ChannelSlot`\<infer O\> ? `O` *extends* `true` ? `BoundChannel` \| `undefined` : `BoundChannel` : `D` *extends* [`TargetSlot`](../interfaces/TargetSlot.md) ? [`BoundTarget`](../interfaces/BoundTarget.md) : `D` *extends* [`WorkSlot`](../interfaces/WorkSlot.md)\<infer R\> ? [`BoundWork`](../interfaces/BoundWork.md)\<`R`\> : `never`

Defined in: [src/scene/flows/slots.ts:343](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L343)

Tipo resolvido de cada declaração.

## Type Parameters

### D

`D` *extends* [`SlotDeclaration`](SlotDeclaration.md)
