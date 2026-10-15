# Tasks: Pontos de extensão matemáticos

**Input**: Design documents from `specs/009-math-extension-points/` (plan, research A1–A11 e R1–R12, data-model,
contracts/extension-points, quickstart)

**Tests**: pedidos pela spec (FR-006, FR-022, SC-001–SC-010): testes de CPU, smoke com medidas e fixtures, bench.

## Phase 1: Setup

- [x] T001 Registrar os números de partida (`instances/10k` CPU/GPU, `particles/4k`, `rigid-bodies/1k`) em `specs/009-math-extension-points/research.md` (seção "Partida")
- [x] T002 Smoke `extensionPoints` com o arranjo comum (cenas pequenas, leitura de volta só no smoke, medidas impressas) e os casos registrados vazios em `src/__smokes__/extensionPoints.ts` e `src/__smokes__/support/extensionScenes.ts`
- [x] T003 [P] ROADMAP: 030 integrada (PR #42), bugfix de ciclos (PR #43), 009 em andamento; `npm run ci` citado como gate local em `specs/ROADMAP.md`

## Phase 2: Foundational

- [x] T004 C1: `ShaderMessage` e `EngineCore.shaderMessages(spec)` (`getCompilationInfo`); `createAsync` rejeita com a mensagem do device (escopo de validação em volta da criação assíncrona) em `src/core/contracts/EngineCore.ts` e `src/core/gpu/GpuEngineCore.ts`; reexport do tipo em `src/scene/contracts/gpu`; `countingCore` dos testes atualizado
- [x] T005 C2: `ComposedShader.ranges` (módulo → linhas) em `src/scene/shaders/composeWgsl.ts`; testes em `src/scene/__tests__/composeWgsl.test.ts`
- [x] T006 C2: `WgslPoint` (nome, função, assinatura, opcionais, pronto) e `check(module)` (nome, tipos normalizados, conflitos) com `WgslCompositionError('point-signature')` em `src/scene/shaders/WgslPoint.ts`; testes em `src/scene/__tests__/WgslPoint.test.ts`
- [x] T007 C2: `bindPoints(entry, impls)` (árvore de `requires` com o pronto trocado, nome `entry@impl`, memorizado; erro se o ponto não está na árvore) em `src/scene/shaders/bindPoints.ts`; exports em `src/scene/shaders/index.ts`; testes em `src/scene/__tests__/bindPoints.test.ts`
- [x] T008 C2: `ExtensionFunction<P>` (ponto, `code`, `params`, `values`; schema gerado por hash; módulo do usuário; descritor do registro de parâmetros em pool; mutação de `code` × `values`) em `src/scene/contracts/ExtensionFunction.ts`; testes em `src/scene/__tests__/ExtensionFunction.test.ts`
- [x] T009 C2: evento `extensionRejected { point, resource, message, line }` em `src/scene/events/EventMap.ts`; `PipelineState`/`FlowRuntime`: preparar com `preferAsync` sob id novo e trocar só ao compilar; na falha, traduzir a linha por `ranges`, emitir o evento uma vez por versão e manter o anterior, em `src/scene/systems/flowBinding/PipelineState.ts` e `FlowRuntime.ts`; testes de transição em `src/scene/__tests__/`
- [x] T010 Verificar: todos os smokes com fixture idênticos sem regravar; `npm run ci` verde

## Phase 3: US1 — transform e camera (P1)

- [ ] T011 [US1] Ponto `transform` (WgslPoint sobre `transform_local`), `TransformFunction` e exports em `src/elements/extension/TransformFunction.ts`, `src/elements/extension/points.ts`, `src/elements/extension/index.ts`, `src/elements/index.ts`
- [ ] T012 [US1] `TransformFlow`: `time` em `TransformParams`; grupos por função (`EntityGroups`); kernel `transform_compose_fn` (lista de slots do grupo, normal pela inversa transposta, matriz não finita mantém a anterior); `transform_link` depois dos grupos; troca de código e rejeição pelas transições em `src/elements/scene/flows/TransformFlow.ts`, `TransformParams.ts`, `shaders.ts`, `src/elements/gpu/wgsl/kernels/transform_compose_fn.wgsl`; testes em `src/elements/scene/__tests__/TransformFlow.test.ts`
- [ ] T013 [US1] Ponto `camera` (+ `camera_project` opcional), `CameraFunction`; `CameraFlow` com despacho de `camera_fn` para câmeras com função e `time` nos parâmetros em `src/elements/extension/CameraFunction.ts`, `src/elements/scene/flows/CameraFlow.ts`, `CameraSchemas.ts`, `src/elements/gpu/wgsl/kernels/camera_compose_fn.wgsl`; testes em `src/elements/scene/__tests__/Camera.test.ts`
- [ ] T014 [US1] Forward: ponto `cameraProject` (pronto `viewProjection * world`) no `vs_main`; variante quando a câmera ativa tem `camera_project` em `src/elements/gpu/wgsl/forward.wgsl`, `src/elements/material/shaders.ts` e o `ForwardFlow`
- [ ] T015 [US1] Casos do smoke: 100 objetos em órbita + parados com TRS (SC-002, 30/60/144 Hz), olho de peixe (SC-003), parâmetros mudados em execução, cena sem funções idêntica em `src/__smokes__/extensionPoints.ts`
- [ ] T016 [US1] Variante `instances 10k-functions` (10 funções distintas) em `bench/scenes/instances/scene.ts`, `clayflow.ts`, `three.ts`; medir SC-008 e registrar em `research.md`

## Phase 4: US2 — field e emit (P1)

- [ ] T017 [US2] `ForceFieldRecord` (tipo, vetores, escalares) e registro de cada campo pronto no pool comum (gravidade pontual, vento, vórtice, arrasto, empuxo) em `src/elements/physics/forcefields/*.ts`
- [ ] T018 [US2] Ponto `field` e módulo `fieldAccel` (pronto sem campos = `vec3f(0)`; com campos: laço no pool + funções do usuário somadas por função gerada; vento com turbulência pelo `noise`); `FieldBody`; `FieldFunction` em `src/elements/extension/FieldFunction.ts`, `src/elements/gpu/wgsl/math/field_accel.wgsl`
- [ ] T019 [US2] Solvers: `v += (g + field_accel(...)) · dt` em `predict`, `fem_predict`, `pbf_predict`, `sph_forces`, `mpm_grid_update`, `rb_predict` e os Flows `LCPFlow`, `XPBDFlow`, `FEMFlow`, `MPMFlow`, `SPHFlow`, `PBFFlow` (slot do pool de campos, `time`, recompilação ao entrar função do usuário) em `src/elements/physics/flows/` e `src/elements/gpu/wgsl/kernels/`; testes de parâmetros
- [ ] T020 [US2] Verificar: `trajectories`, `particles`, `fluidSurface`, `fluidBehavior`, `contactSet`, `softSurface` idênticos sem campos
- [ ] T021 [US2] Ponto `emit`, prontas ponto/esfera/cone em WGSL, `EmitFunction`; `ComputeParticleEmitter` com taxa, vida, capacidade e semente em `src/elements/extension/EmitFunction.ts`, `src/elements/particles/ComputeParticleEmitter.ts`
- [ ] T022 [US2] `EmitterFlow`: acumulador na CPU, anel na GPU, kernels `emit_spawn`, `emit_update` (campos + gravidade, idade, morte), `emit_vertex_write` para `PointCloudGeometry` + `PointSpriteMaterial` em `src/elements/particles/EmitterFlow.ts`, `src/elements/gpu/wgsl/kernels/emit_*.wgsl`, registro em `defaultFlows`; testes do acumulador e da contagem
- [ ] T023 [US2] Casos do smoke: vento em todos os solvers (SC-004), vórtice/arrasto/empuxo, campo do usuário (anel), emissor em cone (SC-005), emissor espiral do usuário em `src/__smokes__/extensionPoints.ts`

## Phase 5: US3 — surface, space e material (P2)

- [ ] T024 [US3] Ponto `surface` (+ `surface_du`/`surface_dv`), prontas plano/esfera/toro/terreno, `SurfaceFunction`; `ParametricSurface` (resolução, domínio, fechamento, `animated`) em `src/elements/extension/SurfaceFunction.ts`, `src/elements/geometry/ParametricSurface.ts`
- [ ] T025 [US3] `SurfaceFlow`: índices fixos, kernel `surface_eval` (posição, normal por derivadas analíticas ou diferenças centrais, uv), reavaliação por tempo/parâmetros, realocação só na resolução em `src/elements/geometry/SurfaceFlow.ts`, `src/elements/gpu/wgsl/kernels/surface_eval.wgsl`; testes da grade
- [ ] T026 [US3] Ponto `space` (+ `space_jacobian`), `SpaceFunction` de cena aplicada no `surface_eval` (x' e J⁻ᵀn; J singular mantém n; ausente = sem chamada) em `src/elements/extension/SpaceFunction.ts` e `surface_eval.wgsl`
- [ ] T027 [US3] Ponto `materialEval` (pronta: `albedo`, emissão 0), `SurfaceSample`/`SurfaceParams`, `uv` interpolado até o fragmento, emissão somada; `MaterialFunction` na chave do pipeline do grupo de desenho em `src/elements/extension/MaterialFunction.ts`, `src/elements/gpu/wgsl/forward.wgsl`, `src/elements/material/`
- [ ] T028 [US3] Verificar: `render`, `softSurface`, `pointCloud`, `fluidSurface` idênticos
- [ ] T029 [US3] Casos do smoke: esfera analítica × numérica (SC-006), homotopia esfera ↔ toro, terreno, torção `space` (Jacobiana fornecida × numérica), xadrez por uv em `src/__smokes__/extensionPoints.ts`

## Phase 6: US4 — troca e erros (P2)

- [ ] T030 [US4] Casos do smoke: troca de órbita para espiral em execução (quadro seguinte, sem realocar), assinatura errada (erro síncrono), símbolo do núcleo redefinido, erro de compilação (`extensionRejected` com linha, cena continua), retorno não finito, em cada estágio (transform, camera, field, emit, surface, space, material) em `src/__smokes__/extensionPoints.ts`
- [ ] T031 [US4] Mesma trajetória a 30/60/144 Hz com funções dependentes do tempo (transform, field, emit, surface)

## Phase 7: Polish

- [ ] T032 [P] Arquitetura: pontos, `WgslPoint`/`bindPoints`, `ExtensionFunction`, troca e rejeição, diagnóstico na C1; corrigir "dedup por símbolo" (é por módulo, símbolo duplicado é erro) em `clay-engine-doc/docs/guides/architecture_resource_loaders.md`
- [ ] T033 [P] Guia de shaders (pontos deixam de ser "fora desta versão"; assinaturas e exemplos) e guia de física (campos consumidos) em `clay-engine-doc/docs/guides/shaders.md` e no guia de física
- [ ] T034 [P] ROADMAP (009 na F3; campos e emissor básico antecipados de F5/016 e F9/025) e PENDENCIAS (campos não consumidos resolvido; torque de campo em rígido, `space` em mundo para 019) em `specs/ROADMAP.md`, `specs/PENDENCIAS.md`
- [ ] T035 [P] JSDoc das APIs novas e API regenerada; `doc:coverage` sem erros
- [ ] T036 Smokes todos no fonte e com `--dist`; `bench:check` sem regressão; `npm run ci` verde; baseline regravado
- [ ] T037 Vídeos (órbita, olho de peixe, campos, emissores, homotopia, torção, xadrez) no scratchpad, enviados ao usuário
- [ ] T038 Spec marcada como implementada em `specs/009-math-extension-points/spec.md`

## Dependencies

- Setup → Foundational → US1 → US2 → US3 → US4 → Polish.
- T004–T009 antes de qualquer ponto (mecanismo, Resource, troca). T010 garante identidade antes dos pontos.
- T018 antes de T019 e T022 (o emissor integra pelos campos). T024/T025 antes de T026.
- [P] na Setup (T003) e na Polish (arquivos distintos).

## Implementation Strategy

Entrega completa de todas as fases em ordem, com `npm run ci` verde ao fim de cada uma; nenhuma fixture existente
regravada; fixtures novas gravadas com duas execuções idênticas; vídeos ao fim.
