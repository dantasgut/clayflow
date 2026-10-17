---
description: 'Tarefas da spec 033 — iluminação global (luz rebatida), campos de distância e meios participantes'
---

# Tasks: Iluminação global (luz rebatida)

**Input**: `specs/033-global-illumination/` — [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md)
(A1–A9, R1–R12), [data-model.md](./data-model.md), [contracts/global-illumination.md](./contracts/global-illumination.md),
[quickstart.md](./quickstart.md)

**Tests**: obrigatórios (Constituição V, FR-014, SC-001–SC-014): testes de unidade (Vitest, `countingCore`) para toda
lógica de CPU, referências numéricas de CPU (LBVH, travessia, atmosfera, traçador de caminhos com meio participante) e
smokes de navegador com medidas (fonte e `--dist`, sempre `--headless`). As fixtures de imagem da água da 017 são
regravadas **uma vez**, na fase 11, com lista e montagem antes/depois; as de estado ficam bit a bit.

**Organização**: por história de usuário. Todas as histórias são implementadas por completo; a prioridade só ordena.
Regras de todas as tarefas: Resource + evento + Flow (sem helpers); dispatch só grava; nenhuma leitura de volta por
quadro; um símbolo WGSL por pipeline; só `shaders.ts` importa `.wgsl`; C3/C4 importam só a C2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1–US8)

---

## Phase 1: Setup (Base)

- [x] T001 Registrar o estado de partida em `specs/033-global-illumination/baseline-check.md`: `npm run ci`, todos os smokes `--headless` (fonte e `--dist`, anotando os que já falham por fixture pendente da 011) e `npm run bench:check` com a máquina livre (números de partida, inclusive `particles/64k-water` e tempo do quadro a 1280×720)
- [x] T002 [P] Criar `src/elements/raytrace/reference/bvh.ts` (só testes e smokes): Morton de 30 bits, LBVH de Karras (hierarquia por prefixos comuns), caixas de baixo para cima, refit, travessia com pilha, raio–caixa (lâminas), raio–triângulo (Möller–Trumbore estável), raio–esfera; com `bvh.test.ts` contra força bruta em nuvens aleatórias determinísticas
- [x] T003 [P] Criar `src/elements/scene/reference/atmosphere.ts`: integração numérica do modelo de Hillaire (Rayleigh, Mie, ozônio; transmitância, espalhamento simples e o múltiplo da tabela) em direções de amostra; `atmosphere.test.ts` (céu azul ao meio-dia, avermelhando no horizonte, transmitância monótona)
- [x] T004 [P] Criar `src/elements/lighting/reference/pathTracer.ts` (referência de CPU, como as da 011; testes em `reference/__tests__`): traçador de caminhos determinístico (estratificado) para cenas pequenas (caixas, esferas, planos) com os materiais base da 011 (difuso para a Cornell box), luzes da 011, céu da referência de T003, número de rebatimentos fixo, meio participante homogêneo e por grade (espalhamento simples e múltiplo, Henyey-Greenstein); saída da radiância média por região (máscara por instância) e imagem HDR; `pathTracer.test.ts` (forno branco, série de rebatimentos analítica num ambiente fechado, Beer-Lambert)
- [x] T005 [P] Medidas novas em `src/__smokes__/support/spectralMeasures.ts` (puras, testadas em `src/__tests__/smokes/`): energia espectral numa faixa de frequência (escala das partículas) ao longo de uma silhueta e numa região, ondulação de contorno, continuidade de realce (pontos isolados), degraus entre vizinhos, radiância média por máscara
- [ ] T006 [P] Criar os smokes vazios `src/__smokes__/rayScene.ts`, `sky.ts`, `globalIllumination.ts`, `fluidField.ts`, `fog.ts` e `src/__smokes__/support/giScenes.ts` (Cornell box, cômodo com janela, caixa fechada de paredes finas, ambiente branco fechado, canto côncavo), registrados no runner (`bench/runner/smoke.ts`) e listados em `src/__smokes__/README.md`

---

## Phase 2: Foundational — estrutura de raios (bloqueia todas as histórias)

**Purpose**: BVH de dois níveis na GPU, híbrida, e o contrato `ray_scene` (R1, A1–A9).

### Testes

- [x] T007 [P] `src/elements/raytrace/RayScene.test.ts`: descritores e estados (`pending` → `built` → `refit` | `rebuild`), uma BLAS por chave de conteúdo (A2), refit só quando a geometria marca `produced('vertices')`, rebuild com topologia nova, TLAS por quadro com instâncias, esferas para corpos de partículas sem `FluidSurfaceMaterial`, recursos declarados do módulo `ray_scene`
- [x] T008 [P] Testes da marcação `produced('vertices')` em `src/elements/geometry/SurfaceFlow.test.ts`, `src/scene/graph/GraphFlow.test.ts` e `src/elements/physics/flows/SoftSurfaceFlow.test.ts` (marca no quadro em que escreve; nada muda no desenho)

### Implementação

