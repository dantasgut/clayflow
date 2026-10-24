---
description: 'Tarefas da 037 — padronização matemática e reuso'
---

# Tasks: Padronização matemática e reuso

**Input**: `specs/037-padronizacao-matematica/` (spec.md, plan.md, inventory.md, research.md, data-model.md,
contracts/math-canon.md, quickstart.md)

**Tests**: pedidos pela spec (FR-002, FR-006, SC-002, SC-003): testes de unidade (Vitest, `countingCore`) de
equivalência contra a referência f64, de assinaturas canônicas, de sequências bit a bit e dos pools novos; smokes de
navegador contra a base, no fonte e com `--dist`. Cada teste nasce antes da migração que ele valida.

**Regras para toda tarefa**: Resource + evento + Flow, sem helpers; C3/C4 só pela C2; cada símbolo WGSL uma vez; nada
específico de Mac ou NVIDIA; famílias bit a bit intactas (inventário §8); código de shader novo só para matemática nova;
toda troca que muda resultado entra no pacote da T048 (medida, tabela antes/depois, decisão do usuário) e não regrava
fixture nem critério antes disso; cada tarefa atualiza a coluna de estado do `inventory.md`; "textura" só para imagem
em superfície. Branch `feature/037-padronizacao-matematica`; commit só quando o usuário pedir.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [x] T001 Base no estado `d38416d6`: `npm run ci`, todos os smokes (fonte e `--dist`) e `npm run bench:check -- --headless` no M4; números por smoke e por cena em `specs/037-padronizacao-matematica/baseline-smokes.md` (as falhas conhecidas da 034 — `antialiasing` e o controle da lente — registradas como estão)
- [x] T002 [P] Contagem de linhas de WGSL por família (as definições do inventário e as contas inline) e de cópias por assinatura, registrada no fim de `specs/037-padronizacao-matematica/inventory.md` (base de SC-005)

---

## Phase 2: Fundação — referências f64 e a guarda

**⚠️ Bloqueia**: as migrações das US2–US4 são verificadas contra estas referências e por esta guarda.

- [x] T003 [P] Referências f64 na CPU, absorvendo as atuais: `src/elements/math/reference/xform.ts` (de `elements/raytrace/reference/bvh.ts` `invertAffine`/`transformPoint`/`transformDir`/`transformBox` e `elements/nodes/reference/space.ts` `spaceInverseAffine`/`inverse3`/`spaceApply*`), `random.ts` (de `elements/nodes/reference/noise.ts` `pcgHash`/`hash2`/`hash3`/`hashSigned`, `ProbeFlow.ts` `random`, `pathTracer.ts` `hash`), `color.ts` (de `elements/material/reference/tonemap.ts` `srgbEncode`/`srgbDecode`); os antigos passam a reexportar ou a chamar; testes existentes verdes sem mudar valores
- [x] T004 Teste de assinaturas canônicas `src/elements/__tests__/canonicalSignatures.test.ts` (research R1): cada padrão (multiplicadores do PCG e de Teschner, pesos de luminância, curva sRGB, π/2π literais, base de Duff, `ndc·½+½`) com o módulo dono e a lista de ocorrências ainda pendentes (o inventário); falha em ocorrência nova fora da lista e em item da lista que já sumiu (a lista só encolhe)

---

## Phase 3: User Story 1 — inventário (P1)

**Goal**: o registro vivo e a guarda ligados a cada família.

**Independent Test**: acrescentar uma cópia do PCG num shader qualquer faz o `canonicalSignatures.test.ts` falhar
apontando o arquivo.

- [x] T005 [US1] `inventory.md` com a coluna de estado por entrada, a ligação de cada padrão do teste à família e a regra de atualização por tarefa
- [x] T006 [US1] Teste do próprio teste: casos sintéticos (cópia nova, item pendente removido, exceção de referência da CPU) em `src/elements/__tests__/canonicalSignatures.test.ts`

**Checkpoint**: a guarda passa com as pendências atuais e falha em duplicata nova.

---

## Phase 4: User Story 2 — primitivas únicas (P1)

**Goal**: uma definição de cada primitiva; trocas que preservam bits feitas; as que mudam resultado prontas para a
T048.

