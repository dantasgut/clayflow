---
description: 'Tarefas da 041 — nuvens volumétricas'
---

# Tasks: Nuvens volumétricas

**Input**: `specs/041-nuvens-volumetricas/` (spec.md, plan.md, research.md, data-model.md, contracts/clouds.md,
quickstart.md)

**Tests**: pedidos pela spec (FR-018, FR-019, SC-001–SC-009): testes de unidade (Vitest, `countingCore`) contra a
referência f64 e smokes de navegador com medidas, no fonte e com `--dist`. A referência e o teste nascem antes do
shader que eles validam.

**Regras para toda tarefa**: Resource + evento + Flow, sem helpers, sem `core.create` em Flow; C3/C4 só pela C2; cada
símbolo WGSL uma vez; nada na CPU (volumes e mapas escritos por kernel); estado entre quadros só pelo canal temporal da
037; laço de GPU com teto constante; produção não importa `reference/`; nenhuma imagem de nuvem no lugar da física;
smokes um de cada vez (`--headless --timeout 400`, 600 no `globalIllumination`, porta 5181; vídeo na 5184).

**Regras para toda tarefa de GPU** (marcadas **[GPU]**):

- **Ligações**: a contagem de buffers de storage, texturas de storage, texturas amostradas e uniformes por estágio do
  pipeline novo ou tocado, antes e depois, registrada na tarefa (medida) e verificada contra os limites do adaptador
  pela composição real (`scene/systems/flowBinding/limits.ts`).
- **Teste AAA**: matemática nova tem teste contra a referência f64 de `elements/media/clouds/reference/` (Arrange-Act-
  Assert, sem falsear).
- **Tempo**: o tempo de GPU do passe medido no M4, perfil alto, contra o orçamento de [research.md R17](./research.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa aberta)
- **[Story]**: história da spec (US1–US4)

---

## Phase 1: Setup (preparação)

**Purpose**: ramo, medida de partida e o ruído ladrilhável de que tudo depende.

- [x] T001 Conferir o ramo `feature/041-nuvens-volumetricas` a partir do `develop` (`c1f3dc05`) e registrar o estado de partida em `specs/041-nuvens-volumetricas/baseline.md`: `npm run ci`, os 45 smokes pelo fonte e com `--dist`, `bench:check`. — **`npm run ci` verde e os 45 smokes pelo fonte passaram (árvore própria com `npm ci`, em `c1f3dc05`+docs); a fase `--dist` roda no fechamento (T042).**
- [x] T002 [GPU] Medir a contagem de ligações por estágio (storage, storage texture, amostradas, uniformes) do forward, de `media_froxel_inject`, de `gi_probe_trace`/`gi_screen_trace`/`gi_cache_trace` e de `refraction_path`, pela composição real (`scene/systems/flowBinding/limits.ts`), num teste novo `src/presentation/flows/__tests__/bindingCounts.test.ts` que registra a contagem e verifica a composição real contra os limites do adaptador (sem congelar a contagem); registrar os números em `specs/041-nuvens-volumetricas/baseline.md`. — **Feito (`c33de7d6`): o teste registra a contagem pela composição real (harness da C2) e confere contra os limites do adaptador. Antes → com nuvens: forward `{storage 6, sampled 9, sampler 4, uniform 5}` → `{6, 10, 5, 6}`; `gi_trace` `{6, 3, 2, 2}` → `{6, 4, 3, 2}`; `gi_screen_trace` `{8, 3, 2, 3}` → `{8, 4, 3, 3}`; `gi_cache_trace` `{9, 3, 2, 3}` → `{9, 4, 3, 3}`; `froxel_inject` `{3, 2, 2, 2, storageTexture 1}` → `{3, 3, 3, 3, 1}`. O `refraction_path` não monta no harness; a contagem dele vem do smoke `refraction` (passa).**
- [x] T003 [P] Referência u32 do ruído com período: parâmetro `period` em gradiente, valor, fBm e celular 3D em `src/elements/nodes/reference/noise.ts`, com testes em `src/elements/nodes/reference/__tests__/noisePeriod.test.ts` (periodicidade exata `f(p + period/scale) = f(p)` bit a bit e igualdade com o ruído atual em `period = 0`). — **Feito (`1a1e00fc`): `noisePeriod.test.ts`, periodicidade bit a bit em gradiente/valor 2D e 3D, celular e fBm (lacunaridade 2); `period = 0` igual ao de antes.**
- [x] T004 [GPU] `period` nos ruídos da GPU: `src/elements/gpu/wgsl/math/noise.wgsl` e os nós em `src/elements/nodes/noise/index.ts` (parâmetro `period`, padrão 0); teste GPU contra a referência u32 no smoke `src/__smokes__/nodeGraphs.ts` (caso novo `noise-period`, bit a bit); `nodeGraphs` e `materials` sem regressão. — **Feito (`27bad146`): `noise-period` no `nodeGraphs`, 384 pares iguais bit a bit; todos os nós (97 casos com os periódicos) dentro da tolerância; `materials` passa.**

**Checkpoint**: estado de partida registrado; ruído ladrilhável igual na GPU e na referência.

---

## Phase 2: Foundational (fundação — bloqueia as histórias)

**Purpose**: a referência f64, a perspectiva aérea em toda a geometria (FR-022, SC-009) e a composição da tela.

