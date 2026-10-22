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

- [x] T001 Estado de partida no M4: `npm run ci`, todos os smokes (fonte e `--dist`) e `npm run bench:check -- --headless`; registrar em `specs/034-refracao-fisica/baseline-check.md` (falhas herdadas com a medida)
- [x] T002 [P] Smoke `src/__smokes__/giNoise.ts` com a medida das manchas (viés por face, erro lento dentro da face, cintilação, contra o traçador da CPU; Cornell e janela em `medium`/`high`; névoa andando) — nasce vermelho; remover o `zzManchas.ts` temporário
- [x] T003 [P] Piso de limites: `DeviceOptions.limitsCeiling` (C1, `src/core/contracts/DeviceOptions.ts`, `src/core/gpu/GpuContext.ts`, testes em `GpuContext.capabilities.test.ts`) e smoke `src/__smokes__/deviceFloor.ts` com as cenas que mais ligam recursos (GI + vidro + névoa; GI + água) sob 10 storage por estágio — numa GPU maior falha igual ao M4

---

## Phase 2: Fundação — prontidão e medida (US4, parte da US5)

**⚠️ Bloqueia**: os smokes das fases seguintes esperam `whenReady` e deduplicam a GPU por `gpuFrame`.

- [x] T004 [US4] Testes `src/scene/readiness/__tests__/EngineReadiness.test.ts`: estados, transições com compilação/verificação/troca em voo, prazo, falha de compilação, falha após descarte absorvida, `consumerMissing` uma vez por par
- [x] T005 [US4] `EngineReadiness` (Resource singleton) em `src/scene/readiness/EngineReadiness.ts`; eventos `enginePreparing`, `engineReady`, `consumerMissing` em `src/scene/events/EventMap.ts`
- [x] T006 [US4] `catch` nas cadeias de `createAsync` e `shaderMessages` em `src/scene/systems/flowBinding/PipelineState.ts` (erro com o nome do pipeline como `engineError`; absorvido após o descarte); registro do pendente na prontidão
- [x] T007 [US4] `FlowRuntime` (`src/scene/systems/flowBinding/FlowRuntime.ts`): Flows em `preparing` e consumidor/slot obrigatório ausente informados à prontidão; `consumerMissing` (H2)
- [x] T008 [US4] `Application.whenReady({ timeoutMs })` em `src/presentation/app/Application.ts` (rejeita listando os pendentes)
- [x] T009 [US4] Smoke `src/__smokes__/readiness.ts` (SC-008): névoa, GI, vidro e colisor obrigatório inseridos com a cena rodando; medida após `whenReady` igual à de espera longa (≤ 0,5 %); compilação atrasada à força com trajetória bit a bit; prazo com erro nomeado
- [x] T010 [US5] Testes do profiler em `src/core/gpu/profiler/__tests__/GpuProfilerSystem.test.ts`: anel de 3 leituras, CPU à frente, uma entrega por quadro, sem repetição
- [x] T011 [US5] Anel de leituras e limite de quadros em voo em `src/core/gpu/profiler/GpuProfilerSystem.ts`; evento `gpuFrameTimed` (uma leitura por quadro)
- [x] T011a [US5] C1 (`src/core/gpu/GpuFrame.ts`, `GpuCommandState.ts`, `profiler/FrameTimestampAllocator.ts`, contrato `src/core/contracts/Frame.ts`): `marker` aninhado registra o escopo corrente em cada par de timestamps do passe; leitura agregada por caminho de escopo; remover o `resolveTimestamps` morto (`requireQuerySetForTimestamps` devolve `null`) ou implementá-lo; testes em `src/core/gpu/__tests__/` (escopos aninhados, passes sem etiqueta recebem nome do escopo)
- [x] T011b [US5] C2 (`src/scene/systems/ExecutionSystem.ts`): um escopo por fase e por Flow em toda gravação (`<fase>/<Flow>`), automático; tempos por fase e por Flow no `gpuFrameTimed` (`src/scene/events/EventMap.ts`); C3/C4 sem chamada às primitivas da C1 (lint); teste com `countingCore`
- [x] T011c [US5] Etiquetas nos passes de C3/C4 que ainda saem sem nome (`compute#n`/`render#n`); `DebugFlow` mostra fase → Flow → passe; medida SC-009a (soma por Flow contra o quadro, custo zero sem profiling) e uma captura no Xcode com a árvore nomeada registrada no `baseline-check.md`
- [x] T012 [US5] Smokes passam a esperar `whenReady` no lugar de `settle` por tempo e a deduplicar por `gpuFrame` (≥ 90 leituras): `src/__smokes__/support/extensionScenes.ts`, `fluidSurface.ts`, `nodeGraphs.ts`, `materials.ts`, `fluidField.ts`, `globalIllumination.ts`, `fog.ts`, `parametricSurfaces.ts`
- [x] T013 Smokes completos (fonte e `--dist`) sem regressão contra T001