**Independent Test**: as assinaturas da família somem da lista de pendências; os smokes das famílias bit a bit
(`shaderLibrary`, `nodeGraphs`, `extensionPoints`, `parametricSurfaces`, `trajectories`) idênticos à base.

### Testes

- [x] T007 [P] [US2] Testes em `src/elements/math/reference/__tests__/random.test.ts`: valores de controle do PCG (os de `noiseReference.test.ts`), `random_unit` < 1 para todo u32 de borda, independência entre fluxos (correlação de Pearson entre `random_seed(a, i, f)` e `random_seed(b, i, f)` em 10⁵ índices abaixo de 0,01)

### Preservam bits

- [x] T008 [P] [US2] Constantes `PI`, `TAU`, `INV_PI` em `src/elements/gpu/wgsl/math/constants.wgsl` (módulo em `src/elements/gpu/shaders/math.ts`); `SKY_PI`, `GI_PI`, `BSDF_PI`, `FROXEL_PI`, os literais de 2π (`refraction_interface.wgsl:32`, `emit_fn_ready.wgsl`, `diffuse_spawn.wgsl`, `water_ripple.wgsl`) e os das SPH (`sph_kernels.wgsl`) passam a elas
- [x] T009 [US2] Família de aleatoriedade em `src/elements/gpu/wgsl/math/random.wgsl` (de `math/noise.wgsl`: `pcg_hash`, `hash2`, `hash3`, `hash_signed`; novos `random_next`, `random_unit`); `diffuse_hash` (`diffuse/diffuse_common.wgsl`), `ray_direct_hash` (`raytrace/ray_direct.wgsl`), `gi_hash` (`gi/gi_direct.wgsl`) e os inline de `froxel_rotation` (`media/media_common.wgsl`) e `diffuse_dither` (`diffuse/diffuse_sprite.wgsl`) passam a `pcg_hash`; `refraction_random` e `gi_photon_random` a `random_next` com a conversão que cada um usa hoje (sem mudar bits nesta tarefa); `set_hash_unit` e `emit_rand` a `random_unit`
- [x] T010 [US2] Família de endereçamento em `src/elements/gpu/wgsl/math/hash_address.wgsl` (`hash_cell`, `hash_knuth`); `sh_hash` (`compute/wgsl/spatial_hash.wgsl`), `field_bucket`/`field_super_bucket` (`fields/field_common.wgsl`), `gi_photon_bucket`, `rb_warm_home` (`math/lcp_state.wgsl`), `refraction_stratum_pixel` passam a ela com a redução no chamador; smoke `trajectories` e `SpatialHashGrid.test.ts` idênticos
- [x] T011 [US2] Cor em `src/elements/gpu/wgsl/math/color.wgsl`: `luminance` passa a ser a Rec.709 (os usuários BT.601 — filtro do sinal traçado e o espelho do smoke `shaderLibrary` — ficam apontados para uma `luminance_bt601` provisória até a T048); `ray_direct_luminance`, `refraction_luminance`, `node_color_luminance` chamam `luminance`; `gi_luminance` removida; `ycocg`/`ycocg_inverse` (de `temporal_resolve.wgsl` `taa_ycocg`/`taa_rgb` e do inline de `forward.wgsl:128`); `max_channel`; `srgb_encode`/`srgb_encode_extended` sobre uma curva; `srgb_decode` (o inline de `nodes/color.wgsl:45`); `gamma_encode` → `grade_gamma` (`effects.wgsl`); `unpack_half_rgb` (`gi_unpack_rgb`, `gi_unpack_generation`, `gi_unpack`)
- [x] T012 [P] [US2] Bases e amostragem: `basis_duff` em `src/elements/gpu/wgsl/math/basis.wgsl` (de `refraction_basis`, `gi_screen_basis`, `closure_default_tangent`, `nodes/geometry.wgsl:16`); `basis_cross(n, limiar)` com o limiar de cada uso preservado (`gi_photon_basis`, `diffuse_basis`, `emit_fn_ready.wgsl:40`); `src/elements/gpu/wgsl/math/sampling.wgsl` com cosseno, esfera, cone, disco e triângulo (os inline de `gi_screen_trace`, `gi_photon_trace`, `emit_fn_ready`, `diffuse_spawn`, `set_distribute_sample`), sem mudar bits
- [x] T013 [P] [US2] Halton único (`TemporalAntialiasing.halton` usado por `FroxelFlow.ts`); smokes: medidas de imagem num suporte único em `src/__smokes__/support/` distinguindo `lumaSrgb` de `luminanceLinear` (as ~15 cópias), mulberry32 e LCG num gerador de suporte com a sequência de `support/particleScenes.ts` preservada

