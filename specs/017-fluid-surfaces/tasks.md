# Tasks: Superfície de fluido — água contínua com cáusticas

**Input**: Design documents from `specs/017-fluid-surfaces/` (plan, research R1–R15, data-model, contracts/water-stages,
quickstart)

**Tests**: pedidos pela spec (FR-026–FR-029, SC-001–SC-010): testes de CPU, smoke com fixtures, bench.

## Phase 1: Setup

- [x] T001 Registrar os números de partida: GPU/CPU de `particles/4k` e `particles/64k` (`npm run bench -- --scene particles --engine clayflow`) e smokes `render particles softSurface pointCloud trajectories` verdes, em `specs/017-fluid-surfaces/research.md` (seção "Partida")
- [x] T002 Cena de teste compartilhada do smoke (tanque com fundo quadriculado, paredes, caixa submersa, luz direcional com sombra, câmera, barragem de partículas) em `src/__smokes__/support/waterScene.ts`

## Phase 2: Foundational

- [x] T003 `ensureAllocated` aloca descritores de textura e devolve a spec alocada (buffer ou textura) em `src/scene/contracts/ResourceDirectory.ts` e `src/scene/systems/ResourceSystem.ts`; testes em `src/scene/__tests__/ResourceSystem.allocation.test.ts`
- [x] T004 [P] `FluidSurfaceMaterialSchema` e `FluidSurfaceMaterial` (padrões, validação, `topology: 'point-list'`, `castsShadow: false`, `caustics` booleano) em `src/elements/material/FluidSurfaceMaterial.ts` e `FluidSurfaceMaterialSchema.ts`; exportar em `src/elements/material/index.ts`; testes em `src/elements/material/__tests__/FluidSurfaceMaterial.test.ts`
- [x] T005 [P] Schemas de parâmetros dos estágios (`WaterViewParams`, `WaterSmoothParams`, `CausticParams`, `WaterCompositeParams`) e `ForwardFrameParams.causticsEnabled` em `src/elements/material/forwardSchemas.ts`
- [x] T006 `WaterSurface` (descritores sob demanda do data-model, opção `lightSize`) em `src/presentation/app/WaterSurface.ts`; inserido/removido com `FrameTargets` em `src/presentation/flows/defaults.ts`; testes (nada alocado sem água; `ensureAllocated` aloca; resize recria) em `src/presentation/__tests__/WaterSurface.test.ts`
- [x] T007 `ParticleFlow` ignora corpos com `FluidSurfaceMaterial` sem aviso em `src/presentation/flows/ParticleFlow.ts`; teste em `src/presentation/__tests__/ParticleFlow.test.ts`

## Phase 3: US1 — água contínua (P1)

- [x] T008 [US1] Shader das esferas (profundidade linear + material; espessura aditiva; vista câmera/luz; descarte pela profundidade da cena com e sem MSAA) em `src/elements/gpu/wgsl/water_surface.wgsl`; módulos em `src/elements/material/shaders.ts`
- [x] T009 [US1] Kernels da suavização bilateral separável da profundidade e do borrão da espessura em `src/elements/gpu/wgsl/water_smooth.wgsl`
- [x] T010 [US1] `FluidSurfaceFlow` (slots, seleção de corpos, `ensureAllocated`, pipelines por pool, regiões de desenho, passes e suavização, religação em `canvasReconfigured`/`poolReallocated`) em `src/presentation/flows/FluidSurfaceFlow.ts`
- [x] T011 [US1] Shader de composição (normal, luz difusa/especular, sombra; MSAA; `frag_depth`) em `src/elements/gpu/wgsl/water_composite.wgsl`
- [x] T012 [US1] `WaterFlow` (cópia `color` → `background`, passe de tela cheia nos alvos da cena) em `src/presentation/flows/WaterFlow.ts`
- [x] T013 [US1] Registro de `FluidSurfaceFlow` (câmera, `forward` −60; luz, `shadow` −10), `CausticsFlow` (`shadow` −20) e `WaterFlow` (`forward` −70) em `src/presentation/flows/defaults.ts`; exportações em `src/presentation/flows/index.ts` e `src/index.ts`; testes de ordem e seleção em `src/presentation/__tests__/waterStages.test.ts`
- [x] T014 [US1] Smoke `fluidSurface` casos de continuidade (barragem SPH 36 864, PBF, MPM fluido): sem buracos, contorno contínuo, imagem muda, 0 leituras e 0 escritas por partícula, fixtures por caso em `src/__smokes__/fluidSurface.ts`

## Phase 4: US2 — aparência de água (P1)