- [x] T009 Marcar `produced('vertices')` nos estágios que escrevem geometria na GPU (A3): `src/elements/geometry/SurfaceFlow.ts`, `src/scene/graph/GraphFlow.ts`, `src/elements/physics/flows/SoftSurfaceFlow.ts`, `EmitterFlow`/`DiffuseFlow` das nuvens de pontos
- [x] T010 [P] WGSL de construção em `src/elements/gpu/wgsl/raytrace/`: `ray_gather.wgsl` (cópia de triângulos para o buffer único de primitivas em espaço de objeto, u16 lidos aos pares, contagem do registro indireto, A1/A4/A9; esferas das partículas por `pos` e raio do material, A7), `ray_bounds.wgsl` (caixa por primitiva e caixa da geometria por redução), `ray_morton.wgsl`, `ray_lbvh.wgsl` (hierarquia de Karras), `ray_refit.wgsl` (caixas de baixo para cima com contadores atômicos), `ray_tlas.wgsl` (caixas de mundo das instâncias pelo pool `WorldTransform` e o registro `Renderable`, A5)
- [ ] T011 [P] `src/elements/gpu/wgsl/raytrace/ray_scene.wgsl`: `RayHit`, `BvhNode`, `RayInstance`, travessia de dois níveis com pilha de 32, `ray_scene_hit`, `ray_scene_occluded`; o ramo de instâncias de volume chama os pontos `ray_volume_hit`/`ray_volume_transmittance` (preenchidos por contribuição na US7 e na US8; sem contribuição, a caixa é ignorada)
- [x] T012 `src/elements/raytrace/RayScene.ts` (Resource gerado da cena, buffers de nós, primitivas, instâncias, contadores) e `src/elements/raytrace/shaders.ts` (módulos e recursos declarados)
- [x] T013 `src/elements/raytrace/RaySceneFlow.ts`: por geometria, gather → bounds → Morton → `RadixSort` (A6) → LBVH → caixas na primeira vez e na topologia nova; refit nos quadros com `produced('vertices')`; TLAS por LBVH a cada quadro; entradas e saídas de entidade por evento; despacho linear (`invocations` com `WORKGROUP_SIZE`)
- [x] T014 Limites do dispositivo (R10) em `RaySceneFlow`: conferir tamanho de binding e buffers por estágio; sem limites, evento `globalIlluminationUnsupported { reason }` uma vez em `src/scene/events/EventMap.ts`
- [x] T015 Exportar `RayScene` e o módulo `ray_scene` em `src/index.ts`
- [ ] T016 Smoke `src/__smokes__/rayScene.ts`: estágio de teste que consulta raios em cenas de esferas, caixas e superfícies paramétricas conhecidas e compara ponto e normal com a interseção analítica (≤ 1 % do tamanho, SC-009); superfície animada (refit) segue a forma no mesmo quadro; geometria de grafo e corpo mole (só GPU) atingida sem leitura de volta; 1 milhão de triângulos: tempos de build, refit (≤ 1 ms) e TLAS de 10 mil instâncias (≤ 0,3 ms) no relatório

**Checkpoint**: estrutura de raios consultável por qualquer estágio.

**Decisões da implementação (Fase 2)**: os dados vivem em pools da C2 (crescem por realocação, os consumidores são
religados); folhas de 8 triângulos consecutivos em ordem de Morton (os triângulos são reordenados na construção) — um
oitavo dos nós, reajuste de 1 milhão de triângulos em ~0,9 ms; caixas do reajuste por um temporário atômico (a escrita
comum de outro grupo não é vista no Metal); caixa do conjunto reduzida no grupo de trabalho; hierarquia de cima com
chaves de 24 bits, topologia nova quando o conjunto muda e a cada 8 quadros (nos outros, só as caixas: 10 mil instâncias
em ~0,25 ms de média); ordenação radix e soma de prefixos gravam num passe já aberto (dois passes por quadro em vez de
dezenas). Medidas no smoke `rayScene`.

---

## Phase 3: User Story 2 — Céu físico como fonte de luz (P1)

**Goal**: atmosfera de Hillaire ligada ao sol, fundo da cena, transmitância do sol (R4).

**Independent Test**: varrer a altura do sol e comparar céu e sol com a referência de CPU; a cena muda de cor ao longo do dia.

### Testes

- [x] T017 [P] [US2] `src/elements/scene/Sky.test.ts`: validação, ligação à `DirectionalLight`, tabelas regeneradas só por mudança de parâmetro ou movimento do sol acima do limiar, contribuição a `light_transmission` só para a luz do sol, sem recompilar ao mudar valores

### Implementação