---

## Phase 3: Fundação — material nos acertos e footprint (R2)

- [x] T014 Teste de composição em `src/elements/raytrace/__tests__/hitMaterial.test.ts`: um único `ray_hit_material` por pipeline; GI, fótons e refração compõem o mesmo símbolo; revisão por `materialRevision`
- [x] T015 Módulo `src/elements/raytrace/hitMaterial.ts` (composição tirada de `ProbeFlow.composeHitMaterial`), tempo simulado no `ray_scene_info`; GI e fótons migrados (`ProbeFlow.ts`, `gi_hit.wgsl`, `gi_photon_trace.wgsl`) — imagens dos smokes da 033 idênticas bit a bit
- [x] T016 [P] `SurfaceSample` com `footprint`, `duvdx`, `duvdy` (`src/elements/gpu/wgsl/forward.wgsl`, `forward_transmission.wgsl`); raster pelas derivadas de tela
- [x] T017 Cone de raio nos acertos (`ray_hit_sample`) em `src/elements/gpu/wgsl/raytrace/` e AA especular nos acertos pela variância do cone (`closure_specular_aa`)
- [x] T018 [P] Referência de CPU dos nós filtrados em `src/elements/nodes/reference/noiseNodes.ts` e testes (média do padrão no footprint)
- [x] T019 Nós da biblioteca filtrados pelo footprint (`src/elements/gpu/wgsl/nodes/noise.wgsl` e padrões) — H6 fechada para a biblioteca; funções do usuário com `dpdx` cru documentadas como só de fragmento (`RaySceneFlow.ts`)

---

## Phase 4: User Story 6 — vídeos fiéis ao motor (P2, cedo para validar as fases seguintes)

- [x] T020 [US6] Usage `COPY_SRC` opcional do canvas (C1, `src/core/gpu/GpuContext.ts` / opções do canvas) e captura em `src/__smokes__/support/capture.ts`: cópia do quadro apresentado para anel de 3 buffers de leitura após cada `step`, entrega ao runner por função exposta
- [x] T021 [US6] `bench/runner/video.ts` + script `npm run video`: cenas por nome, `whenReady`, passo fixo 1/60, `stdin` do ffmpeg em `rawvideo`; H.264 High CRF 12 (padrão), `--lossless` FFV1, `--hdr10` HEVC Main10 (alvo rgba16f com o mesmo mapeamento de tons); prazo por processo, encerramento em `finally`, vigia de órfãos
- [x] T022 [US6] Página de cenas de vídeo `src/__smokes__/videoScenes.ts` (lente, dispersão, vidros, água, cáusticas, Cornell, dia, névoa, sala, pano com sombra) — títulos fiéis ao que a cena mostra
- [x] T023 [US6] Medida SC-010: PSNR de cada quadro decodificado contra o lido da GPU (≥ 45 dB) e 0 processos órfãos após gravação e após falha forçada; vídeos do estado de partida enviados ao usuário

---

## Phase 5: User Story 2 — antisserrilhado global (P1)

