[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ApplicationOptions

# Interface: ApplicationOptions

Defined in: [src/platform/web/Application.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/Application.ts#L19)

Opções do `Application` do navegador (spec 038, `clayflow/web`): as do motor mais o canvas e o redimensionamento.
Apenas `canvas` é obrigatório.

## Extends

- [`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md)

## Properties

### antialias?

> `optional` **antialias?**: `boolean` \| [`AntialiasingMode`](../../../elements/type-aliases/AntialiasingMode.md)

Defined in: [src/presentation/app/Engine.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L60)

Antisserrilhado da cena (spec 034): `'temporal'` (padrão: a amostra deslocada dentro do pixel a cada quadro em
todos os passes, histórico reprojetado com rejeição), `'accumulate'` (média uniforme dos quadros desde o último
corte — imagem parada de referência), `'msaa'` (4 amostras por pixel só nas bordas da geometria, spec 008) ou
`'off'`. `true` vale `'temporal'` e `false`, `'off'`. Vale para a cena (a primeira aplicação dela define); o modo
muda depois por `defaults.antialiasing.mode` entre `temporal`, `accumulate` e `off` (o `msaa` só na criação).

#### Inherited from

[`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md).[`antialias`](../../../presentation/interfaces/EngineCommonOptions.md#antialias)

***

### autoResize?

> `optional` **autoResize?**: `boolean`

Defined in: [src/platform/web/Application.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/Application.ts#L23)

Tamanho do canvas pelo tamanho exibido × DPR, acompanhado no redimensionamento (default true no navegador).

***

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [src/platform/web/Application.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/Application.ts#L21)

HTMLCanvasElement onde a engine renderiza. Deve estar attachado ao DOM.

***

### canvasOptions?

> `optional` **canvasOptions?**: `CanvasOptions`

Defined in: [src/presentation/app/Engine.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L47)

Configuração da superfície de apresentação (alphaMode, colorSpace, formato, captura). Default: opaque/srgb.

#### Inherited from

[`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md).[`canvasOptions`](../../../presentation/interfaces/EngineCommonOptions.md#canvasoptions)

***

### captureErrors?

> `optional` **captureErrors?**: `boolean`

Defined in: [src/presentation/app/Engine.ts:67](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L67)

Quando true, cada frame abre um WebGPU error scope `validation`. Erros viram
eventos `engineError` (stage='frame') em vez de exceptions — o GameLoop
continua o próximo frame. Útil em produção para resiliência ou em dev para
surfacing erros sem crash. Default: false (custo de push/pop por frame).

#### Inherited from

[`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md).[`captureErrors`](../../../presentation/interfaces/EngineCommonOptions.md#captureerrors)

***

### consumers?

> `optional` **consumers?**: (`registry`) => `void`

Defined in: [src/presentation/app/Engine.ts:98](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L98)

Registra fornecedores (`{ consumer }`) próprios da aplicação (ex.: `r.register(new SingletonResolver(Wind.schema,
'wind'))`). Roda depois dos padrão do motor; `register` de um nome existente o substitui.

#### Parameters

##### registry

[`ConsumerResolverRegistry`](../classes/ConsumerResolverRegistry.md)

#### Returns

`void`

#### Inherited from

[`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md).[`consumers`](../../../presentation/interfaces/EngineCommonOptions.md#consumers)

***

### device?

> `optional` **device?**: [`DeviceOptions`](DeviceOptions.md)

Defined in: [src/presentation/app/Engine.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L52)

Preferências do device GPU: potência, features exigidas/desejadas e limites. Reaplicadas em
`requestNewDevice()`. O que foi obtido aparece em `app.capabilities`.

#### Inherited from

[`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md).[`device`](../../../presentation/interfaces/EngineCommonOptions.md#device)

***

### maxFramesInFlight?

> `optional` **maxFramesInFlight?**: `number`

Defined in: [src/presentation/app/Engine.ts:93](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L93)

Máximo de quadros em execução na GPU antes de o laço gravar outro (inteiro ≥ 1, default 2). Evita acumular
trabalho na GPU sem limite quando ela é mais lenta que a CPU; `step()` não espera.

#### Inherited from

[`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md).[`maxFramesInFlight`](../../../presentation/interfaces/EngineCommonOptions.md#maxframesinflight)

***

### memoryBudgetMB?

> `optional` **memoryBudgetMB?**: `number`

Defined in: [src/presentation/app/Engine.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L73)

Threshold (MiB) de GPU memory acima do qual `memoryWarning` é emitido
(uma vez por transição abaixo→acima). Default: undefined (sem warning).
`core.memoryUsage()` continua sempre disponível para inspeção sob demanda.

#### Inherited from

[`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md).[`memoryBudgetMB`](../../../presentation/interfaces/EngineCommonOptions.md#memorybudgetmb)

***

### profiling?

> `optional` **profiling?**: `boolean` \| [`FrameProfilingGranularity`](../type-aliases/FrameProfilingGranularity.md)

Defined in: [src/presentation/app/Engine.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L86)

Liga o profiling de GPU por quadro: `frameComplete.stats.gpuTimeMs` passa a ser preenchido (com defasagem de 1–3
quadros). `true` ou `'passes'`: todo passe recebe timestamps e `stagesNs` traz o tempo de cada um; `'frame'`:
só o total da gravação (dois timestamps por quadro, sem o custo de amostrar cada passe — o modo para medir
desempenho). Sem `timestamp-query` no device, avisa uma vez e segue sem tempo de GPU. Default: false.

#### Inherited from

[`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md).[`profiling`](../../../presentation/interfaces/EngineCommonOptions.md#profiling)

***

### profilingCapacity?

> `optional` **profilingCapacity?**: `number`

Defined in: [src/presentation/app/Engine.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L88)

Capacidade de timestamps por quadro (pares = passes medidos). Default: 256 (128 passes).

#### Inherited from

[`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md).[`profilingCapacity`](../../../presentation/interfaces/EngineCommonOptions.md#profilingcapacity)

***

### resizeDebounceMs?

> `optional` **resizeDebounceMs?**: `number`

Defined in: [src/platform/web/Application.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/Application.ts#L25)

Debounce em ms para o handler de resize (default 100).

***

### scene?

> `optional` **scene?**: [`SceneContext`](SceneContext.md)

Defined in: [src/presentation/app/Engine.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L79)

SceneContext customizado. Quando omitido, usa o singleton default
(compatibilidade). Forneça via `createScene()` para múltiplas
Applications no mesmo processo (multi-canvas, tests isolados).

#### Inherited from

[`EngineCommonOptions`](../../../presentation/interfaces/EngineCommonOptions.md).[`scene`](../../../presentation/interfaces/EngineCommonOptions.md#scene)
