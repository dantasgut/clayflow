---
description: 'Tarefas da spec 031 — composição por grafos de nós e contratos de shader estruturados'
---

# Tasks: Composição por grafos de nós e contratos de shader estruturados

**Input**: `specs/031-node-graphs/` — [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md)
(A1–A20, R1–R14), [data-model.md](./data-model.md), [contracts/node-graphs.md](./contracts/node-graphs.md),
[quickstart.md](./quickstart.md)

**Tests**: obrigatórios (Constituição V e SC-001–SC-014): testes de unidade (Vitest, `countingCore`) para toda lógica
de CPU, testes de varredura do repositório e smokes de navegador com medidas (fonte e `--dist`). As fixtures
existentes são a prova da migração: **nenhuma é regravada** (SC-005).

**Organização**: por história de usuário. Todas as histórias são implementadas por completo; a prioridade só ordena.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1–US6)

---

## Phase 1: Setup

- [x] T001 Registrar o estado de partida: rodar `npm run ci`, `npm run smoke -- <todos> --headless` (fonte e `--dist`) e `npm run bench:check` na branch, guardando o resultado em `specs/031-node-graphs/baseline-check.md` (todas as fixtures verdes antes de mexer)
- [x] T002 [P] Criar os pacotes vazios com barrels: `src/scene/graph/index.ts`, `src/elements/nodes/index.ts`, `src/elements/scene/points/index.ts`, `src/presentation/water/index.ts`; ligar nos barrels de `src/scene/index.ts`, `src/elements/index.ts`, `src/presentation/index.ts`
- [x] T003 [P] Criar `src/__tests__/scan/scanRepo.ts` (leitura de arquivos do repositório para testes de varredura: lista de `.wgsl`, `.ts` de `src/`, extração de importações) usado pelas tarefas de varredura

---

## Phase 2: Foundational — contrato de shader na C2 (bloqueia todas as histórias)

**Purpose**: recursos declarados, emissão de ligações, frequências, constantes e instanciação (R1–R3, R6, R7).

### Testes

- [x] T004 [P] Testes de `src/scene/__tests__/WgslResource.test.ts`: criação congelada; cada tipo de `binding` (storage leitura/escrita, uniform, texture 2d/cube/multiamostrada/profundidade, storage-texture, sampler, sampler-comparison); `type` por `StructSchema` com e sem `array`; nome inválido; o recurso como módulo (`requires`)
- [x] T005 [P] Testes de `src/scene/__tests__/composeWgsl.bindings.test.ts`: linhas `@group/@binding` emitidas depois dos structs, determinísticas; grupo = posto da frequência entre as presentes (só `frame`+`draw` → grupos 0 e 1); ligação = ordem do nome; o mesmo recurso por dois caminhos aparece uma vez; dois recursos diferentes com o mesmo nome → `symbol-conflict`; módulo com `@group`/`@binding` no fonte → `manual-binding`; variável global usada fora do fecho de dependências → `unresolved-reference`; locais, parâmetros, `let`/`var`/`const` locais e laços não acusam
- [x] T006 [P] Testes de `src/scene/__tests__/composeWgsl.limits.test.ts`: layout conferido contra limites fornecidos (grupos, storage e uniform por estágio, ligações por grupo, amostradores e texturas por estágio) → `limit-exceeded` nomeando shader e limite
- [x] T007 [P] Testes de `src/scene/__tests__/SharedConstant.test.ts`: valor TS e módulo WGSL `const` com tipo; `@workgroup_size(NOME)` compõe; constante com o mesmo nome e valor diferente → erro
- [x] T008 [P] Testes de `src/scene/__tests__/moduleInstancing.test.ts`: módulo `instanced` com duas instâncias no mesmo shader; renomeação por token de funções, structs, constantes e alias, sem tocar comentários, strings de atributos nem substrings (`foo` não altera `foobar`); referências entre símbolos da mesma instância renomeadas juntas
- [x] T009 [P] Testes de `src/scene/__tests__/LayoutInferencer.declared.test.ts`: layout lido das declarações emitidas (sem regex); visibilidade por alcance de uso a partir dos pontos de entrada (mantida); recurso não alcançado fora do layout; cache por shader composto
- [x] T010 [P] Testes de `src/scene/__tests__/integration/FlowBinding.declared.test.ts`: `provider` `{pool}`, `{consumer}`, `{texture}`, `{scene}` e `'private'` resolvidos; privado ligado por objeto (`Map<WgslResource, BindingSource>`); fonte ausente ou sobrando → `FlowBindingError`; `groupsOf('frame'|'stage'|'batch'|'draw')` com índices e `dynamic`; duas famílias de pipeline com os mesmos recursos `frame`/`stage` → mesmo spec de layout nesses grupos; `bindGroupReplaced` só para o grupo alterado
- [x] T011 [P] Testes de `src/scene/__tests__/createComputeKernel.declared.test.ts`: `bindings` como `Map<WgslResource, BindingSource>`; recurso usado sem fonte e fonte sem uso → erro; grupos e `dynamic` por frequência
- [x] T012 [P] Testes de `src/scene/__tests__/PipelineDescriptor.constants.test.ts`: `constants` repassados aos specs de pipeline da C1 (render vértice/fragmento e compute); `family` presente no descritor; ausência de `consumes`

