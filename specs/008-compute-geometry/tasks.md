# Tasks: Geometria em compute — partículas, fluidos e corpos moles na tela

**Feature**: `008-compute-geometry` | **Branch**: `feature/008-compute-geometry`
**Input**: plan.md, spec.md, research.md (A1–A18, R1–R12), data-model.md, contracts/ (pool-ranges, render-stages),
quickstart.md

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: paralelizável (arquivos distintos, sem dependência pendente).
- **[USx]**: tarefa de fase de user story.
- Testes Vitest CPU-side são exigidos (Constituição V); quando listados em par, o teste vem antes da implementação. A
  verdade da GPU é validada por smokes (`src/__smokes__`, `npm run smoke -- <nome>`) e o desempenho por
  `npm run bench -- --scene <cena>` e `npm run bench:check`.
- **Regra de preservação**: toda tarefa que muda um estágio, um kernel, o envio ou a alocação termina com
  `npm run smoke -- trajectories render` verde (trajetória bit a bit nas três taxas; imagem idêntica — até a T047,
  depois contra as fixtures regravadas) e `npm test` verde.
- **Sem helpers**: nada contorna a C2; faixas, vivos, referências de slot e posse são da C2, sem semântica de domínio;
  posição, normais, sprites e topologia são dos estágios (C3/C4).

## Path Conventions

- C1 `src/core/`, C2 `src/scene/` (testes em `src/scene/__tests__/`), C3 `src/elements/` (testes em
  `src/elements/**/__tests__/`), C4 `src/presentation/` (testes em `src/presentation/**/__tests__/`).
- Doubles: `src/scene/__tests__/helpers/countingCore.ts`, `fakeSceneCore.ts`; harness de render
  `src/presentation/flows/__tests__/helpers/renderHarness.ts`; corpos de teste
  `src/elements/physics/__tests__/helpers/solverBodies.ts`.
- Documento: `clay-engine-doc/docs/guides/`.

---

## Phase 1: Setup — base de verificação

**Purpose**: fixar números e referências antes de mexer (plano, fase 1).

