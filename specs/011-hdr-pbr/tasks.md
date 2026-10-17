---
description: 'Tarefas da spec 011 — HDR e materiais físicos por nós'
---

# Tasks: HDR e materiais físicos por nós

**Input**: `specs/011-hdr-pbr/` — [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md) (A1–A14,
R1–R14), [data-model.md](./data-model.md), [contracts/rendering.md](./contracts/rendering.md),
[quickstart.md](./quickstart.md)

**Tests**: obrigatórios (Constituição V, FR-024 e SC-001–SC-014): testes de unidade (Vitest, `countingCore`) para
toda lógica de CPU, referências numéricas de CPU para as funções físicas e smokes de navegador com medidas (fonte e
`--dist`). As fixtures de imagem são regravadas **uma vez**, na fase 10, com lista e justificativa; as de estado ficam
bit a bit.

**Organização**: por história de usuário. Todas as histórias são implementadas por completo; a prioridade só ordena.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1–US6)

---

## Phase 1: Setup (Base)

- [x] T001 Registrar o estado de partida em `specs/011-hdr-pbr/baseline-check.md`: `npm run ci`, todos os smokes `--headless` (fonte e `--dist`) e `npm run bench:check` com a máquina livre (números de partida do bench, inclusive tempo do quadro a 1280×720 com MSAA 4×)
- [x] T002 [P] Criar `src/__smokes__/support/imageMeasures.ts` com as medidas de imagem reutilizadas pelos smokes da 011: maior passo entre vizinhos e comprimento de sequências iguais (faixas), platôs com borda reta (degraus de texel), variância temporal da luminância (cintilação), energia de alta frequência nas silhuetas (serrilhado), leitura de um alvo `rgba16float` para valores lineares
- [ ] T003 [P] Criar os smokes vazios `src/__smokes__/hdr.ts`, `src/__smokes__/lighting.ts`, `src/__smokes__/materials.ts` e `src/__smokes__/support/materialScenes.ts`, registrados no runner (`bench/runner/smoke.ts`) e listados em `src/__smokes__/README.md`
- [x] T004 [P] Criar `src/elements/material/reference/` (referências de CPU, só para testes e smokes): `bsdf.ts` (GGX iso/aniso, Smith correlacionado, Schlick, F82, F0 do IOR, Charlie, filme fino de Belcour-Barla, Oren-Nayar energético, Burley com wrap), `tonemap.ts` (AgX, ACES de Hill, Khronos PBR Neutral, sRGB) e `dfg.ts` (integração de E(μ, α) e do albedo do sheen por Monte Carlo determinístico)
- [x] T005 [P] Atualizar o ROADMAP §3.3 em `specs/ROADMAP.md`: a matriz normal já existe (A5); a 011 só mede

---

## Phase 2: Foundational — HDR e apresentação (bloqueia todas as histórias)

**Purpose**: alvos `rgba16float`, apresentação com mapeamento de tons e resolve por amostra (R1, R2).

### Testes

- [x] T006 [P] Testes em `src/presentation/app/__tests__/FrameTargets.test.ts`: `color` e `samples` em `rgba16float`; `sceneCopy` (`rgba16float`, cadeia de mips `'full'`) alocada só sob demanda (o `transmissionDepth` entra com o passe de transmissivos, T072); MSAA desligado (só `color`); redimensionamento recria todos
- [x] T007 [P] Testes de `src/presentation/flows/__tests__/present.test.ts`: a apresentação é sempre o último passe; sem efeitos lê a cor multiamostrada (resolve por amostra), com efeitos lê a saída do último efeito em HDR; pingue-pongue em `rgba16float`; `PresentationParams` (operador, 2^EV, pontilhamento, saída, amostras) atualizado sem recriar pipeline; não existe mais passthrough nem o efeito `ToneMapping` sobre LDR
- [x] T008 [P] Testes em `src/core/gpu/__tests__/GpuEngineCore.options.test.ts` e `src/presentation/flows/__tests__/present.test.ts`: `CanvasOptions.toneMapping`/`format` configuram o contexto; sem suporte, a C2 recebe o recuo e a C4 emite `presentationFallback { requested: 'hdr', reason }` uma vez
- [x] T009 [P] Testes de referência em `src/elements/material/reference/__tests__/tonemap.test.ts`: AgX, ACES e neutro contra valores publicados dos operadores; sRGB ida e volta

### Implementação