### Implementação

- [x] T013 Implementar `src/scene/shaders/WgslResource.ts` (`wgslResource`, tipos `WgslBinding`, `WgslResourceType`, `BindingFrequency`, `ResourceProvider`) como `WgslModule` sem fonte de função, com a linha de declaração gerada (sem números) e reexportar em `src/scene/shaders/index.ts`
- [x] T014 Estender `src/scene/shaders/scanWgslSymbols.ts` com a varredura de identificadores usados por função (excluindo parâmetros, locais, membros após `.`, atributos e chamadas) e a detecção de `@group`/`@binding` no fonte
- [x] T015 Alterar `src/scene/shaders/WgslModule.ts`: rejeitar `@group`/`@binding` (`manual-binding`), campo `instanced`; `resources` derivado dos `requires`
- [x] T016 Alterar `src/scene/shaders/composeWgsl.ts`: emitir as declarações por frequência e nome; `bindings`/`groups` em `ComposedShader`; conferir variáveis globais referenciadas (T014) contra o fecho de dependências; instanciação de módulos `instanced` por token; erro `limit-exceeded` com limites recebidos em `ComposeOptions`; memo por (entrada, limites)
- [x] T017 Adicionar `src/scene/shaders/WgslCompositionError.ts` os códigos `manual-binding`, `limit-exceeded` e a variante de `unresolved-reference` para variáveis
- [x] T018 Implementar `src/scene/shaders/SharedConstant.ts` (`sharedConstant(name, value, type)` → `{ value, module }`) e exportar
- [x] T019 Reescrever `src/scene/systems/LayoutInferencer.ts` para ler `ComposedShader.bindings` (sem `BINDING_PATTERN`), mantendo a visibilidade por alcance, com cache por shader composto
- [x] T020 Alterar `src/scene/descriptors/PipelineDescriptor.ts`: remover `consumes`, adicionar `family` e `constants`; repassar `constants` em `src/scene/systems/flowBinding/PipelineState.ts` (`computeSpec`/`renderSpec`)
- [x] T021 Alterar `src/scene/systems/flowBinding/FlowRuntime.ts`, `PipelineState.ts`, `sources.ts`: resolução por `provider` declarado e por objeto privado; remover a busca por nome e por `typeName`; `checkConsumes` substituído por conferência de providers; limites do dispositivo passados à montagem a partir do `SceneContext`
- [x] T022 Alterar `src/scene/flows/FlowBinding.ts`: `BindingSources` como `Map<WgslResource, BindingSource>` (chaves por pipeline via `{ pipeline, resource }`), `PreparedBase.groupsOf(frequency)`; ajustar `TransitionContext.bind`
- [x] T023 Alterar `src/scene/flows/createComputeKernel.ts` para `bindings: Map<WgslResource, BindingSource>` e grupos por frequência
- [x] T024 Remover o registro de resolvers por `typeName` em `src/scene/consumers/ConsumerResolver.ts`, `ConsumerResolverRegistry.ts` e `src/scene/systems/ResourceSystem.ts` (`PoolResolver` passa a ser resolvido pelo provider `{pool}`), mantendo os resolvers nomeados (`Time`, alvos)
- [x] T025 [P] Criar `src/elements/gpu/shaders/constants.ts` com `WORKGROUP_SIZE` (64), `SCAN_GROUP` (256), `NONE` (`0xFFFFFFFF`), `WATER_NO_DEPTH` (1e9), `DEFAULT_LIGHT_DIRECTION`, `MAX_SURFACE_COLLIDERS`, códigos de tipo de campo (`FIELD_*`) e de luz; substituir `RECORD_NONE` (`src/scene/flows/slots.ts`), `NO_LIGHT_SLOT` (`src/elements/material/forwardSchemas.ts`), `NO_OWNER` (`ColliderSet.ts`), `NONE` locais (`SurfaceFlow.ts`, `SurfaceColliderFlow.ts`), `FieldKind` (`ForceField.ts`), `NO_WATER_DEPTH` (`WaterSurface.ts`) e os `WORKGROUP_SIZE` locais dos Flows
- [x] T026 [P] Criar `src/elements/gpu/shaders/resources.ts` com os recursos compartilhados declarados uma vez: `cameras`, `worlds`, `renderables`, `instances`, `surface_diff`, `lights`, `shadow_maps`, `shadow_matrices`, `shadow_map`, `shadow_sampler`, `field_records`, `field_live`, `space_records`, `time`, cada um com tipo, frequência e provider
- [x] T027 [P] Criar o módulo único `finite` (saneamento de não finitos) em `src/elements/gpu/wgsl/math/finite.wgsl` + registro em `src/elements/gpu/shaders/math.ts`

