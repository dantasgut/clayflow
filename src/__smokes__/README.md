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
npm run smoke -- trajectories,render --record      # grava as fixtures de src/__smokes__/fixtures (perfil da GPU)
```

Cada smoke abre `bench/smoke.html?name=<nome>` numa página nova e o runner espera `… SMOKE PASSED` ou `FAIL: …`
no `#log` (saída 0 = todos passaram, 1 = algum falhou, 3 = erro de ambiente). Os smokes importam o barrel público
`clayflow` — o alias do servidor do bench aponta para `src/index.ts` ou, com `--dist`, para `dist/index.js` — e
são verificados por `npm run typecheck:bench`.

## Inventário

| Arquivo             | O que valida                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Tempo aprox. |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `stress60s.ts`      | Long-running 60s + memory budget + 8 PostEffects + cena básica. Memory growth ≤ 1.1× entre primeira e última amostra (3600 frames).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | ~60s         |
| `integration.ts`    | Cena combinada (Camera+Light+Box+Sphere) + 4 PostEffects (Bloom, ToneMapping, Fxaa, Vignette) por 30 frames. Sem engineError + canvas.toDataURL não-vazio.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ~1s          |
| `multiApp.ts`       | 2 Applications em 2 canvases distintos com `createScene()` cada — valida queries e eventos isolados; ~30 frames por app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ~1s          |
| `transforms.ts`     | Spec 003: readback do pool `WorldTransform` = oráculo `T·R·S`/`R·S⁻¹` (inclui escala não uniforme, espelhada e quaternion não normalizado); cor esperada nos centros projetados (3×3 px); mutação de `data.position` refletida no quadro seguinte; corpos rígidos caem com escala visual 0.5 preservada. Dirige os quadros por `app.step` (funciona com a aba em segundo plano).                                                                                                                                                                                                                                                                                                       | ~5s          |
| `time.ts`           | Spec 004: 5 s simulados de corpos rígidos com quadros de 1/30, 1/60 e 1/144 s terminam nas mesmas poses (≤ 1e-5 m, SC-003); laço × `app.step` com o mesmo número de passos (SC-005); `time.scale = 0.25` com laço por 2 s reais avança 25% ± 1% (SC-004); `pausePhysics` congela as poses enquanto os quadros continuam. Poses lidas do pool `LCPSchema` na GPU.                                                                                                                                                                                                                                                                                                                       | ~9s          |
| `limits.ts`         | Spec 004: kernel linear por `invocations(70 000 × 256, 256)` (> 65 535 grupos) marca cada elemento exatamente uma vez (SC-010); busca de vizinhança com grade 64³ = 262 144 células igual à referência na CPU para todas as partículas (SC-011).                                                                                                                                                                                                                                                                                                                                                                                                                                       | ~1s          |
| `bigMesh.ts`        | Spec 004: `ParametricGeometry` 300 × 300 (90 601 vértices) com índices `uint32` cobre 100% da área projetada nas duas metades (a de cima usa vértices de índice ≥ 65 536 — com `uint16` truncado cai para ~48%) (SC-008).                                                                                                                                                                                                                                                                                                                                                                                                                                                              | ~1s          |
| `churn.ts`          | Spec 004: 100 ciclos de inserir, desenhar e remover 1 000 objetos (com sombra): memória de GPU volta à referência do 1º ciclo (±1%) e a contagem de ouvintes fica estável (SC-006). Sem a liberação por entidade, cresce para ~1,2 GB e falha.                                                                                                                                                                                                                                                                                                                                                                                                                                         | ~25s         |
| `rigidContacts.ts`  | Spec 004: pilhas de esferas e caixas (grade, camadas) num recinto estático com 1 000 e 10 000 corpos, 12 s simulados: nenhum atravessa o chão (≤ folga + 1 cm) nem sai do recinto; ≥ 99% em repouso (< 0,05 m/s), média < 0,01 m/s, nenhum > 1 m/s; sem excedente de contatos (SC-013). Registra GPU+CPU por quadro e memória. Medido (perfil apple-metal-3): 1k — 8,2 ms/quadro, 100% em repouso, 5,7 MiB; 10k — 223,7 ms/quadro, 99,87% em repouso, 70,5 MiB.                                                                                                                                                                                                                        | ~30s         |
| `trajectories.ts`   | Spec 005: LCP, XPBD (corrente presa), FEM, MPM sólido e fluido, SPH e PBF (tanque com paredes) por 240 passos fixos de 1/60 s, comparados com quadros de 1/60, 1/30 e 1/144 s (spec 006, FR-027: mesma trajetória em qualquer taxa); critérios físicos por cena (sem NaN, no domínio, acima do chão, fluidos assentados, SPH com densidade mediana em ±15% de ρ₀, elos XPBD em ±5%) e comparação bit a bit com a fixture `fixtures/trajectories-<perfil>.{bin,json}`. `--record` roda cada cena duas vezes (exige determinismo) e grava.                                                                                                                                               | ~3s          |
| `render.ts`         | Spec 005: forward (StandardMaterial, WireframeMaterial, sombra), cada efeito de pós isolado e UI, um quadro por cena por `app.step`; pixels comparados com `fixtures/render-<cena>-<perfil>.png` (igualdade exata). `--record` exige duas renderizações idênticas e grava.                                                                                                                                                                                                                                                                                                                                                                                                             | ~1s          |
| `shaderLibrary.ts`  | Spec 005: cada módulo da `wgslLib` compila sozinho num kernel de teste; valores na GPU contra referência em CPU (256 entradas por caso, erro relativo) para quat, linalg, mat (inclui decomposição polar com partida a quente), sdf, núcleos SPH, pesos MPM (partição da unidade), FEM, ruído (contra `support/noiseReference.ts`), cor, BRDF e XPBD/LCP; para cada schema do motor (40), um kernel grava sentinelas campo a campo no struct gerado e a CPU confere cada `offsetOf` (layout TS ≡ WGSL).                                                                                                                                                                                | ~1s          |
| `computeKernels.ts` | Spec 005: kernels genéricos contra CPU — `PrefixSum` (N até 70 000 × 256 > 65 535 grupos, exclusiva/inclusiva, entrada preservada), `RadixSort` (N até 4 M; chaves aleatórias/iguais/decrescentes; 8 e 32 bits; estável), `Compaction` (50%/1%, atômica e estável, capacidade excedida sem escrita além), `Reduce` (sum/min/max × u32/i32/f32), `GraphColorer` (grade 2D, malha de tetraedros, grafo aleatório de 1 M arestas: válida, ≤ 2Δ − 1 cores, intervalos cobrem todas as arestas; laço rejeitado), `fixed_point` (1 M contribuições iguais à CPU, saturação). Medido (apple-metal-3): PrefixSum 4 M 1,9 ms; RadixSort 4 M (32 bits) 8,5 ms; 1 M arestas → 40 cores em ~50 ms. | ~9s          |