- [x] T018 [P] [US2] WGSL em `src/elements/gpu/wgsl/sky/`: `sky_transmittance.wgsl` (256×64), `sky_multiscatter.wgsl` (32×32), `sky_view.wgsl` (192×108 por latitude-longitude), `sky.wgsl` (`sky_radiance`, `sky_sun_transmittance`)
- [x] T019 [US2] `src/elements/scene/Sky.ts` (+ schema) e `src/elements/scene/SkyFlow.ts`: tabelas `rgba16float` em compute por transição; uniform do sol
- [x] T020 [US2] `src/elements/scene/points/skyContribution.ts`: contribuição do `Sky` ao ponto `light_transmission` (cor física do sol pela atmosfera)
- [x] T021 [US2] Céu como fundo pelo ponto de cena `scene_background`: o `ForwardFlow` desenha um triângulo no plano distante depois dos opacos no mesmo passe (MSAA incluído), só quando há contribuinte (`forward_background.wgsl`); sem `Sky`, o fundo e o hemisfério da 011 seguem iguais. Também o ponto `scene_environment` (raios que escapam)
- [x] T022 [US2] Exportar `Sky` em `src/index.ts`
- [x] T023 [US2] Smoke `src/__smokes__/sky.ts`: sol a 60° com radiância em direções de amostra a ≤ 5 % da referência (SC-003); varredura até o horizonte com razão vermelho/azul monótona e intensidade caindo; mudar a direção do sol atualiza no mesmo quadro sem recompilar; cena sem `Sky` igual à 011; vídeo do céu ao longo do dia

**Checkpoint**: céu físico como fonte e fundo.

**Decisões (US2)**: as integrações da atmosfera (GPU e referência de CPU) usam passos quadráticos com amostra no meio
do passo — a camada de aerossóis fica no primeiro quilômetro; com passos uniformes o erro passava de 10 %. Abaixo do
horizonte, o chão do planeta iluminado pelo sol. O disco do sol é limitado a 60 000 nits (alvo meio-float). Smoke `sky`:
erro máx 1,8 % (médio 0,5 %) contra a referência.

---

## Phase 4: User Story 1 — Luz que rebate na cena (P1) 🎯

**Goal**: sondas DDGI com acertos sombreados pelas funções `material`, coleta final na tela (R2 adendo), contribuição `closure_indirect`, hemisfério retirado por evento (R2, R3, R6, R7).

**Independent Test**: Cornell box contra o traçador de caminhos da CPU, região por região.

### Testes

- [x] T024 [P] [US1] `src/elements/lighting/GlobalIllumination.test.ts`: validação (`bounces` 1–8, `raysPerProbe` em {32, 64, 128, 256}, `probeFraction` em (0, 1], `hysteresis` em [0,8; 0,995]), qualidades `low`/`medium`/`high`, mudança de valores sem recompilar, contribuição ao `scene_lighting`, `HemisphereLight` retirado na inserção e devolvido na remoção (evento)
- [x] T025 [P] [US1] Teste da composição de funções de ponto num kernel (C2) em `src/scene/shaders/` (vizinho do `WgslPoint.test.ts`): várias funções por entidade compostas com sufixo de hash e escolhidas pelo slot do registro; funções só de fragmento caem no recuo documentado
- [x] T026 [P] [US1] Teste de `closure_indirect` na referência de CPU `src/elements/material/reference/closure.ts`: com irradiância do hemisfério reproduz `closure_ambient` (caso particular)

### Implementação

