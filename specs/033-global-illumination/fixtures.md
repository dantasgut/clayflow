# Fixtures da 033 (T063, SC-011)

Referência: as imagens que o `develop` (693aed4, antes da 033) produz hoje, gravadas no mesmo dispositivo
(`apple-metal-3`) com `--record`. As fixtures commitadas no `develop` já divergiam dessa saída em todos os pixels nos
smokes `render`, `pointCloud`, `particles` e `softSurface`: são de antes da 011 (HDR e mapeamento de tons) e não foram
regravadas lá. Por isso a comparação abaixo é contra a saída do `develop`, não contra os arquivos dele.

Montagens: `fixtures/<nome>.png` = `develop` | 033 | diferença × 8 (vermelho).

## Idênticas ao `develop` (bit a bit)

Regravadas só para alinhar o arquivo à saída do `develop`. A 033 não muda nenhum pixel destas:

| Fixture                                                                        | Pixels diferentes do `develop` |
| ------------------------------------------------------------------------------ | ------------------------------ |
| `particles-sph`, `particles-pbf`, `particles-mpm-fluid`, `particles-mpm-solid` | 0                              |
| `pointCloud`                                                                   | 0                              |
| `softSurface-fem-sprites`                                                      | 0                              |
| `parametricSurfaces-curvature`                                                 | 0                              |

Os estados por hash também ficaram iguais aos do `develop`: `extensionPoints` (material, olho de peixe),
`parametricSurfaces` (curvatura e esfera adaptativa). As trajetórias físicas (`trajectories`, `contactSet`,
`fluidBehavior`) passam contra as fixtures commitadas, sem regravar.

## Mudam com a 033

| Fixture                                        | Pixels diferentes (de 49 152) | Por quê                                                                                                                                                                                                                 |
| ---------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render-forward`, `render-post-*`, `render-ui` | 418–1122, máx. 8–28 níveis    | Só nas bordas das sombras: o viés da sombra passou a ser em texels, com deslocamento pela normal (`d442449`, o conserto das arestas que brilhavam). O desfoque, o bloom e o FXAA espalham a mesma borda por mais pixels |
| `softSurface-xpbd-cloth`                       | 802, máx. 24                  | A mesma mudança da sombra: a borda da sombra do pano no chão e a sombra própria nas dobras                                                                                                                              |
| `parametricSurfaces-lake`                      | 22 306 de 64 000, máx. 83     | A água vira a superfície contínua do campo de distância (US7) no lugar das esferas suavizadas da 017: a margem e a superfície aparecem nítidas                                                                          |
| `fluidSurface-*`                               | todas                         | Regravadas na US7 (`7c8aa06`) e na correção da água (`d442449`): a superfície por campo de distância                                                                                                                    |

Montagens: `fixtures/render-forward.png`, `fixtures/softSurface-xpbd-cloth.png`, `fixtures/parametricSurfaces-lake.png`.

## Determinismo

Ao gravar, o lago saiu diferente em duas execuções. Na base era determinístico. Duas causas, as duas no campo dos
fluidos:

- **A cópia ordenada lia índices velhos.** A grade hash deixa de fora as partículas mortas (`w < 0`), mas a cópia na
  ordem das células percorria todas as partículas. No fim da lista, lia índices de quadros anteriores, e partículas
  vivas saíam repetidas no lugar das mortas conforme a ordem dos atômicos. No lago, as mortas são as partículas
  retiradas abaixo do terreno. Agora a cópia (`field_sort.wgsl`) marca como mortas as posições além do total de vivas
  da grade.
- **O nível da superfície se ajustava em todo quadro desenhado.** Isso valia também com a simulação parada
  (`step(0)`), e a imagem dependia de quantos quadros foram desenhados antes. Agora o nível só se ajusta quando a
  simulação dá passos (`FluidFieldParams.motion`).

Diagnóstico: as posições do pool da física eram iguais nas duas execuções, e as copiadas pelo campo não (2 e 3
repetidas). Depois da correção, a gravação passa na conferência de determinismo do smoke.

## O que continua falhando (anterior à 033)

Tudo isto falha igual no `develop` (pendência H4 em `specs/PENDENCIAS.md`):

- `parametricSurfaces`: "cáusticas: só N px mais claros na água" no lago. Pede mais de 2 % da água 15 % mais clara
  que sem cáusticas; o `develop` dá 21 px, a 033 dá 63. Com essa falha o smoke não grava a fixture de estado
  (`parametricSurfaces-*.json`), então os hashes do lago, da curvatura e da esfera adaptativa seguem os antigos.
- `softSurface`: "xpbd-cloth: o corpo não aparece (46/189 px)".
- `extensionPoints`: o xadrez do material não aparece; o olho de peixe não curva a fileira.
- `nodeGraphs`: a cor da caixa 181 difere do valor dela.
- `fluidSurface`: cáusticas agitadas 1,29× (limiar 1,3×).
