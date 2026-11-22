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

## Reconciliação (2026-11-12, 034 T071)

As 35 caixas abertas foram conferidas contra o código e o histórico. Cada uma traz a nota **Reconciliação** com o
registro e o arquivo:

- **Feitas, marcadas com a evidência (9)**: T025, T083, T088, T102, T103, T104, T105, T110, T111 — parte delas feita
  em tarefas da 033 e da 034, citadas na nota.
- **Substituídas (9)**: T081, T082, T084, T085, T086, T087, T089 (a água pelo traçado e as cáusticas por fótons da
  034 tiraram o `FluidSurfaceMaterial`, o `WaterSurface`, o `water_composite` e a malha refratada), T101 (fixtures
  regravadas na 033 e na 034) e T109 (smokes na 033 e na 034 T075). Ficam marcadas, com **Substituída** na nota.
- **Abertas (17)**: a US5 (T090–T094) e a US6 (T095–T100) inteiras, T003 (inventário dos smokes), T079 (a madeira
  envernizada no `nodeGraphs`), T106 e T107 (guias), T108 (ROADMAP e README) e T112 (vídeos) — vão para a 035
  (fechamento da 011); a parte da T112 que não depende dela vai com a 034 T077.

## Conferência (2026-11-17)

As 17 caixas abertas conferidas de novo, uma a uma, contra o `origin/develop` (`2fd2429e`), os outros ramos do motor e
o `claflow-web`; cada uma traz a nota **Conferência** com a situação: (a) entregue, (b) entregue de outro jeito ou
substituída, (c) parcial, (d) não entregue.

- **Entregue e marcada (1)**: T106 — o `node-graphs.md` com os grupos de material em `fcd2a794` (034 T073), registrado
  depois da reconciliação de 2026-11-12.
- **Parciais (4)**: T003 (falta o inventário do README dos smokes), T107 (a ordem nova feita; faltam os pontos de luz
  por luz no guia), T108 (faltam ROADMAP e README), T112 (faltam os vídeos da galeria, do grafo editado e da
  comparação).
- **Não entregues (12)**: T079 e a US5 (T090–T094) e a US6 (T095–T100) inteiras.

Ficam 16 abertas, para a 035 (não criada).

## Biblioteca de materiais (2026-11-22)

No ramo `feature/011-biblioteca-de-materiais`, a partir do `develop` e da conferência: a US5 inteira (T090–T094), T079,
T003, T107 e T108, cada uma com a nota **Entrega** (o registro e os números medidos).

Ficam 7 abertas: a US6 (T095–T100, a comparação com o Three.js no bench) e T112 (vídeos).

Acrescentada e fechada (2026-11-22): T113, o espalhamento sob a superfície físico (a difusão entre pixels e a luz que
atravessa as partes finas), junto da US5.

Acrescentada e fechada (2026-11-22): T114, o reflexo traçado dos opacos lisos (o metal polido como espelho), com a
pintura de carro e a ferrugem refeitas e os rótulos na galeria, junto da US5.

Acrescentadas e fechadas (2026-11-22): T115, o deslocamento (o relevo do material em milímetros como geometria da
malha adaptativa, com a madeira bruta), e T116, os tecidos como pano (o fio torcido, o tricô, o desgaste do jeans e o
quadro dos panos caídos), junto da US5.

Acrescentada e fechada (2026-11-22): T117, a variedade da biblioteca (de 26 a 62 materiais: metais, pedra e terra,
madeiras, assoalhos e cascas, orgânicos), o reflexo traçado do lobo anisotrópico, a pintura de carro de base metálica e
a galeria só em esferas com o painel-índice, junto da US5.

Corrigidos depois (2026-11-22), com a medida no caso `gallery` do smoke `materials`:

- a borda preta do `sheerFabric`: os pontos opacos atingidos pelos raios da refração não recebiam a luz ambiente da cena
  sem a iluminação global (o hemisfério só contribuía para o desenho). Ponto de cena novo `scene_ambient_lighting`, com o
  hemisfério e o céu; do lado contra o sol o tecido fino passou de 0 a 0,156 (algodão, pelo forward: 0,096), e um difuso
  com lobo de opacidade dá o mesmo valor do forward (0,0984);
- o grão do vidro com dispersão (`abbe` 58): na interface lisa com a dispersão adiada o lobo saía pela roleta de
  Fresnel, e o vermelho e o azul, ao repetir o trecho do verde, sorteavam cada um o seu (pontos verdes e rosa; o fim do
  caminho mudava de quadro para quadro e o filtro temporal recomeçava). Agora os lobos seguem sem sorteio enquanto o
  lobo menor tem a vaga 4 do pixel. Pontos de grão no meio das casas vistas pelo vidro: 7,50 % → 0,11 % (limite 0,5 %).

Achados no caminho, fora do escopo destas tarefas (em `specs/PENDENCIAS.md`):

- a borda da esfera de vidro serrilha a parede comprimida pela lente, com ou sem dispersão (o material não é filtrado
  na largura que a refração dá ao pixel);
- `refraction_node_at` não grava a rugosidade da interface sem dispersão (visto no código; não medido);
- os dois pedidos da refração da água gravam a distância até a posição da câmera, como o do forward gravava (corrigido
  só o do forward, `924d3987`);
- com o antisserrilhado temporal, a galeria mostra anéis nos dielétricos rugosos (visto num quadro; não investigado:
  são desenhados pelo forward, outra causa).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1–US6)

---

## Phase 1: Setup (Base)

- [x] T001 Registrar o estado de partida em `specs/011-hdr-pbr/baseline-check.md`: `npm run ci`, todos os smokes `--headless` (fonte e `--dist`) e `npm run bench:check` com a máquina livre (números de partida do bench, inclusive tempo do quadro a 1280×720 com MSAA 4×)
- [x] T002 [P] Criar `src/__smokes__/support/imageMeasures.ts` com as medidas de imagem reutilizadas pelos smokes da 011: maior passo entre vizinhos e comprimento de sequências iguais (faixas), platôs com borda reta (degraus de texel), variância temporal da luminância (cintilação), energia de alta frequência nas silhuetas (serrilhado), leitura de um alvo `rgba16float` para valores lineares
- [x] T003 [P] Criar os smokes vazios `src/__smokes__/hdr.ts`, `src/__smokes__/lighting.ts`, `src/__smokes__/materials.ts` e `src/__smokes__/support/materialScenes.ts`, registrados no runner (`bench/runner/smoke.ts`) e listados em `src/__smokes__/README.md`
  - **Reconciliação (2026-11-12, 034 T071)**: os quatro arquivos existem (`hdr.ts` em `5ef1dd46`, `lighting.ts` em `b7c2805b`, `materials.ts` e `support/materialScenes.ts` em `66d2943f`) e a página do bench carrega o smoke pelo nome (`bench/page/smoke.ts`, sem registro no runner); falta listar `hdr`, `lighting` e `materials` no inventário de `src/__smokes__/README.md`. Vai para a 035.
  - **Conferência (2026-11-17)**: (c) parcial, sem mudança: os quatro arquivos existem e a página `bench/page/smoke.ts` carrega o smoke pelo nome; o inventário de `src/__smokes__/README.md` (§ Inventário e a tabela das specs 033/034) ainda não lista `hdr`, `lighting` nem `materials`. Falta só isso.
  - **Entrega (2026-11-22)**: `hdr.ts`, `lighting.ts` e `materials.ts` listados no inventário de `src/__smokes__/README.md` (com os casos de cada um; o `nodeGraphs.ts` com a parte (g)).
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

- [x] T025 [P] Testes de referência em `src/elements/material/reference/__tests__/bsdf.test.ts`: D GGX normalizada (∫ D·cos = 1), Smith correlacionado simétrico, F82 coincide com Schlick quando a tinta é branca, filme fino com espessura 0 = Fresnel do substrato, Charlie normalizado
  - **Reconciliação (2026-11-12, 034 T071)**: `src/elements/material/reference/__tests__/bsdf.test.ts` (`5ef1dd46`): GGX normalizada, Smith correlacionado simétrico, F82 com tinta branca = Schlick, filme fino com espessura 0 = Fresnel da base, Charlie normalizada.
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
- [x] T079 [US3] Grafo de material no smoke `src/__smokes__/nodeGraphs.ts` (madeira envernizada com verniz áspero por ruído, do contrato) e caso de grafo inválido desenhando com o material pronto e o evento da 031
  - **Reconciliação (2026-11-12, 034 T071)**: o `nodeGraphs` não tem o grafo da madeira envernizada nem o caso do grafo inválido desenhando com o material pronto (o grafo de material dele é a rampa de ruído da 031). A madeira envernizada é da biblioteca (US5): vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: o `nodeGraphs.ts` não tem a madeira envernizada nem o caso do grafo inválido. A madeira envernizada existe só como grafo de teste de unidade (`src/elements/nodes/__tests__/materialNodes.test.ts:14`, verniz com rugosidade por valor, não por ruído) e como exemplo no guia `node-graphs.md`; nenhum smoke desenha o grafo inválido com o material pronto.
  - **Entrega (2026-11-22)**: parte (g) do `nodeGraphs` (`7b195907`): o grafo do contrato com a rugosidade do verniz por ruído — pico do realce 17,42, entre o do verniz áspero (5,95) e o do liso (86,34), 697 pixels diferentes dos dois, a madeira fora do realce igual (1,000×); grafo com um nó que não compila — 1 `extensionRejected` no ponto `material`, a esfera desenhada com o material pronto (diferença 0 por canal em 33 168 pixels), 0 erros do motor. `npm run smoke -- nodeGraphs --headless --query part=c.e.g` passou.
