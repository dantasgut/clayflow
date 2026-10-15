# Tasks: Superfícies paramétricas completas

**Input**: Design documents from `specs/010-parametric-surfaces/` (plan, research A1–A14 e R1–R11, data-model,
contracts/surfaces, quickstart)

**Tests**: pedidos pela spec (FR-006, FR-017, SC-001–SC-010): testes de CPU, smoke com medidas e fixtures, bench.

## Phase 1: Setup

- [x] T001 Registrar os números de partida com a máquina livre (`particles/64k`, `particles/64k-cohesion`, `rigid-bodies/1k`, `instances/10k`) em `specs/010-parametric-surfaces/research.md` (seção "Partida")
- [x] T002 Smoke `parametricSurfaces` com o arranjo comum (cenas pequenas, leitura de volta só no smoke, medidas impressas, fixtures novas gravadas por duas execuções idênticas) e os casos registrados vazios em `src/__smokes__/parametricSurfaces.ts` e `src/__smokes__/support/surfaceScenes.ts`
- [x] T003 [P] ROADMAP: 009 integrada (PR #44), 010 em andamento em `specs/ROADMAP.md`

## Phase 2: Foundational

- [x] T004 Módulo `surface_sample` (posição, normal, uv; formas opcionais por constante de composição) extraído do corpo do `surface_eval`; `surface_eval_main` passa a chamá-lo; vértices bit a bit (hashes do `extensionPoints` sem regravar) em `src/elements/gpu/wgsl/kernels/surface_sample.wgsl`, `surface_eval.wgsl`, `src/elements/geometry/shaders.ts`; `ALLOWED` do `src/elements/__tests__/wgslSymbols.test.ts` só se necessário
- [x] T005 `SurfaceColliderSchema` e `SurfaceColliderCellSchema`; `SurfaceCollider` (modo, resolução, folga, banda; descritores `collider` e `field` com `count = cópias × (cabeçalho + células)`; validação; realocação ao mudar modo/resolução; cópias pela animação da superfície) e exports em `src/elements/physics/colliders/SurfaceCollider.ts`, `src/elements/physics/colliders/index.ts`, `src/elements/index.ts`; testes em `src/elements/physics/__tests__/SurfaceCollider.test.ts`
- [x] T006 Tipo `surface` no `ColliderSet`: pools em `COLLIDER_POOLS` (fim da lista), `surface_count` no `ColliderSetCountsSchema`, substitutos vazios, fontes `collider_surfaces`/`collider_surface_field`/`collider_step`, `collider_step` zerado no `framePrepare` em `src/elements/physics/colliders/ColliderSet.ts`; testes em `src/elements/physics/__tests__/ColliderSet.test.ts`
- [x] T007 Módulo `surfaceColliderHit` (`collider_hit_surface`: altura bilinear com normal pela grade e `NO_HEIGHT`; distância trilinear com gradiente; caixa; cópia por `collider_step`; local → mundo pelo cabeçalho) e quarto laço em `collider_set_push_out`, `collider_set_constrain` e `collider_set_adhesion`, depois das esferas, em `src/elements/gpu/wgsl/math/surface_collider_hit.wgsl`, `src/elements/gpu/wgsl/math/collider_set.wgsl`, `src/elements/gpu/shaders/math.ts`; referência de CPU da consulta em teste (`src/elements/physics/__tests__/surfaceColliderHit.test.ts`)
- [x] T008 Cópia do passo pelo tempo (research R3, ajuste): tempos das cópias no cabeçalho, `collider_time` definido pelos kernels hospedeiros (`sph_collision`, `pbf_predict`, `pbf_collision`, `mpm_grid_update`, `mpm_particle_collision`) com o `field_time` da iteração; donos de caixa e esfera num só mapa; inícios dos campos no uniforme de contagens (limite de 10 storage buffers por estágio)
- [x] T009 Verificar: `trajectories`, `contactSet`, `particles`, `fluidSurface`, `fluidBehavior`, `softSurface`, `extensionPoints`, `render` idênticos sem regravar; `npm run ci` verde

## Phase 3: US1 — terreno colidível (P1)

- [x] T010 [US1] `SurfaceColliderFlow` (fase `physics`, prioridade 20; registro em `src/elements/physics/flows/defaultFlows.ts`): slots (superfícies com colisor, funções, registros, espaço, tempo, pool de transformações), pipelines compostos com `bindPoints` como o `SurfaceFlow` (troca e rejeição mantendo o último campo), cópias por passo no tempo do fim do passo k (`Time.stepTime`), uma cópia e só ao mudar sem animação, em `src/elements/physics/flows/SurfaceColliderFlow.ts`; testes de despachos e gatilhos em `src/elements/physics/__tests__/SurfaceColliderFlow.test.ts`
- [x] T011 [US1] Kernels do modo altura: `surface_collider_eval` (pontos locais, caixa por `atomicMin/Max` em ordem de `u32`, cabeçalho com inversa do mundo e matriz normal), `surface_collider_height` (rasterização por triângulo com `atomicMax`), `surface_collider_finish` (decodificação, `NO_HEIGHT`) em `src/elements/gpu/wgsl/kernels/surface_collider_*.wgsl` e `src/elements/physics/shaders/surfaceCollider.ts`
- [x] T012 [US1] Fluidos: SPH, PBF e MPM com o tipo `surface` (fontes ligadas; domínio abaixo do terreno nas cenas) — conferir que `bound_min` não interfere; testes de fontes
- [x] T013 [US1] Corpos rígidos: pipeline `rb_narrowphase_surface_main` (esfera: centro; caixa: cantos, `feature = k`, peso `1/n`; profundidade preditiva como o plano), despachado só com `surface_count > 0`, faixa `pool_base` no fim de `total_col_count`, cursor de passo do LCP, em `src/elements/gpu/wgsl/kernels/rb_narrowphase.wgsl` e `src/elements/physics/flows/LCPFlow.ts`; testes em `src/elements/physics/__tests__/LCPFlow.contacts.test.ts`
- [x] T014 [US1] XPBD, FEM e emissor colidem com os colliders (todos os tipos): kernels `xpbd_collide`, `fem_collide` e variante do `emit_update` com `collider_set_push_out`, só com colliders na cena, cursor de passo, em `src/elements/gpu/wgsl/kernels/`, `XPBDFlow.ts`, `FEMFlow.ts`, `src/elements/particles/EmitterFlow.ts` e shaders; testes de despacho
- [x] T015 [US1] Casos do smoke: `terrain-bodies` (50 corpos, 6 s, nenhum abaixo além da folga, ≥ 95 % em repouso — SC-001), `terrain-fluids` SPH/PBF/MPM (nenhuma partícula abaixo, centróide no vale — SC-002), `solvers` XPBD/FEM/emissor sobre o terreno, `empty` (sem superfícies, trajetória idêntica) em `src/__smokes__/parametricSurfaces.ts` e `support/surfaceScenes.ts`
- [x] T016 [US1] Caso `terrain-animated`: terreno que sobe e desce, corpo em repouso acompanhando, mesmo estado a 30/60/144 Hz (SC-008)
- [x] T017 [US1] Caso `terrain-water`: água PBF com `FluidSurfaceMaterial` (refração, absorção, cáusticas) no terreno dentro da caixa de sombra; nenhuma partícula abaixo, nível do lago estável no último segundo (≤ 1 espaçamento), 0 escapando por baixo; imagem com superfície e cáusticas no vale (fixture nova) — SC-002a

## Phase 4: US2 — superfície geral colidível (P1)

- [x] T018 [US2] Kernels do modo distância: caixa com banda, semeadura (distância exata ponto-triângulo; `atomicMin` dos bits e depois do id), jump flooding 3D em ping-pong (26 vizinhos, desempate pelo menor id), finalização (distância exata e sinal pela normal da face) em `src/elements/gpu/wgsl/kernels/surface_collider_{seed,jfa,finish}.wgsl`; `SurfaceColliderFlow` com as passadas; referência de CPU num teste pequeno
- [x] T019 [US2] Casos do smoke: `torus-bodies` (nenhum centro dentro além da folga; escorregam pelo furo ou repousam), `sphere-fluid` (nenhuma partícula com distância < −½ espaçamento), `adhesion` (adesão da 030 na superfície como num collider comum) — SC-003

## Phase 5: US3 — geometria diferencial e malha adaptativa (P2)

- [x] T020 [US3] Segundas derivadas: pontos opcionais `surface_duu`/`surface_duv`/`surface_dvv` (as três ou nenhuma) e `SurfaceFunction.analytic2`; numéricas por diferenças (diagonais); com espaço, diferenças do mapa composto; prontas plano/esfera/toro com primeiras e segundas analíticas em `src/elements/geometry/shaders.ts`, `src/elements/extension/SurfaceFunction.ts`, `src/elements/gpu/wgsl/kernels/surface_fn_ready.wgsl` e módulos de derivadas
- [x] T021 [US3] Formas e curvaturas no `surface_sample` (E, F, G, L, M, N, K, H, k₁, k₂, direção principal; não finito → recuo/0) e pool `SurfaceDiffSchema` descrito pela `ParametricSurface` com `differential: true`; `surface_eval` grava o pool em `src/elements/geometry/ParametricSurface.ts`, `SurfaceSchemas.ts`, `SurfaceFlow.ts`; referência de CPU das curvaturas em `src/elements/geometry/__tests__/differential.test.ts`
- [x] T022 [US3] `SurfaceSample` com `metric`, `curvature`, `principal` (acréscimos; zeros na variante comum e no `material_check`); `RenderableSchema.diff_first`; variante `forward_diff` (lê `surface_diff[diff_first + vertex_index]`) escolhida pelo grupo em `src/elements/gpu/wgsl/material_point_types.wgsl`, `material_check.wgsl`, `forward.wgsl`, `src/elements/scene/Renderable.ts`, `src/presentation/flows/ForwardFlow.ts`; testes da escolha da variante
- [x] T023 [US3] Casos do smoke: `curvature` (esfera K = 1/r², H = 1/r com erro ≤ 1 %; toro ≤ 2 %; analíticas e numéricas; nenhum não finito — SC-004) e `curvature-material` (toro com cor pelo sinal de K; imagem, fixture nova)
- [x] T024 [US3] Malha adaptativa: `AdaptiveOptions` e descritores (`vertices`, `indices`, `diff`, `indirect` pelo orçamento) na `ParametricSurface`; kernels `surface_adapt_level` (curvatura, métrica e câmera ativa), `surface_adapt_budget` (histograma e viés), `surface_adapt_scan` (prefixos, um grupo de trabalho), `surface_adapt_emit` (vértices, índices com colapso das arestas sobre o vizinho, arestas do wireframe, contagens) em `src/elements/gpu/wgsl/kernels/surface_adapt_*.wgsl`; `SurfaceFlow` com slots de câmera e gatilhos de refazer (superfície, câmera além do limiar) em `src/elements/geometry/SurfaceFlow.ts`; testes dos gatilhos
- [x] T025 [US3] Desenho indireto: kernel `indirect_args` (contagem da geometria + `first` do grupo do passe) e ramo `indexedIndirect` no `ForwardFlow` (triângulos e wireframe) e no `ShadowFlow`; pedido de `indirect-first-instance` quando o adaptador tem; sem a feature, grade uniforme de mesma precisão máxima e evento `adaptiveUnavailable` em `src/presentation/flows/ForwardFlow.ts`, `ShadowFlow.ts`, `src/presentation/flows/indirect_args.wgsl`, `src/presentation/app/`, `src/scene/events/EventMap.ts` (tipo do evento); testes do ramo
- [x] T026 [US3] Caso `adaptive`: terreno de perto e de longe (≥ 2× triângulos por área perto; total ≤ 50 % da uniforme de mesma precisão máxima), esfera fechada adaptativa sem pixel do fundo dentro da silhueta da uniforme (0 frestas), deformação animada sem leitura de volta — SC-005

## Phase 6: US4 — geometria de CPU (P3)

- [x] T027 [US4] Normais por diferenças centrais da função (`h = 1e-4`, recuo em bordas e polos, lado da frente do enrolamento) em `src/elements/geometry/ParametricGeometry.ts`; testes em `src/elements/geometry/__tests__/ParametricGeometry.test.ts`
- [x] T028 [US4] Smoke `bigMesh` com a luz de frente para o plano (critério igual) em `src/__smokes__/bigMesh.ts`; caso `cpu-normals` (esfera ≤ 1° da radial — SC-006); fixtures afetadas listadas (esperado: nenhuma)

## Phase 7: Polish

- [ ] T029 [P] Arquitetura: tipo `surface` na fronteira, campo em pool, construção por passo e cursor, diferencial em pool, desenho indireto composto por passe em `clay-engine-doc/docs/guides/architecture_resource_loaders.md`
- [ ] T030 [P] Guias de física (colisor de superfície, XPBD/FEM/emissor colidindo) e de superfícies/shaders (`SurfaceSample` novo, segundas derivadas, adaptativa) em `clay-engine-doc/docs/guides/`
- [ ] T031 [P] ROADMAP (F3 fechada; próximo: F4 pela 011) e PENDENCIAS (P2 parcial: superfície colide, `MeshCollider` segue sem contato; escala não uniforme e atraso de um quadro do `Transform` animado) em `specs/ROADMAP.md`, `specs/PENDENCIAS.md`
- [ ] T032 [P] JSDoc das APIs novas e API regenerada; `doc:coverage` sem erros
- [ ] T033 Bench: variantes `particles/64k-terrain` e `instances/surface-adaptive` em `bench/scenes/`; `bench:check` sem regressão; baseline regravado com a máquina livre
- [ ] T034 Smokes todos no fonte e com `--dist`; `npm run ci` verde
- [ ] T035 Vídeos (terreno com corpos e água formando lago com cáusticas; superfície deformando com malha adaptativa em wireframe; material por curvatura) no scratchpad, enviados ao usuário
- [ ] T036 Spec marcada como implementada em `specs/010-parametric-surfaces/spec.md`

## Dependencies

- Setup → Foundational → US1 → US2 → US3 → US4 → Polish.
- T004 antes de T010 (o colisor avalia pelo `surface_sample`) e de T021/T024.
- T005–T008 antes de qualquer consumidor (T012–T014). T009 garante identidade antes dos casos.
- T010/T011 antes de T015–T017; T018 depende de T010. T020/T021 antes de T022–T024; T024 antes de T025/T026.
- [P] na Setup (T003) e na Polish (arquivos distintos).

## Parallel Example

- US1: T013 (LCP) e T014 (XPBD/FEM/emissor) mexem em arquivos distintos depois de T010–T012.
- US3: T022 (material) e T024 (adaptativa) depois de T021.
- Polish: T029–T032 juntos.

## Implementation Strategy

Entrega completa de todas as fases em ordem, com `npm run ci` verde ao fim de cada uma; nenhuma fixture existente
regravada (exceções listadas no PR); fixtures novas gravadas com duas execuções idênticas; vídeos ao fim.