- [x] T024 [US2] Smoke `src/__smokes__/antialiasing.ts` (SC-004, SC-005): referência de 64 jitters parada; rastro da bola atrás do vidro; borrão na órbita a 30°/s contra a referência em movimento (64 sub-quadros); padrão rasante — nasce vermelho
- [x] T025 [P] [US2] Testes de `CameraFlow` em `src/elements/scene/flows/__tests__/CameraFlow.test.ts`: Halton (2,3) de 8, projeção com e sem jitter, `previousViewProjection`, `Camera.cut()`
  - Feito (2026-10-22): `src/elements/scene/__tests__/CameraFlow.test.ts` (junto dos outros testes de cena; a pasta `flows/__tests__` não existe) — a sequência Halton (2, 3) de 8 enviada ao estágio por quadro nos modos temporal e acumulação, em NDC e em pixels, contra os valores escritos à mão; nenhum deslocamento em `msaa`, `off` e sem o Resource; `Camera.cut()` vale um quadro e recomeça a sequência. As matrizes são compostas na GPU: caso `matrices` do smoke `antialiasing` lê o pool `CameraMatrices` de volta e compara com o oráculo do smoke (vista por `lookAt`, perspectiva da WebGPU, translação em clip) — no corte, com a câmera movida (a anterior bit a bit a sem deslocamento do quadro de antes) e num novo corte (a anterior é a atual, o histórico recomeça); maior diferença 4e-7. Conferido que falha com a posição errada da sequência.
- [x] T026 [US2] Jitter e anteriores no pool `CameraMatrices` (`src/elements/scene/Camera.ts`, `flows/CameraSchemas.ts`, `flows/CameraFlow.ts`, `gpu/wgsl/kernels/camera_compose*.wgsl`); prepass e cor com a mesma matriz
- [x] T027 [US2] Raios por pixel com o mesmo jitter: `gi_screen_common.wgsl` (`gi_camera_ray`), `forward_background.wgsl`, `src/presentation/water/wgsl/water_field.wgsl`, `water_composite.wgsl`
- [x] T028 [P] [US2] Testes de `worldsPrevious` (só slots sujos) em `src/elements/scene/flows/__tests__/TransformFlow.test.ts`
- [x] T029 [US2] `worldsPrevious` em `src/elements/scene/Transform.ts` e `flows/TransformFlow.ts`; poses publicadas na GPU (`rb_publish_pose.wgsl`) também guardam a anterior
- [x] T030 [US2] Vértices anteriores em anel para `produced('vertices')`: `src/elements/geometry/SurfaceFlow.ts`, `physics/flows/SoftSurfaceFlow.ts`, `src/scene/graph/GraphFlow.ts`
  - Feito (2026-10-20): descritor `previousVertices` (alocado sob demanda) nas geometrias que a GPU reescreve (`ParametricSurface`, `SurfaceGeometry`, `GraphGeometry`); o `MotionHistoryFlow` copia os vértices para ele antes do produtor, no quadro seguinte a cada produção; o desenho lê a posição anterior no buffer de vértices 1. Caso `deform` do smoke: a bola como superfície deslocada pelos vértices dá o mesmo rastro que a movida por `Transform` (7,45 %); sem os vértices anteriores, 59,98 %.