**Checkpoint**: contrato novo na C2 com testes verdes; o resto do motor ainda não compila contra ele — as fases seguintes migram.

---

## Phase 3: User Story 1 — Contratos de shader estruturados, sem acoplamento (P1) 🎯

**Goal**: todo módulo e estágio do motor no contrato novo; pontos de cena para sombra e água; estágios sem
importações cruzadas (FR-001–FR-012).

**Independent Test**: varreduras (SC-001–SC-004) zeradas e todas as fixtures existentes iguais bit a bit (SC-005).

### Testes de varredura (escritos primeiro; falham até a migração terminar)

- [x] T028 [P] [US1] `src/__tests__/scan/bindings.test.ts`: nenhum `@group`/`@binding` em `.wgsl` nem em fonte WGSL embutida em `.ts` de `src/` (fora de testes do próprio contrato); nenhuma chave de ligação por string em estágios
- [x] T029 [P] [US1] `src/__tests__/scan/groupLiterals.test.ts`: nenhum `setBindGroup(<literal>` em `src/elements/**` e `src/presentation/**`
- [x] T030 [P] [US1] `src/__tests__/scan/stageImports.test.ts`: nenhum arquivo de Flow importa outro Flow nem recurso de outro estágio (`WaterSurface`, `castingShadowMap`, schemas da água fora de `presentation/water`)
- [x] T031 [P] [US1] `src/__tests__/scan/sharedConstants.test.ts`: literais `0xFFFFFFFF`, `@workgroup_size(64`, `1e9`/`1e8` de profundidade, `(0.4, -1, 0.6)` só nas definições de `constants.ts`
- [x] T032 [P] [US1] `src/__tests__/scan/implicitGlobals.test.ts`: cada `WgslModule` exportado pelo motor monta sozinho com as suas dependências (`composeWgsl` sem `unresolved-reference`)
- [x] T033 [P] [US1] Ampliar `src/elements/__tests__/wgslSymbols.test.ts` para cobrir variáveis de módulo e remover da lista de exceções o que a migração resolver (adaptadores e prontos unificados)

### Migração dos módulos e estágios de compute

- [x] T034 [P] [US1] Migrar `src/elements/gpu/compute/shaders.ts` e `src/elements/gpu/compute/wgsl/*.wgsl` (prefix sum, radix, compaction, reduce, spatial hash, graph colorer, atomic alloc, fixed point) e as classes `PrefixSum.ts`, `RadixSort.ts`, `Compaction.ts`, `Reduce.ts`, `SpatialHashGrid.ts`, `GraphColorer.ts`, `FrameUniforms.ts`, `PerStepUniforms.ts` para recursos declarados, `Map` de ligações e `groupsOf`; `reduceOp` por composição (sem template de texto)
- [x] T035 [P] [US1] Migrar a busca de vizinhança: `src/elements/gpu/shaders/neighborSearch.ts`, `src/elements/gpu/NeighborSearchPipeline.ts`, `src/elements/gpu/NeighborSearchGrid.ts` e `kernels/ns_*.wgsl`
- [x] T036 [US1] Migrar transformação e câmera: `src/elements/scene/flows/shaders.ts`, `TransformFlow.ts`, `CameraFlow.ts`, `ShadowMatrixFlow.ts` e `kernels/transform_*.wgsl`, `camera_*.wgsl`, `shadow_matrix.wgsl`; unificar `camera_compose`/`camera_compose_fn` e `transform_compose`/`transform_compose_fn` num corpo comum (FR-011)
- [x] T037 [US1] Migrar geometria e superfícies: `src/elements/geometry/shaders.ts`, `SurfaceFlow.ts` e `kernels/surface_*.wgsl`; `surface_collider_*` com recursos declarados (sem globais do hospedeiro `collider_surface_field`, `bake`)
- [x] T038 [US1] Migrar física: `src/elements/physics/shaders/**`, `src/elements/physics/flows/{LCPFlow,XPBDFlow,FEMFlow,MPMFlow,SPHFlow,PBFFlow,SoftSurfaceFlow,SurfaceColliderFlow}.ts`, `ColliderSet.ts` e os kernels `rb_*`, `xpbd_*`, `fem_*`, `mpm_*`, `sph_*`, `pbf_*`, `soft_*`, `predict`, `velocity_update`, `distance_solve`, `field_*` (com `field_records`/`field_live` do módulo compartilhado)
- [x] T039 [US1] Migrar partículas: `src/elements/particles/shaders.ts`, `EmitterFlow.ts`, `DiffuseFlow.ts`, `kernels/emit_*.wgsl`, `src/elements/gpu/wgsl/diffuse/*.wgsl` (`diffuse_common` sem globais implícitos)
- [x] T040 [US1] Rodar `npm run smoke -- trajectories,contactSet,fluidBehavior,particles,softSurface,computeKernels,limits,extensionPoints,parametricSurfaces --headless` e confirmar fixtures e manifestos iguais **sem regravar**

