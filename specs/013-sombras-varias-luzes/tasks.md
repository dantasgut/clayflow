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

- [ ] T001 Registrar o estado de partida em `specs/013-sombras-varias-luzes/baseline.md`: `npm run ci`; os smokes `lighting` (todos os casos), `materials` (`subsuperficie`, `subsurface-terminator`), `sky`, `clouds`, `fog`, `globalIllumination`, `refraction`, `parametricSurfaces`, `antialiasing`, `render` e `rayScene`, um por vez — o resultado de cada um (os que não foram rodados depois do #54) e o tempo de GPU da sombra numa cena de uma luz (`sun-travel` parado e girando)
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

**Pendências da fase 2** (reais, para as fases seguintes):

- A vista de uma luz é dada pela presença do `ShadowMap`; a luz com `castShadow` desligado em tempo de execução fica com
  o referencial vazio na GPU mas segue ocupando a faixa dela. A conta do teto com a sombra desligada entra com a T021/T022.
- Os tetos por perfil (vistas e páginas) ainda são os fixos do `ShadowAtlas` (16 vistas, 48 páginas por lado): T022.
- A malha por vista de sombra da superfície adaptativa (T012) só tem teste de unidade; o smoke `parametricSurfaces` não
  foi rodado nesta fase (T049).
- `shadowEdge` e `subsurface-terminator` não tinham número no `baseline.md`: os desta fase ficam como a referência.
- Sem os eventos da cena em `registerPresentationDefaults` (`events` é opcional) nenhuma luz ganha vista no atlas.

---

## Phase 3: User Story 1 — Várias luzes direcionais com sombra (P1)

**Goal**: cada direcional com sombra faz a sua, independente.

**Independent Test**: `shadow-sum` — três direcionais com sombra contra a soma de três imagens de uma luz.

- [ ] T016 [US1] Teste de unidade da composição em `src/elements/scene/points/__tests__/lighting.test.ts`: duas e três luzes com sombra geram contribuições que respondem só pela sua luz (visibilidade)
- [ ] T017 [US1] [GPU] Caso `shadow-sum` em `src/__smokes__/lighting.ts`: esferas sobre um chão, três direcionais de direções e cores diferentes com sombra, contra a soma das três imagens de uma luz (SC-001); falha antes, passa depois
- [ ] T018 [US1] [GPU] `src/elements/scene/points/shadowContribution.ts`: a contribuição de cada direcional lê a vista dela pelo atlas único; conferir `shadow-sum`
- [ ] T019 [US1] [GPU] Uma luz com sombra apagada, removida ou com a sombra desligada some no quadro seguinte sem mudar as outras (caso `shadow-sum` com a variação; FR-015)

**Checkpoint**: várias direcionais com sombra corretas, paradas.

---

## Phase 4: User Story 6 — Pedido que o motor não atende é avisado (P1)

**Goal**: nunca sombra errada em silêncio.

**Independent Test**: `shadow-limit` — mais luzes do que o teto; o evento nomeia as que ficaram sem sombra.

- [ ] T020 [US6] Teste de unidade do evento em `src/elements/scene/__tests__/shadowCaster.test.ts`: acima do teto, `shadowUnavailable` com a luz e o motivo; a luz sem contribuição de sombra; a ordem de inserção
- [ ] T021 [US6] O evento `shadowUnavailable` na cena e o aviso no console pelo app padrão (uma vez por luz) em `src/elements/scene/shadowCaster.ts` e `src/presentation/flows/defaults.ts`
- [ ] T022 [US6] Os tetos por perfil em `src/elements/render/Renderer.ts` (`RENDER_PROFILES.shadows`: vistas, luzes de área, páginas) e a mudança de perfil tirando as vistas além do teto com evento
- [ ] T023 [US6] [GPU] Caso `shadow-limit` em `src/__smokes__/lighting.ts` (SC-006)

---

## Phase 5: User Story 5 — Correto com tudo em movimento (P1, direcionais)

**Goal**: o quadro em movimento igual ao parado.

**Independent Test**: `sun-travel` com três luzes girando a velocidades diferentes.

- [ ] T024 [US5] [GPU] `sun-travel` em `src/__smokes__/lighting.ts` com três direcionais com sombra girando a velocidades diferentes (uma rápida, uma lenta abaixo do limiar, uma parada), o último quadro contra o estado parado (SC-002)
- [ ] T025 [US5] [GPU] O recomeço do cache por vista (o `direction.w` e o `sp.reset` de cada vista) sem afetar as demais; a câmera andando e um objeto movendo sob as três luzes no mesmo caso

**Checkpoint**: as direcionais fecham (US1, US5, US6).

---

## Phase 6: User Story 4 — A luz atravessa a pele para qualquer luz (P2, direcionais)

**Goal**: a espessura por luz.

**Independent Test**: `subsurface-two-lights` — a contraluz e a principal com sombra.

- [ ] T026 [US4] Teste de unidade em `src/elements/scene/points/__tests__/lighting.test.ts`: `light_thickness` composto por luz (cada contribuição responde só pela sua; desconhecida para as demais), no lugar de "a última que conhece"
- [ ] T027 [US4] [GPU] Caso `subsurface-two-lights` em `src/__smokes__/materials.ts`: uma peça fina de cera e a esfera de pele com a principal e a contraluz com sombra — a face contra a contraluz como no caso de uma luz só, e a diferença entre quadros com a câmera girando sem saltos (SC-005)
- [ ] T028 [US4] [GPU] `src/elements/scene/points/lighting.ts` e `shadowContribution.ts`: a espessura por luz; conferir o caso

---

## Phase 7: User Story 3 — Luzes de foco e pontuais com sombra (P2)

**Goal**: as vistas em perspectiva.

**Independent Test**: `spot-shadow` e `point-shadow`.

- [ ] T029 [P] [US3] Teste de unidade das matrizes em `src/elements/scene/__tests__/ShadowMap.test.ts`: a vista em perspectiva da luz de foco (o cone externo) e as seis faces da pontual; a face pela direção; o nível pela resolução na tela
- [ ] T030 [US3] `SpotLight` e `PointLight` criam o `ShadowMap` com as suas vistas (`src/elements/scene/SpotLight.ts`, `PointLight.ts`)
- [ ] T031 [US3] [GPU] `shadow_matrix*.wgsl`: o referencial em perspectiva e as faces do cubo; `shadow_virtual*.wgsl`: a vista em perspectiva (o nível pela resolução, a profundidade linear, o bias e a penumbra pela distância)
- [ ] T032 [US3] [GPU] `shadow_pages.wgsl` e `shadow_request.wgsl`: o recorte das instâncias e os pedidos nas vistas em perspectiva
- [ ] T033 [US3] [GPU] `shadowContribution.ts`: a contribuição da luz de foco e da pontual (a face pela direção do ponto à luz, sem emenda)
- [ ] T034 [US3] [GPU] Casos `spot-shadow` e `point-shadow` em `src/__smokes__/lighting.ts`: a borda da sombra contra a posição geométrica; sem emenda entre faces; nada fora do cone
- [ ] T035 [US3] [GPU] Casos `spot-travel` e `point-travel`: a luz andando, o último quadro contra o parado (SC-002)
- [ ] T036 [US3] [GPU] A espessura atravessada nas vistas em perspectiva (o caso `subsurface-two-lights` com a contraluz pontual)

---

## Phase 8: User Story 2 — Luzes de área com sombra (P1)

**Goal**: a fração visível da fonte, por raios.

**Independent Test**: `rect-shadow` contra a referência f64.

- [ ] T037 [P] [US2] Referência f64 em `src/elements/scene/reference/rectVisibility.ts` e teste em `reference/__tests__/rectVisibility.test.ts`: a fração do retângulo visível de um ponto com um meio-plano e com uma esfera no caminho, por quadratura; os limites (fonte toda visível, toda tapada, fonte pequena → pontual)
- [ ] T038 [US2] `RectLight` aceita `castShadow` (`src/elements/scene/RectLight.ts`); o índice de luz de área com sombra e o teto do perfil (com o evento da T021)
- [ ] T039 [US2] [GPU] `AreaShadowFlow` em `src/elements/lighting/areaShadow/`: os pixels visíveis a meia resolução, raios a pontos sorteados no retângulo (`ray_scene_occluded`), teto de raios por pixel e de luzes; as séries `visibility` e `moments` por luz (037) e o `TemporalFilter`
- [ ] T040 [US2] [GPU] A contribuição `light_visibility` da luz de área lendo a série filtrada, na luz direta difusa e no lobo especular (`shadowContribution.ts`, `lightContributions.ts`)
- [ ] T041 [US2] [GPU] Caso `rect-shadow` em `src/__smokes__/lighting.ts`: o anteparo que tapa metade da fonte e a esfera sobre o chão, contra a referência (SC-003)
- [ ] T042 [US2] [GPU] Caso `rect-travel`: a luz de área andando e mudando de tamanho, o último quadro contra o parado (SC-002); sem rastro
- [ ] T043 [US2] [GPU] A espessura atravessada pela luz de área no mesmo passe (a distância por dentro até a saída, na direção do centro) e a série `thickness`
- [ ] T044 [US2] Registrar a medida da diferença no especular (a visibilidade média da fonte contra a da parte que o lobo vê) e da luz de área pelo centro nos acertos dos raios, como pendência em `tasks.md`

---

## Phase 9: User Story 7 — O custo cabe no quadro (P2)

- [ ] T045 [US7] [GPU] Caso `shadow-timing` em `src/__smokes__/lighting.ts`: a mesma cena com 1 a 4 direcionais com sombra, paradas e girando, e com 1 luz de área; o custo por luz contra SC-007 a SC-009
- [ ] T046 [US7] [GPU] Ajustar pelo que a medida mostrar (o orçamento por vista, a resolução do passe da luz de área, os tetos da R9), com o racional registrado; a sobra real vai para a fila

---

## Phase 10: Polish & fechamento

- [ ] T047 [P] Guia de luzes e sombras atualizado em `docs/`, JSDoc nos exports novos, `specs/ROADMAP.md` (013) e `specs/PENDENCIAS.md`
- [ ] T048 [GPU] As cenas do rosto no claflow-web (ramo `feature/013-sombras-varias-luzes` de lá): a principal, a contraluz e a caixa de luz com sombra em `pele-rosto-foto*` e `pele-rosto-luz-dura`; medir SC-004 (as órbitas contra a testa) e SC-005 (a orelha) num quadro gravado; a vitrine com a luz de sombra girando de novo
- [ ] T049 [GPU] Bateria de fechamento, um smoke por vez: `lighting`, `materials`, `sky`, `clouds`, `fog`, `globalIllumination`, `refraction`, `parametricSurfaces`, `antialiasing`, `render`, `rayScene`, contra o `baseline.md` (SC-010); `npm run ci`
- [ ] T050 Vídeo das cenas com várias luzes com sombra (porta 5184), conferido num quadro de prova, e a lista de pendências por spec para o pedido de integração

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
