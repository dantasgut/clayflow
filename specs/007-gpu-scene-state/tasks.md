# Tasks: Estado de cena na GPU e paridade de desempenho com o Three.js

**Feature**: `007-gpu-scene-state` | **Branch**: `feature/007-gpu-scene-state`
**Input**: plan.md, spec.md, research.md (A1–A15, R1–R15), data-model.md, contracts/ (scene-state, render-stages,
physics-gpu), quickstart.md

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: paralelizável (arquivos distintos, sem dependência pendente).
- **[USx]**: tarefa de fase de user story.
- Testes Vitest CPU-side são exigidos (Constituição V); quando listados em par, o teste vem antes da implementação. A
  verdade da GPU é validada por smokes (`src/__smokes__`, `npm run smoke -- <nome>`) e o desempenho por
  `npm run bench -- --scene <cena>` e `npm run bench:check`.
- **Regra de preservação**: toda tarefa que muda um estágio, um kernel ou o envio termina com
  `npm run smoke -- trajectories,render` verde (trajetória bit a bit nas três taxas; imagem idêntica, ou na tolerância
  de R10 depois de aprovada) e `npm test` verde.
- **Sem helpers**: nada contorna a C2; agrupamento, posse, envio e leitura são da C2; a semântica (chave de grupo,
  matemática de câmera, broadphase) é dos estágios.

## Path Conventions

- C1 `src/core/`, C2 `src/scene/` (testes em `src/scene/__tests__/`), C3 `src/elements/` (testes em
  `src/elements/**/__tests__/`), C4 `src/presentation/` (testes em `src/presentation/**/__tests__/`).
- Doubles: `src/scene/__tests__/helpers/countingCore.ts`, `fakeSceneCore.ts`; harness de render
  `src/presentation/flows/__tests__/helpers/renderHarness.ts`.
- Documento: `clay-engine-doc/docs/guides/`.

---

## Phase 1: Setup — base de verificação

**Purpose**: fixar números e referências antes de mexer (plano, fase 1).

