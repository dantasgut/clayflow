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
| `render.ts`         | Spec 005: forward (StandardMaterial, WireframeMaterial, sombra; spec 008: caixa com `PointSpriteMaterial`, sprites nos vértices), cada efeito de pós isolado e UI, um quadro por cena por `app.step`; pixels comparados com `fixtures/render-<cena>-<perfil>.png` (igualdade exata). `--record` exige duas renderizações idênticas e grava. `--query f32=1` (spec 007, T005): matrizes da câmera com cada operação arredondada a `f32`, como um kernel — 5 dos 16 elementos de `viewProjection` mudam e as 10 cenas ficam idênticas.                                                                                                                                                   | ~1s          |
| `contactSet.ts`     | Spec 007 (FR-015, SC-006): a pilha do `rigidContacts` (1 000 e 10 000 corpos) por 60 passos; a cada passo, o conjunto de contatos do último substep em forma canônica (registros ordenados pelos bytes) e o seu hash, comparados com `fixtures/contacts-<perfil>.json` — a referência é a narrowphase exaustiva (N·M), gravada antes da broadphase. `--record` grava. Pilha compartilhada com o `rigidContacts` (`support/rigidPile.ts`).                                                                                                                                                                                                                                              | ~15s         |
| `scale1m.ts`        | Spec 007 (US7, SC-003): 1 000 000 de caixas idênticas com material e `Transform` próprios; tempo de montagem e do primeiro quadro, quadros seguintes, heap JS retido (≤ 1,5 GB, depois de `gc()`) e memória de GPU além dos pools de cena (≤ 64 MiB: uma cópia da geometria, alvos e buffers dos estágios). Antes da 007 a aba trava na montagem (`--timeout 600`).                                                                                                                                                                                                                                                                                                                    | variável     |
| `shaderLibrary.ts`  | Spec 005: cada módulo da `wgslLib` compila sozinho num kernel de teste; valores na GPU contra referência em CPU (256 entradas por caso, erro relativo) para quat, linalg, mat (inclui decomposição polar com partida a quente), sdf, núcleos SPH, pesos MPM (partição da unidade), FEM, ruído (contra `elements/nodes/reference/noise.ts`), cor, BRDF e XPBD/LCP; para cada schema do motor (40), um kernel grava sentinelas campo a campo no struct gerado e a CPU confere cada `offsetOf` (layout TS ≡ WGSL).                                                                                                                                                                        | ~1s          |
| `computeKernels.ts` | Spec 005: kernels genéricos contra CPU — `PrefixSum` (N até 70 000 × 256 > 65 535 grupos, exclusiva/inclusiva, entrada preservada), `RadixSort` (N até 4 M; chaves aleatórias/iguais/decrescentes; 8 e 32 bits; estável), `Compaction` (50%/1%, atômica e estável, capacidade excedida sem escrita além), `Reduce` (sum/min/max × u32/i32/f32), `GraphColorer` (grade 2D, malha de tetraedros, grafo aleatório de 1 M arestas: válida, ≤ 2Δ − 1 cores, intervalos cobrem todas as arestas; laço rejeitado), `fixed_point` (1 M contribuições iguais à CPU, saturação). Medido (apple-metal-3): PrefixSum 4 M 1,9 ms; RadixSort 4 M (32 bits) 8,5 ms; 1 M arestas → 40 cores em ~50 ms. | ~9s          |
| `particles.ts`      | Spec 008 (US1, SC-001/SC-002): SPH, PBF, MPM fluido e MPM sólido num tanque, desenhados como sprites (`PointSpriteMaterial`) pelo `ParticleFlow`, que lê a posição direto do pool do corpo; por cena: sprites na imagem nos quadros 30 e 90, a imagem muda entre eles, 0 leituras de volta (`core.readback`) e o quadro 90 igual à fixture `fixtures/particles-<cena>-<perfil>.png`; oclusão: uma caixa na frente do fluido cobre o centro (pixel igual ao da cena só com a caixa). `--record` exige duas execuções idênticas e grava.                                                                                                                                                 | ~2s          |
| `softSurface.ts`    | Spec 008 (US3): tecido XPBD 32 × 32 (arestas estruturais e de cisalhamento, preso pelos cantos de trás) com `surface` — a `SurfaceGeometry` é escrita na GPU pelo `SoftSurfaceFlow` (normais de face e vértices) e desenhada pelo forward com sombra — e um bloco FEM de 64 nós como sprites; por cena: o corpo aparece nos dois quadros capturados, a imagem muda, 0 leituras de volta e o último quadro igual à fixture `fixtures/softSurface-<cena>-<perfil>.png`; no tecido, a sombra escurece o chão (pixels cinza mais escuros que na cena vazia).                                                                                                                               | ~4s          |
| `pointCloud.ts`     | Spec 008 (US4): um estágio do smoke (`SpiralFlow`, `owns` sobre os vértices) escreve por kernel, a cada quadro, uma espiral animada de 10 000 pontos numa `PointCloudGeometry` (vértices só da GPU), desenhada com `PointSpriteMaterial`; pontos na imagem nos quadros 20 e 60, a imagem muda, 0 escritas da CPU no vertex buffer e 0 leituras; quadro 60 igual à fixture `fixtures/pointCloud-<perfil>.png`.                                                                                                                                                                                                                                                                          | ~1s          |
| `nodeGraphs.ts`     | Spec 031 (US2): `ParametricSurface` 64 × 64 deslocada por ruído e colorida por rampa com ramificação (o mesmo ruído na cor e na rugosidade), por grafo de nós (`SurfaceFunction`/`MaterialFunction` com `graph`) contra a mesma regra em WGSL à mão: vértices ≤ 1 ULP, pixels ≤ 1 por canal, ruído avaliado uma vez, GPU por quadro ≤ 10% + 0,05 ms; 3600 quadros (60 s simulados) mudando parâmetros → 0 shaders novos; `setGraph` compila em transição sem quadro sem a superfície. `--query part=a.d`.                                                                                                                                                                              | ~10s         |

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