- [x] T027 [US1] C2: composição genérica das funções de um ponto por entidade num kernel de compute (como `src/elements/extension/combineFields.ts`), em `src/scene/shaders/WgslPoint.ts` ou vizinho; seleção pelo slot do registro `Renderable`
- [x] T028 [US1] `src/elements/material/point/shaders.ts`: as funções `material` da cena compostas no kernel de acertos (R3); sem função, o fechamento pronto das constantes; entradas de derivada de tela sem valor no compute
- [x] T029 [US1] `closure_indirect(c, n, v, irradiance, specular)` em `src/elements/gpu/wgsl/math/closure_eval.wgsl`; `closure_ambient` passa a chamá-la
- [x] T030 [P] [US1] WGSL em `src/elements/gpu/wgsl/gi/`: `gi_probe_rays.wgsl` (direções esféricas giradas por quadro), `gi_probe_hits.wgsl` (acerto → material → luz direta amostrada pela potência com raio de sombra + céu + irradiância das sondas do quadro anterior; raios que escapam leem o céu), `gi_probe_blend.wgsl` (irradiância e visibilidade octaédricas com bordas), `gi_probe_classify.wgsl` (dentro da geometria: desligada; relocação para fora), `gi_sample.wgsl` (8 sondas da célula, trilinear × Chebyshev × voltada para a normal, cascatas)
- [x] T031 [US1] `src/elements/lighting/GlobalIllumination.ts` (+ schema) e `src/elements/lighting/ProbeFlow.ts`: 3 cascatas de 16×8×16 centradas na câmera (R6), fração de sondas por quadro, raios por sonda, rebatimentos pelo quadro anterior; amostragem das 1024 luzes pela potência sem custo linear
- [x] T032 [US1] `src/elements/scene/points/giContribution.ts`: contribuição ao `scene_lighting` com `closure_indirect` (irradiância interpolada e radiância especular na direção refletida alargada pela rugosidade)
- [x] T033 [US1] Retirada do hemisfério por evento nos estágios padrão (`src/presentation/flows/defaults.ts`): `GlobalIllumination` inserida → `HemisphereLight` retirado; removida → devolvido
- [x] T034 [US1] Exportar `GlobalIllumination` em `src/index.ts`
- [x] T071 [US1] C2: `canvasDivisor` em `src/scene/descriptors/TextureShape.ts` e na alocação do `ResourceSystem` (textura com uma fração do tamanho do canvas, recriada quando ele muda), com teste
- [x] T072 [P] [US1] WGSL da coleta final na tela em `src/elements/gpu/wgsl/gi/`: `gi_screen_place.wgsl` (raio de câmera pelo centro do ladrilho → posição, normal, profundidade), `gi_screen_trace.wgsl` (raios por cosseno; acerto → material, luz direta com raio de sombra, emissão e rebatimento anterior das sondas do mundo), `gi_screen_resolve.wgsl` (E na normal da sonda; acúmulo reprojetado pela vista-projeção anterior com teste de plano e normal) e `gi_screen_sample.wgsl` (o ponto projetado, as sondas de tela vizinhas pesadas por plano e normal, recuo às sondas do mundo) — R2 adendo
- [x] T073 [US1] `GlobalIllumination` (texturas das sondas de tela, parâmetros da tela no uniform) e `ProbeFlow` (slot das matrizes das câmeras, histórico privado, os kernels da tela no passe); contribuição ao `scene_lighting` com a irradiância da tela
- [x] T035 [US1] Smoke `src/__smokes__/globalIllumination.ts` parte a: Cornell box com radiância média por região a ≤ 10 % do traçador com o mesmo número de rebatimentos (SC-001); tingimento vermelho perto da parede (razão vermelho/verde como na referência); cômodo com janela sem paredes pretas e energia como na referência; canto côncavo contra superfície aberta na proporção da referência; nenhuma superfície mais escura que só com a luz direta; ambiente branco fechado contra a série analítica (≤ 5 %, SC-002); emissivo ilumina o cômodo; cena sem luz nem céu não ganha energia; vídeos da Cornell box e do cômodo com o sol ao longo do dia

**Notas da implementação (US1)**:

- Coleta final na tela (R2 adendo, aprovada pelo usuário): as sondas do mundo sozinhas não fechavam a Cornell em 10 %
  (a luz de perto). As sondas de tela (ladrilho de 4 px a 1080 linhas, dobrando com a altura) dão o primeiro rebatimento
  exato; os seguintes vêm, nos acertos que são superfícies visíveis, das próprias sondas de tela do quadro anterior (uma
  geração por rebatimento, o total exato) e, fora da tela, das sondas do mundo. Fora de todas as cascatas, as sondas da
  borda da última (nunca zero).
- C2: `canvasDivisor` na forma da textura; `ensurePool(schema)` (o pool das luzes existe numa cena só com emissores ou
  só com o céu); evento `globalIlluminationReady` (os kernels da composição atual prontos — quem mede espera por ele).
- A composição das funções `material` nos acertos atribui em cada caso e retorna uma vez depois do `switch`: o retorno
  do fechamento de dentro dos casos, com invocações em casos diferentes, saía errado no Metal (a emissão sumia).
- A contribuição ao `scene_lighting` ficou em `src/elements/lighting/points.ts` (o Resource dono), não em
  `scene/points/giContribution.ts`.
- Smoke: a referência (gabarito independente, na CPU) roda em workers; as medidas em 640×480 e em 4K; as regiões só no
  interior das faces (sem as arestas entre faces, como já era entre objetos). Resultados: Cornell ≤ 2,4 % (4K ≤ 0,8 %),
  painel emissor ≤ 3,3 %, cômodo com janela ≤ 9,2 % (canto côncavo 0,741 × 0,758), chão sob o céu 0,7 %, ambiente branco
  a 0,4 % da série, sem fonte nada somado; o tingimento como na referência.
- Achados para depois: um pixel do ambiente branco desvia 75 % (mancha num canto; US4) e a luz direta do mapa de sombra
  vaza nas emendas das placas com o sol baixo (sombra, não iluminação global).

**Checkpoint**: luz rebatida física com as sondas.

---

## Phase 5: User Story 4 — Estável no tempo, sem vazamento (P1)

**Goal**: acúmulo no espaço das sondas com histerese adaptativa; visibilidade contra o vazamento (R5, R6).

**Independent Test**: variância temporal parada e com câmera andando; luz dentro de uma caixa fechada sob sol forte.

