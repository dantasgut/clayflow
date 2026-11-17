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

**Dado empacotado** (uniforme `CloudParams`): raios das cascas (km, do planeta do `Sky`), cobertura global, tipo,
extinção, albedo, os quatro parâmetros da fase (calculados do diâmetro), deslocamentos do vento (forma, detalhe,
cobertura; reduzidos módulo o período em f64), escalas, as matrizes da sombra e do quadrado de cobertura, os valores do
perfil (passos, oitavas, frações), o quadro de Bayer, a revisão das funções.

**Descritores** (todos `allocation: 'onDemand'`):

| Id           | Papel      | Formato / tamanho                    | Série 037                                 |
| ------------ | ---------- | ------------------------------------ | ----------------------------------------- |
| `shape`      | textura 3D | `rgba8unorm` 128³                    | não (refeita só com a revisão)            |
| `detail`     | textura 3D | `rgba8unorm` 32³                     | não                                       |
| `coverage`   | textura 2D | `rgba8unorm` 512²                    | sim (`depth: 2`; ¼ das linhas por quadro) |
| `ambient`    | textura 2D | `rgba16float` 2 × 1                  | não (refeita a cada quadro)               |
| `shadow`     | textura 2D | `rgba16float` 512² (perfil)          | sim (`depth: 2`, `filtered`)              |
| `march`      | textura 2D | `rgba16float` ¼ da tela              | sim (`depth: 2`, `filtered`)              |
| `marchDepth` | textura 2D | `r32float` ¼ da tela                 | sim (`depth: 2`)                          |
| `view`       | textura 2D | `rgba16float` tela cheia (aumentado) | não                                       |
| `panorama`   | textura 2D | `rgba16float` 256 × 128 (perfil)     | sim (`depth: 2`, `filtered`)              |

**Estados**: `Uninitialized` → `Ready` quando os volumes estão completos (prontidão da 034: a cena não é dada como
pronta antes). Mudar `shape` ou `shapeScale`/`detailScale` sobe a revisão: os volumes são refeitos por fatias e,
até terminarem, a marcha usa os anteriores (sem buraco). Mudar `coverage`, `type`, `wind` vale no quadro seguinte sem
recompilar. Mudar o perfil do `Renderer` realoca os alvos (as séries recomeçam pela invalidação do canal).

## CloudShapeFunction / CloudCoverageFunction (ExtensionFunction, C3)

- `cloud_shape`: `fn shape_fn(p: vec3f, data: ShapeFnParams) -> vec4f` — `p` em [0, 1)³ do volume (periódico); devolve
  os quatro canais do volume (R: base, G/B/A: erosão em três frequências). Usada também para o volume de detalhe com
  `p` na escala dele (os três primeiros canais).
- `cloud_coverage`: `fn coverage_fn(xz: vec2f, time: f32, data: CoverageFnParams) -> vec3f` — cobertura, tipo e densidade
  relativa no ponto horizontal (m, mundo) e no tempo simulado.

Resultados não finitos viram 0; valores fora de [0, 1] são saturados.

## Panorama das nuvens

Latitude-longitude da esfera vista da posição da câmera no momento da série; o texel guarda a luz espalhada (rgb) e a
transmitância (a). Recomeça (invalidação do canal) quando a câmera se afasta mais de ¼ da espessura da camada da
posição de origem.

## Mapa de transmitância visto do sol

Projeção ortográfica do sol centrada na câmera, encaixada no texel. Texel: `x` = profundidade da frente da nuvem ao
longo do sol (m), `y` = extinção média (1/m), `z` = profundidade ótica máxima. Lido como
`T(p) = exp(−min(z, y · max(0, d(p) − x)))`. Fora do mapa: a transmitância pela cobertura global da camada (a média).

## Histórico (séries temporais da 037)

`march`, `marchDepth`, `shadow`, `panorama`, `coverage`: anel de duas fatias, lidas pelo atraso 1. A invalidação do
canal no corte de câmera, na recriação do alvo e na mudança de perfil recomeça a série; nenhum Flow guarda quadro
anterior por conta própria.

## Contribuições a pontos de cena

| Ponto                | Ordem | Quando               | O que faz                                                                         |
| -------------------- | ----- | -------------------- | --------------------------------------------------------------------------------- |
| `light_transmission` | 25    | `CloudLayer` e `Sky` | Para a luz do sol do `Sky`: × `T(p)` do mapa de transmitância; as outras luzes: 1 |
| `sky_cover`          | 0     | `CloudLayer` e `Sky` | O panorama na direção: (luz espalhada, transmitância)                             |

O `Sky` passa a ler `sky_cover` na contribuição a `scene_environment` (`sky_radiance · a + rgb`); sem contribuinte, o
ponto não entra no módulo e o WGSL gerado é o de hoje.