### Mudam resultado (preparadas para a T048, sem regravar nada)

- [x] T014 [US2] Fluxos nomeados `RANDOM_STREAM_*` (constantes compartilhadas) e `random_seed(fluxo, índice, quadro)`; refração, sondas de tela, sondas do mundo, fótons, partículas difusas, froxels e a amostragem das luzes (`ray_direct.wgsl`) passam a ele, atrás de uma constante de migração que mantém as sementes antigas até a decisão; medida antes/depois nos smokes `globalIllumination`, `giNoise`, `fog`, `refraction`, `antialiasing`, `parametricSurfaces`
- [x] T015 [US2] Luminância Rec.709 no filtro do sinal traçado e no espelho do smoke `shaderLibrary` (fim da `luminance_bt601` provisória): medida no `antialiasing` e no `shaderLibrary`
- [x] T016 [US2] `random_unit` nas partículas difusas (`diffuse_rand`, `diffuse_dither`: o `f32(h)/2³²` que pode dar 1,0): medida no `parametricSurfaces`

**Checkpoint**: assinaturas de hash, cor, π e Duff fora das pendências; famílias bit a bit idênticas à base.

---

## Phase 5: User Story 3 — álgebra canônica (P1)

**Goal**: uma família de operações por classe, escolhida por nome; nenhuma inversa própria fora dela.

**Independent Test**: os testes de equivalência passam nas tolerâncias de research R3; ray_instances, nós de espaço,
colisor e câmera usam a família; os smokes `rayScene`, `nodeGraphs`, `shaderLibrary`, `render` iguais à base.

- [x] T017 [US3] Testes de equivalência em `src/elements/math/reference/__tests__/xform.test.ts` e no smoke `shaderLibrary` (caso por classe, GPU contra f64): compor, inverter, ponto, direção, normal; afim com número de condição até 1e3; guarda de det
- [x] T018 [US3] Módulos `src/elements/gpu/wgsl/math/xform_rigid.wgsl`, `xform_affine.wgsl`, `xform_projective.wgsl`, `xform_trs.wgsl`; `linalg.wgsl` com `mat3_inverse_symmetric` (de `fields/field_density.wgsl:30`); módulos em `src/elements/gpu/shaders/math.ts`
- [x] T019 [US3] Migração: `rigid_mat4_inverse` → `rigid_inverse` (`math/camera.wgsl` `camera_view`); `ray_inverse_affine` (`raytrace/ray_common.wgsl`, `ray_instances.wgsl:74`), `node_space_inverse` (`nodes/space.wgsl`) e o inline de `kernels/surface_collider_build.wgsl:117` → `affine_inverse`; `transform_local.wgsl` e `transform_compose_fn.wgsl` → `trs_world`/`trs_normal`/`affine_normal`; `node_space_point`/`_direction`/`_project` → `affine_point`/`affine_direction`/`projective_point`; remover `quat_to_mat4` e `mat4_upper3x3_transform` (`math/mat.wgsl`)
- [x] T020 [US3] Classe por ponto de extensão onde o hospedeiro é genérico (`src/elements/extension/combineSpace.ts`, nós `space.*`), como a função de câmera
- [x] T021 [US3] Projeção e deslocamento da amostra numa definição: o `if` perspectiva/ortográfica de `camera_compose.wgsl` e `camera_fn_ready.wgsl`; o `shift·P` de `camera_compose.wgsl`, `camera_compose_fn.wgsl` e `shadow_matrix.wgsl`; `camera_orthographic_box` absorvendo `water_light_fit_box` (`presentation/water/wgsl/water_light.wgsl`)
- [x] T022 [US3] `trsOf` da CPU (`src/elements/physics/flows/SurfaceColliderFlow.ts:556`) pela referência f64 (normaliza o quaternion, escala zero como a GPU) — muda resultado só com quaternion não normalizado: medida no `surfaceCollider`/`softSurface`, para a T048

