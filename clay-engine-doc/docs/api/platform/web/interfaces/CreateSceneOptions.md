[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / CreateSceneOptions

# Interface: CreateSceneOptions

Defined in: [src/scene/SceneContext.ts:69](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L69)

Opções de `createScene`.

## Properties

### core?

> `readonly` `optional` **core?**: [`EngineCore`](EngineCore.md)

Defined in: [src/scene/SceneContext.ts:74](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L74)

Implementação da Camada 1. Default: `GpuEngineCore` (WebGPU). Outro backend — ou um double em testes —
entra aqui, pelo contrato `EngineCore`.