- [x] T080 [US3] Caso `sanitize`: função `material` devolvendo NaN/∞/negativos — nenhum NaN no alvo HDR nem na cadeia de pós

**Checkpoint**: US3 verificável sozinha.

---

## Phase 7: User Story 4 — Água física e cáusticas suaves (Priority: P1)

**Goal**: a água no mesmo modelo, sem corte; cáusticas por malha refratada com leitura bicúbica.

**Independent Test**: `npm run smoke -- fluidSurface,parametricSurfaces --headless` (fonte e `--dist`) com os casos novos.

- [x] T081 [P] [US4] Testes em `src/elements/material/__tests__/FluidSurfaceMaterial.test.ts`: `roughness` (padrão 0,02); `ambient`, `shininess`, `reflectivity` obsoletos com aviso único; `shininess` → rugosidade equivalente
  - **Reconciliação (2026-11-12, 034 T071)**: **Substituída** (não feita como escrita): o `FluidSurfaceMaterial` saiu na 034 T066 (`7116382a`) — a água é o dielétrico do grafo, sem `ambient`/`shininess`/`reflectivity`; os testes dele deram lugar aos do caminho novo (quebra em `specs/034-refracao-fisica/api-pendencias.md` §6).
- [x] T082 [P] [US4] Testes em `src/presentation/flows/__tests__/water.test.ts` e `src/presentation/__tests__/WaterSurface.test.ts`: vista `background` removida (usa `FrameTargets.sceneCopy`); `lightSize` padrão 1024; `causticGrid` (padrão 2 × `lightSize`) com buffer de vértices; mapa de cáusticas `rgba16float` com mistura aditiva
  - **Reconciliação (2026-11-12, 034 T071)**: **Substituída**: a vista `background`, a `sceneCopy`, o `WaterFlow` e o `WaterSurface` saíram na 034 T065/T066 (`7116382a`: a água vista só pelo traçado); as cáusticas são fótons traçados a partir da luz (034 T067c, `2f710aff`), sem `causticGrid` nem mapa aditivo.
- [x] T083 [US4] `FluidSurfaceMaterial` em `src/elements/material/FluidSurfaceMaterial.ts` e `FluidSurfaceMaterialSchema.ts`: `roughness`, obsolescências
  - **Reconciliação (2026-11-12, 034 T071)**: `roughness` (GGX, padrão 0,02) e `ambient`/`shininess`/`reflectivity` obsoletos com aviso único em `src/elements/material/FluidSurfaceMaterial.ts` e no schema (`4046c88e`); o material inteiro saiu depois na 034 T066 (`7116382a`).
- [x] T084 [US4] `src/presentation/water/wgsl/water_composite.wgsl` no fechamento: dielétrico de IOR do material (Fresnel exato), GGX com a rugosidade, reflexo do hemisfério na direção refletida, refração na `sceneCopy` filtrada, Beer-Lambert, sem `clamp`; `WaterFlow` lendo a `sceneCopy`
  - **Reconciliação (2026-11-12, 034 T071)**: **Substituída**: o dielétrico de IOR com GGX e o reflexo do hemisfério entraram no `water_composite.wgsl` (`4046c88e`), mas a composição pela cópia da tela saiu na 034 T065 (`0a6ecc3d`, `7116382a`): a água é vista pela refração traçada (Fresnel exato, Beer–Lambert pelo grafo), sem `water_composite` nem `WaterFlow`.
- [x] T085 [US4] `WaterSurface` (`src/presentation/app/WaterSurface.ts`): sem a vista `background`, `lightSize` 1024, `causticGrid`
  - **Reconciliação (2026-11-12, 034 T071)**: **Substituída**: o `WaterSurface` saiu na 034 T065 (`7116382a`).
- [x] T086 [US4] Criar `src/presentation/water/wgsl/caustic_mesh.wgsl` (compute: grade N×N refratada até o receptor; render: triângulos com intensidade pela razão de áreas × Fresnel × absorção, mistura aditiva) e reescrever `src/presentation/flows/CausticsFlow.ts` e `water/wgsl/caustics.wgsl` para a malha
  - **Reconciliação (2026-11-12, 034 T071)**: **Substituída**: as cáusticas são fótons traçados a partir da luz (`Caustics` + `CausticsFlow`), escolhidos contra a referência da CPU na 034 T067a–T067c (`63cd05bf`, `2f710aff`; `specs/034-refracao-fisica/research.md` R14); a malha refratada não foi feita.
- [x] T087 [US4] Leitura bicúbica (B-spline, 4 leituras bilineares) no contribuinte `light_transmission` da água (`water_transmission.wgsl`)
  - **Reconciliação (2026-11-12, 034 T071)**: **Substituída**: o `water_transmission.wgsl` saiu; a luz que atravessa a água é a transmissão em linha reta com Fresnel e Beer–Lambert (`field_light_transmission.wgsl`) mais a correção dos fótons (034 T067c, `2f710aff`).
- [x] T088 [US4] Casos em `src/__smokes__/fluidSurface.ts` e `parametricSurfaces.ts`: `water-fresnel` (IOR 1,33, ≤ 2 p.p.), `water-absorption` (≤ 3 %), `water-highlight` (realce > 1 no HDR) (SC-009)
  - **Reconciliação (2026-11-12, 034 T071)**: feita na 034 T067d, no smoke `refraction` (não no `fluidSurface`): `water-fresnel` erro máximo 0,04 p.p. (≤ 2), `water-absorption` 0,14 % (≤ 3 %), `water-highlight` pico 350 no HDR (> 1) (`d3bb8597`).
- [x] T089 [US4] Casos `caustics-smooth` (câmera perto, texel ≥ 4 px, 0 platôs de borda reta) e `caustics-temporal` (variação limitada à da superfície) (SC-010); custo da malha 2048² ≤ 1,5 ms registrado
  - **Reconciliação (2026-11-12, 034 T071)**: **Substituída**: `caustics-smooth` e `caustics-temporal` cobertos pelo caso `ripple` do smoke `caustics` contra a referência da CPU — platôs 0 %, contraste 0,95–0,99×, variação com a superfície parada 2,9–3,1 % (034 T067c/T067d, `b5a8a022`); o custo da malha 2048² não se aplica (sem malha): o custo das cáusticas é medido por perfil (039 T110: 2,4–3,8 ms).

**Checkpoint**: US4 verificável sozinha.

---

## Phase 8: User Story 5 — Biblioteca de materiais prontos (Priority: P2)

**Goal**: 23 materiais como sub-grafos, usáveis inteiros ou como nós.

**Independent Test**: caso `gallery` e `library-compose` em `npm run smoke -- materials --headless`.

- [x] T090 [P] [US5] Testes em `src/elements/material/__tests__/Materials.test.ts`: cada fábrica `Materials.x()` devolve `MaterialFunction` com o grafo de um nó; parâmetro mudado altera só ele; nós e valores documentados (madeira envernizada = madeira crua sob dielétrico liso; pintura de carro = condutor sob dielétrico); serialização ida e volta
  - **Reconciliação (2026-11-12, 034 T071)**: não feita (sem `Materials.test.ts`). US5 vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: sem `src/elements/material/__tests__/Materials.test.ts` no `origin/develop` (`2fd2429e`); nenhum registro em ramo algum cita `woodRaw`/`carPaint` fora do plano e das tarefas.
  - **Entrega (2026-11-22)**: `src/elements/material/__tests__/Materials.test.ts` (`649f68df`), 9 testes: os 23 materiais registrados; cada fábrica devolve a `MaterialFunction` de fechamento com o grafo de um nó; parâmetro mudado altera só ele e não muda o módulo; madeira envernizada = `material.woodRaw` sob `bsdf.dielectric` em `closure.layer`; pintura de carro = `bsdf.conductor` sob `bsdf.dielectric`; nós por família; valores nas faixas (IOR 1,3–1,7, rugosidades, F0 do alumínio, raios da subsuperfície); uso como nó com entrada ligada; serialização ida e volta dos 23. Vitest de `src/elements/material`, `src/elements/nodes` e `src/scene/graph`: 325 testes passam.
  - **Rodada 3 (2026-11-22, a estrutura dos materiais)**: o teste acompanha os materiais com padrão — a entrada `s` (a amostra, com valor sem ligação), `pattern_scale` (`vec2f`), o padrão que cada nome promete (`pattern.rings` na madeira, `pattern.weave` nos tecidos com a sarja 3/1 de duas cores no jeans e o cetim com a tangente pelo fio na seda, `pattern.cells` no couro, na cerâmica e nos flocos da pintura, `pattern.grain` no veludo, na borracha, no plástico fosco, no metal escovado, na ferrugem e no mármore), a largura do pixel e o período ligados, o relevo na normal e nenhum uso de derivadas de tela (valem nos acertos dos raios). Novo `src/elements/nodes/__tests__/patternRelief.test.ts` (8 testes): o gradiente analítico de cada padrão contra a diferença finita da altura, o fechamento no período, a média abaixo do pixel e a normal de `surface.bump`. Vitest de `src/scene/graph`, `src/elements/nodes` e `src/elements/material`: 347 testes passam.