- [x] T036 [P] [US4] Teste da histerese adaptativa em `src/elements/lighting/ProbeFlow.test.ts` (limiar de mudança reduz a histerese; volta ao padrão quando estabiliza)
- [x] T037 [US4] Histerese adaptativa por sonda em `gi_probe_blend.wgsl` e estado de mudança no buffer das sondas (`ProbeState`)
- [x] T038 [US4] Espessura mínima de parede e viés de normal/visão da amostragem em `gi_sample.wgsl`, documentados no Resource
- [x] T039 [US4] Smoke `globalIllumination.ts` parte b: convergência em ≤ 2 s com média a ≤ 2 % do convergido (SC-005); variância temporal com câmera andando abaixo do limiar documentado; caixa fechada de paredes finas com luz interna ≤ 1 % da externa (SC-004); luz que acende responde em ≤ 0,25 s sem rastro (SC-006)

**Notas da implementação (US4)**:

- Histerese adaptativa (`gi_response`, referência `reference/response.ts` + teste — o teste ficou ao lado da referência,
  não em `ProbeFlow.test.ts`): duas médias da luminância por sonda (rápida e lenta) e o ruído relativo à rápida; a
  diferença acima de 3 desvios + 5 % é mudança — histerese de resposta 0,3 e a contagem recomeça. Vale para as sondas do
  mundo (estado no `ProbeState`, a histerese da sonda inteira, no lugar do limiar por texel que disparava com o ruído) e
  para as de tela (estado no histórico).
- Sondas de tela: histórico interpolado nas 2 × 2 sondas anteriores em volta da projeção (o ponto exato com a câmera
  andando) e filtro espacial 3 × 3 para o desenho com força pelo ruído estimado (a convergida fica como está).
- Medido: em 2 s a 0,53 % do convergido, variação entre quadros parados 0,48 %; cintilação da luz indireta com a câmera
  andando ≤ 1,2 % (a segunda diferença temporal, documentada: ≤ 2 %); caixa fechada de paredes de 5 cm sob sol forte e
  céu: dentro a 0,079 % da luz de fora; o sol que acende: 98 % em 0,25 s, 99,7 % em 1 s.

---

## Phase 6: User Story 3 — Geometria viva e cenas grandes (P1)

**Goal**: geometria escrita na GPU participa (refit), sem leitura de volta; 1 milhão de triângulos no orçamento.

**Independent Test**: superfície deformando ao lado de uma parede; a luz indireta muda junto.

- [x] T040 [US3] Smoke `globalIllumination.ts` parte c: superfície paramétrica animada com a sombra indireta e o tingimento seguindo a forma em ≤ 0,25 s; corpo mole e geometria de grafo recebendo e rebatendo luz; contador de leituras de volta zero por quadro (SC-007); vídeo da geometria viva
- [x] T041 [US3] Cena de bench `bench/scenes/global-illumination/` (1 milhão de triângulos, sol, céu, GI `medium`, superfície animada) com o tempo de GPU da GI separado (build, refit, TLAS, sondas) — alvo ≤ 4 ms a 1280×720 (R9, SC-010)

**Notas da implementação (US3)**:

- Smoke parte c: a cortina paramétrica (escrita na GPU) muda de lugar e de forma — o tingimento no chão chega ao lugar
  novo e some do velho em 0,25 s (≥ 95 % do caminho; medido 97 %); o pano XPBD e o terreno de grafo rebatem a cor deles
  na parede e recebem luz rebatida; zero leituras de volta do motor nos quadros (contadas na `core.readback`). As faces
  de trás das listas de triângulos não são desenhadas nem rebatem (como no desenho): a cortina tem a face da frente
  virada para o sol.
- Orçamento (SC-010): cena do bench `global-illumination` (onda de 1 milhão de triângulos animada, sol, céu; `off` e
  `medium`). O custo começou em ~20 ms (bench) e caiu para ~3 ms: o desenho lê só as sondas de tela (as do mundo só sem
  nenhuma sonda de tela válida em volta; a mais próxima para quem não vira pixel — encobertos e auxiliares do quad, que
  pagavam a leitura cara); a especular das sondas do mundo só nos lobos brilhantes (rugosidade < 0,5); os raios das
  sondas de tela uma invocação por raio com a soma no grupo; o acúmulo das sondas do mundo num passo pelos raios; a
  qualidade média com 64 raios por sonda do mundo, 1/8 delas por quadro, 8 raios por sonda de tela e metade delas por
  quadro (rodízio em xadrez, as outras herdam o histórico reprojetado). Bench: `off` 1,29 ms, `medium` 4,44 ms.
- O tempo por passe distorce neste hardware (a apresentação espelha o desenho): a medida é o total do quadro
  (`profiling: 'frame'`) e o bench; o detalhamento da GI no bench é a diferença entre as variantes.
- Resposta: o valor acompanhado é o maior canal (uma mudança de cor aparece nele); depois de uma mudança, 3 quadros com a
  histerese de resposta antes de a contagem seguir (os rebatimentos encadeados atrasam um quadro por geração); limiar
  2,5 desvios.

---

## Phase 7: User Story 7 — Fluidos como superfície contínua por campo de distância (P1)

**Goal**: grade esparsa de blocos, núcleos anisotrópicos, redistanciamento, marcha tricúbica; a mesma superfície para câmera, luz, cáusticas e raios (R11, R1 adendo). Substitui a reconstrução na tela da 017.

