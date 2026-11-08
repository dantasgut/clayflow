[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / createScene

# Function: createScene()

> **createScene**(`options?`): [`SceneContext`](../interfaces/SceneContext.md)

Defined in: [src/scene/SceneContext.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L82)

Cria um SceneContext novo com instâncias frescas de Core/EventBus/World/etc.
Útil para apps multi-canvas ou tests isolados. Se você só precisa de uma
cena (caso comum), use os singletons exportados de `scene/index.ts`.

## Parameters

### options?

[`CreateSceneOptions`](../interfaces/CreateSceneOptions.md) = `{}`

## Returns

[`SceneContext`](../interfaces/SceneContext.md)