- [x] T091 [US5] Criar os 23 sub-grafos em `src/elements/nodes/material/` (`woodRaw`, `woodVarnishedGloss`, `woodVarnishedMatte`, `cotton`, `wool`, `velvet`, `silk`, `denim`, `sheerFabric`, `leather`, `rubber`, `ceramic`, `porcelain`, `plasticMatte`, `plasticGloss`, `metalPolished`, `metalBrushed`, `carPaint`, `glass`, `metalOxidized`, `skin`, `wax`, `marble`) com valores físicos e fonte em comentário; registrados no `NodeRegistry` padrão
  - **Reconciliação (2026-11-12, 034 T071)**: não feita: `src/elements/nodes/material/` tem só `index.ts` e `openpbr.ts`. US5 vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: `src/elements/nodes/material/` segue só com `index.ts` e `openpbr.ts`.
  - **Entrega (2026-11-22)**: os 23 sub-grafos em `src/elements/nodes/material/` (`8670a14b`: `surface.ts`, `wood.ts`, `fabric.ts`, `metal.ts`, `translucent.ts`), com os valores e a fonte no comentário de cada um e todos no `defaultNodeRegistry`. Para a entrada ligada (US5, cenário 4), os parâmetros expostos de `Subgraph.point` passaram a ser também entradas com valor, e o nome do sub-grafo entrou na identidade do módulo (`9e694894`): dois materiais de mesma forma no mesmo grafo davam dois módulos com o mesmo nome.
  - **Rodada 3 (2026-11-22, a estrutura dos materiais)**: na galeria os materiais eram esferas de cor lisa — os números passavam e a imagem não mostrava o material. Cada um ganhou a estrutura dele, calculada por pixel pelos nós do grafo sobre o uv do objeto (sem bitmap, sem CPU, sem WGSL dentro do material), filtrada pela largura do pixel e sem emenda onde o uv dá a volta. Nós novos no registro padrão, cada um com a referência da CPU e conferido na GPU pelo smoke `nodeGraphs` (parte f, 128 amostras, 0 fora da tolerância): `surface.uvSpace` (a coordenada do padrão no uv, a largura do pixel nela, as tangentes e o período), `surface.bump` (a normal pelo gradiente de superfície da altura, Mikkelsen 2020), `pattern.weave` (trama com ligamento: tela, sarja, cetim), `pattern.cells` (Voronoi 2D com sulcos e os valores da célula), `pattern.rings` (anéis de crescimento) e `pattern.grain` (fBm 2D anisotrópico) — os quatro padrões com o gradiente analítico da altura. Para o relevo, a amostra de superfície ganhou as tangentes do uv em mundo (`dpdu`, `dpdv`: no desenho, das derivadas de tela da posição e do uv; zero nos acertos dos raios, onde o relevo some e a cor do padrão continua), e `Subgraph.point` ganhou `defaults` (a entrada `s` do material vale a amostra do ponto sem ligação obrigatória). Por família: madeiras — anéis com a cor do lenho inicial ao tardio e o tom por anel, fibra e poros, relevo do lenho tardio e da fibra; no envernizado o verniz fica liso por cima do veio (normal própria), molha a madeira (a base sem especular: mais escura e saturada) e enche os poros; tecidos — a trama com o relevo dos fios (algodão tela, jeans sarja 3/1 de urdidura índigo e trama crua, lã tela grossa felpuda e mesclada, seda cetim com a tangente do brilho no fio à vista, tecido fino tela aberta com a luz passando pelos vãos), o veludo com as manchas do pelo penteado (a normal do pelo inclinada por um grão largo); couro — o grão em células com sulcos, fosco nos sulcos; borracha e plástico fosco — grão fino em relevo; cerâmica — o corpo com pintas sob o esmalte em camada; metal escovado — os riscos na rugosidade e na normal, a tangente ao longo de u; pintura de carro — flocos com a inclinação e o tom de cada um sob o verniz com casca de laranja; metal oxidado — a ferrugem em manchas com relevo; mármore — os veios. Lisos por natureza, sem mudança: plástico brilhante, metal polido, porcelana, pele, cera, vidro. O que ainda não convence: a lã (lê-se como juta ou linho grosso, não como lã felpuda: falta a fibra solta no contorno), o metal polido (sem um ambiente com o que refletir, parece plástico cinza: o hemisfério só dá um degradê), a tábua de madeira crua vista rasante (o relevo dos anéis lê-se canelado) e a pele, a cera e a porcelana (esferas lisas: dependem do espalhamento sob a superfície, a próxima rodada). O padrão em 3D sólido (a madeira cortada de um bloco) pede a posição do objeto na amostra de superfície, que o motor não tem (o registro da onda dos acertos teria de crescer): fica como pendência.
  - **Rodada 4 (2026-11-22, veludo, lã, madeira e o ambiente)**: retoque dos quatro que não convenciam. Veludo — era cetim amassado: o brilho de fibra estreito (rugosidade 0,3) sobre uma normal muito inclinada pelo grão largo; agora o corpo difuso escuro sem especular, o brilho de fibra mais largo (0,45: o halo macio na borda) e o pelo penteado por um grão de uma oitava, três manchas por unidade, com inclinação leve. Lã — de tela grossa de relevo duro (lia-se juta) a tweed: sarja 2/2 de 64 fios sem vão, tons próximos, relevo raso e a penugem fina borrando o fio e mesclando o tom. Madeira — `pattern.rings` ganhou `irregularity` (a posição em anéis deslocada por um ruído do próprio raio: anos largos e estreitos, sempre crescente) e `waviness` (o raio ondulado pelo ruído), com o gradiente analítico, a referência da CPU, o teste e a conferência na GPU (`nodeGraphs` parte f, 0 fora da tolerância); a madeira crua foi a 64 anéis irregulares por unidade, a faixa escura só no fim do anel, a fibra mais marcada, e o relevo dos anéis caiu a um sétimo (lixada: o relevo é o da fibra). Metal polido — o grafo já era um condutor de rugosidade 0,05; faltava ambiente para refletir (ver T093). O que ainda não convence: a lã é um tweed de sarja, não uma malha de tricô (não há padrão de malha entre os nós), e a penugem só se resolve no meio da esfera; o veludo guarda uma dobra no polo de baixo do uv da esfera (o grão do pelo aperta onde o uv converge) e uma linha escura no limbo esquerdo, onde começa a luz de recorte; os anéis da madeira têm o perfil em dente de serra (subida lenta, queda rápida), que de longe ainda sugere um relevo leve na placa.
- [x] T092 [US5] Criar `src/elements/material/Materials.ts` (fábricas → `MaterialFunction`) e exportar em `src/elements/material/index.ts` e `src/index.ts`
  - **Reconciliação (2026-11-12, 034 T071)**: não feita (sem `src/elements/material/Materials.ts`). US5 vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: sem `src/elements/material/Materials.ts`.
  - **Entrega (2026-11-22)**: `src/elements/material/Materials.ts` (`649f68df`): `Materials.<nome>(valores)` → `MaterialFunction`; exportado em `src/elements/material/index.ts` (com `MaterialFactory` e `MaterialName`) e, por ele, em `src/index.ts`. `npm run doc:coverage` sem erros e sem aviso novo.