**Checkpoint**: nenhuma inversa fora da família (assinaturas e inventário); smokes da álgebra iguais à base.

---

## Phase 6: User Story 4 — referencial temporal e espaços (P2)

**Goal**: inversas e anteriores calculadas uma vez; uma definição de cada passagem entre espaços.

**Independent Test**: `WorldInverse` só nos slots sujos e só quando ligado; o antisserrilhado sem inversa por pixel;
`antialiasing` e `refraction` com os números da base; `instances/100k` sem regressão.

- [x] T023 [US4] Testes: `WorldInverse` (alocado só por quem liga, escrito nos slots sujos, igual à referência f64) em `src/elements/scene/__tests__/`; campos novos de `CameraMatrices` (inversas, vista anterior, também com `CameraFunction`) em `src/elements/scene/flows/__tests__/CameraFlow.test.ts`
- [x] T024 [US4] Pool `WorldInverse` sob demanda (`src/elements/scene/Transform.ts`, `resources.ts`) escrito pelo `TransformFlow` (`kernels/transform_compose*.wgsl`, `transform_link.wgsl`) com `affine_inverse`
- [x] T025 [US4] `CameraMatrices` com `inverseView`, `inverseUnjitteredViewProjection`, `previousView` (`src/elements/scene/Camera.ts`; `kernels/camera_compose.wgsl`, `camera_compose_fn.wgsl` — esta passando a escrever também a anterior)
- [x] T026 [US4] Módulo `src/elements/gpu/wgsl/math/view_space.wgsl` (`ndc_to_uv`, `uv_to_ndc`, `uv_to_pixel`, `clip_divide`, `is_orthographic`, `view_depth`, `camera_ray`, `motion_vector`, `pixel_footprint`); `ray_camera` (`raytrace/ray_camera.wgsl`) passa a `camera_ray` com o mesmo resultado
- [x] T027 [US4] Migração das passagens: as ≥ 20 conversões NDC↔uv inline (inventário §2), os reconstrutores de raio (`forward_background.wgsl`, `water_field.wgsl` `water_field_camera`, `media_common.wgsl` `froxel_view_point`/`froxel_world`, `water_composite.wgsl` `composite_view_pos`), `taa_view_depth`/`water_linear_depth`/`water_scene_linear`, os três testes de ortográfica e o jeito único de tirar o deslocamento da amostra (`froxel_projection` sai)
- [x] T028 [US4] `motion_vector` nos seis shaders de movimento (`forward.wgsl`, `point_sprite.wgsl`, `diffuse/diffuse_sprite.wgsl`, `particle_sprite.wgsl`, `refraction/refraction_motion.wgsl`, `water_composite.wgsl`) e no fundo do `temporal_resolve.wgsl`; `pixel_footprint` em `refraction_history.wgsl` e `kernels/surface_adapt.wgsl`; `water_pixels_per_meter` removida
- [x] T029 [US4] Leitores das inversas guardadas: `ray_instances.wgsl` (`toObject`), `surface_collider_build.wgsl`, `refraction_history.wgsl` (fim do `transpose(normal)`), nós de espaço; o antisserrilhado lê `inverseUnjitteredViewProjection` (fim de `taa_inverse` por pixel); as ≥ 8 cópias de `transpose(view3×3)` leem `inverseView`
- [x] T030 [US4] Fim das cópias próprias da câmera anterior: `gi_screen_history[0..4]` (`gi_screen_resolve.wgsl`, `gi_screen_reproject.wgsl`, `ProbeFlow.ts`) e `froxel_camera` (`media_froxel_integrate.wgsl`, `media_froxel_inject.wgsl`, `FroxelFlow.ts`); a da luz global passa à anterior sem deslocamento da amostra (muda resultado: medida no `giNoise`/`globalIllumination`, para a T048)
- [x] T031 [US4] Corte de câmera (`history.x`) lido pelas sondas de tela, pela névoa e pelo filtro do sinal traçado (muda resultado só no quadro do corte: medida, para a T048)
- [x] T032 [US4] `bench:check`: `instances/100k`, `10k-functions`, GI desligada e as cenas com refração contra a base; ganho do antisserrilhado sem a inversa por pixel registrado

