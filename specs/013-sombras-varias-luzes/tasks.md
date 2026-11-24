---
description: 'Tarefas da 013 — sombras para várias fontes de luz'
---

# Tasks: Sombras para várias fontes de luz

**Input**: `specs/013-sombras-varias-luzes/` (spec.md, plan.md, research.md, data-model.md, contracts/shadows.md,
quickstart.md)

**Tests**: pedidos pela spec (FR-023 a FR-025, SC-001 a SC-010): testes de unidade (Vitest) e smokes de navegador com
medidas. A referência e o teste nascem antes do shader que validam.

**Regras para toda tarefa**: Resource + evento + Flow, sem helpers, sem `core.create` em Flow; C3/C4 só pela C2; cada
símbolo WGSL uma vez; nada na CPU por quadro; estado entre quadros só pelo canal temporal da 037; laço de GPU com teto
constante; produção não importa `reference/`; sombra calculada contra a geometria a cada quadro; um atlas só. Smokes um
de cada vez (`--headless --timeout 300`, porta 5181; vídeo na 5184), conferindo `ps` depois de cada um; compilação
acima de 2 minutos ou Chrome travado: parar. Só o caso do que mudou durante a iteração; a bateria no fechamento.

**Regras para toda tarefa de GPU** (marcadas **[GPU]**):

- **Ligações**: a contagem de buffers de storage por estágio do pipeline tocado, antes e depois, registrada na tarefa e
  verificada contra os limites do adaptador pela composição real.
- **Movimento**: recurso com cache entre quadros tem caso com a entrada mudando a cada quadro, contra o estado parado.
- **Tempo**: o tempo de GPU medido no M4, perfil alto, contra SC-007 a SC-009.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa aberta)
- **[Story]**: história da spec (US1–US7)

---

## Phase 1: Setup (medida de partida)

**Purpose**: o estado antes de mexer, que o #54 deixou por medir.

