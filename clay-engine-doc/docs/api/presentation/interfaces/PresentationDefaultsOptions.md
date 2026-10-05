[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PresentationDefaultsOptions

# Interface: PresentationDefaultsOptions

Defined in: [presentation/flows/defaults.ts:17](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/defaults.ts#L17)

Dependências necessárias para construir os Flows default. Application
passa essas refs do `SceneContext` quando chama `registerPresentationDefaults`.

## Properties

### canvas

> `readonly` **canvas**: `HTMLCanvasElement`

Defined in: [presentation/flows/defaults.ts:19](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/defaults.ts#L19)

Canvas onde os flows renderizam.

***

### core

> `readonly` **core**: `EngineCore`

Defined in: [presentation/flows/defaults.ts:21](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/defaults.ts#L21)

EngineCore (Camada 1) — passado para os flows criarem GPU specs.

***

### events

> `readonly` **events**: `EventBus`

Defined in: [presentation/flows/defaults.ts:27](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/defaults.ts#L27)

EventBus da cena — o TransformFlow reage a `resourceReady`; o DebugFlow emite profilerStats.

***

### resources

> `readonly` **resources**: `ResourceSystem`

Defined in: [presentation/flows/defaults.ts:25](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/defaults.ts#L25)

ResourceSystem para acesso aos pools (poolBufferSpec, poolBindGroup).

***

### world

> `readonly` **world**: `World`

Defined in: [presentation/flows/defaults.ts:23](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/defaults.ts#L23)

World (Camada 2) — flows query Resources via World.queryBySchemaName.
