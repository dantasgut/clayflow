# Estado de partida da 034 (T002–T004)

Máquina: Linux, RTX 4090 (perfil `nvidia-lovelace`), Chrome com Vulkan, X11, smokes com janela. Build: `3a5ad835`
(merge da 033) mais as fixtures `nvidia-lovelace`, as flags do Chrome no Linux e o `npm run video` da validação.

## `npm run ci`

1 falha: `src/elements/fields/reference/__tests__/field.test.ts` estoura 5 s com coverage (S4); 1674 de 1675 testes
passam.

## Smokes (validação de 2026-10-18, fonte e `--dist`)

26 de 31 passam. Falham `extensionPoints` (xadrez, olho de peixe), `fluidSurface` (cáusticas agitadas 1,26×; 0 amostras
de GPU), `nodeGraphs` (caixa 181), `parametricSurfaces` (lago; `animated` na primeira taxa) e `softSurface` (pano) —
ver a análise, S1–S3.

## Smokes novos (medida de antes)

| Smoke         | Caso                     | Antes                                                                  | Critério         |
| ------------- | ------------------------ | ---------------------------------------------------------------------- | ---------------- |
| `giNoise`     | `window` (manchas)       | 1,55 % — 1,36× a referência sem gather de tela (1,13 %); a 10 s 1,68 % | ≤ 1,1× (SC-001)  |
| `giNoise`     | `window` (entre quadros) | 0,663 %                                                                | ≤ 0,1 % (SC-001) |
| `giNoise`     | `window` (convergência)  | 0,44 % do valor a 10 s                                                 | ≤ 2 % (SC-001)   |
| `causticFlux` | `floor` (y = 0)          | 0,494× a transmitância de Fresnel (previsto pela análise: 0,5×)        | ±5 % (SC-003)    |
| `causticFlux` | `offset` (¼ de célula)   | 0,615× (previsto: (1 − ¼)² + (¼)² = 0,625×)                            | ±5 % (SC-003)    |
| `causticFlux` | `ramp` (30°)             | 0,665×                                                                 | ±5 % (SC-003)    |

## Tempo por passe

Fica para a fase 6: o profiler perde as leituras com a CPU à frente (S3) e o bench está preso a 60 FPS com a GPU em
clock baixo (V3). Os tempos da 033 medidos por repetição na validação: GI 2,19 ms (`--dist` 2,18), névoa 0,24 ms,
água a 64k 1,39 ms.

## Depois (US1, US2 — 2026-10-19)

| Smoke                | Caso                        | Depois                                                        |
| -------------------- | --------------------------- | ------------------------------------------------------------- |
| `giNoise`            | `window` (manchas)          | 0,83× a referência (16 raios de tela + guia no `medium`)      |
| `giNoise`            | `window` (entre quadros)    | 0,100 % (média de 10 pares)                                   |
| `giNoise`            | `window` (convergência)     | 0,13 %                                                        |
| `causticFlux`        | `floor` / `offset` / `ramp` | 97,9 % / 97,9 % / 96,9 % da transmitância de Fresnel          |
| `globalIllumination` | Cornell (pior região)       | 6,1 % (era 6,5 %)                                             |
| `globalIllumination` | orçamento (`medium`)        | 2,67 ms (era 2,19 ms; 16 raios de tela, decisão do usuário)   |
| `globalIllumination` | cáusticas                   | foco 14,79× o chão aceso (era 7,24×: o 0,5× do chão em y = 0) |
