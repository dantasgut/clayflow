---
description: 'Tarefas da spec 039 — traçado em ondas'
---

# Tasks: Traçado em ondas — material fora dos laços de traçado

**Input**: Design documents from `/specs/039-tracado-em-ondas/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R15), data-model.md, contracts/ray-wave.md,
contracts/scene-readiness.md, quickstart.md

**Tests**: pedidos pela spec (SC-001, SC-002, SC-003, SC-005, SC-007) e pela constituição (V):

- testes de composição dos kernels gerados;
- testes de unidade do empacotamento, da separação e da prontidão;
- os smokes de GPU com os critérios atuais.

**Organization**:

- A fundação (onda, separação, material nos acertos) bloqueia tudo.
- A US1 migra os consumidores na ordem da proposta.
- A US2 (Deno) depende da US1.
- A US3 (carga) e a US4 (escala) vêm depois.

**Regra da GPU**: uma execução por vez. Depois de cada uma, conferir os processos em estado `E`. Kernel com
compilação errada comprovada nunca vai à GPU. No Deno, primeiro só compilação; a execução só com a aprovação do
usuário.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup — a linha de base

- [ ] T001 Registrar em `specs/039-tracado-em-ondas/baseline.md`:
  - a contagem de testes, o tsc e o lint;
  - para `nodeGraphs`, `caustics`, `globalIllumination`, `refraction` e `fluidSurface`: a situação e os números no Chrome;
  - os tempos atuais de GI, cáusticas e refração (o custo da lente).
- [ ] T002 Micro-benchmark do custo dos despachos (R13) em `src/__smokes__/dispatchCost.ts`:
  - kernels triviais sem laço;
  - N despachos indiretos com 0 grupos e com 1 grupo, num passe e em vários;
  - tempo de parede por despacho no Chrome.
  - Resultado registrado no `baseline.md`.

---

## Phase 2: Foundational — a onda e o material nos acertos

### Testes primeiro

- [ ] T003 [P] Teste de ida e volta do `closure_pack`/`closure_unpack` em `src/elements/material/pbr/__tests__/closurePack.test.ts`: a ordem dos 67 campos contra o struct `Closure` e o arredondamento f16 contra a referência da CPU.
- [ ] T004 [P] Testes de composição do material nos acertos em `src/elements/raytrace/__tests__/hitShade.test.ts`:
  - um kernel por módulo `composite`, com exatamente um `material_fn_`;
  - as constantes;
  - os volumes;
  - sem laço;
  - a classe por uniforme no das constantes.
- [ ] T005 [P] Testes da `RayWave` em `src/elements/raytrace/__tests__/RayWave.test.ts`: capacidade pelos limites, número de classes, realocação e evento.

### Implementação

- [ ] T006 `closure_pack`/`closure_unpack` em `src/elements/gpu/wgsl/math/closure.wgsl` (R2), com a referência da CPU em `src/elements/material/pbr/reference/`.
- [ ] T007 Schemas `RayHitRecord` e `RayHitSurface` e o Resource `RayWave` em `src/elements/raytrace/RayWave.ts` (data-model), mais os módulos WGSL em `src/elements/gpu/wgsl/raytrace/ray_wave.wgsl`:
  - leitura e escrita do registro;
  - contagem por classe;
  - `ray_wave_record` a partir do acerto (a montagem que saía de `ray_hit_surface`).
- [ ] T008 Separação em `src/elements/gpu/wgsl/raytrace/ray_wave_bins.wgsl`:
  - `ray_wave_scan_main`: um grupo, offsets e argumentos indiretos no formato do `CountToArgs`;
  - `ray_wave_scatter_main`: cursor atômico por classe;
  - `ray_wave_reset_main`.
- [ ] T009 Geração dos kernels de material em `src/elements/raytrace/hitShade.ts`: `hit_shade_<hash>_main` por `RayMaterialFunction`, o das constantes e o dos volumes (contracts/ray-wave.md).
- [ ] T010 Resource `RayHitShading` e `RayHitShadingFlow` em `src/elements/raytrace/RayHitShadingFlow.ts`:
  - escuta a `materialRevision`;
  - declara os pipelines de forma assíncrona;
  - publica os prontos e emite `rayHitShadingChanged`.
  - Registro no barrel e na ordem dos Flows.
- [ ] T011 A sequência de uma rodada como descriptor reutilizável pelos consumidores (reset, avanço do consumidor, separação, material por classe com o substituto) em `src/elements/raytrace/RayWave.ts`. São passes declarados, não helper.
- [ ] T012 Gate: lint, tsc e testes.

---

## Phase 3: US1 — materiais fora do traçado, com o mesmo resultado (P1)

**Independent Test**:

- os smokes `nodeGraphs`, `caustics`, `globalIllumination`, `refraction` e `fluidSurface` com os critérios atuais;
- zero `material_fn_` nos kernels de traçado.

### Cáusticas por instância (primeiro consumidor)

- [ ] T013 [US1] `caustics_instances_main` em `src/elements/gpu/wgsl/caustics/caustics_trace.wgsl` vira três kernels:
  - o registro sintético do centro da BLAS;
  - o material na onda;
  - `caustics_instances_flag_main`, que aplica `caustics_capable` sobre `closure_unpack`.
  - `CausticsFlow` com a rodada. Teste em `Caustics.test.ts`.
- [ ] T014 [US1] Smoke `caustics` no Chrome (uma execução).

### GI

- [ ] T015 [US1] `gi_probe_trace_main` e `gi_screen_trace_main` divididos em traçado (grava o registro) e continuação (`gi_shade_direct` + rebotes com `closure_indirect` sobre o fechamento desempacotado), em `src/elements/gpu/wgsl/gi/`. Rodada no `ProbeFlow.ts`; testes em `GlobalIllumination.test.ts`.
- [ ] T016 [US1] Smoke `globalIllumination` no Chrome.

### Cáusticas, fótons

- [ ] T017 [US1] Estado do fóton em pingue-pongue e `caustics_follow` dividido em avanço+traçado e continuação, com `CAUSTICS_BOUNCES` + 1 rodadas, em `caustics_trace.wgsl`. A dispersão abre os fótons por canal na hora; aleatoriedade por fóton (R7). `CausticsFlow` com as rodadas; testes.
- [ ] T018 [US1] Smoke `caustics` no Chrome.

### Refração

- [ ] T019 [US1] Câmera (R9): kernel que enumera os acertos da reta (até `REFRACTION_CAMERA_SEEN`, teto de passos), depois uma rodada de material, depois `refraction_camera_stack_main`, que monta a pilha. Em `refraction_camera.wgsl` e no `RefractionFlow.ts`.
- [ ] T020 [US1] Estado de caminho da refração e folhas (data-model):
  - `refraction_path.wgsl` reorganizado em `refraction_advance_main` (a continuação do nó anterior e o traçado seguinte) sobre o estado;
  - os ramos do 1º e do 2º nível como caminhos com `leaf`;
  - a dispersão abre os canais;
  - o lobo raro em par (R8);
  - a aleatoriedade por caminho (R7);
  - as folhas anexadas ao terminar.
- [ ] T021 [US1] Fechamento por pixel: `RadixSort` das folhas por pixel e a redução por segmento na ordem das folhas, gravando os alvos atuais da refração. Em `refraction_resolve.wgsl` e no `RefractionFlow`.
- [ ] T022 [US1] Testes de composição e de unidade da refração em ondas em `src/elements/lighting/refraction/__tests__/`.
- [ ] T023 [US1] Smoke `refraction` no Chrome, incluindo o custo. Se o custo passar de 3 ms, aplicar as reduções de R13 na ordem e medir.
- [ ] T024 [US1] Smokes `fluidSurface` e `nodeGraphs` no Chrome.

### Remoção

- [ ] T025 [US1] Remover `composeHitMaterial`, `rayHitMaterialPoint`, `ray_hit_material_ready.wgsl`, `ray_hit_closure`, `refraction_hit_closure` e `ray_volume_closure`. Migrar o smoke `fluidField`. Atualizar os testes. Conferir no `knip`.
- [ ] T026 [US1] Teste de composição geral em `src/elements/raytrace/__tests__/noMaterialInTrace.test.ts`: para cada kernel de traçado dos três consumidores, zero `material_fn_`.
- [ ] T027 [US1] Contagem de buffers de storage por kernel registrada num teste (R15). Valor da GI anotado no `baseline.md`.

---

## Phase 4: US2 — o tanque no Deno (P1)

- [ ] T028 [US2] Smoke de compilação `bench/deno/compile.ts` (R14):
  - monta a cena do tanque;
  - cria todos os pipelines de forma assíncrona;
  - lê `getCompilationInfo`;
  - não submete;
  - falha em erro ou em mais de 120 s por pipeline.
  - Roda também no Chrome.
- [ ] T029 [US2] Compilar no Deno. MSL nativo pelo harness do scratchpad (fora do repositório) para os kernels novos.
- [ ] T030 [US2] Com a aprovação do usuário: execução do tanque no Deno e gravação do vídeo no `claflow-web`. Conferir os processos depois.

---

## Phase 5: US3 — compilar antes de mostrar a cena (P2)

- [ ] T031 [US3] `PipelineState` assíncrono por padrão (síncrono só por pedido) em `src/scene/systems/flowBinding/PipelineState.ts`, mais os testes.
- [ ] T032 [US3] Declaração antecipada: os Flows de traçado e o `RayHitShadingFlow` declaram na resolução dos slots ou no evento que os faz conhecer, não no `framePrepare`.
- [ ] T033 [US3] O substituto das classes não prontas (as constantes sobre a faixa da classe) no despacho do material.
- [ ] T034 [US3] `pipelineCache?` opcional no `PlatformAdapter` e o caminho ausente no `GpuContext`, mais o teste.
- [ ] T035 [US3] Smoke `readiness`:
  - depois de `engineReady`, nenhum quadro compila;
  - inserir um material novo em execução não faz nenhum quadro esperar, e o objeto aparece com as constantes até o kernel ficar pronto.

---

## Phase 6: US4 — escala (P2)

- [ ] T036 [US4] Teste de composição com 1, 3 e 16 grafos: os kernels de traçado têm o mesmo código.
- [ ] T037 [US4] Teste do `RayHitShadingFlow`: trocar um grafo recompila só o kernel dele.
- [ ] T038 [US4] Medir no Chrome o tempo de compilação dos kernels de traçado com 1 e 16 grafos; registrar no `baseline.md`.

---

## Phase 7: Polish

- [ ] T039 JSDoc em todo export novo (`doc:coverage`). Atualizar os guias de material nos raios e de carga de cena.
- [ ] T040 Gate completo: lint, format, madge, knip, tsc, testes e build da lib.
- [ ] T041 Atualizar a spec 038 (US4: o tanque no Deno) e o `specs/PENDENCIAS.md` com o resultado do limite de buffers da GI.

## Dependencies

- Setup → Foundational → US1 (T013 → T015 → T017 → T019 → T020/T021 → T025).
- US2 depende de US1.
- US3 depende da fundação e de T025.
- US4 depende de T025.