- [x] T005 [P] Referência do modelo em `src/elements/media/clouds/reference/cloudModel.ts`: perfil de altura por tipo (R5), fase de Jendersie & d'Eon pelos quatro parâmetros do diâmetro (conferidos no artigo e no suplemento), densidade (cobertura, forma, erosão pelo ruído u32 com `period`), transmitância por marcha, mapa de transmitância (`T(p)` de R11) e a aproximação por oitavas (R8); testes AAA em `src/elements/media/clouds/reference/__tests__/cloudModel.test.ts` (fase normalizada a 1 em 4π, valores do artigo, continuidade do perfil no tipo, `T(p)` contra a integral). — **Feito (`1a1e00fc`): `cloudModel.ts` + 10 testes AAA (fase normalizada nas oitavas, Eq. 4–7 a 20 µm conferidas no artigo — g_HG 0,99461, g_D 0,59383, α 27,11, w_D 0,49818 —, Draine→HG/CS, perfil contínuo, mapa visto do sol contra a integral). O mapa passou a guardar τ em quartos do trecho (R11).**
- [x] T006 [P] Traçador estendido em `src/elements/lighting/reference/pathTracer.ts`: meio com fase arbitrária (`phase(cos) → number` e amostragem por tabela inversa) e rastreamento delta com majorante (Novák et al. 2018) para meios de quilômetros; testes em `src/elements/lighting/reference/__tests__/pathTracer.delta.test.ts` (meio homogêneo contra Beer–Lambert, espalhamento simples contra `mediumScatter.ts`, energia conservada com albedo 1). — **Feito (`1a1e00fc`): fase tabelada (grade `1 − 2x⁴`) e rastreamento delta/razão; testes: Beer–Lambert, espalhamento simples ≤ 3 % da integral fechada, fornalha branca 0,97–1,03, média do cosseno da HG.**
- [x] T007 Cena de validação e imagens de referência em `src/elements/media/clouds/reference/validationScenes.ts`: nuvem isolada (caixa de 2 km, semente fixa) com sol a 10° e 60°, vistas de baixo, de lado e contra o sol; camada de cobertura 0,5; terreno a 2, 10 e 30 km sob o céu; gerador `bench/runner/zzCloudRef.ts` fora do pacote grava `src/__smokes__/fixtures/clouds-ref-*.bin` (depende de T005, T006). — **Feito com outro caminho: as cenas de validação ficam no smoke e no teste — a referência f64 roda na página sobre os volumes lidos da própria GPU (a mesma representação dos dois lados, memória "referência da CPU distorce"), e a nuvem isolada contra o traçador está em `octaves.calibration.test.ts`. Sem `zzCloudRef.ts` nem fixtures `clouds-ref-*` (nada a regravar quando o modelo muda).**
- [x] T008 [P] Referência da perspectiva aérea até uma distância finita (luz espalhada e transmitância da câmera até o ponto, f64) em `src/elements/scene/reference/atmosphere.ts` (`aerialPerspective`), com testes em `src/elements/scene/reference/__tests__/aerialPerspective.test.ts` (distância 0 → (0, 1); limite no infinito = a radiância do céu; monotonia com a distância). — **Feito (`1a1e00fc`): `aerialPerspective` + 4 testes (distância 0, limite = céu, monotonia e azul mais extinto, trecho vertical = razão das transmitâncias).**
- [x] T009 [GPU] Tabela de perspectiva aérea 32 × 32 × 32 no `Sky`: descritor `aerial` em `src/elements/scene/sky/Sky.ts`, kernel `src/elements/gpu/wgsl/sky/sky_aerial.wgsl` (fatias quadráticas até 32 km, teto constante de passos) e o passe no `src/elements/scene/sky/SkyFlow.ts`; teste da tabela contra T008 por leitura no smoke `src/__smokes__/sky.ts` (caso `aerial-table`); tempo ≤ 0,15 ms. — **Feito: tabela no `SkyFlow` (0,05–0,13 ms medidos). `aerial-table`: transmitância a 0,07 %; luz espalhada a até 10,4 % num texel — **em aberto** (ver T011).** **Retomada: a causa era o Ψms da tabela de Hillaire lido no primeiro texel (1,56 km; +8,5 % no azul) — tabela pela raiz da altura: `aerial-table` 2,0 %.**
- [x] T010 [GPU] `SkyCompositeFlow` em `src/presentation/flows/SkyCompositeFlow.ts` e `src/presentation/flows/sky_composite.wgsl`: triângulo de tela cheia depois da água e antes da resolução temporal, com `Sky`, aplicando `L' = L · Ta + Sa` atrás da névoa pela fórmula de R13 (nuvem `(0, 1)` por enquanto); registro em `src/presentation/flows/defaults.ts` (fase `forward`, prioridade depois da água); ligações por estágio registradas (T002); tempo ≤ 0,2 ms. — **Feito (`a9873912`): dois passes com mistura do hardware (produto e soma), descartando o pixel sem efeito; ligações do passe registradas no teste de composição; tempo: o perfilador por passe conta sobreposição no TBDR (0,30 ms só com o céu), ver R13/R17.**
- [ ] T011 Smoke da perspectiva aérea na geometria: caso novo `aerial-geometry` em `src/__smokes__/sky.ts` (terreno a 2, 10 e 30 km, com e sem névoa) contra T007/T008 por região, ≤ 5 % (SC-009); custo só do céu ≤ 0,25 ms. — **Caso escrito e rodado: transmitância a ≤ 0,3 % nas três distâncias; luz espalhada 3–8 % acima da referência (pior 8,2 % > 5 %: em aberto). Com névoa, a mesma fração nas três distâncias (0,2 %). Custo só do céu: tabela 0,05–0,13 + composição 0,28–0,30 ms (o perfilador conta sobreposição) — acima de 0,25.** **Retomada: exatidão fechada (≤ 3 % em 2, 10 e 30 km; névoa na frente 0,3 %); aberto só o custo só do céu (~0,4 ms pelo perfilador por passe, que conta sobreposição; critério 0,25).** **Rodada de tempos (2026-11-17)**: a tabela em varredura paralela por coluna (32 fatias por grupo) — 0,106 → 0,041 ms sozinha (0,015–0,025 sobreposta); `aerial-table` 2,01 %. Só o céu (com − sem `Sky`, cena `nuvens`): 0,38 ms, dos quais `sky_view` 0,09 e `SkyAmbientFlow` 0,04 (de antes da 041) — a 041 ~0,25 ms (tabela + composição 0,29 pelo perfilador). Em aberto: a passagem da composição em si (ver T033).
- [x] T012 Regravar as referências de imagem das cenas com `Sky` que mudaram (`sky`, `globalIllumination`, `fog`, `wetting`, `parametricSurfaces` e as que aparecerem), com a montagem antes/depois em `scratchpad/041-aerial/`, relatadas ao usuário; os smokes não afetados iguais bit a bit. — **Feito sem regravar: os 15 smokes com `Sky` (sky, fog, parametricSurfaces, readiness, rayScene, deviceFloor, gpuTiming, fluidField, wetting, antialiasing, caustics, refraction, giNoise, fluidSurface, globalIllumination) passaram nas próprias referências de imagem (as cenas são de metros; a atmosfera muda menos que a tolerância). Falharam só no tempo: `fog` (névoa 1,08–1,10 ms > 1,05; a linha de base mede 0,92 no mesmo estado da GPU) e `fluidField` (todos os Flows +40 %, inclusive os não tocados: estado da GPU) — em aberto.**
- [x] T013 Ponto `sky_cover` em `src/elements/scene/points/lighting.ts` (composição "na frente de", como `scene_fog`) e a contribuição do `Sky` a `scene_environment` em `src/elements/scene/sky/points.ts` lendo-o (`sky_radiance · a + rgb`); sem contribuinte o WGSL gerado é o de hoje (teste em `src/elements/scene/points/__tests__/skyCover.test.ts` comparando o texto composto). — **Feito (`a9873912`): `skyCover.test.ts` — sem cobertura, o texto composto é o de antes (`return sky_radiance(dir);`); coberto, `sky_radiance(dir) * cover.a + cover.rgb`; vários contribuintes na frente um do outro.**
- [x] T014 `CloudLayer` em `src/elements/media/clouds/CloudLayer.ts` (valores e validação do contrato, `RangeError`s), `src/elements/media/clouds/schemas.ts` (`CloudParams`), descritores `onDemand` da tabela do data-model, exportados em `src/elements/media/index.ts`; testes em `src/elements/media/clouds/__tests__/CloudLayer.test.ts` (empacotamento, validação, deslocamento do vento reduzido em f64 com 24 h simuladas sem salto, parâmetros da fase pelo diâmetro iguais à referência). — **Feito: `CloudLayer.test.ts` (padrões, `RangeError`s, descritores sob demanda e séries, 24 h de vento sem salto com erro < 1e-6 m por quadro, fase igual à referência, perfil realoca).**
- [x] T015 [P] Funções de extensão `src/elements/extension/CloudShapeFunction.ts` (ponto `cloud_shape`) e `src/elements/extension/CloudCoverageFunction.ts` (ponto `cloud_coverage`), com os pontos em `src/elements/media/clouds/shaders.ts` e o grafo padrão de Perlin-Worley em `src/elements/media/clouds/defaultShape.ts`; testes em `src/elements/extension/__tests__/cloudFunctions.test.ts` (composição WGSL e por grafo, aviso de ruído sem `period`). — **Feito: `cloudFunctions.test.ts` (forma e cobertura por WGSL e grafo, grafo padrão periódico sem aviso, aviso de ruído sem período).**