**Independent Test**: o tanque do bench de perto e de longe; continuidade da silhueta, da normal, da sombra e das cáusticas no fundo.

### Testes

- [x] T042 [P] [US7] `src/elements/fields/FluidField.test.ts`: o campo é criado para corpos com `FluidSurfaceMaterial` (sem mudança de autoria), blocos 8³ com voxel de ½ espaçamento, transições por quadro, volume na TLAS, contribuições a `ray_volume_hit`
- [x] T043 [P] [US7] Referência de CPU `src/elements/fields/reference/field.ts` (+ teste): núcleo anisotrópico de Yu & Turk, redistanciamento, B-spline tricúbica, marcha com secante; gotas separadas não fundem; plano fica plano

### Implementação

- [x] T044 [P] [US7] WGSL em `src/elements/gpu/wgsl/fields/`: `field_bricks.wgsl` (hash dos blocos ocupados + `Compaction`), `field_covariance.wgsl` (covariância dos vizinhos), `field_density.wgsl` (núcleos anisotrópicos), `field_redistance.wgsl` (faixa estreita, |∇φ| ≈ 1), `fields.wgsl` (`field_sample` tricúbica, `field_normal`, marcha com secante)
- [x] T045 [US7] `src/elements/fields/FluidField.ts` e `src/elements/fields/FluidFieldFlow.ts`: construção por quadro depois da física; contagem só na GPU; despacho indireto
- [x] T046 [US7] Contribuição do campo ao ponto `ray_volume_hit` (instância de volume na TLAS) em `src/elements/fields/points/fieldRayContribution.ts`
- [x] T047 [US7] `src/presentation/flows/FluidFieldPassFlow.ts`: superfície desenhada por marcha com o material da água da 011 (refração, absorção, reflexo) e profundidade escrita; substitui a reconstrução na tela de `src/presentation/flows/FluidSurfaceFlow.ts` (removida com o que só ela usa)
- [x] T048 [US7] Vista da luz pelo campo: sombra e cobertura da água no fundo pela marcha a partir da luz; a malha de cáusticas da 011 (`WaterFlow`) refrata na superfície do campo (`field_normal`)
- [x] T049 [US7] Smoke `src/__smokes__/fluidField.ts`: de perto (partícula ≥ 20 px) sem ondulação na escala das partículas na silhueta e na normal acima do limiar (sem semicírculos nem favo de mel); realce da borda contínuo; volume a ±5 % das partículas em movimento; resolução dobrada igualmente lisa; sombra e borda das cáusticas no fundo contínuas, padrão refratado sem blocos (SC-013); raios atingem a superfície com erro ≤ ½ espaçamento; gotas separadas; fluido encostando no sólido; tempos (campo ≤ 1,5 ms com 64 mil, marcha ≤ 1 ms)
- [x] T050 [US7] `particles/64k-water` do bench lado a lado com a versão da 017 (capturas e vídeo de perto e de longe) e números do `bench:check`

**Notas da implementação (US7)**:

- Campo na GPU por quadro (`FluidField` + `FluidFieldFlow`): junção das partículas, grade hash (célula = raio do núcleo),
  cópia na ordem das células, núcleos de Yu & Turk (somas dos vizinhos em ponto fixo inteiro: o campo sai idêntico bit a
  bit apesar da ordem variável dos vizinhos), marcação dos blocos 8³ (voxel ½ espaçamento) com deduplicação no grupo e
  uma tabela de superblocos 4³, densidade por espalhamento em ponto fixo, filtro binomial 3³ separável (zera a ondulação
  de 2 voxels), φ₀ e a distância pelo método rápido da eikonal (Jacobi, interface de Chopp, 6 iterações: |∇φ| entre
  0,97 e 1,0 em ±4 voxels — o Sussman de 16–32 iterações saía pior e 4× mais caro), borda de 2 voxels.
- Parâmetros ajustados com a referência: λ = 0,5 (0,9 encolhia a superfície; menor também fica mais plano),
  N_ε = 8 (com raio de 2 espaçamentos a vizinhança cheia tem ~33: o 25 de Yu & Turk punha a superfície toda no núcleo
  isotrópico), nível 0,42. O volume conserva por realimentação na GPU: o volume do campo somado no quadro corrige o nível
  do seguinte para igualar N·espaçamento³ (agitada, a superfície perdia ~11 %) — a ±4,5 % em movimento.
- O que as consultas leem fica num buffer só (`FluidField.data`): a GI usava 7 dos 10 buffers de storage por estágio.
  O pipeline padrão de superfície da 017 (esferas + suavização) saiu: `FluidFieldPassFlow` marcha câmera e luz e escreve
  profundidade, material e normal (a espessura em w — o composto com GI estourava 16 texturas); composição e cáusticas
  usam a normal do campo; a vista da luz se enquadra pela caixa do campo.
