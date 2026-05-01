# Smokes de browser

Smokes que precisam de um GPUDevice real e do GameLoop a 60 fps. Não rodam em CI
(WebGPU em headless requer Vulkan drivers que tornam o pipeline pesado). Rodam
manualmente via Vite dev server e validados por console + DOM `#log`.

## Como rodar

1. Copie o smoke desejado por cima de `src/main.ts`:

   ```bash
   cp src/__smokes__/stress60s.ts src/main.ts
   ```

2. Inicie o dev server (sempre **reinicie** antes de cada smoke — convenção do
   projeto, ver `feedback_always_restart_vite.md`):

   ```bash
   npm run dev
   ```

3. Abra `http://localhost:5173` e aguarde o smoke rodar até o final
   (`STRESS SMOKE PASSED` ou `FAIL: …`).

4. Restaure o `main.ts` original via git (`git restore src/main.ts`) ou edite
   manualmente para o próximo smoke.

## Inventário

| Arquivo          | O que valida                                                                                                                                               | Tempo aprox. |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `stress60s.ts`   | Long-running 60s + memory budget + 8 PostEffects + cena básica. Memory growth ≤ 1.1× entre primeira e última amostra (3600 frames).                        | ~60s         |
| `integration.ts` | Cena combinada (Camera+Light+Box+Sphere) + 4 PostEffects (Bloom, ToneMapping, Fxaa, Vignette) por 30 frames. Sem engineError + canvas.toDataURL não-vazio. | ~1s          |
| `multiApp.ts`    | 2 Applications em 2 canvases distintos com `createScene()` cada — valida queries e eventos isolados; ~30 frames por app.                                   | ~1s          |

## Convenção de logs

- Cada smoke usa prefixo `[<nome>]` no console (e.g. `[stress] frame 600: …`).
- O DOM `#log` (textarea no `index.html`) recebe os mesmos logs para captura
  visual.
- Ao final, `… SMOKE PASSED` (verde) ou um `FAIL: …` que dispara `throw`.
