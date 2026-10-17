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
  54,0). Log completo: [bench-start.log](./bench-start.log). O fechamento da 033 compara contra estes números (as cenas
  sem iluminação global não podem piorar além deles) e regrava o baseline.