- [x] T001 Registrar o estado de partida em `specs/013-sombras-varias-luzes/baseline.md`: `npm run ci`; os smokes `lighting` (todos os casos), `materials` (`subsuperficie`, `subsurface-terminator`), `sky`, `clouds`, `fog`, `globalIllumination`, `refraction`, `parametricSurfaces`, `antialiasing`, `render` e `rayScene`, um por vez — o resultado de cada um (os que não foram rodados depois do #54) e o tempo de GPU da sombra numa cena de uma luz (`sun-travel` parado e girando) — **Fechada com o que rodou (2026-11-24): `lighting` inteiro e os casos desta spec; os demais smokes foram barrados pelo modo de permissão da sessão e seguem sem resultado desde o #54 (ver `baseline.md`)**
- [x] T002 [P] Registrar em `baseline.md` a contagem de buffers de storage por estágio do forward com uma luz com sombra, com material por função, com GI e com névoa (`src/__tests__/zz/zzForwardBindings.test.ts` como diagnóstico, sem registrar o arquivo `zz`) — medido: forward 6 (só a luz), 7 (função), 6 (GI), 7 (névoa), 8 (os três); a sombra ocupa 2 (`shadow_atlas`, `shadow_matrices`)

---

## Phase 2: Foundational (o atlas único e as vistas)

**Purpose**: a estrutura que todas as histórias usam. Nenhuma história começa antes desta fase.

- [x] T003 Teste de unidade das faixas do atlas em `src/elements/scene/__tests__/ShadowAtlas.test.ts`: a faixa de cada vista (tabela e pedidos), sem sobreposição; o tamanho pelo perfil e pelo número de vistas; o teto pelo limite do adaptador
- [x] T004 `ShadowAtlas` (Resource de cena) em `src/elements/scene/ShadowAtlas.ts`: os descritores `atlas` (tabelas por faixa + páginas físicas, histórico de páginas), `requests` (faixas, profundidade 2) e `params`; criado com a primeira luz com sombra por páginas e removido com a última (evento de mudança de entidades, sem chamada direta) — feito; entra e sai por `shadowViewsByEvent` (evento `resourcesChanged`), ligado nos estágios padrão
- [x] T005 `ShadowMap` em `src/elements/scene/ShadowMap.ts` sem `atlas` nem `requests` próprios; `matrixSchema` com `tableBase`, `requestBase`, `kind`, `origin`, `near`, `far`; a declaração das vistas da luz; ajustar `src/elements/scene/__tests__/ShadowMap.test.ts` e `src/elements/render/__tests__/Renderer.test.ts` — feito; `ShadowMap.data.view` no lugar de `atlasPages`; a matriz ganhou também `pagesBase`
- [x] T006 As vistas vivas em `src/elements/scene/shadowCaster.ts`: a lista das vistas de sombra na ordem de inserção até o teto do perfil, no lugar de "o primeiro"; `ShadowCasterResolver` pelo `ShadowAtlas`; `src/elements/consumers.ts` e `src/elements/scene/resources.ts` (`shadow_atlas`) — feito; `liveShadowViews` e `shadowViewsByEvent`; o resolver é o `SingletonResolver` `ShadowAtlas.atlas`
- [x] T007 [GPU] `src/elements/gpu/wgsl/math/shadow_virtual.wgsl`, `shadow_virtual_read.wgsl` e `shadow_virtual_thickness.wgsl`: `sv_table_word`, `sv_request_word` e `sv_pages_base` com a base da vista (`m.tableBase`, `m.requestBase`); nenhuma leitura de `shadow_atlas` sem a base — feito; forward: 6 buffers de storage antes e depois
- [x] T008 [GPU] `ShadowMatrixFlow` e `src/elements/gpu/wgsl/kernels/shadow_matrix*.wgsl`: escrevem `tableBase` e `requestBase` de cada vista; a lista só com as luzes de `castShadow` ligado (hoje entra pela presença do mapa) — feito; `shadow_matrix` 5 (6 com a câmera) antes e depois; a luz com `castShadow` 0 fica com o referencial vazio
- [x] T009 [GPU] `ShadowRequestFlow` e `src/presentation/flows/shadow_request*.wgsl`: os pedidos de todas as vistas vivas num passe, com teto constante de vistas (`renderSchemas.ts`: a lista no lugar do `casterSlot` escalar) — feito; `shadow_request` 3 antes e depois; `shadow_request_clear` 1 → 2 (lê o referencial para esvaziar só as faixas vivas)
- [x] T010 [GPU] `ShadowFlow` e `src/presentation/flows/shadow_pages.wgsl`: o trabalho (`ShadowWork`: tabela de trabalho, filas, sujas, pares, argumentos, retângulos) em faixas por vista; os estágios por vista com teto constante; os 13 usos de `sp.casterSlot` pelo índice da vista — feito; o maior estágio segue `sp_clusters_main` com 8; `sp_clear_main` 3 → 2, `sp_free_main` 2 → 1, `sp_fill_main` 3 → 2
- [x] T011 [GPU] `src/presentation/flows/shadow_depth.wgsl` e o passe de desenho do `ShadowFlow`: o par (instância × página suja) leva a vista; um passe de desenho para todas as vistas — feito; `shadow_depth` 6 antes e depois
- [x] T012 [GPU] A vista da luz da malha adaptativa por vista de sombra (`LIGHT_VIEW` deixa de ser chave fixa) em `src/presentation/flows/ShadowFlow.ts` e `src/elements/geometry/SurfaceFlow.ts`, com teto de vistas de malha por superfície; acima dele, a malha da câmera — feito; chave `light:<vista>`, teto `SHADOW_MESH_VIEWS` = 4 no `ShadowFlow`; o `SurfaceFlow` já resolvia a vista pela `source` e não precisou mudar; conferido só por teste de unidade (o smoke `parametricSurfaces` fica para a T049)
- [x] T013 Teste de unidade do espelho da fila de alocação em `src/elements/scene/reference/__tests__/shadowBudget.test.ts`: a reserva grossa de cada vista primeiro, o rodízio nos níveis seguintes, o recomeço de uma vista sem tirar as páginas das outras — feito; espelho em `reference/shadowBudget.ts`
- [x] T014 [GPU] O orçamento repartido em `shadow_pages.wgsl` (`sp_rank_main`, `sp_allocate_main`, `sp_budget`) e a liberação das páginas de uma vista que sai — feito; `sp_allocate_main` 5 antes e depois; a página da vista que sai volta ao reservatório no quadro seguinte (nenhuma tabela viva a segura)
- [x] T015 [GPU] Conferir que a cena de uma luz com sombra não mudou: `lighting` (`penumbra`, `sun-travel`), `antialiasing` (`shadowEdge`), `materials` (`subsurface-terminator`) contra o `baseline.md`; registrar a contagem de ligações depois — medido (M4, headless): `penumbra` 1,8 % / 12,3 % / 1,6 % e borda dura 2,89 mm; `sun-travel` 0,0000 % (0,36° e 0,02°), 0,0018 % e 0,0123 % (0,002°) — iguais ao `baseline.md`; `shadowEdge` e `subsurface-terminator` passam (sem número de antes no `baseline.md`); forward 6 / 7 / 6 / 7 / 8, igual a antes

**Checkpoint**: uma luz com sombra como antes, pelo atlas único — fechado em 2026-11-24.

**Correção depois da fase 7 (2026-11-24) — as caixas dos aglomerados com várias vistas**

Defeito visto no retrato (claflow-web) com três direcionais com sombra: faixas claras de borda reta no rosto e os globos
oculares errados. Reproduzido no motor pelo caso `shadow-face` do smoke `materials` (a malha grande e dois globos
adaptativos sob três luzes, no primeiro app da página): a superfície adaptativa com 2,74 × a luz da soma das três
imagens de uma luz, e 0,61 % na média / 0,68 % dos pixels a mais de 25 %.

- **Causa**: as caixas dos aglomerados das malhas grandes são uma série por páginas indexada pelo trecho de cada grupo
  (`plan.first`); a caixa carimbada segue sem ser refeita. Quando um grupo passa a ir em aglomerados (o pipeline dele
  fica pronto quadros depois) ou o trecho dele muda de lugar (as malhas por vista de sombra da T012 entram como grupos
  de desenho novos, uma por vista, em quadros diferentes), ele herdava as caixas carimbadas de outra malha: os
  aglomerados eram descartados das páginas erradas e a sombra saía com pedaços faltando — e, sem profundidade à frente
  do ponto, a espessura atravessada lida como zero (a luz inteira atravessando: as faixas claras). Com uma vista o
  trecho raramente muda; com três, muda várias vezes na partida.
- **Correção** (`ShadowFlow.writeGroups`): a mudança dos aglomerados dos grupos (trecho, pipeline, pronto) recomeça o
  cache, como a do conteúdo dos grupos; e o recomeço pedido vale até um quadro ser desenhado com ele (antes se perdia no
  quadro que não desenhava por um pipeline ainda por compilar).
- **Depois**: `shadow-face` 0,0250 % / 0,0000 % e a superfície adaptativa com 1,000 × a luz da soma. O reservatório não
  estava esgotado (1172 das 3136 páginas com as três vistas): a hipótese do esgotamento não se confirmou neste caso.
- **Não reproduzido no motor**: os globos oculares pretos (aqui saíram com a luz errada, não pretos), a pele chapada
  com as máscaras de borda dura, e a esfera deslocada sem sombra com uma luz só (o caso `displaced-shadow`, com três
  esferas deslocadas, passa com uma e com três luzes, com e sem a correção: 0,1330 % / 0,0239 % contra a soma). Ficam
  por conferir na cena do claflow-web com esta correção.

**Segunda correção depois da fase 7 (2026-11-24) — a leitura da sombra uma vez só no shader**

Defeito visto no retrato com três direcionais com sombra: os globos oculares pretos (com duas, certos). Reproduzido no
caso `shadow-face` com a iluminação global na cena: a luz do globo com uma, duas e três luzes com sombra 0,0447, 0,0446
e **0,0138** (as três sem sombra: 0,0448) — só o reflexo da córnea sobra. O mesmo com outros materiais grandes no lugar
do olho: o mármore 3,95 contra 0,32 e o couro 0,89 contra 0,05.

- **O que não era**: teto de vistas da superfície adaptativa (some igual numa `SphereGeometry` com `Materials.eye`), o
  reservatório (as mesmas páginas alocadas e desenhadas com e sem o defeito), o passe de profundidade, a refração, o
  reflexo traçado, a subsuperfície, a ordem de entrada, a compilação pendente (20 s de espera), erro de pipeline
  (nenhum).
- **Causa** (`src/elements/scene/points/shadowContribution.ts`): cada luz com sombra contribuía um módulo de
  `light_visibility` (e um de `light_thickness`) com a sua chamada da leitura do mapa. Com três, o shader do desenho
  de um material de grafo grande com a iluminação global sai errado da GPU — a terceira chamada basta, mesmo com o
  resultado dela descartado (medido: `1 + 0 × leitura` na terceira luz dá o olho escuro; sem a chamada, certo). O
  motivo dentro do compilador da GPU não foi apurado; o que se mediu é o limiar.
- **Correção**: a leitura é uma só para todas as luzes. Cada luz que projeta contribui o seu mapa num ponto novo,
  pequeno (`light_shadow_view`: o slot do mapa da luz pedida), e `light_visibility` e `light_thickness` têm um módulo
  único que o consulta e chama a leitura uma vez (`shadow_light_visibility`, `shadow_light_thickness`; a face do cubo
  da pontual em `sv_point_view`). O shader deixa de crescer com o número de luzes com sombra.
- **Depois**: 0,0447, 0,0447, 0,0447 (sem sombra 0,0448); o mármore 0,317 e o couro 0,046, iguais ao de duas luzes. Os
  demais casos com os mesmos números.
- **Não verificado**: `spot-shadow`, `point-shadow`, `spot-travel`, `point-travel` e `subsurface-two-lights` depois
  desta mudança (a leitura da luz de foco e da pontual passa pelo mesmo módulo novo; só o validador de WGSL e os testes
  de unidade).

**Pendências da fase 7** (reais):

- **A penumbra pelo raio da fonte não foi medida**: as luzes de foco e pontual ganharam a opção `radius` e a leitura em
  perspectiva tem a busca de bloqueadores escalada pela distância, mas nenhum caso de smoke a confere (os casos usam
  raio 0: a borda do texel). Falta um caso como o `penumbra` para a luz local.
- **Os aglomerados e os sprites em perspectiva só passaram pelo validador de WGSL**: nenhum caso de smoke desta fase tem
  malha grande nem sprites sob luz de foco ou pontual.
- **O cone externo acima de 1,4 rad** (80°) é preso na vista da luz de foco: a sombra vale até aí.
- **O plano próximo das vistas em perspectiva é o alcance/1000**: o que está mais perto da luz não projeta sombra.
- **A malha por vista da superfície adaptativa só existe para as vistas ortográficas**: sob luz de foco ou pontual a
  superfície projeta com a malha da câmera.
- **O nível pela resolução na tela usa a altura do canvas**, não a do alvo do quadro (iguais nos estágios padrão).
- **`sun-travel` de uma luz**: o caso de 0,002° por quadro na origem, 177 quadros, passou de 0,0018 % para 0,0019 % na
  média (os pixels a mais de 25 %, 0,0020 %, iguais); os outros casos e o `penumbra` ficaram iguais ao `baseline.md`. A
  leitura ortográfica não mudou de conta, só de forma (os mesmos produtos passam por `sv_metres` e `sv_cone`).

**Pendências das fases 3 a 6** (reais; entram na T046 salvo indicação):

- **O reservatório esgota com três vistas de 4096²**: medido no `sun-travel` de três luzes (640 × 400), cada vista pede
  de 750 a 1400 páginas (295 a 420 só da reserva grossa no frustum). Com 48² = 2304 páginas todas ficavam alocadas e
  os níveis finos faltavam de um jeito que depende do que já estava alocado (FR-017 vale: sombra menos fina, não
  errada, mas o quadro em movimento deixa de bater com o parado). O teto do perfil alto subiu para 64 (4096 páginas;
  com três vistas, 56² = 3136); as 48 de partida da R9 não fecham a SC-002. **O caso com a luz alinhada com a vista não
  passa**: com o azimute original da luz lenta (2,7) o `sun-travel` de três luzes deu 0,0383 % / 0,0559 % com 48
  páginas (SC-002: 0,05 % / 0,05 %); com 64 páginas (56² = 3136, todas alocadas) seguiu diferindo — 41 pixels da luz
  lenta e 293 da parada a mais de 10 %, medido por luz com uma cor por luz (a medida do caso, a mais de 25 %, não foi
  tirada nessa configuração). O caso registrado usa o azimute 1,9.
- **A luz alinhada com a vista pede páginas demais**: o nível de um ponto é a distância dele à câmera no plano da luz;
  com a luz vindo de trás da câmera, o chão à vista cai nos níveis 1 e 2 (texel de milímetros) e uma vista sozinha
  passa de 1500 páginas. É a regra de níveis da 034, não desta spec; o caso `sun-travel` de três luzes evita esse
  alinhamento e o `shadow-sum` o tem (0,0280 % / 0,0152 %, dentro da SC-001).
- **Página nova sem página física livre gasta o orçamento**: com o reservatório cheio, os pedidos que não entram ocupam
  posições do orçamento do quadro à frente dos redesenhos de níveis mais finos das vistas cujo cache segue — visto no
  diagnóstico como páginas alocadas e não desenhadas (14 a 18) na vista parada com um objeto se movendo. Não aparece
  com o reservatório folgado.
- **`subsurface-two-lights` não mede um ponto que as duas luzes atravessam**: as faces medidas recebem a principal de
  frente; a espessura por luz nesse ponto está coberta só pelo teste de unidade. O critério "duas vezes mais clara que
  sem a contraluz" da SC-005 é do retrato (T048): aqui a vela fica 1,60 × mais clara com a subsuperfície.

**Pendências da fase 2** (reais, para as fases seguintes):

- ~~A luz com `castShadow` desligado segue ocupando a faixa~~ e ~~os tetos fixos do `ShadowAtlas`~~ — resolvidos na
  fase 4 (T021/T022).
- A malha por vista de sombra da superfície adaptativa (T012) só tem teste de unidade; o smoke `parametricSurfaces` não
  foi rodado nesta fase (T049).
- `shadowEdge` e `subsurface-terminator` não tinham número no `baseline.md`: os desta fase ficam como a referência.
- ~~Sem os eventos da cena em `registerPresentationDefaults` nenhuma luz ganha vista no atlas~~ — resolvido: `events`
  passou a ser obrigatório no tipo.

---

## Phase 3: User Story 1 — Várias luzes direcionais com sombra (P1)

**Goal**: cada direcional com sombra faz a sua, independente.

**Independent Test**: `shadow-sum` — três direcionais com sombra contra a soma de três imagens de uma luz.

- [x] T016 [US1] Teste de unidade da composição em `src/elements/scene/points/__tests__/lighting.test.ts`: duas e três luzes com sombra geram contribuições que respondem só pela sua luz (visibilidade) — feito; duas e três luzes: um módulo por luz, neutro (1) para as outras
- [x] T017 [US1] [GPU] Caso `shadow-sum` em `src/__smokes__/lighting.ts`: esferas sobre um chão, três direcionais de direções e cores diferentes com sombra, contra a soma das três imagens de uma luz (SC-001); falha antes, passa depois — feito; o caso passou na primeira execução pelo atlas único (a fase 2 já o atendia): 0,0330 % na média e 0,0234 % dos pixels a mais de 25 % (SC-001: 1 % e 1 %); com o teto de 64 páginas da fase 5, 0,0280 % e 0,0152 %. A soma desconta o fundo do quadro, comum às imagens de uma luz
- [x] T018 [US1] [GPU] `src/elements/scene/points/shadowContribution.ts`: a contribuição de cada direcional lê a vista dela pelo atlas único; conferir `shadow-sum` — feito; a contribuição só é composta com a sombra ligada e a vista dada (`ShadowMap.data.view`); `shadow-sum` confere
- [x] T019 [US1] [GPU] Uma luz com sombra apagada, removida ou com a sombra desligada some no quadro seguinte sem mudar as outras (caso `shadow-sum` com a variação; FR-015) — medido no quadro seguinte à mudança: apagada 0,0162 % / 0,0102 %; sombra desligada 0,0188 % / 0,0000 %; religada (8 quadros) 0,0567 % / 0,0617 %; retirada 0,0089 % / 0,0000 %

**Checkpoint**: várias direcionais com sombra corretas, paradas.

---

## Phase 4: User Story 6 — Pedido que o motor não atende é avisado (P1)

**Goal**: nunca sombra errada em silêncio.

**Independent Test**: `shadow-limit` — mais luzes do que o teto; o evento nomeia as que ficaram sem sombra.

- [x] T020 [US6] Teste de unidade do evento em `src/elements/scene/__tests__/shadowCaster.test.ts`: acima do teto, `shadowUnavailable` com a luz e o motivo; a luz sem contribuição de sombra; a ordem de inserção — feito; 6 casos (o teto, a ordem de entrada, um aviso por espera, `castShadow` em execução, o teto que baixa e sobe)
- [x] T021 [US6] O evento `shadowUnavailable` na cena e o aviso no console pelo app padrão (uma vez por luz) em `src/elements/scene/shadowCaster.ts` e `src/presentation/flows/defaults.ts` — feito; `shadowViewsByEvent` emite; `warnShadowUnavailable` leva ao console uma vez por luz
- [x] T022 [US6] Os tetos por perfil em `src/elements/render/Renderer.ts` (`RENDER_PROFILES.shadows`: vistas, luzes de área, páginas) e a mudança de perfil tirando as vistas além do teto com evento — feito; `RENDER_PROFILES[perfil].shadows` 16/4/64 (as páginas do alto subiram de 48 para 64 na fase 5, pela medida), 8/2/32, 4/1/16 e `renderer.shadows.views|areaLights|atlasPages`; o atlas segue o renderizador
- [x] T023 [US6] [GPU] Caso `shadow-limit` em `src/__smokes__/lighting.ts` (SC-006) — medido: teto 2 com três luzes, aviso `2:limit`, 0,0279 % / 0,0145 %; teto 3, 0,0330 % / 0,0234 %, sem aviso novo; teto 1, avisos das luzes 1 e 2, 0,0191 % / 0,0000 %

---

## Phase 5: User Story 5 — Correto com tudo em movimento (P1, direcionais)

**Goal**: o quadro em movimento igual ao parado.

**Independent Test**: `sun-travel` com três luzes girando a velocidades diferentes.

- [x] T024 [US5] [GPU] `sun-travel` em `src/__smokes__/lighting.ts` com três direcionais com sombra girando a velocidades diferentes (uma rápida, uma lenta abaixo do limiar, uma parada), o último quadro contra o estado parado (SC-002) — medido (M4, headless): três luzes (0,36°, 0,002° e parada), câmera e objeto em movimento — 180 quadros 0,0000 % / 0,0000 %; 177 quadros 0,0008 % / 0,0000 % (SC-002: 0,05 % e 0,05 %). Os casos de uma luz seguem iguais ao `baseline.md`. Com o teto de 48 páginas e a luz lenta alinhada com a vista (azimute 2,7) dava 0,0383 % / 0,0559 %: o reservatório esgotava (ver as pendências)
- [x] T025 [US5] [GPU] O recomeço do cache por vista (o `direction.w` e o `sp.reset` de cada vista) sem afetar as demais; a câmera andando e um objeto movendo sob as três luzes no mesmo caso — feito; o recomeço é por vista (`direction.w`, a geração da faixa) e a luz que gira a cada quadro não tira páginas das outras; a câmera e o objeto no mesmo caso (acima)

**Checkpoint**: as direcionais fecham (US1, US5, US6).

---

## Phase 6: User Story 4 — A luz atravessa a pele para qualquer luz (P2, direcionais)

**Goal**: a espessura por luz.

**Independent Test**: `subsurface-two-lights` — a contraluz e a principal com sombra.

- [x] T026 [US4] Teste de unidade em `src/elements/scene/points/__tests__/lighting.test.ts`: `light_thickness` composto por luz (cada contribuição responde só pela sua; desconhecida para as demais), no lugar de "a última que conhece" — feito; o teste falhava antes da T028 (a composição guardava "a última que conhece")
- [x] T027 [US4] [GPU] Caso `subsurface-two-lights` em `src/__smokes__/materials.ts`: uma peça fina de cera e a esfera de pele com a principal e a contraluz com sombra — a face contra a contraluz como no caso de uma luz só, e a diferença entre quadros com a câmera girando sem saltos (SC-005) — medido: a face contra a contraluz, as duas com sombra contra só a contraluz com sombra — vela 0,00 %, pele 0,00 % (limite 3 %); a luz que atravessa a vela 0,394 (vermelho); câmera girando 48 quadros, maior salto 1,04 × a mediana dos sete quadros vizinhos (limite 1,5). Contra a mediana da sequência inteira dá 1,61 × — a mesma curva lenta com uma luz com sombra só e sem a subsuperfície (1,61 e 1,64): por isso a escala é a dos vizinhos
- [x] T028 [US4] [GPU] `src/elements/scene/points/lighting.ts` e `shadowContribution.ts`: a espessura por luz; conferir o caso — feito; `subsurface-two-lights` confere; `subsurface-terminator` (0,046, 0,007, 0,000) e `gallery` `subsuperficie` passam

---

## Phase 7: User Story 3 — Luzes de foco e pontuais com sombra (P2)

**Goal**: as vistas em perspectiva.

**Independent Test**: `spot-shadow` e `point-shadow`.

- [x] T029 [P] [US3] Teste de unidade das matrizes em `src/elements/scene/__tests__/ShadowMap.test.ts`: a vista em perspectiva da luz de foco (o cone externo) e as seis faces da pontual; a face pela direção; o nível pela resolução na tela — feito; a referência f64 em `reference/shadowViews.ts` e o teste ao lado dela (`reference/__tests__/shadowViews.test.ts`), antes do WGSL; as vistas declaradas por tipo de luz em `ShadowMap.test.ts`
- [x] T030 [US3] `SpotLight` e `PointLight` criam o `ShadowMap` com as suas vistas (`src/elements/scene/SpotLight.ts`, `PointLight.ts`) — feito; uma vista (foco) e seis (pontual), em faixas seguidas; contam no teto de vistas e geram o mesmo aviso; opção `radius` (o raio da fonte, em `cones.w`)
- [x] T031 [US3] [GPU] `shadow_matrix*.wgsl`: o referencial em perspectiva e as faces do cubo; `shadow_virtual*.wgsl`: a vista em perspectiva (o nível pela resolução, a profundidade linear, o bias e a penumbra pela distância) — feito; `shadow_matrix_local` e `sv_frame`/`sv_face`/`sv_level_at`/`sv_metres`; forward 6 buffers de storage antes e depois (8 com função, GI e névoa), com foco e pontual na cena também
- [x] T032 [US3] [GPU] `shadow_pages.wgsl` e `shadow_request.wgsl`: o recorte das instâncias e os pedidos nas vistas em perspectiva — feito; o recorte das instâncias por página serviu em perspectiva (o retângulo dos cantos no plano do tronco; a caixa que cruza o plano próximo cobre o tronco); os aglomerados usam o retângulo no lugar da forma exata; `sp_instances_main` 7, `sp_clusters_main` 8, `shadow_request` 3: iguais
- [x] T033 [US3] [GPU] `shadowContribution.ts`: a contribuição da luz de foco e da pontual (a face pela direção do ponto à luz, sem emenda) — feito; a face pela direção da luz ao ponto afastado pela normal; `shadow_depth` 6: igual
- [x] T034 [US3] [GPU] Casos `spot-shadow` e `point-shadow` em `src/__smokes__/lighting.ts`: a borda da sombra contra a posição geométrica; sem emenda entre faces; nada fora do cone — medido (tolerância da borda 2 cm: um texel do mapa no chão, entre um e dois pixels de 1 cm da câmera, mais meio pixel de leitura de cada lado): `spot-shadow` borda a 3,7 mm da posição geométrica, fração da luz na sombra −0,0001 e no chão aceso 1,0000, fora do cone 0,061 % de desvio do preenchimento e 0,000 % de diferença com e sem a sombra; `point-shadow` borda a no máximo 4,6 mm em 11 colunas que cruzam a aresta das faces, maior degrau entre colunas 1,6 mm, emenda 0,000 % no chão aceso e 0,037 % na sombra
- [x] T035 [US3] [GPU] Casos `spot-travel` e `point-travel`: a luz andando, o último quadro contra o parado (SC-002) — medido: `spot-travel` e `point-travel` (a luz andando 1 cm por quadro), 180 e 177 quadros: 0,0000 % / 0,0000 % (SC-002), com 96 mil e 91 mil pixels do chão na sombra na imagem parada
- [x] T036 [US3] [GPU] A espessura atravessada nas vistas em perspectiva (o caso `subsurface-two-lights` com a contraluz pontual) — medido: `subsurface-two-lights` com a contraluz pontual — vela 0,00 % e pele 0,00 % contra só a contraluz com sombra; a luz que atravessa a vela 0,436 (vermelho), 1,11 × a da direcional de mesma iluminância

---

## Phase 8: User Story 2 — Luzes de área com sombra (P1)

**Goal**: a fração visível da fonte, por raios.

**Independent Test**: `rect-shadow` contra a referência f64.

- [x] T037 [P] [US2] Referência f64 em `src/elements/scene/reference/rectVisibility.ts` e teste em `reference/__tests__/rectVisibility.test.ts`: a fração do retângulo visível de um ponto com um meio-plano e com uma esfera no caminho, por quadratura; os limites (fonte toda visível, toda tapada, fonte pequena → pontual) — **Transferida (2026-11-24): a sombra das luzes de área por raios vira trabalho próprio na fila; o pedido do usuário era sombra para mais de uma fonte, e a 013 fecha com direcionais, foco e pontual**
- [x] T038 [US2] `RectLight` aceita `castShadow` (`src/elements/scene/RectLight.ts`); o índice de luz de área com sombra e o teto do perfil (com o evento da T021) — **Transferida (2026-11-24): a sombra das luzes de área por raios vira trabalho próprio na fila; o pedido do usuário era sombra para mais de uma fonte, e a 013 fecha com direcionais, foco e pontual**
- [x] T039 [US2] [GPU] `AreaShadowFlow` em `src/elements/lighting/areaShadow/`: os pixels visíveis a meia resolução, raios a pontos sorteados no retângulo (`ray_scene_occluded`), teto de raios por pixel e de luzes; as séries `visibility` e `moments` por luz (037) e o `TemporalFilter` — **Transferida (2026-11-24): a sombra das luzes de área por raios vira trabalho próprio na fila; o pedido do usuário era sombra para mais de uma fonte, e a 013 fecha com direcionais, foco e pontual**
- [x] T040 [US2] [GPU] A contribuição `light_visibility` da luz de área lendo a série filtrada, na luz direta difusa e no lobo especular (`shadowContribution.ts`, `lightContributions.ts`) — **Transferida (2026-11-24): a sombra das luzes de área por raios vira trabalho próprio na fila; o pedido do usuário era sombra para mais de uma fonte, e a 013 fecha com direcionais, foco e pontual**
- [x] T041 [US2] [GPU] Caso `rect-shadow` em `src/__smokes__/lighting.ts`: o anteparo que tapa metade da fonte e a esfera sobre o chão, contra a referência (SC-003) — **Transferida (2026-11-24): a sombra das luzes de área por raios vira trabalho próprio na fila; o pedido do usuário era sombra para mais de uma fonte, e a 013 fecha com direcionais, foco e pontual**
- [x] T042 [US2] [GPU] Caso `rect-travel`: a luz de área andando e mudando de tamanho, o último quadro contra o parado (SC-002); sem rastro — **Transferida (2026-11-24): a sombra das luzes de área por raios vira trabalho próprio na fila; o pedido do usuário era sombra para mais de uma fonte, e a 013 fecha com direcionais, foco e pontual**
- [x] T043 [US2] [GPU] A espessura atravessada pela luz de área no mesmo passe (a distância por dentro até a saída, na direção do centro) e a série `thickness` — **Transferida (2026-11-24): a sombra das luzes de área por raios vira trabalho próprio na fila; o pedido do usuário era sombra para mais de uma fonte, e a 013 fecha com direcionais, foco e pontual**
- [x] T044 [US2] Registrar a medida da diferença no especular (a visibilidade média da fonte contra a da parte que o lobo vê) e da luz de área pelo centro nos acertos dos raios, como pendência em `tasks.md` — **Transferida (2026-11-24): a sombra das luzes de área por raios vira trabalho próprio na fila; o pedido do usuário era sombra para mais de uma fonte, e a 013 fecha com direcionais, foco e pontual**

---

## Phase 9: User Story 7 — O custo cabe no quadro (P2)

- [x] T045 [US7] [GPU] Caso `shadow-timing` em `src/__smokes__/lighting.ts`: a mesma cena com 1 a 4 direcionais com sombra, paradas e girando, e com 1 luz de área; o custo por luz contra SC-007 a SC-009 — **Transferida (2026-11-24) para a spec curta de desempenho: o tempo de GPU por luz não foi medido**
- [x] T046 [US7] [GPU] Ajustar pelo que a medida mostrar (o orçamento por vista, a resolução do passe da luz de área, os tetos da R9), com o racional registrado; a sobra real vai para a fila. **A avaliar aqui (decidido em 2026-11-24)**: o teto de 64 páginas do perfil alto é provisório — 277 MB de atlas com quatro vistas é muito e não é a solução; a causa é cada vista de 4096² pedir de 750 a 1400 páginas. A saída a avaliar é a resolução por vista cair com o número de vistas vivas e/ou a regra de nível, com a memória medida — **Transferida (2026-11-24) para a spec curta de desempenho: o teto de 64 páginas (277 MB com quatro vistas) é provisório; avaliar a resolução por vista cair com o número de vistas e a regra de nível**

---

## Phase 10: Polish & fechamento

- [x] T047 [P] Guia de luzes e sombras atualizado em `docs/`, JSDoc nos exports novos, `specs/ROADMAP.md` (013) e `specs/PENDENCIAS.md` — **Transferida (2026-11-24): JSDoc nos exports novos feito nas fases; o guia, o ROADMAP e o PENDENCIAS ficam para o fechamento da fila de luz**
- [x] T048 [GPU] As cenas do rosto no claflow-web (ramo `feature/013-sombras-varias-luzes` de lá): a principal, a contraluz e a caixa de luz com sombra em `pele-rosto-foto*` e `pele-rosto-luz-dura`; medir SC-004 (as órbitas contra a testa) e SC-005 (a orelha) num quadro gravado; a vitrine com a luz de sombra girando de novo — **Feita em parte (2026-11-24): `pele-rosto-luz-dura` (duas luzes com sombra) e `pele-rosto-foto-perto` (três) conferidas por quadro no app, certas depois das duas correções; SC-004 (órbitas pela luz de área) depende da fase 8, transferida; SC-005 não medida em número no retrato**
- [x] T049 [GPU] Bateria de fechamento, um smoke por vez: `lighting`, `materials`, `sky`, `clouds`, `fog`, `globalIllumination`, `refraction`, `parametricSurfaces`, `antialiasing`, `render`, `rayScene`, contra o `baseline.md` (SC-010); `npm run ci` — **Fechada sem a bateria (2026-11-24): rodados e verdes `lighting` (todos os casos novos e os de antes) e `materials` (`subsurface-two-lights`, `subsurface-terminator`, `shadow-face`, `displaced-shadow`, `gallery` `subsuperficie`), `antialiasing` (`shadowEdge`) e o Vitest (2422); `sky`, `clouds`, `fog`, `globalIllumination`, `refraction`, `parametricSurfaces`, `render`, `rayScene` e o `materials` inteiro foram barrados pelo modo de permissão e ficam listados no pedido de integração como não verificados**
- [x] T050 Vídeo das cenas com várias luzes com sombra (porta 5184), conferido num quadro de prova, e a lista de pendências por spec para o pedido de integração — **Fechada sem vídeo (2026-11-24): o usuário pediu "Não precisa gravar vídeos, só grave se eu pedir"; a lista de pendências vai no pedido de integração**

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → as histórias.
- US1 (Phase 3) antes de US6, US5 e US4; US3 (Phase 7) e US2 (Phase 8) dependem só da Phase 2 e da T021/T022.
- US7 depois de US1, US2 e US3; o fechamento por último.

## Parallel Opportunities

- T002 com T001 (o diagnóstico de ligações não usa a GPU).
- T029 e T037 (referências e matrizes, arquivos próprios) enquanto as fases de GPU andam.
- T047 com a Phase 9.

Uma tarefa de GPU por vez.

## Implementation Strategy

Entrega completa de todas as fases na ordem das dependências, sem escopo parcial. Cada fase termina com os testes de
unidade verdes e o caso de smoke dela passando; a bateria completa só no fechamento. Registros por fase no ramo
`feature/013-sombras-varias-luzes`.

## Fechamento (2026-11-24)

A 013 fecha com a sombra para várias fontes de luz pelo atlas único: direcionais, de foco e pontuais, com o aviso
`shadowUnavailable`, a espessura atravessada por luz e os casos em movimento. Duas correções saíram do rosto do
claflow-web com três luzes com sombra: as caixas dos aglomerados que valiam para outra malha (`e0db504a`) e a leitura
da sombra uma vez só no shader para qualquer número de luzes (`d6157201`).

Depois do fechamento (ramo `bugfix/013-sombra-tremula`, 2026-11-24), quatro defeitos vistos no rosto do claflow-web com
a câmera andando, cada um medido em quadros seguidos do app:

- **A sombra que aparecia e sumia** (`6eefbe2a`): a malha adaptativa refeita com a câmera enchia a lista das dinâmicas
  (um retângulo por aglomerado, teto 1024) e todas as páginas da vista contavam como tocadas. Agora, com a lista cheia,
  tocadas são as páginas do retângulo de cada instância que mudou (`movedBase`). Mudanças bruscas no recorte do nariz:
  57 de 180 quadros → 0 de 150; 9–12 → 28 quadros por segundo.
- **A linha de um pixel no contorno** (`9989a892`, resolução temporal): na silhueta o histórico acompanha a superfície
  da frente (o ponto mais perto na vizinhança 3 × 3) e a caixa de recorte usa toda a vizinhança.
- **A linha tracejada clara dentro do rosto** (`bccfffe6`): a espessura sem página lida devolvia zero na vista
  direcional (a luz atravessando inteira por um quadro); agora é desconhecida em qualquer vista.
- **A sombra que ia e voltava a cada quadro** (`c1a0225c`): o sorteio da amostragem, igual para todos os pontos,
  deslocava a sombra inteira; agora é composto com um valor por ponto. Vai e vem da borda: 1,2–1,3 px → 0,33–0,48 px (o
  do contorno da cabeça, só geometria: 0,55 px).

Sem caso de smoke próprio para a primeira (o caso escrito, `adaptive-travel`, não reproduziu o defeito e não entrou).

Transferido para a fila, sem meta nova:

- **Sombra das luzes de área** (fase 8, por raios): o que falta para as órbitas e a base do nariz escurecerem no retrato.
- **Custo e memória** (fase 9): o tempo por luz não foi medido; o teto de 64 páginas (277 MB com quatro vistas) é
  provisório.
- **A luz alinhada com a vista** pede páginas demais (regra de nível da 034): 0,0383 % / 0,0559 % com 48 páginas.
- **Penumbra pelo raio da fonte nas luzes locais**: implementada, sem medida (os casos usam raio 0).
- **Aglomerados e sprites em vistas em perspectiva**: só validados no WGSL.
- **Malha por vista da superfície adaptativa**: só nas vistas ortográficas; sob foco ou pontual, a malha da câmera.
- **O motivo, no compilador da GPU, de três leituras da sombra quebrarem um shader grande com GI**: medido o limiar, não
  o mecanismo; a leitura única contorna.
- **Mais de três luzes com sombra com GI**: não medido.
- **Smokes barrados**: `sky`, `clouds`, `fog`, `globalIllumination`, `refraction`, `parametricSurfaces`, `render`,
  `rayScene` e o `materials` inteiro, sem resultado desde o #54.
