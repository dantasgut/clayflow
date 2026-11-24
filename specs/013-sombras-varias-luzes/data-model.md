# Data Model: Sombras para várias fontes de luz

## ShadowAtlas (Resource de cena, novo)

Um por cena, criado com a primeira luz com sombra por páginas e removido com a última, por evento
(`shadowViewsByEvent`: `resourcesChanged`, `poolWritten` do pool das luzes e a mudança dos tetos).

| Descritor  | Conteúdo                                                                                             | Histórico      |
| ---------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| `atlas`    | as tabelas de páginas de todas as faixas (uma por vista) seguidas das páginas físicas                | profundidade 1 |
| `requests` | os pedidos de página de todas as faixas (duas palavras por página)                                   | profundidade 2 |
| `params`   | as faixas (`views`), as páginas por nível da faixa, as páginas físicas, as vistas vivas, o orçamento | —              |

- **Faixas**: tantas quanto o teto de vistas do perfil (16, 8 ou 4), fixas — a luz que entra ou sai não muda a base
  das outras. Cada uma com `SHADOW_MAX_LEVELS · pagesPerLevel² · 4` palavras de tabela e `· 2` de pedidos, com
  `pagesPerLevel` o do maior mapa vivo.
- **Regra**: faixas não se sobrepõem; a vista `v` começa em `v · faixa`. A vista que entra ocupa a faixa livre de menor
  índice; a que sai libera a dela.
- **Páginas físicas**: `atlasPages²` páginas de `130²` palavras, comuns a todas as vistas, a partir de `pagesBase` (depois
  das tabelas de todas as faixas). `atlasPages` = o de uma vista (as páginas de um nível, de 16 a 48) × √(vistas vivas),
  até o teto do perfil (64, 32 ou 16: o que dá a cada uma de quatro vistas as páginas de um nível) e até o maior lado cujo buffer cabe no `maxStorageBufferBindingSize` do adaptador. Com as mesmas
  faixas o reservatório só cresce: a vista que sai não realoca o atlas.
- **Orçamento**: `budget` (`SHADOW_PAGE_BUDGET`, 256): as páginas desenhadas por quadro entre as vistas cujo cache
  segue.
- **Geração da faixa**: muda quando a faixa ganha outro dono ou o atlas é refeito; o estágio de sombra recomeça o cache
  da vista cuja geração mudou.

## ShadowMap (Resource, por luz; muda)

Continua anexado à luz. Guarda os parâmetros da sombra da luz (`bias`, `normalBias`, `size`, `penumbraSamples`,
`firstLevelRadius`, `pagesPerLevel`), a **vista** dele no atlas (`view`: o índice da faixa; `NONE` fora das vistas
vivas) e declara as vistas da luz (`views`):

| Luz        | Vistas | Projeção                                                 |
| ---------- | ------ | -------------------------------------------------------- |
| direcional | 1      | ortográfica, níveis em volta da câmera                   |
| foco       | 1      | perspectiva, o cone externo                              |
| pontual    | 6      | perspectiva de 90°, as faces do cubo em volta da posição |

Deixa de declarar `atlas` e `requests`, e de guardar `atlasPages`.

## ShadowMatrix (registro por vista; ganha campos)

Os campos de hoje (`lightView`, `viewProjection`, `camera`, `direction`, `cacheDirection`, `kernelRotation`,
`texelJitter`, `firstLevelRadius`, `depthRange`, `pagesPerLevel`, `atlasPages`) e mais:

| Campo         | Significado                                                               |
| ------------- | ------------------------------------------------------------------------- |
| `tableBase`   | a primeira palavra da tabela da vista no `atlas`                          |
| `requestBase` | a primeira palavra dos pedidos da vista                                   |
| `pagesBase`   | a primeira palavra das páginas físicas no `atlas` (a mesma em toda vista) |
| `kind`        | 0 ortográfica, 1 perspectiva                                              |
| `origin`      | a posição da luz (vistas em perspectiva)                                  |
| `near`, `far` | os planos da vista em perspectiva                                         |