- T046: no lugar de uma instância de volume na TLAS, os pontos de cena `ray_volume_hit` (cruzamento, normal, material) e
  `ray_volume_transmittance` (absorção pelos trechos dentro da água) com a contribuição do `FluidField` (só com fluido),
  já usados pelos raios das sondas e da tela da GI; a caixa do campo faz o corte que a instância faria. A C2 passou a
  realocar descritores próprios que mudam de forma no `redescribe` (antes só os de pool: a estrutura de raios também
  dependia disso) e os buffers indiretos aceitam o tamanho do schema (`SetCount`).
- Smoke `fluidField` (limiares documentados no cabeçalho): campo = referência de CPU (p95 0,15 voxel), gotas separadas,
  raios e profundidade da câmera a ≤ 0,15 espaçamento, silhueta de perto 0,003 p (a 017 dá 0,018 p; limiar 0,008),
  favo de mel na normal 0,002, realce contínuo, volume ±4,5 %, borda das cáusticas 0,006 p, contato com a caixa 100 %,
  e a água (campo + marchas + composição + cáusticas − sprites) 2,3 ms a 64 mil. No Apple o perfil por passo não
  atualiza (só a primeira leitura resolve): os tempos são pela diferença do tempo por quadro.
- Bench `particles/64k-water`: GPU 15,6 → 16–17 ms (a água custa ~2,2 ms acima dos sprites; a 017 custava 1,8); o p95 do
  quadro passa a cruzar o vsync de 60 Hz em parte dos quadros (a 017 já estava a 1 ms dele). `4k-water` 3,11 → 2,94 ms.
  Vídeo lado a lado 017 × campo enviado. O smoke da 017 foi regravado (água determinística); a caixa submersa passa a
  medir o padrão das cáusticas na face e os sprites o vermelho dominante (1,8×, a iluminação da 011); "cáusticas
  agitadas ≥ 1,3×" segue falhando como na base (1,29×; a base dava 1,26×).

---

## Phase 8: User Story 5 — Cáusticas de todas as superfícies (P2)

**Goal**: fótons das fontes pelos caminhos especulares até a primeira difusa, num hash espacial com acúmulo (R2, R5).

**Independent Test**: foco da esfera de vidro contra a óptica; cardioide do anel.

- [x] T051 [P] [US5] Teste de `src/elements/lighting/PhotonFlow.test.ts`: fótons distribuídos pela potência das fontes, orçamento por qualidade, hash com acúmulo, sem duplicar a água da 011
- [x] T052 [P] [US5] WGSL em `src/elements/gpu/wgsl/gi/`: `gi_photon_emit.wgsl`, `gi_photon_trace.wgsl` (especular e transmissivo pelo fechamento, volumes de campo e meios atravessados), `gi_photon_hash.wgsl` (depósito em ponto fixo, acúmulo temporal), `gi_caustics.wgsl` (leitura na contribuição)
- [x] T053 [US5] `src/elements/lighting/PhotonFlow.ts` e as cáusticas somadas em `giContribution.ts`; as cáusticas da água da 011 passam pelo mesmo mecanismo quando há GI (sem duplicar)
- [x] T054 [US5] Smoke `globalIllumination.ts` parte d: esfera de vidro (IOR 1,5) com foco na distância focal a ≤ 10 % e mais claro que o chão (SC-008); anel metálico com a cardioide; cáusticas da água sem luz duplicada; vídeo das cáusticas
      Feito no `ProbeFlow` (passe `ProbeFlow.photons`; o teste em `src/elements/lighting/__tests__/PhotonFlow.test.ts`) e
      em `gi_photon_common/trace/resolve.wgsl` + `gi_photon.wgsl` (leitura trilinear em `gi_scene_lighting`). Os fótons das
      direcionais saem só sobre a projeção das caixas das instâncias que fazem cáustica (kernel `gi_photon_targets_main`
      avaliando o material composto no centro de cada uma: vidro ou metal liso), escolhidas pela área, a potência dividida
      onde as projeções se sobrepõem; depósito trilinear em ponto fixo (1/2048) num hash de 2¹⁹ baldes, média móvel 0,95.
      Com os fótons ligados a coleta (sondas do mundo e de tela) não lê o especular direto de vidro e metal liso: era o
      mesmo caminho luz → especular → difusa achado por sorte (vaga-lumes) e contado duas vezes. Na água o fóton para (as
      cáusticas dela seguem pela vista da luz). Smoke: foco a 0,9–1,0 f, 7,4× o chão aceso; cúspide do anel em (0,235; 0)
      com R/2 = 0,20, medida no hash; água com/sem fótons 0,194/0,194. Vídeo enviado.

---

## Phase 9: User Story 8 — Névoa e meios volumétricos (P2)

**Goal**: `FogVolume` com froxels iluminados pela luz direta, céu e rebatida; transmitância nos raios (R12).

**Independent Test**: névoa homogênea contra Beer-Lambert; feixe contra o traçador com meio participante.

