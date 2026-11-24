# Data Model: Nuvens volumétricas (spec 041)

## CloudLayer (Resource, C3)

Uma por cena; exige um `Sky` (o planeta, o sol, as tabelas). Sem ela, nada das nuvens existe.

| Campo de autoria  | Tipo                                                     | Padrão                          | Validação                            |
| ----------------- | -------------------------------------------------------- | ------------------------------- | ------------------------------------ |
| `base`            | m acima do chão                                          | 1500                            | ≥ 0                                  |
| `top`             | m acima do chão                                          | 4000                            | > `base`                             |
| `coverage`        | número em [0, 1] ou `CloudCoverageFunction` (grafo/WGSL) | 0,5                             | número fora de [0, 1] → `RangeError` |
| `type`            | [0, 1] (0 estrato, 0,5 cúmulo, 1 cúmulo-nimbo)           | 0,5                             | [0, 1]                               |
| `density`         | extinção na densidade 1 (1/m)                            | 0,04                            | > 0                                  |
| `albedo`          | [0, 1]                                                   | 0,99                            | [0, 1]                               |
| `dropletDiameter` | µm                                                       | 20                              | [5, 50] (a faixa do ajuste de J&dE)  |
| `wind`            | vetor horizontal (m/s)                                   | [5, 0]                          | finito                               |
| `shape`           | `CloudShapeFunction` (grafo/WGSL)                        | o grafo padrão de Perlin-Worley | —                                    |
| `shapeScale`      | m por período do volume de forma                         | 12000                           | > 0                                  |
| `detailScale`     | m por período do volume de detalhe                       | 1800                            | > 0                                  |

| `weather`         | `CloudWeatherValues` (R19)                               | — (sem o tempo)                 | ver a tabela do tempo                |

**O tempo** (`weather`, R19; com ele, `coverage` é um número — o tempo bom —, `type` e `top` são os do tempo bom e a
casca vai da base à tropopausa):

| Campo        | Tipo                                                     | Padrão          | Validação                         |
| ------------ | -------------------------------------------------------- | --------------- | --------------------------------- |
| `pressure`   | `CloudPressureFunction` (grafo/WGSL do `cloud_pressure`) | o padrão        | — (só na criação)                 |
| `latitude`   | graus                                                    | 45              | [−90, 90]                         |
| `scale`      | m (lado das células do padrão; o estêncil é `scale/64`)  | 1 500 000       | > 0                               |
| `amplitude`  | Pa (as baixas do padrão a 45°)                           | 1200            | ≥ 0                               |
| `lifetime`   | s (vida de um sistema do padrão)                         | 172 800         | > 0                               |
| `friction`   | 1/s (atrito linear da camada limite)                     | 6·10⁻⁵          | > 0                               |
| `formation`  | s (tempo de formação das nuvens)                         | 1200            | > 0                               |
| `tropopause` | m acima do chão (o topo da casca)                        | 11 000          | > `top`                           |
| `seed`       | inteiro (o padrão)                                       | 0               | [0, 2³²)                          |
| `shear`      | × o vento da camada (o vento da alta troposfera: a bigorna) | 2,5          | ≥ 0                               |

Com o tempo, a cobertura por função é `RangeError` (o tempo dita a cobertura). `layer.weather = {…}` (parcial) liga ou
ajusta no quadro seguinte; `undefined` desliga.

**Dado empacotado** (uniforme `CloudParams`): raios das cascas (km, do planeta do `Sky`), cobertura global, tipo,
extinção, albedo, os quatro parâmetros da fase (calculados do diâmetro), deslocamentos do vento (forma, detalhe,
cobertura; reduzidos módulo o período em f64), escalas, as matrizes da sombra e do quadrado de cobertura, os valores do
perfil (passos, oitavas, frações), o quadro de Bayer, a revisão das funções; o tempo (R19): `weather` (f, atrito
livre 10⁻⁵, atrito da camada limite, τ), `weatherPattern` (lado das células, amplitude das baixas na latitude, teto das
altas, vida), `weatherMap` (topo do tempo bom como fração da casca — 1 sem o tempo —, texels, lado, estêncil),
`weatherFlags` (ligado, slot da função de pressão, histórico do estado válido, semente).

**Descritores** (todos `allocation: 'onDemand'`):

| Id           | Papel      | Formato / tamanho                    | Série 037                                 |
| ------------ | ---------- | ------------------------------------ | ----------------------------------------- |
| `shape`      | textura 3D | `rgba8unorm` 128³                    | não (refeita só com a revisão)            |
| `detail`     | textura 3D | `rgba8unorm` 32³                     | não                                       |
| `coverage`   | textura 2D | `rgba8unorm` 512²–1024² (R: cobertura, G: tipo, B: densidade, A: topo local, R19) | não (inteiro a cada quadro) |
| `ambient`    | textura 2D | `rgba16float` 2 × 1                  | não (refeita a cada quadro)               |
| `shadow`     | textura 2D | `rgba16float` 512² (perfil)          | sim (`depth: 2`, `filtered`)              |
| `march`      | textura 2D | `rgba16float` ¼ da tela              | sim (`depth: 2`, `filtered`)              |
| `marchDepth` | textura 2D | `r32float` ¼ da tela                 | sim (`depth: 2`)                          |
| `view`       | textura 2D | `rgba16float` tela cheia (aumentado) | não                                       |
| `panorama`   | textura 2D | `rgba16float` 256 × 128 (perfil)     | sim (`depth: 2`, `filtered`)              |
| `weather`    | textura 2D | `rgba32float` 128² (R19)             | sim (`depth: 2`; o estado do tempo)       |
| `weatherWind`| textura 2D | `rgba16float` 128² (R19)             | não (o vento, a subida, a frente)         |

