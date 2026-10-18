# Estado de partida (T001) — 2026-10-17, branch `feature/033-global-illumination` sobre a `develop` (PR #47 da 011)

- `npm run ci`: verde — 205 arquivos, 1599 testes; lint, format, madge, knip, tsc, cobertura, doc-coverage e build.
- Smokes `--headless` no código-fonte e com `--dist` (26), o mesmo resultado nos dois:
  - **Aprovados (18):** bigMesh, churn, computeKernels, contactSet, fluidBehavior, hdr, integration, lighting, limits,
    materials, multiApp, rigidContacts, scale1m, shaderLibrary, stress60s, time, trajectories, transforms.
  - **Reprovados (8), pendências da 011 (fixtures de imagem da fase 10 e medidas que mudaram com o HDR):**
    extensionPoints (xadrez sem trocas, olho de peixe, estados ≠ fixture), fluidSurface (pixels ≠ fixture, cáusticas
    só 1,26×), nodeGraphs (c: cor da caixa), parametricSurfaces (cáusticas do lago, estados ≠ fixture), particles,
    pointCloud, render (pixels ≠ fixture), softSurface (o pano não aparece, pixels ≠ fixture).
  - Nenhum Chrome/crashpad órfão do runner depois das duas rodadas.
- `npm run bench:check` (perfil `apple-metal-3-chrome155-macos-1280x720`, baseline da 010, commit fe1f188, tolerância
  10 %): **regressões** em quase todas as cenas, vindas do código da 011 já mesclado (alvos HDR, resolve por amostra,
  avaliação do fechamento) — o `bench:check` e o baseline da 011 estavam pendentes. Exemplos (GPU ms, baseline →
  agora): instances/100k 0,35 → 0,98; surfaces/wave-uniform 0,45 → 1,36; particles/64k-water 15,63 → 20,91 (p99 17,4 →
  54,0). Log completo: [bench-start.md](./bench-start.md). O fechamento da 033 compara contra estes números (as cenas
  sem iluminação global não podem piorar além deles) e regrava o baseline.

# Fechamento (T068) — 2026-10-18

`npm run bench:check` contra o estado de partida acima: as cenas sem iluminação global não pioram além dele. Duas
regressões apareceram no caminho e foram corrigidas antes do baseline:

- **Passe de profundidade em toda cena.** Dobrava o trabalho dos vértices onde o sombreamento é barato
  (instances/1m 2,31 → 4,99 ms; unique-objects/1k com 2001 desenhos). Agora vale só com a luz rebatida: os
  `FrameTargets` guardam o passe e os estágios padrão o ligam pelo evento da `GlobalIllumination` (`a52a3d8`).
- **Grades da névoa alocadas sem névoa.** +43 MB em todas as cenas; agora sob demanda (`7f5605d`).

GPU (ms) e memória (MB), partida → fechamento (o baseline novo):

| Cena                                | GPU                               | Memória                    |
| ----------------------------------- | --------------------------------- | -------------------------- |
| instances/10k                       | 0,67 → 0,69                       | 28,2 → 28,6                |
| instances/100k                      | 0,98 → 0,68                       | 52,7 → 53,1                |
| instances/1m                        | 2,31 → 2,32                       | 248,7 → 249,1              |
| instances/10k-moving                | 0,64 → 0,64                       | 28,2 → 28,6                |
| instances/10k-functions             | 0,79 → 0,30                       | 28,4 → 28,9                |
| unique-objects/1k                   | 1,02 → 1,02                       | 37,0 → 37,4                |
| rigid-bodies/1k, 10k                | 2,04 → 2,08; 3,01 → 3,03          | 31,6 → 32,0; 111,9 → 112,4 |
| particles/4k, 64k                   | 2,21 → 2,23; 13,75 → 13,59        | 60,0 → 60,5; 66,2 → 66,6   |
| particles/4k-water                  | 3,46 → 2,98                       | 107,4 → 104,3              |
| particles/64k-water                 | 20,91 → 20,19 (p99 53,97 → 52,77) | 113,6 → 213,6              |
| particles/64k-cohesion, 64k-terrain | 18,50 → 18,27; 15,61 → 15,59      | 66,2 → 66,6; 69,8 → 70,3   |
| surfaces/wave-uniform, adaptive     | 1,36 → 1,35; 1,32 → 1,32          | 28,2 → 28,6; 38,0 → 38,4   |
| graph-geometry/static, live         | 0,68 → 0,69; 1,46 → 1,52          | 85,2 → 85,6                |

A água a 64 mil usa +100 MB: os buffers do campo de distância (blocos com borda, densidade, φ) dimensionados pelas
partículas — a superfície por campo da US7 no lugar da reconstrução na tela da 017.

Iluminação global (cena `global-illumination`, 1 milhão de triângulos animados, sol, céu):

- Pelo bench: `off` 1,65 ms, `medium` 4,42 ms de GPU por quadro (diferença 2,77 ms). Neste hardware o tempo de GPU do
  quadro repete leituras velhas e oscila em patamares (pendência H1).
- Pelo smoke `globalIllumination` (`budget`, repetição do trabalho no mesmo app com relógio de parede): **3,67 ms** a
  1280 × 720 — kernels 3,42 ms + desenho por pixel 0,24 ms. Orçamento 4 ms.

Baseline regravado: `bench/baselines/apple-metal-3-chrome155-macos-1280x720-ifpfky.json` (23 resultados).
