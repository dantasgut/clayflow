[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ApplicationOptions

# Interface: ApplicationOptions

Defined in: [presentation/app/Application.ts:31](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L31)

Opções de inicialização do `Application`. Apenas `canvas` é obrigatório;
defaults sensíveis para o resto. Use `scene` para multi-Application,
`captureErrors`/`memoryBudgetMB` para resiliência em produção.

## Properties

### autoResize?

> `optional` **autoResize?**: `boolean`

Defined in: [presentation/app/Application.ts:42](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L42)

Auto-attach window.resize listener (default true em ambiente browser).

***

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [presentation/app/Application.ts:33](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L33)

HTMLCanvasElement onde a engine renderiza. Deve estar attachado ao DOM.

***

### canvasOptions?

> `optional` **canvasOptions?**: `CanvasOptions`

Defined in: [presentation/app/Application.ts:35](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L35)

Configuração do swapchain (alphaMode, colorSpace). Default: opaque/srgb.

***

### captureErrors?

> `optional` **captureErrors?**: `boolean`

Defined in: [presentation/app/Application.ts:51](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L51)

Quando true, cada frame abre um WebGPU error scope `validation`. Erros viram
eventos `engineError` (stage='frame') em vez de exceptions — o GameLoop
continua o próximo frame. Útil em produção para resiliência ou em dev para
surfacing erros sem crash. Default: false (custo de push/pop por frame).

***

### consumers?

> `optional` **consumers?**: (`registry`) => `void`

Defined in: [presentation/app/Application.ts:81](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L81)

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

Defined in: [presentation/app/Application.ts:40](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L40)

Preferências do device GPU: potência, features exigidas/desejadas e limites. Reaplicadas em
`requestNewDevice()`. O que foi obtido aparece em `app.capabilities`.

***

### maxFramesInFlight?

> `optional` **maxFramesInFlight?**: `number`

Defined in: [presentation/app/Application.ts:76](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L76)

Máximo de quadros em execução na GPU antes de o laço gravar outro (inteiro ≥ 1, default 2). Evita acumular
trabalho na GPU sem limite quando ela é mais lenta que a CPU; `step()` não espera.

***

### memoryBudgetMB?

> `optional` **memoryBudgetMB?**: `number`

Defined in: [presentation/app/Application.ts:57](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L57)

Threshold (MiB) de GPU memory acima do qual `memoryWarning` é emitido
(uma vez por transição abaixo→acima). Default: undefined (sem warning).
`core.memoryUsage()` continua sempre disponível para inspeção sob demanda.

***

### profiling?

> `optional` **profiling?**: `boolean`

Defined in: [presentation/app/Application.ts:69](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L69)

Liga o profiling de GPU por quadro: todo passe recebe timestamps automaticamente e
`frameComplete.stats.gpuTimeMs` passa a ser preenchido (com defasagem de 1–3 quadros).
Sem `timestamp-query` no device, avisa uma vez e segue sem tempo de GPU. Default: false.

***

### profilingCapacity?

> `optional` **profilingCapacity?**: `number`

Defined in: [presentation/app/Application.ts:71](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L71)

Capacidade de timestamps por quadro (pares = passes medidos). Default: 256 (128 passes).

***

### resizeDebounceMs?

> `optional` **resizeDebounceMs?**: `number`

Defined in: [presentation/app/Application.ts:44](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L44)

Debounce em ms para o handler de resize (default 100).

***

### scene?

> `optional` **scene?**: `SceneContext`

Defined in: [presentation/app/Application.ts:63](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/app/Application.ts#L63)

SceneContext customizado. Quando omitido, usa o singleton default
(compatibilidade). Forneça via `createScene()` para múltiplas
Applications no mesmo processo (multi-canvas, tests isolados).