- [x] T010 Acrescentar `toneMapping` e `format` a `CanvasOptions` em `src/core/contracts/EngineCore.ts` e aplicar na configuração do contexto em `src/core/gpu/GpuEngineCore.ts` (com detecção de suporte e recuo anunciado à C2)
- [x] T011 `FrameTargets` em `src/presentation/app/FrameTargets.ts`: `color`/`samples` em `rgba16float`; novo alvo `sceneCopy` (mips `'full'`, storage para os níveis) declarado no Resource e alocado sob demanda; `TextureShape.mipLevelCount: 'full'` na C2
- [x] T012 [P] Criar `src/elements/gpu/wgsl/math/present.wgsl` (um símbolo por função): `tonemap_agx`, `tonemap_aces`, `tonemap_neutral`, `present_dither` (ruído triangular por gradiente intercalado), `srgb_encode`; remover `tonemap_exposure`/`gamma_encode` de `math/color.wgsl` se não tiverem outro consumidor
- [x] T013 Transformar o efeito em apresentação: `src/presentation/flows/effects/ToneMapping.ts` vira o Resource de apresentação da cena (`operator`, `exposure` em EV, `dither`, `output`), inserido pelos estágios padrão e exposto em `defaults.presentation` (`src/presentation/flows/defaults.ts`); validação dos campos
- [x] T014 Criar `src/presentation/flows/effects/present.wgsl` (passe de tela cheia: exposição, operador, sRGB, pontilhamento; variante multiamostrada que mapeia cada amostra e faz a média; saída `hdr` sem compressão acima de 1)
- [x] T015 `PostFlow` em `src/presentation/flows/PostFlow.ts`: pingue-pongue em `rgba16float`; a apresentação substitui o passthrough como último passe; leitura multiamostrada só sem efeitos; efeitos existentes operando em HDR (`effects.wgsl`)
- [x] T016 Cópia de fundo da água em HDR: `src/presentation/app/WaterSurface.ts` e `src/presentation/flows/WaterFlow.ts` com a vista `background` em `rgba16float` (a troca pela `sceneCopy` é na US4)
- [x] T017 Conferir que forward, sprites, arame, UI e água pegam o formato do slot de alvo (`src/presentation/flows/ForwardFlow.ts`, `ParticleFlow.ts`, `UIFlow.ts`, `FluidSurfaceFlow.ts`, `DebugFlow.ts`) e corrigir os que fixam o formato do canvas
- [x] T018 Exportar `ToneMapping`/apresentação e os tipos novos nos barrels (`src/presentation/index.ts`, `src/index.ts`); `npm run ci` verde

**Checkpoint**: a cena desenha em HDR e a apresentação mapeia para a tela; as imagens mudam (fixtures regravadas só na fase 10).

---

## Phase 3: User Story 1 — Imagem em alta faixa dinâmica (Priority: P1) 🎯

**Goal**: valores acima de 1 preservados até o mapeamento; gradientes sem faixas; exposição e operadores corretos;
saída HDR estendida quando suportada.

**Independent Test**: `npm run smoke -- hdr --headless` (fonte e `--dist`) com as medidas no relatório.

- [x] T019 [US1] Caso `hdr-range` em `src/__smokes__/hdr.ts`: duas superfícies com 20× de diferença de irradiância, distinguíveis na saída; leitura do alvo HDR confirma valores > 1 antes da apresentação (SC-001)
- [x] T020 [US1] Caso `hdr-ramp`: gradiente lento de luminância em tela cheia; nenhum passo > 1 nível de código e sem faixas, com e sem pontilhamento (o sem pontilhamento documenta o ganho) (SC-002)
- [x] T021 [US1] Caso `hdr-exposure`: +1 EV dobra a luminância linear antes do mapeamento (erro ≤ 1 %) (SC-003)
- [x] T022 [US1] Caso `hdr-operators`: rampa conhecida por AgX, ACES, neutro e linear contra `reference/tonemap.ts` (≤ 1 nível de código) (SC-003)
- [x] T023 [US1] Caso `hdr-output`: pedido `output: 'hdr'` — com suporte, valores acima do branco de referência chegam ao canvas `rgba16float`; sem suporte (headless), recuo para `sdr` com `presentationFallback` e imagem igual à do padrão
- [x] T024 [US1] Caso `hdr-msaa`: borda de alto contraste (fonte forte contra fundo escuro) com resolve por amostra versus resolve linear — energia de alta frequência menor; MSAA desligado continua desenhando

**Checkpoint**: US1 verificável sozinha.

---

## Phase 4: Foundational — fechamento e funções físicas (bloqueia US2–US6)

**Purpose**: `bsdf`, `Closure`, tabela DFG, metadado de lobos na C2 e o ponto `material` com os dois retornos (R3, R5, R8).

### Testes

