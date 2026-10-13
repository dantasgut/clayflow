[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / EnginePlugin

# Interface: EnginePlugin

Defined in: [presentation/plugins/EnginePlugin.ts:22](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/plugins/EnginePlugin.ts#L22)

EnginePlugin: extensão pluggable para `Application`. Plugins podem registrar
Flows, instalar handlers de evento, criar sistemas auxiliares, etc.

Uso:
```ts
const app = await Application.create({ canvas });
app.use(interactionPlugin({ window }));
app.start();
```

Plugins built-in:
  - `interactionPlugin(opts)` — instala InteractionSystem.

Os solvers de física não precisam de plugin: são registrados por factory pela aplicação e instanciados pela C2 no
primeiro corpo de cada tipo (`DEFAULT_SOLVER_REGISTRATIONS`).

Type-only cycle Application↔EnginePlugin é aceito (madge --exclude documentado).

## Properties

### name

> `readonly` **name**: `string`

Defined in: [presentation/plugins/EnginePlugin.ts:24](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/plugins/EnginePlugin.ts#L24)

Identificador único do plugin (para logs/dedup).

## Methods

### dispose()?

> `optional` **dispose**(`app`): `void`

Defined in: [presentation/plugins/EnginePlugin.ts:30](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/plugins/EnginePlugin.ts#L30)

Optional. Cleanup quando Application.dispose() é chamado.

#### Parameters

##### app

[`Application`](../classes/Application.md)

#### Returns

`void`

***

### install()

> **install**(`app`): `void`

Defined in: [presentation/plugins/EnginePlugin.ts:26](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/plugins/EnginePlugin.ts#L26)

Hook de instalação — chamado antes do GameLoop iniciar; registra flows/listeners/sistemas.

#### Parameters

##### app

[`Application`](../classes/Application.md)

#### Returns

`void`