- [x] T093 [US5] Caso `gallery` em `src/__smokes__/materials.ts`: todos os materiais sob a mesma luz; medidas de reconhecimento (madeira crua sem realce nítido, envernizada com realce nítido, veludo com borda, metal escovado com realce alongado, vidro com refração)
  - **Reconciliação (2026-11-12, 034 T071)**: não feita (sem caso `gallery`). US5 vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: `src/__smokes__/materials.ts` sem o caso `gallery`.
  - **Entrega (2026-11-22)**: caso `gallery` (`b6c0299f`), 23 esferas sob o mesmo sol e o ambiente padrão diante de uma parede xadrez, 960×640, MSAA: realce do sol (pico sobre a mediana do anel a 12–16 px) — madeira crua 1,02×, verniz brilhante 105× (pico 31,7), verniz fosco 2,66×; borda sobre o centro — veludo 7,66, algodão 1,28, borracha 0,85; realce do metal (razão dos eixos) — escovado 9,96×, polido 1,96×; vidro — a casa clara da parede 0,639 à vista e 0,617 através dele, 62 % do trecho com a casa trocada pela refração; 0 valores não finitos, nenhum material sem imagem. O vidro fora do eixo da câmera ortográfica não refratava: o pedido da refração gravava a distância até a posição da câmera, corrigido em `924d3987` (na perspectiva, a mesma distância de antes). O smoke `materials` inteiro passou depois da correção (33 s).
  - **Rodada 3 (2026-11-22, a galeria que mostra os materiais)**: o caso `gallery` passou a quatro quadros por família (madeira e couro; tecidos; plásticos e metais; translúcidos), 1440×960, câmera em perspectiva (21°, a 30° de elevação), cada material numa esfera (o eixo do uv inclinado 35° para trás) sobre uma placa do mesmo material (a parte plana), sob o sol, uma luz de recorte rasante por trás e o hemisfério, com chão e fundo neutros (o xadrez só atrás do vidro e do lugar vazio). Medidas (smoke `materials` inteiro: passou em 43 s): realce do sol — madeira crua 1,21×, verniz brilhante 707× (pico 172,7), verniz fosco 1,82×; contraste da estrutura (desvio em torno da média local sobre a média) — veio da madeira crua 0,166 e sob o verniz 0,156, grão do couro 0,245, borracha 0,026; flocos da pintura 0,056 e ferrugem 0,123 contra 0,000 do plástico brilhante; veios do mármore 0,070 contra 0,000 da porcelana; periodicidade da trama (a autocorrelação das linhas volta a subir depois do primeiro mínimo) — jeans 0,91, algodão 0,85, veludo 0,00; borda sobre o centro — veludo 6,16, algodão 1,44; manchas do pelo do veludo 0,261; realce do metal — escovado 3,87×, polido 1,03×; vidro — a casa clara 0,413 à vista e 0,487 através dele, 25 % do trecho com a casa trocada, 0,02 % de pontos de grão; tecido fino contra o sol 0,124 (algodão 0,075). Custo de GPU por quadro (mediana, do próprio smoke): antes, o quadro único de 23 esferas a 960×640 na câmera ortográfica, 25,3 ms; agora, a 1440×960, madeira e couro 3,3 ms, tecidos 6,5 ms (o tecido fino é traçado), plásticos e metais 2,2 ms, translúcidos 23,3 ms (o vidro traçado: é ele o custo do quadro de antes também). A borda do vidro, serrilhada na câmera ortográfica, ficou lisa na perspectiva em quase todo o contorno; resta um degrau leve no limbo direito e no de baixo (ampliação 3× conferida a olho); a medida do anel a 0,985 do raio fica registrada (6,1 % dos passos com salto de mais de um quarto da casa clara), sem limite.
  - **Rodada 4 (2026-11-22, o ambiente da galeria)**: a galeria passou a ter o céu físico (`Sky`, do mesmo sol) e a luz rebatida (`GlobalIllumination`, sondas do mundo a 0,5 m centradas na cena, 240 quadros de acúmulo) no lugar do hemisfério: os lisos têm o que refletir. O motor não traça o reflexo das superfícies opacas no desenho: sem a luz rebatida, o especular indireto é o hemisfério céu/chão de duas cores (`closure_ambient`); com ela, é a radiância das sondas do mundo na direção do reflexo (`gi_world_light`, lobos de rugosidade abaixo de 0,5), guardada num mapa octaédrico de 8 × 8 por sonda — um reflexo borrado (o céu azul por cima, o chão por baixo, a cor dos vizinhos), sem imagem nítida dos objetos. Falta para o espelho: um raio de reflexo por pixel para os lobos opacos lisos (como a refração já traça para os transmissivos). A coleta de tela da luz rebatida ficou desligada na galeria (`screenGather: false`): com ela, os lisos sob o sol deixavam pontos claros soltos por todo o quadro (vaga-lumes dos acertos especulares nas sondas de tela), que não sumiam em 240 quadros. Medidas novas e ajustadas (smoke `materials` inteiro: passou em 55 s): veludo — borda sobre o centro 5,37 (algodão 1,45; limite 2,5 e o dobro do algodão), realce do sol 1,00× (limite 1,5), contraste local 0,000 (limite 0,05; sai a medida das manchas do pelo); metal polido — azul sobre vermelho do reflexo para cima 2,35 e para baixo 1,09 (limite: 1,15 vez); madeira crua — realce 1,51×, veio 0,183 e sob o verniz 0,176; verniz brilhante 716×, fosco 1,73×; metal escovado 3,87×; tecido fino contra o sol 0,083 (algodão 0,126); vidro — casa clara 0,344 à vista e 0,445 através, 37 % do trecho trocado, 0,12 % de pontos de grão. Custo de GPU por quadro (mediana), agora com a luz rebatida: madeira e couro 8,0 ms, tecidos 10,6 ms, plásticos e metais 6,3 ms, translúcidos 30,1 ms.
- [x] T094 [US5] Caso `library-compose`: madeira crua e metal escovado misturados por ruído (o quickstart) e um material pronto com entrada ligada a outro nó
  - **Reconciliação (2026-11-12, 034 T071)**: não feita (sem caso `library-compose`). US5 vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: sem o caso `library-compose`.
  - **Entrega (2026-11-22)**: caso `library-compose` (`b6c0299f`): o grafo do quickstart (madeira crua e metal escovado misturados por `noise.gradient3`) contra cada um sozinho no mesmo lugar — de 16 190 pixels, 70 % iguais à madeira e 30 % com os dois (o ruído vai de −1 a 1 e a mistura prende em [0, 1]); `material.plasticGloss` com a cor ligada a um xadrez por rampa — vermelho/azul 16,0 numa casa e 0,063 na vizinha, pico do realce 91,4.

- [x] T117 [US5] Variedade da biblioteca: 36 materiais novos (62 no total), os nós `pattern.bricks`, `pattern.planks`, `pattern.fissures`, `pattern.dents` e os nós da madeira em `pattern.rings`, o reflexo traçado do lobo anisotrópico, a pintura de carro de base metálica e a galeria só em esferas com o painel-índice (rodada 8 da galeria). Decisão em `research.md` R18.
  - **Entrega (2026-11-22)**, pedidos do usuário ("a variedade de materiais está pobre"; "a esfera é suficiente, faça em esferas"; as 13 fotos de referência das madeiras; "a tintura de carro mais parece pérola do que um metal envernizado"; "considere também material de casca de árvore"):
    - **Nós novos** (registro padrão, com referência da CPU, caso no `nodeGraphs` e teste): `pattern.bricks` (fiadas com junta: o tijolo e, sem deslocamento, o azulejo), `pattern.planks` (o assoalho: réguas e espinha de peixe; devolve a coordenada de cada peça, que alimenta os padrões do veio — cada tábua com os seus anéis, na sua direção), `pattern.fissures` (a casca: placas alongadas com a rede de fissuras que se ramifica, a fissura da mesma largura em qualquer direção), `pattern.dents` (as mossas do martelo); `pattern.rings` ganhou os nós da madeira (`knots`, `knot_size`, `knot_rings` e a saída `knot`: um monte gaussiano somado ao raio — os anéis desviam em volta do nó e fecham dentro dele).
    - **Metais**: `gold`, `copper`, `brass`, `chrome` (F0 por canal da tabela 9.2 do Real-Time Rendering; a tinta da borda calculada do índice complexo, a do latão estimada), `aluminiumAnodized`, `metalHammered`, `castIron`, `bronzePatina`, `carbonFiber`.
    - **Pedra, construção e terra**: `concrete`, `granite`, `sandstone`, `brick`, `plaster`, `asphalt`, `tile`, `terracotta`, `driedMud`, `sand`; relevo em milímetros com deslocamento em `sandstone`, `brick`, `driedMud`.
    - **Madeiras** (pelas fotos de referência, em várias escalas: faixas largas, anéis irregulares, tom do ano, faixas da grã, fibra fina, tracinhos, poros, nós): `woodPine` (com nós), `woodOak` (claro fosco, raios), `woodWalnut`, `woodOakVarnished` (o verniz acompanha o poro aberto: a normal do verniz desce em cada vaso), `woodMahogany` (envernizado), `woodFloorPlanks`, `woodFloorHerringbone`; `woodRough` refeita (sulcos da fibra gasta, frestas de formas variadas, cinza-acastanhada); `bark` (casca grossa fissurada, com líquen) e `barkBirch` (bétula: lenticelas e tiras que descascam), as duas com deslocamento; `cork`.
    - **Orgânicos**: `paper`, `ice`, `soap`, `ivory`, `motherOfPearl` (o lobo de filme fino existe: `closure.thinFilm`), `snow`.
    - **Metal escovado**: o lobo anisotrópico entra no reflexo traçado — a fração de espelho pelo eixo estreito e o raio sorteado no eixo largo (a marginal GGX das inclinações), um por pixel, o mesmo valor ao longo de uma linha da escova na tela; com o antisserrilhado temporal o sorteio muda a cada quadro. Sem estado entre quadros, sem raio a mais.
    - **Pintura de carro**: base metálica (condutor da cor da tinta cobrindo 92 % da base, lobo médio, a normal de cada floco inclinada) sob o verniz de normal própria (o `closure.layer` já separa a normal do verniz da da base); `carPaintSilver`. A medida dos flocos passou para longe do realce, no quadro `pintura`.
    - **Tecido fino**: os vãos da trama são buracos (`closure.opacity` pela saída `gap`): vê-se através dele, e duas camadas cobrem mais.
    - **Galeria**: quadros só de esferas grandes sobre fundo escuro (`pintura`, `metais`, `metais-2`, `pedra`, `terra`, `madeiras`, `assoalhos`, `organicos`) e o quadro `deslocamento` (seis esferas deslocadas sob a luz rasante); as formas (toro, capô) saíram. Painel-índice montado dos quadros (60 esferas; `jade` e `milk` estão no quadro `subsuperficie`).
    - **Medidas** (smoke `materials` inteiro: passou em 189 s; `nodeGraphs`: passou, 12 nós de padrão contra a referência; `refraction` casos `prism`, `dispersed`, `glint`, `rough`, `lit`: passaram): realce do escovado 23,9× mais comprido que largo; granulado da pintura longe do realce 0,065 (vermelha) e 0,103 (prata); contorno das esferas deslocadas (desvio do raio, px) arenito 3,5, tijolo 5,9, barro 2,2, madeira bruta 4,2, casca 13,3, bétula 3,3; contraste da estrutura de cada material novo e as cores (ouro, cobre e latão mais quentes que o cromo; pinho > carvalho > nogueira em claridade; gelo azulado, marfim quente) no registro do smoke. A medida da sombra própria da tábua da madeira bruta passou de 1,5× para 1,25× a da tábua plana (11,2 % × 7,5 %): os sulcos novos na normal escurecem mais pontos da plana pelo viés da sombra.
    - **Custo de GPU por quadro** (mediana, 1440 × 960, M4): `pintura` 9,7 ms; `metais` 13,7; `metais-2` 8,3; `pedra` 11,6; `terra` 7,4; `madeiras` 13,9; `assoalhos` 11,6; `organicos` 13,9 (11,8 sem a subsuperfície); `deslocamento` 57,8 (seis esferas grandes de malha adaptativa); `plasticos-metais` 13,9; `tecidos` 9,9; `relevo` 28,3.
    - **O que não convence**: o gelo (não é transparente: falta a transmissão com espalhamento interno heterogêneo — as trincas e bolhas são só cor do albedo); o papel numa esfera (só a formação; a translucidez precisa de uma folha); a fibra de carbono na esfera (o xadrez só acende nas linhas do realce: a luz do céu no lobo anisotrópico vem de uma direção só das sondas); a madrepérola (um filme só, cores fracas: falta a interferência de pilha de camadas); a neve (os brilhos existem mas são poucos, e os flocos abaixo de ~2,5 px somem — falta o modelo estatístico de brilhos pontuais abaixo do pixel, que também limita os flocos da pintura); o mogno (as listras dos anéis ainda regulares longe da medula); a casca grossa (placas lisas demais entre as fissuras); o reflexo do escovado sem antisserrilhado temporal sai em fios com serrilha (um raio por pixel). Sem o acúmulo do traçado para os pedidos de reflexo, os lobos rugosos isotrópicos continuam com a luz das sondas.