- [ ] T031 [US2] Alvo `motion` (rg16f) em `src/presentation/app/FrameTargets.ts`; escrito pelo prepass (MRT) em `ForwardFlow.ts`/`forward.wgsl`, pelos sprites (`particle_sprite.wgsl`, `point_sprite.wgsl`, `diffuse_sprite.wgsl` por `velocity·dt`), pela água e pelo fundo
  - Estado (2026-10-20): alvo `motion` rgba16f — rg o movimento do ponto do pixel, ba o do que está atrás dele (difere sob um transmissivo); passe de movimento dos opacos depois do principal e da face da frente dos transmissivos depois da transmissão (só rg). Faltam os sprites, a água, a geometria deformada (T030) e o movimento do que o raio secundário mostra (T044a).
  - Sprites (2026-10-21): os de partícula (`ParticleFlow`) com um passe de movimento próprio depois do desenho (a posição anterior `pos − vel·dt`, com `dt` o tempo simulado no quadro; `ParticleDrawParams.velOffsetVec4`); os de vértice e os das partículas secundárias (`point_sprite`, `diffuse_sprite`, pipelines por geometria do forward) no passe de movimento dos opacos, pelos vértices do quadro anterior (`point_previous_vertices`: os `previousVertices` que o histórico de movimento guarda da geometria que a GPU reescreve, religados quando aparecem; nas outras, os mesmos) e pela matriz anterior. Posição em clip `@invariant` nos três (o teste igual do passe de movimento): muda de 1 a 4 pixels as fixtures com MSAA de `pointCloud`, `particles` (sph, mpm-fluid, mpm-solid) e `fluidSurface/coexistence` — vão na lista da T036. A conta do vetor é uma só (`camera_motion`). Na resolução, a caixa da variância e a reconstrução em movimento só com as amostras da mesma superfície do centro (profundidade de vista a até 5 %): a amostra do sprite vizinho entrava na cor do fundo (o xadrez fino, de caixa larga, não a recortava). Smoke `antialiasing`: `spriteTrail` (400 partículas atravessando a cena a 1 m/s) 0,28 % / 0,28 % — sem o passe de movimento delas, 47,74 %; `pointTrail` (vértices de uma esfera como sprites, no caminho da bola) 0,03 % / 0,28 % — sem, 38,09 %; rastro da bola 0,00 % (era 0,28 %); parado sem mudança; órbita 2,58 / 2,51 / 2,98 % (era 2,92 na pose 3; limite 3 %); custo 1,14 ms (era 0,93; limite 1,5). Achado: partículas que atravessam o chão (sem colisor) deixam manchas no xadrez onde somem — a fatia fina do sprite acima do chão escapa da busca de movimento a cada 2 pixels e some atrás de uma superfície a centímetros (a distância não separa); a máscara reativa foi tentada e não resolveu (desfeita). Fica para a máscara reativa da T032/T044a.
  - Água (2026-10-21): a composição (`water_composite.wgsl`, sem MSAA) escreve o movimento numa segunda saída, só rg, misturada no alvo por um seletor em alfa: onde a superfície (reflexo, volume, névoa) domina a cor do pixel, o ponto da superfície pela câmera (a superfície de nível é refeita a cada quadro — o que a forma muda a resolução rejeita pela vizinhança); onde o fundo atravessado domina, fica o movimento dele, já no alvo. O movimento só da superfície em todo pixel de água piorava a água clara (o fundo refratado se move com o fundo; a água não grava profundidade, então a resolução reconstrói o ponto pelo fundo): 0,65 % → 0,88 % na pose 1. Smoke `antialiasing`, caso `waterOrbit` (órbita a 30°/s em volta do tanque, física e ondulações congeladas; critérios da órbita): água clara e rasa 0,65 / 0,71 / 0,79 % (igual a sem o passe: o fundo domina); turva e funda (0,5 m) 0,50 / 0,52 / 0,46 %, borrão 1,014 / 1,025 / 1,051× — sem o passe, 0,51 / 0,56 / 0,48 % e 1,020 / 1,042 / 1,066×. Achado (corrigido, complemento da T006): o pipeline criado de forma síncrona (os do motor) não tinha escopo de erro — um WGSL que não compila aparecia só como pipeline inválido sem nome na gravação de cada quadro. Agora o módulo e o pipeline são criados dentro de um escopo de validação; a falha vira `engineError` com o Flow, o pipeline e a mensagem do compilador, e o pipeline falho deixa de estar pronto (os quadros até a resposta do device ainda o gravam: 49 erros de quadro em vez de 4322 na órbita da água). O escopo de corpo síncrono fecha na mesma tarefa (`GpuEngineCore.withErrorScope`): antes, aguardava o corpo e os escopos da preparação e da gravação do quadro se cruzavam. Falta o movimento do que o raio secundário mostra (T044a).
- [ ] T032 [US2] `TemporalAntialiasing` (Resource, `src/presentation/resources/TemporalAntialiasing.ts`) e `TemporalResolveFlow` (`src/presentation/flows/TemporalResolveFlow.ts`, `effects/temporal_resolve.wgsl`): Catmull–Rom, desoclusão, recorte por variância YCoCg, máscara reativa, descarte em corte/redimensionamento
  - Estado (2026-10-20): a resolução está no `PostFlow` (abre a cadeia; `effects/temporal_resolve.wgsl`), não num Flow próprio. Feito: Catmull–Rom; desoclusão pela distância (tolerante na vizinhança 3 × 3 só com tudo parado; estrita perto de movimento, inclusive no quadro seguinte, guardado no histórico rg32f); movimento pelo maior num raio de 4 px; recorte por variância YCoCg só perto de movimento, com piso relativo ao brilho (o piso absoluto de 1e-6 recortava o histórico inteiro numa região cinza); quadro atual reconstruído das amostras 3 × 3 em movimento; a sequência recomeça no corte (a imagem não depende da prontidão); paridade do histórico uma vez por quadro; nitidez adaptativa. Falta a máscara reativa do raio secundário (T044a).