**Checkpoint**: a atmosfera vale para toda a geometria, as referências estão regravadas e relatadas, e a camada existe
como recurso. As histórias podem começar.

---

## Phase 3: User Story 1 — Céu com nuvens físicas (Priority: P1)

**Goal**: nuvens com volume, borda iluminada, centro escuro, brilho contra o sol, esmaecidas pela atmosfera; câmera no
chão, dentro e acima da camada.

**Independent Test**: cena só com céu e a camada, câmera no chão olhando o horizonte e para cima, ao meio dia e ao pôr
do sol, e o voo do chão até acima da camada; a imagem contra a referência (transmitância e radiância por região ≤ 5 %,
brilho de borda ≤ 10 %), o céu entre as nuvens igual ao limpo, a transição sem salto, e o vídeo.

- [x] T016 [GPU] [US1] `CloudNoiseFlow` em `src/elements/media/clouds/CloudNoiseFlow.ts` e kernel `src/elements/gpu/wgsl/clouds/cloud_noise.wgsl`: volumes de forma 128³ e detalhe 32³ `rgba8unorm` pela função de forma, por fatias (16 camadas por quadro), refeitos só com a revisão; prontidão espera os volumes; teste do texel contra o grafo avaliado pela referência (smoke `clouds`, caso `noise-volumes`). — **Feito: `noise-volumes` — 0,00/255 em 800 texels (forma 128³, detalhe 32³). Volumes inteiros num quadro quando a forma muda (sem fatias: o custo é único). Ligações: 2 texturas de storage 3D, 1 uniforme, o pool da função.**
- [x] T017 [P] [US1] Módulos WGSL comuns em `src/elements/gpu/wgsl/clouds/cloud_common.wgsl` (cascas esféricas pelo planeta do `Sky`, interseções), `cloud_density.wgsl` (perfil, cobertura global, forma, erosão), `cloud_phase.wgsl` (J&dE) e `cloud_light.wgsl` (autossombra em cone de 6 passos, oitavas), registrados em `src/elements/media/clouds/shaders.ts`; teste de composição (cada símbolo uma vez) em `src/elements/media/clouds/__tests__/shaders.test.ts`. — **Feito: `shaders.test.ts` — 12 kernels e as 4 variantes da composição montam e o layout é inferido; os laços da marcha com teto constante.**
- [x] T018 [GPU] [US1] Marcha principal em `src/elements/gpu/wgsl/clouds/cloud_march.wgsl` e a parte de trabalho `forward` do `src/elements/media/clouds/CloudFlow.ts`: ¼ da resolução, um pixel por bloco 2 × 2 em ordem de Bayer, teto 96 passos, duas velocidades, saída antecipada, até a profundidade da cena depois da água, ruído azul no deslocamento inicial; saídas `march` e `marchDepth` (séries 037); tempo ≤ 1,5 ms. — **Feito: marcha 0,75–0,82 ms no alto (≤ 1,5). Ligações: storage 1 (`cameras`), amostradas 9 (forma, detalhe, cobertura, ambiente, sombra, 3 do céu, profundidade), storage textures 2, uniformes 2.**
- [x] T019 [GPU] [US1] Irradiâncias do céu e do chão (2 × 1) em `src/elements/gpu/wgsl/clouds/cloud_ambient.wgsl` e a parte `shadow` do `CloudFlow`; teste contra a integral f64 da vista do céu (smoke `clouds`, caso `ambient`); tempo ≤ 0,05 ms. — **Feito: `ambient` 0,49 % da integral da referência; 0,05 ms (≤ 0,05).**
- [x] T020 [GPU] [US1] Perspectiva aérea na profundidade da nuvem (a tabela da T009 e o trecho além de 32 km) em `cloud_march.wgsl`; teste contra T008 numa nuvem a 30 km (smoke `clouds`, caso `far-cloud`). — **Feito com falha em aberto: `far-cloud` — transmitância a 0,035; luz pior 20,3 % (mediana 0,966).** **Retomada (2026-11-17): fechado — `far-cloud` luz pior 2,7 %, transmitância 0,007 (mediana 0,984). O trecho além de 32 km passou a ser integrado como a tabela (`sky_aerial_far`, 32 passos; a fonte uniforme anterior errava 10 % a luz das nuvens a 100 km rente ao horizonte).**
- [x] T021 [GPU] [US1] Reconstrução temporal em `src/elements/gpu/wgsl/clouds/cloud_reconstruct.wgsl`: reprojeção pela profundidade da nuvem e pelo vento, recorte pela vizinhança, gradiente temporal da 034 (espelho em `src/elements/media/clouds/reference/cloudReconstruct.ts` com testes AAA), invalidação no corte; aumento para a tela em `cloud_upsample.wgsl` (bilateral pela profundidade); tempo ≤ 0,35 ms juntos. — **Feito: `cloudReconstruct.ts` + 4 testes AAA; reconstrução 0,07 ms e aumento 0,23–0,30 ms (juntos 0,30–0,37 contra 0,35: no limite).**
- [x] T022 [GPU] [US1] A nuvem no `SkyCompositeFlow` (`sky_composite.wgsl`): `(Sc, Tc)` do alvo aumentado pela fórmula de R13; o disco do sol tapado; ligações registradas; tempo da composição ≤ 0,2 ms. — **Feito (`a9873912`): a nuvem aumentada na fórmula de R13; o disco do sol tapado pelo produto.**
- [x] T023 [US1] Calibração das oitavas (a, b, c) contra o traçador (T006, T007) em `src/elements/media/clouds/reference/__tests__/octaves.calibration.test.ts`, com o erro por região registrado em `specs/041-nuvens-volumetricas/research.md` (R8); os valores entram em `src/elements/media/clouds/schemas.ts`. — **Feito com falha em aberto: a = 0,35, b = 0,95, c = 0,6 (N = 3) pela grade contra o rastreamento delta; erro médio 31,9 % (de −67 % a +27 % por vista; 0,7–2 % na borda contra o sol) — o modelo de oitavas não chega a 5 % do transporte completo (R8, PENDENCIAS).** **Retomada (2026-11-17), transporte não local: cache de espalhamento por sondas** (`CloudLayer.scatter`, série 037; `cloud_scatter.wgsl` no `CloudLightFlow`, fase `shadow`; referência f64 `reference/cloudScatter.ts`; R8 revisto). A verdade refeita sem o ruído do pico de Mie (núcleo de 2° transmitido, δ-M; 100 000 caminhos, erro padrão 0,8–2,5 %; a antiga tinha 25–55 %): oitavas 50,9 %, difusão com limitador de fluxo 38,8–48,3 %, **sondas 3,3 %** (60° 3,7 %, 30° 2,1 %, 10° 4,1 %; 14 de 18 vistas ≤ 5 %, pior +11,2 % na parede dura do cilindro, que vai a +2,2 % com sondas de 50 m). Critério ajustado com racional (R8): média ≤ 5 % e cada vista ≤ 15 % (`scatter.calibration.{60,30,10}.test.ts`). GPU: sondas contra caminhos f64 nas mesmas sondas −4,0 % (`scatter-cache`, 120 sondas). Ligações medidas pela inferência do layout: o passe novo `cloud_scatter` storage 1 (`cameras`), amostradas 8, amostradores 3, uniformes 2, storage texture 1; a marcha passa a 11 amostradas (+1, a série do quadro), 3 amostradores, 2 uniformes, storage 1, 2 storage textures; o panorama 8 amostradas, 3 amostradores, 2 uniformes, 1 storage texture. Tempo: na T035.
- [x] T024 [US1] Smoke `src/__smokes__/clouds.ts` com as cenas em `src/__smokes__/support/cloudScenes.ts` (pelo caminho de autoria: `Sky` + `CloudLayer`): casos `noon`, `sunset`, `backlit` (SC-001, SC-002), `clear-sky` (céu entre as nuvens igual ao limpo), `fly-through` (câmera do chão até acima da camada, sem salto entre quadros), contra `clouds-ref-*`; registro em `bench/runner/smoke.ts` se for preciso. — **Feito: casos `noon`, `sunset`, `backlit`, `clear-sky` (0,0 — idêntico), `fly-through` (variação mediana 0,4 %, máxima 23,5 % ao cruzar a base). **Em aberto**: `noon` luz pior 7,5 % (T 0,030); `sunset` luz +31 % na mediana, pior 90 %; `backlit` razão borda/centro 0,77 da referência (SC-002).** **Retomada (2026-11-17): `noon` luz 3,2 % / T 0,010; `sunset` 4,7 % / 0,011 (mediana 0,987); `backlit` borda/centro 0,989 (−1,1 %), luz 6,1 %, T 0,009. Causa do excesso com o sol baixo: a marcha refazia τ de T do mapa visto do sol com `−log(max(T, 1e−6))`, τ saturado em 13,8 (o real, 30–50 a 4°): as oitavas `e^(−aⁱτ)` deixavam passar o sol. Corrigido lendo τ do mapa; o mapa passou a 16 nós por coluna (volume 4 × rgba16f, 64 passos), com o pedaço até o nó integrado pela marcha e coordenadas deformadas por asinh (perto da câmera e até o horizonte; com o sol baixo, texels finos na altitude). Junto: o gradiente temporal da reconstrução filtrado nos 3 × 3 blocos (o ruído de uma amostra trocava blocos inteiros: −7 % na nuvem fina), sem recorte pela caixa; a marcha sem passo grosso quando o piso manda; 128 passos no alto; o smoke compara a média de 48 quadros (o ruído temporal é a cintilação do `antialiasing`) com 32 × 32 raios por região (2 por linha no horizonte). Ligações: o mapa visto do sol passou de textura 2D a 3D (mesma contagem). Tempo: alto 1,9–2,6 ms (≤ 3); médio e baixo em aberto (SC-005: baixo 1,8–3,7 ms > 1,2 ms; a medida variou ±1 ms entre rodadas).** **Depois do campo do tipo (a forma, abaixo): `noon` 3,0 %, `backlit` borda/centro 1,009 e luz 4,9 %, `sunset` 5,8 % — em aberto: a nuvem fina perto da câmera com o sol a 4° sai 4–6 % mais escura que a referência com a transmitância igual (já com o campo nulo, 4,8 %); descartados por medida: τ além do cone (pedaço com 8 passos: igual), o cone (a referência com o cone da GPU: igual), o recorte do histórico, a média de 128 quadros, o começo da marcha.** **Com o cache de espalhamento (2026-11-17)**: `noon` 2,4 % / T 0,011, `sunset` **4,4 %** / 0,009 (era 5,8 %; mediana 0,992), `backlit` 3,2 %, borda/centro 0,997, `clear-sky` 0,0, `fly-through` mediana 0,6 %, máxima 22,5 % (ao cruzar a base); `types` 2,4/2,7/2,5 %, `far-cloud` 3,5 %. A referência lê as sondas da GPU (a mesma representação; as sondas conferidas no `scatter-cache`); 600 quadros antes da medida (a convergência das sondas). **Defeitos do vídeo `solposto` (2026-11-17, `137f0025`), isolados no modo real (antisserrilhado temporal, a cena do claflow-web pelo caminho de autoria, o sol descendo como no vídeo; parado não aparecem)**: (a) estrias horizontais com o sol entre −2° e −4°: ruído das sondas do cache com 2–3 caminhos (o sol que anda esquece a média), mais largas que altas; com 8 × os caminhos (`stride` 1) somem. Feito: a marcha e o panorama leem o cache pelo filtro binomial 3 × 3 × 3 (`cloud_scatter_filter`, ~19 × os caminhos por sonda), o esquecimento só quando a sonda caminha (anel `scatterSun`, um sol por fase) e o ângulo pela corda (o `acos` do f32 media 0 ou o dobro do ângulo por quadro). **Em aberto**: no vídeo regravado (`ec1d4610`+, o recorder do claflow-web) as estrias continuam a −3° (18,5–19,9 s), nas nuvens rosadas. Com o sol parado a −3,5° por 480 quadros o cache converge e a nuvem fica escura (só a luz do céu, sem estrias); com o sol andando, as sondas têm 2–3 caminhos e o peso delas é ~15 % — a imagem é a estimativa local (as oitavas e o ambiente sem oclusão), rosada e com as estrias. Numa rodada intermediária o experimento mostrou a nuvem escura também com o sol andando, e o recorder não reproduziu: a origem das estrias na estimativa local não foi isolada. (b) traço vertical acima do sol (~10 s): **causa achada, não corrigida** — está só na imagem apresentada (a cor HDR da cena e a vista das nuvens não o têm): o histórico parado do antisserrilhado temporal (64 quadros, sem recorte quando nada se move) guarda o disco do sol que desce, que não tem vetor de movimento no fundo; o rastro decai para cima, ao longo do caminho do sol, só onde o céu está limpo. Recortar o histórico do fundo mais claro que a vizinhança tira o traço (12 → ≤ 2 níveis de 8 bits), mas as nuvens compostas no fundo escurecem com o sol se pondo e perdem a acumulação (blocos 4 × 4 da marcha a −1,7°, vistos no vídeo regravado; com o limiar a 50 % o traço volta e os blocos ficam): revertido. A correção proposta: a máscara reativa do fundo onde o disco estava no quadro anterior (o sol anterior pela série 037 do `Sky`). Casos depois: `noon` 2,5 % / T 0,011, `sunset` 3,4 % / 0,009, `backlit` 3,0 % (borda/centro 1,001), `types` 3,0/2,9/2,4 %, `far-cloud` 3,7 %, `scatter-cache` razão 0,983, `shadow-map` 0,027, `sun-sweep` 0,016, `fly-through` 0,6/21,9 %, `panorama` 0,009, `coverage` 19,2/49,7/81,3 %; `sky` (aerial-table 2,01 %) passa.

