# Tasks: Slots de Flow

**Feature**: `006-flow-slots` | **Branch**: `feature/006-flow-slots`
**Input**: plan.md, spec.md, research.md (A1–A7, R1–R15), data-model.md, contracts/ (flow-slots, layout-inference,
render-stages), quickstart.md

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: paralelizável (arquivos distintos, sem dependência pendente).
- **[USx]**: tarefa de fase de user story.
- Testes Vitest CPU-side são exigidos (Constituição V); quando listados em par, o teste vem antes da implementação. A
  verdade da GPU é validada por smokes (`src/__smokes__`, `npm run smoke -- <nome>`), e o desempenho por
  `npm run bench:check` contra `bench/baselines/`.
- **Regra de preservação**: a partir da Fase 5, toda tarefa que migra um estágio termina com
  `npm run smoke -- trajectories,render` verde (trajetória bit a bit nas três taxas, ou dentro da tolerância registrada
  na 005 para SPH/PBF; imagem idêntica) e `npm test` verde.
- **Sem helpers**: nenhuma tarefa cria função de conveniência que contorne a C2; dados consumidos chegam por slot ou
  `consumes`, recursos privados são recriados em transições, nunca no `dispatch`.

## Path Conventions

- C1 `src/core/`, C2 `src/scene/` (testes em `src/scene/__tests__/`, integração em
  `src/scene/__tests__/integration/`), C3 `src/elements/` (testes em `src/elements/**/__tests__/`), C4
  `src/presentation/` (testes em `src/presentation/**/__tests__/`).
- Doubles: `src/scene/__tests__/helpers/fakeSceneCore.ts`, `fakeResourceCore.ts`; novo `countingCore.ts` (T004).
- Documento: `clay-engine-doc/docs/guides/`.

---

## Phase 1: Setup — base de verificação

**Purpose**: fixar o comportamento e os números de hoje antes de mexer em qualquer estágio (R14).

