# Estado de partida (T001) — 2026-10-16, branch `feature/011-hdr-pbr` sobre a `develop` (7fa2e12, PR #46 da 031)

- `npm run ci`: verde — 193 arquivos, 1506 testes; lint, format, madge, knip, tsc, cobertura, doc-coverage e build.
- Smokes `--headless`, todos aprovados no código-fonte e com `--dist` (23): bigMesh, churn, computeKernels, contactSet,
  extensionPoints, fluidBehavior, fluidSurface, integration, limits, multiApp, nodeGraphs, parametricSurfaces,
  particles, pointCloud, render, rigidContacts, scale1m, shaderLibrary, softSurface, stress60s, time, trajectories,
  transforms.
- Bench: a referência é o baseline de `bench/baselines/` (regravado na 010 e conferido pelo `bench:check` no fechamento
  da 031, sem regressão). Uma rodada de partida nesta branch foi interrompida e descartada: o bench serve o
  código-fonte, que já estava sendo alterado. O custo do HDR (meta ≤ 0,3 ms a 1280×720 com MSAA 4×) é medido no
  fechamento (T110) contra esse baseline.
- Fixtures: as de imagem e de estado da `develop`. As de imagem são regravadas uma vez na fase 10; as de estado ficam
  bit a bit.