### Pontos de cena e desacoplamento do render

- [x] T041 [P] [US1] Testes de `src/elements/scene/points/__tests__/scenePoints.test.ts`: `light_visibility` sem contribuinte = pronto (`1.0`); com sombra; com sombra e água em ordem; contribuinte que não compõe → pronto + `extensionRejected`; `scene_light` pronto com `DEFAULT_LIGHT_DIRECTION`; com luz que projeta sombra e com a primeira luz viva
- [x] T042 [P] [US1] Testes de `src/scene/__tests__/sceneContributions.test.ts`: `Resource.getSceneContributions()` coletado pela C2; inserção e remoção do Resource recompõem os pipelines que contêm o ponto; ordem por `order`; recursos do contribuinte ligados pelos providers
- [x] T043 [US1] Generalizar `src/scene/shaders/WgslPoint.ts` e `src/scene/systems/flowBinding/ScenePoints.ts`: pontos de cena por contribuições de Resources (além das funções da 009); `getSceneContributions()` em `src/scene/contracts/Resource.ts`; composição pela instanciação de módulo (T016) no lugar de `combine` por texto
- [x] T044 [US1] Criar `src/elements/scene/points/lightVisibility.ts` e `sceneLight.ts` (pontos, prontos, tipos `SceneLight`) e o módulo de luz que seleciona a luz que projeta sombra ou a primeira viva com o recurso `lights`
- [x] T045 [US1] `src/elements/scene/ShadowMap.ts` e `Light.ts`: a luz que projeta sombra como dado do Resource (substitui `castingShadowMap` de `src/presentation/flows/ShadowFlow.ts`); contribuição `shadowVisibility` (PCF de `math/brdf.wgsl` movido para o módulo da sombra) com o registro da própria sombra (slot, ativa)
- [x] T046 [US1] Criar `src/presentation/water/` (`schemas.ts`, `shaders.ts`, `wgsl/`) movendo de `src/elements/material/shaders.ts` e `forwardSchemas.ts` todo o WGSL e os schemas da água e das cáusticas (`water_view`, `water_spheres`, `water_scene`, `water_smooth`, `caustics`, `water_light`, `water_ripple`, `water_composite`, `WaterLightMatrix`, `CausticParams`, `WaterCompositeParams`, `WaterDrawParams`, `WaterViewParams`, `WaterSmoothParams`, `WaterBoundsParams`); variante simples/multiamostrada de `water_scene` por dois recursos (sem `replace`)
- [x] T047 [US1] `src/presentation/app/WaterSurface.ts`: contribuição `causticVisibility` (lógica de `water_caustic_factor` saída de `forward.wgsl`) com os próprios recursos (`caustics`, `lightDepth`, `lightMatrix`) e registro (ativo); estado "produzido" pelo mecanismo genérico (T048)
- [x] T048 [US1] Generalizar "produzido no quadro" na C2 (`src/scene/systems/ResourceSystem.ts`, `src/scene/contracts/ResourceDirectory.ts`): o escritor declarado marca `produced(resource, descId)`; consumidores leem `isProduced`; remover `markProduced`/`isProduced` privados do `WaterSurface`
- [x] T049 [US1] Migrar `src/elements/material/shaders.ts` e os WGSL do desenho (`forward.wgsl`, `forward_camera_*.wgsl`, `forward_material_*.wgsl`, `point_sprite.wgsl`, `particle_sprite.wgsl`, `diffuse/diffuse_sprite.wgsl`, `wire.wgsl`, `presentation/flows/shadow_depth.wgsl`, `ui.wgsl`, `effects/*.wgsl`): recursos declarados, `light_visibility`/`scene_light` no lugar de sombra, luzes e água; `ForwardFrameParamsSchema` sem `causticsEnabled`, `shadowEnabled`, `shadowSlot`, `lightSlot`; unificar `forward_material_ready`/`material_fn_ready` e `material_check`/`forward_material_fn` (FR-011)
- [x] T050 [US1] Família de desenho: `family` nos `getPipelineDescriptors` de `StandardMaterial`, `PointSpriteMaterial`, `WireframeMaterial`, `DiffuseMaterial`, `ParticleMaterial`, `FluidSurfaceMaterial` e das geometrias/corpos com superfície; estágios selecionam entidades por família
- [x] T051 [US1] Migrar `src/presentation/flows/ForwardFlow.ts`: sem slot `water`, sem `bindCaustics`, sem substitutos de sombra/luz/água, sem importar `ShadowFlow`/`WaterSurface`; desenho por `groupsOf` (troca de família sem regravar grupos comuns)
- [x] T052 [P] [US1] Migrar `ShadowFlow.ts`, `ParticleFlow.ts` (sem pular `SoftBody`/`FluidSurfaceMaterial`: seleção por família; luz por `scene_light`), `PostFlow.ts`, `UIFlow.ts`, `DebugFlow.ts` para o contrato novo
- [x] T053 [US1] Migrar `WaterFlow.ts`, `CausticsFlow.ts`, `FluidSurfaceFlow.ts` para `src/presentation/water/`, sem duplicar a lógica de luz e sombra (pontos de cena), com `groupsOf`; atualizar `src/presentation/flows/defaults.ts`
- [x] T054 [US1] Rodar `npm run smoke -- render,particles,softSurface,pointCloud,fluidSurface,parametricSurfaces,extensionPoints,transforms,integration,multiApp --headless` (fonte e `--dist`) e confirmar imagens exatas **sem regravar**; varreduras T028–T033 verdes

