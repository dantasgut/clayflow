[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / EngineCommonOptions

# Interface: EngineCommonOptions

Defined in: [src/presentation/app/Engine.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L45)

Opções do motor (spec 038) comuns aos ambientes: o que o ponto de entrada (`clayflow/web`, `clayflow/deno`) não traz
por conta própria. Use `scene` para várias aplicações na mesma cena, `captureErrors`/`memoryBudgetMB` para
resiliência em produção.

## Extended by

- [`EngineOptions`](EngineOptions.md)
- [`ApplicationOptions`](../../platform/web/interfaces/ApplicationOptions.md)

## Properties

### antialias?

> `optional` **antialias?**: `boolean` \| [`AntialiasingMode`](../../elements/type-aliases/AntialiasingMode.md)

Defined in: [src/presentation/app/Engine.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L60)

Antisserrilhado da cena (spec 034): `'temporal'` (padrão: a amostra deslocada dentro do pixel a cada quadro em
todos os passes, histórico reprojetado com rejeição), `'accumulate'` (média uniforme dos quadros desde o último
corte — imagem parada de referência), `'msaa'` (4 amostras por pixel só nas bordas da geometria, spec 008) ou
`'off'`. `true` vale `'temporal'` e `false`, `'off'`. Vale para a cena (a primeira aplicação dela define); o modo
muda depois por `defaults.antialiasing.mode` entre `temporal`, `accumulate` e `off` (o `msaa` só na criação).

***

### canvasOptions?

> `optional` **canvasOptions?**: `CanvasOptions`

Defined in: [src/presentation/app/Engine.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L47)

Configuração da superfície de apresentação (alphaMode, colorSpace, formato, captura). Default: opaque/srgb.

***

### captureErrors?

> `optional` **captureErrors?**: `boolean`

Defined in: [src/presentation/app/Engine.ts:67](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L67)

Quando true, cada frame abre um WebGPU error scope `validation`. Erros viram
eventos `engineError` (stage='frame') em vez de exceptions — o GameLoop
continua o próximo frame. Útil em produção para resiliência ou em dev para
surfacing erros sem crash. Default: false (custo de push/pop por frame).

***

### consumers?

> `optional` **consumers?**: (`registry`) => `void`

Defined in: [src/presentation/app/Engine.ts:98](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L98)

Registra fornecedores (`{ consumer }`) próprios da aplicação (ex.: `r.register(new SingletonResolver(Wind.schema,
'wind'))`). Roda depois dos padrão do motor; `register` de um nome existente o substitui.

#### Parameters

##### registry

[`ConsumerResolverRegistry`](../../platform/web/classes/ConsumerResolverRegistry.md)

#### Returns

`void`

***

### device?

> `optional` **device?**: [`DeviceOptions`](../../platform/web/interfaces/DeviceOptions.md)

Defined in: [src/presentation/app/Engine.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L52)

Preferências do device GPU: potência, features exigidas/desejadas e limites. Reaplicadas em
`requestNewDevice()`. O que foi obtido aparece em `app.capabilities`.

***

### maxFramesInFlight?

> `optional` **maxFramesInFlight?**: `number`

Defined in: [src/presentation/app/Engine.ts:93](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L93)

Máximo de quadros em execução na GPU antes de o laço gravar outro (inteiro ≥ 1, default 2). Evita acumular
trabalho na GPU sem limite quando ela é mais lenta que a CPU; `step()` não espera.

***

### memoryBudgetMB?

> `optional` **memoryBudgetMB?**: `number`

Defined in: [src/presentation/app/Engine.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L73)

Threshold (MiB) de GPU memory acima do qual `memoryWarning` é emitido
(uma vez por transição abaixo→acima). Default: undefined (sem warning).
`core.memoryUsage()` continua sempre disponível para inspeção sob demanda.

***

### profiling?

> `optional` **profiling?**: `boolean` \| [`FrameProfilingGranularity`](../../platform/web/type-aliases/FrameProfilingGranularity.md)

Defined in: [src/presentation/app/Engine.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L86)

Liga o profiling de GPU por quadro: `frameComplete.stats.gpuTimeMs` passa a ser preenchido (com defasagem de 1–3
quadros). `true` ou `'passes'`: todo passe recebe timestamps e `stagesNs` traz o tempo de cada um; `'frame'`:
só o total da gravação (dois timestamps por quadro, sem o custo de amostrar cada passe — o modo para medir
desempenho). Sem `timestamp-query` no device, avisa uma vez e segue sem tempo de GPU. Default: false.

***

### profilingCapacity?

> `optional` **profilingCapacity?**: `number`

Defined in: [src/presentation/app/Engine.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L88)

Capacidade de timestamps por quadro (pares = passes medidos). Default: 256 (128 passes).

***

### scene?

> `optional` **scene?**: [`SceneContext`](../../platform/web/interfaces/SceneContext.md)

Defined in: [src/presentation/app/Engine.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L79)

SceneContext customizado. Quando omitido, usa o singleton default
(compatibilidade). Forneça via `createScene()` para múltiplas
Applications no mesmo processo (multi-canvas, tests isolados).