- [ ] T025 [P] Testes de referência em `src/elements/material/reference/__tests__/bsdf.test.ts`: D GGX normalizada (∫ D·cos = 1), Smith correlacionado simétrico, F82 coincide com Schlick quando a tinta é branca, filme fino com espessura 0 = Fresnel do substrato, Charlie normalizado
- [x] T026 [P] Testes em `src/scene/graph/__tests__/NodeDefinition.tags.test.ts`: metadado genérico de definição (`tags`) preservado, unido na compilação do grafo (conjunto dos nós presentes, sub-grafos inclusive) e exposto no resultado; a C2 não conhece nomes de lobo
- [x] T027 [P] Testes em `src/elements/material/__tests__/materialPoint.closure.test.ts`: função de código `-> SurfaceParams` adaptada por `closure_from_params`; `-> Closure` direta; grafo com `output.surfaceParams` e com `output.closure`; sem `MaterialFunction` → `closure_ready`; máscara de lobos (grafo, `lobes` do código, pronto) na chave do pipeline; mudar valores não muda a chave; tipo de retorno inválido → erro tipado
- [x] T028 [P] Testes em `src/elements/material/__tests__/PbrTables.test.ts`: Resource gerado uma vez no primeiro `framePrepare` (`Uninitialized` → `Ready`), nunca regenerado; descritor `rg16float` 32×32 e kernel de compute registrado
- [x] T029 [P] Testes de varredura em `src/__tests__/scan/lighting011.test.ts`: `lambert_diffuse`, `BRDF_AMBIENT`, `BRDF_DIFFUSE`, `scene_light_direction` e `scene_any_light_direction` não existem; cada símbolo novo (`bsdf_*`, `closure_*`, `tonemap_*`) definido uma vez

### Implementação

- [x] T030 Criar `src/elements/gpu/wgsl/math/bsdf.wgsl`: `bsdf_d_ggx`, `bsdf_d_ggx_aniso`, `bsdf_v_smith_correlated` (iso e aniso), `bsdf_f_schlick`, `bsdf_f82`, `bsdf_f0_from_ior`, `bsdf_d_charlie`, `bsdf_v_neubelt`, `bsdf_thin_film`, `bsdf_oren_nayar_energy`, `bsdf_burley_wrap`, `bsdf_specular_aa` (Tokuyoshi-Kaplanyan pelas derivadas da normal), `bsdf_dfg` (leitura da tabela) e a compensação de multiespalhamento
- [x] T031 Criar `src/elements/gpu/wgsl/kernels/pbr_dfg_build.wgsl` (E(μ, α) e albedo do sheen por amostragem por importância determinística) e `src/elements/material/PbrTables.ts` (Resource, textura `rg16float` 32×32, gerada em compute na transição); registrar nos estágios padrão
- [x] T032 Criar `src/elements/gpu/wgsl/math/closure.wgsl`: struct `Closure` (pesos e parâmetros dos lobos difuso, especular de base, especular de cima, sheen, transmissão, subsurface; emissão; opacidade; normais de base e de cima; tangente e anisotropia; filme fino) com o `StructSchema` gerado; construtores `closure_diffuse`, `closure_conductor`, `closure_dielectric`, `closure_transmission`, `closure_translucent`, `closure_sheen`, `closure_subsurface`, `closure_emission`; composição `closure_mix`, `closure_add` (fusão pelo peso: α² e cores lineares), `closure_layer`, `closure_thin_film`, `closure_opacity`, `closure_normal`; `closure_sanitize` (NaN → lobo desligado, emissão limitada a 65 000)
- [x] T033 Avaliação em `closure.wgsl`: `closure_eval(c, n, v, l, radiance)` e `closure_ambient(c, n, v, sky, ground, up)` especializáveis pela máscara (constantes de override `LOBE_*` que removem os ramos ausentes), camadas com atenuação `1 − F_top` direcional e absorção pela cor de cima
- [x] T034 Adaptadores em `closure.wgsl`: `closure_from_params(p: SurfaceParams)` (difuso + dielétrico IOR 1,5 + condutor pela metalicidade) e `closure_ready(m: StandardMaterial)`
- [x] T035 Metadado genérico na C2: `tags` em `src/scene/graph/NodeDefinition.ts`, união na compilação em `src/scene/graph/NodeGraph.ts` (e nos sub-grafos de `Subgraph.ts`), serialização em `serialize.ts` sem mudança de formato
- [x] T036 Ponto `material` em `src/elements/material/point/shaders.ts` e `src/elements/gpu/wgsl/material_point_types.wgsl`: os dois retornos detectados na compilação, adaptador escolhido pelo tipo; `forward_material_fn.wgsl`, `forward_material_ready.wgsl`, `material_fn_ready.wgsl` e `material_check.wgsl` produzindo `Closure`
- [x] T037 `MaterialFunction` em `src/elements/extension/MaterialFunction.ts`: campo `lobes` para código, máscara derivada dos `tags` do grafo; máscara na chave do pipeline; troca de máscara prepara outra variante em transição (como a topologia)
- [x] T038 Sanear o fechamento na avaliação (FR-017): `closure_sanitize` chamado na saída do ponto `material`; teste de fixture com NaN injetado no smoke `materials` (T080)

