# Data Model: Sombras para várias fontes de luz

## ShadowAtlas (Resource de cena, novo)

Um por cena, criado com a primeira luz com sombra por páginas e removido com a última.

| Descritor  | Conteúdo                                                                                    | Histórico      |
| ---------- | ------------------------------------------------------------------------------------------- | -------------- |
| `atlas`    | as tabelas de páginas de todas as vistas (uma faixa por vista) seguidas das páginas físicas | profundidade 1 |
| `requests` | os pedidos de página de todas as vistas (uma faixa por vista; duas palavras por página)     | profundidade 2 |
| `params`   | o número de vistas, o tamanho da faixa, as páginas físicas, o orçamento                     | —              |

- **Faixa de uma vista**: `SHADOW_MAX_LEVELS · pagesPerLevel² · 4` palavras de tabela e `· 2` de pedidos.
- **Páginas físicas**: `atlasPages²` páginas de `130²` palavras, comuns a todas as vistas; `atlasPages` pelo perfil, pelo
  número de vistas vivas e pelo `maxStorageBufferBindingSize` do adaptador.
- **Regra**: faixas não se sobrepõem; a vista `v` começa em `v · faixa`.

## ShadowMap (Resource, por luz; muda)

Continua anexado à luz. Guarda os parâmetros da sombra da luz (`bias`, `normalBias`, `size`, `penumbraSamples`,
`firstLevelRadius`) e passa a declarar as **vistas** dela:

| Luz        | Vistas | Projeção                                                 |
| ---------- | ------ | -------------------------------------------------------- |
| direcional | 1      | ortográfica, níveis em volta da câmera                   |
| foco       | 1      | perspectiva, o cone externo                              |
| pontual    | 6      | perspectiva de 90°, as faces do cubo em volta da posição |

Deixa de declarar `atlas` e `requests`.

## ShadowMatrix (registro por vista; ganha campos)

Os campos de hoje (`lightView`, `viewProjection`, `camera`, `direction`, `cacheDirection`, `kernelRotation`,
`texelJitter`, `firstLevelRadius`, `depthRange`, `pagesPerLevel`, `atlasPages`) e mais:

| Campo         | Significado                                      |
| ------------- | ------------------------------------------------ |
| `tableBase`   | a primeira palavra da tabela da vista no `atlas` |
| `requestBase` | a primeira palavra dos pedidos da vista          |
| `kind`        | 0 ortográfica, 1 perspectiva                     |
| `origin`      | a posição da luz (vistas em perspectiva)         |
| `near`, `far` | os planos da vista em perspectiva                |

Série 037 de profundidade 2, como hoje: o referencial anterior decide se o cache da vista vale.

## ShadowRecord (entidades das vistas vivas; muda)

`lightSlot`, `shadowSlot` (o slot da primeira vista da luz), `views` (1 ou 6), `kind`.

## Luzes

- `DirectionalLight`, `SpotLight`, `PointLight`: `castShadow` cria o `ShadowMap` (hoje só a direcional).
- `RectLight`: passa a aceitar `castShadow`; não tem `ShadowMap` — tem um índice de luz de área com sombra.
- Uma luz que desliga `castShadow` sai das vistas vivas (hoje fica na lista pela presença do mapa).

## AreaShadow (séries por luz de área com sombra, novo)

| Série        | Conteúdo                                                                      |
| ------------ | ----------------------------------------------------------------------------- |
| `visibility` | a fração da fonte visível do pixel (meia resolução), acumulada                |
| `moments`    | os momentos para o filtro temporal                                            |
| `thickness`  | a espessura atravessada na direção do centro da fonte, e o cosseno de entrada |

Uma camada por luz de área com sombra, até o teto do perfil.

## Evento `shadowUnavailable`

`{ light: entidade, reason: 'limit' | 'kind' }` — emitido quando a luz pede sombra e fica fora dos tetos.

## Tetos por perfil (`RENDER_PROFILES.shadows`)

| Perfil | `views` | `areaLights` | `atlasPages` (teto) |
| ------ | ------- | ------------ | ------------------- |
| alto   | 16      | 4            | 48                  |
| médio  | 8       | 2            | 32                  |
| baixo  | 4       | 1            | 16                  |

## Transições

- **Luz ganha sombra**: entra nas vistas vivas se houver vaga; recebe a faixa; o cache dela recomeça. Sem vaga: evento.
- **Luz perde sombra ou sai**: a faixa é liberada e as páginas físicas dela voltam ao reservatório.
- **Vista muda de referencial além do limiar**: o cache da vista recomeça (regra do #54), só o dela.
- **Perfil muda**: os tetos mudam; as vistas além do teto novo saem com evento.