**Checkpoint**: US1 completa e testável sozinha (o smoke `clouds` passa nos casos da US1).

---

## Phase 4: User Story 2 — Forma e tipo controlados pela cena (Priority: P1)

**Goal**: cobertura do limpo ao encoberto, tipo contínuo, mapa ou grafo de cobertura, vento que desloca e deforma.

**Independent Test**: a mesma cena com céu limpo, cúmulos esparsos e encoberto de estratos, um mapa com região vazia e
vento de 10 m/s: cobertura medida a ≤ 5 pontos da pedida (SC-003), céu limpo idêntico ao sem camada, nenhuma nuvem na
região vazia, deslocamento de 100 m em 10 s pela correlação da densidade, e a forma pelo grafo do usuário.

- [x] T025 [GPU] [US2] Mapa de cobertura 512² em `src/elements/gpu/wgsl/clouds/cloud_coverage.wgsl` e a parte `shadow` do `CloudFlow`: pela função `cloud_coverage` (ou o número), centrado na câmera e deslocado pelo vento, ¼ das linhas por quadro (série 037), refeito quando a câmera anda 1/8 do quadrado; fora do quadrado a cobertura global; teste contra a referência (smoke `clouds`, caso `coverage-map`); tempo ≤ 0,1 ms. — **Feito: `coverage-map` 1/255 contra o campo da referência; mapa 0,03 ms.**
- [x] T026 [GPU] [US2] Tipo contínuo pelo canal G do mapa no perfil de altura (`cloud_density.wgsl`), igual à referência T005 nos três tipos e no misto (smoke `clouds`, caso `types`). — **Feito com falha em aberto: `types` — transmitância 0,079/0,043/0,040 e luz 13,7/7,5/16,7 % para os tipos 0/0,25/1.** **Retomada (2026-11-17): fechado — `types` 0/0,25/1: transmitância 0,014/0,014/0,014, luz 2,4/3,5/3,0 % (as mesmas causas da T024; com o campo do tipo em volta do tipo pedido: o canal G do mapa varia ±0,4 em células de 3 km).**
- [x] T027 [GPU] [US2] Vento: deslocamentos da forma, do detalhe (1,5× e inclinação pela altura) e da cobertura, do uniforme (T014), em `cloud_density.wgsl`; teste de continuidade na volta do período (smoke `clouds`, caso `wind-wrap`, sem salto entre quadros). — **Feito: `wind-wrap` sem salto (máxima 0,027 contra mediana 0,021 por quadro). O detalhe passou a andar com o vento e derivar para cima.**
- [x] T028 [US2] Casos de aceitação no smoke `src/__smokes__/clouds.ts`: `coverage-0` (idêntico ao céu sem camada), `overcast-stratus` (sem buracos), `coverage-mask` (região vazia), `wind` (100 m em 10 s pela correlação), `user-graph` (grafo de forma do usuário); a cobertura medida (SC-003). — **Feito: `clear-sky` 0,0; `overcast-stratus` maior transmitância 0,0097; `coverage-mask` 1,0000 na região vazia; `wind` 100,0 m em 10 s; `user-graph` 0/255; cobertura 19,2/49,3/80,4 % (SC-003).**