- [x] T033 [US2] `antialias: 'temporal' | 'msaa' | 'off'` (booleano aceito) em `Application.ts` e `defaults.ts`; sem efeitos o resolve apresenta no canvas (G2) em `PostFlow.ts`; renomear ou remover o falso FXAA e o falso SSAO de `effects.wgsl` com aviso
  - Estado (2026-10-22): a opção `antialias` (`'temporal'` padrão, `'accumulate'`, `'msaa'`, `'off'`; `true`/`false`) já vinha da T026/T032 em `Application.ts`. G2: sem efeitos, com a resolução temporal, a nitidez adaptativa e a apresentação são um passe só (`fs_temporal_present`, `effects/temporal_present.wgsl`, pela função `taa_sharpened` da resolução) que escreve no canvas — a cadeia era resolução → nitidez (alvo HDR intermediário) → apresentação; com efeitos, a nitidez fica no HDR e a apresentação lê o último efeito. Sem a resolução (`off`, `msaa`), a apresentação já lia a cor da cena direto (o mapeamento de tons não é cópia). Testes em `present.test.ts` (os passes do pós com e sem efeitos). Smoke `antialiasing` com os mesmos números; antisserrilhado 1,164 → 1,124 ms. `Fxaa` (média de 5 leituras) e `Ssao` (escurecia pelo brilho da cor, sem oclusão) removidos — classes, entradas de `effects.wgsl`, exportações, casos e fixtures do smoke `render`, `integration` e `stress60s`; o aviso no guia de pós-processamento e no README (o antisserrilhado é o temporal; a oclusão vem da luz global).
- [ ] T034 [US2] Sombra com PCF rotacionado pela sequência do jitter (`src/elements/gpu/wgsl/math/brdf.wgsl`)
  - Estado (2026-10-22): com o deslocamento da amostra (temporal ou acumulação), o `ShadowMatrixFlow` envia por quadro, na mesma sequência (o comprimento da do antisserrilhado; dimensões 5, 7 e 11 do Halton, fora das 2 e 3 da câmera), o deslocamento da grade do mapa dentro do texel (somado à matriz luz-vista-projeção na GPU — o mapa é desenhado e lido com a mesma) e a rotação do padrão 3×3 do PCF (`ShadowMatrix.kernelRotation`, até um quarto de volta); sem ele (`msaa`, `off`), a grade e o padrão parados — imagem igual à de antes. Medida nova no smoke `antialiasing`, caso `shadowEdge` (a sombra de uma placa girada 20° sobre o chão liso, mapa de 1024², resíduo da reta ajustada à borda nas quatro bordas): só a rotação, 0,867 → 0,810 px RMS na acumulação de 256 (o degrau é a grade do mapa, que girar o filtro em torno do mesmo texel não tira); com a grade deslocada, 0,255 px (acumulação) e 0,276 px (temporal após 64 quadros), contra 0,870 px parada; cintilação da penumbra parada de um quadro ao seguinte no temporal 3,34 % do contraste no pior pixel (2,00 % com a sombra parada; 1 nível de 8 bits = 1,7 %). Os outros casos sem mudança (parado 0,76 / 3,66 / 0,34 / 1,45 %; órbita 2,58 / 2,51 / 2,98 %; custo 1,16 ms). Critério do `shadowEdge` pendente de decisão do usuário.
