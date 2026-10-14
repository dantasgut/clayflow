# Tasks: Coesão e adesão de fluidos

**Input**: Design documents from `specs/030-fluid-cohesion-adhesion/` (plan, research R1–R11, data-model,
contracts/fluid-surface-forces, quickstart)

**Tests**: pedidos pela spec (FR-020–FR-023, SC-001–SC-010): testes de CPU, smoke com medidas e fixtures, bench.

## Phase 1: Setup

- [x] T001 Registrar os números de partida (GPU/CPU de `particles/4k` e `particles/64k`) e as fixtures que dependem do MPM fluido (A9: `particles-mpm-fluid`, `fluidSurface-mpm`, parte MPM de `trajectories-apple-metal-3.bin`) em `specs/030-fluid-cohesion-adhesion/research.md` (seção "Partida")
- [x] T002 Smoke `fluidBehavior` com o arranjo comum (cenas pequenas, leitura de posições só no smoke, medidas impressas: covariância, componentes conexos, partículas sem vizinhas, energia cinética, altura junto à parede, área de contato, frente da onda) e casos registrados vazios em `src/__smokes__/fluidBehavior.ts` e `src/__smokes__/support/fluidMeasures.ts`

## Phase 2: Foundational

- [x] T003 `ParticleMaterial`: campos `cohesion` (no lugar de `_pad0`), `adhesion`, `xsph` e preenchimentos no fim do struct; opções, validação (≥ 0, finito, erro nomeando o campo), acessores e constantes `WATER_COHESION`/`WATER_ADHESION` (provisórias até T012) em `src/elements/physics/materials/ParticleMaterial.ts`
- [x] T004 Escalas e passo estável: `cohesionGamma`, `adhesionAccel`, `adhesionTangential` (R2, R3), restrição viscosa do MPM (R7), `surfaceStep` com teto de 4× os substeps base (R6); passos estáveis do SPH/PBF idênticos, em `src/elements/physics/materials/ParticleMaterial.ts`; testes em `src/elements/physics/__tests__/ParticleMaterial.test.ts`
- [x] T005 Campos novos `cohesion_gamma`, `adhesion_accel`, `adhesion_tangential`, `support` em `SPHSimParamsSchema` e `PBFSimParamsSchema` em `src/elements/physics/schemas/simParams.ts`
- [x] T006 `SPHFlow` e `PBFFlow` escrevem `xsph_c` do material e os campos novos (valores efetivos, aviso único por material quando grampeados) em `src/elements/physics/flows/SPHFlow.ts` e `PBFFlow.ts`; testes de parâmetros escritos em `src/elements/physics/__tests__/SPHFlow.time.test.ts` e `PBFFlow.time.test.ts`
- [x] T007 Verificar: smokes `particles`, `trajectories`, `fluidSurface` idênticos às fixtures (sem regravar) com os padrões

## Phase 3: US1 — coesão (P1)

- [x] T008 [US1] Núcleos de Akinci `akinci_cohesion(r, H)` e `akinci_adhesion(r, H)` em `src/elements/gpu/wgsl/math/sph_kernels.wgsl`
- [x] T009 [US1] SPH: buffer privado `sph_normal`, kernel `sph_normals` (nᵢ = H Σ mⱼ/ρⱼ ∇W) em `src/elements/gpu/wgsl/kernels/sph_normals.wgsl`, módulo em `src/elements/physics/shaders/sph.ts`, pipeline e gravação só com coesão > 0 em `src/elements/physics/flows/SPHFlow.ts`; teste de passes gravados com e sem coesão em `src/elements/physics/__tests__/SPHFlow.time.test.ts`
- [x] T010 [US1] SPH: coesão + curvatura com K_ij em `sph_forces.wgsl` (ramo `cohesion_gamma > 0`, sem NaN com r → 0 ou sem vizinhas) em `src/elements/gpu/wgsl/kernels/sph_forces.wgsl`
- [x] T011 [US1] PBF: buffer privado `pbf_normal`; `pbf_vorticity` calcula ρᵢ (`curl.w`) e nᵢ com coesão > 0; `pbf_xsph` soma `dt·(a_coh + a_curv)` em `src/elements/gpu/wgsl/kernels/pbf_vorticity.wgsl`, `pbf_xsph.wgsl`, `src/elements/physics/shaders/pbf.ts`, `src/elements/physics/flows/PBFFlow.ts`
- [x] T012 [US1] Casos do smoke: gota em g = 0 (SPH e PBF; coesão de água × 0; SC-001), filete (SC-002), barragem (partículas sem vizinhas, energia que não cresce); calibrar e fixar `WATER_COHESION` (R2) em `src/__smokes__/fluidBehavior.ts` e `ParticleMaterial.ts`

