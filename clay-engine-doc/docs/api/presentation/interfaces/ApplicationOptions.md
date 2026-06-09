[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ApplicationOptions

# Interface: ApplicationOptions

Defined in: [presentation/app/Application.ts:25](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L25)

Opções de inicialização do `Application`. Apenas `canvas` é obrigatório;
defaults sensíveis para o resto. Use `scene` para multi-Application,
`captureErrors`/`memoryBudgetMB` para resiliência em produção.

## Properties

### autoResize?

> `optional` **autoResize?**: `boolean`

Defined in: [presentation/app/Application.ts:31](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L31)

Auto-attach window.resize listener (default true em ambiente browser).

***

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [presentation/app/Application.ts:27](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L27)

HTMLCanvasElement onde a engine renderiza. Deve estar attachado ao DOM.

***

### canvasOptions?

> `optional` **canvasOptions?**: `CanvasOptions`

Defined in: [presentation/app/Application.ts:29](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L29)

Configuração do swapchain (alphaMode, colorSpace). Default: opaque/srgb.

***

### captureErrors?

> `optional` **captureErrors?**: `boolean`

Defined in: [presentation/app/Application.ts:40](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L40)

Quando true, cada frame abre um WebGPU error scope `validation`. Erros viram
eventos `engineError` (stage='frame') em vez de exceptions — o GameLoop
continua o próximo frame. Útil em produção para resiliência ou em dev para
surfacing erros sem crash. Default: false (custo de push/pop por frame).

***

### memoryBudgetMB?

> `optional` **memoryBudgetMB?**: `number`

Defined in: [presentation/app/Application.ts:46](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L46)

Threshold (MiB) de GPU memory acima do qual `memoryWarning` é emitido
(uma vez por transição abaixo→acima). Default: undefined (sem warning).
`core.memoryUsage()` continua sempre disponível para inspeção sob demanda.

***

### resizeDebounceMs?

> `optional` **resizeDebounceMs?**: `number`

Defined in: [presentation/app/Application.ts:33](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L33)

Debounce em ms para o handler de resize (default 100).

***

### scene?

> `optional` **scene?**: `SceneContext`

Defined in: [presentation/app/Application.ts:52](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L52)

SceneContext customizado. Quando omitido, usa o singleton default
(compatibilidade). Forneça via `createScene()` para múltiplas
Applications no mesmo processo (multi-canvas, tests isolados).