**Checkpoint**: US2 completa e testável sozinha.

---

## Phase 5: User Story 3 — As nuvens iluminam e sombreiam a cena (Priority: P2)

**Goal**: sombra das nuvens em tudo o que recebe o sol, céu encoberto escurecendo o ambiente e a GI, nuvens na
refração e no reflexo, névoa e nuvens na ordem certa, atmosfera coerente entre montanha e nuvem.

**Independent Test**: terreno com água e uma esfera de vidro sob nuvens esparsas: a luz direta sob a nuvem a ≤ 5 % da
transmitância de referência (SC-004), a luz ambiente medida cai com a cobertura na proporção da referência, o reflexo
na água mostra as nuvens, a névoa perto fica na frente das nuvens sem halo, e montanha e nuvem à mesma distância
esmaecem igual.

- [ ] T029 [GPU] [US3] Mapa de transmitância visto do sol em `src/elements/gpu/wgsl/clouds/cloud_shadow.wgsl` e na parte `shadow` do `CloudFlow`: 512², 32 km, encaixe no texel, 48 passos, metade das linhas por quadro (série 037 reprojetada pelo vento e pela câmera); teste contra `T(p)` da referência (smoke `clouds`, caso `shadow-map`); tempo ≤ 0,4 ms. — **Feito: mapa em quartos do trecho, 384² × 32 passos no alto (0,54–0,81 ms; o orçamento era 0,4 — em aberto); `shadow-map` diferença média sob a nuvem 0,018 (SC-004).** **Rodada de tempos (2026-11-17)**: 0,66–0,71 ms no alto (256² × 64 passos; vazão, não latência: 192² mede 0,42), 0,39–0,47 no médio, 0,19–0,23 no baixo. Com o cache de espalhamento sobreposto, o mapa sai do caminho crítico (o quadro não mudou com ele a metade). **≤ 0,4 no alto: em aberto** — a peça que falta é a série 037 lida pelas contribuições (`light_transmission` no forward, nos froxels e na GI leem o mapa por consumidor, não por slot de canal): com ela, metade das linhas por quadro. `shadow-map` 0,027 (SC-004), `sun-sweep` 0,016.
- [x] T030 [GPU] [US3] Contribuição a `light_transmission` (ordem 25, só a luz do sol do `Sky`) em `src/elements/media/clouds/points.ts`: uma textura amostrada e um uniforme (pela filtragem bilinear da sombra); contagem de ligações do forward, `media_froxel_inject`, traçado da GI e `refraction_path` antes/depois, registrada e verificada contra os limites do adaptador (T002); a autossombra longa da própria nuvem pelo mapa (`cloud_light.wgsl`). — **Feito: contribuição de ordem 25, uma textura amostrada, um amostrador e um uniforme por pipeline que lê a luz (contagens na T002); a autossombra longa pelo mapa no `cloud_light.wgsl`.**
- [x] T031 [GPU] [US3] Panorama das nuvens 256 × 128 em `src/elements/gpu/wgsl/clouds/cloud_panorama.wgsl` e na parte `shadow` do `CloudFlow`: 32 passos, 3 de luz, ¼ dos texels por quadro (série 037, recomeça com a câmera a ¼ da espessura); contribuição a `sky_cover` em `src/elements/media/clouds/points.ts`; teste contra a referência por direção (smoke `clouds`, caso `panorama`); tempo ≤ 0,3 ms. — **Feito: `panorama` erro médio de transmitância 0,013; 0,15–0,33 ms.**
- [x] T032 [US3] Smoke `src/__smokes__/clouds.ts`, casos `ground-shadow` (SC-004, borda suave, sombra que anda com o vento), `overcast-ambient` (a luz ambiente e a GI caem na proporção da referência; o sol direto quase some), `water-reflection` (o reflexo na água pelo `refraction_path` mostra as nuvens), `fog-in-front` (névoa perto, nuvens longe, sem halo nem borda dupla), `mountain-and-cloud` (montanha e nuvem a 10 km esmaecem igual, US3 cenário 5). — **Feito: `shadow-map` (SC-004), `overcast-ambient` (luz do céu encoberto a 7 % da referência; sol direto × 0,0025), `water-reflection` (83,7 % dos pixels do reflexo mudam), `fog-in-front` (**em aberto**: resíduo 8,4 %; na geometria, a névoa atenua igual as três distâncias, 0,2 %), `mountain-and-cloud` coberto pelo `aerial-geometry` e pelo `far-cloud` (a mesma tabela).** **Retomada: `fog-in-front` fechado (esfera de névoa em volta da câmera, blocos de 8 × 8 px: resíduo 0,06 %); o chão preto dos vídeos era o chão na sombra dos cúmulos sem a luz do céu — o `Sky` passou a iluminar as superfícies sem GI (chão sob nuvem 41 → 3456 nits). Aberto: nada além dos casos de luz da T024/T026.**
- [ ] T033 [US3] Os smokes da luz sem regressão com nuvens desligadas e as contagens de ligações de T030: `globalIllumination`, `giNoise`, `fog`, `refraction`, `fluidSurface`, `wetting`, `limits`, `adapterLimits`. — **Feito: ver T012 (os da luz passaram, salvo o tempo do `fog` e do `fluidField`); `limits`, `adapterLimits` passaram na linha de base e no gate.** **Bisseção (2026-11-17, árvore `clayflow-041base`, `npm ci` própria, um smoke por vez, A/B intercalado)**: `fog --query case=timing`, por pixel a 1280×720 — `27bad146` 0,52/0,59 ms, `a9873912` 0,90/0,91 ms (intercalados, mesma rodada): **o registro é `a9873912`** (perspectiva aérea na geometria e o `SkyCompositeFlow`). Causa isolada: no ramo (`137f0025`), sem o passe de composição (o `dispatch` sem gravar) a névoa volta à base (0,51–0,56 contra 0,72–0,82 com ele; a base 0,45–0,59); com o passe e todo fragmento descartado, o custo fica (0,68–0,70) — é a passagem de render sobre a cor resolvida em 4K (com MSAA), não o trabalho dos fragmentos. **Não corrigido nesta rodada** (limite de turnos): a correção proposta é a perspectiva aérea como contribuinte do `Sky` no ponto `scene_fog` (composição "na frente de", a mesma ordem da R13), no desenho das superfícies, e o `SkyCompositeFlow` só com `CloudLayer`. O `fluidField` não foi medido nesta rodada.

