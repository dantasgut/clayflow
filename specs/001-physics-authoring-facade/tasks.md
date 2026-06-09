# Tasks: Fachada de Autoria de Domínio para Física

**Feature**: `001-physics-authoring-facade` | **Branch**: `feature/001-physics-authoring-facade`
**Input**: plan.md, research.md (D0–D7), data-model.md, contracts/authoring-api.md, quickstart.md

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: paralelizável (arquivos distintos, sem dependência pendente).
- **[USx]**: tarefa de fase de user story.
- Testes são CPU-side determinísticos (Constituição V / SC-005), exigidos para esta feature.

## Path Conventions

Motor em `src/` (C3 `elements/physics`, C4 `presentation`); testes em `src/elements/physics/__tests__/`.
Docs em `clay-engine-doc/docs/`. **Não tocar** kernels WGSL, `schemas/`, `colliders/`, `flows/*Flow.ts`, pool.

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 [P] Criar pasta de testes `src/elements/physics/__tests__/` e confirmar config Vitest cobre o caminho
- [ ] T002 [P] Criar tipos compartilhados de autoria em `src/elements/physics/bodies/authoringTypes.ts` (uniões `Shape`, `RigidBodyDomainOpts`, `RigidBodyRawOpts` e discriminante `'schema' in opts`) conforme `contracts/authoring-api.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Bloqueia todas as user stories** — é o mecanismo de auto-registro de Flow (FR-004) que torna "sem `flows.register`" possível em qualquer body.

- [ ] T003 Criar o mapa de factories default `schema.name → (core,world,resources)=>Flow` em `src/elements/physics/flows/defaultFlows.ts` (LCP/XPBD/FEM/MPM/SPH/PBF apontando para os `*Flow` existentes — sem alterá-los)
- [ ] T004 Estender `FlowRegistry` (`src/scene/flows/FlowRegistry.ts`) com `ensureFor(schemaName, core, world, resources)`: registra a factory default se nenhum flow atende o `schema.name`; **não** sobrescreve registro manual (precedência do avançado)
- [ ] T005 Fiar o auto-registro na `Application` (`src/presentation/Application.ts`): no `world.insert` de um body, chamar `FlowRegistry.ensureFor(body.schema.name, …)`; idempotente, só na 1ª inserção de cada schema; zero custo por frame
- [ ] T006 [P] Teste CPU-side do auto-registro em `src/elements/physics/__tests__/flowAutoRegister.test.ts` (insert de body sem flow ⇒ flow default registrado; registro manual prévio ⇒ preservado; 2º insert do mesmo schema ⇒ no-op)

**Checkpoint**: auto-registro funcionando; bodies crus já não precisam de `flows.register`.

---

## Phase 3: User Story 1 — RigidBody em vocabulário de domínio (Priority: P1) 🎯 MVP

**Goal**: criar corpos rígidos com `{ mass, friction, restitution, shape, dims }` — cobre a cena inteira do
`claflow-web` (SC-001) e os Acceptance Scenarios 1, 2, 3, 6.

**Independent test**: a cena do `quickstart.md` roda sem `schema`/`data`/`vec4`/`invMass`/`flows.register`;
simulação visualmente idêntica à atual.

### Tests for User Story 1 (CPU-side determinísticos)

- [ ] T007 [P] [US1] Teste `mass→inv_mass` (mass>0 ⇒ 1/mass; mass=0/static ⇒ 0) em `src/elements/physics/__tests__/rigidBodyInvMass.test.ts`
- [ ] T008 [P] [US1] Teste `matProps` (ordem canônica `[restitution,friction,linDamp,angDamp]` + defaults) em `src/elements/physics/__tests__/rigidBodyMatProps.test.ts`
- [ ] T009 [P] [US1] Teste `shape→body_shape`+colisor (sphere `[0,r,r,r]`/SphereCollider; box `[1,hx,hy,hz]`/BoxCollider; plane/PlaneCollider) em `src/elements/physics/__tests__/rigidBodyShape.test.ts`
- [ ] T010 [P] [US1] Teste inércia analítica `I_inv` (esfera 2/5·m·r²; caixa 1/12; static ⇒ 0) em `src/elements/physics/__tests__/rigidBodyInertia.test.ts`
- [ ] T011 [P] [US1] Teste de equivalência: construtor de domínio produz o **mesmo** `data` que a forma crua correspondente (FR-006) em `src/elements/physics/__tests__/rigidBodyEquivalence.test.ts`
- [ ] T012 [P] [US1] Teste de validação de domínio (mass<0, radius≤0, halfExtents≤0 ⇒ erro legível; FR-007) em `src/elements/physics/__tests__/rigidBodyValidation.test.ts`

### Implementation for User Story 1

- [ ] T013 [US1] Implementar helpers de setup CO-LOCALIZADOS em `src/elements/physics/bodies/RigidBody.ts`: `packMatProps`, `packBodyShape`, `inertiaInv`, `invMass` (puros, fonte única da ordem do struct — research D2–D5)
- [ ] T014 [US1] Implementar o construtor de domínio em `RigidBody.ts` (discrimina `'schema' in opts`: cru ⇒ caminho atual; domínio ⇒ monta `{ schema: LCPSchema, data }` via helpers; escreve `pos.xyz`+`Transform` de fonte única — D7) mantendo 100% do caminho cru (FR-006)
- [ ] T015 [US1] Derivar e anexar o colisor coerente a partir de `shape` (FR-008) — sphere→SphereCollider, box→BoxCollider, plane→PlaneCollider, reusando `src/elements/physics/colliders/` sem alterá-los
- [ ] T016 [US1] Exportar tipos/opts públicos no barrel `src/elements/index.ts` (sem expor tipos internos de layout — Constituição II)
- [ ] T017 [US1] Validação + mensagens de domínio no construtor (FR-007)

**Checkpoint**: US1 entrega o MVP — a cena do `claflow-web` é escrevível só com vocabulário de domínio.

---

## Phase 4: User Story 2 — SoftBody em vocabulário de domínio (Priority: P2)

**Goal**: `new SoftBody({ algorithm: 'XPBD'|'FEM', position, mass, … })` roteando ao flow correto (Acceptance Scenario 4, parte soft).

### Tests for User Story 2

- [ ] T018 [P] [US2] Teste `algorithm→schema` (XPBD⇒XPBDSoftSchema, FEM⇒FEMSchema) + auto-flow em `src/elements/physics/__tests__/softBodyAlgorithm.test.ts`
- [ ] T019 [P] [US2] Teste de equivalência domínio↔cru para SoftBody (FR-006) em `src/elements/physics/__tests__/softBodyEquivalence.test.ts`

### Implementation for User Story 2

- [ ] T020 [US2] Construtor de domínio com `algorithm` discriminante em `src/elements/physics/bodies/SoftBody.ts` (mapeia params de domínio → `pos`/`vel`/campos do schema selecionado), helpers co-localizados; raw como overload
- [ ] T021 [US2] Garantir entradas do mapa default (`XPBDSoftSchema`/`FEMSchema`) em `defaultFlows.ts` (já criadas em T003 — validar) e erro legível para algoritmo sem flow (FR-007)

**Checkpoint**: soft bodies criáveis por algoritmo, sem schema/flow manual.

---

## Phase 5: User Story 3 — FluidBody em vocabulário de domínio (Priority: P3)

**Goal**: `new FluidBody({ algorithm: 'SPH'|'PBF'|'MPM', position, … })` roteando ao flow correto (Acceptance Scenario 4, parte fluido).

### Tests for User Story 3

- [ ] T022 [P] [US3] Teste `algorithm→schema` (SPH⇒SPHSchema, PBF⇒PBFSchema, MPM⇒MPMFluidSchema) + auto-flow em `src/elements/physics/__tests__/fluidBodyAlgorithm.test.ts`
- [ ] T023 [P] [US3] Teste de equivalência domínio↔cru para FluidBody (FR-006) em `src/elements/physics/__tests__/fluidBodyEquivalence.test.ts`

### Implementation for User Story 3

- [ ] T024 [US3] Construtor de domínio com `algorithm` discriminante em `src/elements/physics/bodies/FluidBody.ts` (params de domínio → campos do schema; ex.: contagem/posições de partículas), helpers co-localizados; raw como overload
- [ ] T025 [US3] Validar entradas default (`SPHSchema`/`PBFSchema`/`MPMFluidSchema`) em `defaultFlows.ts` + erro legível (FR-007)

**Checkpoint**: as 3 famílias de body têm fachada de domínio com auto-flow.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T026 [P] Atualizar guia `clay-engine-doc/docs/guides/physics_flows.md` para apresentar criação em vocabulário de domínio (construtor) e mover a forma crua para "avançado" (FR-009)
- [ ] T027 [P] Atualizar `clay-engine-doc/docs/guides/getting_started.md` (passo física com construtor de domínio + auto-flow)
- [ ] T028 [P] Regenerar API (`npm run doc`) refletindo os novos construtores/tipos públicos
- [ ] T029 Validar SC-001 reescrevendo a cena de referência do `claflow-web` (`../claflow-web/src/components/WebGPUCanvas.tsx`) com a fachada — zero `schema`/`data`/`vec4`/`invMass`/`flows.register`; comportamento idêntico (SC-006). (Repo irmão; após repointar dep `file:../clayflow`.)
- [ ] T030 Rodar o gate completo: `npm run lint && npm run format:check && npm run check:circular && npm run check:dead && npx tsc --noEmit && npm run test:coverage && npm run build:lib`
- [ ] T031 Atualizar `Status` da spec para "Implemented" e abrir PR `feature/001-physics-authoring-facade → develop`

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T006)** → **US1 (T007–T017)** → US2 (T018–T021) → US3 (T022–T025) → **Polish (T026–T031)**.
- US1 é o **MVP** e é independentemente testável/entregável (cobre SC-001). US2/US3 dependem só do Foundational (auto-flow), não de US1 — podem ser feitas em paralelo após o Foundational, mas a prioridade é P1→P2→P3.
- Dentro de US1, os testes T007–T012 são `[P]` (arquivos distintos); a implementação T013→T014→T015 é sequencial (mesmo arquivo `RigidBody.ts`); T016/T017 após T014.

## Parallel Execution Examples

- **US1 testes**: T007, T008, T009, T010, T011, T012 em paralelo (arquivos de teste distintos).
- **Polish docs**: T026, T027, T028 em paralelo.
- **Após Foundational**: US2 (T020) e US3 (T024) podem prosseguir em paralelo (arquivos distintos: SoftBody.ts vs FluidBody.ts).

## Implementation Strategy

- **MVP = Phase 1 + 2 + US1**: entrega a fachada rígida + auto-flow, suficiente para reescrever a cena atual do `claflow-web` em vocabulário de domínio. Entregável e testável sozinho.
- Incrementos US2 e US3 adicionam soft e fluidos sem tocar US1.
- Retrocompat (`{schema,data}` cru) validada por testes de equivalência em cada story (T011/T019/T023).
- GPU-First: nenhuma tarefa toca kernels/schemas/pool; toda derivação é setup-time CPU testável.