**Checkpoint**: US1 completa — contrato estruturado em todo o motor, imagens e trajetórias bit a bit.

---

## Phase 4: User Story 2 — Grafo de nós de ponto, fundido num único shader (P1)

**Goal**: `defineNode`, `NodeRegistry`, `NodeGraph` de ponto compilado em SSA implementando um `WgslPoint`; funções da
009 como grafo de um nó (FR-013–FR-016, FR-021, FR-022, FR-025, FR-026).

**Independent Test**: grafo com ramificação igual à mesma regra escrita à mão (≤ 1 ULP) e com GPU igual (SC-006).

### Testes

- [x] T055 [P] [US2] Testes de `src/scene/graph/__tests__/NodeDefinition.test.ts`: portas e parâmetros; assinatura do código casa com as portas (erro nomeando a porta); contextos; nó WGSL do usuário validado como as funções da 009
- [x] T056 [P] [US2] Testes de `src/scene/graph/__tests__/NodeGraph.validate.test.ts`: tipos incompatíveis, conversão declarada (escalar → vetor), porta obrigatória solta, ciclo com caminho completo, nó só de `fragment` em contexto `compute` — erros síncronos nomeando nós e portas
- [x] T057 [P] [US2] Testes de `src/scene/graph/__tests__/compilePointGraph.test.ts`: um `let` por nó; nó com saída usada três vezes emitido uma vez; ordem topológica estável; struct de parâmetros tipado (`<alias>_<hash>`) com campos por nó; identidade igual para mesma forma e valores diferentes; módulo implementa o ponto alvo e passa em `point.check`; grafo vazio → pronto do ponto + aviso único
- [x] T058 [P] [US2] Testes de `src/scene/graph/__tests__/NodeGraph.resource.test.ts`: `NodeGraph` como Resource (descritor do registro em pool por forma); mudar valor → `poolWritten` sem nova compilação; `link`/`unlink` → revisão +1 e recompilação em transição; falha → anterior mantido e `extensionRejected`
- [x] T059 [P] [US2] Testes de `src/elements/extension/__tests__/extensionAsGraph.test.ts`: `TransformFunction`, `CameraFunction`, `SurfaceFunction`, `SpaceFunction`, `FieldFunction`, `MaterialFunction`, `EmitFunction` constroem grafo de um nó; API e comportamento iguais (testes existentes continuam verdes)

### Implementação