## Phase 4: US2 — adesão (P1)

- [x] T013 [US2] `collider_set_adhesion(p, v, H, beta, beta_t, bound_min)`: integral de meio-espaço por Gauss-Legendre de 8 pontos sobre planos do domínio e colliders plano/caixa/esfera, arrasto tangencial, nada a d ≥ H em `src/elements/gpu/wgsl/math/collider_set.wgsl`
- [x] T014 [US2] SPH: adesão em `sph_collision` (`vel += dt·a_adh` antes do empurrão; ramo `adhesion_accel > 0`) em `src/elements/gpu/wgsl/kernels/sph_collision.wgsl`
- [x] T015 [US2] PBF: `pbf_predict` com o grupo de colliders e a adesão junto da gravidade; religação do grupo nas transições de collider em `src/elements/gpu/wgsl/kernels/pbf_predict.wgsl` e `src/elements/physics/flows/PBFFlow.ts`
- [x] T016 [US2] Casos do smoke: menisco no tanque (SC-003), placa inclinada (SC-004), gota na placa horizontal com adesão 0/0,5/1 (SC-005); calibrar `WATER_ADHESION` em `src/__smokes__/fluidBehavior.ts` e `ParticleMaterial.ts`

## Phase 5: US3 — material (P2)

- [x] T017 [US3] MPM fluido: `τ += J·μ·(C + Cᵀ)` em `src/elements/gpu/wgsl/kernels/mpm_p2g.wgsl`; passo estável viscoso em `src/elements/physics/flows/MPMFlow.ts`; teste de substeps em `src/elements/physics/__tests__/MPMFlow.time.test.ts`
- [x] T018 [US3] Casos do smoke: MPM μ baixo × alto (SC-006), XSPH baixo × alto (dissipação), material inválido em `src/__smokes__/fluidBehavior.ts`
- [x] T019 [US3] Regravar as fixtures do MPM fluido listadas em T001 (duas execuções idênticas) e listar para aprovação

## Phase 6: US4 — ajuste em execução e medição (P2)

- [x] T020 [US4] Casos do smoke: troca de coesão/adesão em execução (efeito no passo seguinte, sem realocar) e mesma trajetória a 30/60/144 Hz com coesão e adesão (SC-008) em `src/__smokes__/fluidBehavior.ts`
- [ ] T021 [US4] Variantes `4k-cohesion` e `64k-cohesion` em `bench/scenes/particles/scene.ts`, `clayflow.ts`, `three.ts`; medir SC-009 e registrar em `specs/030-fluid-cohesion-adhesion/research.md`

## Phase 7: Polish

- [x] T022 [P] Documento de arquitetura (fronteira genérica `ColliderHit` e adesão) em `clay-engine-doc/docs/guides/architecture_resource_loaders.md`; guia de materiais de partículas (coesão, adesão, XSPH, viscosidade no MPM)
- [x] T023 [P] ROADMAP (030 na linha F5) e PENDENCIAS (viscosidade do MPM resolvida; adesão sem reação no rígido como nota para 015/016) em `specs/ROADMAP.md`, `specs/PENDENCIAS.md`
- [ ] T024 [P] JSDoc dos campos novos e API regenerada; `doc:coverage` sem erros
- [ ] T025 Smokes todos no fonte e com `--dist`; `bench:check` sem regressão; gate completo (format, lint, tsc, `typecheck:bench`, `test:coverage`, `build:lib`, `doc:coverage`); baseline regravado
- [ ] T026 Vídeos (gota, filete, menisco, placa inclinada, barragem com água da 017 com × sem coesão/adesão) no scratchpad, enviados ao usuário
- [ ] T027 Spec marcada como implementada em `specs/030-fluid-cohesion-adhesion/spec.md`

## Dependencies

- Setup → Foundational → US1 → US2 → US3 → US4 → Polish.
- T008 antes de T010, T011 e T013 (núcleos compartilhados). T013 antes de T014/T015.
- T007 garante a identidade com os padrões antes de qualquer termo novo.
- [P] só na Polish (arquivos distintos).

## Implementation Strategy

Entrega completa de todas as fases em ordem, com o gate verde ao fim de cada uma; fixtures novas gravadas com duas
execuções idênticas; nenhuma fixture existente regravada, exceto as do MPM fluido (R7), listadas no PR.
