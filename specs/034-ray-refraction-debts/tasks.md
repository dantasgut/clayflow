---
description: 'Tarefas da spec 034 — refração pela estrutura de raios e as falhas antigas (R1, H1, H4, H5)'
---

# Tasks: Refração pela estrutura de raios e as falhas antigas

**Input**: `specs/034-ray-refraction-debts/` — [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md)
(R1–R10), [data-model.md](./data-model.md), [contracts/refraction.md](./contracts/refraction.md),
[contracts/gpu-timing.md](./contracts/gpu-timing.md), [quickstart.md](./quickstart.md)

**Tests**: obrigatórios (Constituição V, FR-014–FR-016, SC-001–SC-008): Vitest para toda lógica de CPU, referência
analítica de refração na CPU e smokes de navegador com medidas (fonte e `--dist`, sempre `--headless`). Critérios dos
smokes existentes não mudam sem medida registrada em `causes.md`.

**Organização**: por história de usuário. Todas as histórias são implementadas por completo; a prioridade só ordena.
Regras de todas as tarefas: Resource + evento + Flow (sem helpers); dispatch só grava; nenhuma leitura de volta por
quadro; um símbolo WGSL por pipeline; só `shaders.ts` importa `.wgsl`; C3/C4 importam só a C2; nada por fornecedor ou
backend de GPU (FR-009a).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1–US5)

---

## Phase 1: Setup (Base)