**Checkpoint**: o fechamento compila em todos os caminhos de material; as histórias seguintes podem começar.

---

## Phase 5: User Story 2 — Iluminação física com todas as luzes (Priority: P1)

**Goal**: Cook-Torrance com multiespalhamento; todas as luzes pelo ponto `scene_lighting`; spot e hemisfério; sombra e
água por luz; mesmo modelo nos sprites; normais corretas; serrilhado especular controlado.

**Independent Test**: `npm run smoke -- lighting --headless` (fonte e `--dist`).

### Testes

- [x] T039 [P] [US2] Testes em `src/elements/scene/points/__tests__/lighting.test.ts` (reescrito): ponto `scene_lighting` com combinação por soma e pronto zero; contribuições de `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight` presentes só quando há a luz; `light_visibility(light, p, n·l)` por produto com a `ShadowMap` da luz que projeta; `light_transmission(light, p)` por produto com a água; os pontos antigos não existem
- [x] T040 [P] [US2] Testes em `src/elements/scene/__tests__/SpotHemisphere.test.ts`: schema (`cones: vec4f`), validação (0 < interno ≤ externo ≤ π/2; interno > externo corrigido com aviso), `kind = 2`; hemisfério singleton nos estágios padrão, exposto em `defaults.ambient`, removível
- [x] T041 [P] [US2] Teste do teto em `src/elements/scene/points/__tests__/lighting.test.ts`: slot acima de 1024 avisa `lightLimit` uma vez (console) e o laço para em `LIGHT_LIMIT`; o forward não recebe contagem de luzes (não conhece luzes)
- [x] T042 [P] [US2] Teste de varredura em `src/__tests__/scan/lighting011.test.ts`: nenhum arquivo de `src/presentation/flows/`, dos sprites ou da água importa `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight` ou `Light`
- [x] T043 [P] [US2] Atualizar `src/presentation/flows/__tests__/ForwardFlow.light.test.ts` e `ParticleFlow.test.ts` para o ponto `scene_lighting`

### Implementação

- [x] T044 [US2] `Light` em `src/elements/scene/Light.ts`: `cones: vec4f` no schema; cor e intensidade lidas pela GPU; `DirectionalLight.ts` e `PointLight.ts` com unidades documentadas (lux, candela)
- [x] T045 [P] [US2] Criar `src/elements/scene/SpotLight.ts` (posição, direção, cor, intensidade em candela, alcance, cones) e `src/elements/scene/HemisphereLight.ts` (céu, chão, intensidade, `up`; uniform singleton); exportar em `src/elements/scene/index.ts`
- [x] T046 [US2] Ponto `scene_lighting` e pontos por luz em `src/elements/scene/points/lighting.ts`; remover `scene_light_direction`, `scene_any_light_direction` e o `light_transmission(p, ambiente, direta)` antigo; apagar `anyLightContribution.ts`
- [x] T047 [US2] Criar `src/elements/scene/points/lightContributions.ts`: módulos de contribuição por classe de luz — laço sobre os slots vivos do `kind`, atenuação `I/d²` com janela `(1 − (d/r)⁴)²`, cones da spot com transição suave em cos, chamada a `light_visibility` e `light_transmission` por luz e a `closure_eval`; hemisfério por `closure_ambient`
- [x] T048 [US2] Sombra por luz em `src/elements/scene/points/shadowContribution.ts` (`light_visibility(light, …)`, contribui só para a luz que projeta)
- [x] T049 [US2] Água por luz: `src/presentation/water/wgsl/water_transmission.wgsl` e o registro em `src/presentation/app/WaterSurface.ts` com a assinatura `light_transmission(light, p) -> vec3f`
- [x] T050 [US2] Forward no modelo novo: `src/elements/gpu/wgsl/forward.wgsl` chama o ponto `material` (→ `Closure`) e `scene_lighting`, mais a emissão; controle de serrilhado especular no fragment; sem luz nenhuma conhecida
- [x] T051 [P] [US2] Sprites no modelo novo: `src/elements/gpu/wgsl/particle_sprite.wgsl`, `point_sprite.wgsl` e `diffuse/diffuse_sprite.wgsl` com o fechamento do material da partícula sobre a normal do impostor e `scene_lighting`
- [x] T052 [US2] Remover `lambert_diffuse`, `BRDF_AMBIENT`, `BRDF_DIFFUSE` de `src/elements/gpu/wgsl/math/brdf.wgsl` (fica só o que a sombra usa, ou o arquivo sai) e atualizar `src/__smokes__/shaderLibrary.ts`
- [x] T053 [US2] `HemisphereLight` e `PbrTables` nos estágios padrão (`src/presentation/flows/defaults.ts`), `defaults.ambient` com os valores que deixam as cenas atuais equivalentes; limite de luzes e evento `lightLimit`
- [x] T054 [US2] Luz explícita onde se dependia da direção padrão: smokes (`src/__smokes__/*.ts`, `support/*.ts`) e cenas de bench (`bench/scenes/*/clayflow.ts`, `bench/engines/clayflow.ts`)
- [x] T055 [US2] Casos em `src/__smokes__/lighting.ts`: `brdf-reference` (grade 5×5 rugosidade × metalicidade contra `reference/bsdf.ts`, erro ≤ 2 %, SC-004) e `furnace` (hemisfério branco uniforme, rugosidade 0→1, ≤ 3 %, SC-005)
- [x] T056 [US2] Casos `point-falloff` (inverso do quadrado ≤ 2 % e janela até o alcance), `spot-cones` (pleno, transição, zero), `light-sum` (vermelho + verde) (SC-006)
- [x] T057 [US2] Casos `normal-scale` (escala (1, 3, 1), normais ≤ 1° da analítica, SC-007) e `specular-aa` (esfera brilhante com detalhe fino sob câmera girando devagar: variância temporal abaixo do limiar registrado)
- [x] T058 [US2] Caso `sprites-lit`: partículas em sprite e partículas secundárias iluminadas pelo mesmo modelo (comparação com a esfera de malha equivalente)

