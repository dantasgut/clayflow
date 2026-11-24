# Estado de partida da 013

`develop` 9b01c88b (com a 011 e as correções de sombra do #54), 2026-11-24, Apple M4, Chrome headless.

## Rodado

- `tsc`, `lint` (0 erros), `format:check` e o Vitest (2377 testes) verdes no fechamento do #54.
- Smoke `lighting` inteiro: passa.
  - `penumbra`: θ 0,00466 → 1,8 %; θ 0,02 → 12,3 % (limite 15 %); θ 0,05 → 1,6 %; borda dura 2,89 mm.
  - `sun-travel`: 0,0000 % nos casos de 0,36° e 0,02° por quadro; 0,0018 % e 0,0123 % nos de 0,002° (origem e longe).
- Smokes `nodeGraphs` e `materials` (`subsuperficie`, `madeira-pinho`, `madeira-macica`): passam (rodados no #54).

## Não rodado

`sky`, `clouds`, `fog`, `globalIllumination`, `refraction`, `parametricSurfaces`, `antialiasing`, `render`, `rayScene` e o
`materials` inteiro: a execução foi barrada pelo modo de permissão da sessão (2026-11-24, duas tentativas). Continuam
sem resultado depois do #54. Ficam para a bateria de fechamento (T049), com autorização do usuário.

## Por medir

- O tempo de GPU da sombra numa cena de uma luz, parada e girando (o `sun-travel` não imprime o tempo): entra com o
  caso `shadow-timing` (T045), medido antes de a fase 2 mudar o caminho.

## Buffers de storage por estágio (T002)

Medido pela composição real da C2 (o layout conferido em `flowBinding/limits.ts`, o mesmo do teste
`bindingCounts.test.ts`), com o núcleo de teste, uma `DirectionalLight` com `castShadow`, os estágios padrão e uma
caixa com `StandardMaterial`; 2026-11-24, antes da fase 2. O teto do piso de referência é 10 por estágio.

| Cena                              | forward (desenho de cor) | forward (profundidade) |
| --------------------------------- | ------------------------ | ---------------------- |
| só a luz com sombra               | 6                        | 4                      |
| + material por função (vidro)     | 7                        | 4                      |
| + `GlobalIllumination`            | 6                        | 4                      |
| + `FogVolume`                     | 7                        | 4                      |
| + material por função, GI e névoa | 8                        | 4                      |

Os seis da cena só com a luz: `pool_arena`, `pool_arena_gpu`, `shadow_atlas`, `shadow_matrices`, `draw_visible`,
`surface_diff`. A sombra ocupa dois (`shadow_atlas`, `shadow_matrices`), qualquer que seja o número de luzes.

Os estágios da sombra, na mesma cena (iguais nas cinco): `shadow_matrix` 5 (com a câmera, 6); `sp_clear_main` 3;
`sp_instances_main` 7; `sp_requests_main` 4; `sp_update_main` 4; `sp_rank_main` 2; `sp_free_main` 2;
`sp_allocate_main` 5; `sp_fill_main` 3; `sp_pairs_count_main` 3; `sp_pairs_base_main` 4; `sp_pairs_main` 4;
`sp_clusters_main` 8; `sp_cluster_box_main` 1; `shadow_bounds` 2; `shadow_depth` 6; `shadow_request` 3;
`shadow_request_clear` 1. O `forward_cull` (seleção dos desenhos, não lê a sombra) chega a 10 em `dc_phase1_main`.

## Depois da fase 2 (T015)

2026-11-24, Apple M4, Chrome headless, uma luz com sombra pelo atlas único.

- `lighting` `penumbra`: θ 0,00466 → 1,8 %; θ 0,02 → 12,3 %; θ 0,05 → 1,6 %; borda dura 2,89 mm — igual a antes.
- `lighting` `sun-travel`: 0,0000 % nos casos de 0,36° e 0,02° por quadro; 0,0018 % (origem) e 0,0123 % (longe) nos de
  0,002° — igual a antes.
- `antialiasing` `shadowEdge`: passa — degrau da borda 0,081 px RMS sem antisserrilhado, 0,047 px no temporal (cintilação
  1,87 %), 0,046 px na acumulação. Sem número de antes (o smoke não tinha sido rodado depois do #54).
- `materials` `subsurface-terminator`: passa — em n·l = −0,2, subsuperfície (0,046, 0,007, 0,000), difuso 0. Sem número
  de antes.

Buffers de storage por estágio, pela mesma medida da T002: forward 6 (só a luz), 7 (função), 6 (GI), 7 (névoa), 8 (os
três) — igual a antes; com três luzes com sombra, os mesmos. Estágios da sombra: iguais, salvo `sp_clear_main` 3 → 2,
`sp_free_main` 2 → 1, `sp_fill_main` 3 → 2 (não leem mais o referencial) e `shadow_request_clear` 1 → 2 (lê o referencial
para esvaziar só as faixas vivas). O maior segue `sp_clusters_main`, com 8.
