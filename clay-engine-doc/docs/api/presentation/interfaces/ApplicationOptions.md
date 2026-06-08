[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ApplicationOptions

# Interface: ApplicationOptions

Defined in: [presentation/app/Application.ts:24](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Application.ts#L24)

Opções de inicialização do `Application`. Apenas `canvas` é obrigatório;
defaults sensíveis para o resto. Use `scene` para multi-Application,
`captureErrors`/`memoryBudgetMB` para resiliência em produção.

## Properties

### autoResize?

> `optional` **autoResize?**: `boolean`

Defined in: [presentation/app/Application.ts:30](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Application.ts#L30)

Auto-attach window.resize listener (default true em ambiente browser).

***

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [presentation/app/Application.ts:26](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Application.ts#L26)

HTMLCanvasElement onde a engine renderiza. Deve estar attachado ao DOM.

***

### canvasOptions?

> `optional` **canvasOptions?**: `CanvasOptions`

Defined in: [presentation/app/Application.ts:28](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Application.ts#L28)

Configuração do swapchain (alphaMode, colorSpace). Default: opaque/srgb.

***

### captureErrors?

> `optional` **captureErrors?**: `boolean`

Defined in: [presentation/app/Application.ts:39](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Application.ts#L39)

Quando true, cada frame abre um WebGPU error scope `validation`. Erros viram
eventos `engineError` (stage='frame') em vez de exceptions — o GameLoop
continua o próximo frame. Útil em produção para resiliência ou em dev para
surfacing erros sem crash. Default: false (custo de push/pop por frame).

***

### memoryBudgetMB?

> `optional` **memoryBudgetMB?**: `number`

Defined in: [presentation/app/Application.ts:45](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Application.ts#L45)

Threshold (MiB) de GPU memory acima do qual `memoryWarning` é emitido
(uma vez por transição abaixo→acima). Default: undefined (sem warning).
`core.memoryUsage()` continua sempre disponível para inspeção sob demanda.

***

### resizeDebounceMs?

> `optional` **resizeDebounceMs?**: `number`

Defined in: [presentation/app/Application.ts:32](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Application.ts#L32)

Debounce em ms para o handler de resize (default 100).

***

### scene?

> `optional` **scene?**: `SceneContext`

Defined in: [presentation/app/Application.ts:51](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Application.ts#L51)

SceneContext customizado. Quando omitido, usa o singleton default
(compatibilidade). Forneça via `createScene()` para múltiplas
Applications no mesmo processo (multi-canvas, tests isolados).