**Checkpoint**: US2 verificável sozinha; nenhum caminho Lambert resta.

---

## Phase 6: User Story 3 — Material composto por nós (Priority: P1)

**Goal**: nós `bsdf.*` e `closure.*`, especialização por lobos, transmissão em duas camadas com refração e dispersão,
OpenPBR como sub-grafo.

**Independent Test**: `npm run smoke -- materials,nodeGraphs --headless` (fonte e `--dist`).

### Testes

- [x] T059 [P] [US3] Testes em `src/elements/nodes/__tests__/library.test.ts` (casos de todos os nós) e `materialNodes.test.ts`: cada nó `bsdf.*` com portas, padrões, `tags` do lobo e WGSL compilável; `closure.*` com a união dos lobos de entrada
- [x] T060 [P] [US3] Testes em `src/elements/nodes/__tests__/materialNodes.test.ts` e no smoke `materials` (`graph-specialization`): grafo só com difuso e especular gera shader sem os outros lobos (texto do WGSL composto); mudar valor não recompila; mudar ligação recompila em transição sem quadro quebrado
- [x] T061 [P] [US3] Testes em `src/presentation/flows/__tests__/transmission.test.ts`: passe de transmissivos só existe com material de lobo de transmissão ou opacidade; `sceneCopy` com mips gerada antes das duas camadas; faces de trás (com a distância no alvo `transmissionDepth`) e depois as da frente; grupos opacos fora do passe
- [x] T062 [P] [US3] Testes de referência: fusão de lobos (`closure_add`/`closure_mix` de dois especulares) contra a regra documentada em `src/elements/material/reference/__tests__/closureMerge.test.ts`
- [x] T063 [P] [US3] Testes de serialização em `src/elements/nodes/__tests__/materialNodes.test.ts`: grafo de material e `nodes.material.openpbr` ida e volta pelo `NodeRegistry`

### Implementação