- [x] T035 [US2] Fechar SC-004/SC-005 no smoke `antialiasing`; custo ≤ 1,5 ms no M4 (SC-011); se as bordas em movimento não fecharem só com o temporal, levar a medida ao usuário antes de religar o MSAA
  - Estado (2026-10-20): still 0,76 % (16 quadros) e bordas 1,45 % (64), órbita 2,52–2,92 % com borrão ≤ 1,02×, sprites 107 %; rastro 7,45 %. Correção (2026-10-20): não é o reflexo nem a refração — o caso `deform`, numa cena sem a esfera lisa e sem o vidro, dá o mesmo pixel e o mesmo valor. É o chão vizinho da bola: a reconstrução 3 × 3 em movimento mistura a amostra da bola (radiância 6) no pixel, e no xadrez fino (caixa de recorte larga) o histórico guarda o excesso; decai ≈ 0,8 por quadro. A ponderação da reconstrução pelo brilho (acc54dd1) tirou esse excesso; o que restava (6,67 %) era ruído de reconvergência do xadrez menor que o pixel depois do recomeço legítimo (maior falta 9,41 % > maior excesso). Decisão do usuário (2026-10-21): fora da medida os pixels com detalhe menor que o pixel (faixa ≥ 0,02 do fundo temporal entre as 8 primeiras posições da amostra). Rastro agora 0,28 % (passa). Rastro escuro (decisão do usuário, 2026-10-21: o critério mede os dois sentidos, mesmo limite de 1 %): a maior falta era 9,07 % (quadro 10, pixel (73, 151)) — a sombra da bola retida no histórico do chão parado. A caixa da variância não a separa do xadrez sem filtro (perto da aresta, o desvio da vizinhança deslocada passa da média). Correção: o passe principal do forward escreve no alvo `FrameTargets.light` (rg16float, sem MSAA) a luz que chega ao ponto (radiância refletida sobre a refletância do fechamento, `closure_albedo`; a textura se cancela): r a direta (ponto `scene_direct_lighting`), g a total (mais `scene_indirect_lighting`, a luz rebatida). A resolução as acumula com os pesos da cor (rg16float em pingue-pongue) e, parado, a direta acumulada fora da faixa 3 × 3 de agora (> 10 %) reilumina o histórico pela razão da total e o trata como em movimento. Rastro escuro 0,78 %; parado, órbita e custo (0,93 ms) sem mudança relevante. Primeira versão (76f1183f) levava a luz total no alfa da cor: no vídeo `dia` (apontado pelo usuário, 2026-10-21) o ruído da luz rebatida, em manchas maiores que a vizinhança, parecia luz mudando e desligava o acúmulo (bolhas nas paredes); só a direta no alfa reiluminava pela razão errada (a rebatida some junto onde o sol sai: rastro pontilhado). Com as duas no alvo próprio, o `dia` fica sem bolhas e sem rastro, e o alfa volta a ser a opacidade. O smoke mede contra 256 amostras, o rastro pela pegada inteira da bola com o fundo temporal em passo e nos pixels de fundo liso.
  - Custo (2026-10-20, caso `cost`): 0,77–0,85 ms a 1280 × 720 no M4 (duração do quadro na GPU 2,00 ms com o temporal, 1,23 ms sem) — dentro de 1,5 ms. Medido pela duração do quadro (`spanMs`, do primeiro início ao último fim), não pela soma dos passes: no M4 os passes se sobrepõem e a soma dava 4,4 ms. A nitidez passou a ler o movimento já gravado pela resolução (antes refazia a reprojeção e as 25 leituras).
  - Fechado (2026-10-22), smoke `antialiasing` inteiro no M4: parado 0,76 % / 3,66 % após 16 quadros e 0,34 % / 1,45 % após 64 (limites 1 % e 3 %); órbita 2,58 / 2,51 / 2,98 % com gradiente 0,975–1,001× (limites 3 % e 1,5×); água na órbita 0,47–0,80 %; rastro claro 0,00 % e escuro 0,78 % (bola, `deform`), sprites 0,28 %, vértices 0,28 % (limite 1 %); custo 1,129 ms (limite 1,5). O temporal fechou as bordas em movimento sem religar o MSAA. O critério do `shadowEdge` fica na T034.