**Estados**: `Uninitialized` → `Ready` quando os volumes estão completos (prontidão da 034: a cena não é dada como
pronta antes). Mudar `shape` ou `shapeScale`/`detailScale` sobe a revisão: os volumes são refeitos por fatias e,
até terminarem, a marcha usa os anteriores (sem buraco). Mudar `coverage`, `type`, `wind` vale no quadro seguinte sem
recompilar. Mudar o perfil do `Renderer` realoca os alvos (as séries recomeçam pela invalidação do canal).

## Sky (acréscimos, C3)

Descritor novo `aerial`: textura 3D `rgba16float` 32 × 32 × 32 (luz espalhada rgb e transmitância média da câmera até
cada fatia; fatias quadráticas até 32 km), escrita pelo `SkyFlow` a cada quadro, `allocation: 'onDemand'` (só com o
`SkyCompositeFlow`). Não é série temporal (recalculada inteira a cada quadro). Lida pelo `SkyCompositeFlow` em toda a
geometria da cena e pelo `CloudFlow` na profundidade das nuvens.

## CloudShapeFunction / CloudCoverageFunction (ExtensionFunction, C3)

- `cloud_shape`: `fn shape_fn(p: vec3f, data: ShapeFnParams) -> vec4f` — `p` em [0, 1)³ do volume (periódico); devolve
  os quatro canais do volume (R: base, G/B/A: erosão em três frequências). Usada também para o volume de detalhe com
  `p` na escala dele (os três primeiros canais).
- `cloud_coverage`: `fn coverage_fn(xz: vec2f, time: f32, data: CoverageFnParams) -> vec3f` — cobertura, tipo e densidade
  relativa no ponto horizontal (m, mundo) e no tempo simulado.

Resultados não finitos viram 0; valores fora de [0, 1] são saturados.

## CloudPressureFunction (ExtensionFunction, C3; R19)

- `cloud_pressure`: `fn pressure_fn(xz: vec2f, time: f32, data: PressureFnParams) -> f32` — a anomalia de pressão (Pa)
  no ponto horizontal (m, no referencial que anda com o vento de condução; leste = +x, norte = −z) no tempo simulado.
  Resultado não finito vale 0. Sem função, o padrão de sistemas (`cloud_pressure_default.wgsl`).

## Estado do tempo (R19)

Quadrado de 128² texels centrado na câmera (o lado do mapa de cobertura; o centro encaixado no texel, calculado no
shader pela vista e pela vista anterior). `weather` (série da 037, 32 bits): `rgb` = cobertura pedida, tipo, topo
(fração da casca), relaxados para o alvo com `e^(−Δt/τ)` a partir da fatia anterior trazida pelo vento das nuvens
(semi-Lagrangiano). `weatherWind`: `xy` = vento das nuvens (m/s, x e z do mundo; o equilibrado mais o de condução),
`z` = subida no topo da camada limite (m/s), `w` = frente [0, 1]. O mapa de cobertura com o tempo é escrito pelo estado
(com as células de cúmulos por cima; o canal A, o topo local); a borda cede ao tempo bom.

## Panorama das nuvens

Latitude-longitude da esfera vista da posição da câmera no momento da série; o texel guarda a luz espalhada (rgb) e a
transmitância (a). Recomeça (invalidação do canal) quando a câmera se afasta mais de ¼ da espessura da camada da
posição de origem.

## Mapa de transmitância visto do sol

Projeção ortográfica do sol centrada na câmera, encaixada no texel. Texel: `x` = profundidade da frente da nuvem ao
longo do sol (m), `y` = extinção média (1/m), `z` = profundidade ótica máxima. Lido como
`T(p) = exp(−min(z, y · max(0, d(p) − x)))`. Fora do mapa: a transmitância pela cobertura global da camada (a média).

## Histórico (séries temporais da 037)

`march`, `marchDepth`, `scatter`, `scatterSun` e, com o tempo, `weather`: anel de duas fatias, lidas pelo atraso 1. A invalidação do
canal no corte de câmera, na recriação do alvo e na mudança de perfil recomeça a série; nenhum Flow guarda quadro
anterior por conta própria.

## Contribuições a pontos de cena

| Ponto                | Ordem | Quando               | O que faz                                                                         |
| -------------------- | ----- | -------------------- | --------------------------------------------------------------------------------- |
| `light_transmission` | 25    | `CloudLayer` e `Sky` | Para a luz do sol do `Sky`: × `T(p)` do mapa de transmitância; as outras luzes: 1 |
| `sky_cover`          | 0     | `CloudLayer` e `Sky` | O panorama na direção: (luz espalhada, transmitância)                             |

O `Sky` passa a ler `sky_cover` na contribuição a `scene_environment` (`sky_radiance · a + rgb`); sem contribuinte, o
ponto não entra no módulo e o WGSL gerado é o de hoje.