- [x] T064 [P] [US3] Criar `src/elements/gpu/wgsl/nodes/bsdf.wgsl` e `src/elements/nodes/bsdf/index.ts`: `diffuse`, `conductor`, `dielectric`, `transmission`, `translucent`, `sheen`, `subsurface`, `emission` (entradas ligáveis, validação por `clamp` no WGSL, `tags` do lobo)
- [x] T065 [P] [US3] Criar `src/elements/gpu/wgsl/nodes/closure.wgsl` e `src/elements/nodes/closure/index.ts`: `mix`, `add`, `layer`, `thinFilm`, `opacity`, `normal`
- [x] T066 [P] [US3] Criar `src/elements/gpu/wgsl/nodes/geometry.wgsl` e `src/elements/nodes/geometry/index.ts`: `tangentUv` (referencial cotangente por derivadas de tela; só `fragment`); tangente padrão dos lobos especulares quando não ligada (cotangente com uv, senão direção estável da normal)
- [x] T067 [P] [US3] `color.*` em `src/elements/nodes/color/index.ts` (+ `src/elements/gpu/wgsl/nodes/color.wgsl`): `rgb`, `hsv`, `temperature` (K → RGB linear), `luminance`, e as rampas existentes movidas para o grupo `color` com nome antigo mantido por alias registrado
- [x] T068 [US3] `output.closure` em `src/elements/nodes/output/index.ts` e `src/elements/gpu/wgsl/nodes/output.wgsl`; entradas sem ligação = fechamento pronto
- [x] T069 [US3] Registrar os grupos novos em `src/elements/nodes/index.ts` (objeto `nodes`), no `NodeRegistry` padrão e nas referências de CPU dos nós (`src/elements/nodes/reference/`)
- [x] T070 [US3] Variantes por lobos no `ForwardFlow` (`src/presentation/flows/ForwardFlow.ts`): constantes de override da máscara no pipeline, cache por chave, preparo em transição
- [x] T071 [US3] Criar `src/elements/gpu/wgsl/kernels/scene_copy_mips.wgsl` (cópia da cor resolvida + gaussiana separável por nível) e o passe de cópia no `ForwardFlow` (só com consumidor)
- [x] T072 [US3] Criar `src/elements/gpu/wgsl/forward_transmission.wgsl` e o passe de transmissivos em duas camadas no `ForwardFlow`: faces de trás (com a distância delas no alvo `transmissionDepth`, `r16float`), nova cópia, faces da frente; refração pelo IOR projetada na tela, espessura entre camadas ou a do lobo, leitura no mip pela rugosidade, Beer-Lambert, dispersão por Abbe (três leituras), parede fina sem refração, opacidade
- [x] T073 [US3] `nodes.material.openpbr` em `src/elements/nodes/material/openpbr.ts`: `Subgraph.point` sobre os nós BSDF com todos os parâmetros do OpenPBR Surface 1.1 expostos
- [x] T074 [US3] Casos por lobo em `src/__smokes__/materials.ts`: `layer-two-highlights`, `transmission-refraction` (deslocamento, Fresnel rasante, Beer-Lambert pela espessura), `transmission-dispersion`, `translucent-backlit`, `sheen-rim`, `anisotropy-rotate` (girar o vetor gira o realce), `thin-film-angle`, `subsurface-terminator`, `emission-hdr` (SC-008)
- [x] T075 [US3] Casos `closure-mix` (máscara de ruído contínua; fusão pela regra) e `closure-layer` em `src/__smokes__/materials.ts`
- [x] T076 [US3] Caso `graph-specialization`: grafo difuso + especular com custo igual ao material pronto (± ruído, por consulta de tempo da GPU) e 60 s mudando valores com zero recompilações (SC-008)
- [x] T077 [US3] Caso `material-fn-compat`: as funções `material` da 009 (`support/extensionScenes.ts`, `parametricSurfaces`) desenham sem mudança com o especular da base
- [x] T078 [US3] Caso `transmission-layers` (vidro atrás de vidro e verso de objeto espesso aparecem; terceira camada com a aproximação documentada) e `transmission-ior1` (IOR 1 invisível, sem divisão por zero)
- [ ] T079 [US3] Grafo de material no smoke `src/__smokes__/nodeGraphs.ts` (madeira envernizada com verniz áspero por ruído, do contrato) e caso de grafo inválido desenhando com o material pronto e o evento da 031
- [x] T080 [US3] Caso `sanitize`: função `material` devolvendo NaN/∞/negativos — nenhum NaN no alvo HDR nem na cadeia de pós

**Checkpoint**: US3 verificável sozinha.

---

## Phase 7: User Story 4 — Água física e cáusticas suaves (Priority: P1)

**Goal**: a água no mesmo modelo, sem corte; cáusticas por malha refratada com leitura bicúbica.

**Independent Test**: `npm run smoke -- fluidSurface,parametricSurfaces --headless` (fonte e `--dist`) com os casos novos.