- [x] T001 Registrar a linha de base verde da branch: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run smoke -- trajectories,render,churn`; anotar abaixo deste item em `specs/006-flow-slots/tasks.md`

> **Linha de base (T001, 2026-10-12)**: `tsc` ✅, `npm test` 810/810 ✅, `lint` 0 erros (184 avisos), `trajectories`
> bit a bit nas 7 cenas ✅, `render` 10 cenas idênticas ✅, `churn` 100 ciclos × 1000 objetos com variação 0,000% ✅.

- [x] T002 Estender `src/__smokes__/trajectories.ts` para rodar cada cena com quadros de 1/30, 1/60 e 1/144 s (passo fixo de 1/60 pelo `Time`) contra a mesma fixture da 005, informando o desvio máximo por cena e por taxa; documentar em `src/__smokes__/README.md`; rodar e confirmar verde antes de qualquer migração
- [x] T003 [P] Medir e anotar em `specs/006-flow-slots/tasks.md` (abaixo deste item) os números de hoje: objetos de GPU criados por entidade no forward e na sombra, escritas de câmera e de material por quadro, e a CPU por quadro e a montagem de `instances/10k` do baseline `bench/baselines/apple-metal-3-chrome154-macos-1280x720-syhprh.json`

> **Números de hoje (T003, `countingCore` + `Application` com os estágios padrão, 1000 caixas com
> `StandardMaterial` e `Transform`, câmera e luz com sombra)**: inserir 1000 renderizáveis cria **12 047 objetos**, cerca
> de 12 por entidade — 3 buffers de vértice e 3 de índice (C2, forward e sombra), 3 uniformes (material da C2, câmera e
> material do forward), 2 bind groups e 1 shader. Escritas por quadro: **2003** (1000 `forward_camera` + 1000
> `forward_material` + `Time`, parâmetros da sombra e do forward); com 2000 entidades, 4003. Uma criação durante a
> gravação de passe no primeiro quadro. Baseline `instances/10k`: CPU 88,39 ms/quadro, quadro médio 96,75 ms, p95
> 102,58 ms, 10 001 draws (o baseline não registra tempo de montagem; a montagem é medida pela contagem de objetos
> acima).

- [x] T004 [P] Criar o double de contagem `src/scene/__tests__/helpers/countingCore.ts` (implementa `EngineCore`): conta `create*` por tipo de spec, `write` por spec e por quadro, e marca qualquer `create*` feito durante `frame.compute`/`frame.render` (gravação), exposto por `stats()`/`resetFrame()`

---

## Phase 2: Foundational — contratos que todas as histórias usam

**Purpose**: peças de C1/C2 sem dependência de história: reexports (D4), formato `'canvas'`, binding de compute de
vértice/índice/indireto, pool uniforme.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

- [x] T005 [P] Criar `src/scene/contracts/gpu.ts` reexportando (só tipos) o que C3/C4 usam de `src/core/contracts/index.ts` (`EngineCore`, `Frame`, specs de buffer/textura/sampler/pipeline/bind group, `RenderTarget`, `Binder`, passes, `ComputeKernel*`) e expor por `src/scene/contracts/index.ts` e `src/scene/index.ts`
- [x] T006 [P] Teste + contrato C1: o binding de compute aceita `VertexBufferSpec`, `IndexBufferSpec` e `IndirectBufferSpec` (FR-015) em `src/core/contracts/bindings/BufferBindingEntry.ts` e no `GpuEngineCore` (`src/core/`), com teste em `src/scene/__tests__/createComputeKernel.test.ts` (caso de buffer de vértice como `storage`)
- [x] T007 [P] Teste + implementação: `TextureShape.format` aceita `'canvas'` (resolvido para `core.canvasFormat` na alocação) e o uso da textura é derivado do formato (profundidade: `RENDER_ATTACHMENT | TEXTURE_BINDING`, sem `COPY_*`) em `src/scene/descriptors/TextureShape.ts` e `src/scene/systems/ResourceSystem.ts`; teste em `src/scene/__tests__/ResourceSystem.allocation.test.ts`
- [x] T008 Teste `src/scene/__tests__/ResourceSystem.uniformPool.test.ts`: descritor `role: 'uniform', storage: 'pool'` cria buffer `UNIFORM` com stride `alignUp(schema.stride, minUniformBufferOffsetAlignment)`, slots estáveis, crescimento preserva dados, fonte dinâmica com `offset = slot × stride`
- [x] T009 Implementar o pool uniforme em `src/scene/systems/ResourceSystem.ts` (`PoolEntry.addressSpace: 'storage' | 'uniform'`, stride alinhado pelas `capabilities().limits`) e remover o layout e o bind group próprios do pool (`createPool`, `poolBindGroup`, A1) — T008 verde

**Checkpoint**: `npx tsc --noEmit` e `npm test` verdes.

---

## Phase 3: User Story 1 — Estágio declara o que consome e recebe tudo ligado (Priority: P1) 🎯

**Goal**: o mecanismo de slots de ponta a ponta na C2 (R1–R3, R5–R7).

**Independent Test**: um Flow de teste que só declara slots e um pipeline com `consumes` recebe bind groups com grupos,
bindings e visibilidades inferidos; ao crescer o pool, recebe `bindGroupReplaced` e passa a usar o novo sem recriar
nada (`src/scene/__tests__/integration/FlowSlots.test.ts`).

### Inferência de layout

- [x] T010 [P] [US1] Testes em `src/scene/__tests__/LayoutInferencer.test.ts`: visibilidade por alcance de chamadas (binding usado só numa função auxiliar chamada pelo fragment → só `FRAGMENT`; usado por vertex e fragment → ambos), tipos (`uniform`, `read-only-storage`, `storage`, `texture_depth_2d`, `texture_2d<f32>`, `texture_storage_2d<fmt, access>`, `sampler`, `sampler_comparison`), `typeName` do struct e do elemento de `array<…>`, binding citado por nenhuma entrada → erro, campos explícitos vencem (FR-013)
- [x] T011 [US1] Implementar `LayoutInferencer.infer(composed, entryPoints)` em `src/scene/systems/LayoutInferencer.ts` sobre a varredura de símbolos da 005 (`src/scene/shaders/scanWgslSymbols.ts`), devolvendo `InferredLayout` (contracts/layout-inference.md) — T010 verde

### Fontes e resolvers

- [x] T012 [P] [US1] Testes em `src/scene/__tests__/ConsumerResolverRegistry.test.ts`: resolvers devolvem `ResolvedSource` (`buffer`/`textureView`/`sampler`, `dynamic`, `generation`), `undefined` quando ausente, nome não registrado lista os disponíveis; `PoolResolver` registrado automaticamente ao criar pool sem sobrescrever um existente; `SingletonResolver` de `Camera` escolhe a primeira câmera inserida que continua na cena
- [x] T013 [US1] Reescrever `src/scene/consumers/ConsumerResolver.ts` (`resolve(ctx): ResolvedSource | undefined`, `ResolveContext { world, resources }`) e `src/scene/consumers/ConsumerResolverRegistry.ts`; adaptar `src/scene/consumers/strategies/SingletonResolver.ts` e `PoolResolver.ts`; criar `src/scene/consumers/strategies/TextureResolver.ts`; remover `PerEntityResolver.ts` e seus exports — T012 verde
- [x] T014 [US1] Registrar os resolvers padrão (`Camera`, `Time`, `ParticleMaterial`, `GravityField`) em `src/scene/SceneContext.ts` e o `PoolResolver` automático na criação de pool em `src/scene/systems/ResourceSystem.ts`; teste em `src/scene/__tests__/SceneContext.test.ts`

### Slots, Flow e transições

- [x] T015 [P] [US1] Criar `src/scene/flows/slots.ts`: `slot.pool`, `slot.bodies`, `slot.pools`, `slot.singleton`, `slot.entities`, `slot.texture`, `slot.target`, tipos `SlotDeclaration`, `SlotMap`, `BoundSlot`/`BoundSlots<TSlots>`, `EntityEntry` (data-model.md); teste de tipos e valores em `src/scene/__tests__/slots.test.ts`
- [x] T016 [P] [US1] Criar `src/scene/flows/FlowTransitions.ts`: `FlowTransitions<S>`, `FlowEventName`, `FlowEvent` (data-model.md), `FlowTransitionError(type, state, event)` e a aplicação da tabela (`ignore`, `{ to, run }`); testes em `src/scene/__tests__/FlowTransitions.test.ts` (transição válida, `ignore`, evento sem entrada lança nomeando Flow, estado e evento)
- [x] T017 [US1] Reescrever `src/scene/flows/Flow.ts` como `Flow<TSlots, S>` (contracts/flow-slots.md): `type`, `slots`, `pipelines`, `transitions`, `listens`, `lifecycle` e `state` só leitura, `dispatch(frame, bound)`, `dispose`; remover `phase`, `priority`, `bodyType`, `isReady`, `onEvent`, `onPoolReallocated`, `onEntitiesInserted`, `onEntitiesRemoved`, `onCanvasResized`, `getPipelineDescriptors`; `src/scene/flows/RenderFlow.ts` com `TSlots` incluindo `target` (saem `resolveTarget`/`recordRenderPass`)
- [x] T018 [US1] Criar `FlowBindingError` e `FlowRegistrationError` em `src/scene/flows/` e exportá-los por `src/scene/flows/index.ts`

### Preparação e bind groups da C2

- [x] T019 [US1] Testes em `src/scene/__tests__/flowBinding.test.ts`: ordem de resolução (privado por nome da variável → `typeName ∈ consumes` → `FlowBindingError` nomeando binding, grupo, pipeline, Flow e resolvers), incompatibilidade uniform × storage e profundidade × cor falha, fonte dinâmica liga `hasDynamicOffset`, layouts idênticos deduplicam pelo hash da 004
- [x] T020 [US1] Criar `src/scene/systems/flowBinding/`: resolução de slots (`resolveSlots.ts`, incluindo o conjunto `slot.entities` mantido em `entitiesInserted`/`entitiesRemoved` e na troca de Resource), preparação de pipelines (`preparePipelines.ts`: `composeWgsl` + `infer` + criação de layouts, pipelines e bind groups, variantes por chave), índice fonte → bind groups (`BindGroupIndex.ts`) — T019 verde
- [x] T021 [US1] Implementar em `src/scene/systems/ResourceSystem.ts` `ensureFlowAllocated(flow, options)` e `releaseFlow(flow)`: ciclo `pending → preparing → ready → disposed`, entrega dos eventos `slotsResolved`/`slotLost`/`pipelinesCompiled`/`entitiesChanged`/`canvasReconfigured`/`poolReallocated`/`resourceReady` (só schemas em `listens`) ao Flow, `rebind(pipelineId, bindings)` para privados, emissão de `flowReady { type, bodyType }`
- [x] T022 [US1] Implementar `bindGroupReplaced { source, oldSpec, newSpec }` em `src/scene/systems/ResourceSystem.ts` e `src/scene/events/BindGroupReplacedEvent.ts`: ao crescer pool, recriar textura `sizeFromCanvas`, trocar singleton ou `rebind`, recria só os bind groups afetados, destrói os antigos depois do `submit` corrente e emite o evento; pool que cresce durante `preparing` prepara com o bind group final (edge case)
- [x] T023 [US1] `flushDirty` em `src/scene/systems/ResourceSystem.ts` drena a fila até esvaziar (derivação CPU que suja outro Resource entra no mesmo quadro); teste em `src/scene/__tests__/ResourceSystem.reactive.test.ts`
- [x] T024 [US1] `src/scene/systems/ExecutionSystem.ts`: `activeFlows` mantido por `flowReady` e pela saída de `ready`; grava por fase na ordem da regra única; remover os broadcasts (`onPoolReallocated`, `onCanvasResized`, `onEntities*`); substituir `src/scene/__tests__/ExecutionSystem.broadcasts.test.ts` por `ExecutionSystem.activeFlows.test.ts`
- [x] T025 [US1] Reescrever `src/scene/flows/createComputeKernel.ts`: `bindings: { [varName]: ComputeKernelSource }` (buffer de qualquer papel, `dynamic?`, `size?`), layout inferido do WGSL (T011); a forma por índice sai; atualizar `src/scene/__tests__/createComputeKernel.test.ts`
- [x] T026 [US1] Teste de integração `src/scene/__tests__/integration/FlowSlots.test.ts` com os cenários 1–6 da US1 (inferência sem declaração manual, só fragment, `consumes` sem resolver, binding descoberto, pool cresce → `bindGroupReplaced` e uso do novo, explícito vence) e o contrato "dispatch só grava" pelo `countingCore` (T004)

**Checkpoint**: mecanismo completo e testado; ainda sem estágio do motor migrado (o código antigo dos estágios deixa de
compilar a partir de T017 — as Fases 4–7 devolvem a compilação; manter cada tarefa num commit com `tsc` verde migrando
o estágio na mesma tarefa quando a remoção o quebrar).

---

## Phase 4: User Story 3 — Registro por factory e seleção pela Camada 2 (Priority: P1)

**Goal**: `register(factory, options)`, `override`, `unregister`; solvers instanciados pela C2 no primeiro corpo
(R4).

**Independent Test**: factories de dois algoritmos do mesmo `bodyType` com prioridades diferentes; inserir corpos e
verificar instâncias, ordem, `flowReady` só após a compilação e liberação por `unregister`
(`src/scene/__tests__/FlowRegistry.factory.test.ts`).

- [x] T027 [US3] Testes em `src/scene/__tests__/FlowRegistry.factory.test.ts`: nenhum Flow instanciado sem corpo do tipo; primeiro corpo instancia e só emite `flowReady` após `pipelinesCompiled`; regra única (override → maior prioridade → último registrado); `unregister` libera objetos de GPU e inscrições e cancela compilação em curso (concluída depois não reativa); `FlowRegistrationError` para `type` repetido na fase e `bodyType` vazio; pool `${schema}:${algoritmo}` com `FlowDescriptor` (FR-009); último corpo removido mantém o Flow sem despacho com contagem 0; substituir `FlowRegistry.resolve.test.ts`
- [x] T028 [US3] Reescrever `src/scene/flows/FlowRegistry.ts`: `register`, `override`, `unregister`, `resolve`, `flowsInPhase`, `phasesInOrder`, `FlowContext`, `RegisterOptions`, `FlowRegistration`; sem `bodyType` instancia no registro e chama `ensureFlowAllocated`; com `bodyType` instancia sob demanda — T027 verde
- [x] T029 [US3] Em `src/scene/systems/ResourceSystem.ts`, ao alocar Resource cujo pool tem chave = `bodyType` registrado sem instância, instanciar por `registry.resolve` e alocar
- [x] T030 [US3] Remover `DEFAULT_FLOW_FACTORIES`/`autoRegisterFlows` (`src/elements/physics/flows/defaultFlows.ts`) e o uso em `src/presentation/app/Application.ts`; registrar as factories padrão dos solvers em `src/scene/SceneContext.ts` a partir de uma lista exportada por `src/elements/physics/flows/index.ts` (sem instanciar); substituir `src/elements/physics/__tests__/defaultFlows.test.ts` e `flowAutoRegister.test.ts` por testes de seleção pela C2

> **Ordem (2026-10-12)**: a T030 depende dos solvers já no modelo de slots (as factories registradas produzem `Flow`
> novos), então roda depois da T041. Os registros e testes de seleção (T027–T029) já valem para qualquer Flow.

- [x] T031 [US3] `Application.create({ consumers })` em `src/presentation/app/Application.ts` para resolvers de aplicação; teste em `src/presentation/app/__tests__/Application.consumers.test.ts`

**Checkpoint**: registro e seleção prontos; os solvers ainda são migrados na Fase 5.

---

## Phase 5: User Story 5 — Solvers e Transform migrados (Priority: P2)

**Goal**: os seis solvers e o `TransformFlow` em slots, um por vez, com trajetórias verdes nas três taxas (R12).

**Independent Test**: `npm run smoke -- trajectories` verde a 30/60/144 Hz após cada tarefa; nenhum solver cria layout
nem bind group de dado consumido (verificação de T046).

### Peças compartilhadas

- [x] T032 [P] [US5] Kernels genéricos com bindings por nome: `src/elements/gpu/compute/{PrefixSum,RadixSort,Reduce,Compaction,GraphColorer,FrameUniforms}.ts` e `src/elements/gpu/NeighborSearchPipeline.ts` recebem buffers de slot e usam o `createComputeKernel` novo; testes em `src/elements/gpu/__tests__/` atualizados; `npm run smoke -- computeKernels` verde; registrar em `src/__smokes__/README.md`
- [x] T033 [P] [US5] `src/elements/physics/flows/PerStepUniforms.ts`: `reserve()` deixa de invalidar kernels; o buffer cresce em transição e é religado por `rebind`; teste em `src/elements/physics/__tests__/PerStepUniforms.test.ts`
- [x] T034 [P] [US5] `src/elements/physics/colliders/ColliderSet.ts` como peça de slot (`slot.pools` dos colliders): mapas de dono como recursos privados reconstruídos em transição, pool de malha incluído no grupo (A6); teste em `src/elements/physics/__tests__/ColliderSet.test.ts`

### Estágios (em ordem; cada um termina com `trajectories,render` verde)

- [x] T035 [US5] `src/elements/scene/flows/TransformFlow.ts` em slots (`slot.pool('Transform')`, `slot.pool('WorldTransform')`), redespacha em `resourceReady(Transform)` e `entitiesChanged` (corrige A6: remoção não redespachava); teste em `src/elements/scene/__tests__/TransformFlow.test.ts` com caso de remoção; `npm run smoke -- transforms,trajectories,render`
- [x] T036 [US5] `src/elements/physics/flows/XPBDFlow.ts` em slots (`bodies`, `constraints`, `time`, `gravity?`); corrigir o comentário de substeps (8); `src/elements/physics/__tests__/XPBDFlow.time.test.ts` com transições
- [x] T037 [US5] `src/elements/physics/flows/FEMFlow.ts` em slots (`bodies`, `time`, `gravity?`); `FEMFlow.time.test.ts`
- [x] T038 [US5] `src/elements/physics/flows/MPMFlow.ts` em slots (`bodies`, `colliders`, `material`, `time`, `gravity?`); grade recriada em `resourceReady(ParticleMaterial)` (sai a comparação de geração no `dispatch`); `MPMFlow.time.test.ts`
- [x] T039 [US5] `src/elements/physics/flows/SPHFlow.ts` em slots; vizinhança e privados recriados em transição; `SPHFlow.time.test.ts`
- [x] T040 [US5] `src/elements/physics/flows/PBFFlow.ts` em slots; `pbf_delta` e vizinhança em transição; `PBFFlow.time.test.ts`
- [x] T041 [US5] `src/elements/physics/flows/LCPFlow.ts` em slots (`bodies`, `colliders`, `time`, `gravity?`); contatos e por corpo recriados em `poolReallocated(bodies/colliders)`; os 9 kernels e o mapa de narrowphase viram estado preparado fora do `dispatch`; readback com mapa slot → entidade capturado na gravação da cópia (A6); testes `LCPFlow.contacts.test.ts`, `LCPFlow.owners.test.ts`, `LCPFlow.time.test.ts`, `lcpPosePublish.test.ts` (caso de remoção entre cópia e leitura); `npm run smoke -- rigidContacts,limits,trajectories`

**Checkpoint**: física inteira no modelo; trajetórias iguais nas três taxas.

---

## Phase 6: User Story 2 — Forward e sombra consomem pelos slots (Priority: P1)

**Goal**: nada por entidade em forward e sombra; câmera uma vez por quadro; bind groups compartilhados uma vez por
passe; `ShadowMap` lido pelo shader (R8–R11).

**Independent Test**: com o `countingCore`, 10 mil renderizáveis → 0 criações por entidade em forward/sombra e 1
escrita de câmera por quadro (`src/presentation/flows/__tests__/ForwardFlow.perEntity.test.ts`); `npm run smoke --
render,churn` com imagem idêntica.

- [x] T042 [P] [US2] Materiais em pool uniforme: `storage: 'pool'` em `src/elements/material/{StandardMaterial,WireframeMaterial,PointSpriteMaterial}.ts` (schemas em `StandardMaterialSchema.ts`/`forwardSchemas.ts`); troca de material para outro schema muda a entidade de pool (edge case); teste em `src/scene/__tests__/integration/ReactiveMaterial.test.ts`
- [x] T043 [P] [US2] `src/presentation/app/FrameTargets.ts`: Resource com `color` (`format: 'canvas'`, `sizeFromCanvas`) e `depth` (`depth24plus`, `sizeFromCanvas`); inserido pela `Application`; teste de alocação e recriação em `canvasReconfigured` em `src/presentation/app/__tests__/FrameTargets.test.ts`
- [x] T044 [US2] `src/elements/scene/ShadowMap.ts` com descritor `depth` (`texture`, `depth32float`, tamanho de `size`) e padrões `bias` 0,005 e `size` [1024, 1024]; anexado no construtor de `src/elements/scene/DirectionalLight.ts`; teste em `src/elements/scene/__tests__/ShadowMap.test.ts`
- [x] T045 [US2] `src/presentation/flows/ShadowFlow.ts` em slots (contracts/render-stages.md): `caster` singleton do `ShadowMap` da primeira `DirectionalLight` com `castShadow`, `world`, `casters` (`slot.entities`), alvo = textura `depth` do `ShadowMap`; `listens: [Light.schema]` grava `lightViewProj` em `resourceReady`; geometria por `resources.bufferOf` (R10); `shadow_depth.wgsl` lê `array<ShadowMap>` no `casterSlot` e `ShadowDepthParams` leva só `casterSlot`; sai `ShadowFlowOptions.mapSize`; atualizar `src/presentation/flows/__tests__/ShadowFlow.worldTransform.test.ts`
- [x] T046 [US2] `src/presentation/flows/ForwardFlow.ts` em slots: `camera` singleton, `world` pool, `renderables`/`lights` (`slot.entities`), `shadowMap` (textura + pool, opcionais), `target` (`FrameTargets.color` + `depth` com pós, `'canvas'` sem); um pipeline por shader de material com variantes `frontFace`; `ForwardFrameParams` privado (substitui `ForwardShadowParamsSchema` em `src/presentation/flows/renderSchemas.ts`) gravado uma vez por quadro; grupos 0/1/3 uma vez por passe, grupo 2 com offset `materialSlot × stride` só quando muda, `draw.indexed(indexCount, 1, 0, 0, transformSlot)`; saem `ensureSlot`, `uploadPerFrameData`, VBO/IBO por entidade, `bindShadowFlow`, `setRenderToOffscreen`, `instanceof`; WGSL do forward inalterado
- [x] T047 [US2] Testes de contagem com `countingCore` em `src/presentation/flows/__tests__/ForwardFlow.perEntity.test.ts`: SC-001 (0 criações por entidade com 10 mil), SC-002 (1 escrita de câmera por quadro, só quando suja), bind groups 0/1/3 uma vez por passe; atualizar `renderables.test.ts`, `removalRelease.test.ts`, `indexFormat.test.ts`, `ForwardFlow.worldTransform.test.ts`; casos de borda: sem câmera não fica pronto e não grava; entidade sem Material não gera draw nem aviso repetido
- [x] T048 [US2] `npm run smoke -- render,churn,bigMesh,integration` com imagem idêntica às fixtures da 005; registrar em `src/__smokes__/README.md`

> **Execução (T042–T049, 2026-10-12)**: `FrameTargets` é inserido por `registerPresentationDefaults` (uma vez por
> cena, removido com o último usuário), chamado pela `Application`. O grupo 3 de `forward.wgsl` mudou: o
> `ForwardFrameParams` (direção da luz, sombra ligada, slot do mapa) substitui os parâmetros de sombra e o shader lê
> `array<ShadowMap>` no slot do caster — é o `ShadowMap.schema` lido por shader (FR); o resto do WGSL do forward ficou
> igual. Sem luz que projeta sombra, `shadowEnabled = 0` (antes o substituto escurecia perto da origem) — vai para o
> guia de migração. A T047 usa o `renderScene` (`src/presentation/flows/__tests__/helpers/renderHarness.ts`), cena
> real com contagem de criações/escritas como o `countingCore` e captura dos desenhos. Números: 10 010 entidades com
> sombra e forward criam < 100 objetos fora das geometrias delas (pools e bind groups religados), nenhum de estágio;
> câmera escrita 1× no quadro em que muda e 0× nos estáveis; grupos 0/1/3 uma vez por passe. T048: smokes `render`
> (10 cenas idênticas), `churn`, `bigMesh`, `integration` e `trajectories` (3 taxas) verdes.

**Checkpoint**: critério de saída da F1 no render (SC-001, SC-002, SC-007).

---

## Phase 7: User Story 5 (cont.) — pós, UI, debug e Application

- [x] T049 [US5] `src/presentation/flows/PostFlow.ts` em slots (`scene` = `slot.texture(FrameTargets, 'color')`, `target: 'canvas'`); pingue-pongue recriado em `canvasReconfigured`; sai `bindForwardFlow`; efeitos de `src/presentation/flows/effects/*.ts` com bindings por nome; `src/presentation/flows/__tests__/ColorGrading.test.ts` atualizado
- [x] T050 [P] [US5] `src/presentation/flows/UIFlow.ts` e `src/presentation/ui/UiGpuPipeline.ts` em slots (`target: 'canvas'`, load), privados como hoje
- [x] T051 [P] [US5] `src/presentation/flows/DebugFlow.ts` sem slots no modelo novo; `DebugFlow.stagesNs.test.ts` atualizado
- [x] T052 [US5] `src/presentation/flows/defaults.ts` (`registerPresentationDefaults`) registra as factories de apresentação e devolve as instâncias; `src/presentation/app/Application.ts` insere `FrameTargets`, remove o caminho antigo; atualizar `src/presentation/app/__tests__/*` e `src/presentation/__tests__/listenersRelease.test.ts`
- [x] T053 [US5] Verificação no gate (SC-004) em `src/elements/__tests__/noFlowOwnedConsumedBindings.test.ts`: nenhum arquivo de estágio de C3/C4 chama `createBindGroupLayout`/`createBindGroup` para dado consumido (varredura por chamadas fora de `rebind` de privados) e nenhum `dispatch` cria objeto (teste com `countingCore` sobre todos os Flows padrão)
- [x] T054 [US5] `npm run smoke -- trajectories,render,churn,limits,rigidContacts,multiApp,stress60s,shaderLibrary,computeKernels` verde; registrar em `src/__smokes__/README.md`

---

## Phase 8: User Story 4 — Estado por máquina de estados e eventos (Priority: P2)

**Goal**: tabela de transições completa e testada por Flow (R5).

**Independent Test**: para cada Flow do motor, cada evento provocado com slots e quadro simulados leva ao estado
esperado; evento sem transição lança (`src/scene/__tests__/integration/FlowLifecycle.test.ts` e testes por Flow).

- [x] T055 [US4] Reescrever `src/scene/__tests__/integration/FlowLifecycle.test.ts`: slots não resolvidos → não grava e não está ativo; `bindGroupReplaced` em `ready` → usa o novo sem `preparing`; canvas redimensionado no mesmo quadro em que um pool cresce → os dois tratados, nenhum objeto destruído referenciado; resolver registrado depois → aguarda ou falha na primeira tentativa, nunca liga binding vazio; pipeline assíncrono → só entra após compilar
- [x] T056 [P] [US4] Testes de transições por Flow (estados enumerados, cada evento, inválido lança) em `src/elements/physics/__tests__/flowTransitions.test.ts` (6 solvers), `src/elements/scene/__tests__/TransformFlow.test.ts` e `src/presentation/flows/__tests__/flowTransitions.test.ts` (forward, sombra, pós, UI, debug)
- [x] T057 [US4] Atualizar `src/scene/__tests__/integration/CanvasResizeCleanup.test.ts`, `SceneOrchestration.test.ts`, `StaticScenePerf.test.ts`, `ReactiveTransform.test.ts` e `src/scene/__tests__/dispose.test.ts` para o modelo de eventos

---

## Phase 9: User Story 6 — Fronteira de importação e documento (Priority: P3)

**Goal**: D4 verificada no gate; documento sem "alvo da 006" (R13, R15).

**Independent Test**: `npm run lint` falha ao introduzir `import type { EngineCore } from '../../core/contracts'` num
arquivo de `src/elements/`; `grep -c "alvo da 006"` no documento = 0.

- [x] T058 [US6] Trocar os imports de `core/contracts` dos 24 arquivos de C3/C4 (A5) por `scene/` (T005)
- [x] T059 [US6] Regra `no-restricted-imports` em `eslint.config.js` para `src/elements/**` e `src/presentation/**` proibindo `**/core/**`; confirmar que falha nomeando o arquivo com um import proibido temporário e passa sem ele

> **Execução (T058–T059, 2026-10-12)**: o código de C3/C4 já não importava `core/` (os 24 arquivos da A5 foram
> migrados junto com os Flows); os 12 testes de C3/C4 que ainda importavam `core/contracts/index` passaram a
> `scene/contracts/gpu`. A regra `@typescript-eslint/no-restricted-imports` (`**/core`, `**/core/**`) vale para
> `src/elements/**` e `src/presentation/**`, testes inclusive; um `import type { EngineCore } from
'../../core/contracts'` temporário em `src/elements/scene/` falhou nomeando o arquivo, e o lint volta a 0 erros sem
> ele.

- [x] T060 [US6] Emenda MINOR 1.1.0 em `.specify/memory/constitution.md` (Princípio I alinhado à D4, relatório de impacto de sincronização no topo, versão e data); atualizar a menção de versão em `CLAUDE.md`; registrar no corpo do PR que pede ratificação

> **Execução (T060, 2026-10-12)**: constituição 1.1.0 (Princípio I: C3/C4 só importam a C2; tipos da C1 por
> `scene/contracts/gpu`; verificado no lint), relatório de sincronização no topo e `CLAUDE.md` em v1.1.0. **Pendente
> para o PR**: o corpo do PR da 006 pede a ratificação da 1.1.0 ao mantenedor (item `RATIFICATION(1.1.0)`).

- [x] T061 [US6] `clay-engine-doc/docs/guides/architecture_resource_loaders.md`: toda marca "alvo da 006" vira estado atual (Flow com slots, `RegisterOptions`, `LayoutInferencer.infer`, `ConsumerResolver` com fontes, `bindGroupReplaced`, pool de Material, `ShadowMap` lido pelo shader, `FrameTargets`); exemplos de Flow, `register` e `consumes` reescritos com a API real
- [x] T062 [P] [US6] Guia novo `clay-engine-doc/docs/guides/flows.md` (escrever um Flow N3: slots, `consumes`, privados, transições, registro) com link na barra lateral do Docusaurus
- [x] T063 [P] [US6] Migração (tabela do quickstart) em `clay-engine-doc/docs/guides/migration_legacy_to_clean.md`; `physics_flows.md`, `post_processing.md`, `shaders.md` e `getting_started.md` onde citarem a API removida

> **Execução (T061–T063, 2026-10-12)**: `architecture_resource_loaders.md` sem nenhuma marca "alvo da 006" (o que
> continua fora — pool `Renderable`, instancing, câmeras offscreen — marcado F2/007); exemplos de Flow, `register`,
> `consumes`, ResourceSystem, ExecutionSystem e estágios da C4 reescritos com a API real. Guia novo `flows.md` (Flow
> N3; o exemplo completo passa no `tsc` contra `src/index`), entrando na barra lateral autogerada por
> `sidebar_position`. `migration_legacy_to_clean.md` com a seção da 006 (tabela de API removida → substituta e a
> mudança `shadowEnabled = 0` sem luz que projeta sombra); `physics_flows.md`, `post_processing.md`, `shaders.md`,
> `getting_started.md` e `dev_workflow.md` atualizados. Divergências achadas e corrigidas nos guias: grade do MPM vem
> do `ParticleMaterial`; `Application.create` não recebe `flows` (usar `app.flows.register`/`override`);
> `createComputeKernel` exige `discriminator`; `DistanceConstraint` usa `restLength`. `TransformFlow.type` passou a
> `'TransformFlow'` (como os demais Flows; o registro continua `type: 'transform'`). Build do Docusaurus verde.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [x] T064 [P] `specs/ROADMAP.md`: F1/006 concluída, §6 com os números novos; `specs/PENDENCIAS.md` atualizado (achados resolvidos: readback do LCP, TransformFlow, malha no `ColliderSet`)
- [x] T065 JSDoc em todos os exports novos; `npm run doc:coverage`; regenerar a API (`npm run doc`)

> **Execução (T065, 2026-10-12)**: `doc:coverage` com 0 membros sem documentação e 47 avisos de tipo não incluído
> (base do `develop`: 59, todos anteriores à 006; nenhum novo). API regenerada (`npm run doc`).

- [x] T066 Verificações da 005 mantidas: `src/elements/__tests__/noManualOffsets.test.ts`, `noManualWgslAssembly.test.ts`, `wgslInventory.test.ts` verdes (FR-029, nenhum struct duplicado)
- [x] T067 Smokes completos no código-fonte e sobre o dist: `npm run build:lib && npm run smoke -- time,transforms,integration,multiApp,limits,churn,bigMesh,rigidContacts,stress60s,trajectories,render,shaderLibrary,computeKernels` e o mesmo com `--dist`; registrar em `src/__smokes__/README.md` (SC-006, SC-007, SC-009)
- [ ] T068 `npm run bench:check` com a máquina sem carga externa: CPU por quadro de `instances/10k` −30% e montagem menor contra o baseline, sem regressão > 10% nas demais (SC-003); registrar os números abaixo deste item em `specs/006-flow-slots/tasks.md`; refazer junto a T084 da 005 se ainda pendente

> **Rodada com carga externa (2026-10-12, commit 00d255e)**: `completion_test` do holos-rust a 100% de CPU e
> `mediaanalysisd` ativo durante toda a rodada (11,6 min). Gate **REPROVADO** só em métricas de quadro/GPU:
> `unique-objects/1k` p95 14,68 → 20,22 ms e p99 15,71 → 20,42 ms (CPU 7,75 → 1,08 ms, −86%); `instances/10k-moving`
> GPU 0,93 → 1,08 ms (a GPU dessa cena oscila entre estados de clock — T085 da 004). Critério SC-003 atendido nesta
> rodada: **CPU por quadro de `instances/10k` 88,39 → 16,85 ms (−80,9%)**, p95 102,58 → 18,15 ms; montagem (contagem
> de objetos, T003): de 12 objetos de GPU por entidade para os 2 da geometria da própria entidade (VBO/IBO da C2),
> nenhum dos estágios (SC-001). Demais melhorias: `instances/100k` passou de timeout a ok (166 ms CPU);
> `instances/10k-moving` CPU −32,5%; `rigid-bodies/1k` CPU −75%, GPU −40%; `rigid-bodies/10k` CPU −80,9%, p95 −21,6%.
> Adaptador do bench sem as duas limitações resolvidas (forward por entidade, geometria duplicada).
> **Pendente**: repetir `npm run bench:check` com a máquina livre; se verde, `npm run bench:baseline`.
>
> **Rodada com a máquina livre (2026-10-12, commit 0e40c7a)**: REPROVADO de novo nas mesmas métricas — regressão real.
> (1) `unique-objects/1k` 114 → 89 fps, p95 21,6 ms: com a CPU por quadro abaixo da latência da GPU o laço batia no
> limite de quadros em voo e devolvia RAFs vazios, que o navegador espaça (~1/60 s, sem vsync). Corrigido em `a362a42`
> (evento `frameRetired`; `GameLoop` e o bench esperam a vaga sem RAF vazio): p95 2,65 ms, CPU −86,8%. (2) GPU de
> `instances/10k` e `10k-moving` +10–17% (A/B: 0,52 ms antes do forward em slots, 1,07 ms depois; independe do ritmo).
> Causa isolada: o rebind do grupo de material com offset dinâmico a cada draw (R8). Resolvido pela Emenda 1 (Phase 11).

- [x] T069 Gate completo: `npm run format:check`, `npm run lint`, `npx tsc --noEmit`, `npm run test:coverage`, `npm run build:lib`; marcar `specs/006-flow-slots/spec.md` com status e `checklists/requirements.md`

> **Gate (T069, 2026-10-12)**: `format:check` ✅, `lint` 0 erros, `tsc` ✅, `test:coverage` 913/913 (linhas 87,0%,
> statements 86,3%), `build:lib` ✅ (564,75 kB, 144,78 kB gzip); bench do harness 81/81. Checklist de requisitos 16/16.
> Spec marcada como implementada, com a T068 (rodada de bench com a máquina livre) e a ratificação da 1.1.0 pendentes.

---

## Phase 11: Emenda 1 — pool `Renderable` e material indexado, sem bind por draw (R16)

**Goal**: remover o rebind por draw do forward (regressão de GPU da R8) com o pool `Renderable` do documento, mantido
pela C2; imagem idêntica; T068 verde.

**Independent Test**: contagem de `setBindGroup` por passe com 10 mil entidades depende só do número de pipelines;
smokes `render` (10 cenas idênticas), `churn`, `bigMesh`, `integration`; A/B de GPU em `instances/10k` ≤ 0,52 ms.

- [x] T070 [US2] Testes em `src/scene/__tests__/entitiesRecord.test.ts`: `slot.entities({ all, record })` — registro
      criado ao completar o conjunto com os slots referidos (`poolSlotOf` do descritor nomeado), atualizado ao trocar o
      Resource referido (mesmo schema e schema diferente) e liberado ao sair do conjunto; slot estável e reutilizado
      (free-list); dois conjuntos com a mesma declaração compartilham pool e slot; crescimento emite `poolReallocated` e
      `bindGroupReplaced`; escrita só em `frameRecording` (lote dos sujos), nunca pelo estágio; build minificado (nomes
      explícitos)
- [x] T071 [US2] C2: `record` em `slot.entities` (`src/scene/flows/slots.ts`), manutenção do pool de registros no
      `ResourceSystem` (`src/scene/systems/ResourceSystem.ts`) por eventos de entidade e de slot, `recordSlot` na entrada
      entregue ao estágio; `PoolResolver` do pool de registros; JSDoc
- [x] T072 [P] [US2] C3: `src/elements/scene/Renderable.ts` (schema `Renderable { transformSlot: u32, materialSlot: u32 }`
      e a declaração `{ transformSlot: [Transform, 'world'], materialSlot: [Material, 'material'] }`), exportado por
      `elements/index.ts`; testes do schema e da declaração
- [x] T073 [P] [US2] C3: descritor `material` de `StandardMaterial`, `WireframeMaterial` e `PointSpriteMaterial` passa a
      `role: 'storage-ro'`, `storage: 'pool'`; testes dos materiais e do pool (stride natural)
- [x] T074 [US2] WGSL: `src/elements/gpu/wgsl/forward.wgsl` (e os shaders de wireframe/point-sprite) leem
      `renderables[instance_index]`, a matriz por `transformSlot` e `materials[materialSlot]` (`@interpolate(flat)`);
      structs gerados (sem struct à mão — T066 continua verde). A sombra fica com o slot do `WorldTransform` (conjunto
      Geometry + Transform, sem material; já sem bind por draw)
- [x] T075 [US2] `ForwardFlow`: `renderables` com `record: Renderable`; grupos 0/1/3 uma vez
      por passe, grupo 2 (material) uma vez por pipeline; `draw.indexed(indexCount, 1, 0, 0, recordSlot)`; sai o offset
      dinâmico; JSDoc
- [x] T076 [US2] Testes de contagem (SC-010) em `src/presentation/flows/__tests__/ForwardFlow.perEntity.test.ts` e
      `ShadowFlow` equivalentes: 10 mil entidades, `setBindGroup` por passe = f(pipelines), 0 por entidade; troca de
      material entre schemas muda o pipeline no mesmo quadro; entidade sem Material sem draw nem aviso repetido;
      atualizar `renderables.test.ts`, `removalRelease.test.ts`, `ForwardFlow.worldTransform.test.ts`
- [x] T077 [US2] Pool uniforme: remover o caminho uniforme do `ResourceSystem` (stride alinhado, fonte dinâmica de
      pool) se nenhum descritor `role: 'uniform', storage: 'pool'` restar; ajustar testes da C2
- [ ] T078 [US2] Smokes `render,churn,bigMesh,integration,trajectories` no fonte e com `--dist` (imagem idêntica,
      SC-007); A/B de GPU `instances/10k` e `10k-moving` contra `b437e47` (≤ 0,52 ms) registrado abaixo

  > **T078 (2026-10-12)**: smokes `render` (10 cenas idênticas), `churn`, `bigMesh`, `integration`, `trajectories`
  > (3 taxas, bit a bit) verdes no fonte e com `--dist`; os 13 smokes da T067 também (26/26). GPU por quadro
  > (`npm run bench -- --scene instances`, mediana de 3 repetições, VS Code com ~200% de CPU na máquina):
  > `instances/10k` 1,07 → **0,66 ms**, `10k-moving` 1,08 → **0,67 ms** (baseline do gate: 0,92/0,93 ms). O alvo do
  > SC-010 (≤ 0,52 ms, A/B de `b437e47`) **não foi atingido**: a diferença de ~0,12 ms já existia no código da R8 sem
  > rebind (offset fixo: 0,64 ms) e não vem de binds nem do shader — material lido no vértice 0,64 ms; posição na luz
  > calculada no vértice 0,65 ms; sem a indireção `renderables → worlds` 0,66 ms; formato de índice igual. Contagem
  > SC-010 (binds por passe = f(pipelines)) verde em teste com 10 mil entidades.

- [x] T079 [US6] Documento de arquitetura: tabela de pools (`Renderable` atual na 006, material em pool de storage),
      seção de estágios (`firstInstance` = slot do `Renderable`, sem bind por draw); `flows.md` (`record` em
      `slot.entities`); guia de migração (material storage, `Renderable`); ROADMAP/PENDENCIAS (`Renderable` saiu da F2;
      F2 fica com agrupamento/instancing/indireto)
- [x] T080 Gate completo (format, lint, tsc, `test:coverage`, `build:lib`, `doc:coverage` sem membro sem documentação,
      API regenerada) e então a T068 (`bench:check` com a máquina livre; se verde, `bench:baseline`)

---

## Dependencies & Execution Order

- **Fase 1 → Fase 2 → Fase 3 (US1)**: bloqueantes; US1 é o mecanismo de todas as outras.
- **Fase 4 (US3)** depende de US1 (`ensureFlowAllocated`).
- **Fase 5 (US5 solvers)** depende de US3 (solvers instanciados pela C2) e de T032–T034.
- **Fase 6 (US2)** depende de US1 e US3; independe da Fase 5 (pode correr em paralelo com ela, por outra pessoa, já
  que os arquivos não se cruzam), mas a ordem do plano é física primeiro para manter as trajetórias como guarda.
- **Fase 7** depende de US2 (`FrameTargets`, forward).
- **Fase 8 (US4)** depende de todos os estágios migrados (Fases 5–7).
- **Fase 9 (US6)**: T058–T059 dependem de todos os estágios migrados; T060–T063 só da API final.
- **Fase 10** por último.
- **Fase 11 (Emenda 1)**: T070 → T071; T072 ∥ T073 depois da T071; T074 → T075 → T076; T077 depois da T075; T078 →
  T079 → T080; a T068 fecha depois da T080.

Prioridade × ordem: US2 e US3 são P1, mas US2 precisa de US3 (factories de apresentação) e é executada depois da física
para que as fixtures de trajetória protejam a C2 antes de mexer na imagem.

## Parallel Opportunities

- Fase 1: T003 ∥ T004.
- Fase 2: T005 ∥ T006 ∥ T007.
- US1: T010 ∥ T012 ∥ T015 ∥ T016 (arquivos distintos); depois T011, T013, T017 em sequência com T019–T026.
- US5: T032 ∥ T033 ∥ T034; os estágios T035–T041 em sequência (fixture como guarda de cada um).
- US2: T042 ∥ T043; T044 → T045 → T046 → T047.
- Fase 7: T050 ∥ T051.
- US4: T056 por arquivo.
- US6: T062 ∥ T063.

## Implementation Strategy

Entrega completa, todas as fases na ordem de dependência: nenhuma história fica de fora nem pela metade. Cada tarefa
termina com `tsc` e `npm test` verdes; a partir da Fase 5, também com `trajectories,render`. Commits por tarefa ou grupo
coeso de tarefas, em `feature/006-flow-slots`; PR para `develop` só depois do merge da 005 (#37) e quando pedido.
