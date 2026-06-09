[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / interactionPlugin

# Function: interactionPlugin()

> **interactionPlugin**(`options?`): `InteractionPluginInstance`

Defined in: [presentation/plugins/interactionPlugin.ts:38](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/plugins/interactionPlugin.ts#L38)

Cria + attach um `InteractionSystem` ao Application. O sistema fica
acessível via `app.interaction` (extension property; usar
`(app as any).interaction` ou keep a referência local).

Detach ocorre automaticamente em `app.dispose()` via plugin.dispose hook.

Uso:
```ts
const plugin = interactionPlugin();
app.use(plugin);
plugin.system.addController(new OrbitController(...));
```

## Parameters

### options?

[`InteractionPluginOptions`](../interfaces/InteractionPluginOptions.md) = `{}`

## Returns

`InteractionPluginInstance`
