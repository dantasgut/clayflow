# Estado de partida (T001) — 2026-10-16, branch `feature/031-node-graphs` sobre a `develop` (f5a49a1)

- `npm run ci`: verde — 172 arquivos, 1189 testes; lint, format, madge, knip, tsc, cobertura, doc-coverage e build.
- Smokes no código-fonte (`--headless`), todos aprovados: bigMesh, churn, computeKernels, contactSet, extensionPoints,
  fluidBehavior, fluidSurface, integration, limits, multiApp, parametricSurfaces, particles, pointCloud, render,
  rigidContacts, scale1m, shaderLibrary, softSurface, stress60s, time, trajectories, transforms.
- Bench: referência é o baseline regravado na 010 (`bench/baselines/`, T033 da 010); `bench:check` roda no fechamento
  (T100) contra ele.
- Fixtures: as de imagem, trajetória e manifestos da `develop` — nenhuma é regravada nesta spec (SC-005).