- [ ] T081 [P] [US4] Testes em `src/elements/material/__tests__/FluidSurfaceMaterial.test.ts`: `roughness` (padrão 0,02); `ambient`, `shininess`, `reflectivity` obsoletos com aviso único; `shininess` → rugosidade equivalente
- [ ] T082 [P] [US4] Testes em `src/presentation/flows/__tests__/water.test.ts` e `src/presentation/__tests__/WaterSurface.test.ts`: vista `background` removida (usa `FrameTargets.sceneCopy`); `lightSize` padrão 1024; `causticGrid` (padrão 2 × `lightSize`) com buffer de vértices; mapa de cáusticas `rgba16float` com mistura aditiva
- [ ] T083 [US4] `FluidSurfaceMaterial` em `src/elements/material/FluidSurfaceMaterial.ts` e `FluidSurfaceMaterialSchema.ts`: `roughness`, obsolescências
- [ ] T084 [US4] `src/presentation/water/wgsl/water_composite.wgsl` no fechamento: dielétrico de IOR do material (Fresnel exato), GGX com a rugosidade, reflexo do hemisfério na direção refletida, refração na `sceneCopy` filtrada, Beer-Lambert, sem `clamp`; `WaterFlow` lendo a `sceneCopy`
- [ ] T085 [US4] `WaterSurface` (`src/presentation/app/WaterSurface.ts`): sem a vista `background`, `lightSize` 1024, `causticGrid`
- [ ] T086 [US4] Criar `src/presentation/water/wgsl/caustic_mesh.wgsl` (compute: grade N×N refratada até o receptor; render: triângulos com intensidade pela razão de áreas × Fresnel × absorção, mistura aditiva) e reescrever `src/presentation/flows/CausticsFlow.ts` e `water/wgsl/caustics.wgsl` para a malha
- [ ] T087 [US4] Leitura bicúbica (B-spline, 4 leituras bilineares) no contribuinte `light_transmission` da água (`water_transmission.wgsl`)
- [ ] T088 [US4] Casos em `src/__smokes__/fluidSurface.ts` e `parametricSurfaces.ts`: `water-fresnel` (IOR 1,33, ≤ 2 p.p.), `water-absorption` (≤ 3 %), `water-highlight` (realce > 1 no HDR) (SC-009)
- [ ] T089 [US4] Casos `caustics-smooth` (câmera perto, texel ≥ 4 px, 0 platôs de borda reta) e `caustics-temporal` (variação limitada à da superfície) (SC-010); custo da malha 2048² ≤ 1,5 ms registrado

**Checkpoint**: US4 verificável sozinha.

---

## Phase 8: User Story 5 — Biblioteca de materiais prontos (Priority: P2)

**Goal**: 23 materiais como sub-grafos, usáveis inteiros ou como nós.

**Independent Test**: caso `gallery` e `library-compose` em `npm run smoke -- materials --headless`.

- [ ] T090 [P] [US5] Testes em `src/elements/material/__tests__/Materials.test.ts`: cada fábrica `Materials.x()` devolve `MaterialFunction` com o grafo de um nó; parâmetro mudado altera só ele; nós e valores documentados (madeira envernizada = madeira crua sob dielétrico liso; pintura de carro = condutor sob dielétrico); serialização ida e volta
- [ ] T091 [US5] Criar os 23 sub-grafos em `src/elements/nodes/material/` (`woodRaw`, `woodVarnishedGloss`, `woodVarnishedMatte`, `cotton`, `wool`, `velvet`, `silk`, `denim`, `sheerFabric`, `leather`, `rubber`, `ceramic`, `porcelain`, `plasticMatte`, `plasticGloss`, `metalPolished`, `metalBrushed`, `carPaint`, `glass`, `metalOxidized`, `skin`, `wax`, `marble`) com valores físicos e fonte em comentário; registrados no `NodeRegistry` padrão
- [ ] T092 [US5] Criar `src/elements/material/Materials.ts` (fábricas → `MaterialFunction`) e exportar em `src/elements/material/index.ts` e `src/index.ts`
- [ ] T093 [US5] Caso `gallery` em `src/__smokes__/materials.ts`: todos os materiais sob a mesma luz; medidas de reconhecimento (madeira crua sem realce nítido, envernizada com realce nítido, veludo com borda, metal escovado com realce alongado, vidro com refração)
- [ ] T094 [US5] Caso `library-compose`: madeira crua e metal escovado misturados por ruído (o quickstart) e um material pronto com entrada ligada a outro nó

**Checkpoint**: US5 verificável sozinha.

---

## Phase 9: User Story 6 — Superior ao Three.js lado a lado (Priority: P2)

**Goal**: cenas iguais nas duas engines, medidas e vídeo.

**Independent Test**: `npm run bench -- --scene materials,point-lights --engines clayflow,three --headless` e a página de comparação.

- [ ] T095 [US6] Adaptador Three em `bench/engines/three.ts`: `antialias: true` (MSAA 4×), AgX equivalente, luzes físicas no lugar de `addDefaultLighting`, hemisfério equivalente
- [ ] T096 [P] [US6] Cena `bench/scenes/materials/` (`scene.ts`, `clayflow.ts`, `three.ts`): galeria 5×5 com os materiais da biblioteca e os correspondentes do `MeshPhysicalMaterial` (clearcoat, sheen, transmission, iridescence, anisotropy, dispersion)
- [ ] T097 [P] [US6] `bench/scenes/point-lights/clayflow.ts` (256 luzes, 200 objetos) e remoção do `unsupported until 'F4'` em `scene.ts`
- [ ] T098 [P] [US6] Variante `water-lake` em `bench/scenes/particles/` (ou `surfaces/`) com a água nas duas engines
- [ ] T099 [US6] Página de comparação lado a lado em `bench/page/` (as duas engines na mesma página, leitura de imagem só no fim): faixas, forno, cintilação especular, serrilhado de borda; resultado gravado em `bench/results/`
- [ ] T100 [US6] Registrar as medidas e o tempo de quadro (SC-011) em `specs/011-hdr-pbr/comparison.md`

