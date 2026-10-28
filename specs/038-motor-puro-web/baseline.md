# Linha de base da spec 038 (T001)

Medida em 2026-10-28 no commit `2f710aff` (o início da `feature/038-motor-puro-web`), Apple M4 Max, Chrome headless
pelo runner, `--timeout 900`. Critério da spec (FR-011, SC-004): no fim, o mesmo — o que passa continua passando com os
mesmos números e imagens; o que falha falha com as mesmas mensagens (nenhuma falha nova).

## Sem GPU

- `npm test`: 236 arquivos, 1851 testes, todos passando.
- `tsc --noEmit`: limpo.
- `eslint src bench`: 0 erros no código commitado (os 11 erros do momento são de arquivos fora do commit: `zz*` e
  `bench/page/agua.ts`).

## Smokes (42)

Passam (27): `adapterLimits`, `bigMesh`, `caustics`, `churn`, `computeKernels`, `contactSet`, `energy`, `gpuTiming`,
`hdr`, `integration`, `lighting`, `limits`, `multiApp`, `particles`, `pointCloud`, `readiness`, `render`,
`rigidContacts`, `scale1m`, `shaderLibrary`, `sky`, `softEnergy`, `stress60s`, `time`, `trajectories`, `transforms`,
`wetting`.

Falham (15), com as mensagens:

| Smoke                | Mensagem (resumo)                                                                                                                                                                                                                | Origem                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `antialiasing`       | rastro 1,66 % (≤ 1 %); órbita 3,14 % na pose 3 (≤ 3 %); sprites 86,96 % (≥ 90 %); `waterOrbit` clara 3,29–3,92 %, turva 3,68–4,21 % (≤ 3 %)                                                                                      | 034 (água pela refração, paredes de vidro)             |
| `deviceFloor`        | `gi_trace`: 11 buffers de storage > 10                                                                                                                                                                                           | 034 T067c (limite da GI, decisão pendente)             |
| `extensionPoints`    | xadrez 0 trocas; olho de peixe 3,34 px; quatro estados ≠ fixture                                                                                                                                                                 | antes da 034 (`ce8a67a6`)                              |
| `fluidBehavior`      | a poça não cresce com a adesão (0,0813; 0,2156; 0,2156); três estados ≠ fixture                                                                                                                                                  | 034 T066a                                              |
| `fluidField`         | página bloqueada > 30 s; depois "Failed to acquire GPUAdapter"                                                                                                                                                                   | 034 (custo da água)                                    |
| `fluidSurface`       | continuidade 2559 px de buraco; fixtures diferentes (dam-opaque, sph, pbf, mpm, layer-15cm, caustics, submerged-box, coexistence); água parada 45,9 %; desligadas não reduzem; fora da água 345 px; sprites 29 px; GPU 427,86 ms | 034 (cena do tanque com vidro, fixtures de 2026-10-26) |
| `fog`                | vidro dentro 65,55 % (≤ 3 %); `caustics_targets` não compila com a névoa: `ray_volume_transmittance` com 4 argumentos, a da névoa tem 3                                                                                          | 034 T067c (regressão)                                  |
| `giNoise`            | viés por face 6,6–19,7 % (≤ 5 %); manchas até 19,74 % (≤ 2 %); cintilação até 3,1 % (≤ 1 %); periodicidade do froxel 578× (≤ 3×)                                                                                                 | 033/034                                                |
| `globalIllumination` | `gi_trace`: 11 > 10                                                                                                                                                                                                              | 034 T067c                                              |
| `materials`          | transmissão e translucidez (seis itens)                                                                                                                                                                                          | antes da 034 (T045)                                    |
| `nodeGraphs`         | cor da caixa difere 109                                                                                                                                                                                                          | antes da 034                                           |
| `parametricSurfaces` | nível do lago varia 2,76 cm; o lago sem cáusticas (0 px); dois estados ≠ fixture                                                                                                                                                 | 034 (T066, T067)                                       |
| `rayScene`           | `whenReady` sem ficar pronto: refração esperando `cameras`                                                                                                                                                                       | 034                                                    |
| `refraction`         | `gi_trace`: 11 > 10 (os casos sem GI passam antes dele)                                                                                                                                                                          | 034 T067c                                              |
| `softSurface`        | o pano não aparece (46/189 px)                                                                                                                                                                                                   | antes da 034                                           |

Nenhum processo de GPU em estado `E` nem órfão em toda a rodada.

## Vídeos (T002)

Cada cena gravada duas vezes pelo motor (60 quadros, FFV1 sem perda; os vídeos em `bench/results/baseline-038/a` e `b`,
fora do repositório). Por cena, em `baseline/`: o `framemd5` da primeira gravação e o PSNR por quadro entre as duas
(`<cena>.psnr`, o arquivo de estatística do ffmpeg). Critério da migração (SC-003, decisão do usuário de 2026-10-28):
por quadro, o PSNR app × gravação `a` não fica abaixo do PSNR `a` × `b`.

| Cena               | PSNR a × b mínimo / mediano / máximo (dB) |
| ------------------ | ----------------------------------------- |
| `lente`            | 30,56 / 38,81 / 41,29                     |
| `dispersao`        | 31,00 / 74,21 / 89,85                     |
| `agua`             | 52,50 / 58,69 / 63,70                     |
| `molhar`           | 27,13 / 31,07 / 42,11                     |
| `causticasvidro`   | 42,29 / 44,99 / 46,63                     |
| `causticas`        | idênticas (∞)                             |
| `pendparada`       | 54,71 / 56,28 / 58,65                     |
| `pendagitada`      | 52,53 / 57,31 / 62,01                     |
| `pendagitadasem`   | 28,95 / 33,86 / 41,90                     |
| `pendcoexistencia` | 32,81 / 35,43 / 36,73                     |
| `penddentro`       | 22,36 / 31,49 / 60,28                     |
| `cornell`          | 32,57 / 46,17 / 50,10                     |
| `dia`              | 110,79 / ∞ / ∞                            |
| `sprites`          | 28,96 / 31,92 / 36,46                     |
| `pano`             | idênticas (∞)                             |

Sem linha de base (não montam no código de partida, pendências da 034): `ondulacao` e `natureza` (o limite de buffers da
GI) e `nevoa` (a névoa com as cáusticas).