**Checkpoint**: smokes de movimento, antisserrilhado, refração, GI e névoa iguais à base (salvo o pacote da T048).

---

## Phase 7: User Story 5 — acumulador temporal (P2)

**Goal**: peças temporais comuns; o acumulador genérico de pixel; ≥ 3 de 4 acumuladores usando-as.

**Independent Test**: reprojeção, validação e peso existem só nas peças; `antialiasing`, `giNoise`, `fog` e o filtro
sem piorar e com custo ≤ 1,1× a base.

- [x] T033 [US5] Peças em `src/elements/gpu/wgsl/temporal/` (`temporal_reproject_point`, `temporal_validate_guide` — objeto/largura e plano/normal —, `temporal_weight_count`, `temporal_weight_change`, `temporal_weight_hysteresis`, `temporal_moments`, corte de câmera), com testes da conta em `src/elements/math/reference/__tests__/temporal.test.ts`
- [x] T034 [US5] Acumulador de pixel: `TracedDenoiser` → `TemporalFilter` (`src/elements/lighting/temporal/TemporalFilter.ts`), `traced_denoise_*` → `temporal_*` (`src/elements/gpu/wgsl/temporal/`), ponto `temporal_source`, `defaults.temporalFilter`; `RefractionDenoiseFlow`, `RefractionCompositeFlow`, testes e o `wgslSymbols.test.ts` atualizados — o nome novo depende da confirmação do usuário (proposto em 2026-10-23)
- [x] T035 [US5] Antisserrilhado nas peças (`temporal_resolve.wgsl`, `PostFlow.ts`): reprojeção do fundo, corte, peso por contagem; recorte YCoCg, reativa e Catmull–Rom continuam dele
- [x] T036 [US5] Sondas de tela nas peças (`gi_screen_reproject.wgsl`, `gi_screen_resolve.wgsl`): reprojeção por ponto, validação por plano/normal, corte; `gi_response` continua a política de peso delas
- [x] T037 [US5] Névoa nas peças (`media_froxel_inject.wgsl`): reprojeção por ponto, histerese, corte
- [x] T038 [US5] DDGI e cáusticas (`gi_probe_blend.wgsl`, `gi_photon_resolve.wgsl`, `presentation/water/wgsl/caustics.wgsl`): política de peso comum onde couber; o que não migrar justificado no `inventory.md` §6
- [x] T039 [US5] Smokes `antialiasing`, `giNoise`, `globalIllumination`, `fog`, `refraction` e custo por Flow contra a base (SC-006)

**Checkpoint**: ≥ 3 de 4 acumuladores nas peças; nenhuma reprojeção ou peso fora delas.

### Canal temporal da C2 (item 5 completo no lado do recurso — pedido do usuário, 2026-10-24)

Contrato: `contracts/temporal-channel.md`; desenho em `research.md` R10.

