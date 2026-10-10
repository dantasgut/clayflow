# Smokes de browser

Smokes que precisam de um GPUDevice real e do GameLoop a 60 fps. Não rodam em CI
(WebGPU em headless requer Vulkan drivers que tornam o pipeline pesado). Rodam
manualmente via Vite dev server e validados por console + DOM `#log`.

## Como rodar

Pelo servidor do bench (Chrome da máquina com WebGPU, via Playwright):

```bash
npm run smoke -- time                     # um smoke
npm run smoke -- transforms,time,bigMesh  # vários, um por página
npm run build:lib && npm run smoke -- time --dist   # sobre o build minificado (dist/index.js)
```

Cada smoke abre `bench/smoke.html?name=<nome>` numa página nova e o runner espera `… SMOKE PASSED` ou `FAIL: …`
no `#log` (saída 0 = todos passaram, 1 = algum falhou, 3 = erro de ambiente). Os smokes importam o barrel público
`clayflow` — o alias do servidor do bench aponta para `src/index.ts` ou, com `--dist`, para `dist/index.js` — e
são verificados por `npm run typecheck:bench`.

## Inventário

| Arquivo          | O que valida                                                                                                                                                                                                                                                                                                                                                                     | Tempo aprox. |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `stress60s.ts`   | Long-running 60s + memory budget + 8 PostEffects + cena básica. Memory growth ≤ 1.1× entre primeira e última amostra (3600 frames).                                                                                                                                                                                                                                              | ~60s         |
| `integration.ts` | Cena combinada (Camera+Light+Box+Sphere) + 4 PostEffects (Bloom, ToneMapping, Fxaa, Vignette) por 30 frames. Sem engineError + canvas.toDataURL não-vazio.                                                                                                                                                                                                                       | ~1s          |
| `multiApp.ts`    | 2 Applications em 2 canvases distintos com `createScene()` cada — valida queries e eventos isolados; ~30 frames por app.                                                                                                                                                                                                                                                         | ~1s          |
| `transforms.ts`  | Spec 003: readback do pool `WorldTransform` = oráculo `T·R·S`/`R·S⁻¹` (inclui escala não uniforme, espelhada e quaternion não normalizado); cor esperada nos centros projetados (3×3 px); mutação de `data.position` refletida no quadro seguinte; corpos rígidos caem com escala visual 0.5 preservada. Dirige os quadros por `app.step` (funciona com a aba em segundo plano). | ~5s          |
| `time.ts`        | Spec 004: 5 s simulados de corpos rígidos com quadros de 1/30, 1/60 e 1/144 s terminam nas mesmas poses (≤ 1e-5 m, SC-003); laço × `app.step` com o mesmo número de passos (SC-005); `time.scale = 0.25` com laço por 2 s reais avança 25% ± 1% (SC-004); `pausePhysics` congela as poses enquanto os quadros continuam. Poses lidas do pool `LCPSchema` na GPU.                 | ~9s          |

## Convenção de logs

- Cada smoke usa prefixo `[<nome>]` no console (e.g. `[stress] frame 600: …`).
- O DOM `#log` (textarea no `index.html`) recebe os mesmos logs para captura
  visual.
- Ao final, `… SMOKE PASSED` (verde) ou um `FAIL: …` que dispara `throw`.