## Spec 006 — fechamento (T067, perfil apple-metal-3, 2026-10-12)

Os 13 smokes passam no código-fonte e sobre o build minificado (`npm run build:lib && npm run smoke -- … --dist`):
`time`, `transforms`, `integration`, `multiApp`, `limits`, `churn`, `bigMesh`, `rigidContacts`, `stress60s`,
`trajectories` (bit a bit nas 7 cenas a 30, 60 e 144 Hz), `render` (10 cenas com pixels idênticos às fixtures da 005),
`shaderLibrary`, `computeKernels`. `dist/index.js`: 564,75 kB (144,78 kB gzip).

| Medida                              | Código-fonte      | `--dist`          |
| ----------------------------------- | ----------------- | ----------------- |
| `rigidContacts` 1k (GPU+CPU/quadro) | 8,6 ms            | 9,0 ms            |
| `rigidContacts` 10k                 | 199,7–233,7 ms    | 208,2 ms          |
| `stress60s` memória                 | 11,40 → 11,40 MiB | 11,40 → 11,40 MiB |
| `PrefixSum` 4 M                     | 1,88 ms           | —                 |
| `RadixSort` 4 M (32 bits)           | 8,58 ms           | —                 |

O `rigidContacts` 10k foi medido com a máquina carregada (outro processo a 100% de CPU); entre execuções variou de
199,7 a 233,7 ms no código-fonte (referência da 005: 220,5 ms). A comparação de desempenho de referência é a da T068
(`bench:check`).

## Spec 007 — fechamento (T062, perfil apple-metal-3, 2026-10-13)

Os 15 smokes passam no código-fonte e sobre o build minificado (`npm run build:lib && npm run smoke -- … --dist`):
`time`, `transforms` (com a cadeia de `Parent`), `integration`, `multiApp`, `limits`, `churn`, `bigMesh`,
`rigidContacts`, `contactSet` (conjunto de contatos idêntico ao da narrowphase exaustiva), `scale1m`, `stress60s`,
`trajectories` (bit a bit nas 7 cenas a 30, 60 e 144 Hz), `render` (10 cenas; fixtures regravadas na T050 com 1 pixel
em 1/255 em 7 cenas, tolerância do R10), `shaderLibrary`, `computeKernels`. Os smokes rodam com `gc()` exposto
(`--js-flags=--expose-gc`), para o `scale1m` medir heap retido. `dist/index.js`: 659,13 kB (170,14 kB gzip).

| Medida                                   | Código-fonte      | `--dist`          |
| ---------------------------------------- | ----------------- | ----------------- |
| `rigidContacts` 1k (GPU+CPU/quadro)      | 3,2 ms            | 3,3 ms            |
| `rigidContacts` 10k                      | 10,0 ms           | 6,7 ms            |
| `stress60s` memória                      | 11,40 → 11,40 MiB | 11,40 → 11,40 MiB |
| `scale1m` montagem / 1º quadro           | 6,7 s / 2,16 s    | 6,9 s / 2,38 s    |
| `scale1m` heap retido (montagem/quadros) | 1,18 / 1,31 GB    | 1,18 / 1,31 GB    |
| `scale1m` GPU além dos pools             | 16,9 MiB          | 16,9 MiB          |

Na 006, o `rigidContacts` 10k custava 199,7–233,7 ms por quadro (narrowphase N·M e leitura da pose a cada quadro).

## Convenção de logs

- Cada smoke usa prefixo `[<nome>]` no console (e.g. `[stress] frame 600: …`).
- O DOM `#log` (textarea no `index.html`) recebe os mesmos logs para captura
  visual.
- Ao final, `… SMOKE PASSED` (verde) ou um `FAIL: …` que dispara `throw`.
