---
description: 'Tarefas da 034 — refração física e qualidade de imagem'
---

# Tasks: Refração física e qualidade de imagem (a 034 refeita)

**Input**: `specs/034-refracao-fisica/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: pedidos pela spec (SC-001–SC-018): testes de unidade (Vitest, `countingCore`) e smokes de navegador com
medidas, no fonte e com `--dist`. Cada medida nova nasce antes da correção que ela valida.

**Regras para toda tarefa**: Resource + evento + Flow, sem helpers; C3/C4 só pela C2; cada símbolo WGSL uma vez;
nenhuma leitura de volta por quadro no motor; trajetórias bit a bit; ≤ 10 storage por estágio; sem cópia da tela nem
imagem pronta no lugar da física; critério de smoke só muda com medida apresentada e decisão do usuário; nada de código
das branches `feature/034-ray-refraction-debts` e `fix/034-correcoes-validacao`.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 Estado de partida no M4: `npm run ci`, todos os smokes (fonte e `--dist`) e `npm run bench:check -- --headless`; registrar em `specs/034-refracao-fisica/baseline-check.md` (falhas herdadas com a medida)
- [ ] T002 [P] Smoke `src/__smokes__/giNoise.ts` com a medida das manchas (viés por face, erro lento dentro da face, cintilação, contra o traçador da CPU; Cornell e janela em `medium`/`high`; névoa andando) — nasce vermelho; remover o `zzManchas.ts` temporário
- [ ] T003 [P] Teste `src/scene/systems/flowBinding/__tests__/limits.compose.test.ts`: compõe os pipelines das cenas dos smokes e confere ≤ 10 storage por estágio (piso M4)

---

## Phase 2: Fundação — prontidão e medida (US4, parte da US5)

**⚠️ Bloqueia**: os smokes das fases seguintes esperam `whenReady` e deduplicam a GPU por `gpuFrame`.

- [ ] T004 [US4] Testes `src/scene/readiness/__tests__/EngineReadiness.test.ts`: estados, transições com compilação/verificação/troca em voo, prazo, falha de compilação, falha após descarte absorvida, `consumerMissing` uma vez por par
- [ ] T005 [US4] `EngineReadiness` (Resource singleton) em `src/scene/readiness/EngineReadiness.ts`; eventos `enginePreparing`, `engineReady`, `consumerMissing` em `src/scene/events/EventMap.ts`
- [ ] T006 [US4] `catch` nas cadeias de `createAsync` e `shaderMessages` em `src/scene/systems/flowBinding/PipelineState.ts` (erro com o nome do pipeline como `engineError`; absorvido após o descarte); registro do pendente na prontidão
- [ ] T007 [US4] `FlowRuntime` (`src/scene/systems/flowBinding/FlowRuntime.ts`): Flows em `preparing` e consumidor/slot obrigatório ausente informados à prontidão; `consumerMissing` (H2)
- [ ] T008 [US4] `Application.whenReady({ timeoutMs })` em `src/presentation/app/Application.ts` (rejeita listando os pendentes)
- [ ] T009 [US4] Smoke `src/__smokes__/readiness.ts` (SC-008): névoa, GI, vidro e colisor obrigatório inseridos com a cena rodando; medida após `whenReady` igual à de espera longa (≤ 0,5 %); compilação atrasada à força com trajetória bit a bit; prazo com erro nomeado
- [ ] T010 [US5] Testes do profiler em `src/core/gpu/profiler/__tests__/GpuProfilerSystem.test.ts`: anel de 3 leituras, CPU à frente, uma entrega por quadro, sem repetição
- [ ] T011 [US5] Anel de leituras e limite de quadros em voo em `src/core/gpu/profiler/GpuProfilerSystem.ts`; evento `gpuFrameTimed` (uma leitura por quadro)
- [ ] T012 [US5] Smokes passam a esperar `whenReady` no lugar de `settle` por tempo e a deduplicar por `gpuFrame` (≥ 90 leituras): `src/__smokes__/support/extensionScenes.ts`, `fluidSurface.ts`, `nodeGraphs.ts`, `materials.ts`, `fluidField.ts`, `globalIllumination.ts`, `fog.ts`, `parametricSurfaces.ts`
- [ ] T013 Smokes completos (fonte e `--dist`) sem regressão contra T001

---

## Phase 3: Fundação — material nos acertos e footprint (R2)

- [ ] T014 Teste de composição em `src/elements/raytrace/__tests__/hitMaterial.test.ts`: um único `ray_hit_material` por pipeline; GI, fótons e refração compõem o mesmo símbolo; revisão por `materialRevision`
- [ ] T015 Módulo `src/elements/raytrace/hitMaterial.ts` (composição tirada de `ProbeFlow.composeHitMaterial`), tempo simulado no `ray_scene_info`; GI e fótons migrados (`ProbeFlow.ts`, `gi_hit.wgsl`, `gi_photon_trace.wgsl`) — imagens dos smokes da 033 idênticas bit a bit
- [ ] T016 [P] `SurfaceSample` com `footprint`, `duvdx`, `duvdy` (`src/elements/gpu/wgsl/forward.wgsl`, `forward_transmission.wgsl`); raster pelas derivadas de tela
- [ ] T017 Cone de raio nos acertos (`ray_hit_sample`) em `src/elements/gpu/wgsl/raytrace/` e AA especular nos acertos pela variância do cone (`closure_specular_aa`)
- [ ] T018 [P] Referência de CPU dos nós filtrados em `src/elements/nodes/reference/noiseNodes.ts` e testes (média do padrão no footprint)
- [ ] T019 Nós da biblioteca filtrados pelo footprint (`src/elements/gpu/wgsl/nodes/noise.wgsl` e padrões) — H6 fechada para a biblioteca; funções do usuário com `dpdx` cru documentadas como só de fragmento (`RaySceneFlow.ts`)

---

## Phase 4: User Story 6 — vídeos fiéis ao motor (P2, cedo para validar as fases seguintes)

- [ ] T020 [US6] Usage `COPY_SRC` opcional do canvas (C1, `src/core/gpu/GpuContext.ts` / opções do canvas) e captura em `src/__smokes__/support/capture.ts`: cópia do quadro apresentado para anel de 3 buffers de leitura após cada `step`, entrega ao runner por função exposta
- [ ] T021 [US6] `bench/runner/video.ts` + script `npm run video`: cenas por nome, `whenReady`, passo fixo 1/60, `stdin` do ffmpeg em `rawvideo`; H.264 High CRF 12 (padrão), `--lossless` FFV1, `--hdr10` HEVC Main10 (alvo rgba16f com o mesmo mapeamento de tons); prazo por processo, encerramento em `finally`, vigia de órfãos
- [ ] T022 [US6] Página de cenas de vídeo `src/__smokes__/videoScenes.ts` (lente, dispersão, vidros, água, cáusticas, Cornell, dia, névoa, sala, pano com sombra) — títulos fiéis ao que a cena mostra
- [ ] T023 [US6] Medida SC-010: PSNR de cada quadro decodificado contra o lido da GPU (≥ 45 dB) e 0 processos órfãos após gravação e após falha forçada; vídeos do estado de partida enviados ao usuário

---

## Phase 5: User Story 2 — antisserrilhado global (P1)

- [ ] T024 [US2] Smoke `src/__smokes__/antialiasing.ts` (SC-004, SC-005): referência de 64 jitters parada; rastro da bola atrás do vidro; borrão na órbita a 30°/s contra a referência em movimento (64 sub-quadros); padrão rasante — nasce vermelho
- [ ] T025 [P] [US2] Testes de `CameraFlow` em `src/elements/scene/flows/__tests__/CameraFlow.test.ts`: Halton (2,3) de 8, projeção com e sem jitter, `previousViewProjection`, `Camera.cut()`
- [ ] T026 [US2] Jitter e anteriores no pool `CameraMatrices` (`src/elements/scene/Camera.ts`, `flows/CameraSchemas.ts`, `flows/CameraFlow.ts`, `gpu/wgsl/kernels/camera_compose*.wgsl`); prepass e cor com a mesma matriz
- [ ] T027 [US2] Raios por pixel com o mesmo jitter: `gi_screen_common.wgsl` (`gi_camera_ray`), `forward_background.wgsl`, `src/presentation/water/wgsl/water_field.wgsl`, `water_composite.wgsl`
- [ ] T028 [P] [US2] Testes de `worldsPrevious` (só slots sujos) em `src/elements/scene/flows/__tests__/TransformFlow.test.ts`
- [ ] T029 [US2] `worldsPrevious` em `src/elements/scene/Transform.ts` e `flows/TransformFlow.ts`; poses publicadas na GPU (`rb_publish_pose.wgsl`) também guardam a anterior
- [ ] T030 [US2] Vértices anteriores em anel para `produced('vertices')`: `src/elements/geometry/SurfaceFlow.ts`, `physics/flows/SoftSurfaceFlow.ts`, `src/scene/graph/GraphFlow.ts`
- [ ] T031 [US2] Alvo `motion` (rg16f) em `src/presentation/app/FrameTargets.ts`; escrito pelo prepass (MRT) em `ForwardFlow.ts`/`forward.wgsl`, pelos sprites (`particle_sprite.wgsl`, `point_sprite.wgsl`, `diffuse_sprite.wgsl` por `velocity·dt`), pela água e pelo fundo
- [ ] T032 [US2] `TemporalAntialiasing` (Resource, `src/presentation/resources/TemporalAntialiasing.ts`) e `TemporalResolveFlow` (`src/presentation/flows/TemporalResolveFlow.ts`, `effects/temporal_resolve.wgsl`): Catmull–Rom, desoclusão, recorte por variância YCoCg, máscara reativa, descarte em corte/redimensionamento
- [ ] T033 [US2] `antialias: 'temporal' | 'msaa' | 'off'` (booleano aceito) em `Application.ts` e `defaults.ts`; sem efeitos o resolve apresenta no canvas (G2) em `PostFlow.ts`; renomear ou remover o falso FXAA e o falso SSAO de `effects.wgsl` com aviso
- [ ] T034 [US2] Sombra com PCF rotacionado pela sequência do jitter (`src/elements/gpu/wgsl/math/brdf.wgsl`)
- [ ] T035 [US2] Fechar SC-004/SC-005 no smoke `antialiasing`; custo ≤ 1,5 ms no M4 (SC-011); se as bordas em movimento não fecharem só com o temporal, levar a medida ao usuário antes de religar o MSAA
- [ ] T036 [US2] Fixtures de imagem afetadas regravadas com a lista e a montagem antes/depois (`src/__smokes__/fixtures/*-apple-metal-3.*`)

---

## Phase 6: User Story 1 — refração física (P1)

- [ ] T037 [P] [US1] Testes da referência em `src/elements/lighting/reference/__tests__/pathTracerDielectric.test.ts`: placa paralela, Snell na esfera, ângulo crítico, Fresnel exato, Beer–Lambert, pilha de meios encaixados, dispersão por canal
- [ ] T038 [US1] Dielétrico liso e GGX, pilha de meios própria, Beer–Lambert, dispersão por canal e formas da água no traçador `src/elements/lighting/reference/pathTracer.ts`
- [ ] T039 [US1] Smoke `src/__smokes__/refraction.ts` (SC-001–SC-003): seis cenas da US1 contra a referência, lente 4×, GI ligada/desligada/ausente, contagem de leituras de `scene_copy`, fração de energia no limite de interfaces — nasce vermelho
- [ ] T040 [US1] `Refraction` (Resource) em `src/elements/lighting/refraction/Refraction.ts`; alvos `refraction_request`, `refraction_radiance`, `refraction_reflection` e a fila em `FrameTargets.ts`
- [ ] T041 [US1] Pedido por pixel escrito pela camada da frente dos transmissivos (`forward_transmission.wgsl`, `ForwardFlow.ts`) e fila compacta com despacho indireto (`src/elements/gpu/wgsl/refraction/refraction_queue.wgsl`)
- [ ] T042 [US1] Interface em `refraction_interface.wgsl`: Fresnel dielétrico exato, reflexão interna total, GGX VNDF com peso G1, primeira interface com reflexão e transmissão traçadas, seguintes por roleta de Fresnel
- [ ] T043 [US1] Pilha de meios em `refraction_media.wgsl` (≤ 4, meio inicial pela câmera, empilhar/desempilhar por entidade, interfaces coincidentes) e Beer–Lambert por meio
- [ ] T044 [US1] `RefractionFlow` (`src/elements/lighting/refraction/RefractionFlow.ts`, `refraction_trace.wgsl`): caminho até 16 interfaces, dispersão em três caminhos com o índice do canal em cada interface, luz direta com sombra e `closure_indirect` no acerto opaco, céu no escape; divisão por grupo de formas de material quando passar de 10 storage
- [ ] T045 [US1] Composição dos transmissivos lendo a saída do próprio pixel (`forward_transmission.wgsl`); remover `transmission_background`/`scene_copy` dos transmissivos, inclusive a parede fina; `recordSceneCopy` só se outro consumidor existir
- [ ] T046 [US1] Estágio em `src/presentation/flows/defaults.ts` (depois dos opacos e da superfície da água, antes da composição) e evento de não suportado quando a estrutura de raios faltar
- [ ] T047 [US1] Fechar SC-001–SC-003 e o orçamento de 3 ms na lente (SC-011); vídeo da lente e da dispersão pela ferramenta nova

---

## Phase 7: User Story 3 — luz global e névoa sem manchas (P1)

- [ ] T048 [US3] Raios de tela pela face de trás fora do numerador e do denominador (`gi_screen_trace.wgsl`) — medir no `giNoise`
- [ ] T049 [US3] Resposta das sondas do mundo num passe antes do acúmulo (`gi_probe_blend.wgsl`, `ProbeFlow.ts`) (L3)
- [ ] T050 [US3] Rebatimentos g ≥ 1 pelas sondas do mundo, não pelo histórico de tela (`gi_screen_trace.wgsl`, `gi_probe_trace.wgsl`) — medir
- [ ] T051 [US3] Amostragem mista cosseno + guiada pela sonda do mundo com MIS e contenção relativa à média lenta (`gi_screen_trace.wgsl`, `gi_response.wgsl`) — medir
- [ ] T052 [US3] Histerese pela variância sem teto fixo (até 0,995) e transitório acima de 4σ (`gi_response.wgsl`, `GlobalIllumination.ts`) — medir
- [ ] T053 [US3] Sondas de tela com jitter dentro do ladrilho pela sequência comum (`gi_screen_common.wgsl`, `gi_screen_place.wgsl`)
- [ ] T054 [US3] Filtro à-trous guiado pela variância (3 passos) no lugar do 5×5 (`gi_screen_resolve.wgsl`) — medir
- [ ] T055 [US3] Quinas: amostragem sem renormalizar para a vizinha e mistura contínua com as sondas do mundo pela confiança (`gi_screen_sample.wgsl`, `src/elements/lighting/points.ts`) — medir
- [ ] T056 [P] [US3] Bilinear nos rebatimentos ≥ 2 (`gi_generation.wgsl`) e piso positivo nos pesos DDGI (`gi_weights.wgsl`) (L8, L9)
- [ ] T057 [US3] Cáusticas por tenda 2D no plano tangente (`gi_photon_trace.wgsl`, `gi_photon.wgsl`, `gi_photon_resolve.wgsl`) e fluxo a ≤ 5 % em três alturas e a 30° (SC-007) no smoke `globalIllumination`
- [ ] T058 [US3] Névoa: ambiente dos froxels pela leitura contínua das sondas e histórico com recorte por variância (`src/elements/media/points.ts`, `media_froxel_inject.wgsl`, `FroxelFlow.ts`)
- [ ] T059 [US3] Fechar SC-006 no `giNoise` e os critérios da 033 sem regressão (`globalIllumination`, `fog`); GI ≤ 3,67 ms × 1,10 (SC-011); vídeos Cornell, dia, sala e névoa

---

## Phase 8: User Story 7 — sombra e regressões (P2)

- [ ] T060 [US7] Caixa da sombra ajustada ao frustum ∩ cena, estabilizada em texels, 2048² (`shadow_matrix.wgsl`, `ShadowMap.ts`, `ShadowMatrixFlow`)
- [ ] T061 [US7] PCSS com o tamanho angular do sol e bias do plano receptor (`brdf.wgsl`, `shadowContribution.ts`); borda da mancha de sol sem degrau (US3 cenário 4)
- [ ] T062 [US7] Fixtures do `render`, `softSurface` e demais afetadas regravadas no perfil `apple-metal-3` com a montagem antes/depois; pedido de regravação no `nvidia-lovelace` registrado para a outra máquina
- [ ] T063 [US7] `scene/graph` na lista de contratos da C2 (`eslint.config.js`, `.specify/memory/constitution.md` como emenda PATCH) e o lint pegando importações fora dela
- [ ] T064 [US7] `bench:check` contra o baseline do Mac após as fases 5–7: nenhuma cena > 10 % de GPU; `instances/100k`, `10k-functions`, GI desligada nos valores do baseline (SC-012)

---

## Phase 9: User Story 8 e User Story 5 — pendências e smokes herdados (P2)

- [ ] T065 [US8] Água pelo traçado: a superfície do campo entra na fila da refração como interface com ondulações e rugosidade; `WaterFlow.ts`/`water_composite.wgsl` leem `refraction_radiance`; `water_background` removido (`src/presentation/water/**`, `WaterSurface.ts`)
- [ ] T066 [US8] `FluidSurfaceMaterial` (`src/elements/material/FluidSurfaceMaterial.ts`, `FluidSurfaceMaterialSchema.ts`): `roughness` (0,02), `refraction`/`ambient`/`shininess`/`reflectivity` obsoletos com aviso único; testes em `__tests__/FluidSurfaceMaterial.test.ts`
- [ ] T067 [US8] Cáusticas da água: medir a malha refratada até o receptor e os fótons corrigidos no `fluidSurface`; implementar o escolhido; casos `water-fresnel`, `water-absorption`, `water-highlight`, `caustics-smooth`, `caustics-temporal` (SC-017)
- [ ] T068 [US8] H3 e G3 medidos com o profiler novo (`particles/64k-water`, `rigid-bodies/10k`); corrigir a causa no motor (reordenação da vizinhança só com teste bit a bit contra o `develop`, partículas fora da grade incluídas) ou levar a medida ao usuário (SC-015)
- [ ] T069 [US8] Custo da apresentação HDR medido e registrado (011 T110)
- [ ] T070 [US5] As seis checagens desde `5ef1dd4` e H4/H5: medir AgX contra a curva de referência, exposição padrão, `CLEAR_COLOR`, luzes e hemisfério padrão, especular dos materiais de teste; corrigir no motor; critério só com decisão do usuário (`extensionPoints.ts`, `nodeGraphs.ts`, `softSurface.ts`, `fluidSurface.ts`, `parametricSurfaces.ts`, `present.wgsl`, `ToneMapping.ts`, `ForwardFlow.ts`)
- [ ] T071 [US8] Reconciliação das caixas abertas das specs 001–033 (005 T084, 006 T078, 011 T025/T083/T103/T111 marcadas com evidência; 011 T084/T087 substituídas; US5/US6 → 035; 001 T029 bloqueada) e `specs/PENDENCIAS.md` reescrito sem registro falso (SC-018)

---

## Phase 10: Polish — docs e fechamento

- [ ] T072 [P] Guias novos em `clay-engine-doc/docs/guides/`: refração, antisserrilhado, prontidão, vídeo
- [ ] T073 [P] Guias da 011 (T104–T108): `materials.md`, `lighting.md`, `presentation.md`, `node-graphs.md`, `post_processing.md`, `shaders.md`, `architecture_resource_loaders.md` (ordem dos passes nova)
- [ ] T074 [P] JSDoc dos exports novos; `specs/ROADMAP.md` (034 implementada, 035 fechamento da 011, 036 solver da água)
- [ ] T075 Smokes 3× seguidas no fonte e com `--dist`, 0 erros de página (SC-013); `npm run ci` verde
- [ ] T076 `bench:check` final e baseline regravado com a máquina livre
- [ ] T077 Vídeos das demos e das cenas da US1–US3 e da água pela ferramenta nova, enviados ao usuário (SC-014; 011 T112 no que não depende da 035)

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 (prontidão e medida bloqueiam todos os smokes) → Phase 3 (material nos acertos bloqueia US1, US3 e H6).
- Phase 4 (vídeo) depende da Phase 2; recomendada antes das US para a validação visual.
- US2 (Phase 5) antes de US1 (Phase 6): a refração com rugosidade e dispersão converge pelo acúmulo global.
- US3 (Phase 7) depende da Phase 3 e do jitter comum (T026–T027).
- US7 (Phase 8) depende de T034 (PCF rotacionado); T064 depois das Phases 5–7.
- US8 água (T065–T067) depende de US1; T068 depende de T011.
- Phase 10 por último.

### Parallel Opportunities

- T002 e T003; T025 e T028; T037 com o resto da Phase 6 até T039; T056 com T048–T055; T072–T074.

## Implementation Strategy

Entrega completa em ordem de dependência (sem escopo parcial): fundação (prontidão, medida, material nos acertos),
ferramenta de vídeo, antisserrilhado, refração, luz global, sombra e regressões, pendências, docs e fechamento. Cada
fase termina com os smokes afetados verdes no fonte e com `--dist`, a medida registrada e o vídeo quando visual.