- [x] T036 [US2] Fixtures de imagem afetadas regravadas com a lista e a montagem antes/depois (`src/__smokes__/fixtures/*-apple-metal-3.*`)
  - Feito (2026-10-22): a suíte inteira de smokes depois da T034 e da T033 só difere das fixtures nas cinco da lista da T031 (a posição em clip `@invariant` dos sprites): `particles-sph` 4 pixels (até 11 níveis), `particles-mpm-fluid` 3 (1 nível), `particles-mpm-solid` 1 (1 nível), `pointCloud` 1 (1 nível), `fluidSurface-coexistence` 1 (1 nível) — regravadas; a montagem antes/depois com os pixels marcados enviada ao usuário. A sombra deslocada da T034 não muda fixture (só com o deslocamento da amostra; as fixtures são com MSAA). O `fluidSurface` segue falhando só na medida das cáusticas (a da T065/011 US4), não na imagem.

---

## Phase 6: User Story 1 — refração física (P1)

- [x] T037 [P] [US1] Testes da referência em `src/elements/lighting/reference/__tests__/pathTracerDielectric.test.ts`: placa paralela, Snell na esfera, ângulo crítico, Fresnel exato, Beer–Lambert, pilha de meios encaixados, dispersão por canal
- [x] T038 [US1] Dielétrico liso e GGX, pilha de meios própria, Beer–Lambert, dispersão por canal e formas da água no traçador `src/elements/lighting/reference/pathTracer.ts`
  - Feito (2026-10-22): `PtMaterial.dielectric` (`ior`, `abbe`, `color`/`depth`, `roughness`, `priority`, a convenção do `closure_transmission`) e a forma `heightField` (caixa com o topo por tabela de alturas, bilinear; marcha de 512 passos e bisseção) em `pathTracer.ts`. Fresnel exato não polarizado em cada interface; reflexão interna total; GGX pela distribuição visível (Heitz 2018) com peso G1 da saída; ao atravessar, a radiância por (n1/n2)²; Beer–Lambert pelo trecho em cada meio; dispersão: o canal sorteado na primeira interface dispersiva segue sozinho (peso 3) com o índice dele em todas as interfaces; pilha de meios com prioridade (na sobreposição vale a maior; a borda de um meio que não é o corrente não é interface) e meio inicial pelo volume que contém a origem; interfaces coincidentes cruzadas juntas; parede fina (quadrilátero) como placa de espessura zero, 2R/(1 + R); até 64 interfaces por caminho. Luzes delta não atravessam dielétricos (sombra física sem cáusticas). Testes (`__tests__/pathTracerDielectric.test.ts`, 14) contra oráculos escritos no teste: Fresnel pelas leis do seno e da tangente e Brewster; placa paralela (1 − R)/(1 + R) a 0°, 45° e 60°; Beer–Lambert; Snell na esfera pelo desvio 2(i − r); ângulo crítico de dentro d'água (n²/(1 + R) abaixo, 0 acima) em caixa e em tabela de alturas; topo inclinado da água; vidro dentro d'água, esfera meio mergulhada (prioridade) e vidro encostado na água pelo método da adição de camadas; dispersão por canal (cada um só no próprio cone); parede fina; amostra GGX contra a quadratura da BSDF de Walter (α 0,25 a 35° e 0,64 a 65°). Mutações conferidas: Schlick no lugar do exato, sem (n1/n2)², sem prioridade, sem coincidentes e sem G1 — cada uma derruba ao menos um teste.