**Checkpoint**: US6 verificável sozinha.

---

## Phase 10: Fixtures

- [ ] T101 Regravar uma vez as fixtures de imagem (A14) com `--record`: `render-*`, `fluidSurface-*`, `particles-*`, `softSurface-*`, `pointCloud`, `parametricSurfaces-*`, `nodeGraphs`, os hashes de `extensionPoints-*.json` e `parametricSurfaces-*.json`; lista com justificativa visual em `specs/011-hdr-pbr/fixtures.md` e montagem antes/depois enviada ao usuário
- [ ] T102 Recalibrar os limiares de cor fixos de `src/__smokes__/parametricSurfaces.ts` e `extensionPoints.ts` pela mesma montagem
- [ ] T103 Conferir as fixtures de estado (`trajectories`, `contacts`, `fluidBehavior`) bit a bit, sem regravar (SC-012)

---

## Phase 11: Docs

- [ ] T104 [P] Guia novo `clay-engine-doc/docs/guides/materials.md` (materiais por nós BSDF, fechamento, fusão de lobos, especialização, biblioteca com valores e fontes, compatibilidade da 009)
- [ ] T105 [P] Guia novo `clay-engine-doc/docs/guides/lighting.md` (luzes e unidades, `scene_lighting`, hemisfério como aproximação até a 033, limite de 1024) e `clay-engine-doc/docs/guides/presentation.md` (HDR, operadores, exposição, saída HDR, resolve por amostra)
- [ ] T106 [P] Atualizar `clay-engine-doc/docs/guides/node-graphs.md` (grupos `bsdf`, `closure`, `geometry`, `color`, `material`), `post_processing.md` (HDR, sem passthrough) e `shaders.md`
- [ ] T107 [P] Atualizar `clay-engine-doc/docs/guides/architecture_resource_loaders.md`: ordem dos passes (opacos → cópia com mips → transmissivos em duas camadas → água → pós → apresentação), pontos de luz por luz
- [ ] T108 `specs/ROADMAP.md` (011 implementada; 014 sem "pós direto no canvas"), `specs/PENDENCIAS.md`, JSDoc das classes públicas novas e `README.md` (API)

---

## Phase 12: Fechamento

- [ ] T109 Todos os smokes `--headless` no fonte e com `--dist`; nenhum processo órfão ao fim
- [ ] T110 `npm run bench:check` sem regressão relevante (custo do HDR registrado, ≤ 0,3 ms a 1280×720 com MSAA 4×); baseline regravado com a máquina livre
- [ ] T111 `npm run ci` verde
- [ ] T112 Vídeos (R14) enviados ao usuário: galeria girando sob luz que se move; grafo de material sendo editado; água (lago e tanque) com cáusticas de perto; comparação lado a lado Clayflow × Three (`materials`, `water-lake`)

---

## Dependencies & Execution Order

- **Setup (1)** → **Fundação HDR (2)** → **US1 (3)**.
- **Fundação do fechamento (4)** depende da 2; bloqueia US2–US6.
- **US2 (5)** depende da 4. **US3 (6)** depende da 4 e usa `scene_lighting` da US2 nos smokes (implementar US2 antes).
- **US4 (7)** depende da US2 (luz por luz, hemisfério) e da cópia com mips da US3 (T071).
- **US5 (8)** depende da US3 (nós e OpenPBR).
- **US6 (9)** depende da US5 e da US4.
- **Fixtures (10)** depois de toda mudança visual; **Docs (11)** e **Fechamento (12)** por último.

### Paralelo

- Fase 1: T002–T005 juntos.
- Fase 2: testes T006–T009 juntos; T012 em paralelo com T010/T011.
- Fase 4: testes T025–T029 juntos.
- US2: testes T039–T043 juntos; T045 e T051 em paralelo com o resto.
- US3: T059–T063 juntos; T064–T067 juntos (arquivos diferentes).
- US6: T096–T098 juntos.
- Docs: T104–T107 juntos.

## Implementation Strategy

Entrega completa de todas as fases na ordem das dependências, sem escopo parcial. Cada fase termina com `npm run ci`
verde e os smokes da história no fonte; as fixtures de imagem só são regravadas na fase 10, de uma vez. Commits por
fase na `feature/011-hdr-pbr`.