- [x] T053 [US5] Descritor `history` (`GPUDescriptor`, `HistoryShape`) e o estado do canal no `ResourceSystem`: N fatias de textura e de pool, giro no `frameRecording` só com gravação, carimbos do `frameTick`, invalidação (recriação, crescimento, entrada/saída no pool, pedido), precisão com o recuo sem `float32-filterable`; `ResourceDirectory` (`channelOf`, `channelOfPool`, `markWritten`, `markPoolWritten`, `invalidateChannel`); testes de unidade
- [x] T054 [US5] Ligação: provedor `{channel, lag}`, fontes de canal no `FlowRuntime`, bind groups por fase no `PipelineState`, `slot.channel` / `BoundChannel`; testes de unidade
- [x] T055 [US5] Filtro temporal no canal: `accumulated` e `moments` com N = 2 (sem as cópias `accumulated → history`), à-trous num par próprio; o guia anterior como canal do alvo `hit` da refração
- [x] T056 [US5] Névoa no canal: `history` N = 2 em `Froxels`, um pipeline de injeção (sem paridade), validade pelo `frames` do canal; precisão pela C2 (corrige o 32 bits sem `float32-filterable`)
- [x] T057 [US5] Luz global de tela no canal: `screenHistory` em duas fatias (sem a metade por paridade), validade pelo canal
- [x] T058 [US5] Antisserrilhado no canal: `history`, `state` e `light` como canais de um Resource do `TemporalAntialiasing` (`sizeFromCanvas`), um pipeline por formato (sem paridade), precisão pela C2
- [x] T059 [US5] Energia dos corpos rígidos: canal `energy` (N = 8) no pool do `RigidBody`, `EnergyFlow` (cinética, potencial, potência, dissipação na janela), referência f64 em `src/elements/physics/reference/energy.ts`, smoke `energy` (contra a f64 e contra a solução analítica do amortecimento)
- [x] T060 [US5] Smokes das instâncias contra o portão da T050 (bit a bit onde a conta não muda), custo ≤ 1,1×, `npm run ci`; docs (`clay-engine-doc/docs/guides`, inventário §6, data-model)

### Energia dos corpos moles (pedido do usuário, 2026-10-24: "Aceito, implemente")

Desenho em `research.md` R10 (energia dos corpos moles); FR-022.

- [x] T061 [US5] Schemas e descritores: `SoftBodyRange` (a faixa das partículas, a das arestas, o algoritmo e os blocos, por `slotRefs`), os blocos `SoftBodyChunk` e as somas `SoftBodyPartial` e a série `SoftBodyEnergy` (N = 8, `onDemand`) no `SoftBody` (domínio e cru com schema conhecido); testes de unidade
- [x] T062 [US5] Kernel genérico `soft_energy` em duas passadas (um grupo por bloco de 1024 elementos com a fonte do algoritmo; um grupo por corpo com a soma dos blocos, a potência e a janela pelas fatias) com o ponto `soft_energy_source` e as fontes XPBD (nós + arestas), nós (FEM; XPBD sem arestas) e MPM (Neo-Hookean)
- [x] T063 [US5] `SoftEnergyFlow` (fase `physics`, depois dos solvers, só com `EnergyMeter`): uma região de parâmetros por algoritmo, pipelines pelos pools presentes, `written()` só com passo
- [x] T064 [US5] Referência f64 (`physics/reference/energy.ts`: nós, arestas, Neo-Hookean, as leis do amortecimento do XPBD e do FEM) com testes de unidade
- [x] T065 [US5] Smoke `softEnergy`: XPBD (pano esticado sob gravidade), FEM e MPM (bloco que cai e deforma no chão) contra a f64; as fatias contra a potência e a janela; amortecimento do XPBD e do FEM contra a lei analítica; limiares pelo arredondamento f32; custo ≤ 1 % do quadro de 60 Hz com 65 536 partículas
- [x] T066 [US5] Portão: smokes de física e o `energy` sem mudança, `npm run ci`; docs (`physics_flows.md`, contrato, data-model, inventário §6)

---

## Phase 8: User Story 6 — precisão dos históricos (P2)

**Goal**: cada histórico com a medida de 16 × 32 bits; o contador do antisserrilhado exato.

**Independent Test**: a tabela de SC-007 preenchida; o modo de acumulação passa de 2048 quadros.

- [x] T040 [US6] `historyPrecision: 'half' | 'full'` (padrão o atual) em `TemporalAntialiasing` (`src/elements/scene/TemporalAntialiasing.ts`, alvos em `PostFlow.ts`), `TemporalFilter` e `Froxels` (`src/elements/media/Froxels.ts`), com testes de descritor
- [x] T041 [US6] Contador de quadros do antisserrilhado no estado `rg32float` em vez do alfa `rgba16float` (`temporal_resolve.wgsl`, `PostFlow.ts`); teste do modo de acumulação além de 2048 quadros
- [x] T042 [US6] Medida 16 × 32 bits por histórico (`antialiasing` `still` e acumulação, `giNoise` parado, `fog`, `refraction` com o filtro), duas rodadas, erro contra a referência e custo como fração do quadro de 60 Hz; tabela em `research.md` R6 e troca proposta para a T048 onde o erro cair além do ruído

