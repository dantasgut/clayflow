# Estado de partida (034, T001)

`develop` em `3a5ad83` (merge da 033), num worktree separado, em 2026-10-18 (Apple M4, Metal, Chrome).

## `npm run ci`

Verde: 1675 testes, cobertura 89,98 % das linhas.

## Smokes (`--headless`, fonte e `--dist`)

Falham no fonte e no `--dist`:

| Smoke                | Falha                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensionPoints`    | xadrez (0 trocas), olho de peixe (65 536 px acesos, curvatura 3,34 px), estados ≠ fixture                                                                       |
| `fluidSurface`       | cáusticas agitadas 1,29× (≥ 1,3×); desempenho 19,23 ms (média de eventos com leituras repetidas)                                                                |
| `nodeGraphs`         | caixa 181 difere 109 de 255                                                                                                                                     |
| `parametricSurfaces` | cáusticas do lago (63 px, 0,66 % da água); estados de lago, curvatura e esfera adaptativa ≠ fixture                                                             |
| `softSurface`        | `xpbd-cloth`: corpo 46 → 189 px                                                                                                                                 |
| `fluidField`         | `timing`: "leituras de GPU suficientes" e o custo (12,9 ms no fonte com a máquina ocupada; NaN no `--dist`; 2,97 ms > 2,5 ms rodando sozinho) — a medição de H1 |

`globalIllumination` e `fog` estouraram os 120 s padrão do runner com a máquina ocupada; com `--timeout 600`, sozinhos,
passam. Os demais 23 passam.

## Bench (`npm run bench:check`)

Contra o baseline gravado no fechamento da 033: regressões só em `instances/100k` (+22 % CPU e GPU) e
`instances/10k-functions` (GPU 0,30 → 0,79 ms) — ruído da máquina ocupada pelos smokes que rodavam em paralelo
(nenhuma mudança de código entre o baseline e esta medida); melhorias em `particles/64k-water` (GPU −19 %). A
comparação do fechamento da 034 é refeita com a máquina livre.