- [x] T015 [US2] Óptica completa na composição: refração com `background` e proteção contra o que está na frente, absorção por espessura, dispersão, Fresnel com `ambient`, especular; câmera dentro da água sem NaN em `src/elements/gpu/wgsl/water_composite.wgsl`
- [x] T016 [US2] Casos do smoke: fundo quadriculado sob três profundidades (luminância monotônica), onda × água parada (deslocamento), ângulo rasante (Fresnel), troca de parâmetros em execução, câmera dentro da água, `antialias: false` em `src/__smokes__/fluidSurface.ts`

## Phase 5: US3 — cáusticas (P1)

- [x] T017 [US3] Vista da luz no `FluidSurfaceFlow` (matriz `ShadowMatrix` do caster, escala por eixo para o raio, sem oclusão) em `src/presentation/flows/FluidSurfaceFlow.ts` e `water_surface.wgsl`
- [x] T018 [US3] Kernels de fótons (limpar, depositar com refração/Fresnel/absorção e iteração de ponto fixo contra o mapa de sombra, resolver com borrão) em `src/elements/gpu/wgsl/caustics.wgsl`
- [x] T019 [US3] `CausticsFlow` (slots, kernels, só com água + caster + material com cáusticas; aviso único para luzes além da que projeta sombra) em `src/presentation/flows/CausticsFlow.ts`
- [x] T020 [US3] Forward: `caustic_map` e `water_light_depth` no grupo 3 com manequins, `causticsEnabled` escrito quando há cáusticas, fator multiplicando a sombra em `src/elements/gpu/wgsl/forward.wgsl` e `src/presentation/flows/ForwardFlow.ts`; teste em `src/presentation/__tests__/ForwardFlow.test.ts`
- [x] T021 [US3] Casos do smoke: agitada (≥ 30% mais claro e ≥ 20% mais escuro que a luz atenuada), plana (variação ≤ 5%), sem água (0 pixels diferentes da cena sem fluido), objeto submerso, cáusticas desligadas em `src/__smokes__/fluidSurface.ts`
- [x] T022 [US3] Smokes `render`, `particles`, `softSurface`, `pointCloud` e `trajectories` idênticos às fixtures (sem regravar)

## Phase 6: US4 — escolha pelo material e coexistência (P2)

- [x] T023 [US4] Troca de material em execução (sprites ↔ água) e dois materiais de água tocando (sem mistura) em `src/presentation/flows/FluidSurfaceFlow.ts`; casos do smoke (coexistência, troca, dois materiais) em `src/__smokes__/fluidSurface.ts`
- [x] T024 [US4] Teste: sem água, nenhum passe gravado e nada alocado (`countingCore`) em `src/presentation/__tests__/waterStages.test.ts`

## Phase 7: US5 — medição (P2)

- [x] T025 [US5] Variantes `4k-water` e `64k-water` (luz direcional com sombra; água com cáusticas no clayflow; Three com sprites como referência de desenho, limitação declarada) em `bench/scenes/particles/scene.ts`, `clayflow.ts`, `three.ts`
- [x] T026 [US5] Medir SC-005 (barragem 36 864 ≥ 60 fps; acréscimo ≤ 3 ms em 64k) e ajustar parâmetros (resolução da luz, iterações) se preciso; registrar em `specs/017-fluid-surfaces/research.md`

## Phase 8: Polish

- [x] T027 [P] Documento de arquitetura (superfície genérica, estágios, cáusticas no forward, `ensureAllocated` de textura) em `clay-engine-doc/docs/guides/architecture_resource_loaders.md`; guias de flows/materiais
- [x] T028 [P] ROADMAP (017 entregue) e PENDENCIAS (P10 resolvida, notas da 017) em `specs/ROADMAP.md`, `specs/PENDENCIAS.md`
- [x] T029 [P] JSDoc dos tipos novos e API regenerada (`npm run doc:api` ou equivalente); `doc:coverage` sem erros
- [x] T030 Smokes todos no fonte e com `--dist`; `bench:check` sem regressão; gate completo (format, lint, tsc, `typecheck:bench`, `test:coverage`, `build:lib`, `doc:coverage`); baseline regravado
- [x] T031 Vídeos dos resultados (barragem com água e cáusticas, tanque com caixa submersa, coexistência) no scratchpad, enviados ao usuário
- [x] T032 Spec marcada como implementada em `specs/017-fluid-surfaces/spec.md`

## Dependencies

- Setup → Foundational → US1 → US2 → US3 → US4 → US5 → Polish. US2 e US3 dependem da superfície da US1; US3 muda o
  forward (T020) e exige T022 antes de seguir.
- [P] dentro da Foundational: T004 e T005 em paralelo; T006 depende de T003.

## Implementation Strategy

Entrega completa de todas as fases em ordem, com o gate verde ao fim de cada uma; fixtures novas gravadas com duas
execuções idênticas; nenhuma fixture existente regravada.