- [ ] T001 Registrar a linha de base verde da branch: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run smoke -- trajectories render computeKernels churn`; anotar abaixo deste item em `specs/008-compute-geometry/tasks.md`
- [ ] T002 [P] Teste que reproduz o defeito A3 em `src/elements/physics/__tests__/vacantSlots.test.ts`: inserir 10 `FluidBody` SPH, remover o 5º, verificar com `countingCore` que o dispatch seguinte ainda cobre o slot liberado (`particle_count` = 10) e que o slot entra na construção da grade; marcar `it.fails` até a T012 e anotar o resultado abaixo deste item
- [ ] T003 [P] Medir com `countingCore` e anotar abaixo deste item: com um fluido SPH de 1000 partículas e `PointSpriteMaterial`, draws por quadro de partícula (esperado 0), entidades no World, escritas e leituras GPU→CPU por quadro; com uma `PointCloudGeometry` com material e `Transform`, draws gravados (esperado 0, grupo pulado)
- [ ] T004 [P] Medir a diferença de imagem esperada da topologia: rodar o smoke `render` com a caixa de arame desenhada como linhas num build local descartável e registrar abaixo deste item quantos pixels mudam por cena (só a região da caixa) — base para a descrição do commit da T047; o build descartável não é comitado

**Checkpoint**: números de hoje e diferença de imagem esperada registrados.

---

## Phase 2: Foundational — mecanismos da C2

**Purpose**: peças genéricas que todas as histórias usam (contracts/pool-ranges.md, render-stages.md §Geometria da
GPU).

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

- [ ] T005 [P] Testes de empacotamento de faixa em `src/scene/descriptors/__tests__/StructSchema.range.test.ts`: `packRange(soa, start, n)` produz os mesmos bytes que `n` chamadas de `pack` com registros AoS (todos os tipos de campo do `FieldType`, inclusive `vec3` com padding e `mat3x3`); `unpackRange` é o inverso; campo ausente no SoA → padrão do schema; tamanho de array inconsistente → erro com o campo e os tamanhos
- [ ] T006 Implementar `packRange`/`unpackRange` em `src/scene/descriptors/StructSchema.ts` (reusando os passos de empacotamento existentes, sem alocação por registro)
- [ ] T007 [P] Testes de faixas em `src/scene/__tests__/ResourceSystem.poolRanges.test.ts`: descritor em pool com `count: N` ocupa `[first, first + N)`; `count` ausente = comportamento de hoje (mesmos slots, mesmos bytes); first-fit reaproveita intervalo livre de tamanho suficiente; liberação coalesce com vizinhos; sem intervalo → fim do pool com crescimento por dobra em laço; `count` diferente por pool no mesmo Resource → faixas independentes; `initial` empacota a faixa inteira numa escrita; `'always'` envia só as faixas sujas com índice local; `count` alterado depois da inserção → erro; `slotOf` devolve `first`; `rangeOf` devolve `{ first, count }`
- [ ] T008 Implementar R1 em `src/scene/descriptors/GPUDescriptor.ts` (`count` em pool, JSDoc) e `src/scene/systems/ResourceSystem.ts`: `Tracked.ranges` por pool, alocador de intervalos livres (lista ordenada, first-fit, coalescência), `occupy`/`release`/bits/`entityBySlot`/`initial` sobre a faixa, `occupantData` com índice local, `rangeOf` em `src/scene/flows/slots.ts` (`BoundPool`)
- [ ] T009 [P] Testes de leitura de faixa em `src/scene/__tests__/resourceRead.test.ts` (estender): `resources.read` de Resource com `span > 1` devolve o registro SoA da faixa numa cópia; `span = 1` inalterado
- [ ] T010 Implementar a leitura de faixa em `src/scene/systems/ResourceSystem.ts` (`ReadItem` com `span`, agrupamento por faixas existente, `unpackRange`)
- [ ] T011 [P] Testes de vivos em `src/scene/__tests__/poolLive.test.ts`: bitset `pool:<schema>:live` com 1 bit por slot ocupado; alocação e liberação escrevem o bit no mesmo `frameRecording` da faixa (uma escrita por faixa de palavras); crescimento copia/realoca o bitset e emite `bindGroupReplaced`; `BoundPool.live` exposto; pools sem consumidor de `live` não criam o buffer até o primeiro pedido
- [ ] T012 Implementar R2: bitset de vivos em `src/scene/systems/ResourceSystem.ts`, `BoundPool.live` em `src/scene/flows/slots.ts`, módulo WGSL `poolLive` (`pool_live`) na `wgslLib` (`src/scene/shaders/` ou onde a `wgslLib` vive), com teste de módulo em `src/scene/shaders/__tests__/`
- [ ] T013 [P] Testes de referência de slot em `src/scene/__tests__/slotRef.test.ts`: `FieldType.slotRef('Schema')` com `{ body, index }` resolve para `first(body) + index` no empacotamento; alvo inserido depois da referência → reempacotada no `poolWritten` da faixa do alvo; `slotRef('self:body')` com `index` resolve na faixa do próprio Resource; corpo fora do World, `index ≥ span` ou pool errado → erro nomeando a restrição, o corpo e o índice; WGSL do campo é `u32`
- [ ] T014 Implementar R3 em `src/scene/descriptors/FieldType.ts` (`slotRef`) e `src/scene/systems/ResourceSystem.ts` (resolução no empacotamento, índice alvo → referenciadores, reempacotamento por evento)
- [ ] T015 [P] Testes de geometria da GPU em `src/scene/__tests__/gpuGeometry.test.ts`: descritor `index` com `upload:'never'` sem `indexFormat` → erro; com `uint32` → buffer de `4·count` bytes; `slot.entities({ owns: [[Type, 'vertices']] })` aceita descritor individual (escritor registrado, sem envio, Resource `GpuManaged` no descritor); geometria `'never'` num grupo de draw sem escritor → aviso único nomeando a entidade
- [ ] T016 Implementar R6 (C2) em `src/scene/descriptors/GPUDescriptor.ts` (`indexFormat`), `src/scene/systems/ResourceSystem.ts` e `src/scene/flows/slots.ts` (`owns` individual, aviso de geometria sem escritor)
- [ ] T017 Passar `npm test`, `npx tsc --noEmit` e `npm run smoke -- trajectories render churn computeKernels` com a fundação ligada e todos os corpos ainda com `count = 1`; anotar abaixo deste item

**Checkpoint**: faixas, vivos, referências de slot e posse individual prontos; nenhum consumidor ainda os usa.

---

## Phase 3: User Story 2 - Corpo de partículas é uma entidade com arrays (Priority: P1)

**Goal**: `FluidBody`/`SoftBody` como contêineres de N partículas em faixa contígua; restrições por `(corpo, índice)`;
solvers ignorando slots mortos; trajetórias idênticas.

**Independent Test**: fluido de 10 000 partículas como um corpo; faixa contígua, uma entidade, remoção libera a faixa;
`trajectories` bit a bit com contêineres.

- [ ] T018 [P] [US2] Testes de autoria em `src/elements/physics/__tests__/particleBody.test.ts`: `FluidBody({ algorithm, position })` com N derivado (`position` com 4·N ou 3·N), campos opcionais com os padrões de hoje por partícula (MPM `F` identidade, `pred = pos`, `inv_mass` de `mass`), arrays inconsistentes → erro com campo e tamanhos, N = 0 → erro, N = 1 funciona, modo cru `{ schema, data, count }`; `SoftBody` com `mass` por partícula, `edges` e `surface` validados (índice fora → erro com o índice); descritor `body` com `count: N`; schema sem `pos: vec4f` → erro
- [ ] T019 [US2] Implementar `src/elements/physics/bodies/ParticleBody.ts` (base: `count`, dado SoA, validação, `positionField`), `FluidBody.ts` e `SoftBody.ts` (arrays, `edges` como descritor em pool no pool `DistanceConstraint` com `slotRef('self:body')`, `count` = número de arestas), tipos `*Data` exportados nos barris
- [ ] T020 [P] [US2] Testes de restrição em `src/elements/physics/__tests__/distanceConstraint.test.ts`: `DistanceConstraint({ a: { body, index }, b: { body, index }, restLength, compliance })` empacota slots absolutos; restrição entre dois corpos do mesmo pool; corpo de outro pool → erro
- [ ] T021 [US2] Implementar a nova `DistanceConstraint` em `src/elements/physics/constraints/DistanceConstraint.ts` (`slotRef` para o pool do corpo; sinônimos antigos removidos)
- [ ] T022 [US2] Kernels de partícula com `pool_live`: SPH, PBF, MPM (P2G, G2P, grade), XPBD (`predict`, `integrate`), FEM e a construção da vizinhança (`ns_*`) em `src/elements/gpu/wgsl/kernels/` e `src/elements/physics/flows/shaders/`; slot `live` ligado nos `SPHFlow`, `PBFFlow`, `MPMFlow`, `XPBDFlow`, `FEMFlow` (`src/elements/physics/flows/`); o teste da T002 passa a verde (remover `it.fails`)
- [ ] T023 [US2] Teto de partículas (R10): constante exportada do estágio de vizinhança (`src/elements/gpu/NeighborSearchPipeline.ts`), validação na inserção pelos `SPHFlow`/`PBFFlow` (transição `entitiesChanged`) com erro nomeando corpo, pedido e teto; teste em `src/elements/physics/__tests__/particleCap.test.ts`
- [ ] T024 [US2] Migrar os testes que montam uma entidade por partícula para contêineres: `softFluidAuthoring.test.ts`, `bodyUploadPolicy.test.ts`, `fluidMaterial.test.ts`, `helpers/solverBodies.ts`, `XPBDFlow.time.test.ts`, `defaultFlows.test.ts`, `{SPH,PBF,FEM,MPM}Flow.time.test.ts` em `src/elements/physics/__tests__/`
- [ ] T025 [US2] Migrar o smoke `src/__smokes__/trajectories.ts` (R9): `block()`/`FLUID_BLOCK` produzem arrays na mesma ordem e com o mesmo jitter; um corpo por cena; corrente XPBD como um `SoftBody` com 31 `edges`; rodar sem `--record` e confirmar a fixture inalterada nas 7 cenas × 3 taxas; anotar abaixo deste item
- [ ] T026 [US2] Teste de reuso de faixa em `src/elements/physics/__tests__/vacantSlots.test.ts` (estender): inserir e remover corpos de contagens diferentes 100 vezes; faixas reaproveitadas, pool sem crescer além do pico, corpos vivos com o mesmo `first`

**Checkpoint**: corpos-contêiner simulados; trajetórias bit a bit; defeito A3 corrigido.

---

## Phase 4: User Story 1 - Fluido simulado aparece na tela (Priority: P1)

**Goal**: corpos de partículas desenhados como sprites instanciados lendo o pool; um draw por corpo; zero leituras.

**Independent Test**: smoke `particles` com SPH, PBF e MPM; pixels nas posições simuladas e movimento entre quadros.

- [ ] T027 [P] [US1] `PointSpriteMaterial` com struct WGSL próprio (`color`, `radius`, …) em `src/elements/material/PointSpriteMaterial.ts` (sem alias de `StandardMaterial`); teste do schema e do struct gerado em `src/elements/material/__tests__/`
- [ ] T028 [P] [US1] Testes do `ParticleFlow` em `src/presentation/flows/__tests__/ParticleFlow.test.ts` (harness de render): um draw `vertices(6, span)` por corpo com material de sprite (3 corpos = 3 draws); `ParticleDrawParams` escrito na inserção e quando a faixa muda, não por quadro com a cena parada (contagem); corpo sem material de sprite → aviso único e fora do desenho; pool que cresce → bind group trocado; 0 leituras GPU→CPU por quadro
- [ ] T029 [US1] Implementar `src/presentation/flows/ParticleFlow.ts` (fase `forward`, depois do `ForwardFlow`, `loadOp: 'load'`, profundidade ligada, slot `entities({ all: [ParticleBody, Material] })`, bind do pool por schema, `ParticleDrawParams` por offset dinâmico) e o shader `particle_sprite` (quad por `vertex_index`, posição por `stride_vec4`/`pos_offset_vec4`, posição não finita fora do clip, impostor esférico iluminado pela luz do pool, descarte fora do círculo); registrar em `src/presentation/flows/defaults.ts` e no `renderHarness`
- [ ] T030 [US1] Smoke `src/__smokes__/particles.ts`: tanque com SPH, PBF, MPM fluido e MPM sólido (um corpo cada, câmera fixa), captura nos quadros 30 e 90; referência `fixtures/particles-<perfil>.png` (`--record`) e verificação de movimento (as duas capturas diferem na região do fluido); contagem de leituras por quadro = 0; documentar em `src/__smokes__/README.md`
- [ ] T031 [US1] Teste de oclusão no smoke `particles`: caixa na frente de parte do fluido; os pixels da caixa permanecem na captura (profundidade compartilhada com o forward)

**Checkpoint**: fluidos visíveis, um draw por corpo, sem leitura de volta.

---

## Phase 5: User Story 3 - Corpo mole desenhado como malha deformável (Priority: P1)

**Goal**: `SoftBody` com `surface` desenhado como malha com normais recalculadas por kernel; sombra.

**Independent Test**: smoke `softSurface` com tecido XPBD preso por dois cantos, iluminado e com sombra.

- [ ] T032 [P] [US3] Testes da superfície em `src/elements/physics/__tests__/softSurface.test.ts`: `SoftBody` com `surface` cria uma `SurfaceGeometry` como parte (vertices `'never'` 32 B × N, indices `'initial'` `uint32`, adjacência CSR `'initial'`); o `SoftSurfaceFlow` declara `owns` do `vertices`, despacha dois kernels por corpo por quadro e nenhuma escrita da CPU por quadro (contagem)
- [ ] T033 [US3] Implementar `src/elements/geometry/SurfaceGeometry.ts` e a criação no `SoftBody` (adjacência vértice → triângulos montada uma vez na criação)
- [ ] T034 [US3] Implementar `src/elements/physics/flows/SoftSurfaceFlow.ts` (fase `transform`, depois dos solvers) e os kernels `soft_face_normals.wgsl` e `soft_vertex_write.wgsl` em `src/elements/gpu/wgsl/kernels/` (posição da faixa do pool, normal média dos triângulos adjacentes, uv); registrar em `src/elements/physics/defaultFlows.ts` (ou o registro de estágios da C3 equivalente)
- [ ] T035 [US3] Smoke `src/__smokes__/softSurface.ts`: tecido XPBD 32×32 com `edges` e `surface`, `StandardMaterial`, luz direcional com sombra, presos dois cantos (massa 0); FEM de 64 nós como sprites; capturas nos quadros 30 e 120 com referência e verificação de movimento; sombra do tecido visível no chão (pixels mais escuros que a referência sem sombra)

**Checkpoint**: corpo mole visível como malha deformável com sombra.

---

## Phase 6: User Story 4 - Geometria produzida por um estágio de compute (Priority: P2)

**Goal**: `PointCloudGeometry` e qualquer geometria `'never'` desenhadas sem envio da CPU; draw não indexado e
indireto.

**Independent Test**: smoke `pointCloud` com espiral de 10 000 pontos escrita por kernel.

- [ ] T036 [P] [US4] Testes em `src/presentation/flows/__tests__/gpuGeometry.forward.test.ts`: geometria sem índices → `draw.vertices(vertexCount, instâncias)`; `PointCloudGeometry` com `activeCount` → contagem desenhada; com contagem indireta declarada pelo escritor → `draw.indirect`; geometria `'never'` fora da dedup; sombra idem
- [ ] T037 [US4] `PointCloudGeometry` em `src/elements/geometry/PointCloudGeometry.ts`: `vertices` `role:'vertex'` `'never'` no layout de 32 B, `count: maxPoints`, `activeCount`, contagem indireta opcional (descritor `indirect` `'never'`); `ForwardFlow`/`ShadowFlow` com draw não indexado e indireto (`src/presentation/flows/`)
- [ ] T038 [US4] Smoke `src/__smokes__/pointCloud.ts`: estágio de teste (no próprio smoke, declarado com `owns: [[PointCloudGeometry, 'vertices']]`) escreve uma espiral animada de 10 000 pontos por kernel; `PointSpriteMaterial`; referência e movimento; 0 envios da CPU para a geometria por quadro

**Checkpoint**: geometria produzida pela GPU desenhada pelo forward.

---

## Phase 7: User Story 5 - Topologia do material respeitada (Priority: P2)

**Goal**: triângulos, linhas e pontos conforme o material; sombra por material.

**Independent Test**: caixa com cada material; arestas, sprites, faces; grupos de draw por topologia.

- [ ] T039 [P] [US5] Testes em `src/elements/material/__tests__/topology.test.ts`: `Material.topology` do descritor de pipeline; `castsShadow` padrão (triângulos `true`, linhas e pontos `false`) e opção no construtor
- [ ] T040 [US5] Implementar `topology`/`castsShadow` em `src/elements/material/Material.ts` e nos três materiais
- [ ] T041 [P] [US5] Testes de grupos em `src/presentation/flows/__tests__/RenderGroups.test.ts` e `ForwardFlow.perEntity.test.ts` (atualizar): chave com topologia; mesma geometria com dois materiais de topologia diferente → dois grupos; pipeline com a topologia do material e `cullMode` só em triângulos; sombra só de materiais com `castsShadow` (`[10, 10]` no caso standard + wireframe)
- [ ] T042 [US5] Forward com topologia em `src/presentation/flows/ForwardFlow.ts`: chave, pipeline por topologia, `cullMode`; linhas com índice de arestas privado por geometria
- [ ] T043 [P] [US5] Testes do kernel de arestas em `src/presentation/flows/__tests__/edgeIndices.test.ts`: índice de arestas criado na entrada do grupo de linhas (6·T índices `uint32`), um por chave de conteúdo, refeito no `resourceReady` da geometria, liberado com o último grupo
- [ ] T044 [US5] Kernel `edges_from_triangles.wgsl` em `src/elements/gpu/wgsl/kernels/` e o despacho no `ForwardFlow` (fase do forward, antes do passe, só quando o índice é criado ou refeito)
- [ ] T045 [US5] Sprites de vértice no forward: pipeline de sprite para `point-list` (sem vertex buffers, posição do vertex buffer da geometria lida como storage, `draw.vertices(6 · vertexCount, group.count)`, `vertex_index / 6` = vértice) em `src/presentation/flows/ForwardFlow.ts` e shader `point_sprite` (compartilhando o fragment do `particle_sprite`)
- [ ] T046 [US5] `ShadowFlow` com `Material` no conjunto e grupos só de `castsShadow` em `src/presentation/flows/ShadowFlow.ts`
- [ ] T047 [US5] Regravar as 10 fixtures `src/__smokes__/fixtures/render-*-apple-metal-3.png` com `npm run smoke -- render --record` num commit próprio; descrever no commit a diferença por cena (só a região da caixa de arame: faces → arestas; contagem de pixels da T004) e marcar para aprovação no PR; acrescentar ao smoke `render` uma caixa com `PointSpriteMaterial` (8 sprites)

**Checkpoint**: topologia respeitada em forward e sombra; fixtures regravadas.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T048 [P] Bench `particles` (R11) em `bench/scenes/particles/clayflow.ts` e `three.ts` (variantes `4k`, `65k`); registrar a cena no runner (`bench/`) e a limitação no resumo (Three sem simulação, sprites atualizados pela CPU)
- [ ] T049 Medir `npm run bench -- --scene particles` contra SC-004/SC-005 e anotar abaixo deste item (CPU 65k/4k, fps de intervalo de 65k, GPU por passe)
- [ ] T050 [P] Documento de arquitetura `clay-engine-doc/docs/guides/architecture_resource_loaders.md`: faixas de pool, bitset de vivos, `slotRef`, render de corpos (`ParticleFlow`), geometria da GPU (`owns` individual, `indexFormat`), topologia e sombra por material; remover as marcas "alvo F2/008" atendidas
- [ ] T051 [P] Guias: `clay-engine-doc/docs/guides/flows.md` (estágio que escreve geometria), guia de física (corpos-contêiner, `edges`, `surface`, restrições por `(corpo, índice)`), `dev_workflow.md` se citar corpos
- [ ] T052 [P] Guia de migração `clay-engine-doc/docs/guides/migration_legacy_to_clean.md`: seção da 008 (uma entidade por partícula → arrays; `DistanceConstraint` `{ i, j }` → `{ a, b }`; `PointCloudGeometry` `points` → `vertices`; `PointSpriteMaterial` com struct próprio; topologia agora respeitada)
- [ ] T053 [P] `specs/ROADMAP.md` (008 entregue, F2 concluída; referências de linha desatualizadas do diagnóstico corrigidas) e `specs/PENDENCIAS.md` (§4 "Geometria gerada em compute" resolvida; P10 descrito com precisão — fluidos desenhados como partículas; A3 registrado como corrigido)
- [ ] T054 [P] JSDoc dos membros novos e `npm run doc` (API regenerada); `npm run doc:coverage` sem membro sem documentação
- [ ] T055 Fechamento: `npm run smoke -- <todos>` no fonte e com `--dist`; `npm run bench` completo e `npm run bench:check` contra o baseline vigente; anotar abaixo deste item
- [ ] T056 Regravar o baseline (`npm run bench:baseline`) com a cena `particles` incluída e anotar abaixo deste item
- [ ] T057 Gate completo: `format:check`, `lint` (0 erros), `tsc`, `typecheck:bench`, `test:coverage`, `build:lib`; marcar a spec como implementada em `specs/008-compute-geometry/spec.md`

---

## Dependencies & Execution Order

- **Phase 1** → **Phase 2** (bloqueia todas as histórias).
- **US2 (Phase 3)** depende de T006/T008/T012/T014. **US1 (Phase 4)** depende de US2 (corpos-contêiner e faixa).
  **US3 (Phase 5)** depende de US2 (`edges`, faixa) e de T016 (posse individual). **US4 (Phase 6)** depende de T016.
  **US5 (Phase 7)** depende de T027 (struct do sprite) e de T045 compartilhar o fragment da T029.
- T047 depois de T042–T046. Polish depois de todas as histórias; T056 depois de T055; T057 por último.
- Dentro de cada história: teste antes da implementação; smokes de preservação ao fim de cada tarefa que muda estágio.

## Parallel Opportunities

- Phase 1: T002, T003, T004.
- Phase 2: testes T005, T007, T009, T011, T013, T015 em paralelo; implementações em sequência no `ResourceSystem`
  (T008 → T010 → T012 → T014 → T016), T006 independente.
- Depois da US2: US1 (C4) e US3 (C3) em paralelo por arquivos distintos; US4 em paralelo com US3.
- Polish: T050–T054 em paralelo.

## Implementation Strategy

Entrega completa em ordem de dependência: base de verificação → mecanismos da C2 → corpos-contêiner → sprites →
superfície de corpo mole → geometria da GPU → topologia → bench → documentação e fechamento. Cada fase termina com
trajetórias e imagem verdes; nenhuma fase é ponto de parada — a spec só fecha com todas as tarefas, o gate e o
`bench:check` verdes.
