# Estado de partida da 034 (T001)

Apple M4 (`apple-metal-3`), Chrome 155, `feature/034-refracao-fisica` com o código do `develop` `3a5ad83`,
2026-10-20.

## `npm run ci`

Verde.

## Smokes (31) — fonte e `--dist`

26 passam; as mesmas 5 falham no fonte e no `--dist`, todas herdadas (H1, H4, H5):

| Smoke                | Falha                                                                                                                              | Pendência |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `extensionPoints`    | xadrez com 0 trocas; olho de peixe curva 3,34 px (> 4 pedidos); hashes de estado `material/*` e `fisheye/*` divergem do manifest   | H4        |
| `fluidSurface`       | cáusticas agitadas 1,29× (≥ 1,3×); GPU 19,36 ms > 16,7 ms (medida com leituras repetidas)                                          | H5, H1    |
| `nodeGraphs`         | (a) grafo mais caro 0,363 × 0,237 ms (medida de GPU, H1); (c) cor da caixa 181 difere 109 de 255                                   | H1, H4    |
| `parametricSurfaces` | lago: 63 px mais claros e 35 mais escuros (2 % da água pedidos); hashes `lake/image`, `curvatureMaterial/image`, `adaptive/sphere` | H4        |
| `softSurface`        | `xpbd-cloth`: o corpo não aparece (46/189 px)                                                                                      | H4        |

## `npm run bench:check` (baseline `7f5605d`, perfil `apple-metal-3-chrome155-macos-1280x720-ifpfky`, tolerância 10 %)

Reprovado, herdado:

| Cena                  | Variante    | Métrica     | Baseline | Atual    | Δ       |
| --------------------- | ----------- | ----------- | -------- | -------- | ------- |
| `particles`           | 64k-terrain | frameMs.p99 | 37,83 ms | 43,92 ms | +16,1 % |
| `global-illumination` | off         | cpuMs       | 0,16 ms  | 0,20 ms  | +29,0 % |

Melhorias acima da tolerância: `instances/10k` CPU −16,7 %; `instances/10k-functions` p95 −33,4 %, p99 −15,1 %;
`surfaces/wave-uniform` CPU −10 %; `surfaces/wave-adaptive` CPU −60,8 %.

## Manchas da luz global (medida da spec, página temporária)

Ver a tabela do Contexto da spec; vira o smoke `giNoise` (T002).
