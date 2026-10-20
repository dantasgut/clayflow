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

## `giNoise` no estado de partida (T002)

| Caso             | Viés por face (pior) | Manchas | Cintilação |
| ---------------- | -------------------- | ------- | ---------- |
| `cornell-high`   | 7,92 %               | 8,80 %  | 1,22 %     |
| `cornell-medium` | 17,88 %              | 19,74 % | 2,81 %     |
| `window-high`    | 8,60 %               | ≤ 2 %   | ≤ 1 %      |
| `window-medium`  | 9,71 %               | 3,41 %  | 1,31 %     |

`fogWalk`: cintilação ≤ 1 %; periodicidade na escala do froxel 350,9× a de ruído sem estrutura (L7 confirmado).

## Depois da Fase 2 (prontidão, medida de GPU por quadro, marcações por camada)

Smokes no fonte (35 com `readiness`, `gpuTiming`, `deviceFloor` e `giNoise`): 28 passam; falham as 5 herdadas, o
`giNoise` (nasceu vermelho, US3) e o `fluidField`, que passou a medir de verdade:

| Medida                                     | Antes (leituras repetidas, CPU à frente) | Depois (uma leitura por quadro, no ritmo da GPU) |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------------------ |
| `fluidSurface` desempenho                  | 19,36 ms, falhava                        | 12,67 ms com 90 leituras distintas, passa        |
| `nodeGraphs` (a) custo do grafo            | 0,363 × 0,237 ms, falhava                | 0,385 × 0,369 ms, passa                          |
| `fluidField` campo + marcha da água a 64 k | passava (medida quebrada)                | 10,27–10,57 ms contra 2,5 ms — falha real        |
| `gpuTiming` (cômodo com GI `medium`, 720p) | —                                        | 180 de 180 quadros medidos; Flows cobrem 100 %   |

O custo da água pelo campo é desempenho do motor (registrado na 034 com H3, T068), não critério.

A captura do quadro no Xcode (árvore fase → Flow → passe) é manual: fica para o usuário conferir com a ferramenta de
captura do Metal; os grupos de depuração estão em toda gravação.

## Vídeos do estado de partida (T023)

Gravados pela ferramenta nova (`npm run video`, H.264 CRF 8, direto da GPU), 1280 × 720, enviados ao usuário: lente,
dispersao, agua, causticas, cornell, dia, nevoa, pano. Fidelidade (SC-010) nas cenas mais difíceis: Cornell brilho
52,79 dB e RGB contra o exato em 4:2:0 49,50 dB; água 53,04 / 48,69 dB; dispersão 61,05 / 56,97 dB; lente em 10 bits
60,58 / 57,95 dB. Falha forçada (cena inexistente): mensagem nomeando a cena e 0 processos órfãos.