- [x] T001 Registrar o estado de partida em `specs/034-ray-refraction-debts/baseline-check.md`: `npm run ci`, os 31 smokes `--headless` no fonte e com `--dist` (lista exata das falhas e medidas) e `npm run bench:check` com a máquina livre
- [x] T002 [P] Criar `specs/034-ray-refraction-debts/causes.md` com uma linha por falha herdada (smoke, medida de partida de `research.md`, colunas para commit da bissecção, causa, correção, medida depois)
- [x] T003 [P] Criar o smoke vazio `src/__smokes__/refraction.ts` registrado no runner (`bench/runner/smoke.ts`) e listado em `src/__smokes__/README.md`, e `src/__smokes__/support/refractionScenes.ts` (esfera de vidro maciça IOR 1,5 sobre tabuleiro, bloco com absorção, copo d'água, objeto fora do quadro e encoberto, dois vidros encadeados, parede fina, dispersão, rugosidade)

---

## Phase 2: Foundational — medição do tempo de GPU (US2, bloqueia as medidas de custo)

**Purpose**: leitura de GPU confiável em todo backend antes de medir a refração (R8).

- [x] T004 [US2] Testes em `src/core/gpu/__tests__/GpuProfilerSystem.test.ts`: anel de 4 stagings (quadros consecutivos resolvem sem pular enquanto há staging livre), descarte contado com o anel cheio, cada leitura marcada nova uma vez (`takeFresh`), leitura com overflow descartada sem repetir a anterior
- [x] T005 [US2] Implementar o anel de stagings e o frescor em `src/core/gpu/profiler/GpuProfilerSystem.ts` (um `PendingResolve` por staging, `dropped`, `takeFresh()`), sem nada específico de backend
- [x] T006 [US2] Testes em `src/core/gpu/__tests__/GpuEngineCore.frameStats.test.ts` e `src/scene/__tests__/ExecutionSystem.frameStats.test.ts`: `frameComplete.stats` traz `gpuTimeMs`/`gpuFrame`/`stagesNs` só no evento com leitura nova; `lastFrameStats()` mantém a última
- [x] T007 [US2] Implementar o frescor em `src/core/gpu/GpuEngineCore.ts` (estatísticas do evento pela leitura nova; `lastFrameStats()` inalterado para consulta) e o que `src/scene/systems/ExecutionSystem.ts` exigir; atualizar os mocks de `lastFrameStats` nos helpers de teste
- [x] T008 [P] [US2] Corrigir as docs de `src/core/contracts/FrameStats.ts`, `src/core/contracts/EngineCore.ts` (`setFrameProfiling` `'frame'`: passes reais, não passes vazios) e `src/presentation/app/Application.ts` (`profiling`) com a entrega única
- [x] T009 [US2] Criar `src/__smokes__/support/gpuTiming.ts` (testado em `src/__tests__/smokes/`): coletor por `gpuFrame` depois do aquecimento (pipelines prontos sem pendências por um intervalo e N quadros), mediana das leituras distintas; medidor por repetição no relógio de parede com cerca (cópia de 16 bytes + `readback`), `perFrame(n)` e repetição de um `Flow` — generalizando as cópias de `globalIllumination.ts` e `fog.ts`
- [x] T010 [US2] Migrar `src/__smokes__/globalIllumination.ts` e `src/__smokes__/fog.ts` para o medidor de T009 (mesmas medidas, sem as cópias locais)
- [x] T011 [US2] Migrar `src/__smokes__/fluidSurface.ts` (`performance36k`), `materials.ts` (`caseSpecialization`), `fluidField.ts` (`damFrameTime`), `nodeGraphs.ts` (custo à mão × grafo) e `rayScene.ts` (`stageTimes`) para o coletor de T009
- [x] T012 [US2] Smoke de validação da medida em `src/__smokes__/gpuTiming.ts` (novo, registrado no runner e no README): cena de custo conhecido com trabalho repetido 1× e 2×; o tempo de GPU dobra (±15 %) e concorda com o medidor por repetição a ≤ 15 % (SC-005); nenhuma leitura repetida no coletor
- [x] T013 [US2] Reavaliar o desempenho do `fluidSurface` com a medida corrigida (fonte e `--dist`); registrar em `causes.md`; se passar de 16,7 ms, perfilar por passe (`stagesNs` distintos) e reduzir o custo no motor até caber

**Checkpoint**: tempo de GPU entregue uma vez por quadro medido; os smokes de custo usam o mesmo coletor/medidor.

---

## Phase 3: Foundational — material no acerto desacoplado da GI (bloqueia US1)

**Purpose**: o mesmo material e a mesma luz nos acertos da GI e da refração (R3).

- [x] T014 Testes em `src/elements/raytrace/__tests__/RayHitMaterial.test.ts`: o ponto `ray_hit_material` composto por `RayScene.materialFunctions` sem a `GlobalIllumination` na cena; a GI recebe o mesmo módulo
- [x] T015 Mover `src/elements/gpu/wgsl/gi/gi_hit.wgsl` e `gi_hit_material_ready.wgsl` para `src/elements/gpu/wgsl/raytrace/ray_hit.wgsl`/`ray_hit_material_ready.wgsl` (`ray_hit_closure`, `ray_hit_material`), com o tempo lido do recurso de tempo da cena; módulo e ponto em `src/elements/raytrace/shaders.ts`; a composição por cena sai de `ProbeFlow` para um consumidor da `RayScene`
- [x] T016 Migrar a GI (`src/elements/lighting/ProbeFlow.ts`, `lighting/shaders.ts`, `gi_probe_trace.wgsl`, `gi_screen_trace.wgsl`, `gi_photon_trace.wgsl`) para `ray_hit_*`; rodar `globalIllumination`, `fog`, `rayScene` e `fluidField` (imagens e medidas iguais às de T001)

**Checkpoint**: qualquer estágio que exija `ray_hit_closure` recebe o material da cena sem depender da GI.

---

## Phase 4: User Story 1 — Refração nítida em qualquer ampliação (Priority: P1) 🎯

**Goal**: a transmissão pelo raio refratado traçado por pixel (R1, R2, R4, R5, R7).

**Independent Test**: smoke `refraction` — esfera sobre tabuleiro com ampliação ≥ 8×, referência analítica, fora do
quadro, encadeamento, custo.

### Testes da US1

- [x] T017 [P] [US1] Referência analítica em `src/__smokes__/support/refractionReference.ts` (testes em `src/__tests__/smokes/`): traçado na CPU para esfera, bloco e cilindro com tabuleiro analítico e luz direcional (Snell, Fresnel, reflexão interna total, Beer-Lambert, dispersão por Abbe); cor média por região
- [x] T018 [P] [US1] Testes em `src/elements/raytrace/__tests__/Refraction.test.ts`: `Refraction` com descritores (`refraction_params`, `refraction_requests`, `refraction_list`, `refraction_radiance`) sob demanda; entra com o primeiro material com transmissão ou água e sai com o último (evento), memória liberada; validação de `maxInterfaces`
- [x] T019 [P] [US1] Testes em `src/presentation/flows/__tests__/ForwardFlow.transmission.test.ts`: grupos com transmissão geram o passe de pedidos e a composição (sem `transmissionBack` nem a segunda cópia); cena sem transmissão sem nenhum dos dois; ordem pedidos → `RefractionFlow` → desfoque → composição

### Implementação da US1

- [x] T020 [US1] Criar `src/elements/raytrace/Refraction.ts` (Resource com `maxInterfaces`, `roughnessBlur`, descritores `onDemand`) e exportar pelo barrel com JSDoc
- [x] T021 [US1] Inserção/retirada da `Refraction` por evento nos estágios padrão em `src/presentation/flows/defaults.ts` (primeiro material com transmissão ou água entra; último sai), como a troca do hemisfério pela GI
- [x] T022 [US1] Passe de pedidos em `src/elements/gpu/wgsl/forward_transmission.wgsl` e `src/presentation/flows/ForwardFlow.ts`: faces da frente dos grupos com transmissão gravam o registro do pixel (entrada, normal do lobo, peso de transmissão, IOR por canal, parede fina, cor e distância de absorção, rugosidade, instância) e a lista compacta com os argumentos do despacho indireto
- [x] T023 [US1] Traçado em `src/elements/gpu/wgsl/raytrace/refraction_trace.wgsl` + `src/elements/raytrace/RefractionFlow.ts` (despacho indireto): interfaces encadeadas até `maxInterfaces` com IOR relativo pela face, reflexão interna total, Beer-Lambert por meio, três raios com dispersão e um sem, parede fina sem desvio; no acerto não transmissivo `ray_hit_closure` + `scene_lighting(c, p, n, -dir)` + névoa do trecho; escape para o céu; grava radiância e distância em `refraction_radiance`
- [x] T024 [US1] Limite de interfaces: leitura bicúbica (B-spline em 4 leituras bilineares) da cópia da cena no ponto projetado, deslocada por uma busca curta na profundidade ao longo do raio, em `refraction_trace.wgsl` (a cópia mantém os mips só se o desfoque precisar)
- [x] T025 [US1] Desfoque da rugosidade em `src/elements/gpu/wgsl/raytrace/refraction_blur.wgsl` (bilateral separável, raio = cone GGX × distância projetada em pixels, pesos pela distância do acerto) no `RefractionFlow`
- [x] T026 [US1] Composição na camada da frente (`forward_transmission.wgsl`): radiância transmitida lida no próprio pixel (`textureLoad`), Fresnel, reflexo por `scene_lighting`, opacidade e névoa como na 011; retirar `transmissionBack`, a segunda cópia e o caminho da tela ampliada de `ForwardFlow.ts`
- [x] T027 [US1] Smoke `refraction` em `src/__smokes__/refraction.ts`: degraus nas bordas com ampliação ≥ 8× ≤ 1,2× a borda sem vidro (SC-001); cor por região ≤ 5 % da referência de T017 em esfera, bloco com absorção e copo d'água (SC-002); objeto fora do quadro e encoberto visível com a cor dele (SC-003); dois vidros encadeados, reflexão interna total sem buraco preto, parede fina, dispersão e rugosidade; custo ≤ 1,5 ms com um quarto da tela pelo medidor de T009 e cena sem transmissão sem mudança (SC-004); zero leituras de volta
- [ ] T028 [US1] Rodar `materials` (vidros da 011) e `globalIllumination` (cáusticas de vidro) com a refração nova; anotar as fixtures que mudam para a fase 8

---

## Phase 5: User Story 1 — Água pela mesma refração (Priority: P1)

**Goal**: a água do campo de distância refrata pelo mesmo traçado (R6).

**Independent Test**: caso da água no smoke `refraction` + smokes da água existentes.

- [x] T029 [P] [US1] Testes em `src/presentation/flows/__tests__/WaterFlow.test.ts`: a água grava pedidos e compõe pela radiância transmitida; sem a textura `background` própria
- [x] T030 [US1] Pedidos da água em `src/presentation/flows/WaterFlow.ts` e `src/presentation/water/wgsl/water_composite.wgsl` (entrada pela marcha do campo, normal, IOR e absorção do `FluidSurfaceMaterial`); no traçado, saída do volume por `ray_volume_hit` e fundo por `ray_scene_hit`, absorção pela distância dentro da água (meio tratado como interface em `refraction_trace.wgsl`)
- [x] T031 [US1] Composição da água pela radiância transmitida; retirar `background` de `src/presentation/app/WaterSurface.ts` e o deslocamento heurístico; manter espalhamento, Fresnel e cáusticas
- [ ] T032 [US1] Caso da água no smoke `refraction` (fundo nítido e sem degraus sob a superfície, absorção pela profundidade) e rodar `fluidSurface`, `fluidField`, `particles`, `parametricSurfaces` anotando as fixtures que mudam

**Checkpoint**: vidro e água pelo mesmo traçado; SC-001–SC-004 medidos.

---

## Phase 6: User Story 3 — Cáusticas visíveis no lago e na água agitada (Priority: P1)

**Goal**: H4 (lago) e H5 (agitada) pela causa raiz (R9).

**Independent Test**: caso `lake` do `parametricSurfaces` e caso agitado do `fluidSurface`.

- [ ] T033 [US3] Bissecção das cáusticas do lago num worktree (sem symlink commitado de `node_modules`; o symlink sai antes do `git worktree remove`, sem `--force`) com `parametricSurfaces` como teste; ler o commit, medir a causa (densidade de fótons por área, raio de coleta, luz no fundo raso) e registrar em `causes.md`
- [ ] T034 [US3] Corrigir a causa do lago no motor; `parametricSurfaces` com ≥ 2 % da água mais clara; gravar a fixture de estado do lago (`--record`, duas execuções idênticas)
- [ ] T035 [US3] Bissecção e causa das cáusticas agitadas do `fluidSurface` (1,29×), registradas em `causes.md`
- [ ] T036 [US3] Corrigir a causa das agitadas no motor; `fluidSurface` com ≥ 1,3× sem regredir a parada (mediana e variação)

---

## Phase 7: User Story 4 — Os smokes visuais antigos voltam a passar (Priority: P2)

**Goal**: H4 restantes pela causa raiz (R9).

**Independent Test**: cada smoke isolado, fonte e `--dist`.

- [ ] T037 [P] [US4] Bissecção e causa do pano `xpbd-cloth` do `softSurface` (46 px no primeiro quadro medido), em `causes.md`
- [ ] T038 [P] [US4] Bissecção e causa do xadrez por `material` e do olho de peixe por `camera` do `extensionPoints` (0 trocas; 65 536 px acesos), em `causes.md`
- [ ] T039 [P] [US4] Bissecção e causa da cor da caixa 181 do `nodeGraphs`, em `causes.md`
- [ ] T040 [US4] Corrigir a causa do pano no motor; `softSurface` passa (corpo ≥ 100 px nos dois quadros, sombra)
- [ ] T041 [US4] Corrigir as causas do xadrez e do olho de peixe no motor; `extensionPoints` passa, fixtures de estado conferem ou são regravadas com a causa registrada
- [ ] T042 [US4] Corrigir a causa da caixa 181 no motor; `nodeGraphs` passa (as 1000 caixas na cor do valor), com teste de unidade da causa quando for lógica de CPU

---

## Phase 8: User Story 5 — Fixtures

- [ ] T043 [US5] Regravar as fixtures que mudam pela refração nova e pelas correções (lista de T028, T032, T034, T041), com `--record` (duas execuções idênticas) e montagens antes/depois em `specs/034-ray-refraction-debts/fixtures/`; listar em `specs/034-ray-refraction-debts/fixtures.md` com o motivo de cada uma

---

## Phase 9: User Story 5 — Docs

- [ ] T044 [P] [US5] `clay-engine-doc/docs/guides/raytracing.md` (refração como consumidor, `ray_hit_*`) e o guia de materiais/transmissão (refração por raio, `Refraction`, limites e custo)
- [ ] T045 [P] [US5] `clay-engine-doc/docs/guides/benchmark.md` e `09_Compute_Pass_e_Queries.md`: entrega única do tempo de GPU, `gpuFrame`, medição multiplataforma
- [ ] T046 [P] [US5] `specs/ROADMAP.md` (R1 resolvido na 034) e `specs/PENDENCIAS.md` (R1, H1, H4, H5 baixadas com a causa; notas da 034)

---

## Phase 10: Polish — Fechamento

- [ ] T047 Rodar os 31 smokes + `refraction` + `gpuTiming` `--headless` no fonte e com `--dist` (após `npm run build:lib`), todos passando sem exceção; conferir Chrome/crashpad órfãos ao fim
- [ ] T048 `npm run bench:check` contra o baseline; regravar o baseline; registrar em `specs/034-ray-refraction-debts/baseline-check.md`
- [ ] T049 `npm run ci` verde (lint, formato, madge, knip, tsc, testes com cobertura, doc-coverage, build)
- [ ] T050 Gravar e enviar os vídeos: lente de vidro aproximando sobre o tabuleiro, vidros encadeados, copo d'água, água do campo com fundo nítido, cáusticas do lago e da água agitada, pano do `softSurface`

---

## Dependencies & Execution Order

- **Fase 1** → **Fase 2 (medição)** → **Fase 3 (acertos)** → **Fase 4 (US1 vidro)** → **Fase 5 (US1 água)**.
- **Fases 6 e 7** (bissecções) dependem só da Fase 1 e podem correr em paralelo com 2–5 (worktrees separados); as
  correções que tocarem os mesmos arquivos da refração (água, cáusticas) entram depois da Fase 5.
- **Fase 8** depois de 4–7; **Fase 9** depois de 4–7; **Fase 10** por último.

### Parallel Opportunities

- T002, T003; T008 com T005–T007; T017, T018, T019; T029 com T024–T026; T037, T038, T039; T044, T045, T046.

## Implementation Strategy

Entrega completa de todas as fases na ordem acima — sem escopo parcial. A medição vem primeiro porque mede o custo da
refração; o desacoplamento dos acertos não muda a imagem da 033 (verificado antes de seguir); cada falha herdada fecha
com a causa registrada e o critério original, salvo medida que prove o critério errado.

## Notas da implementação

- `Refraction` ficou em `src/elements/material/Refraction.ts` (junto dos materiais com transmissão), não em
  `elements/raytrace/`.
- Não há `RefractionFlow` à parte: os kernels do traçado (`refractionPipelines`) são preparados e despachados por quem
  tem os pedidos — `ForwardFlow` (vidro) e `WaterFlow` (água) —, no mesmo passe de computação. O traçado tem dois
  kernels por amostra (o caminho e a luz) pelo limite de buffers de armazenamento por estágio.
- A leitura da cópia no limite de interfaces é Catmull-Rom limitada aos 4 texels vizinhos (a B-spline borrava); a
  reutilização da cópia onde ela bastaria saiu (erros nas bordas, ganho de 0,2 ms).
- Acrescentados na implementação: o antisserrilhado da imagem refratada (FR-003a, pedido do usuário) e a dispersão
  adaptativa (o raio do verde no centro; os três canais onde a separação aparece), com a lista dos marcados em camadas
  por tipo de trabalho e processada em rodadas (`REFRACTION_ROUNDS`).
- SC-004 revisto pelo princípio dos limiares (fração do orçamento do quadro).