E, para as vistas em perspectiva (fase 7): a tangente do meio ângulo em `origin.w`; `eye` (a posição da câmera e, em
`w`, o tamanho do pixel da câmera ortográfica) e `pixel` (o ângulo de um pixel da câmera em perspectiva), para o nível
pela resolução na tela; `views` (as vistas do mapa: 6 na pontual) e `stripWords` (as palavras da tabela de uma faixa).
Há um registro por mapa: o da pontual guarda a origem e a faixa da primeira face, e o de cada face sai dele (`sv_face`:
o referencial da face e a faixa seguinte).

Série 037 de profundidade 2, como hoje: o referencial anterior decide se o cache da vista vale (a direção, o primeiro
nível, as páginas e as bases iguais). A luz com `castShadow` desligado e o mapa sem vista ficam com o referencial vazio
(nenhum nível).

## ShadowRecord (entidades com mapa de sombra; não muda)

`lightSlot`, `shadowSlot`. O registro só leva slots de pool: a vista vai em `ShadowMap.data.view` e a projeção, em
`ShadowMatrix.kind`.

## Vistas vivas

As luzes com `ShadowMap` e `castShadow` ligado, na ordem de entrada na cena, até o teto de vistas do atlas. Os estágios
de sombra e dos pedidos as percorrem pelo índice da faixa (`liveShadowViews`), com o teto constante `SHADOW_MAX_VIEWS`
(16) nos laços da GPU.

## Luzes

- `DirectionalLight`, `SpotLight`, `PointLight`: `castShadow` cria o `ShadowMap` com as vistas do tipo (1, 1 e 6). A de
  foco e a pontual aceitam `radius` (o raio da fonte em metros, para a penumbra; em `cones.w`). No teto de vistas a
  pontual conta seis; a primeira luz que não cabe e as que entraram depois dela esperam.
- `RectLight`: passa a aceitar `castShadow`; não tem `ShadowMap` — tem um índice de luz de área com sombra.
- Uma luz que desliga `castShadow` sai das vistas vivas e libera a faixa (pelo envio do pool das luzes); ligada de novo,
  volta a ter uma, na ordem de entrada.

## AreaShadow (séries por luz de área com sombra, novo)

| Série        | Conteúdo                                                                      |
| ------------ | ----------------------------------------------------------------------------- |
| `visibility` | a fração da fonte visível do pixel (meia resolução), acumulada                |
| `moments`    | os momentos para o filtro temporal                                            |
| `thickness`  | a espessura atravessada na direção do centro da fonte, e o cosseno de entrada |

Uma camada por luz de área com sombra, até o teto do perfil.

## Evento `shadowUnavailable`

`{ light: a luz (o Resource), reason: 'limit' | 'kind' }` — emitido quando a luz pede sombra e fica fora dos tetos, uma
vez enquanto ela espera (de novo se voltar a ficar sem depois de ter tido). O app padrão o leva ao console uma vez por
luz.

## Tetos por perfil (`RENDER_PROFILES[perfil].shadows`)

Ajustáveis por cima do perfil em `renderer.shadows` (`views`, `areaLights`, `atlasPages`).

| Perfil | `views` | `areaLights` | `atlasPages` (teto) |
| ------ | ------- | ------------ | ------------------- |
| alto   | 16      | 4            | 64                  |
| médio  | 8       | 2            | 32                  |
| baixo  | 4       | 1            | 16                  |

## Transições

- **Luz ganha sombra**: entra nas vistas vivas se houver vaga; recebe a faixa; o cache dela recomeça. Sem vaga: evento.
- **Luz perde sombra ou sai**: a faixa é liberada e as páginas físicas dela voltam ao reservatório.
- **Vista muda de referencial além do limiar**: o cache da vista recomeça (regra do #54), só o dela.
- **Perfil muda**: os tetos mudam; com outro número de faixas o atlas é refeito, todas as vistas são repostas na ordem
  de entrada e as que ficam além do teto novo saem com evento.