- [ ] T039 [US1] Smoke `src/__smokes__/refraction.ts` (SC-001–SC-003): seis cenas da US1 contra a referência, lente 4×, GI ligada/desligada/ausente, contagem de leituras de `scene_copy`, fração de energia no limite de interfaces — nasce vermelho
- [ ] T040 [US1] `Refraction` (Resource) em `src/elements/lighting/refraction/Refraction.ts`; alvos `refraction_request`, `refraction_radiance`, `refraction_reflection` e a fila em `FrameTargets.ts`
- [ ] T041 [US1] Pedido por pixel escrito pela camada da frente dos transmissivos (`forward_transmission.wgsl`, `ForwardFlow.ts`) e fila compacta com despacho indireto (`src/elements/gpu/wgsl/refraction/refraction_queue.wgsl`)
- [ ] T042 [US1] Interface em `refraction_interface.wgsl`: Fresnel dielétrico exato, reflexão interna total, GGX VNDF com peso G1, primeira interface com reflexão e transmissão traçadas, seguintes por roleta de Fresnel
- [ ] T043 [US1] Pilha de meios em `refraction_media.wgsl` (≤ 4, meio inicial pela câmera, empilhar/desempilhar por entidade, interfaces coincidentes) e Beer–Lambert por meio
- [ ] T044 [US1] `RefractionFlow` (`src/elements/lighting/refraction/RefractionFlow.ts`, `refraction_trace.wgsl`): caminho até 16 interfaces, dispersão em três caminhos com o índice do canal em cada interface, luz direta com sombra e `closure_indirect` no acerto opaco, céu no escape; divisão por grupo de formas de material quando passar de 10 storage
- [ ] T044a [US1] Movimento do que o raio secundário mostra: a refração (e o reflexo traçado) grava no canal ba do alvo `motion` a posição anterior na tela do ponto atingido (`previousViewProjection` × mundo anterior do objeto atingido), para a resolução temporal recortar e reprojetar o conteúdo refratado/refletido — o rastro de SC-005 no vidro e na esfera lisa (7,45 % hoje) depende disso
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
- [ ] T061a [US7] Sombra de superfícies finas de dois lados (tecido, folhas, paredes de espessura zero): o passe da sombra hoje descarta as faces de trás (`ShadowFlow.ts:106`, `cullMode: 'back'`) e o pano perde a sombra quando vira a face de trás para o sol (vídeo `pano` do estado de partida, apontado pelo usuário); a sombra MUST sair dos dois lados para geometria de dois lados, com o bias certo para cada face
- [ ] T061b [US7] Pano XPBD preso por dois cantos gira por cima dos pinos no vídeo `pano` (ganho de energia aparente): medir a energia mecânica do pano ao longo de 5 s contra a referência e corrigir no solver se crescer (relacionado ao `softSurface` vermelho desde a 011)
- [ ] T062 [US7] Fixtures do `render`, `softSurface` e demais afetadas regravadas no perfil `apple-metal-3` com a montagem antes/depois; pedido de regravação no `nvidia-lovelace` registrado para a outra máquina
- [ ] T063 [US7] `scene/graph` na lista de contratos da C2 (`eslint.config.js`, `.specify/memory/constitution.md` como emenda PATCH) e o lint pegando importações fora dela
- [ ] T064 [US7] `bench:check` contra o baseline do Mac após as fases 5–7: nenhuma cena > 10 % de GPU; `instances/100k`, `10k-functions`, GI desligada nos valores do baseline (SC-012)

---

## Phase 9: User Story 8 e User Story 5 — pendências e smokes herdados (P2)

- [ ] T065 [US8] Água pelo traçado: a superfície do campo entra na fila da refração como interface com ondulações e rugosidade; `WaterFlow.ts`/`water_composite.wgsl` leem `refraction_radiance`; `water_background` removido (`src/presentation/water/**`, `WaterSurface.ts`)
- [ ] T066 [US8] `FluidSurfaceMaterial` (`src/elements/material/FluidSurfaceMaterial.ts`, `FluidSurfaceMaterialSchema.ts`): `roughness` (0,02), `refraction`/`ambient`/`shininess`/`reflectivity` obsoletos com aviso único; testes em `__tests__/FluidSurfaceMaterial.test.ts`
- [ ] T067 [US8] Cáusticas da água: medir a malha refratada até o receptor e os fótons corrigidos no `fluidSurface`; implementar o escolhido; casos `water-fresnel`, `water-absorption`, `water-highlight`, `caustics-smooth`, `caustics-temporal` (SC-017)
- [ ] T068 [US8] H3 e G3 medidos com o profiler novo (`particles/64k-water`, `rigid-bodies/10k`) e o custo da água pelo campo (`fluidField/timing`: 10,3–10,6 ms contra 2,5 ms da 033, medido na Fase 2); corrigir a causa no motor (reordenação da vizinhança só com teste bit a bit contra o `develop`, partículas fora da grade incluídas) ou levar a medida ao usuário (SC-015)
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