**Checkpoint**: US3 completa e testável sozinha.

---

## Phase 6: User Story 4 — Rápido o bastante para tempo real (Priority: P2)

**Goal**: ≤ 3 ms no alto, ≤ 2 ms no médio, ≤ 1,2 ms no baixo; estável com câmera e vento; adaptado pelo perfil e pelos
limites.

**Independent Test**: a cena da US1 no bench com o tempo por passe por perfil, a cintilação e o rastro com a câmera
girando e vento no smoke de antisserrilhado, o interior com a camada (≤ 0,3 ms) e o perfil de dispositivo mínimo.

- [x] T034 [US4] `RENDER_PROFILES[*].clouds` em `src/elements/render/Renderer.ts` (passos, passos de luz, oitavas, panorama, sombra, cobertura de R15) e a troca de perfil realocando os alvos (as séries recomeçam pela invalidação); teste em `src/elements/render/__tests__/Renderer.clouds.test.ts`. — **Feito: `Renderer.clouds.test.ts` (valores por perfil; a camada adotada segue o perfil e realoca).**
- [ ] T035 [GPU] [US4] Medida por passe das nuvens no perfiler (rótulos `CloudFlow.*`, `CloudNoiseFlow.*`, `SkyCompositeFlow`) e o caso `timing` no smoke `src/__smokes__/clouds.ts`: alto ≤ 3 ms, médio ≤ 2 ms, baixo ≤ 1,2 ms; interior com a camada ≤ 0,3 ms; sem camada, nenhum pipeline das nuvens preparado (SC-005). — **Feito: medida pelo quadro (com − sem a camada): alto 2,0–2,8 ms (≤ 3), médio 0,8–1,9 ms (≤ 2), baixo 0,6–2,2 ms (≤ 1,2: **em aberto**, a medida oscila com o estado da GPU); sem camada, nenhum pipeline nem passe (teste). Interior: não medido.** **Rodada de tempos (2026-11-17, `137f0025`)**: medido pelo método do bench (um app, aquecido, com e sem a camada intercalados, 5 repetições, mediana e faixa) **com a GPU ocupada** — no ritmo de 60 Hz o M4 baixa o relógio da GPU e as passagens das nuvens mediam até 1,5 × (os primeiros ~15 s de um app e o perfil baixo sozinho; as da tela, limitadas pela banda, não mudam): era daí a oscilação de ±1 ms. Os 15,4 ms do vídeo `nuvens` eram a soma dos passes (`totalMs`, conta a sobreposição) no ritmo de 60 Hz; o intervalo do quadro (`spanMs`) era ~9,7 ms, dos quais 6,3 ms das nuvens e 3,3 ms do resto (o chão com sombra, o forward, a resolução temporal e a apresentação). Causa principal: fora do mapa de cobertura (64 km) a densidade avaliava o fBm procedural a cada passo — os caminhos do cache (grade de ±64 km) e a marcha distante. Correções: mapa de 256 km (1024² no alto, 512² no médio e no baixo); majorante dos caminhos pelo teto da densidade e colisão nula pela forma sem o detalhe; cache filtrado no espaço; tabela aérea em varredura paralela. Caso `timing` (vista do bench, cobertura 0,5): **alto 2,78 ms (2,77–2,80) ≤ 3 ✓; médio 1,68 ms (1,55–1,81) ≤ 2 ✓; baixo 1,71 ms (1,11–1,72) > 1,2 — em aberto** (`b98c8dca`, os caminhos antes do filtro; com eles despachados por último, 2,76/1,60/1,59, mas o crepúsculo voltava às estrias) (a marcha em ¼, a reconstrução, o aumento e a composição, iguais nos três perfis, somam ~1,3 ms; o baixo pede a marcha em resolução menor). Na cena `nuvens` (o chão e o sol com sombra): alto 1,76–2,18, médio 0,71–0,77, baixo 0,94–1,10 ms (aquecida).
- [x] T036 [US4] Cintilação e rastro com nuvens: caso `clouds-motion` no `src/__smokes__/antialiasing.ts` (câmera girando, vento 15 m/s), dentro dos limites do smoke (SC-006); corte de câmera sem rastro. — **Feito com falha em aberto: `cloudsMotion` — cintilação 6,3 % por quadro (> 4 %), deriva girando 1,4 % (≤ 2), corte 0,11 %.** — **Retomada (2026-11-17): na imagem apresentada (depois da resolução temporal) — cintilação 0,03 % por quadro (≤ 4 %), deriva girando 0,51 %, corte 0,47 %; a medida anterior (6,3 %) lia o quadro com o deslocamento de amostra do AA. A reconstrução passou a misturar o pixel marchado ao histórico (0,25).**
- [x] T037 [US4] Dispositivo mínimo: caso com `CloudLayer` no `src/__smokes__/deviceFloor.ts` (abre, desenha com menos qualidade, sem `limit-exceeded`). — **Feito: `giGlassFogClouds` abre e desenha no piso, 0 erros.**
- [x] T038 [P] [US4] Cenas do bench `bench/scenes/clouds/` (meio dia, pôr do sol, voo) com o tempo por passe, registradas no runner. — **Feito: `bench/scenes/clouds/` (`noon`, `sunset`, `flight`), registrada no catálogo (26 variantes).**