- [x] T116 [US5] Tecidos como pano: o fio torcido com volume, o tricô (`pattern.knit`), o desgaste do jeans nas dobras e o quadro dos panos caídos (rodada 7 da galeria)
  - **Entrega (2026-11-22)**, pedido do usuário ("os tecidos ainda não estão convincentes": esferas duras com a trama pintada):
    - **O fio**: `pattern.weave` ganhou `twist` (o ângulo da hélice das fibras) e as saídas `fiber` (a direção da fibra à vista: o eixo do fio girado pela torção, inteira no meio e nula nas bordas) e `strand` (os cabos do fio: três faixas em hélice); `surface.direction` leva a fibra ao mundo — a tangente do brilho anisotrópico da seda (antes, a mistura de `du` e `dv` pelo fio à vista). Os sulcos entre os cabos escurecem a cor; faixas de fios mais grossos e mais finos ao longo da urdidura (`slub`) ficam à vista de longe.
    - **Tricô**: nó novo `pattern.knit` (ponto meia: colunas de pontos em V, cada perna um elipsoide de fio, com `fiber`, `strand`, `stitch`, `gap`), com referência e caso. A lã passou de sarja a tricô de fio grosso, com o relevo em milímetros (`relief.wool`, 1,4 mm) — deslocado no pano e na amostra plana.
    - **Jeans**: o miolo claro do fio aparece nas cristas das dobras (a curvatura principal convexa da superfície, `surface.curvature`, de 5 a 22 por unidade, em manchas).
    - **Algodão**: sem especular, a penugem mais forte, a sombra entre os fios mais suave.
    - **Quadro `panos`**: cada tecido num pano quadrado caído sobre uma bola, com pregas e as pontas deitadas na mesa (`ParametricSurface` + `SurfaceFunction` por função, com a geometria diferencial, dos dois lados), a 8 unidades por metro, com o fio perto do tamanho real (a trama abaixo do pixel) e, à frente, a amostra plana ampliada. A luz de recorte projeta sombra.
    - **Medidas** (smoke `materials` inteiro: passou em 118 s; `nodeGraphs` inteiro: passou, os 8 nós de padrão contra a referência na GPU): nas pregas da frente, a seda tem realce de 2,18× a mediana da linha (algodão 1,56×) e o pixel mais claro anda 1,0 px de uma linha para a seguinte (mediana): o brilho desce pela dobra. As medidas das esferas (quadro `tecidos`, mantido) seguem: veludo borda/centro 5,35, periodicidade do jeans 0,89 e do algodão 0,84.
    - **Custo de GPU por quadro** (mediana, 1440 × 960): `tecidos` (esferas) 7,74 → 8,0 ms; `panos` (novo) 16,5 ms (12,3 sem a sombra da luz de recorte).
    - **O que não convence**: as pregas são uma soma de ondas no raio (regulares demais, sem dobras que se sobrepõem nem vincos); o tecido fino não se lê como translúcido (é um lobo de parede fina difusa: não se vê através dele, e do lado da câmera a luz que o atravessa não se destaca do sol) e as dobras sobrepostas só escurecem pela sombra inteira da luz de recorte; a trama do pano fica abaixo do pixel (o jeans de longe é um azul liso com o desgaste); na amostra ampliada os cabos do fio mal aparecem e a trama crua do jeans são barras chatas; o veludo não tem amostra plana que diga algo; os tecidos de trama continuam com o relevo só na normal.
- [x] T115 [US5] Deslocamento: o relevo do material em milímetros como geometria da malha adaptativa (ponto `displacement`, `DisplacementFunction`, `Displacements`), a madeira bruta (`woodRough`) e o quadro do relevo (rodada 7 da galeria). Decisão em `research.md` R17.
  - **Entrega (2026-11-22)**, pedido do usuário ("não notei mapa de deslocamento para a madeira, principalmente sem verniz"):
    - **Arquitetura**: ponto novo `displacement` (`fn displacement_fn(s: SurfaceSample, data) -> f32`), chamado por `surface_displaced_at` nos três kernels do `SurfaceFlow` (grade, geometria diferencial, adaptativa); a `DisplacementFunction` da entidade toma o lugar da pronta (zero) — slot, registro e pipeline como os da `SurfaceFunction`. A amostra do vértice traz o passo da malha como largura do filtro; na adaptativa, o passo da borda é o do menor nível dos retalhos vizinhos (sem fresta). `SurfaceSample` saiu para o módulo `surface_sample` (o `SurfaceParams` do material colidia com o da superfície).
    - **Nós**: `surface.relief` (altura em mm e derivadas no uv), `surface.reliefNormal` (a normal, no material), `surface.displacement` (a saída da geometria), `pattern.threshold` (o limiar com gradiente: as frestas), com referência e caso cada um.
    - **Materiais**: `nodes.relief.woodRough`, `leather`, `wool` (o relevo de cada um, usado nos dois grafos) e `Displacements.<nome>()`; `material.woodRough` novo (o lenho tardio saliente 0,8 mm, a face irregular 1,2 mm, a fibra 0,3 mm, as frestas de 3 mm e os riscos de 1,2 mm escuros no fundo, o tom em manchas); o couro passou ao relevo em mm (sulcos 0,35, rugas 0,5); a `woodRaw` lixada fica com o relevo raso na normal.
    - **Quem vê**: o desenho, o mapa de sombra virtual e os raios leem o buffer deslocado. Medido no quadro `relevo` (o par da mesma `ParametricSurface` com o mesmo material, sem e com a `DisplacementFunction`): contorno da esfera — desvio do raio 0,27 px só com a normal (o erro da medida) e 0,54 px deslocada; a tábua vista de perto, com a sombra da luz rasante e sem ela — os pontos que escurecem mais de um quarto com a sombra são 5,4 % na plana (o viés da sombra, deslocado pela normal do relevo) e 13,0 % na deslocada (a sombra das cristas e das frestas). Os raios: a luz rebatida passou a custar com as malhas deslocadas (abaixo).
    - **Achado e correção — caixa vazia nos raios**: `ray_box` dava acerto em [−∞, +∞] para a caixa invertida dos triângulos vazios (a malha adaptativa abaixo do nível máximo: a capacidade é a do nível máximo) e todo raio descia pela parte vazia da hierarquia. O quadro `relevo` custava 65,5 ms; com a caixa vazia como erro de acerto (GPU e referência, com teste), 24,3 ms. Smoke `rayScene` (`analytic`, `refit`, `moving`, `scale`) e `parametricSurfaces` (`field`, `curvature`, `curvatureMaterial`, `adaptive`, `cpuNormals`) rodados depois.
    - **Custo de GPU por quadro** (mediana, 1440 × 960): quadro `relevo` sem deslocamento 9,93 ms → com 6 superfícies deslocadas (3 esferas de 262 mil triângulos e 3 tábuas de 131 mil, segmentos de ~2 px) 26,7 ms — o desenho ~11 ms e as páginas da sombra ~5 ms dos triângulos de ~1 px; a luz rebatida (os raios) 1,4 ms; `madeira-couro` 12,42 → 12,8 ms (o couro só trocou o nó da normal).
    - **O que não convence**: a madeira bruta lê-se como madeira gasta, mas estilizada — as frestas são lentes escuras parecidas entre si, os anéis são cristas regulares e a fibra fina fica abaixo do pixel; a 20 cm e 1440 × 960 o relevo de 1 mm é ~1 px: a silhueta muda meio pixel (vê-se de perto, `relevo-perto`) e a sombra própria é fraca fora das frestas; nos acertos dos raios a normal é a lisa; o colisor não vê o relevo; a ferrugem e a casca de árvore ficaram de fora (a máscara da ferrugem não tem gradiente: o relevo dela segue só na normal).
