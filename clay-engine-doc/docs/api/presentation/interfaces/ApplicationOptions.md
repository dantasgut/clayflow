[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ApplicationOptions

# Interface: ApplicationOptions

Defined in: [presentation/app/Application.ts:34](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L34)

Opções de inicialização do `Application`. Apenas `canvas` é obrigatório;
defaults sensíveis para o resto. Use `scene` para multi-Application,
`captureErrors`/`memoryBudgetMB` para resiliência em produção.

## Properties

### autoResize?

> `optional` **autoResize?**: `boolean`

Defined in: [presentation/app/Application.ts:45](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L45)

Auto-attach window.resize listener (default true em ambiente browser).

***

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [presentation/app/Application.ts:36](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L36)

HTMLCanvasElement onde a engine renderiza. Deve estar attachado ao DOM.

***

### canvasOptions?

> `optional` **canvasOptions?**: `CanvasOptions`

Defined in: [presentation/app/Application.ts:38](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L38)

Configuração do swapchain (alphaMode, colorSpace). Default: opaque/srgb.

***

### captureErrors?

> `optional` **captureErrors?**: `boolean`

Defined in: [presentation/app/Application.ts:54](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L54)

Quando true, cada frame abre um WebGPU error scope `validation`. Erros viram
eventos `engineError` (stage='frame') em vez de exceptions — o GameLoop
continua o próximo frame. Útil em produção para resiliência ou em dev para
surfacing erros sem crash. Default: false (custo de push/pop por frame).

***

### consumers?

> `optional` **consumers?**: (`registry`) => `void`

Defined in: [presentation/app/Application.ts:84](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L84)

Registra resolvers de `consumes` próprios da aplicação (ex.: `r.register(new SingletonResolver(Wind.schema,
'wind'))`). Roda depois dos padrão do motor; `register` de um nome existente o substitui.

#### Parameters

##### registry

`ConsumerResolverRegistry`

#### Returns

`void`

***

### device?

> `optional` **device?**: `DeviceOptions`

Defined in: [presentation/app/Application.ts:43](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L43)

Preferências do device GPU: potência, features exigidas/desejadas e limites. Reaplicadas em
`requestNewDevice()`. O que foi obtido aparece em `app.capabilities`.

***

### maxFramesInFlight?

> `optional` **maxFramesInFlight?**: `number`

Defined in: [presentation/app/Application.ts:79](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L79)

Máximo de quadros em execução na GPU antes de o laço gravar outro (inteiro ≥ 1, default 2). Evita acumular
trabalho na GPU sem limite quando ela é mais lenta que a CPU; `step()` não espera.

***

### memoryBudgetMB?

> `optional` **memoryBudgetMB?**: `number`

Defined in: [presentation/app/Application.ts:60](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L60)

Threshold (MiB) de GPU memory acima do qual `memoryWarning` é emitido
(uma vez por transição abaixo→acima). Default: undefined (sem warning).
`core.memoryUsage()` continua sempre disponível para inspeção sob demanda.

***

### profiling?

> `optional` **profiling?**: `boolean`

Defined in: [presentation/app/Application.ts:72](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L72)

Liga o profiling de GPU por quadro: todo passe recebe timestamps automaticamente e
`frameComplete.stats.gpuTimeMs` passa a ser preenchido (com defasagem de 1–3 quadros).
Sem `timestamp-query` no device, avisa uma vez e segue sem tempo de GPU. Default: false.

***

### profilingCapacity?

> `optional` **profilingCapacity?**: `number`

Defined in: [presentation/app/Application.ts:74](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L74)

Capacidade de timestamps por quadro (pares = passes medidos). Default: 256 (128 passes).

***

### resizeDebounceMs?

> `optional` **resizeDebounceMs?**: `number`

Defined in: [presentation/app/Application.ts:47](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L47)

Debounce em ms para o handler de resize (default 100).

***

### scene?

> `optional` **scene?**: `SceneContext`

Defined in: [presentation/app/Application.ts:66](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/Application.ts#L66)

SceneContext customizado. Quando omitido, usa o singleton default
(compatibilidade). Forneça via `createScene()` para múltiplas
Applications no mesmo processo (multi-canvas, tests isolados).