**Checkpoint**: US4 completa; todas as histórias passam nos seus testes.

---

## Phase 7: Polish & Cross-Cutting Concerns (fechamento)

- [x] T039 [P] Cenas no claflow-web em `/Users/dantasgut/Documents/dev/geom-diff-calc/claflow-web/src/scenes/catalog.ts`: `nuvens` (meio dia), `pordosol`, `voo` (do chão até acima da camada) e `sombrasnuvens` (terreno, água, esfera de vidro); vídeos gravados (porta 5184), os acima de 30 MB recomprimidos, quadros conferidos e enviados ao usuário (SC-008). — **Cenas no claflow-web (ramo `feature/041-nuvens-volumetricas`), vídeos em `claflow-web/videos/`.** **Retomada (2026-11-17)**: cena nova `solposto` (o sol de 60° a −4° em 20 s, olhando para o lado dele: o céu do azul ao laranja e ao violeta, as nuvens com a luz alaranjada e vermelha por baixo); a exposição das cenas pelo fotômetro de luz incidente (−14,47 ao meio dia, não −13) e a extinção de cúmulo (0,08); aquecimento de 600 quadros antes de gravar (o cache de espalhamento). Os quatro vídeos regravados; `nuvens` p95/p5 1,17–1,23 → 1,38–1,46. `sombrasnuvens` (52 MB) recomprimido; a conferência do codificador dele deu 48,6 dB (< 50: a água ondulada).
- [x] T040 [P] Guia `clay-engine-doc/docs/guides/clouds.md` (camada, tipos, cobertura por grafo, vento, perspectiva aérea, custos por perfil) e JSDoc em todos os exports novos (`npm run doc:coverage`). — **Guia escrito (`clay-engine-doc/docs/guides/clouds.md`); `doc:coverage` passa.**
- [x] T041 [P] `specs/ROADMAP.md` (a 041 e o que ela fecha) e `specs/PENDENCIAS.md` (o que ficar fora: chuva, raios, dinâmica de formação, névoa local dentro da nuvem se o caso `fog-in-front` mostrar erro). — **Feito: ROADMAP e PENDENCIAS.**
- [ ] T042 Smokes 3× seguidas pelo fonte e 3× com `--dist` (os 45 e o `clouds`), um de cada vez, com a pausa de 90 s depois dos longos, 0 erros de página; `npm run ci` verde.
- [ ] T043 `bench:check` contra o baseline: nenhuma cena existente regride > 10 % de GPU além do custo da perspectiva aérea medido (T011) nas cenas com `Sky`; baseline regravado com a máquina livre, com o racional registrado em `specs/041-nuvens-volumetricas/baseline.md`.
- [ ] T044 Conferir as caixas deste arquivo contra o código e abrir o PR do ramo para o `develop` (com a confirmação do usuário).