- [x] T114 [US5] Reflexo nítido dos opacos lisos pelo traçado da refração, a pintura de carro e a ferrugem refeitas e os rótulos na galeria (rodada 6 da galeria)
  - **Entrega (2026-11-22)**, pedido do usuário ("material de metal de carro não vi, não vi metal com brilho de reflexo do sol, metal enferrujado também pode melhorar, faltou um rótulo no render"):
    - **Reflexo traçado** (decisão R16): o desenho marca, num passe depois dos opacos (`fs_reflection_request`, só entidades com função `material` com lobo especular ou verniz), os pixels em que o lobo é liso — no pedido da refração (`request`, agora `rgba32uint`: a distância, a marca `REFRACTION_REQUEST_REFLECT`, a direção refletida e a normal da face em octaédricas de 16 + 16 bits) e no alvo novo `reflectance` (o peso do lobo, `closure_reflected`). A fila e a cadeia da refração traçam esses pixels partindo da superfície na direção refletida (`refraction_chain_roots_main`), e a composição soma radiância × peso à cor (`refraction_reflection_fs`, aditiva). O passe principal desses materiais deixa de fora a parte lisa da especular indireta (`CLOSURE_TRACED`, constante do pipeline, só depois que o traçado produz). Espelho até a rugosidade 0,08, mistura até 0,16; o lobo anisotrópico fica com a luz indireta. `renderer.lightPaths.reflection` (padrão ligado); sem `RayScene`, nada roda.
    - **As rodadas do traçado pela leitura de volta**: a cadeia despachava sempre `maxInterfaces + 1` rodadas (17) em cada bloco; agora grava as rodadas com caminho vivo (`roundCount`) e o estágio despacha essas mais 3. A leitura de volta da contagem da fila (`queueCount`, papel `indirect`) nunca resolvia (`ResourceSystem.readTarget` só aceitava uniform e storage): a cadeia rodava sempre nos blocos da tela inteira (6 a 1440 × 960). Corrigido: com a fila medida, um bloco.
    - **Pintura de carro**: pigmento difuso + flocos de condutor pequenos (240 por unidade, inclinação 0,24, tom 0,3–1,7, lobo de rugosidade 0,18) + verniz espelhado (rugosidade 0,02, casca de laranja 0,0005); a tinta da borda dos flocos escura e saturada. Quadro novo `pintura`: a pintura num elipsoide achatado e o metal polido num toro (`ParametricGeometry`).
    - **Ferrugem**: máscara de manchas, riscos ao longo de v e pites; a cor por uma rampa de quatro cores sobre dois grãos; o metal que sobra liso (0,13) e manchado perto da ferrugem; a crosta e a borda inchada em relevo.
    - **Rótulos**: o nome de cada material no quadro gravado, pelo texto da interface do motor (`UiText` sobre `UiPanel`, atlas do `FontLoader`), na posição projetada do objeto; as medidas leem o alvo HDR antes.
    - **Medidas** (smoke `materials` inteiro: passou em 86 s; `refraction` `prism`, `dispersed`, `glint`, `rough`, `lit`: passaram): metal polido — borda refletida mais marcada 0,987 (contraste a 2 px; limite 0,15), pico do sol 1870 (22 000× a mediana do disco; limite 20×), azul/vermelho para cima 4,47 e para baixo 1,59; flocos em volta do realce 5,39 (limite 0,05); ferrugem 0,115 (limite 0,06).
    - **Custo de GPU por quadro** (mediana, 1440 × 960; antes → depois): madeira e couro 7,97 → 12,4 ms; tecidos 10,87 → 7,7 ms (a fila medida: o tecido fino já era traçado); plásticos e metais 6,25 → 11,9 ms; translúcidos 35,5 → 35,9 ms; pintura (novo) 4,98 sem o reflexo, 7,9 com. O traçado custa ~2 ms fixos mais a luz nos pontos atingidos.
    - **O que não convence**: o reflexo é de um salto só; com MSAA as bordas do que é refletido ficam em degraus (no antisserrilhado temporal, lisas); o brilho em volta do sol (o `Bloom` do motor é um filtro de 5 × 5 px, que vira quadrados) não foi usado — o sol estoura no ponto, sem halo; os flocos são do tamanho do pixel e cintilam só em volta do realce; a ferrugem não descasca (a borda sobe, não solta lascas); os pites são polígonos pequenos, não redondos; o `StandardMaterial` sem função `material` não entra no reflexo traçado.