- [x] T060 [US2] Implementar `src/scene/graph/NodeDefinition.ts` (`defineNode`, tipos de porta, `with(values)`) e `src/scene/graph/NodeRegistry.ts` (registro por nome, padrão `defaultNodeRegistry`)
- [x] T061 [US2] Implementar `src/scene/graph/NodeGraph.ts` (forma imutável; a topologia muda por `setGraph` da função — research R9 "Como ficou"): nós, ligações, validação (T056), identidade por forma, registro de parâmetros tipado gerado e acessor `values`, descritores do Resource, eventos de revisão
- [x] T062 [US2] Implementar a compilação do grafo de ponto (`NodeGraph.compile`, em `src/scene/graph/NodeGraph.ts`): ordem topológica, emissão SSA, nós de entrada e saída do ponto alvo, módulo gerado com carregador de parâmetros, memo por forma, saneamento pelo módulo `finite` na saída
- [x] T063 [US2] Integrar o grafo de ponto aos estágios que hospedam pontos: `src/scene/flows/ExtensionPipelines.ts` usado por `TransformFlow`, `CameraFlow`, `SurfaceFlow`, `SurfaceColliderFlow`, `EmitterFlow` e `ForwardFlow` (estado `active/pending` único, sem cópia por estágio)
- [x] T064 [US2] Reescrever `src/scene/contracts/ExtensionFunction.ts` para hospedar código ou grafo (`{ graph }`, `setGraph`; research R9 "Como ficou") (mesma API pública: `code`, `params`, `values`, `setCode`, `revision`); remover a renomeação por regex (instanciação de T016)
- [x] T065 [US2] Nós mínimos para o teste da história em `src/elements/nodes/`: `input.surfaceSample`, `input.time`, `math.add`, `math.mix`, `noise.gradient3`, `color.ramp`, `output.surfaceParams`, cada um com referência de CPU em `src/elements/nodes/reference/`
- [x] T066 [US2] Smoke `src/__smokes__/nodeGraphs.ts` (parte a): grafo de deslocamento e cor com ramificação numa `ParametricSurface` contra a mesma regra em WGSL à mão (`MaterialFunction`/`SurfaceFunction`): diferença ≤ 1 ULP por canal e GPU por quadro igual dentro do ruído; (parte d) 60 s mudando parâmetro → 0 recompilações, troca de topologia sem quadro quebrado

**Checkpoint**: US2 completa.

---

## Phase 5: User Story 3 — Grafo de nós de conjunto, compilado num Flow (P1)

**Goal**: `GraphFlow` com intermediários alocados pela C2, contagens na GPU, memória `stale/clean` e saída de malha
(FR-017–FR-020, FR-027).

**Independent Test**: "grade → deslocar → normais → distribuir → realizar esferas" contra a CPU, sem leitura de volta
(SC-007).

### Testes

- [x] T067 [P] [US3] Testes de `src/scene/graph/__tests__/compileSetGraph.test.ts`: kernels em ordem topológica; descritores intermediários `onDemand` com capacidade pela regra; `SetCount` como descritor `indirect` escrito só pela GPU; grafo de ponto numa entrada fundido no kernel do nó (nenhum pipeline extra)
- [x] T068 [P] [US3] Testes de `src/scene/graph/__tests__/GraphFlow.test.ts`: slots das entradas e saídas; `flowReady` com slots prontos; `stale` por `poolWritten` do registro, `resourceReady`/`poolWritten` de entrada e nó de tempo; `frameRecorded` → `clean`; `dispatch` não grava nada em `clean`; despacho indireto para contagem `gpu`; posse (`owns`) da `GraphGeometry`
- [x] T069 [P] [US3] Testes de `src/elements/gpu/compute/__tests__/gpuCount.test.ts`: `CountToArgs` (contagem → despacho e desenho); `PrefixSum`, `RadixSort`, `Compaction`, `Reduce` com contagem lida do `SetCount` (variante GPU) e com contagem da CPU (inalterada)
- [x] T070 [P] [US3] Testes de `src/elements/geometry/__tests__/MeshVertex.test.ts`: `MeshVertexSchema` com 8 `f32` escalares = 32 B, igual ao layout de vértice; `GraphGeometry` com descritores `upload: 'never'` e `indirect`

### Implementação

