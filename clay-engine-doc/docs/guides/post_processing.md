---
sidebar_position: 11
title: Post-Processing
---

# Post-Processing

A Clay Engine vem com 8 effects modulares aplicados em chain ping-pong sobre o offscreen color do `ForwardFlow` antes de blittar para o canvas.

## Effects disponíveis

| Effect                | Fragment WGSL    | Parâmetros principais         |
|-----------------------|------------------|-------------------------------|
| `Vignette`            | `fs_vignette`    | `strength` (escurecer borda)  |
| `Fxaa`                | `fs_fxaa`        | `strength` (mix avg-cc)       |
| `ToneMapping`         | `fs_tonemap`     | `strength` = exposure         |
| `Bloom`               | `fs_bloom`       | `strength`, `aux[0]` = threshold |
| `Blur`                | `fs_blur`        | `strength` = mix              |
| `Ssao`                | `fs_ssao`        | `strength`                    |
| `ChromaticAberration` | `fs_chromatic`   | `strength` = offset           |
| `ColorGrading`        | `fs_grading`     | `aux[0..2]` = LUT indices     |

## Encadeando

```typescript
import { Bloom, ToneMapping, Fxaa, Vignette } from 'webgpu-engine';

// Ordem importa — Bloom precisa de HDR, então ToneMapping vem depois.
app.defaults.post.addEffect(new Bloom({ strength: 0.6, aux: [0.7, 0, 0] }));
app.defaults.post.addEffect(new ToneMapping({ strength: 1.0 }));
app.defaults.post.addEffect(new Fxaa({ strength: 0.5 }));
app.defaults.post.addEffect(new Vignette({ strength: 0.3 }));
```

Quando nenhum effect está ativo, o `PostFlow` ainda renderiza um pass passthrough (blita scene → canvas), assegurando que o pipeline completo é resilient a `addEffect`/`isEnabled = false`.

## Toggling

```typescript
const bloom = new Bloom();
app.defaults.post.addEffect(bloom);

// Mais tarde:
bloom.data['enabled'] = false;   // próximo frame, é skip
```

`PostFlow.dispatch()` filtra `effects.filter(e => e.isEnabled)` a cada frame — mudanças em `data['enabled']` aplicam imediatamente.

## Custom effect

Crie uma subclasse de `PostProcessEffect` apontando para um fragment entry point WGSL e registre no PostFlow. O fragment recebe automaticamente `src_tex`/`src_smp` (scene/previous-effect) + `params: EffectParams` no `effects.wgsl`.

```typescript
import { PostProcessEffect } from 'webgpu-engine';

class Sepia extends PostProcessEffect {
    get name() { return 'Sepia'; }
    get fragmentEntry() { return 'fs_sepia'; }
}
```

Para o WGSL, expanda o `effects.wgsl` ou injete um shader source customizado via `PostFlow.addEffect` com fragment entry alternativo. Isso é cobrado em uma extensão futura — hoje os 8 effects compartilham um único arquivo .wgsl.

## Render flow

1. `ForwardFlow.setRenderToOffscreen(true)` → cor renderizada em texture `outputColorView`.
2. `PostFlow` lê `forward.colorOutputView`, aplica effects ativos com 2 textures ping-pong (alocadas size-aware, recriadas em `onCanvasResized`).
3. Último effect renderiza no swapchain (canvas) com `loadOp: clear`.

Performance: cada effect = 1 fullscreen triangle pass. Para 4 effects @ 1080p ≈ 4 × 2M pixels × ~2-5 sample reads = baixo overhead em GPUs decentes.
