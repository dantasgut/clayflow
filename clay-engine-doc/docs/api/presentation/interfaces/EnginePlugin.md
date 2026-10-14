[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / EnginePlugin

# Interface: EnginePlugin

Defined in: [presentation/plugins/EnginePlugin.ts:22](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/plugins/EnginePlugin.ts#L22)

EnginePlugin: extensão pluggable para `Application`. Plugins podem registrar
Flows, instalar handlers de evento, criar sistemas auxiliares, etc.

Uso:
```ts
const app = await Application.create({ canvas });
app.use(myPlugin);
app.start();
```

A entrada (`app.input`) e os controllers de câmera não precisam de plugin: a aplicação liga os dispositivos e tica
os controllers da cena (spec 007).

Os solvers de física não precisam de plugin: são registrados por factory pela aplicação e instanciados pela C2 no
primeiro corpo de cada tipo (`DEFAULT_SOLVER_REGISTRATIONS`).

Type-only cycle Application↔EnginePlugin é aceito (madge --exclude documentado).

## Properties

### name

> `readonly` **name**: `string`

Defined in: [presentation/plugins/EnginePlugin.ts:24](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/plugins/EnginePlugin.ts#L24)

Identificador único do plugin (para logs/dedup).

## Methods

### dispose()?

> `optional` **dispose**(`app`): `void`

Defined in: [presentation/plugins/EnginePlugin.ts:30](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/plugins/EnginePlugin.ts#L30)

Optional. Cleanup quando Application.dispose() é chamado.

#### Parameters

##### app

[`Application`](../classes/Application.md)

#### Returns

`void`

***

### install()

> **install**(`app`): `void`

Defined in: [presentation/plugins/EnginePlugin.ts:26](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/plugins/EnginePlugin.ts#L26)

Hook de instalação — chamado antes do GameLoop iniciar; registra flows/listeners/sistemas.

#### Parameters

##### app

[`Application`](../classes/Application.md)

#### Returns

`void`