- [x] T071 [US3] `src/scene/graph/SetCountSchema.ts` e `src/elements/gpu/compute/CountToArgs.ts` + `wgsl/count_to_args.wgsl`
- [x] T072 [US3] Variante de contagem da GPU em `PrefixSum.ts`, `RadixSort.ts`, `Compaction.ts`, `Reduce.ts` (despacho indireto, contagem lida no kernel)
- [x] T073 [US3] `src/elements/geometry/MeshVertexSchema.ts` e `GraphGeometry.ts`; migrar `wire.wgsl` e `point_sprite.wgsl` para `array<MeshVertex>` (sem `index * 8u`)
- [x] T074 [US3] `src/scene/graph/compileSetGraph.ts`: nós de conjunto (kernels, conjuntos, regras de capacidade e contagem), descritores do `NodeGraph`, fusão das entradas de ponto (via T062)
- [x] T075 [US3] `src/scene/graph/GraphFlow.ts` (subclasse de `Flow`): slots, estados `stale/clean`, transições, `dispatch` em ordem topológica com `workgroupsIndirect`, registro por fábrica com a fase do grafo
- [x] T076 [US3] Desenho da `GraphGeometry` pelo caminho indireto da `ParametricSurface` em `ForwardFlow.ts` e `ShadowFlow.ts` (sem estágio por origem)
- [x] T077 [US3] Nós de conjunto em `src/elements/nodes/set/`: `grid`, `displace`, `recomputeNormals`, `distributeOnMesh` (densidade por grafo de ponto, contagem `gpu`, determinística), `realizeInstances`, `prefixSum`, `sort`, `compact`, `reduce`, `meshOutput`, `pointsOutput`, com referências de CPU
- [x] T078 [US3] Smoke `nodeGraphs` (parte b): grafo "grade → deslocar por ruído → normais → distribuir por densidade → realizar esferas" contra `src/__smokes__/support/nodeGraphReference.ts` (contagem exata, posições e normais ≤ 1e-5), duas execuções com o mesmo hash, nenhuma leitura de volta por quadro (contador de leituras do `countingCore`/perfil)

**Checkpoint**: US3 completa.

---

## Phase 6: User Story 4 — Grafo como Resource: sub-grafos, serialização e registros tipados (P1)

**Goal**: sub-grafos, JSON, registros tipados em todos os pontos da 009 (FR-021–FR-024, FR-026; R8, R11).

**Independent Test**: 1 000 entidades com o mesmo sub-grafo → 1 compilação, 1 pipeline; JSON ida e volta bit a bit
(SC-008, SC-010).

- [x] T079 [P] [US4] Testes de `src/scene/graph/__tests__/Subgraph.test.ts`: sub-grafo como nó com parâmetros expostos; código emitido uma vez por shader; valores por uso; ciclo através de sub-grafo detectado
- [x] T080 [P] [US4] Testes de `src/scene/graph/__tests__/serialize.test.ts`: `toJSON`/`fromJSON` com registro; identidade igual; nó WGSL do usuário serializa o código; tipo desconhecido → erro nomeando o tipo; versão
- [x] T081 [P] [US4] Testes de `src/scene/__tests__/typedRecords.test.ts`: registro gerado dos `params` de cada função da 009 (tipos, sem `bitcast`, acima de 32 escalares), pool por forma `<ponto>:<hash>`; `FieldBuiltinRecord`; `CameraFnEntry` e `TransformFnPair` no lugar de `vec4u`/`vec2u`
- [x] T082 [US4] `src/scene/graph/Subgraph.ts` e `src/scene/graph/serialize.ts`
- [x] T083 [US4] Registros tipados: remover `src/scene/descriptors/ExtensionRecord.ts`; schemas por forma nas funções; `FieldBuiltinRecord` em `src/elements/physics/shaders/fields.ts` e `field_builtin.wgsl`; `combineFields.ts`/`combineSpace.ts` com um pool por função (limites conferidos por T016); `CameraFnEntry` em `CameraFlow.ts`/`camera_compose_fn.wgsl`; `TransformFnPair` em `TransformFlow.ts`/`transform_compose_fn.wgsl`
- [ ] T084 [US4] Smoke `nodeGraphs` (partes c e e): 1 000 entidades com o mesmo sub-grafo e valores diferentes → 1 compilação, 1 pipeline, valores corretos por entidade; grafo serializado e lido → mesma identidade e imagem bit a bit; `npm run smoke -- extensionPoints,parametricSurfaces,trajectories --headless` sem regravar

**Checkpoint**: US4 completa.

---

## Phase 7: User Story 5 — Biblioteca de nós base (P2)

**Goal**: nós prontos para o uso comum, cada um testado contra referência (FR-028; R12).

