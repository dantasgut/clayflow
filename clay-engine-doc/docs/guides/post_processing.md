---
sidebar_position: 11
title: Post-Processing
---

# Post-Processing

A Clay Engine vem com 5 effects modulares aplicados em chain ping-pong sobre a cor HDR da cena (`FrameTargets.color`, `rgba16float`) antes da apresentação — o último passe, que aplica a exposição e o mapeamento de tons do `ToneMapping` da cena e escreve no canvas.

## Effects disponíveis

| Effect                | Fragment WGSL    | Parâmetros principais         |
|-----------------------|------------------|-------------------------------|
| `Vignette`            | `fs_vignette`    | `strength` (escurecer borda)  |
| `Bloom`               | `fs_bloom`       | `strength`, `aux[0]` = threshold |
| `Blur`                | `fs_blur`        | `strength` = mix              |
| `ChromaticAberration` | `fs_chromatic`   | `strength` = offset           |
| `ColorGrading`        | `fs_grading`     | `aux[0..2]` = LUT indices     |

## Encadeando

```typescript
import { Bloom, ToneMapping, Vignette } from 'webgpu-engine';

// A apresentação não é efeito: é um Resource da cena, aplicado sempre por último.
app.world.insert(new ToneMapping({ operator: 'agx', exposure: 0 }));
// Ordem importa — os efeitos rodam em sequência, todos sobre o HDR.
app.defaults.post.addEffect(new Bloom({ strength: 0.6, aux: [0.7, 0, 0] }));
app.defaults.post.addEffect(new Vignette({ strength: 0.3 }));
```

Quando nenhum effect está ativo, não há passe só para levar a imagem à tela: com o antisserrilhado temporal, a resolução temporal (com a nitidez adaptativa ao movimento) já apresenta no canvas; sem ele, a apresentação lê a cor da cena direto (com MSAA, mapeando cada amostra antes da média).

> **Removidos na spec 034:** `Fxaa` e `Ssao`. O "FXAA" era uma média de 5 leituras, não FXAA; o antisserrilhado agora é o temporal da cena (opção `antialias` de `Application.create`: `'temporal'`, `'msaa'` ou `'off'`). O "SSAO" escurecia pelo brilho da cor, sem oclusão nenhuma; a oclusão vem da iluminação global (`GlobalIllumination`).

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

1. O `ForwardFlow` (registrado com `output: 'scene'`) desenha a cena nos `FrameTargets` — cor no formato do canvas e
   profundidade `depth24plus`, recriadas pela C2 quando o canvas muda.
2. O `PostFlow` lê a cor pelo slot `scene` (`slot.texture(FrameTargets.schema, 'color')`) e aplica os effects ativos
   com 2 texturas pingue-pongue privadas (do tamanho do canvas, recriadas na transição `canvasReconfigured`). Cada
   effect tem o seu pipeline (`post:<nome>`) e os seus privados por pipeline (`post:<nome>:src_tex`,
   `post:<nome>:params`), preparados e religados em `framePrepare` quando a cadeia muda.
3. O último effect renderiza no canvas (slot `target: 'canvas'`) com `loadOp: clear`; sem effects ligados, uma
   passagem direta (`post:passthrough`) copia a cena.

Performance: cada effect = 1 fullscreen triangle pass. Para 4 effects @ 1080p ≈ 4 × 2M pixels × ~2-5 sample reads = baixo overhead em GPUs decentes.
