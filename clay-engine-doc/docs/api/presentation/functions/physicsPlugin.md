[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / physicsPlugin

# Function: physicsPlugin()

> **physicsPlugin**(`options?`): [`EnginePlugin`](../interfaces/EnginePlugin.md)

Defined in: [presentation/plugins/physicsPlugin.ts:34](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/plugins/physicsPlugin.ts#L34)

Registra todos os physics flows no `Application.flows`. Substitui o
boilerplate de:
```ts
app.flows.register(new LCPFlow(...));
app.flows.register(new XPBDFlow(...));
// ... 4 mais
```

Por:
```ts
app.use(physicsPlugin());
// ou opt-in seletivo:
app.use(physicsPlugin({ enabled: ['LCP', 'XPBD'] }));
```

## Parameters

### options?

[`PhysicsPluginOptions`](../interfaces/PhysicsPluginOptions.md) = `{}`

## Returns

[`EnginePlugin`](../interfaces/EnginePlugin.md)