## Resultados (spec 005, perfil apple-metal-3, 2026-10-12)

Os 13 smokes passam no código-fonte e sobre o build minificado (`npm run build:lib && npm run smoke -- … --dist`):
`time`, `transforms`, `integration`, `multiApp`, `limits`, `churn`, `bigMesh`, `rigidContacts`, `stress60s`,
`trajectories` (bit a bit com as fixtures gravadas antes da migração), `render` (pixels idênticos), `shaderLibrary`,
`computeKernels`.

| Medida                              | Código-fonte    | `--dist` |
| ----------------------------------- | --------------- | -------- |
| `rigidContacts` 1k (GPU+CPU/quadro) | 8,4 ms          | 9,9 ms   |
| `rigidContacts` 10k                 | 220,5 ms        | 226,3 ms |
| `PrefixSum` 4 M                     | 1,93 ms         | —        |
| `RadixSort` 4 M (32 bits)           | 8,98 ms         | —        |
| `GraphColorer` 1 M arestas (Δ = 40) | 40 cores, 46 ms | —        |

A referência da 004 para `rigidContacts` 10k é 223,7 ms; a diferença entre execuções fica em ±3%.

## Spec 006 — render em slots (T048, perfil apple-metal-3, 2026-10-12)

Com `ShadowFlow`, `ForwardFlow` e `PostFlow` no modelo de slots (sem objeto de GPU por entidade; alvos do quadro em
`FrameTargets`), `npm run smoke -- render,churn,bigMesh,integration` passa: as 10 cenas de `render` saem com pixels
idênticos às fixtures da 005; `churn` fica em 5,29 MiB e 22 ouvintes do 1º ao 100º ciclo (variação 0,000%); `bigMesh`
desenha 90 601 vértices com índice `uint32` e cobertura de 100%; `integration` roda 30 quadros com 4 efeitos e 0 erros.

## Spec 006 — todos os Flows em slots (T054, perfil apple-metal-3, 2026-10-12)

Com o caminho legado removido (todos os estágios registrados por factory), `npm run smoke --
trajectories,render,churn,limits,rigidContacts,multiApp,stress60s,shaderLibrary,computeKernels` passa: trajetórias
bit a bit nas 7 cenas a 30/60/144 Hz; `render` com as 10 cenas idênticas (UI inclusive); `churn` estável; `stress60s`
com 3600 quadros, 8 efeitos, 0 erros e memória 11,40 MiB → 11,40 MiB; `rigidContacts` 1k em 9,1 ms e 10k em
199,7 ms por quadro (GPU+CPU; referência da 005: 8,4 e 220,5 ms), 100,00% e 99,87% em repouso; `shaderLibrary` (14
módulos, 47 schemas) e `computeKernels` (PrefixSum 4 M 2,18 ms, RadixSort 4 M 8,57 ms) verdes.

## Convenção de logs

- Cada smoke usa prefixo `[<nome>]` no console (e.g. `[stress] frame 600: …`).
- O DOM `#log` (textarea no `index.html`) recebe os mesmos logs para captura
  visual.
- Ao final, `… SMOKE PASSED` (verde) ou um `FAIL: …` que dispara `throw`.