**Checkpoint**: tabela completa; nada trocado sem a decisão.

---

## Phase 9: User Story 7 — limites dos adaptadores (P3)

**Goal**: limites reais registrados; o motor pede o mínimo comum.

**Independent Test**: fixture do M4 gravada; `GpuContext` pede os limites portáteis; `deviceFloor` abre as cenas com
o piso.

- [x] T043 [US7] Smoke `src/__smokes__/adapterLimits.ts`: todos os limites do adaptador e as `features` em `src/__smokes__/fixtures/adapter-limits-apple-metal-3.json` (data, navegador)
- [x] T044 [US7] `ENGINE_PORTABLE_LIMITS` em `src/core/gpu/GpuContext.ts` (mínimo comum das fixtures por limite que o desenho usa: saídas de storage por estágio, anexos de cor, bytes por amostra), testes em `src/core/gpu/__tests__/GpuContext.capabilities.test.ts`; abaixo do mínimo, o evento de não suportado
- [x] T045 [US7] `src/__smokes__/deviceFloor.ts` com o piso dos limites novos
- [x] T046 [US7] ~~RTX 4090~~ — cancelada pelo usuário (2026-10-23: o trabalho é no Mac, sem outra máquina): o mínimo comum é o do M4 (`adapter-limits-apple-metal-3.json`); outro perfil entra pela mesma fixture se um dia for gravado

**Checkpoint**: limites do M4 registrados e usados; 4090 pendente do usuário.

---

## Phase 10: Polish — decisões, docs e fechamento

- [x] T047 [P] Guia `clay-engine-doc/docs/guides/shaders.md` com a matemática canônica (o contrato), a tabela de migração e os fluxos de aleatoriedade; JSDoc dos módulos novos
- [x] T048 Pacote das trocas que mudam resultado (T014, T015, T016, T022, T030, T031, T042): tabela antes/depois por smoke apresentada ao usuário; aplicar e regravar fixtures só com a decisão dele, item a item
- [x] T049 `inventory.md` final: todas as entradas com estado; contagem de linhas depois (SC-005); a lista de pendências do `canonicalSignatures.test.ts` vazia ou cada item justificado
- [x] T050 Smokes 3 vezes seguidas no fonte e com `--dist`, 0 erros de página; `npm run ci` verde (SC-009)
- [x] T051 `bench:check` final contra a base (SC-004)
- [x] T052 Merge da 037 em `feature/034-refracao-fisica` quando o usuário pedir (nunca PR para o `develop`); nota de retomada na seção "Pausa" de `specs/034-refracao-fisica/tasks.md`

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 (referências e guarda bloqueiam as migrações).
- US1 (Phase 3) com a Phase 2.
- US2 (Phase 4) e US3 (Phase 5) depois da Phase 2; US3 pode correr em paralelo com a US2 (arquivos diferentes, exceto `math.ts` — coordenar).
- US4 (Phase 6) depois da US3 (usa `affine_inverse`, `projective_inverse`).
- US5 (Phase 7) depois da US4 (as peças leem o referencial e o módulo de espaços).
- US6 (Phase 8): T041 independe; T040/T042 depois da T034 (`TemporalFilter`).
- US7 (Phase 9) independe das outras; T046 depende do usuário.
- T048 depois de todas as tarefas que alimentam o pacote; Phase 10 por último.

### Parallel Opportunities

- T001 e T002; T003 com T004 (arquivos diferentes); T007, T008, T012, T013; T043–T045 com qualquer fase; T047 com a
  Phase 10.

## Implementation Strategy

Entrega completa em ordem de dependência (sem escopo parcial): base e medida, referências e guarda, inventário,
primitivas (as que preservam bits primeiro), álgebra, referencial e espaços, acumulador, precisão, limites, o pacote de
mudanças de resultado com a decisão do usuário, docs e fechamento. Cada fase termina com os smokes afetados iguais à
base (ou com a diferença listada para a T048) e o inventário atualizado.