- [ ] T001 Registrar a linha de base verde da branch: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run smoke -- trajectories,render,rigidContacts,churn,bigMesh`; anotar abaixo deste item em `specs/007-gpu-scene-state/tasks.md`
- [ ] T002 [P] Medir com `countingCore` e anotar abaixo deste item: com 1000 caixas idênticas (material próprio, `Transform`), buffers de geometria criados, draws por passe no forward e na sombra, escritas por quadro com 1000 `Transform` mudados, e eventos `resourceReady` entregues; com 1000 corpos rígidos, leituras GPU→CPU por quadro e invocações da narrowphase por substep
- [ ] T003 [P] Teste de referência do conjunto de contatos: smoke `src/__smokes__/contactSet.ts` que roda as cenas de 1k e 10k corpos do `rigidContacts` por 60 passos e grava, por substep, o conjunto de contatos (par, feature) ordenado da narrowphase exaustiva atual como fixture `src/__smokes__/fixtures/contacts-<perfil>.bin`; documentar em `src/__smokes__/README.md`
- [ ] T004 [P] Smoke `src/__smokes__/scale1m.ts`: monta 1 milhão de caixas idênticas com material e `Transform` próprios, mede heap JS (`performance.memory` quando houver), memória de GPU (`core.memoryUsage`) e tempo até o primeiro quadro; registra o estado atual (esperado: falha ou trava — anotar) em `src/__smokes__/README.md`
- [ ] T005 [P] Medir a imagem com matrizes de câmera e de sombra calculadas em `f32` (R10): no smoke `render`, opção de diagnóstico que empacota as matrizes de referência arredondadas por um cálculo `Math.fround` passo a passo equivalente ao kernel; anotar abaixo deste item a contagem de pixels diferentes e o maior desvio por cena (decide se a tolerância de R10 será necessária)

---

## Phase 2: Foundational — mecanismos da C2

**Purpose**: peças genéricas que todas as histórias usam (contracts/scene-state.md).

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

- [ ] T006 [P] Testes do envio por delta em `src/scene/__tests__/ResourceSystem.deltaUpload.test.ts`: slot O(1) no envio e na liberação (sem varrer ocupantes — teste com 10 mil ocupantes e contagem de acessos), uma escrita por faixa contígua suja, último valor do quadro, faixa quebrada em slot de posse da GPU, crescimento sem reempacotar (contagem de `pack`) com cópia na GPU registrada no quadro seguinte
- [ ] T007 Implementar R5 em `src/scene/systems/ResourceSystem.ts`: `slotOfResource`, espelho por pool `'always'`, bitset de sujos, empacotamento no espelho e escritas por faixa no `frameRecording`, crescimento com `Frame.copy` pendente para o próximo `frameRecording` (pools `'always'` e `'initial'` pelo mesmo caminho), liberação O(1)
- [ ] T008 [P] Testes de eventos agregados em `src/scene/__tests__/poolWritten.test.ts`: `poolWritten { poolKey, ranges }` uma vez por pool por quadro; entregue só a runtimes cujo slot ou `listens` cobre o pool; `resourceReady` só para Resources individuais; `entitiesChanged` um por conjunto por quadro com `added`/`removed` agregados
- [ ] T009 Implementar `poolWritten` e o índice pool → runtimes em `src/scene/systems/flowBinding/FlowBinder.ts`, `FlowRuntime.ts` e no mapa de eventos (`src/scene/events/`); agregação de `entitiesChanged` em `framePrepare` (R6); remover o `resourceReady` de dados de pool e o `getDescriptors()` por evento
- [ ] T010 [P] Testes de dedup em `src/scene/__tests__/geometryDedup.test.ts`: duas geometrias com a mesma `contentKey` → um buffer de vértice e um de índice (contagem de `create`), conteúdo escrito uma vez; remoção da primeira mantém, da última destrói; `data.vertices` atribuído → chave nova, spec antiga liberada; geometria sem conteúdo → erro com a entidade
- [ ] T011 Implementar a dedup em `src/scene/systems/ResourceSystem.ts`: discriminador `${desc.id}:${schema.name}:${contentKey}` para `vertex`/`index`; escrita só na criação; troca de chave por atribuição (copy-on-write); `contentKey` lido por contrato (`Resource` com `contentKey?: string` em `src/scene/contracts/Resource.ts`, sem a C2 conhecer `Geometry`)
- [ ] T012 [P] Testes de grupos em `src/scene/__tests__/entityGroups.test.ts`: invariantes (cada entrada em um grupo, Σ count = |conjunto|, segmentos sem sobreposição); inserção, remoção (troca com o último, 1 escrita), mudança de chave por troca de Resource e por envio; segmento que excede muda para o fim; lista que cresce emite `poolReallocated`/`bindGroupReplaced`; grupo vazio fora de `groups`; com a cena parada, `framePrepare`/`frameRecording` não chamam `key` nem percorrem entradas (contagem)
- [ ] T013 Implementar `groups` em `src/scene/flows/slots.ts` (`DrawGroup`, `BoundEntities.groups/instances`) e a manutenção na C2 (`src/scene/systems/flowBinding/EntityGroups.ts`, novo): segmentos por classe de tamanho, escrita em faixas no `frameRecording`, reavaliação de chave nas entradas enviadas no quadro
- [ ] T014 [P] Testes de posse em `src/scene/__tests__/ownership.test.ts`: `owns` marca o slot após o primeiro envio; mutação ignorada com aviso único; saída do conjunto devolve a posse e reenvia; crescimento preserva o dado da GPU (cópia, não espelho); dois conjuntos possuindo o mesmo descritor → erro com os Flows
- [ ] T015 Implementar `owns` em `src/scene/flows/slots.ts` e `src/scene/systems/ResourceSystem.ts` (bitset `gpuOwned`, aviso único, retorno da posse)
- [ ] T016 [P] Testes de leitura em `src/scene/__tests__/worldRead.test.ts`: `world.read` de Resource em pool e individual, pedidos do quadro agrupados por pool (uma cópia por faixa), Resource removido → `undefined`, sem pedido → nenhuma leitura
- [ ] T017 Implementar `read`/`readAll` em `src/scene/systems/ResourceSystem.ts` e a fachada `src/scene/world/World.ts` (staging por pool, cópia no `frameRecording`, `readback` depois do envio, desempacotamento pelo schema)
- [ ] T018 Passar `npm test`, `npx tsc --noEmit` e `npm run smoke -- trajectories,render,churn` com a fundação ligada e os consumidores atuais (o `TransformFlow` passa a reagir a `poolWritten`); anotar abaixo deste item as escritas por quadro de T002 com o envio por faixas

**Checkpoint**: mecanismos genéricos prontos; nenhum estágio ainda usa grupos, posse ou leitura.

---

## Phase 3: User Story 2 - Objetos em movimento enviam só o que mudou, em lote (Priority: P1)

**Goal**: `10k-moving` com escritas proporcionais a faixas, não a objetos.

**Independent Test**: contagem de escritas e de notificações com 10 mil `Transform` mudados; CPU de
`instances/10k-moving` no bench.

- [ ] T019 [US2] Teste de integração em `src/scene/__tests__/integration/movingTransforms.test.ts`: 10 mil `Transform` mudados por quadro → escritas = faixas sujas, uma notificação por pool e estágio interessado, `TransformFlow` despacha uma vez
- [ ] T020 [US2] Migrar os ouvintes de `resourceReady` de dado de pool para `poolWritten`: `src/elements/scene/flows/TransformFlow.ts`, `src/presentation/flows/ShadowFlow.ts` (luz), demais `listens` em `src/elements/**` e `src/presentation/**`
- [ ] T021 [US2] Medir `npm run bench -- --scene instances --variant 10k-moving --engine clayflow` e anotar abaixo deste item a CPU por quadro (meta SC-004 ≤ 3 ms ao fim da spec; aqui o efeito do envio)

**Checkpoint**: envio por delta em uso; trajetórias e imagem verdes.

---

## Phase 4: User Story 1 - Muitas cópias do mesmo objeto custam como uma (Priority: P1)

**Goal**: dedup de geometria e um draw por grupo no forward e na sombra.

**Independent Test**: `instances/10k` com 1 draw e 1 cópia de geometria; imagem idêntica.

- [ ] T022 [P] [US1] Testes em `src/elements/geometry/__tests__/contentKey.test.ts`: chave por parâmetros (`Box`, `Sphere`, `Plane`, `ParametricGeometry`, `ParametricSurfaceGeometry`), por hash de bytes na genérica (colisão de hash com bytes diferentes → chaves diferentes), arrays gerados uma vez por chave e congelados, nenhuma geração no construtor
- [ ] T023 [US1] Implementar `contentKey` e o cache de conteúdo por chave em `src/elements/geometry/Geometry.ts` e nas paramétricas (`BoxGeometry.ts`, `SphereGeometry.ts`, `PlaneGeometry.ts`, `ParametricGeometry.ts`, `ParametricSurfaceGeometry.ts`); `PointCloudGeometry.ts` por hash dos bytes
- [ ] T024 [P] [US1] Testes em `src/presentation/flows/__tests__/ForwardFlow.groups.test.ts`: 10 mil entidades, mesma geometria e schema → 1 draw com 10 mil instâncias; 2 geometrias × 2 schemas → 4 draws; escala espelhada → variante de face; troca de material de schema muda de grupo; remoção some do draw; com a cena parada nenhuma iteração por entidade no `dispatch` (contagem)
- [ ] T025 [US1] Migrar `src/presentation/flows/ForwardFlow.ts` para `groups` (`forwardKey`, `instance: 'record'`, draw por grupo) e `src/elements/gpu/wgsl/forward.wgsl` para `renderables[instances[instance_index]]`
- [ ] T026 [P] [US1] Testes em `src/presentation/flows/__tests__/ShadowFlow.groups.test.ts`: um draw por (geometria, face); instâncias pelo slot do `WorldTransform`
- [ ] T027 [US1] Migrar `src/presentation/flows/ShadowFlow.ts` e `src/presentation/flows/shadow_depth.wgsl` para `groups` (`shadowKey`, `instance: [Transform, 'world']`)
- [ ] T028 [US1] Smokes `render`, `churn`, `bigMesh` (fonte) verdes; medir `npm run bench -- --scene instances --engine clayflow` e anotar abaixo deste item draws, CPU e GPU de `10k`, `100k` e `1m`

**Checkpoint**: instâncias agrupadas; imagem idêntica.

---

## Phase 5: User Story 3 - Física sem volta pela CPU e com broadphase (Priority: P1)

**Goal**: pose escrita na GPU, nenhuma leitura de pose por quadro, broadphase com o mesmo conjunto de contatos.

**Independent Test**: contagem de leituras; smoke `contactSet` contra a fixture de T003; trajetórias; bench
`rigid-bodies`.

- [ ] T029 [P] [US3] Testes em `src/elements/physics/__tests__/LCPFlow.pose.test.ts`: conjunto `poses` com `owns` do `Transform`; nenhuma leitura de GPU por quadro (contagem no `countingCore`); mutação do `Transform` de um corpo ignorada com aviso; corpo removido deixa de ter registro no quadro seguinte
- [ ] T030 [US3] Kernel `src/elements/gpu/wgsl/kernels/rb_publish_pose.wgsl` e `PoseRecord` (schema gerado) em `src/elements/physics/`; `LCPFlow` declara `poses` com `record` e `owns` e despacha a publicação no fim do passo
- [ ] T031 [US3] Remover o readback por quadro do `LCPFlow` (staging, `requestReadback`, `startReadback`, `applyTransformsFromReadback`, mapa slot→entidade) e ligar o diagnóstico de excedente por `world.read` a cada 60 passos, sem bloquear, com aviso único
- [ ] T032 [US3] Migrar os smokes e testes que liam `transform.data` de corpos para `world.read`: `src/__smokes__/trajectories.ts`, `rigidContacts.ts`, `integration.ts`, `stress60s.ts` e testes em `src/elements/physics/__tests__/`; trajetórias bit a bit nas três taxas
- [ ] T033 [P] [US3] Testes CPU da grade hash em `src/elements/gpu/__tests__/SpatialHashGrid.test.ts` (hash de célula, tamanho da tabela 2^k ≥ 2·proxies, recriação ao crescer, nomes explícitos de bindings)
- [ ] T034 [US3] Variante hash da busca de vizinhança: `src/elements/gpu/SpatialHashGrid.ts` e kernels `src/elements/gpu/wgsl/kernels/sh_assign_count.wgsl`, `sh_scatter.wgsl` sobre `PrefixSum` (a grade limitada da `NeighborSearchPipeline` continua para SPH/PBF)
- [ ] T035 [US3] Kernels `rb_collider_proxies.wgsl` (esfera envolvente na pose predita + margem do passo; lista "sempre" para planos e grandes) e `rb_candidate_pairs.wgsl` (27 células + "sempre", listas por forma, contadores, argumentos indiretos) em `src/elements/gpu/wgsl/kernels/`; célula calculada na CPU pela intenção dos colliders e atualizada por evento em `LCPFlow.ts`
- [ ] T036 [US3] `rb_narrowphase.wgsl` lendo `(rb_i, col_j)` dos pares por forma e despacho por `workgroupsIndirect` em `LCPFlow.ts`; capacidade `N × maxPairsPerBody` (opção, padrão 64) com excedente no diagnóstico; broadphase uma vez por passo, narrowphase por substep
- [ ] T037 [US3] Smoke `contactSet` contra a fixture de T003 (conjunto igual por substep em 1k e 10k) e `trajectories` bit a bit; contar pares testados em `rigid-bodies/10k` (SC-006 ≤ 1% de N·M) e anotar abaixo deste item
- [ ] T038 [US3] Medir `npm run bench -- --scene rigid-bodies` (clayflow e three) e anotar abaixo deste item fps, p99, CPU e GPU de `1k` e `10k`

**Checkpoint**: física sem readback e com broadphase; trajetórias bit a bit.

---

## Phase 6: User Story 4 - Câmera calculada na GPU a partir de Camera + Transform (Priority: P2)

**Goal**: matrizes de câmera na GPU; `Input` como Resource; controllers mutando o `Transform`.

**Independent Test**: matrizes contra a referência; `aspect` no resize; orbit girando a imagem como hoje.

- [ ] T039 [P] [US4] Funções `perspective`, `orthographic` e `inverse_rigid` em `wgslLib.camera` (`src/elements/gpu/wgsl/lib/`) com teste de composição em `src/elements/gpu/__tests__/wgslLib.camera.test.ts`
- [ ] T040 [P] [US4] Testes em `src/elements/scene/__tests__/Camera.test.ts`: descritores `camera` (params, `'always'`) e `matrices` (`'never'`) no mesmo slot; câmera sem `Transform` → erro com a entidade; `aspectMode: 'canvas'` atualizado em `canvasReconfigured`
- [ ] T041 [US4] Reescrever `src/elements/scene/Camera.ts` (params + matrices, vocabulário de domínio) e criar `src/elements/scene/flows/CameraFlow.ts` + `src/elements/gpu/wgsl/kernels/camera_compose.wgsl` (fase `transform`, abaixo do `TransformFlow`, registro `CameraRecord`)
- [ ] T042 [US4] Forward lê `cameras[frame.cameraSlot]`: `ForwardFrameParams` com `cameraSlot`, escrito quando a câmera ativa muda; resolver da câmera ativa em `src/elements/consumers.ts`; `forward.wgsl` e `shadow_depth.wgsl` se usarem câmera
- [ ] T043 [P] [US4] Testes em `src/scene/__tests__/Input.test.ts`: `Input` singleton no World, API de consulta, eventos, `consumes: ['Input']`
- [ ] T044 [US4] Mover `Input` para `src/scene/input/Input.ts` como Resource; devices da C4 (`src/presentation/input/*Device.ts`) escrevem nele; `Application.create` o insere; `SingletonResolver('Input')` em `src/scene/SceneContext.ts`
- [ ] T045 [P] [US4] Testes em `src/presentation/input/__tests__/controllers.test.ts`: orbit, fly e fps mutam só `transform.data.position/rotation` a partir de `Input` e `dt`; nenhuma matriz calculada (verificação no gate: nenhum controller importa `mat4.perspective/lookAt`)
- [ ] T046 [US4] Reescrever `OrbitController.ts`, `FlyController.ts`, `FpsController.ts` como Resources com `tick(input, dt, transform)` e `InteractionSystem.ts` percorrendo os controllers do World; `Application.ts` reage a `canvasReconfigured` com o `aspect`
- [ ] T047 [US4] Câmera pelo modelo novo no bench (`bench/engines/clayflow.ts`, sem `cameraMatrices`), nos smokes (`src/__smokes__/render.ts` e demais) e nos exemplos; imagem do smoke `render` contra a fixture (tolerância de R10 só se T005 a exigir, registrada e submetida ao PR)

**Checkpoint**: câmera na GPU; nenhuma matriz de câmera na CPU.

---

## Phase 7: User Story 6 - Luz e sombra lidas do estado de cena (Priority: P2)

**Goal**: forward pelo pool `Light`; matriz da sombra na GPU.

**Independent Test**: cena com sombra contra a fixture; nenhuma escrita de luz por quadro pela CPU.

- [ ] T048 [P] [US6] Testes em `src/presentation/flows/__tests__/ForwardFlow.light.test.ts`: `lightSlot` da direcional que projeta (sentinela sem ela); nenhuma escrita de `ForwardFrameParams` por quadro sem mudança
- [ ] T049 [US6] Forward lê `lights[frame.lightSlot]` em `forward.wgsl`; `ForwardFlow.ts` sem cálculo de direção na CPU
- [ ] T050 [US6] `ShadowMap` com `params` + `shadowMatrix` (`src/elements/scene/ShadowMap.ts`); `ShadowMatrixFlow.ts` + `shadow_matrix.wgsl` (fase `transform`, depois do `CameraFlow`); `ShadowFlow` sem `listens` nem matriz na CPU; smoke `render` verde

**Checkpoint**: estado de luz na GPU.

---

## Phase 8: User Story 5 - Hierarquia opcional de Transform (Priority: P2)

**Goal**: `Parent` composto por níveis na GPU.

**Independent Test**: cadeia pai → filho → neto com matrizes conferidas.

- [ ] T051 [P] [US5] Testes em `src/elements/scene/__tests__/Parent.test.ts`: níveis mantidos por evento; ciclo, pai sem `Transform` e `Parent` em `Transform` de posse da GPU → erro; pai removido → filhos raízes com aviso; sem `Parent`, um despacho só (contagem)
- [ ] T052 [US5] `src/elements/scene/Parent.ts` e `TransformFlow.ts` com `hierarchy` e listas por nível; `transform_compose.wgsl` com variante por nível (`world = world[pai] · TRS`)
- [ ] T053 [US5] Smoke `transforms` estendido com a cadeia (matrizes contra referência em `f32`) em `src/__smokes__/transforms.ts`

**Checkpoint**: hierarquia opcional.

---

## Phase 9: User Story 7 - Escala de um milhão de entidades (Priority: P2)

**Goal**: `instances/1m` roda o protocolo.

**Independent Test**: smoke `scale1m` e `npm run bench -- --scene instances --variant 1m`.

- [ ] T054 [US7] Rodar `npm run smoke -- scale1m` e anotar heap JS, memória de GPU e tempo até o primeiro quadro abaixo deste item; se o heap passar de 1,5 GB, passar as entradas dos conjuntos (`EntityEntry`) para índices em arrays tipados em `src/scene/systems/flowBinding/FlowRuntime.ts` e medir de novo
- [ ] T055 [US7] `npm run bench -- --scene instances --variant 1m` completa as 3 repetições; anotar CPU, GPU e memória

**Checkpoint**: escala de 1 milhão.

---

## Phase 10: User Story 8 - Causa do residual de GPU explicada (Priority: P3)

- [ ] T056 [US8] Medir a GPU de `instances/10k` com o render agrupado; se > 0,52 ms, rodar os experimentos de R14 (a)–(d) isolados (timestamps por passe) e anotar abaixo deste item a causa e os números

---

## Phase 11: Polish & Cross-Cutting

- [ ] T057 [P] Bench: limitações resolvidas fora de `bench/scenes/*/scene.ts` (instancing, readback, envio por objeto, narrowphase O(N·M)); `bench/README.md` e guia `benchmark.md` atualizados
- [ ] T058 [P] Documento de arquitetura `clay-engine-doc/docs/guides/architecture_resource_loaders.md`: pools (câmera, `shadowMatrix`), grupos de instâncias, posse por conjunto, envio por delta, `poolWritten`, leitura sob demanda, `Input` na C2, controllers, `Parent`, broadphase; marcas "alvo da F2/007" atendidas viram estado atual
- [ ] T059 [P] Guias: `flows.md` (`groups`, `owns`), câmera/input, física (broadphase, `world.read`), guia de migração (câmera, controllers, `Input`, `resourceReady` de pool → `poolWritten`, pose por `world.read`)
- [ ] T060 [P] `specs/ROADMAP.md` (status da F2/007; vertex pulling e arena para a F7 com o motivo de R4; broadphase e envio por delta antecipados) e `specs/PENDENCIAS.md` (E2, E3, E5 resolvidos; §0 com o SC-010 da 006)
- [ ] T061 JSDoc em todo export novo; `npm run doc:coverage` sem membro sem documentação; `npm run doc` (API regenerada)
- [ ] T062 Smokes completos no fonte e no dist: `npm run build:lib && npm run smoke -- time,transforms,integration,multiApp,limits,churn,bigMesh,rigidContacts,contactSet,scale1m,stress60s,trajectories,render,shaderLibrary,computeKernels` e o mesmo com `--dist`; registrar em `src/__smokes__/README.md`
- [ ] T063 Bench contra as metas (SC-001–SC-007) com a máquina livre: `npm run bench -- --scene instances` e `--scene rigid-bodies` (clayflow e three); anotar abaixo deste item a tabela meta × medido
- [ ] T064 `npm run bench:check` com a máquina livre contra o baseline do Chrome 155; se verde, `npm run bench:baseline`; anotar abaixo deste item
- [ ] T065 Gate completo: `npm run format:check`, `npm run lint`, `npx tsc --noEmit`, `npm run test:coverage`, `npm run build:lib`; marcar `specs/007-gpu-scene-state/spec.md` com o status e `checklists/requirements.md`

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (bloqueia todas as histórias).
- **US2 (Phase 3)** depende de T007/T009. **US1 (Phase 4)** depende de T011/T013. **US3 (Phase 5)** depende de
  T015/T017 (posse e leitura). **US4 (Phase 6)** depende de T009 e usa registros da 006. **US6 (Phase 7)** depende de
  US4 (ordem na fase `transform`). **US5 (Phase 8)** depende de T015 (rejeição de `Parent` em posse da GPU). **US7
  (Phase 9)** depende de US1 e US2. **US8 (Phase 10)** depende de US1.
- **Polish** depois de todas as histórias; T064 depois de T063; T065 por último.
- Dentro de cada história: teste antes da implementação; smokes de preservação ao fim de cada tarefa que muda estágio.

## Parallel Opportunities

- Phase 1: T002, T003, T004, T005.
- Phase 2: testes T006, T008, T010, T012, T014, T016 em paralelo; implementações em sequência no `ResourceSystem`
  (T007 → T011 → T015 → T017) e T009/T013 nos arquivos de `flowBinding`.
- Depois da Phase 2: US2, US1 e US3 em paralelo por arquivos distintos (envio × render × física); US4 em paralelo com
  US3.
- Polish: T057–T060 em paralelo.

## Implementation Strategy

Entrega completa em ordem de dependência: base de verificação → mecanismos da C2 → envio por delta → instâncias →
física e broadphase → câmera e `Input` → luz e sombra → `Parent` → escala → residual → documentação e fechamento. Cada
fase termina com trajetórias e imagem verdes; nenhuma fase é ponto de parada — a spec só fecha com todas as tarefas,
o gate e o `bench:check` verdes.
