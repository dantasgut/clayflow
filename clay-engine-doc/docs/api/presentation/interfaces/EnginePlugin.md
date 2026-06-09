[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / EnginePlugin

# Interface: EnginePlugin

Defined in: [presentation/plugins/EnginePlugin.ts:21](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/plugins/EnginePlugin.ts#L21)

EnginePlugin: extensão pluggable para `Application`. Plugins podem registrar
Flows, instalar handlers de evento, criar sistemas auxiliares, etc.

Uso:
```ts
const app = await Application.create({ canvas });
app.use(physicsPlugin());
app.use(interactionPlugin({ window }));
app.start();
```

Plugins built-in:
  - `physicsPlugin()` — registra todos os physics flows.
  - `interactionPlugin(opts)` — instala InteractionSystem.

Type-only cycle Application↔EnginePlugin é aceito (madge --exclude documentado).

## Properties

### name

> `readonly` **name**: `string`

Defined in: [presentation/plugins/EnginePlugin.ts:23](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/plugins/EnginePlugin.ts#L23)

Identificador único do plugin (para logs/dedup).

## Methods

### dispose()?

> `optional` **dispose**(`app`): `void`

Defined in: [presentation/plugins/EnginePlugin.ts:29](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/plugins/EnginePlugin.ts#L29)

Optional. Cleanup quando Application.dispose() é chamado.

#### Parameters

##### app

[`Application`](../classes/Application.md)

#### Returns

`void`

***

### install()

> **install**(`app`): `void`

Defined in: [presentation/plugins/EnginePlugin.ts:25](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/plugins/EnginePlugin.ts#L25)

Hook de instalação — chamado antes do GameLoop iniciar; registra flows/listeners/sistemas.

#### Parameters

##### app

[`Application`](../classes/Application.md)

#### Returns

`void`