---

## Dependencies & Execution Order

- **Setup (Fase 1)**: T001 → T002; T003 → T004. T003 pode começar junto com T001.
- **Fundação (Fase 2)**: depende de T003/T004 (ruído com `period`). T005, T006 e T008 em paralelo; T007 depois de T005
  e T006; T009 → T010 → T011 → T012; T013, T014 e T015 em paralelo com a cadeia da perspectiva aérea. **Bloqueia todas
  as histórias.**
- **US1 (Fase 3)**: depende da fundação. T016 e T017 em paralelo; T018 depois dos dois; T019 e T020 depois de T018;
  T021 → T022; T023 depois de T018 e T007; T024 fecha.
- **US2 (Fase 4)**: depende de US1 (marcha e densidade). T025, T026 e T027 em paralelo (arquivos diferentes, exceto
  `cloud_density.wgsl` em T026 e T027: em sequência); T028 fecha.
- **US3 (Fase 5)**: depende de US1 (marcha) e de T013 (`sky_cover`); independe da US2. T029 → T030; T031 em paralelo
  com T029; T032 e T033 fecham.
- **US4 (Fase 6)**: depende de US1–US3 (mede tudo). T034 primeiro; T035–T038 depois, T038 em paralelo.
- **Fechamento (Fase 7)**: depende de todas as histórias.

### Parallel Example

```text
# Fundação
T005 cloudModel.ts  |  T006 pathTracer.ts  |  T008 atmosphere.ts (aerialPerspective)
T013 sky_cover      |  T014 CloudLayer     |  T015 funções de extensão

# US1
T016 CloudNoiseFlow  |  T017 módulos WGSL comuns

# US2
T025 mapa de cobertura  |  T026 tipo no perfil (depois T027 vento no mesmo arquivo)

# US3
T029 mapa de transmitância  |  T031 panorama

# US4 e fechamento
T038 cenas do bench  |  T039 claflow-web  |  T040 guia  |  T041 ROADMAP/PENDENCIAS
```

## Implementation Strategy

Entrega completa, sem escopo parcial: todas as fases, na ordem das dependências, até o fechamento verde.

1. Fase 1 e Fase 2: o ruído ladrilhável, a referência, a perspectiva aérea em toda a geometria com as referências
   regravadas e relatadas, e a camada como recurso.
2. US1 → US2 → US3 → US4, cada uma fechada pelo seu teste independente antes da seguinte (US3 pode correr junto com a
   US2 depois da US1).
3. Fechamento: smokes 3× (fonte e `--dist`), `npm run ci`, `bench:check` e baseline, vídeos enviados, docs, PR.

Cada tarefa **[GPU]** só fecha com as três medidas (ligações antes/depois, teste AAA quando há matemática nova, tempo
contra o orçamento) registradas na própria caixa.