- [x] T113 [US5] SSS físico: o espalhamento sob a superfície de verdade no lugar do "wrap" local de `bsdf.subsurface` — a referência f64 (o perfil de Christensen e Burley 2015 contra um passeio aleatório), a difusão entre pixels e a luz que atravessa as partes finas no desenho, o raio em mm e a escala do mundo no fechamento, os materiais com os valores medidos e o caso `sss` do smoke `materials`. Decisão e alternativas em `research.md` R15.
  - **Entrega (2026-11-22)**, pedido do usuário ("não vi nada de SSS"; na galeria, pele, cera e porcelana eram esferas lisas e opacas):
    - **Referência** (`src/elements/material/reference/subsurface.ts`, 9 testes): o perfil R(r) = A (e^(−r/d) + e^(−r/3d)) / (8π d r), d = ℓ/s, s = 1,9 − A + 3,5 (A − 0,8)² (a luz que entra difusa), a fração acumulada, a amostragem pela inversa exata (a raiz da cúbica) e a transmissão pela espessura ¼ e^(−t/d) + ¾ e^(−t/3d); e um Monte Carlo de passeio aleatório (isotrópico, sem diferença de índice) num meio semi-infinito e numa placa. Medido com 400 mil caminhos: a fração acumulada do perfil a 0,005, 0,009, 0,022 e 0,011 do passeio para α = 0,5, 0,8, 0,95 e 0,99 (A de 0,15 a 0,79) e o raio médio a 0,3 %, 1,9 %, 7,1 % e 4,3 %; com α = 0,999 (A = 0,93) o perfil perde a cauda (0,065 na fração; o raio médio do passeio é 3,6 caminhos livres contra 2,4). Na placa, a transmissão do passeio segue a parte do perfil além da espessura **sem** o albedo (com ele ficava 2 a 3 vezes abaixo): a menos de 0,042, 0,031 e 0,068 (absoluto) para α = 0,8, 0,95 e 0,99, de ¼ a 8 caminhos livres; além de 4 o perfil fica abaixo (até a metade de um valor já menor que 0,1). As tolerâncias dos testes (0,03 na fração, 8 % no raio médio, 0,075 na transmissão) são o erro do ajuste do artigo mais o ruído do passeio (0,003 com 100 mil caminhos).
    - **Fechamento e nó**: `Closure.subsurface_radius` é o caminho livre médio em mm por canal e `subsurface_scale` a escala do mundo (unidades por metro); `bsdf.subsurface` ganhou a entrada `scale`; o OpenPBR expõe `subsurface_scale`. No ponto (o passe principal e os acertos dos raios da refração e da luz rebatida), o lobo responde como o perfil integrado: o difuso de albedo `color` — o "wrap" saiu de `closure_eval` e o raio de sombra de trás dos raios (`ray_direct`) ficou só para o translúcido.
    - **No desenho** (`Subsurface`, inserido pelos estágios padrão com o primeiro material com o lobo; `ForwardFlow`): três passes depois do principal, só das entidades com o lobo — (1) a luz que entra por pixel, sem amostras e com profundidade própria: a irradiância direta (com a sombra) pela resposta de um difuso branco às luzes da cena, mais a que atravessa o corpo (ponto de cena novo `scene_transmitted_lighting`, com a espessura pelo ponto `light_thickness`, contribuído pela luz direcional que projeta sombra: da primeira superfície que a luz vê no mapa virtual até o ponto, e o cosseno da luz na entrada pela inclinação dessa superfície); (2) a difusão: 16 amostras por pixel (12 e 8 nos perfis médio e baixo) num disco no plano tangente, o raio pela importância do perfil do canal que vai mais longe, cada uma projetada na tela e pesada por canal pelo perfil na distância de verdade até a superfície do pixel dela (a profundidade guardada), com conjuntos de amostras que se alternam a cada 4 × 4 pixels; (3) a soma à cor da cena na profundidade do passe principal (teste igual; com MSAA, nas amostras), com a média dos 16 conjuntos na vizinhança da mesma superfície e menos a luz do próprio ponto, que o passe principal já desenhou. O especular fica fora. Sem acumulação temporal (nenhum estado entre quadros). `renderer.subsurface.enabled` e `.samples`.
    - **Materiais**: `skin` (a "skin2" de Jensen et al. 2001: albedo 0,63, 0,44, 0,34 e ℓ 0,91, 0,60, 0,52 mm), `marble` (Jensen: ℓ 0,46, 0,38, 0,33 mm), `wax` (estimado: 2,8, 2,0, 1,2 mm), `porcelain` (estimado, curto: 0,3, 0,27, 0,22 mm) e dois novos: `jade` (estimado: 0,9, 1,8, 1,0 mm) e `milk` (o leite integral de Jensen: 0,39, 0,31, 0,26 mm) — 25 materiais. Borracha e plástico ficam como estão (opacos na escala do pixel).
    - **Smoke `materials`** (inteiro: passou em 78 s; `lighting` e `hdr` caso a caso e `nodeGraphs`: passaram). Caso `sss`, com MSAA e com o temporal: o perfil radial de um feixe estreito sobre uma placa contra a convolução da fonte medida com o perfil de Burley — maior desvio por canal 1,5 %, 1,0 % e 2,2 % (MSAA) e 0,8 %, 1,1 % e 2,4 % (temporal) em faixas de 6 px; a fração da energia por raio a menos de 0,010; a largura (raio quadrático médio) a 0,1 %, 0,0 % e 0,4 %; a energia com e sem a difusão 0,998 a 1,000; luz uniforme: 0,1 % de diferença; a transmissão por placas de 0,3, 0,6, 1,2 e 2,4 mm em contraluz a 0,2 % da referência nos três canais (0 sem a subsuperfície); sem material com o lobo, nenhum `Subsurface` na cena e nenhum alvo alocado. Caso `subsurface-terminator`: numa esfera de 16 mm, (0,046, 0,007, 0,000) em n·l = −0,2. Caso `gallery`: o quadro dos translúcidos em contraluz (a luz de recorte com sombra, 5; o sol de preenchimento, 1,2; as esferas são contas de 2 cm, a 55 unidades por metro) e o quadro novo `subsuperficie` — o par de cera sem e com o espalhamento, a pele, uma vela de 8 mm e placas de mármore (1,5 mm) e de jade (2 mm): a cera acende no lado da sombra (0,335, 0,222, 0,095 contra 0,092, 0,089, 0,071 com o raio zero), a vela (0,634, 0,459, 0,209 contra 0,239, 0,220, 0,169 sem a subsuperfície), o mármore (0,540, 0,435, 0,361 contra 0,216, 0,208, 0,199) e o jade (0,287, 0,901, 0,348 contra 0,096, 0,164, 0,103); na pele, depois do terminador, o ganho é (0,011, 0,001, 0,000).
    - **Custo de GPU** (M4, 1440×960, do smoke): os três passes custam de 0,2 a 0,9 ms no quadro `subsuperficie` (3,3 a 3,6 ms sem eles; a medida varia entre execuções) e 4,3 ms no dos translúcidos (35,3 ms com, 31,0 ms sem: quatro esferas e quatro placas cobrindo quase metade da tela, com o mármore de cinco oitavas avaliado três vezes e as cáusticas do vidro na luz direta). Os outros quadros da galeria não mudaram (8,0, 10,5 e 6,3 ms). Sem material com o lobo: zero.
    - **Não convence ainda / de fora**: a difusão é na tela (peças diferentes no mesmo plano trocam luz; o que está fora da tela não entra); só a luz direta é difundida (a rebatida fica no ponto); só as luzes direcionais com sombra atravessam (a vela acesa por dentro, com uma luz pontual, não); a espessura é ao longo da luz (a placa inclinada parece mais grossa); a face fina iluminada pela frente reflete o albedo inteiro (de verdade parte da luz sairia por trás); o passeio aleatório nos raios da luz rebatida ficou de fora (seria um laço de eventos por acerto, custo fixo novo por raio); sem acumulação temporal — a vela, estreita diante do alcance do perfil, ainda mostra manchas leves; com a contraluz forte, as cáusticas do vidro aparecem pontilhadas na parede do quadro dos translúcidos (não são da subsuperfície).

**Checkpoint**: US5 verificável sozinha.

---

## Phase 9: User Story 6 — Superior ao Three.js lado a lado (Priority: P2)

**Goal**: cenas iguais nas duas engines, medidas e vídeo.

**Independent Test**: `npm run bench -- --scene materials,point-lights --engines clayflow,three --headless` e a página de comparação.

- [ ] T095 [US6] Adaptador Three em `bench/engines/three.ts`: `antialias: true` (MSAA 4×), AgX equivalente, luzes físicas no lugar de `addDefaultLighting`, hemisfério equivalente
  - **Reconciliação (2026-11-12, 034 T071)**: não feita: `bench/engines/three.ts` segue com `antialias: false` e `addDefaultLighting`. US6 vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: `bench/engines/three.ts:39` com `antialias: false` e `addDefaultLighting` (`:20`, `:55`).
- [ ] T096 [P] [US6] Cena `bench/scenes/materials/` (`scene.ts`, `clayflow.ts`, `three.ts`): galeria 5×5 com os materiais da biblioteca e os correspondentes do `MeshPhysicalMaterial` (clearcoat, sheen, transmission, iridescence, anisotropy, dispersion)
  - **Reconciliação (2026-11-12, 034 T071)**: não feita (sem `bench/scenes/materials/`). US6 vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: sem `bench/scenes/materials/` (as cenas do bench são `clouds`, `global-illumination`, `graph-geometry`, `instances`, `particles`, `point-lights`, `rigid-bodies`, `skinned-characters`, `surfaces`, `unique-objects`).
- [ ] T097 [P] [US6] `bench/scenes/point-lights/clayflow.ts` (256 luzes, 200 objetos) e remoção do `unsupported until 'F4'` em `scene.ts`
  - **Reconciliação (2026-11-12, 034 T071)**: não feita: `bench/scenes/point-lights/scene.ts` ainda declara `unsupported ... until: 'F4'`. US6 vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: `bench/scenes/point-lights/` só com `scene.ts` e `three.ts`; `scene.ts:15` ainda com `unsupported: 'o forward ignora PointLight', until: 'F4'`.
- [ ] T098 [P] [US6] Variante `water-lake` em `bench/scenes/particles/` (ou `surfaces/`) com a água nas duas engines
  - **Reconciliação (2026-11-12, 034 T071)**: não feita (sem variante `water-lake`). US6 vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: as variantes `*-water` de `bench/scenes/particles/scene.ts:43` são água só no Clayflow (o Three desenha as partículas instanciadas); não há `water-lake` com a água nas duas engines.
- [ ] T099 [US6] Página de comparação lado a lado em `bench/page/` (as duas engines na mesma página, leitura de imagem só no fim): faixas, forno, cintilação especular, serrilhado de borda; resultado gravado em `bench/results/`
  - **Reconciliação (2026-11-12, 034 T071)**: não feita (sem página de comparação). US6 vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: `bench/page/` só com `main.ts`, `sampler.ts` e `smoke.ts`.
- [ ] T100 [US6] Registrar as medidas e o tempo de quadro (SC-011) em `specs/011-hdr-pbr/comparison.md`
  - **Reconciliação (2026-11-12, 034 T071)**: não feita (sem `comparison.md`). US6 vai para a 035.
  - **Conferência (2026-11-17)**: (d) não entregue: sem `specs/011-hdr-pbr/comparison.md`.

**Checkpoint**: US6 verificável sozinha.

---

## Phase 10: Fixtures

- [x] T101 Regravar uma vez as fixtures de imagem (A14) com `--record`: `render-*`, `fluidSurface-*`, `particles-*`, `softSurface-*`, `pointCloud`, `parametricSurfaces-*`, `nodeGraphs`, os hashes de `extensionPoints-*.json` e `parametricSurfaces-*.json`; lista com justificativa visual em `specs/011-hdr-pbr/fixtures.md` e montagem antes/depois enviada ao usuário
  - **Reconciliação (2026-11-12, 034 T071)**: **Substituída**: as fixtures de imagem foram regravadas na 033 T063 contra a saída do `develop` com a 011, com montagens e justificativa em `specs/033-global-illumination/fixtures.md` (`661e29c6`), e de novo na 034 (T031, T066, T070) com justificativa por fixture; não há `specs/011-hdr-pbr/fixtures.md`.
