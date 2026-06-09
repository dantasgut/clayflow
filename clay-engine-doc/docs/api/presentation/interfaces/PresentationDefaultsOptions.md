[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PresentationDefaultsOptions

# Interface: PresentationDefaultsOptions

Defined in: [presentation/flows/defaults.ts:16](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/defaults.ts#L16)

Dependências necessárias para construir os Flows default. Application
passa essas refs do `SceneContext` quando chama `registerPresentationDefaults`.

## Properties

### canvas

> `readonly` **canvas**: `HTMLCanvasElement`

Defined in: [presentation/flows/defaults.ts:18](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/defaults.ts#L18)

Canvas onde os flows renderizam.

***

### core

> `readonly` **core**: `EngineCore`

Defined in: [presentation/flows/defaults.ts:20](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/defaults.ts#L20)

EngineCore (Camada 1) — passado para os flows criarem GPU specs.

***

### events?

> `readonly` `optional` **events?**: `EventBus`

Defined in: [presentation/flows/defaults.ts:26](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/defaults.ts#L26)

EventBus opcional — usado pelo DebugFlow para emitir profilerStats.

***

### resources

> `readonly` **resources**: `ResourceSystem`

Defined in: [presentation/flows/defaults.ts:24](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/defaults.ts#L24)

ResourceSystem para acesso aos pools (poolBufferSpec, poolBindGroup).

***

### world

> `readonly` **world**: `World`

Defined in: [presentation/flows/defaults.ts:22](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/defaults.ts#L22)

World (Camada 2) — flows query Resources via World.queryBySchemaName.