- [ ] T055 [P] [US8] `src/elements/media/FogVolume.test.ts`: validação (forma caixa/esfera, densidade constante, por campo ou por grafo, albedo, anisotropia, emissão), contribuição a `ray_volume_transmittance`, sem recompilar ao mudar valores
- [ ] T056 [P] [US8] WGSL em `src/elements/gpu/wgsl/media/`: `media_density.wgsl` (constante, campo, função/nó de ponto), `media_froxel_inject.wgsl` (160×90×128 com fatias exponenciais e jitter; luz direta com sombra e estrutura de raios, céu, sondas), `media_froxel_integrate.wgsl` (frente para trás, acúmulo reprojetado), `media.wgsl` (`medium_transmittance`, leitura tricúbica)
- [ ] T057 [US8] `src/elements/media/FogVolume.ts` (+ schema) e `src/elements/media/FroxelFlow.ts`
- [ ] T058 [US8] Composição da névoa no desenho (opacos, transmissivos e a superfície do campo; névoa atrás do vidro refratada) em `src/presentation/flows/` e transmitância nos raios das sondas e dos fótons
- [ ] T059 [US8] Exportar `FogVolume` em `src/index.ts`
- [ ] T060 [US8] Smoke `src/__smokes__/fog.ts`: Beer-Lambert a ≤ 3 %; feixe pela janela a ≤ 10 % do traçador com meio e fora do feixe mais escuro; névoa clareia perto de paredes iluminadas com GI; densidade por ruído sem degraus acima do limiar; câmera andando sem cintilação acima do limiar; névoa opaca sem banda (SC-014); vídeo da névoa com feixes de sol

---

## Phase 10: User Story 6 — Raios para outros usos (P2)

- [ ] T061 [US6] Estágio de teste do contrato em `src/__smokes__/rayScene.ts` parte b: consulta sem conhecer a origem da geometria (malha, superfície, grafo, campo) pelo mesmo `ray_scene_hit`; contrato aberto ao raio curvo documentado
- [ ] T062 [P] [US6] Guia `clay-engine-doc/docs/guides/raytracing.md`: `RayScene`, `ray_scene_hit`/`ray_scene_occluded`, volumes, custo, limites, uso pelo débito R1 da 011

---

## Phase 11: Fixtures

- [ ] T063 Regravar as fixtures que mudam com o campo de distância (`fluidSurface-*`, `particles-*` com água, `parametricSurfaces-lake`) em `src/__smokes__/fixtures/`, com a lista, a justificativa e a montagem antes/depois em `specs/033-global-illumination/fixtures.md`; conferir que as demais e as de estado ficam bit a bit (SC-011)

---

## Phase 12: Docs

- [ ] T064 [P] Guia `clay-engine-doc/docs/guides/global_illumination.md` (céu, GI, qualidade, orçamento, névoa, fluidos por campo, limites, espessura mínima)
- [ ] T065 [P] Arquitetura (ordem dos passes: raios, céu, campos, sondas, fótons, froxels, desenho) em `clay-engine-doc/docs/guides/flows.md` e `shaders.md`
- [ ] T066 [P] `specs/ROADMAP.md` (033 implementada; débito R1 da 011 em seguida) e `specs/PENDENCIAS.md`

---

## Phase 13: Fechamento

- [ ] T067 Todos os smokes `--headless` no fonte e com `--dist`; conferir que não ficou Chrome/crashpad órfão do runner
- [ ] T068 `npm run bench:check` sem regressão relevante nas cenas sem GI; baseline regravado; tempos da GI registrados em `baseline-check.md`
- [ ] T069 `npm run ci` verde
- [ ] T070 Vídeos enviados ao usuário (água por campo de perto e de longe, névoa com feixes, Cornell box, cômodo ao longo do dia, geometria viva, cáusticas) (SC-012)

---

## Dependencies

- Fase 1 → Fase 2 (estrutura de raios) → todas as histórias.
- US2 (céu) antes da US1 (os raios que escapam leem o céu).
- US1 → US4 (estabilidade) e US3 (geometria viva) e US5 (cáusticas usam o fechamento composto da US1).
- US7 depende só da Fase 2 (volume na TLAS); a US5 usa a superfície do campo para as cáusticas da água; a US8 usa a US1 (sondas) e o ramo de volumes.
- US6 depois das demais (o contrato completo, com volumes).
- Fixtures → Docs → Fechamento.

## Parallel Example

```text
Fase 1: T002, T003, T004, T005, T006 juntos.
Fase 2: T007, T008, T010, T011 juntos; depois T012 → T013.
US1: T024, T025, T026, T030 juntos; T027 → T028.
US7: T042, T043, T044 juntos.
Docs: T064, T065, T066 juntos.
```

## Implementation Strategy

Entrega completa, todas as fases na ordem das dependências: nada é dado por pronto até todas as histórias, as fixtures,
a documentação, os smokes (fonte e `--dist`), o `bench:check` e o `npm run ci` estarem verdes e os vídeos enviados.
Commits por tarefa ou grupo coerente na branch `feature/033-global-illumination`.