- [x] T102 Recalibrar os limiares de cor fixos de `src/__smokes__/parametricSurfaces.ts` e `extensionPoints.ts` pela mesma montagem
  - **Reconciliação (2026-11-12, 034 T071)**: feita na 034 T070 (`15e667ac`, `38515df6`): as seis checagens desde `5ef1dd4`, com `parametricSurfaces` e `extensionPoints`, medidas e passando.
- [x] T103 Conferir as fixtures de estado (`trajectories`, `contacts`, `fluidBehavior`) bit a bit, sem regravar (SC-012)
  - **Reconciliação (2026-11-12, 034 T071)**: `trajectories`, `contactSet` e `fluidBehavior` passam contra as fixtures commitadas, sem regravar, com o código da 011 no `develop` (`693aed4b`, PR #47): `specs/033-global-illumination/fixtures.md` (`661e29c6`).

---

## Phase 11: Docs

- [x] T104 [P] Guia novo `clay-engine-doc/docs/guides/materials.md` (materiais por nós BSDF, fechamento, fusão de lobos, especialização, biblioteca com valores e fontes, compatibilidade da 009)
  - **Reconciliação (2026-11-12, 034 T071)**: `clay-engine-doc/docs/guides/materials.md` (034 T073, `38515df6`).
- [x] T105 [P] Guia novo `clay-engine-doc/docs/guides/lighting.md` (luzes e unidades, `scene_lighting`, hemisfério como aproximação até a 033, limite de 1024) e `clay-engine-doc/docs/guides/presentation.md` (HDR, operadores, exposição, saída HDR, resolve por amostra)
  - **Reconciliação (2026-11-12, 034 T071)**: `clay-engine-doc/docs/guides/lighting.md` e `presentation.md` (034 T073, `38515df6`).
- [x] T106 [P] Atualizar `clay-engine-doc/docs/guides/node-graphs.md` (grupos `bsdf`, `closure`, `geometry`, `color`, `material`), `post_processing.md` (HDR, sem passthrough) e `shaders.md`
  - **Reconciliação (2026-11-12, 034 T071)**: `post_processing.md` já descreve o HDR e a apresentação sem passthrough (`cb177eb7`, `bf467ff7`) e `shaders.md` o ponto `scene_lighting`; falta o `node-graphs.md` com os grupos `bsdf`, `closure`, `geometry`, `color` e `material` — hoje estão só no `materials.md` (`38515df6`), e o `node-graphs.md` ainda diz que os materiais por nós "são da 011". O `38515df6` não alterou o `node-graphs.md`. Vai para a 035.
  - **Conferência (2026-11-17)**: (a) entregue em `fcd2a794` (034 T073, 2026-11-12, depois da reconciliação): `clay-engine-doc/docs/guides/node-graphs.md` com a seção "Materiais (`nodes.bsdf`, `nodes.closure`, `nodes.material`)" (`:466`–`:493`: os nós `bsdf.*`, `closure.*`, `geometry.tangentUv`, `material.openpbr`), os nós `color.*` (`:391`–`:396`), `output.closure` (`:463`) e a contagem de 91 nós de ponto (`:330`); a frase "são da 011" saiu. `post_processing.md` e `shaders.md` já estavam feitos.
- [x] T107 [P] Atualizar `clay-engine-doc/docs/guides/architecture_resource_loaders.md`: ordem dos passes (opacos → cópia com mips → transmissivos em duas camadas → água → pós → apresentação), pontos de luz por luz
  - **Reconciliação (2026-11-12, 034 T071)**: o `architecture_resource_loaders.md` não tem a ordem dos passes nova (o `38515df6` não o alterou), e a ordem escrita aqui mudou: não há mais cópia da cena; os transmissivos e a água vão pela refração traçada (034/039). Vai para a 035, com a ordem do `Renderer` da 039.
  - **Conferência (2026-11-17)**: (c) parcial: a ordem dos passes foi escrita em `fcd2a794` (034 T073, 2026-11-12) — seção "Ordem dos passes do quadro (estágios padrão)", com a ordem real do motor; a ordem desta tarefa (cópia com mips, transmissivos em duas camadas, água) foi substituída pela refração traçada da 034/039 e não se aplica. Falta "pontos de luz por luz" nesse guia: ele não cita o `scene_lighting` e a linha do `Light` na tabela de Resources ainda diz "cor e intensidade no sombreamento: F4" (o ponto por luz está em `lighting.md:17` e `shaders.md:444`).
  - **Entrega (2026-11-22)**: seção "Pontos de luz por luz (spec 011)" em `clay-engine-doc/docs/guides/architecture_resource_loaders.md` (os pontos de cena de luz, com assinatura, combinação e pronto, e o que cada Resource de luz contribui) e a linha do `Light` na tabela dos pools corrigida (sem "F4" nem os pontos `scene_light_direction`, que não existem mais). A ordem de passes desta tarefa (cópia com mips, transmissivos em duas camadas, água) fica **substituída** pela ordem real escrita em `fcd2a794`.
- [x] T108 `specs/ROADMAP.md` (011 implementada; 014 sem "pós direto no canvas"), `specs/PENDENCIAS.md`, JSDoc das classes públicas novas e `README.md` (API)
  - **Reconciliação (2026-11-12, 034 T071)**: `specs/PENDENCIAS.md` reescrito na 034 T071; o JSDoc é conferido pelo `doc:coverage` do `npm run ci` (verde no `develop` com a 011: `specs/033-global-illumination/baseline-check.md`, `df93e6a8`); a G2 (pós direto no canvas) saiu na 034 T033 (`cb177eb7`). Falta o `specs/ROADMAP.md` dizer o estado da 011 na linha da F4 (implementada em parte; US5/US6 na 035) e tirar da 014 o "pós sem efeitos desenhando direto no canvas"; o `README.md` da API com os materiais. Vai para a 035.
  - **Conferência (2026-11-17)**: (c) parcial, sem mudança: `PENDENCIAS.md` e o JSDoc (o `doc:coverage` do `npm run ci`, verde na 034 T075, `37455cdd`) feitos; faltam no `specs/ROADMAP.md` o estado da 011 na linha da F4 (§3, a linha só descreve o escopo) e tirar da 014 o "pós sem efeitos desenhando direto no canvas" (ainda lá); o `README.md` da raiz segue com `webgpu-engine` e só o `StandardMaterial`, sem os materiais por nós.
  - **Entrega (2026-11-22)**: `specs/ROADMAP.md` com o estado da 011 na linha da F4 e na da 035, e a 014 sem o "pós sem efeitos desenhando direto no canvas"; `specs/PENDENCIAS.md` com o que resta da 011; `README.md` da raiz com a receita dos materiais por nós e da biblioteca (e `clayflow/web` no lugar de `webgpu-engine`); os guias `materials.md` (a biblioteca, com a tabela dos 23) e `node-graphs.md`.

---

## Phase 12: Fechamento

- [x] T109 Todos os smokes `--headless` no fonte e com `--dist`; nenhum processo órfão ao fim
  - **Reconciliação (2026-11-12, 034 T071)**: **Substituída**: todos os smokes rodaram no fonte e com `--dist` no fechamento da 033 (T067), com o código da 011; as falhas herdadas da 011 (H4, H5) foram fechadas na 034 T070 (`38515df6`). A rodada final é a 034 T075.
- [x] T110 `npm run bench:check` sem regressão relevante (custo do HDR registrado, ≤ 0,3 ms a 1280×720 com MSAA 4×); baseline regravado com a máquina livre
  - **Reconciliação (2026-11-12, 034 T071)**: `bench:check` e baseline regravado no fechamento da 033 (T068, `3136f735`), com o código da 011; o custo da apresentação HDR medido na 034 T069 (`c8668d13`): 0,113 ms sem antisserrilhado (≤ 0,3 ms); com MSAA 4×, 0,325 ms — acima dos 0,3 ms escritos aqui; a 034 T069 registrou ≤ 0,5 ms (3 % do quadro de 60 Hz) para esse caso, e o padrão do motor é o antisserrilhado temporal, não o MSAA.
- [x] T111 `npm run ci` verde
  - **Reconciliação (2026-11-12, 034 T071)**: `npm run ci` verde no `develop` depois do PR #47 (`693aed4b`): `specs/033-global-illumination/baseline-check.md` (`df93e6a8`), 205 arquivos, 1599 testes.
- [ ] T112 Vídeos (R14) enviados ao usuário: galeria girando sob luz que se move; grafo de material sendo editado; água (lago e tanque) com cáusticas de perto; comparação lado a lado Clayflow × Three (`materials`, `water-lake`)
  - **Reconciliação (2026-11-12, 034 T071)**: os vídeos que não dependem da biblioteca nem da comparação vão com a 034 T077; a galeria girando, o grafo de material editado e a comparação Clayflow × Three (`materials`, `water-lake`) vão para a 035.
  - **Conferência (2026-11-17)**: (c) parcial: os vídeos da água (lago e tanque com cáusticas de perto) foram na 034 T077 (fechada); faltam a galeria girando sob luz que se move, o grafo de material sendo editado e a comparação Clayflow × Three (`materials`, `water-lake`), que dependem da US5 e da US6.

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