- [ ] T085 [P] [US5] Entradas de contexto em `src/elements/nodes/input/`: amostra de superfície, vértice, partícula, célula, tempo, câmera, posição de mundo
- [ ] T086 [P] [US5] Matemática em `src/elements/nodes/math/`: aritmética, `mix`, `clamp`, `smoothstep`, potência, trigonometria, produto escalar e vetorial, normalizar, comprimento, separar/combinar vetores
- [ ] T087 [P] [US5] Mapeamentos em `src/elements/nodes/map/`: faixa, curva por pontos, rampa de cor
- [ ] T088 [P] [US5] Ruídos em `src/elements/nodes/noise/`: valor, gradiente, celular, fBm (sobre `wgslLib.noise`), mesma semente → mesma saída na GPU e na referência
- [ ] T089 [P] [US5] Condições e conversões em `src/elements/nodes/condition/` e `src/elements/nodes/space/` (comparação, `select`, objeto/mundo/vista)
- [ ] T090 [P] [US5] Campo e superfície em `src/elements/nodes/field/` e `src/elements/nodes/surface/` (amostrar campo da cena; métrica, curvaturas, direção principal da 010)
- [ ] T091 [US5] Testes de `src/elements/nodes/__tests__/library.test.ts`: cada nó contra a referência de CPU em amostras fixas, com tolerância documentada por nó; smoke `nodeGraphs` (parte f) avaliando todos os nós na GPU contra a referência

**Checkpoint**: US5 completa.

---

## Phase 8: User Story 6 — Arquitetura documentada e migração completa (P2)

- [ ] T092 [US6] Reescrever a seção de shaders de `clay-engine-doc/docs/guides/architecture_resource_loaders.md`: recursos declarados, frequências, providers, constantes, instanciação, pontos de cena com contribuições; remover `consumes` e o `LayoutInferencer` por regex
- [ ] T093 [US6] Seção nova de grafos no documento de arquitetura: nós de ponto e de conjunto, compilação, `GraphFlow`, relação com Flows, slots e pontos da 009, sub-grafos, serialização
- [ ] T094 [P] [US6] Guia `clay-engine-doc/docs/guides/node-graphs.md` (autoria, biblioteca, exemplos do quickstart) e atualização dos guias de extensão da 009
- [ ] T095 [P] [US6] `specs/ROADMAP.md` (F3b ✅, §4.2 e §4.3 atualizados, N2 com grafos) e `specs/PENDENCIAS.md`
- [ ] T096 [US6] Revisão do documento contra o código e varreduras finais (T028–T033) verdes

---

## Phase 9: Polish & Cross-Cutting

- [ ] T097 Cena de bench `bench/scenes/graph-geometry` (clayflow) e registro em `bench/core/catalog.ts`
- [ ] T098 `npm run ci` verde (lint, format, madge, knip, tsc, testes, doc-coverage, build)
- [ ] T099 Todos os smokes no fonte e com `--dist` (`npm run smoke -- <todos> --headless` e `--dist`), fixtures existentes **sem regravar**
- [ ] T100 `npm run bench:check` sem regressão relevante; baseline regravado (`bench/baselines/`) com a cena nova
- [ ] T101 Vídeos (padrão `zzVideo`, mp4 ≤ 30 MiB, enviados ao usuário ao final da implementação): **regressivos** (as cenas visuais dos smokes existentes depois da migração — pilha de corpos rígidos, fluidos SPH/PBF/MPM com superfície e cáusticas, pano XPBD e FEM, lago paramétrico, forward com materiais, arame e pontos); geometria procedural da US3 animada; grafo de ponto animando cor e deslocamento; parâmetro mudando ao vivo; apagar `zz-vid-*` e `zzVideo.ts`
- [ ] T102 Conferir que não sobrou Chrome nem crashpad órfão dos smokes e do bench

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → **Foundational (T004–T027)** → **US1 (T028–T054)**: o contrato novo exige migrar todo o motor
  antes de qualquer grafo (os grafos compilam para ele).
- **US2 (T055–T066)** depende de US1. **US3 (T067–T078)** depende de US2 (fusão de entradas de ponto e
  `NodeGraph`). **US4 (T079–T084)** depende de US2 (sub-grafos e registros) e pode correr em paralelo com US3.
- **US5 (T085–T091)** depende de US2 (definições) e, nos nós de conjunto, de US3. **US6 (T092–T096)** depois de
  US1–US5. **Polish (T097–T102)** por último.

### Paralelismo

- Foundational: T004–T012 (testes) em paralelo; T025–T027 em paralelo entre si.
- US1: varreduras T028–T033 em paralelo; migrações T034–T035 em paralelo; T052 em paralelo com T051 depois de T049.
- US4 em paralelo com US3; nós da US5 (T085–T090) em paralelo.

## Implementation Strategy

Entrega completa de todas as fases na ordem das dependências. Cada fase fecha com o seu checkpoint verificado
(testes, varreduras e fixtures bit a bit); nada é dado como pronto com teste falhando, fixture regravada ou migração
parcial.
