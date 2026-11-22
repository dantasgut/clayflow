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
smokes um de cada vez (`--headless --timeout 400`, 900 no `globalIllumination` — medido na T081: 492 s no ramo, 412 no
`develop`, e as referências da CPU dele variam 2,7× com a máquina —, porta 5181; vídeo na 5184).

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
- [x] T011 Smoke da perspectiva aérea na geometria: caso novo `aerial-geometry` em `src/__smokes__/sky.ts` (terreno a 2, 10 e 30 km, com e sem névoa) contra T007/T008 por região, ≤ 5 % (SC-009); custo só do céu ≤ 0,25 ms. — **Caso escrito e rodado: transmitância a ≤ 0,3 % nas três distâncias; luz espalhada 3–8 % acima da referência (pior 8,2 % > 5 %: em aberto). Com névoa, a mesma fração nas três distâncias (0,2 %). Custo só do céu: tabela 0,05–0,13 + composição 0,28–0,30 ms (o perfilador conta sobreposição) — acima de 0,25.** **Retomada: exatidão fechada (≤ 3 % em 2, 10 e 30 km; névoa na frente 0,3 %); aberto só o custo só do céu (~0,4 ms pelo perfilador por passe, que conta sobreposição; critério 0,25).** **Rodada de tempos (2026-11-17)**: a tabela em varredura paralela por coluna (32 fatias por grupo) — 0,106 → 0,041 ms sozinha (0,015–0,025 sobreposta); `aerial-table` 2,01 %. Só o céu (com − sem `Sky`, cena `nuvens`): 0,38 ms, dos quais `sky_view` 0,09 e `SkyAmbientFlow` 0,04 (de antes da 041) — a 041 ~0,25 ms (tabela + composição 0,29 pelo perfilador). Em aberto: a passagem da composição em si (ver T033). **Rodada 10 (2026-11-19)**: caso novo `sky-timing` (só o céu, com e sem o `Sky` intercalados, método do bench): 0,59 ms, dos quais os passes de antes da 041 0,16 (`sky_view` 0,089, `SkyAmbientFlow` 0,069) — **o novo 0,44 ms > 0,25: em aberto** (a tabela aérea 0,069, o excesso e a máscara do sol da R18 0,076 com o sol fora da tela, e a perspectiva aérea por pixel no desenho); não depende do mapa nem do cache por páginas. **Rodada 11 (2026-11-19)**: o caso media "com − sem o `Sky`" menos quatro passes de antes; a diferença (0,53–0,59 ms) é quase toda o fundo desenhado no forward (forward com − sem 0,535 ms: a vista do céu por pixel, spec 033) — a conta punha o fundo de antes na 041. Cortado o que roda sem efeito: o excesso do disco só quando um efeito o lê (`PostFlow` pede `FrameTargets.overflow`; o passe do excesso limpa o alvo e a limpeza à parte saiu) e, sem nada que tape o sol no ar (`Sky.shadowed`, ligado pela camada), a tabela sem a visibilidade e sem o déficit (`sky_aerial_clear`) e o fundo sem ler o déficit. `sky-timing`: só o céu 0,591 → 0,537 ms; **o novo da 041 (os passes dela) 0,082 ms (tabela 0,055, máscara do disco 0,027) ≤ 0,25 ✓** (`dc93682f`); `sky` passa (`aerial-table` 1,90 %, `aerial-geometry`, `crepuscular`). A máscara do disco (0,027) ainda roda com o sol fora da tela (o passe de carga e gravação da máscara; cortar exige saber na gravação se o disco cai na tela).
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
- [x] T024 [US1] Smoke `src/__smokes__/clouds.ts` com as cenas em `src/__smokes__/support/cloudScenes.ts` (pelo caminho de autoria: `Sky` + `CloudLayer`): casos `noon`, `sunset`, `backlit` (SC-001, SC-002), `clear-sky` (céu entre as nuvens igual ao limpo), `fly-through` (câmera do chão até acima da camada, sem salto entre quadros), contra `clouds-ref-*`; registro em `bench/runner/smoke.ts` se for preciso. — **Feito: casos `noon`, `sunset`, `backlit`, `clear-sky` (0,0 — idêntico), `fly-through` (variação mediana 0,4 %, máxima 23,5 % ao cruzar a base). **Em aberto**: `noon` luz pior 7,5 % (T 0,030); `sunset` luz +31 % na mediana, pior 90 %; `backlit` razão borda/centro 0,77 da referência (SC-002).** **Retomada (2026-11-17): `noon` luz 3,2 % / T 0,010; `sunset` 4,7 % / 0,011 (mediana 0,987); `backlit` borda/centro 0,989 (−1,1 %), luz 6,1 %, T 0,009. Causa do excesso com o sol baixo: a marcha refazia τ de T do mapa visto do sol com `−log(max(T, 1e−6))`, τ saturado em 13,8 (o real, 30–50 a 4°): as oitavas `e^(−aⁱτ)` deixavam passar o sol. Corrigido lendo τ do mapa; o mapa passou a 16 nós por coluna (volume 4 × rgba16f, 64 passos), com o pedaço até o nó integrado pela marcha e coordenadas deformadas por asinh (perto da câmera e até o horizonte; com o sol baixo, texels finos na altitude). Junto: o gradiente temporal da reconstrução filtrado nos 3 × 3 blocos (o ruído de uma amostra trocava blocos inteiros: −7 % na nuvem fina), sem recorte pela caixa; a marcha sem passo grosso quando o piso manda; 128 passos no alto; o smoke compara a média de 48 quadros (o ruído temporal é a cintilação do `antialiasing`) com 32 × 32 raios por região (2 por linha no horizonte). Ligações: o mapa visto do sol passou de textura 2D a 3D (mesma contagem). Tempo: alto 1,9–2,6 ms (≤ 3); médio e baixo em aberto (SC-005: baixo 1,8–3,7 ms > 1,2 ms; a medida variou ±1 ms entre rodadas).** **Depois do campo do tipo (a forma, abaixo): `noon` 3,0 %, `backlit` borda/centro 1,009 e luz 4,9 %, `sunset` 5,8 % — em aberto: a nuvem fina perto da câmera com o sol a 4° sai 4–6 % mais escura que a referência com a transmitância igual (já com o campo nulo, 4,8 %); descartados por medida: τ além do cone (pedaço com 8 passos: igual), o cone (a referência com o cone da GPU: igual), o recorte do histórico, a média de 128 quadros, o começo da marcha.** **Com o cache de espalhamento (2026-11-17)**: `noon` 2,4 % / T 0,011, `sunset` **4,4 %** / 0,009 (era 5,8 %; mediana 0,992), `backlit` 3,2 %, borda/centro 0,997, `clear-sky` 0,0, `fly-through` mediana 0,6 %, máxima 22,5 % (ao cruzar a base); `types` 2,4/2,7/2,5 %, `far-cloud` 3,5 %. A referência lê as sondas da GPU (a mesma representação; as sondas conferidas no `scatter-cache`); 600 quadros antes da medida (a convergência das sondas). **Defeitos do vídeo `solposto` (2026-11-17, `137f0025`), isolados no modo real (antisserrilhado temporal, a cena do claflow-web pelo caminho de autoria, o sol descendo como no vídeo; parado não aparecem)**: (a) estrias horizontais com o sol entre −2° e −4°: ruído das sondas do cache com 2–3 caminhos (o sol que anda esquece a média), mais largas que altas; com 8 × os caminhos (`stride` 1) somem. Feito: a marcha e o panorama leem o cache pelo filtro binomial 3 × 3 × 3 (`cloud_scatter_filter`, ~19 × os caminhos por sonda), o esquecimento só quando a sonda caminha (anel `scatterSun`, um sol por fase) e o ângulo pela corda (o `acos` do f32 media 0 ou o dobro do ângulo por quadro). **Em aberto**: no vídeo regravado (`ec1d4610`+, o recorder do claflow-web) as estrias continuam a −3° (18,5–19,9 s), nas nuvens rosadas. Com o sol parado a −3,5° por 480 quadros o cache converge e a nuvem fica escura (só a luz do céu, sem estrias); com o sol andando, as sondas têm 2–3 caminhos e o peso delas é ~15 % — a imagem é a estimativa local (as oitavas e o ambiente sem oclusão), rosada e com as estrias. Numa rodada intermediária o experimento mostrou a nuvem escura também com o sol andando, e o recorder não reproduziu: a origem das estrias na estimativa local não foi isolada. (b) traço vertical acima do sol (~10 s): **causa achada, não corrigida** — está só na imagem apresentada (a cor HDR da cena e a vista das nuvens não o têm): o histórico parado do antisserrilhado temporal (64 quadros, sem recorte quando nada se move) guarda o disco do sol que desce, que não tem vetor de movimento no fundo; o rastro decai para cima, ao longo do caminho do sol, só onde o céu está limpo. Recortar o histórico do fundo mais claro que a vizinhança tira o traço (12 → ≤ 2 níveis de 8 bits), mas as nuvens compostas no fundo escurecem com o sol se pondo e perdem a acumulação (blocos 4 × 4 da marcha a −1,7°, vistos no vídeo regravado; com o limiar a 50 % o traço volta e os blocos ficam): revertido. A correção proposta: a máscara reativa do fundo onde o disco estava no quadro anterior (o sol anterior pela série 037 do `Sky`). Casos depois: `noon` 2,5 % / T 0,011, `sunset` 3,4 % / 0,009, `backlit` 3,0 % (borda/centro 1,001), `types` 3,0/2,9/2,4 %, `far-cloud` 3,7 %, `scatter-cache` razão 0,983, `shadow-map` 0,027, `sun-sweep` 0,016, `fly-through` 0,6/21,9 %, `panorama` 0,009, `coverage` 19,2/49,7/81,3 %; `sky` (aerial-table 2,01 %) passa. **Rodada 3 (2026-11-18)**: (b) **traço do sol fechado** pela máscara reativa do disco (`SkyReactiveFlow`, C4; a direção do sol do quadro anterior pela série 037 `Sky.sunTrack`, escrita pela vista do céu): sobre o disco de agora o histórico é recortado como em movimento (0,5), onde só o anterior estava ele recomeça (1,0); a máscara mistura pelo máximo com a da refração e a resolução a limpa depois de ler. No `solposto` (modo real, 8–11 s) o excesso na coluna do sol caiu de 7–11 níveis de 8 bits para 1–2 (o ruído fora dela: 1). (a) **estrias e rosado a −2…−4° isolados nos quadros**: a entrada crua (sem o temporal) já está vermelha a −2° e escura e lisa a −3°/−4°; o rosado e as estrias eram o histórico do antisserrilhado temporal — a 1/64 por quadro em radiância linear, com a nuvem caindo ~100× com a sombra da Terra, os quadros claros dominavam por ~300 quadros (zerar o histórico do fundo a 18,3 s deixava a imagem escura na hora). As linhas que ele carregava são de −1° (o raio do sol desce 1° e sai pela base: o lado de baixo das nuvens iluminado) — isoladas termo a termo: estão no espalhamento simples e no múltiplo, ficam sem o mapa visto do sol e sem o corte do terminador, então são a física daquele instante, não da estimativa local (que já não tem o sol direto abaixo do horizonte: `cloud_sun_atmosphere` é 0 com o raio no chão). Corrigido pela causa: o fundo escreve a própria radiância no alvo da luz que chega (`fs_background_light`, e a composição das nuvens mantém o brilho composto) e a resolução temporal reilumina o histórico do fundo (o brilho acumulado trazido à faixa 3 × 3 de agora, a croma da vizinhança), sem o recortar. Quadros a −2°, −3°, −4° do `solposto` regravado: a cor e o brilho iguais à entrada; sem estrias. Resta a −1…−2° o bloco 4 × 4 da reconstrução das nuvens na própria entrada (antes escondido pelo atraso). Smokes: `antialiasing` passa (`cloudsMotion` cintilação 0,09 %, deriva 0,69 %, corte 1,04 %); `clouds` (caso a caso): `noon` 2,5 % / T 0,011, `sunset` 3,5 % / 0,009, `backlit` 3,1 % (borda/centro 1,002), `far-cloud` 3,7 %, `fly-through` 0,6/21,9 %, `scatter-cache` 0,983, `shadow-map` 0,027, `sun-sweep` 0,016, `panorama` 0,009; os demais passam. Vídeo final da rodada (`0d8867d3`): `scratchpad/041-video/solposto-rodada3.mp4` (25 MB) e a montagem antes/depois `solposto-rodada3-antes-depois.png` (9 s, −2°, −3°, −4°); o conferidor do codificador dá 49,8 dB no brilho (< 50) e 44,9 dB em RGB (< 45): a imagem do crepúsculo agora é a da entrada (com o bloco da reconstrução a −1…−2°), não mais a média lenta. **Rodada 4 (2026-11-18), saltos do `solposto` (o usuário: "puxadas bruscas no chão e no céu")**, isolados no modo real (antisserrilhado temporal, a cena do app pelo caminho de autoria, o brilho médio do chão e do céu por quadro; parado nenhum aparece): (1) **o chão piscando quadro a quadro com o sol a 5,6–4,0°** — a profundidade ótica do mapa visto do sol amostrada em frações do trecho da casca: com o sol baixo o trecho (~30 km) muda de comprimento com o ângulo (`comprimento·cot(e)·Δe`) e o pente de 64 amostras escorregava um passo inteiro a cada ~0,06°; com o sol descendo devagar, τ do chão oscilava 125 ↔ 167 níveis nesse período, e no vídeo acelerado (0,04°/quadro) virava alternância. Corrigido: pente fixo no mundo (planos perpendiculares ao sol a `m·Δ + φ` da origem, `Δ = 2ⁿ` m de 64 m ao teto de 192 amostras, os níveis vizinhos misturados pela posição do comprimento na oitava — contínuo no ângulo; `φ` por coluna, fixo na linha do mundo, para o erro da amostragem não se repetir em todas as colunas). (2) **o céu e o chão saltando ao cruzar o horizonte (16,47 s, −0,03°)** — o mapa só era calculado com `sun.y > 0`: abaixo do horizonte τ = 0, as nuvens acendiam laranja num quadro e o chão subia pelo céu coberto. Corrigido: a origem de cada coluna é a saída do topo da casca do lado do sol (`cloud_sun_entry`, também na leitura), com o sol acima ou abaixo do horizonte. (3) **degraus de dois quadros no chão na queda de 9,4 s (19°) e nas transições de 4–5,5°** — a reiluminação do histórico da resolução temporal só entrava com a luz acumulada 10–20 % fora da faixa da vizinhança: com a luz caindo ~3 %/quadro o histórico parado ficava para trás e saltava (sem o temporal, a curva era lisa). Corrigido: a luz acumulada é levada continuamente à faixa 3 × 3 de agora (folga de 2 %) e o histórico reiluminado pela mesma razão; a mudança grande segue tratada como movimento. (4) **a borda da nuvem passando pelo sol num quadro** — o sol era pontual na sombra das nuvens; a luz do sol nas superfícies passou a ser a média sobre o disco do sol (`cloud_shadow_transmittance_disk`: 16 colunas no disco de raio `distância da nuvem·tan(raio do sol)`, a distância pelo centro de τ da coluna). (5) **a exposição da cena** (claflow-web): a regra "abaixo de 8° a câmera acompanha 15 %" trocava a derivada de uma vez e a tabela linear tinha um bico em cada nó — agora o fotômetro por Hermite monótona (Fritsch–Carlson) e a fração acompanhada indo de 1 a 0,15 entre 11° e 5° por smoothstep, integrada (valor e derivada contínuos). A queda de 9,4 s (19°) e as subidas/descidas a 5,5° e 4,1° são o sol entrando e saindo de trás das nuvens (a curva por ângulo do sol é a mesma no vídeo acelerado e no lento). Casos novos no `clouds`: `sun-low` (6° a 3° a cada 0,02°: variação total 2,40 contra 2,33 da referência — o pente antigo dava ~20 ×, medido na referência f64 —, diferença média 0,028) e `sun-below` (−0,3° e −0,8°: T na camada a 0,005 e 0,000 da referência; antes o mapa vazio). `sun-sweep` 0,010 (luz somada 10,54 contra 9,80), `shadow-map` 0,027. A razão contínua da resolução temporal só com luz acumulada mensurável (> 10⁻⁴): sem essa guarda, o piso da divisão escurecia o histórico dos pontos sem luz a cada quadro (`antialiasing`, `still`, 31 %). Smokes (um por vez): todos os casos do `clouds` passam, salvo `timing` baixo (alto 2,54 ms ✓, médio 1,37 ✓, baixo 1,40 > 1,2 — em aberto como antes; o passe do mapa 0,62 ms no alto, era ~0,6); `sky` e `antialiasing` passam (`still` 0,85 %/0,36 %, `cloudsMotion` cintilação 0,12 %, deriva 0,68 %, corte 1,09 %). Vídeos (brilho médio por quadro, chão = quarto de baixo, céu = sexto de cima): `solposto` (60° a −4° em 20 s) — antes, chão até 45 níveis num quadro, 42 quadros > 2, 5 alternâncias; céu 46, 26 quadros > 2 —, depois: céu ≤ 1, sem alternância; o chão > 2 só nas três passagens do sol por trás das nuvens (máx. 8 a 5,5°); `solpostolento` (cena nova, 20° a −4° em 60 s) — antes, chão 32, 73 quadros > 2, 8 alternâncias; céu 12 —, depois: chão ≤ 2 salvo um quadro de 3 dentro da rampa do sol saindo da nuvem a 5,45°, céu ≤ 1. **Rodada 5 (2026-11-18), o usuário nos vídeos da rodada 4: "pequenas manchas nas nuvens e o horizonte parece tremer"**, isolados no modo real (antisserrilhado temporal) numa cena do app parada com o sol a 10° e por instrumentação temporária da resolução temporal (desfeita): (1) **o horizonte tremendo** — duas causas somadas. (a) A desoclusão da resolução temporal comparava a distância da amostra com a do quadro anterior a 5 %: no chão visto rente, a distância dobra de uma linha para a seguinte, e a amostra deslocada (±½ pixel) passava dos 5 % sem desoclusão nenhuma — as linhas 521–526 recomeçavam o histórico a cada quadro (sem nuvens, a linha da borda variava 10,7 níveis por quadro; com a tolerância somada da variação da distância num pixel em volta, 0,15). Parado só: em movimento a folga deixava passar o histórico do meio turvo da água (`waterOrbit`). (b) A reconstrução das nuvens enchia os texels do bloco com o valor do pixel marchado sem olhar a superfície: o texel do chão recebia a nuvem rente ao horizonte (marchada no céu) e o do céu o valor sem nuvem (marchado até o chão); com o deslocamento da amostra trocando a superfície dos pixels da borda, os blocos de 4 px acendiam e apagavam (as linhas 521–524 a 37 níveis por quadro). Corrigido pela causa: cada valor guarda a superfície até onde foi marchado (`traceDepth.g`, `marchDepth.g`, `rg32float`; `cloud_scene_limit.wgsl`), o valor do bloco só entra no texel da mesma superfície (senão, o do bloco vizinho mais parecido), o histórico é lido só dos texels da mesma superfície (bilinear com peso zero nos outros) e o aumento pesa pela superfície guardada com o valor (sem reler a profundidade de 4 × 4 pixels). Referência f64 (`cloudFreshForSurface`, a superfície no `reconstructTexel`) e teste. (2) **as manchas** — a nuvem fina de um texel de altura (no detalhe menor que o texel da marcha) acendia e apagava em faixas de ~24 px quadro a quadro, e a resolução temporal não integrava: a composição das nuvens escrevia no alvo da luz que chega o brilho composto (com a nuvem), e a reiluminação contínua da rodada 4 levava a luz acumulada do fundo à faixa 3 × 3 de agora ±2 % a cada quadro — um recorte justo do histórico do fundo. Corrigido: a composição não escreve mais a luz (`SkyCompositeFlow` sem o alvo da luz); no fundo a luz é a radiância do céu atrás das nuvens (lisa), que segue o crepúsculo sem recortar a nuvem. Pixels destoantes no tempo (|p − mediana de 5 quadros| > 8) no `solpostolento` a 15, 30 e 45 s: 84–424 por quadro → 0. Uma marca de "histórico próprio" no gradiente da reconstrução foi tentada e retirada (sem ganho medido depois da correção da luz; `sunset` 5,7 %). (3) **terreno com gramado** nas seis cenas das nuvens do claflow-web (`cloudTerrain`): colinas por `SurfaceFunction` (ruído de valor em 5 oitavas de 1,6 km e lombas de 15–60 m), malha adaptativa na GPU num domínio esticado (segmentos de ~0,5 m perto da origem, ~20 m a 6 km), gramado por `MaterialFunction` (manchas de ~250 m e ~25 m, touceiras, grão, terra na encosta, oitavas apagadas pela pegada); o `sombrasnuvens` com o lago escavado (bacia redonda sob a caixa de água, as paredes enterradas), o sol a 70° e a cobertura 0,35 (a 50°/0,45 o lago ficava sob uma sombra de ~1 km o tempo todo). Smokes (um de cada vez): os 27 casos do `clouds` passam (`noon` 2,9 %, `sunset` 4,4 %, `backlit` 3,4 %, `far-cloud` 3,9 %, `timing` alto 2,22 / médio 0,86 / baixo 1,01 ms), `sky` e `antialiasing` passam (`waterOrbit` turva 2,8–3,2 %, `cloudsMotion` 0,02 %/0,75 %/1,04 %; em duas das três rodadas em série (depois dos 27 casos do `clouds`) o `waterOrbit` turvo deu os mesmos 19,5–27,6 % e passou nas duas rodadas isoladas com o mesmo código: intermitente, em aberto). Vídeos (porta 5184; brilho médio por quadro; antes = rodada 4): `solpostolento` horizonte (faixa de 30 linhas) máx. 41 níveis, 3190 quadros > 2, 2043 alternâncias → máx. 1, nenhum; chão e céu ≤ 1; `solposto` horizonte 41/864/534 → 2/0/0, chão > 2 só na passagem do sol por trás da nuvem (9,4 s, máx. 5, sem alternância); `nuvens`, `pordosol`, `voo`, `sombrasnuvens` sem alternância (as variações > 2 com a câmera andando ou o sol saindo da nuvem; no `sombrasnuvens` a silhueta das colinas com a câmera girando dá ~5 níveis por linha, movimento real). Em aberto: o `voo` acima da camada vê a borda do terreno (6 km), como via a do plano de 4 km.

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

- [x] T029 [GPU] [US3] Mapa de transmitância visto do sol em `src/elements/gpu/wgsl/clouds/cloud_shadow.wgsl` e na parte `shadow` do `CloudFlow`: 512², 32 km, encaixe no texel, 48 passos, metade das linhas por quadro (série 037 reprojetada pelo vento e pela câmera); teste contra `T(p)` da referência (smoke `clouds`, caso `shadow-map`); tempo ≤ 0,4 ms. — **Feito: mapa em quartos do trecho, 384² × 32 passos no alto (0,54–0,81 ms; o orçamento era 0,4 — em aberto); `shadow-map` diferença média sob a nuvem 0,018 (SC-004).** **Rodada de tempos (2026-11-17)**: 0,66–0,71 ms no alto (256² × 64 passos; vazão, não latência: 192² mede 0,42), 0,39–0,47 no médio, 0,19–0,23 no baixo. Com o cache de espalhamento sobreposto, o mapa sai do caminho crítico (o quadro não mudou com ele a metade). **≤ 0,4 no alto: em aberto** — a peça que falta é a série 037 lida pelas contribuições (`light_transmission` no forward, nos froxels e na GI leem o mapa por consumidor, não por slot de canal): com ela, metade das linhas por quadro. `shadow-map` 0,027 (SC-004), `sun-sweep` 0,016. **Rodada 10 (2026-11-19, `2fce34af`), por páginas (research.md, R11 revisto)**: o mapa de recortes (8 níveis, 8 × 8 páginas de 16² texels, 50 m no primeiro; o atlas `shadow` e o registro `shadowPages` como séries por páginas da C2; endereço toroidal; cada página lida pelo plano do sol do desenho dela) refeito por orçamento (128/96/64 páginas) pela mudança prevista e medida em T (1/255). Caso `timing`, parado: o mapa (escolha + desenho com as provas) **0,18 ms no alto** (0,017 + 0,167; antes 0,635), 0,18 no médio, 0,24 no baixo — **≤ 0,4 ✓**. `shadow-map` 0,022 (antes 0,027), `sun-low` 0,016 e 0 voltas (ref 1), `sun-sweep` 0,006, `sun-below` 0,032/0,000. Referência f64 do esquema (`cloudShadowPages.test.ts`): parado, nenhuma página refeita e erro 0; com o sol andando e orçamento para todas, erro ≤ 1 nível.
- [x] T030 [GPU] [US3] Contribuição a `light_transmission` (ordem 25, só a luz do sol do `Sky`) em `src/elements/media/clouds/points.ts`: uma textura amostrada e um uniforme (pela filtragem bilinear da sombra); contagem de ligações do forward, `media_froxel_inject`, traçado da GI e `refraction_path` antes/depois, registrada e verificada contra os limites do adaptador (T002); a autossombra longa da própria nuvem pelo mapa (`cloud_light.wgsl`). — **Feito: contribuição de ordem 25, uma textura amostrada, um amostrador e um uniforme por pipeline que lê a luz (contagens na T002); a autossombra longa pelo mapa no `cloud_light.wgsl`.**
- [x] T031 [GPU] [US3] Panorama das nuvens 256 × 128 em `src/elements/gpu/wgsl/clouds/cloud_panorama.wgsl` e na parte `shadow` do `CloudFlow`: 32 passos, 3 de luz, ¼ dos texels por quadro (série 037, recomeça com a câmera a ¼ da espessura); contribuição a `sky_cover` em `src/elements/media/clouds/points.ts`; teste contra a referência por direção (smoke `clouds`, caso `panorama`); tempo ≤ 0,3 ms. — **Feito: `panorama` erro médio de transmitância 0,013; 0,15–0,33 ms.**
- [x] T032 [US3] Smoke `src/__smokes__/clouds.ts`, casos `ground-shadow` (SC-004, borda suave, sombra que anda com o vento), `overcast-ambient` (a luz ambiente e a GI caem na proporção da referência; o sol direto quase some), `water-reflection` (o reflexo na água pelo `refraction_path` mostra as nuvens), `fog-in-front` (névoa perto, nuvens longe, sem halo nem borda dupla), `mountain-and-cloud` (montanha e nuvem a 10 km esmaecem igual, US3 cenário 5). — **Feito: `shadow-map` (SC-004), `overcast-ambient` (luz do céu encoberto a 7 % da referência; sol direto × 0,0025), `water-reflection` (83,7 % dos pixels do reflexo mudam), `fog-in-front` (**em aberto**: resíduo 8,4 %; na geometria, a névoa atenua igual as três distâncias, 0,2 %), `mountain-and-cloud` coberto pelo `aerial-geometry` e pelo `far-cloud` (a mesma tabela).** **Retomada: `fog-in-front` fechado (esfera de névoa em volta da câmera, blocos de 8 × 8 px: resíduo 0,06 %); o chão preto dos vídeos era o chão na sombra dos cúmulos sem a luz do céu — o `Sky` passou a iluminar as superfícies sem GI (chão sob nuvem 41 → 3456 nits). Aberto: nada além dos casos de luz da T024/T026.**
- [x] T033 [US3] Os smokes da luz sem regressão com nuvens desligadas e as contagens de ligações de T030: `globalIllumination`, `giNoise`, `fog`, `refraction`, `fluidSurface`, `wetting`, `limits`, `adapterLimits`. — **Feito: ver T012 (os da luz passaram, salvo o tempo do `fog` e do `fluidField`); `limits`, `adapterLimits` passaram na linha de base e no gate.** **Bisseção (2026-11-17, árvore `clayflow-041base`, `npm ci` própria, um smoke por vez, A/B intercalado)**: `fog --query case=timing`, por pixel a 1280×720 — `27bad146` 0,52/0,59 ms, `a9873912` 0,90/0,91 ms (intercalados, mesma rodada): **o registro é `a9873912`** (perspectiva aérea na geometria e o `SkyCompositeFlow`). Causa isolada: no ramo (`137f0025`), sem o passe de composição (o `dispatch` sem gravar) a névoa volta à base (0,51–0,56 contra 0,72–0,82 com ele; a base 0,45–0,59); com o passe e todo fragmento descartado, o custo fica (0,68–0,70) — é a passagem de render sobre a cor resolvida em 4K (com MSAA), não o trabalho dos fragmentos. **Não corrigido nesta rodada** (limite de turnos): a correção proposta é a perspectiva aérea como contribuinte do `Sky` no ponto `scene_fog` (composição "na frente de", a mesma ordem da R13), no desenho das superfícies, e o `SkyCompositeFlow` só com `CloudLayer`. O `fluidField` não foi medido nesta rodada. **Rodada 3 (2026-11-18), corrigido**: a perspectiva aérea é a contribuição do `Sky` ao ponto `scene_fog` (ordem 10, atrás da névoa dos volumes, a ordem da R13), no desenho de cada superfície; o ponto passa a devolver `SceneFog` (`scattered`, `transmittance` por canal: a atmosfera é cromática); o fundo passa o ponto a `SCENE_FOG_BACKGROUND` (10⁷ m), onde a atmosfera não soma (já está na vista do céu); o `SkyCompositeFlow` só existe com `CloudLayer` e compõe só as nuvens (`cor·Tc + Sfog·(1 − Tc) + Tfog·Sc`, a névoa do infinito). Medido contra a base (`clayflow-041base`, `3cd0069c`, intercalado): `fog --query case=timing` — a névoa custa 0,94/0,96 ms (por pixel 0,26–0,30) contra a base 0,91/1,02 (por pixel 0,27–0,35); a 3ª rodada caiu nas duas árvores (relógio da GPU). `fluidField --query case=timing` — a água 44,9/49,3 ms (alto), 27,9/29,0 (médio), 25,8/27,0 (baixo) contra a base 51,7/47,1, 29,2/28,4, 26,0/26,5: sem a regressão de +40 % (o limite de 45 ms e o de 8,5 ms da construção falham nas duas árvores igual, estado da GPU). `sky` passa (`aerial-geometry` ≤ 3 % em 2, 10 e 30 km; com névoa, 0,1 %); `fog`, `limits`, `adapterLimits`, `readiness` passam; `clouds` (`fog-in-front` 0,07 %, `water-reflection` 86,5 %, `noon` 2,5 %, `sunset` 3,5 %, `backlit` 3,1 %, `far-cloud` 3,7 %) passa. **Ciclo de vida (item da rodada)**: tirar o `Sky` com a `CloudLayer` na cena deixava o `CloudLightFlow` e o `CloudFlow` ativos com pipelines esperando o uniforme `sky` (o `SkyCompositeFlow`, que esperava `sky_aerial_lut`, já sai com o `Sky`): sem céu eles soltam os pipelines e os preparam de novo na volta — teste `src/elements/media/clouds/__tests__/lifecycle.test.ts` (tirar e pôr o `Sky`, tirar a camada e depois o céu, só o céu: pronto em cada passo). Fechamento da rodada (`0d8867d3`, um por vez): `globalIllumination`, `giNoise`, `refraction`, `fluidSurface`, `wetting`, `antialiasing`, `sky`, `fog`, `limits`, `adapterLimits`, `readiness` passam; o tempo da névoa e o do `fluidField` iguais aos da base.

**Checkpoint**: US3 completa e testável sozinha.

---

## Phase 6: User Story 4 — Rápido o bastante para tempo real (Priority: P2)

**Goal**: ≤ 3 ms no alto, ≤ 2 ms no médio, ≤ 1,2 ms no baixo; estável com câmera e vento; adaptado pelo perfil e pelos
limites.

**Independent Test**: a cena da US1 no bench com o tempo por passe por perfil, a cintilação e o rastro com a câmera
girando e vento no smoke de antisserrilhado, o interior com a camada (≤ 0,3 ms) e o perfil de dispositivo mínimo.

- [x] T034 [US4] `RENDER_PROFILES[*].clouds` em `src/elements/render/Renderer.ts` (passos, passos de luz, oitavas, panorama, sombra, cobertura de R15) e a troca de perfil realocando os alvos (as séries recomeçam pela invalidação); teste em `src/elements/render/__tests__/Renderer.clouds.test.ts`. — **Feito: `Renderer.clouds.test.ts` (valores por perfil; a camada adotada segue o perfil e realoca).**
- [ ] T035 [GPU] [US4] Medida por passe das nuvens no perfiler (rótulos `CloudFlow.*`, `CloudNoiseFlow.*`, `SkyCompositeFlow`) e o caso `timing` no smoke `src/__smokes__/clouds.ts`: alto ≤ 3 ms, médio ≤ 2 ms, baixo ≤ 1,2 ms; interior com a camada ≤ 0,3 ms; sem camada, nenhum pipeline das nuvens preparado (SC-005). — **Feito: medida pelo quadro (com − sem a camada): alto 2,0–2,8 ms (≤ 3), médio 0,8–1,9 ms (≤ 2), baixo 0,6–2,2 ms (≤ 1,2: **em aberto**, a medida oscila com o estado da GPU); sem camada, nenhum pipeline nem passe (teste). Interior: não medido.** **Rodada de tempos (2026-11-17, `137f0025`)**: medido pelo método do bench (um app, aquecido, com e sem a camada intercalados, 5 repetições, mediana e faixa) **com a GPU ocupada** — no ritmo de 60 Hz o M4 baixa o relógio da GPU e as passagens das nuvens mediam até 1,5 × (os primeiros ~15 s de um app e o perfil baixo sozinho; as da tela, limitadas pela banda, não mudam): era daí a oscilação de ±1 ms. Os 15,4 ms do vídeo `nuvens` eram a soma dos passes (`totalMs`, conta a sobreposição) no ritmo de 60 Hz; o intervalo do quadro (`spanMs`) era ~9,7 ms, dos quais 6,3 ms das nuvens e 3,3 ms do resto (o chão com sombra, o forward, a resolução temporal e a apresentação). Causa principal: fora do mapa de cobertura (64 km) a densidade avaliava o fBm procedural a cada passo — os caminhos do cache (grade de ±64 km) e a marcha distante. Correções: mapa de 256 km (1024² no alto, 512² no médio e no baixo); majorante dos caminhos pelo teto da densidade e colisão nula pela forma sem o detalhe; cache filtrado no espaço; tabela aérea em varredura paralela. Caso `timing` (vista do bench, cobertura 0,5): **alto 2,78 ms (2,77–2,80) ≤ 3 ✓; médio 1,68 ms (1,55–1,81) ≤ 2 ✓; baixo 1,71 ms (1,11–1,72) > 1,2 — em aberto** (`b98c8dca`, os caminhos antes do filtro; com eles despachados por último, 2,76/1,60/1,59, mas o crepúsculo voltava às estrias) (a marcha em ¼, a reconstrução, o aumento e a composição, iguais nos três perfis, somam ~1,3 ms; o baixo pede a marcha em resolução menor). Na cena `nuvens` (o chão e o sol com sombra): alto 1,76–2,18, médio 0,71–0,77, baixo 0,94–1,10 ms (aquecida). **Rodada 3 (2026-11-18)**: no perfil baixo a marcha ficou em resolução menor — `CloudQuality.marchScale` 4 (o alvo reconstruído a 1/16 da tela, a marcha a 1/64 por quadro; 2 no alto e no médio), com a reconstrução, o aumento (as quatro leituras de profundidade por vizinho a cada meio texel) e o despacho pela escala (`cloud_march_scale`, `timing.z`). A redescrição da camada pelo perfil derrubava o app (`GpuResourceStore: missing textureview`: o grupo do `cloud_upsample` refeito com a vista retirada da saída antiga antes do `framePrepare`): corrigido na C2 — o `ResourceSystem` marca as vistas que destrói (`isRetired`) e a fonte privada retirada espera o Flow religar; e o `CloudFlow`/`CloudLightFlow` religam no `slotChanged`, o `SkyCompositeFlow` solta os pipelines quando a camada sai (a troca de camada do A/B prendia o `whenReady`). Testes: `lifecycle.test.ts` (6 casos), `Renderer.clouds.test.ts`. Caso `timing` (3 rodadas): alto 2,59/2,59/2,59 ms ✓, médio 1,35/1,39/1,40 ✓, **baixo 1,40/1,56/1,54 ms — ainda > 1,2**: a marcha caiu de 0,87 para 0,56 ms por passe, mas o baixo mede igual ou acima do médio fazendo menos trabalho — o custo é a latência da cadeia de passes dependentes (cobertura → sombra → caminhos → filtro → panorama → marcha → reconstrução → aumento → composição), não vazão: metade das sondas caminhando (`stride` 16) não mudou o passe dos caminhos (1,22 ms), que é o do caminho mais longo. Exatidão no baixo (`--query profile=low`): `noon` 3,8 %, `backlit` 6,6 %, `fly-through` 0,8/17,5 %, `sunset` **6,0 % (falha, > 5 %)** — com a marcha a ¼ o mesmo baixo dá `sunset` 6,9 % e `backlit` 6,5 %: a marcha menor não piora; o desvio é dos outros parâmetros do baixo (anterior a esta rodada). Em aberto: o baixo ≤ 1,2 ms pede tirar passes do caminho crítico (o cache e o mapa visto do sol lidos do quadro anterior pela série 037 — a peça do item 6, que vai ao usuário antes). **Rodada 10 (2026-11-19, `2fce34af`, o mapa e o cache por páginas)**: caso `timing` — **alto 2,90 ms (2,85–2,91) ✓, médio 1,33 (1,32–1,33) ✓, baixo 0,75 (0,66–1,21) ✓**; por passe no alto: mapa 0,18 (era 0,64), escolha do cache 0,043, caminhos 1,25 (latência; era 1,43), filtro 0,15 (era 0,05: as 27 sondas lidas do buffer, com a vista só de leitura). **Interior (caso novo `interior-timing`, sala fechada): 0,80 ms (0,79–0,81) > 0,3 — em aberto**: sem céu visível, seguem a cobertura 1024² inteira (0,16), os caminhos do cache (1,26, sobrepostos), o panorama (0,30), a reconstrução e o aumento (0,32) e a composição (0,42); a peça que falta é a visibilidade do céu pela marcha do quadro anterior (série 037) regendo o orçamento do cache e do panorama, e a cobertura por páginas. **Rodada 11 (2026-11-19)**: `timing` alto 2,86 / médio 1,31 / baixo 0,76 ms ✓. **`interior-timing` 0,62 ms (0,61–0,63; era 0,80) > 0,3 — em aberto**: por passe (conta sobreposição) cobertura 0,16, mapa do sol 0,17, caminhos 1,34 (latência), filtro 0,13, panorama 0,31, tabela aérea 0,09, reconstrução 0,26, aumento 0,06, composição 0,42, máscara do disco 0,41. Não feito nesta rodada: a visibilidade do céu pela marcha do quadro anterior regendo o orçamento do cache e do panorama e a cobertura por páginas. Medido o que ela teria de reger: o mapa e a cobertura não podem parar só porque nenhum pixel vê a casca (a luz do sol que entra pela janela leva a sombra das nuvens), o panorama alimenta o reflexo e as sondas mesmo sem céu na tela, e a reconstrução, o aumento e a composição são passes de tela — o despacho indireto pela contagem do quadro anterior (série 037) cobre os de compute; a composição (passe de desenho) não. **Rodada 12 (2026-11-19)**: `interior-timing` **0,372 ms (0,370–0,375; era 0,62) > 0,3 — em aberto**. Feito, exato: a superfície mais perto que a casca (`cloud_shell_nearest`: a distância da câmera à esfera da base, ou à do topo) não tem nuvem na frente — a reconstrução escreve o valor exato (T 1) sem ler histórico nem vizinhos (0,19 → 0,03 ms) e o aumento escreve sem ler o alvo reconstruído. Medido e desfeito: a composição com a mesma saída antecipada por pixel não muda (0,32–0,39 ms): o custo dela é carregar e gravar a cor resolvida e o alvo da luz no passe de desenho, que o descarte não evita, e um desenho indireto com zero vértices ainda abre o passe. A máscara reativa do disco (`SkyReactiveFlow`, 0,18–0,33 ms por passe) roda também sem a camada (não entra na diferença); com o sol fora da tela o retângulo já sai degenerado. Falta, e é peça estrutural (parado aqui, a regra): (a) passes de desenho e de compute que só existem onde há céu — a decisão vem da GPU (a fração de céu da marcha), e a C2 não tem como pular um passe nem marcar uma série como não escrita por decisão da GPU (o `written()` é declarado pela CPU; uma série pulada por despacho indireto seria lida pelo atraso como se valesse); (b) a composição como compute sobre a lista de blocos com nuvem (despacho indireto, ler-modificar-gravar a cor) em vez do triângulo de tela cheia; (c) o orçamento do panorama (0,31) e dos caminhos do cache pela leitura medida dos consumidores (o reflexo e as sondas), um canal de demanda que hoje não existe. Tempos com o código desta rodada: `timing` alto 2,85 / médio 1,27 / baixo 0,79 ms ✓.
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
      **Fechamento (2026-11-21) — a bateria uma vez pelo fonte** (headless, porta 5181, 900 s por smoke; `--dist` não rodada):
      passam `adapterLimits`, `antialiasing`, `bigMesh`, `caustics`, `churn`, `computeKernels`, `contactSet`, `deviceFloor`,
      `dispatchCost`, `drawCulling`, `energy`, `extensionPoints`, `fluidBehavior`, `fluidSurface`, `giNoise`,
      `globalIllumination` (552 s), `gpuTiming`, `hdr`, `integration`, `lighting`, `limits`, `materials`, `multiApp`,
      `nodeGraphs`, `parametricSurfaces`, `particles`, `pointCloud`, `rayScene`, `readiness`, `render`, `rigidContacts`,
      `scale1m`, `sky`, `softEnergy`, `softSurface`, `stress60s`, `time`, `trajectories`, `transforms`, `virtualTextures`,
      `wetting`. Falhas e o que foi feito: (1) `shaderLibrary` e `refraction` — erros do WebGPU sem escopo, do próprio smoke,
      que o executor passou a reprovar na T081: o struct vazio do `ForwardWork` na conferência de layout e a leitura da luz
      que chega com 4 bytes por pixel (o alvo é `rgba16float` desde a T074) — corrigidos (`8e285447`), os dois passam
      (`refraction` 415 s). (2) `fog` 1,51 ms (≤ 1,05) logo depois do `fluidSurface`: sozinho 1,39 e 1,19 com a GPU quente;
      no A/B contra a árvore da T081 (`aff4a497`, `npm ci` próprio) em seguida, T081 0,92 e o ramo **1,01 ✓** — o código dos
      froxels não mudou desde a T081. (3) `fluidField` (água, sem `Sky`) falha no tempo: no A/B, a árvore da T081 dá a
      água 43,2/52,1 ms no alto, 32,7/31,8 no médio, 34,8/29,8 no baixo (tetos 45/30/28, calibrados num M4 Max) e o ramo
      56,1/60,7/55,0 no alto, 53,5/43,2/33,4 no médio. Causa medida: os alvos da cena ligáveis como storage de leitura e
      escrita (a cor, a luz que chega e a máscara reativa, T074: a composição das nuvens e a máscara do disco por compute)
      tiram a compressão do alvo de desenho — o ramo sem o uso dá 49,3/31,9/29,7, e as duas features novas sozinhas na
      árvore da T081 46,9/30,3/29,0 (não pesam). O storage sob demanda (os `FrameTargets` redescritos pela entrada de
      `CloudLayer`/`Sky`) deu 43,0/31,7/32,4, mas a cor realocada com a cena montada deixa o `PostFlow` esperando
      `src_tex` (a vista guardada pela `discriminator`, que não muda; só a troca do canvas religa os consumidores): os 38
      casos do `clouds` com camada não ficaram prontos — desfeito (`8d1387b4`). **Em aberto**: a peça estrutural (os
      consumidores dos alvos religando na redescrição, ou o uso de storage decidido antes da alocação) e os tetos do
      `fluidField` no médio e no baixo, que já falham na T081. (4) `clouds` inteiro passa de 900 s numa página: rodado caso a
      caso — passam todos menos `timing` `high-sun` (4,59 ms, T074) e `interior-timing` (2,26 quente; frio 0,317/0,383/0,200,
      T074/T035); `sun-below` falhava desde `670f5203` (T080, bisseção: o pulo de 0,5° do sol se redesenha em 3–4 quadros
      pela fila de prioridade; com 2 quadros 0,125, com 4/8/30 0,000) — o caso lê depois de 4 quadros (`872b4b2d`). Em série
      no `timing`: alto 2,32 ✓, médio 1,74 ✓, baixo 1,15 ✓. (5) `videoScenes` não é smoke (a página do gravador antigo pede
      `?scene=`). Vitest completo (299 arquivos, 2254 testes), `tsc`, `eslint` (0 erros; `SkyCompositeFlow` e
      `SkyReactiveFlow` importavam a Camada 1, corrigido em `374a35a7`), `prettier`, `check:circular`, `doc:coverage` e
      `build:lib` passam; `linearDispatch.test` reprovava o despacho do volume de τ (corrigido em `b44e90ab`).
- [ ] T043 `bench:check` contra o baseline: nenhuma cena existente regride > 10 % de GPU além do custo da perspectiva aérea medido (T011) nas cenas com `Sky`; baseline regravado com a máquina livre, com o racional registrado em `specs/041-nuvens-volumetricas/baseline.md`.
      **Fechamento (2026-11-21)**: `bench:check` (50,6 min) reprovado contra o baseline do Chrome 157 (`c80e4f79`, do
      `develop`): GPU `rigid-bodies/1k` +22 %, `particles/4k` +23 %, `instances/10k` +11 %, `graph-geometry/static` +10 %;
      CPU `instances/100k` 0,14 → 0,67, `surfaces` 0,14 → 0,62–0,67. A/B na mesma sessão (só clayflow, headless) contra o
      `develop` em árvore própria: na GPU todas as cenas reprovadas a ±1,5 % (`instances` 10k/100k, `rigid-bodies` 1k/10k,
      `particles` 4k/4k-cohesion, `surfaces`), menos `graph-geometry/static`, que oscila 0,37–0,59 ms entre execuções do mesmo
      código; o CPU alto do `instances/100k` e do `surfaces` está também no `develop` de hoje (0,57 e 0,49–0,51): a máquina,
      não o ramo. Regressão real do ramo: em `surfaces` o CPU +0,11–0,15 ms (`develop` 0,49/0,51, o ramo sem o storage dos
      alvos 0,51/0,55, o ramo 0,62/0,67 em duas execuções) — a mesma causa do `fluidField` na T042 (os alvos ligáveis como
      storage), em aberto com ela. As cenas com `Sky` (o +1,6 ms por desenho da T081): `global-illumination/off` GPU 5,53 →
      **4,15 ms** (−25 %) — o custo da perspectiva aérea não aparece como regressão no bench. As cenas `clouds` (`noon`,
      `sunset`, `flight`) não estão no baseline. **Em aberto**: o baseline não foi regravado (gravá-lo agora esconderia a
      regressão do storage dos alvos).
- [ ] T044 Conferir as caixas deste arquivo contra o código e abrir o PR do ramo para o `develop` (com a confirmação do usuário).

---

## Phase 8: User Story 5 — O tempo: baixas, altas e tempestades (Priority: P2)

**Goal**: um campo de pressão sinótico (padrão ou grafo) dita a cobertura, o tipo e o topo das nuvens e o vento que as
leva: tempestades (cúmulos-nimbos até a tropopausa, com bigorna) nas baixas, céu limpo nas altas, faixas nas frentes
(FR-023–FR-028, R19).

**Independent Test**: uma baixa gaussiana conhecida: o vento da GPU contra a referência f64 (e esta contra a solução
analítica) no norte, no sul e no equador; a torre e a bigorna; a faixa entre uma baixa e uma alta; o custo; o vídeo
`tempestade` (SC-010–SC-013).

- [x] T045 [P] [US5] Referência f64 do tempo em `src/elements/media/clouds/reference/cloudWeather.ts`: o padrão de sistemas (núcleo C², vida sin², altas com o teto do equilíbrio regular, amplitude por f_e), o estêncil de 9 pontos, o vento equilibrado `U = G/(r + i(f + κ_e u_t))`, Ekman, Okubo–Weiss e a frente, o mapeamento para cobertura/tipo/topo e o relaxamento; testes AAA em `reference/__tests__/cloudWeather.test.ts`. — **Feito (`4864cc59`, `08db3cdc`): 21 testes — o vórtice gaussiano contra o vento gradiente analítico a 0,1 % (baixa e alta regular a 45° N/S, alta no teto fR/2, baixa a 20°), o sentido do giro nos dois hemisférios, Guldberg–Mohn (ângulo atan(r/f)), o equador (antitríptico, contínuo em passos de 0,05° entre −3° e 3°, norte e sul espelhados), Ekman contra o laplaciano fechado e a forma (H r/f)·ζ_g, Okubo–Weiss (rotação e deformação puras), a frente (sistema isolado 0, par baixa–alta > 0,5; calibrada: isolado ≤ 0,41, par 0,62, duas baixas 0,81 → faixa 0,45–0,75), a faixa suprimida na subsidência, o relaxamento (semigrupo), o padrão contínuo no tempo (10 min ≤ 1,2 % da amplitude em 4 vidas) e no espaço (laplaciano contínuo na borda das células).**
- [x] T046 [P] [US5] O topo local e a bigorna na referência (`cloudModel.ts`: o quarto canal da cobertura, `anvilExponent`), com testes. — **Feito (`4864cc59`): sem o quarto canal, o resultado de antes (bit a bit); a bigorna só com tipo ≥ 0,9, `c^e` contra a conta fechada.**
- [x] T047 [GPU] [US5] O kernel do tempo (`gpu/wgsl/clouds/cloud_weather.wgsl`, `cloud_pressure_default.wgsl`, `cloud_weather_grid.wgsl`, `cloud_weather_map.wgsl`) no `CloudLightFlow` (`CloudLightFlow.weather`, antes do mapa de cobertura): o estado como série da 037 (`weather`, `rgba32float`, 128²) trazido pelo vento e relaxado, e o vento/subida/frente (`weatherWind`); o centro do quadrado calculado no shader pela vista e pela vista anterior. — **Código feito (`d60a8abc`, `08db3cdc`), WGSL validado pelo naga (CPU) e a composição nos testes (`shaders.test.ts`: laços de teto constante — 9 células, varredura de 16, bisseção de 24); ligações: storage 1, amostradas 1, storage textures 2, uniforme 1 (+ o pool da função de pressão com parâmetros). Falta na GPU: o teste contra a referência (T052) e o tempo (T055).** **Na GPU (2026-11-18, depois da junção com os raios crepusculares, `646c2533`): `pressure-wind` passa — 650 texels por latitude: vento a 0,08 % do máximo (11,3 m/s) a 45° N e 0,07 % a 45° S, subida a 0,06 % (máx. 10,3 cm/s); no equador vento 0,07 % (máx. 189 m/s, a baixa do caso sem a escala da latitude), descendo o gradiente (−118,3; −1,2 m/s a leste do centro); o giro a leste do centro: −6,91 m/s (norte) a 45° N, +6,90 (sul) a 45° S. Tempo: o estado 0,063 ms (≤ 0,15).**
- [x] T048 [GPU] [US5] O mapa de cobertura pelo estado (`cloud_coverage_weather.wgsl`: as células de cúmulos por cima, o topo local no canal A, a borda cedendo ao tempo bom) e a densidade com o topo local e a bigorna (`cloud_density.wgsl`, `cloud_common.wgsl`; o teto do rastreamento delta com a bigorna). — **Código feito (`d60a8abc`); sem o tempo e com tipo < 0,9 a densidade é a de antes (o canal A é 1 e o expoente 1, sem `pow`). Ligações do mapa com o tempo: storage 1, amostradas 1, storage texture 1, uniforme 1 (sem: uniforme 1, storage texture 1); as marchas, a sombra, o panorama e os caminhos não mudam. Falta na GPU: T052, T053 e a regressão do `clouds` (T055).** **Na GPU: o mapa de cobertura pelo tempo contra o mapeamento da referência, 400 texels, 0,00/255; a torre e a bigorna no `storm` (T053); o mapa com o tempo 0,183 ms contra 0,158 sem (acréscimo 0,025 ms ≤ 0,05). `clouds` sem regressão (T055).**
- [x] T049 [GPU] [US5] A reconstrução temporal pelo vento do tempo (lugar `cloud_wind_at`; `cloud_wind_weather.wgsl`). — **Código feito (`d60a8abc`); sem o tempo, o mesmo vento uniforme. Ligações: +1 amostrada e +1 amostrador com o tempo. Falta na GPU: o `antialiasing` com o tempo e o vídeo (T055, T056).** **Na GPU: `antialiasing` passa (`cloudsMotion` cintilação 0,09 %, deriva 0,75 %, corte 1,13 %); o vídeo `tempestade` (T056).**
- [x] T050 [US5] API: `CloudLayer.weather` (valores, padrões `CLOUD_WEATHER_DEFAULTS`, validação com `RangeError`, ligar/ajustar/desligar), `shellTop`, `pressureFunction`, a `CloudPressureFunction` (ponto `cloud_pressure`), o empacotamento no `CloudNoiseFlow` (f, atritos, amplitude na latitude, teto das altas, topo do tempo bom, estêncil, validade do estado), o consumidor `CloudLayer.weatherWind`, JSDoc e exportações; testes. — **Feito (`d60a8abc`): `weather.test.ts` (padrões, validação, ligar/desligar, descritores, o uniforme contra a referência, o ciclo de vida: ligar, trocar a função de pressão e desligar, pronto em cada passo).**
- [x] T051 [US5] Achado: o `SkyCompositeFlow` com outra camada no mesmo quadro (o A/B sem quadro entre as duas) esperava a vista da camada antiga — refaz os pipelines quando a camada muda. — **Feito (`d60a8abc`): caso novo no `lifecycle.test.ts`.**
- [x] T052 [GPU] [US5] Smoke `clouds`, caso `pressure-wind`: o vento, a subida e a frente da GPU contra a referência numa baixa gaussiana a 45° N, 45° S e no equador (≤ 1 % do máximo; o sentido do giro; no equador, descendo o gradiente) e o mapa de cobertura pelo tempo contra o mapeamento (≤ 3/255) (SC-010). — **Caso escrito (`cb2defba`), não rodado.** **Passa (números na T047). A tolerância da frente pela sensibilidade da conta: `smoothstep(0,45; 0,75; √W⁺/f_e)` de diferenças de segundas derivadas quase iguais, erro relativo do f32 η ~ 10⁻⁴ no estêncil → Δ = η·(|p_EE| + |p_NN| + 2|p_EN|)·(r + |f|)/(ρ(r² + f²)·f_e) no argumento (a 45°, ~10⁻⁴; no equador, f_e = r, ~0,02); tolerância 0,02 + 5·Δ (antes 0,02 fixo: no equador 0,031).**
- [x] T053 [GPU] [US5] Smoke `clouds`, caso `storm`: a torre ≥ 85 % da tropopausa e a bigorna (colunas a 80 % ≥ 1,2 × as de 50 %) sobre o mapa e os volumes da GPU, e a vista de 60 km contra a marcha de referência (≤ 5 %) (SC-011). — **Caso escrito (`cb2defba`), não rodado.** **Passa: 840 colunas no núcleo, topo mais alto 10,24 km (tropopausa 11 km: 93 %); nas 457 colunas maduras (tipo ≥ 0,95) nuvem a 50 % da altura local em 378 e a 80 % em 451 (buracos 6 contra 79: a bigorna fecha o alto; a medida antiga, a razão das colunas ≥ 1,2, saturava com a torre cobrindo o núcleo: 1,19); vista a 60 km: luz 4,5 %, T 0,008, borda/centro 0,993 (128 quadros na média). Achado e corrigido na junção (`ce623250`, `56715213`): o trecho da perspectiva aérea além de 32 km (`sky_aerial_far`) não tinha a sombra das nuvens no ar — a luz das regiões de nuvem fina ficava 29,7 % acima; agora a marcha e o panorama trocam o lugar `sky_aerial_far_visibility` pela transmitância do mapa visto do sol (a bilinear de `e^(−τ)` dos texels, não de τ: a 50–100 km o texel tem quilômetros).**
- [x] T054 [GPU] [US5] Smoke `clouds`, caso `front`: a faixa entre uma baixa e uma alta (frente ≥ 0,5, a referência ±0,02) e a alta mais limpa que a baixa. — **Caso escrito (`cb2defba`), não rodado.** **Passa: frente máxima 1,00 em x = −47 km (a referência ±0,001); cobertura local média 0,215 do lado da alta contra 0,436 do lado da baixa.**
- [x] T055 [GPU] [US5] Tempo e regressão: caso `weather-timing` (o estado ≤ 0,15 ms, o mapa de cobertura ≤ 0,1 ms no alto, SC-012); o `clouds` inteiro (o topo local e a bigorna: `types` com tipo 1 muda junto com a referência), `sky`, `antialiasing` (`cloudsMotion`), `limits`, `adapterLimits`, `readiness`, `deviceFloor` sem regressão. — **Caso escrito (`cb2defba`), não rodado.** **Feito (um smoke por vez, 2026-11-18): `weather-timing` estado 0,063 ms, mapa +0,025 ms; `clouds` caso a caso — `noon` 2,9 %, `backlit` 4,2 %, `types` 3,3/3,6/3,9 %, `far-cloud` 4,5 % (era 6,6 % com a bilinear de τ, 14,1 % sem a sombra além de 32 km), `fly-through` 0,5/23,0 %, `shadow-map` 0,027, `sun-sweep` 0,011, `sun-low` 2,40/2,33, `sun-below` 0,005/0,000, `panorama` 0,009, `scatter-cache` 0,982, `timing` alto 2,45 / médio 1,01 / baixo 0,73 ms, os de cobertura, vento, máscara, grafo, névoa, reflexo e volumes passam; `sky`, `antialiasing`, `limits`, `adapterLimits`, `readiness`, `deviceFloor` passam. **Em aberto: `sunset` 13,6 %** — quatro regiões de nuvem rala a ~15 km rente ao horizonte (T 0,81) com o ar da GPU 0,4 nits abaixo (GPU 2,04 contra 2,46); era o aberto da R18 (203 %, o ar sem a sombra) e caiu com a sombra além de 32 km. Na junção, o `contract.test.ts` (SC-004 da 031) recusava o `@workgroup_size(64)` do `sky_overflow_visibility.wgsl`: constante nomeada (`c35cbc69`).** **Rodada 11 (2026-11-19)**: `sunset` 17,0 % (o aberto; 17,5 % na rodada 10). Isolado num raio por termo: com τ até o sol pelo mapa da GPU na referência (`?sundepth=map`), a pior região vai de 2,29 a 2,19 nits (GPU 1,76): o mapa explica ~20 % da falta. A tabela aérea nas colunas da região contra a referência na direção do centro da coluna e no fim da fatia (com a sombra das nuvens no ar): luz 1,44/1,39, 1,46/1,43, 1,67/1,78 ‰ e T igual em 3 casas — a tabela e a sombra no ar estão certas; a referência com a visibilidade em 128 passos (era 32) muda 0,01. As regiões têm a profundidade média de 14–16 km misturando raios até a nuvem rala perto e raios até nuvens a 50–100 km (a parte além de 32 km, `sky_aerial_far`, e a profundidade média única por pixel dos dois lados); falta separar essa parte. Em aberto. **Rodada 12 (2026-11-19)**: `sunset` 15,8 % (17,0 na rodada 11; 16,6 % com a média de 240 quadros). Separado termo a termo: (1) só ~19 % dos raios das quatro regiões acham nuvem, todos além de 32 km (32–64 e > 64 km; os outros 81 % são céu: a "profundidade média de 14–16 km" era a média com zeros); (2) o trecho além da tabela (`sky_aerial_far` com a visibilidade do mapa) espelhado em f64 iguala a referência com a mesma visibilidade (0,304/0,500 contra 0,304/0,500): a integral do ar está certa; (3) com o albedo 0 (só o ar), a GPU fica na referência em toda região menos onde o mapa erra a visibilidade (`[2,3]`: GPU 1,87, referência com o τ do mapa 1,91, exata 2,23); (4) a marcha fina contra a marcha com os passos da GPU (piso trecho/128, deslocamento inicial) emulada em f64 dá a mesma luz, e a referência convergiu (256 → 1024 passos, ±3 %; 64 → 192 passos até o sol, 2 %); (5) com a vista estreita (8°, `?zx=195&zy=200&fov=8`), a GPU fica na referência com o τ do mapa em toda região (6,85/7,12, 5,94/6,52, 5,25/5,33, 32,79/33,59) e longe da exata (9,16, 7,13, 6,09, 36,74). Causa: o mapa visto do sol não resolve as colunas das nuvens a 50–100 km rente ao sol baixo — texels de 0,1–1,6 km (níveis 1–5) na borda prateada; a bilinear de τ (a marcha) escurece e a de T clareia além da exata (com a de T: 11,98, 13,29, 8,15, 41,52): o erro é de resolução do mapa, não de filtro. Corrigido nesta rodada o recorte do histórico da reconstrução pela caixa de uma amostra por bloco, que cortava o detalhe claro menor que o bloco (a borda prateada perto do sol) com a câmera parada: agora o recorte só na medida da incerteza da reprojeção (o deslocamento entre as profundidades `d/2` e `2d` do trecho, 0 com a câmera parada ou girando; `cloud_reprojection_clip`, espelho em `cloudReconstruct.ts` com teste): 17,0 → 15,8 %. Em aberto: a resolução do mapa onde a vista lê as colunas distantes (páginas pedidas pela marcha, como os mapas de sombra virtuais) — peça estrutural do R11, vai ao usuário. Regressão com o código desta rodada, um smoke por vez: `clouds` caso a caso passa tudo menos `sunset` 15,8 % e `interior-timing` 0,372 ms — `noon` 2,8 %, `types` 3,1/3,3/2,9 %, `far-cloud` 4,4 %, `backlit` 5,7 % (borda/centro 0,994), `storm` 3,8 %, `scatter-cache` 0,975, `timing` 2,85/1,27/0,79 ms, e os de cobertura, vento, grafo, névoa, reflexo, sol, mapa, panorama, ambiente, voo, tempo e `sky-timing`; `sky`, `antialiasing` (`cloudsMotion` cintilação 0,07 %, deriva 0,34 %, corte 0,58 %), `render`, `globalIllumination`, `refraction`, `readiness`, `deviceFloor` passam; `fog` falha só no tempo (1,49 e 1,70 ms ≤ 1,05; a cena da névoa não tem `Sky` nem camada, nenhum pipeline dela mudou — a oscilação das rodadas 10 e 11); vitest completo 2179 testes passam (291 arquivos). **Rodada 14 (2026-11-19)**: `sunset` 14,7 % (15,8 na rodada 12) — só a referência mudou. Medido em f64 com os dados lidos da GPU, termo a termo, na vista estreita (8°) e na larga: (1) **a referência não estava convergida**: a visibilidade do sol no ar com 32 passos fixos (passos de 1,1 km no trecho de ~36 km até o sol a 4°) clareava o ar — na vista estreita, região [0,3]: 9,16 nits com 32 passos, 8,10 com 64, 7,88 com 128, 7,81 com 256, 7,80 com 1024; agora passos de 150 m por trecho (ao menos 32; com o sol alto, os 32 de antes: `noon` 2,8 %, `backlit` 5,6 % e 0,994, `types` 3,1/3,3/2,9 %, `far-cloud` 4,4 %, `storm` 3,8 %, iguais); (2) **os nós ao longo da coluna não são a causa**: uma referência que imita o mapa (o cone de 6 passos e o pedaço de 4 como a GPU, o nó de colunas f64 na mesma grade de texels e níveis) dá o mesmo com 16, 32, 64 e 128 nós (região [0,3]: 8,57/8,58/8,61/8,63), e com 16 nós iguala a leitura do mapa da GPU (8,57 contra 8,55: o pente com φ e o f16 não pesam); com a coluna exata do próprio ponto (sem a grade lateral) e 16 nós, a exata (9,14 contra 9,16); (3) **ler cada vizinho na profundidade do ponto** (o cisalhamento: a 4° a coluna deslocada Δ em cima cruza a casca ~14Δ adiante) não serve: no teste com as células, pior que o mesmo nó em todo texel (50 m: 0,025 contra 0,012 de T) — a fração do trecho acompanha a camada; (4) **T por texel (Jensen) passa do ponto**: +7 a +25 % nas regiões ralas (τ bilinear escurece, T bilinear descorrela a coluna da posição do ponto na nuvem); (5) **é a resolução lateral à direita** (horizontal, perpendicular ao sol), nos níveis 0–1 (texels de 50–100 m, quase todos os pontos): na vista larga a referência com o mapa emulado fica a 10,1 % da exata, com o texel à direita /2 a 5,6 %, /4 a 4,4 %, os dois eixos /2 a 4,7 %, só em cima /2 ou /4 sem mudança; redistribuir (à direita t/2, em cima 2t, as mesmas colunas) erra para os dois lados (+21 %/−37 %); marchar a própria coluna por 4 nós antes do mapa, 5,9 % (16 passos: custo de luz ×2,5). (6) **Há uma segunda diferença só na vista larga**: a GPU fica 13,6 % abaixo da referência com o mapa emulado na região [3,3] (1,81 contra 2,09; na estreita elas batem): a faixa de 2–4 px das nuvens a 50–100 km rente ao horizonte, ainda não separada. Tempo de base (um smoke por vez, a GPU ocupada): alto 2,84 ms, médio 1,26, baixo 0,78; mapa 0,168 ms. A correção pelo mapa é peça estrutural (páginas ×2 à direita com o sol baixo: atlas de 1024 páginas, o mapa ~0,34 ms ao meio-dia) e sozinha não fecha (a diferença de (6)): vai ao usuário. Em aberto. **Rodada 15 (2026-11-20, ramo `work/041-sunset-k`)**: `sunset` 14,7 → 5,0 % (três rodadas iguais), em três causas separadas termo a termo (f64 com os dados da GPU; a referência com o mapa da GPU, a vista estreita e a larga, o perfil por linha de pixel na coluna de regiões 3, o traçado cru contra o reconstruído). (1) **O mapa visto do sol: a resolução à direita.** O texel à direita passa a 0,2 × o em cima (`cloud_shadow_aspect`, constante), com 32 páginas físicas por nível à direita (2048 no atlas de 782² × 4 camadas; a janela tem o mesmo raio útil em metros nos dois eixos): a referência com o mapa da GPU vai de 10,1 a 3,9 % da exata. A razão pelo ângulo do sol (1 acima de 19°, 0,2 a 4°) foi medida e desfeita: o texel global escalava em torno do pivô a cada quadro do pôr do sol e o `solposto` saltava 27 níveis no chão num quadro (a base: 5). A faixa de mistura dos níveis passa aos 15 % de fora do raio útil (eram 30 %): 5,3 → 5,0 %. A penumbra da luz do sol (`cloud_shadow_transmittance_disk`) troca o disco pela leitura bilinear abaixo do lado maior do texel (com o lado menor, quase toda amostra ia pelas 16 leituras do disco: a tabela aérea 0,093 → 0,153 ms). (2) **A reconstrução: a faixa espalhada em blocos.** Rente ao horizonte a faixa de nuvens de 1–2 px (a 50–100 km) saía espalhada por 6–8 linhas e sobre o chão: a reprojeção do histórico usava o raio da amostra deslocada do antisserrilhado temporal (`camera_ray`), a leitura bilinear caía a ±¼ de texel, outro a cada quadro, e os três pixels não marchados do bloco a refiltravam todo quadro (difusão com a câmera parada) — agora o centro do texel sem o deslocamento; e o gradiente temporal largava o histórico pelo ruído da amostra única na faixa fina, com os quatro pixels do bloco no valor de um — o ruído esperado inclui agora o temporal de cada pixel (o segundo momento, brilho² e T², média exponencial na série `marchDepth`, `rgba32float`, pela própria série da 037, lido nas mesmas leituras do histórico; espelho e teste em `cloudReconstruct.ts`): 13,9 → 11,5 → 6,9 %. (3) **A referência não convergida** (rodada 14). Descartados com medida: os nós ao longo da coluna (16…128 iguais), ler o vizinho na profundidade do ponto (pior no teste), T por texel (Jensen, +7 a +25 %), a resolução em cima (÷2, ÷4 iguais), a fonte no centroide do passo da marcha (a face voltada à câmera no contraluz é a sombreada: pior). **O custo do mapa**: no regime nenhuma página é desenhada; o passe era o das provas (4 colunas por página por quadro, cada uma num laço serial numa invocação, 4 de 256 ativas): 0,56 ms com o sol a 4° na base. As provas em rodízio (cada página prova a cada 8 quadros) e repartidas por 32 invocações por coluna (redução em árvore no grupo): o mapa 0,10 ms a 4° e 0,07 ms a 60° com 2048 páginas (a base: 0,56 e 0,168 com 512). `timing` com a GPU ocupada e a trava da GPU (um processo por vez na máquina): a 60° alto 2,82, médio 1,31, baixo 0,72 ms; a 4° (`?el=4`) 2,96/1,43/0,73 ms (a base: 3,34/1,75/0,68). Um smoke por vez, o código final: `clouds` caso a caso passa — `noon` 2,0 %, `backlit` 2,6 % (borda/centro 1,005), `far-cloud` 2,2 %, `types` 3,0/2,2/2,7 %, `storm` 1,3 %, `sun-sweep` (pior 0,119; luz somada 9,68 contra 9,80), `sun-low` (variação 2,455 contra 2,334; voltas 2 contra 1), `sun-below` 0,041/0,017, `shadow-map` 0,015, os de cobertura, vento, grafo, névoa, reflexo, panorama, ambiente, voo, tempo, `scatter-cache`, `sky-timing`, `weather-timing` — menos `interior-timing` 0,360 ms (> 0,3; a T035: a base, medida agora, 0,361–0,375); `sky`, `antialiasing` (`cloudsMotion` 0,05/0,31/0,72 %; numa rodada o `waterOrbit` da água turva falhou com 20–28 % e passou ao repetir: 2,8–3,2 %), `limits`, `adapterLimits`, `readiness`, `deviceFloor`. Vídeos (claflow-web com `CLAYFLOW_ENGINE` na árvore do ramo, porta 5184; `scratchpad/041-video/rodada15-sunset/`): `pordosol` 50,68/45,94 dB, maior salto por quadro céu 0,28, horizonte 0,55, chão 0,13 níveis (rodada 10: 0,49/1,22/0,73), nenhuma alternância; `solposto` 51,07/46,13 dB, céu 2,04, horizonte 1,95, chão 1,17 (a base gravada agora: 1,01/1,66/4,95). Vitest 2190 testes passam. **Rodada 21 (2026-11-20; o ramo `work/041-sunset-k` rebaseado sobre `b58cff65` — sem conflito —, com os froxels da R21, o mapa de cobertura em níveis e a unidade dos froxels)**: reaberta — `sunset` 6,3 % na base rebaseada (5,0 % na rodada 15: a referência da região [3,3] subiu de 2,30 para 2,36 nits com a cobertura em níveis, a GPU ficou em 2,16) → **5,8 %** (8,1 % contra a imagem nítida). (1) **O texel à direita pela elevação do sol, medido e desfeito** (R11 revisto): em degraus 1 / ½ / 0,2 pela razão contínua `tan(el)/tan(19°)`, nunca acima dela, com a janela de 8 / 14 / 32 páginas à direita das 32 físicas, a página de outro degrau inválida e a janela refeita no quadro do degrau (a referência e os testes feitos): o `sunset` igual (0,2 a 4°), mas no `solposto` gravado a imagem saltava no degrau de ~9,8° 7,9 níveis no céu, 6,7 no horizonte e 4,8 no chão, e 1,9 / 4,5 / 3,6 no de 19° (fora dos degraus 0,8 / 1,3 / 1,6; o vídeo em `scratchpad/041-video/rodada21/degraus/`). Fica o texel à direita de 0,2 em toda elevação (rodada 15): o mapa (escolha + desenho) 0,09 ms a 60° e 0,16 ms a 4° no alto (≤ 0,4). (2) **O trabalho em andamento da rodada 15** entrou: a saída antecipada soma o resto da nuvem com a fonte do último passo (`T·luz/σ`) e a faixa de mistura dos níveis vai aos 8 % de fora — 6,3 → 5,9 %. (3) **A faixa [3,3] separada termo a termo** (o perfil por linha de pixel da região, a GPU contra a referência exata e contra a referência com τ do mapa da GPU): o mapa explica 0,04 de 0,19 nits (referência com o mapa 2,32 contra 2,36); o gradiente temporal não (sem ele, 2,14 contra 2,17); a representação explica ~0,07 — a nuvem da GPU é o alvo reconstruído a ¼ aumentado pela bilinear, e a faixa clara de 1–2 px que cai na borda da região passa em parte à vizinha. A referência compara agora na mesma representação (`compareView`: por texel do alvo reconstruído a média dos raios nele, por região os texels pesados como o aumento os pesa; o erro contra a imagem nítida no registro) — e é mais rápida (cada texel uma vez, a visibilidade do ar para em τ = 16: 391 → 221 s). **Em aberto: o resto da [3,3]** — nas duas linhas mais claras da faixa (202–203, as nuvens a ~50 km junto ao sol), o próprio texel da GPU fica ~25 % abaixo (17 contra 24 nits, com a referência pelo mapa 25): não é o mapa, nem o gradiente, nem o aumento; candidatos não medidos: o mapa de ocupação do raio pela cobertura em níveis (`cloud_ray_occupancy`, que mudou com `c03e0755`) e o piso do passo nos raios rasantes. Regressão com o texel de 0,2 em toda elevação (a rodada `final2`, um smoke): `noon` 1,3 %, `backlit` 3,3 % (borda/centro 1,013), `types` 2,3/1,5/1,7 %, `far-cloud` 2,9 %, `storm` 2,6 %, `timing` alto 2,58 ms (mapa 0,10 ms a 60°) passam; **`beam-gap` falha**: as bordas do feixe no ar 10,8/85,7 px contra 13,9/73,9 da f64 exata (11,8 px a mais; > 4) — com os degraus (razão 1 a 35°) passava; a borda do vão lida pelo texel em cima de 50 m com o sol a 35° (em aberto, não repetido por ordem do usuário). Com os degraus: `sunset` 5,8 %, `sun-low` (variação 2,445 contra 2,329; voltas 2 e 2), `timing` a 4° 2,73 ms (mapa 0,16 ms); vitest de `media/clouds` 117 testes passam. **Rodada 35 (2026-11-20; fechada)**: o ramo `work/041-sunset-k` rebaseado sobre `3bd070c5` (as provas com o sol de agora ficam, repartidas em 32 invocações por coluna). (1) **Os degraus de volta, com a troca misturada** (R11 revisto): a razão 1 / ½ / 0,2 com folga de 5 % na volta ao mais grosso; cada degrau no seu lugar das 46 páginas físicas à direita (2944 páginas, atlas 935²), dois vizinhos residentes juntos; o mapa novo desenhado dentro do orçamento (fila 8) e, com ele inteiro, o peso sobe 1/32 por quadro — o estado (de onde, para onde, peso) no registro de estado da série `shadowPages`, carimbado; a leitura mistura os dois só durante a troca. Referência f64 e testes em `cloudShadowPages.test.ts`. `solposto` (vídeo `scratchpad/041-video/rodada35/solposto.mp4`, 51,03/46,24 dB): no degrau de ~9,8° o maior salto por quadro 0,38 / 0,45 / 0,22 níveis (céu / horizonte / chão; de uma vez: 7,9 / 6,7 / 4,8); no de 19° 0,82 / 1,03 no céu e no horizonte (o chão cai com o sol entrando atrás da nuvem, também na gravação anterior); `beam-gap` passa (bordas do ar 9,4/76,9 px contra 13,9/73,9 da f64, 3,0 px a mais). (2) **A faixa [3,3] do `sunset`**: candidatos medidos — a ocupação do raio com 16 leituras da cobertura por trecho e 4 × os passos da marcha (512) não mudam nada (2,17 nits); separado por canal na linha de texel 101 (a faixa clara, nuvens a 40 km): o ar na frente (froxels 2,74 + tabela 0,48 contra 3,07 da referência) e a transmitância do ar (0,61 contra 0,62) certos; faltava luz da própria nuvem. **Causa**: o raio da marcha levava o deslocamento do antisserrilhado temporal (`camera_ray`, ±½ pixel da tela por quadro) enquanto o texel e a reprojeção do histórico são da área sem ele: a faixa de 1–2 px passava em parte às linhas vizinhas (a linha 101 reconstruída 18,1 contra 24,9 nits da referência). Corrigido: o raio pelo ponto da área do texel sem o deslocamento (`cloud_ray_at` em `cloud_march.wgsl`): a linha 101 20,9; `sunset` 5,8 → **3,9 %**. Bateria final (código final, uma vez; o `timing` em grupos depois do teto de 900 s): `sunset` 3,9 %, `beam-gap` 3,0 px, `noon` 1,6 %, `backlit` 4,1 % (borda/centro 1,012), `types` 2,4/1,9/1,7 %, `far-cloud` 2,5 %, `storm` 2,3 %, `timing` alto 2,80 / médio 1,06 / baixo 0,49 ms (o mapa: escolha 0,043 + desenho 0,068 ms a 60°), `ground-shadow` (3,5–6 km |Δ| 0,012, correlação 1,00), `sun-low` (variação 2,445 contra 2,329; voltas 2 e 2), `sun-sweep` (pior 0,114; luz somada 9,69 contra 9,81), `shadow-map` 0,020 passam; vitest de `media/clouds` 118 testes passam.
- [x] T056 [US5] Cena `tempestade` no claflow-web (uma baixa de mesoescala se aprofundando a 70 km sobre o terreno gramado, vista de longe, câmera parada, tempo a 1080 ×) e o vídeo (porta 5184) (SC-013). — **Cena feita (claflow-web `d58e538`), não gravada.** **Gravado (2026-11-18, porta 5184; `/private/tmp/claude-501/-Users-dantasgut-Documents-dev-geom-diff-calc-clayflow/0db1165c-31da-4a98-aebf-d257d0e29a91/scratchpad/041-video/rodada7/tempestade.mp4`, 18,8 MB recomprimido de 78 MB; folha `tempestade-folha.png`): 3600 quadros a 4 s cada (4 h em 60 s), a baixa a 55 km; conferência do codificador 50,59 dB no brilho e 45,61 dB em RGB; GPU 43 ms por quadro (o `ShadowFlow` do terreno, ~45 ms, aberto antes). Nos quadros: os cúmulos rasos, o céu limpando pela subsidência, a massa crescendo até a tropopausa com a base escura e o topo alto achatado (a bigorna a 55 km) e indo para leste. Brilho médio por quadro (160 × 90): imagem maior salto 2,45 níveis, 4 quadros > 2, nenhuma alternância; céu ≤ 1,01, nenhum > 2; chão maior 8,4, 89 quadros > 2, 1 alternância (as sombras das nuvens passando a 25–55 m por quadro); pixels destoantes (|p − mediana de 5| > 8) 5–76 por quadro. A primeira gravação, a 18 s por quadro (6 h em 20 s), saía granulada nas bordas finas (a reconstrução largava o histórico: 100–250 m por quadro) e com o chão alternando (33 alternâncias): a cena passou a 4 s por quadro. Em aberto: grão fino nas bordas ralas das nuvens que mudam de forma depressa, visível nos quadros parados.**
- [x] T057 [P] [US5] Docs: spec (US5, FR-023–FR-028, SC-010–SC-013, casos de borda), research R19, data-model, contrato, plan, guia `clay-engine-doc/docs/guides/clouds.md` (o tempo). — **Feito.**

- [x] T058 [GPU] [US5] A aparência do cúmulo-nimbo (o vídeo `tempestade` da rodada 7: banco branco de topo liso, base
      clara): o alcance da torre pelo tipo local (`cloud_tower_reach`), a água da torre na extinção (`cloud_tower_water`: 1 → 3
      nos 3 km acima do topo do tempo bom, 1 de novo na glaciação), a bigorna como o quarto canal do estado do tempo (nasce
      onde a torre chegou à tropopausa, trazida pelo vento da alta troposfera `weather.shear`, desfeita em 4 tempos de
      formação; uma lâmina de gelo de 2 km, 800 m abaixo da tropopausa, extinção 0,25) no lugar do `anvil bias`; a referência
      f64 junto (`towerWater`, `towerReach`, `anvilProfile`, `anvilSource`, `anvilRelax`); a reconstrução reprojeta a faixa
      da bigorna pelo vento de cima. Ver research.md, R19 (revisto).
- [x] T059 [GPU] [US5] O grão das bordas ralas: o passo e o cone da luz pela espessura do tempo bom; a ocupação do raio
      pelo topo das colunas (32 trechos, o piso pela parte ocupada, os vazios pulados); o detalhe pela pegada do pixel da
      marcha (`cloud_footprint`, `detailWeight`; a referência com o ângulo do pixel da GPU). Isolado por experimento (a mesma
      cena, a borda de baixo de um cúmulo, passa-alta 5 × 5): a reprojeção pelo vento da camada no lugar do vento do tempo
      0,96 → 0,96 (não é); a marcha só fina 0,96 (não é); o cache de espalhamento desligado 1,39 (não é: o cache tira ruído);
      o detalhe pela pegada 0,96 → 1,00 na região, o temporal 0,59 → 0,53; o relógio a 2 s por quadro 0,77, a 1 s 0,64, a
      1/60 s liso em 60 quadros — a causa é a reconstrução temporal (~7 amostras por pixel) que não acumula com a nuvem
      mudando a cada quadro do tempo acelerado; a cena passa a 2 s por quadro.
- [x] T060 [GPU] [US5] O chão que pisca (o `tempestade` da rodada 7): caso `storm-ground` (a mesma camada, o sol e a baixa;
      1 quadro = 4 s), a transmitância até o sol no chão da câmera da GPU contra a referência f64 no mesmo quadro: aos 2,7–3,7
      s do vídeo a GPU sobe de 0,00 a 0,79 e desce a 0,08, a referência de 0,00 a 1,00 e a 0,06; aos 14,7–15,7 s as duas vão
      e voltam (GPU 1,00 → 0,49 → 0,86 → 0,36 → 0,73; referência 1,00 → 0,56 → 1,00 → 0,40 → 0,61); luz somada GPU 67,35
      contra 72,76 (−7 %). É a física acelerada: a borda esfarrapada de um cúmulo passa pelo sol (24 m de vento por quadro), e a
      câmera a 2 m via só os primeiros metros de chão. A cena nova põe a câmera a 60 m: a sombra anda pelo terreno.

- [x] T061 [US5] O vídeo `tempestade` regravado (claflow-web `44dca11`, porta 5184; 7200 quadros a 2 s, 4 h em 120 s;
      `scratchpad/041-video/rodada8/tempestade.mp4`, 28,4 MB recomprimido de 110,8 MB; conferência do codificador 50,98 dB no
      brilho, 46,01 dB em RGB; GPU 158 ms por quadro, quase tudo o `ShadowFlow` do terreno com a câmera a 60 m — as nuvens
      ~6 ms). Brilho médio por quadro (160 × 90): imagem maior salto 0,41 nível, céu 0,51, chão 1,45; nenhum salto > 2 e
      nenhuma alternância (antes: chão 8,63, 90 saltos > 2). Smokes depois da mudança, um por vez: `clouds` caso a caso passa
      (`noon` 2,7 %, `backlit` 4,6 %, `types` 3,3/3,3/3,0 %, `far-cloud` 4,4 %, `storm` luz 1,4 % e T 0,007, `pressure-wind`
      0,00/255, `weather-timing` estado 0,064 ms e mapa +0,008 ms, os demais), exceto `sunset` 13,6 % (o aberto de antes,
      igual); `sky` passa; `antialiasing`: `cloudsMotion` 0,10/0,72/1,16 %, e o `waterOrbit` falhou uma vez com outra carga na
      máquina (26,8 %) e passou sozinho (2,89/2,82/3,17 %). **Em aberto**: nas torres em crescimento (30–90 s do vídeo) a
      parede da torre mostra estrias verticais e, numa delas, um disco claro achatado onde a lâmina da bigorna corta a torre; o
      grão das bordas ralas ficou menor (2 s por quadro), não sumiu; a base do cúmulo-nimbo ficou cinza, não chumbo (o ambiente
      local da estimativa das oitavas, `prior`, não é atenuado pela nuvem acima e abaixo e pesa ≥ 20 % contra o cache).

- [x] T062 [GPU] [US5] Os defeitos da rodada 8 (`tempestade`), isolados na mesma cena sem o terreno (o quadro 4500), um a
      um, e corrigidos pela física (research.md, R19 rodada 9): (1) **os discos** não eram a bigorna, o alcance, a água, a
      ocupação, o cache nem o mapa do sol (cada um trocado, o disco ficava): eram cúmulos rasos espremidos sob a inversão
      baixada pela subsidência (panquecas de 5–10 km vistas de baixo, o topo aceso pelo sol baixo) — a erosão dos rasos sobe
      com a profundidade perdida (`cloud_shallow_erosion`); a risca, uma fenda reta entre colunas extrudadas — as térmicas
      (`cloud_tower_thermal`) e a convecção trimodal (`cloud_tower_reach` com o modo congesto); o topo glaciado da torre com o
      gelo da bigorna (`cloud_tower_water`), sem a fronteira de 4 × na extinção; (2) **a base cinza**: o ambiente local pela
      transmitância difusa (duas correntes) da coluna acima (a cobertura local até o topo dela) e do caminho ao sol
      (`cloud_ambient_occlusion`, `cloud_ambient_local`); contra o traçador f64 numa torre de 10 km a razão base/topo é 0,077,
      a marcha das oitavas 0,038 (era 0,386); (3)–(4) **os pontos claros e o grão**: o gradiente temporal com o erro padrão
      da média dos valores exatos (`cloud_gradient_noise`, ½ desvio: o meio-termo contra o atraso no `storm`). A referência
      junto (`towerThermal`, `towerReach`, `towerWater`, `shallowErosion`, `ambientLocal`, `cloudGradientNoise`) e testes.
      Smokes, um por vez (código final): `clouds` caso a caso passa — `noon` 2,8 %, `backlit` 4,7 %, `types` 3,4/2,2/2,3 %
      (384 s, perto do prazo de 400 s: a referência paga o ambiente local), `far-cloud` 4,8 %, `storm` 3,9 % (vista; 840
      colunas, topo 10,05 km), `scatter-cache` 0,982, `timing` alto 2,84 / médio 1,33 / baixo 0,77 ms, `pressure-wind`,
      `front`, `weather-timing`, `storm-ground` e os demais —, exceto `sunset` 14,7 % (o aberto, 13,6 % na rodada 8; tarefa
      seguinte); `sky` passa; `antialiasing` passa sozinho (`cloudsMotion` 0,06/0,47/0,34 %; na série, o `waterOrbit` da água
      turva falhou uma vez, 9,7 %, e passou na repetição). Vídeo (claflow-web, porta 5184; `scratchpad/041-video/rodada9/
tempestade.mp4`, 27,2 MB recomprimido de 95,1 MB; conferência 51,66 dB no brilho, 46,85 dB em RGB; GPU 129 ms por
      quadro na mediana): saltos de brilho por quadro iguais (imagem 0,44, céu 0,57, chão 0,88; nenhum > 2, nenhuma
      alternância); o passa-alta temporal no céu e nas nuvens 0,247 → 0,183 nível (p99,9 16,6 → 10,4); pixels destoantes
      por quadro 715 → 331 na mediana; a base aos 105/118 s 116/110 → 100/96 níveis. **Em aberto**: um lóbulo claro menor
      ainda aparece na frente da torre aos 60–75 s (agora um cúmulo, não a panqueca) e uma prega vertical na parede da torre;
      o grão das bordas ralas diminuiu, não sumiu (~7 amostras por pixel numa série acelerada); a base de uma torre estreita
      sai 0,5 × a do traçador na marcha das oitavas (na GPU os caminhos das sondas pesam ≥ 80 %).

- [x] T063 [GPU] O mapa visto do sol e o cache de espalhamento por páginas (`2fce34af`; research.md, R11 revisto): os tempos
      na T029/T035/T011. Smokes, um por vez, depois da mudança: `clouds` caso a caso passa — `noon` 3,0 %, `types`
      3,4/3,6/3,2 %, `storm` 3,8 %, `backlit` borda/centro 1,009, `scatter-cache` 1,022, `panorama` 0,009, `fly-through`,
      `fog-in-front` 0,05 %, `water-reflection` 85,3 %, `pressure-wind`, `front`, `storm-ground`, `weather-timing` (estado 0,064
      ms, mapa +0,008), `shadow-map`, `sun-*` e os de cobertura, vento e grafo —, `sky` (`aerial-table` 1,90 %),
      `antialiasing` (`cloudsMotion` 0,07/0,56/0,66 %), `refraction`, `globalIllumination` (timeout 600), `limits`,
      `adapterLimits`, `deviceFloor` passam; `fog` falha no tempo (1,05 e 1,34 ms ≤ 1,05; a cena da névoa não tem `Sky` nem
      camada: nenhum pipeline dela mudou — o tempo dele oscila com o relógio da GPU, como na T033). **Em aberto (regressões
      desta rodada)**: `far-cloud` 5,0 % (era 4,8 %; ≤ 5 %: o ar a 25–60 km com texels de 0,8–1,6 km e τ interpolado entre
      colunas de nuvem e de céu — com 6 × 6 páginas eram 11,1 %); `overcast-ambient` 10,4 % (era 7 %; ≤ 10 %: com o cache
      convergido — orçamento de todas as páginas — 18,9 %: o caso mede o cache em 30 quadros, e o cache por páginas chega
      mais perto da convergência nas páginas com nuvem); `sunset` 17,5 % (o aberto era 14,7 %). Vídeos (claflow-web, porta 5184; `scratchpad/041-video/rodada10/`): `solpostolento` (3600 quadros; 52,63 dB brilho, 47,94 dB RGB; recomprimido `solpostolento-r.mp4`, 5,4 MB) e `pordosol` (480 quadros; 51,40/46,73 dB); variação da média por quadro (o comando da rodada) — `solpostolento`: chão, céu e horizonte maior salto 1 nível, nenhum > 2, nenhuma alternância; `pordosol`: chão 1, céu 1, horizonte 2, nenhum > 2, nenhuma alternância. O `pordosol` gravado com o motor de antes (`0687d4b9`, árvore própria removida depois) é igual na imagem (as bases escuras do contraluz são da T062) e tinha um salto de 3 no horizonte. Ligações (inferência do
      layout): a marcha 11 amostradas, 3 amostradores, 2 storage só de leitura (+1: o registro das páginas), 2 uniformes, 2
      storage textures; o panorama +1 storage só de leitura; todo consumidor de `light_transmission` com a camada (o desenho,
      os froxels, o traçado da GI, `refraction_path`, a tabela aérea) +1 storage só de leitura (`cloud_shadow_records`);
      os caminhos do cache 7 amostradas (−1: a fatia anterior e o anel do sol saíram), 2 storage, 1 só de leitura;
      `limits`, `adapterLimits` e `deviceFloor` passam. **Rodada 11 (2026-11-19)**: `far-cloud` 5,0 → 4,3 % — a sombra das nuvens pela bilinear das transmitâncias dos quatro texels, não de τ, onde a penumbra é menor que o texel (`33f4c57b`); `overcast-ambient` 10,4 % → −2,0 % — a referência passou a ter a luz múltipla do cache lido da GPU, como os casos de vista (o erro crescia com a convergência porque a referência era só as oitavas: `e9c23809`). Registro das páginas pelo schema (`CloudShadowPageSchema`) e o desenho por `invocations()` (`6cb0b766`: `noManualOffsets`, `linearDispatch`). `render`: `post-bloom` regravada (o `Bloom` de energia conservada: luz média linear 0,2479 contra 0,2456 do `forward`, a antiga 0,3075; `38728a8b`). `fog` no tempo: seis pares intercalados contra a base (`clayflow-041base`, 3cd0069c) — base 0,92/1,00/1,24/1,25/1,62/1,59 ms, atual 0,91/1,12/1,70/2,36/1,31/1,41; diferenças por par de sinal trocado (−0,31 a +1,11) e a parte dos froxels (o mesmo estágio, sem `Sky` nem camada) oscilando 0,64–1,97 nos dois: sem regressão medida; o método oscila com o relógio da GPU e os dois passam de 1,05 com a máquina quente. `clouds` caso a caso (código final): passa tudo menos `sunset` 17,0 % e `interior-timing` 0,62 ms — `noon` 2,8 %, `types` 3,1/3,3/3,0 %, `far-cloud` 4,3 %, `backlit` 5,8 % (borda/centro 0,994), `storm` 3,8 %, `scatter-cache` 0,975, `shadow-map` 0,022, `sun-low` 0,016 (0 voltas), `sun-sweep` 0,006, `sun-below` 0,032/0,000, `panorama` 0,009, `overcast-ambient` −2,0 %, `water-reflection` 84,6 %, `fly-through` 0,4/22,3 %, `timing` 2,86/1,31/0,76 ms, `sky-timing` 0,082 ms, `weather-timing` 0,064 / +0,008 ms, `pressure-wind`, `front`, `storm-ground` e os de cobertura, vento e grafo. Depois, um por vez: `sky`, `antialiasing`, `render`, `fog` (tempo incluso), `globalIllumination`, `refraction`, `limits`, `adapterLimits`, `deviceFloor`, `readiness` passam; vitest completo 2178 testes passam (291 arquivos). **Em aberto: `sunset` (T055) e `interior-timing` (T035).**

- [x] T064 [GPU] A geometria por vista (R20; decisão do usuário 2026-11-19, "Na 41"): (a) a saída por vista no Resource da
      geometria — `Geometry.requestView`/`releaseView`/`views`, `GeometryView.ts`; na `ParametricSurface` adaptativa os
      descritores `view:<key>:vertices|indices|indirect` com o orçamento constante `adaptive.viewBudget` (padrão 262 144
      triângulos); (b) o critério de cada vista no `SurfaceFlow` — as seis passadas por vista (nível pelo critério,
      orçamento, prefixos, marcação, despacho, emissão indireta), o nível da luz pelo erro em texels do nível do mapa virtual
      onde o retalho cai (`surface_adapt_light.wgsl`, lido do `ShadowMatrix`), o de câmera pelo da câmera ativa com a
      câmera da vista (`surface_adapt_view_camera.wgsl`), a histerese e a marcação pela série dos níveis (spec 037,
      `surface_view_levels`, `history: { depth: 2 }`), a vista rodando só quando o que define o critério muda; (c) o
      `ShadowFlow` pedindo a vista da luz a cada geometria que projeta e desenhando-a (vértices, índices, registro indireto,
      aglomerados e as caixas deles) desde o quadro em que ela foi produzida. A malha da câmera ativa e os pipelines dela
      ficam (o nível dela passou a uma função, a mesma conta; `.x` do retalho leva o pedido nos bits 8–15). Referência
      `reference/viewLod.ts` e teste `viewLod.reference.test.ts`; casos novos no `ParametricSurface.test.ts`.
- [x] T065 [GPU] Medidas e regressão da T064 (rodada 14; research.md, R20 — medidas). `solposto`, M4, alto, GPU ocupada
      (`readyForFrame`), 2 × 120 quadros por fase: com o sol andando, o `ShadowFlow` (soma dos passes) médio 2,05 → 0,22–0,26
      ms a partir do quadro 735 (sol a 10°; p90 4,4 → 0,26–0,32) e 2,91 → 0,18–0,23 ms a partir do 1050 (p90 4,6 → 0,23–0,31),
      mais a vista 0,15 ms (`SurfaceFlow.view`); parado, 0,09–0,11 → 0,06 ms e a vista não roda (o cache estático vale). GPU
      por quadro com o sol andando a 1050: 23,6 → 18,6 ms (parado 17,2 nos dois). A sombra das colinas igual: quadros com o
      sol a 10/5/3/1° (`solposto`) e 5/3/1° (`solpostooposto`), antes contra depois, diferença média no chão ≤ 0,031 nível,
      p99 ≤ 0,7, sem buraco nem acne (`scratchpad/041-video/rodada14/montagem-antes-depois.png`). A malha da câmera e os
      smokes de imagem iguais. Smokes, um por vez: `parametricSurfaces`, `render`, `virtualTextures`, `globalIllumination`
      (timeout 600), `refraction`, `fluidSurface`, `limits`, `adapterLimits`, `deviceFloor` passam; `clouds` caso a caso passa
      tudo menos os abertos de antes — `sunset` 15,8 % (T055, igual à rodada 12) e `interior-timing` 0,369 ms (T035) —:
      `noon` 2,8 %, `types` 3,1/3,3/2,9 %, `far-cloud` 4,4 %, `backlit` 5,7 %, `storm` 3,8 %, `timing` 2,82/1,27/0,80 ms,
      `weather-timing` 0,059 ms, `fly-through` 0,4/22,4 %, os de cobertura, vento, névoa, reflexo, ambiente e
      `storm-ground`. Vitest completo: 2189 testes passam (292 arquivos).
      **Fechada no fechamento (2026-11-21)**: os abertos da rodada 10 passam caso a caso no código final — `far-cloud` 2,7 %
      (≤ 5), `overcast-ambient` 4,938 contra 4,995 (1,1 %), `sunset` 3,6 %.
- [x] T066 [US5] Os vídeos `solposto` e `tempestade` regravados com a geometria por vista (claflow-web `299a4f7`, porta 5184;
      `scratchpad/041-video/rodada14/`): `solposto` 1200 quadros, 51,15 dB brilho / 46,34 dB RGB, GPU por quadro média 15,5
      ms (19 MB); `tempestade` 7200 quadros, 51,84/46,98 dB, média 18,8 ms (92 MB; recomprimido `tempestade-r.mp4`, 9,3 MB).
      Variação da média por quadro (160 × 90): `solposto` — imagem maior salto 1,95, céu 0,85, nenhuma alternância; o chão
      tem 9 saltos de 2–5,3 níveis, todos de um sinal só, nos quadros 327–335 (clareando) e 568–578 (escurecendo de 54 a 24
      em 14 quadros): o sol entrando atrás do cúmulo e a sombra da nuvem cobrindo o chão (conferido nos quadros 568–572),
      não a sombra do terreno; `tempestade` — imagem 0,29, céu 0,51, chão 0,92, nenhum salto > 2 e nenhuma alternância.
- [ ] T067 [GPU] O consumidor das vistas de câmera (reflexos e outras câmeras, pedido 5 do MorphSociety, ADR 0001): o tipo
      `'camera'` está no produtor (critério e passadas) sem consumidor nesta spec; o primeiro consumidor o exercita na GPU.

- [x] T068 [GPU] Os pontos de cena do meio contínuo (R21): `scene_medium`, `scene_medium_extinction` e `scene_near_fog`
      (`scene/points/media.ts`); o `Sky` contribui a atmosfera como meio (Rayleigh, Mie, ozônio e a névoa seca nova
      `Sky.haze` em `sky_medium` e em `mediumAt`; a luz simples × `light_visibility` × `light_volume_visibility`, a múltipla
      Ψms; a parte lisa no centro do froxel, as sombras no ponto sorteado) até o alcance da tabela; os `Froxels` contribuem
      `scene_near_fog` (a leitura `froxel_fog` e o alcance do meio).
- [x] T069 [GPU] Os froxels integram a atmosfera (R21): o `FroxelFlow` com o slot do `Sky` (a grade sem `FogVolume`, até 32
      km), a injeção soma `scene_medium`, a integração atenua por canal com `scene_medium_extinction` (a série em x pequeno)
      e grava a transmitância só dos volumes; a luz ambiente da grade grossa só com volumes.
- [x] T070 [GPU] A emenda perto/longe (R21): `sky_scene_fog_far` (a tabela só do fim dos froxels ao ponto, pela diferença
      da luz espalhada; no fundo, negativa), a marcha das nuvens com `scene_near_fog` e a composição `cor·Tc + Sc`.
- [x] T071 [GPU] A penumbra do disco do sol nos pontos de volume do mapa de sombra virtual (`shadow_virtual_volume`, R21).
- [x] T072 Referência f64 `media/reference/froxelAtmosphere.ts` e teste `froxelAtmosphere.test.ts` (o feixe atrás de um
      bloqueador: razão dentro/fora 0,2848 contra 0,2817; a coluna a ≤ 1,28 % da integral contínua; a emenda a 0,14 % e degrau
      0,004 %).
- [x] T073 [GPU] A decisão da GPU sobre o meio (R21): o `FroxelReachFlow` (a maior profundidade da cena → a distância vista;
      canal `Froxels.reach` da 037), a decisão `σ_ext·d > 10⁻³` ou névoa, o texel `Froxels.state` lido pelo desenho e o
      despacho indireto da grade (`Froxels.dispatch`); o ponto `light_volume_visibility` com a sombra das nuvens de uma
      amostra por quadro (`cloud_volume_visibility.wgsl`) e a da névoa. `interior-timing` 0,378 → 0,03–0,18 ms.
- [ ] T074 [GPU] (rodada 19: com o mapa de cobertura em níveis até 239 km, o `timing` alto passa — 2,66 ms, mediana de 5,
      2,63–2,71, contra 3,23 da base na mesma sessão; os médio e baixo e o `interior-timing` não foram medidos nesta
      rodada) O `timing` alto das nuvens em 3,05–3,41 ms contra 3 ms (base 2,82): 0,1 ms da sombra das nuvens nos
      froxels e ~0,15 da marcha com os meios perto da câmera medidos; ~0,25 ms não atribuídos (R21, medidas). O
      `interior-timing` com repetições bimodais (mediana 0,03–0,37 ms).
      **Rodada 2026-11-21 — o método de tempo escondia ~1,6 ms; os tempos reais.** Causa das repetições bimodais: o
      `busyFrames` do smoke cedia por `setTimeout(0)`, que o navegador leva a 4 ms depois de cinco níveis — a GPU ficava
      ociosa entre quadros e o M4 baixava o relógio; e o quadro sem a camada (~1,24 ms no alto) fica abaixo do tempo da
      CPU por quadro (~2,3 ms) mesmo sem o teto: medido longe da fase com a camada, todos os passes saíam ~2,3 × mais
      lentos por igual (fases 0,45/1,28/0,59 → 1,00/3,07/1,32 ms) e a diferença com − sem perdia ~1,6 ms. Corrigido no
      smoke: a espera do bench (`frameRetired`) com a cessão por `MessageChannel`, e a fase sem a camada sempre logo
      depois da com (no mesmo relógio); as repetições ficam estáveis (alto 4,465–4,501). Casos novos: `inside-timing`
      (a câmera no corpo do cúmulo, ≤ 3 ms) e `timing` `high-sun` (o sol a 1,3°/s entre 2° e 8°, ≤ 3 ms; T080).
      Medidas (M4, 1280 × 720): `timing` alto **4,49 ms** (> 3), médio **2,90** (> 2), baixo **1,83** (> 1,2),
      `high-sun` **6,47** (> 3; o sol parado a 5°: 4,75), `interior-timing` **3,03** (> 0,3), `inside-timing` **3,41**
      (> 3). Os passes de compute rodam em série nesta GPU (a escolha, o filtro e o panorama antes dos caminhos do cache,
      para tirá-los da cadeia da marcha: 4,48 ms, igual — desfeito), então a soma deles é o custo. Por passe no alto:
      caminhos do cache **1,52 ms** (vazão: 200 → 50 páginas por quadro, 0,56 ms; teto de colisões 48 → 12, 1,35; → 1,
      0,82), marcha **1,65** (128 → 64 passos, 1,0), froxels 0,57, panorama 0,36, filtro 0,13, reconstrução 0,13; com o
      sol andando, o desenho do mapa visto do sol **1,84** (parado, 0,07). O passe que estoura o orçamento do R17 é o dos
      caminhos do cache de espalhamento (T023, 1,5 ms, depois do R17), que o método antigo não mostrava; no interior
      ele, o panorama, a composição e a máscara do disco seguem sem céu visível. Em aberto: a peça estrutural — o
      orçamento dos caminhos do cache e do desenho das páginas do mapa por necessidade e custo (a mudança medida, o
      sol e o vento desde o caminho; o custo de cada página no registro), e o interior sem os caminhos e o panorama
      quando nenhum consumidor os lê. `weather-timing` 0,106–0,112 ms > 0,05 também no `64b743b3` (anterior a esta
      rodada). **Rodada 2026-11-21 b — o orçamento por necessidade e por custo** (`f0b8db70`, `7cef3bcf`, `df1453f7`). (1) O cache
      de espalhamento: o registro de cada página (série 037) guarda o que o último caminho viu (o sol, o deslocamento do
      vento, a câmera, o tempo, a assinatura do conteúdo, os caminhos efetivos); a página caminha quando a mudança (o
      esquecimento do sol, o vento pelo espaçamento das sondas, o ângulo da câmera pelo corte da fase, a evolução, a
      assinatura) ou a falta para encher a janela passa de um caminho da janela; prioridade mudança × idade × nuvem ×
      √(proximidade × vista), teto de páginas constante; o panorama vira série de uma página, refeito só quando o cache
      caminha, a série não vale ou o que ele viu mudou; o filtro sai cedo sem página marcada (`reference/cloudScatterPages.ts`).
      O caso de tempo espera a camada que entra encher o cache (páginas × janela ÷ orçamento quadros: o transitório da
      entrada, ~10 s a 60 Hz) e mede o regime. (2) O mapa visto do sol: o custo do desenho no registro (amostras, as com
      nuvem × 4) e o orçamento em custo (`budget` páginas de referência de 289 × 192 amostras vazias; `shadowSelectByCost`).
      (4) O `weather-timing`: o passe era o desenho do mapa de cobertura, refeito pela idade em quadros com o tempo
      parado; agora pelo tempo simulado desde o desenho (`coveragePageKey`). (3) A marcha: o pulo pela faixa de altura
      em que a coluna pode ter nuvem (o perfil acima de `1 − cobertura`, exato na f64) tirou 8 % (1,65 → 1,52 ms), mas a
      transmitância perto da câmera saiu 0,46 contra 0 da referência em `noon`, `backlit` e `types` (causa não isolada):
      desfeito (o diff em `scratchpad/t074b/item3-band-skip.diff`). Medidas (M4, 1280 × 720; antes → depois): `timing`
      alto 4,49 → **2,52 ms** ✓, médio 2,90 → **1,69** ✓, baixo 1,83 → **1,08** ✓, `inside-timing` 3,41 → **2,59** ✓,
      `weather-timing` acréscimo 0,106 → **0,000–0,001** ✓; `high-sun` 6,47 → **6,30–6,63** ✗ (por passe: caminhos do
      cache 1,53–1,64 — o sol que anda muda todas as páginas, o teto —, marcha 1,71–1,79, desenho do mapa 1,67–1,75 (era
      1,84–2,04), froxels 0,59, panorama 0,38, tabela aérea 0,29, filtro 0,16, reconstrução 0,13: só os caminhos, a
      marcha e os froxels já passam de 3 ms), `interior-timing` 3,03 → **1,0–2,0** ✗ (a GPU baixa o relógio com o quadro
      leve: repetições 0,45–1,56; os caminhos e o panorama ~0; restam a composição 0,26–0,39 e a máscara do disco
      0,24–0,37, passes de desenho de tela cheia, a tabela aérea 0,12–0,18, o filtro, as escolhas e a reconstrução — a
      peça que falta é a da rodada 12: a composição e a máscara como compute sobre a lista de blocos com céu, por
      despacho indireto). Em rodadas longas o M4 esquenta e todos os passes ficam 1,5–4 × mais lentos (o `sky_view`
      0,021 → 0,09 ms): `inside` e `interior` medidos sozinhos. Casos de imagem: `noon` 1,0 %, `backlit` 4,1 % (borda/centro
      1,019), `types` 1,4/1,7/1,6 %, `sunset` 3,6 %, `storm` 2,4 %, `far-cloud` 2,6 %, `beam-gap` +3,0 px, `panorama`
      0,008, `scatter-cache` 0,963, `dusk-blocks` matiz 0,0176 (degrau 1,015, alta frequência 2,52 %), `sun-sweep` 0,005,
      `shadow-map` 0,020, `ground-shadow` 0,010; vitest de media/clouds passa.
      **Rodada 2026-11-21 c — a composição e a máscara por blocos, o pulo da faixa, os critérios do sol e do vento**
      (`99bd0a8a`, `c1a8e4cf`, `68a47bb1`). (1) **A peça da rodada 12**: o aumento marca cada bloco de 8 × 8 pixels em
      que a composição muda a cor (a mesma regra do descarte por pixel), um passe monta a lista (o bloco ou um dos 8
      vizinhos marcado: a passa-baixa 3 × 3 a 3 pixels da luz que chega alcança o bloco ao lado) e os argumentos do
      despacho indireto; a composição lê e escreve a cor e a luz só nos blocos da lista; a máscara do disco: uma invocação
      acha o retângulo dos dois discos e grava o despacho da marcação (`Sky.diskWork`). Tudo na GPU, sem leitura na CPU;
      sem nuvem nem disco à vista, zero grupos. Com `texture-formats-tier2` (pedida como opcional): a cor, a luz e a
      máscara com storage de leitura e escrita (`TextureShape.storage`); sem ela, os passes de desenho de antes. A luz que
      chega passa a `rgba16float` (o `rg16float` não tem storage de leitura e escrita). Referência f64 da lista e da
      composição por blocos com teste (`reference/cloudTiles.ts`). Interior: composição 0,259 → **0,004 ms**, máscara
      0,244 → **0,012 ms**; ao ar livre 0,064 ms. A tabela aérea só quando lida **não feita**: a decisão viria do alcance
      do quadro anterior (série 037) e o quadro que passa a ver longe leria a tabela de outro quadro. (2) **O sol no ciclo
      de dia de um jogo**: `high-sun` a 0,25°/s; `high-sun-lapse` (1,3°/s) registrado sem teto; `high-wind` com o tempo
      simulado andando (o vento de 10 m/s). **Não cabem**: `high-sun` **6,40 ms** (caminhos do cache 1,51, desenho do
      mapa visto do sol 1,65, panorama 0,37, marcha 1,76, froxels 0,56, tabela aérea 0,28) e `high-wind` **4,12 ms**
      (caminhos 0,81, panorama 0,36, mapa 0,31, marcha 1,71). Causa: com a memória de 0,25° do cache e a janela de 64, manter
      a média pede 64 caminhos por sonda a cada 0,25° de sol — a 0,25°/s ~1 caminho por sonda por quadro, contra o teto de
      200 das 1600 páginas: o teto todo quadro, também a 0,25°/s; o mapa visto do sol, a 1/255 de transmitância com as
      colunas de ~30 km do sol baixo, desloca 2–3 m por quadro e passa da tolerância em todo quadro; o panorama é refeito
      sempre que alguma página caminha. A peça que falta (estrutural): o cache guardado pela transmitância da atmosfera até
      a sonda (a mudança rápida da cor do sol baixo, que impõe os 0,25°, aplicada na leitura com o sol de agora) e a memória
      pela sensibilidade medida da luz espalhada ao ângulo; a tolerância do mapa pela pegada da página na tela; o panorama
      pela própria mudança. (3) **O pulo pela faixa de altura** reaplicado: a causa da transmitância 0,47 contra 0 era o
      `t` do pulo na borda do trecho — em f32 `(t − entrada)/trecho` saía às vezes um ULP abaixo, o trecho de antes (vazio)
      de novo, o pulo de volta e o passo gasto até o teto (~metade dos raios sem nuvem); o trecho do último pulo guardado,
      espelho em f32 (`rayBin`) com teste. (4) `weather-timing` sozinho: estado **0,064 ms**, acréscimo 0,000 ✓ (o 0,151
      era a GPU quente da rodada longa). Medidas finais (M4, 1280 × 720, cada caso sozinho): `timing` alto **2,59 ms** ✓,
      médio **0,86** ✓, baixo **0,07** ✓ (médio e baixo com repetições negativas: o quadro leve baixa o relógio),
      `inside-timing` **0,40** ✓, `interior-timing` **0,16** ✓ (repetições −0,20…1,67: o quadro sem a camada no relógio
      baixo; pela soma dos passes das nuvens no interior, ~0,5 ms — a luz das nuvens 0,29, a marcha, a reconstrução e o
      aumento 0,16, a tabela aérea +0,08), `weather-timing` ✓, `high-sun` ✗, `high-wind` ✗. Casos de imagem (o código final): `noon` 0,9 %, `backlit`
      4,3 % (borda/centro 1,019), `types` 1,5/1,7/1,6 %, `sunset` 4,4 %, `storm` 2,4 %, `far-cloud` 2,6 %, `beam-gap` +3,0 px,
      `dusk-blocks` matiz 0,0176, `scatter-cache` 0,963, `panorama` 0,008 — passam; vitest de media/clouds passa (o
      `wgslSymbols` falha já na base: `cloud_shadow_maps` em dois arquivos, de `64d084e1`). Em aberto na T074: `high-sun` e
      `high-wind` (a peça do item 2 acima).
      **Rodada 2026-11-21 d — o cache sem a luz do sol, a grade no referencial das nuvens, o panorama pela mudança medida, o
      mapa pela pegada do pixel** (`39fd0bfd`, `aee58558`, `68ade00a`, `865202e4`, `41adbdb9`, `6b5aa983`; R8 e R11 da T074 no
      research.md). (1) **O cache em partes**: a sonda guarda a parte do sol por unidade da luz do sol que chega a ela (a
      iluminância no topo × a transmitância da atmosfera até a sonda) e a do céu por unidade da irradiância do céu; a leitura
      as devolve com o sol e o céu de agora (`scatterNormalize`/`scatterRecompose`; o alvo filtrado com as duas metades na
      altura). A memória pela sensibilidade medida na f64 (`scatterMemory.ts`): com o sol entre 2° e 8°, 4,1 %/° em partes
      contra 26 %/° na forma de antes (perto do horizonte, a 0,5–1,5°, também ~4,2 %/°); a câmera 5,2 %/°; o atraso igual ao
      ruído da sonda filtrada com a janela cheia (4,7 %) — **1,14°** no sol (eram 0,25°) e **0,90°** na câmera. A grade no
      referencial das nuvens (o vento não muda as sondas; só o que sobra, a bigorna) e, quando o centro muda, o transporte
      da grade de antes à de agora (a filtrada de antes no ponto de cada sonda nova × a razão das áreas): só o que entra pela
      borda recomeça. Dois orçamentos: o de encher a janela (`scatter.budget`) e o da mudança (`scatter.motion`, 40/24/10;
      o orçamento pela velocidade do sol foi medido e desfeito: no `dusk-blocks` o matiz ia de 0,040 a 0,058–0,066). (3) **O
      panorama pela mudança medida**: a cada 8 quadros, 64 texels refeitos e comparados na escolha seguinte com o desenho
      guardado (a luz relativa média e a transmitância média, 2 %); as provas a cada 8 quadros porque a marcha de um texel tem
      a latência do desenho inteiro (64 texels custavam 0,36 ms). (2) **O mapa pela pegada do pixel** (`shadowScreenError`):
      o pixel maior que o texel faz a média dos texels (× texel/pegada; a altura da tela no uniforme). O desconto do
      deslocamento abaixo de meio pixel e a tolerância de 2 % fora da vista (`68ade00a`) foram desfeitos (`6b5aa983`): a
      página velha não se move abaixo do pixel, salta no redesenho, e as páginas fora do quadro alimentam os caminhos do
      cache — o degrau dos blocos do `dusk-blocks` ia a 1,041 (isolado por experimento: 1,017 sem elas). Com o vento o mapa
      já anda com o referencial das nuvens; o que o refaz é a evolução do detalhe. **O `sunset`** (3,6 → 4,4 % desde
      `68a47bb1`): a faixa do pulo do vazio era a das pontas do trecho, e nos trechos de quilômetros rente ao horizonte o
      campo passa entre elas (sem o pulo, 3,6 %); a faixa do trecho pelo maior gradiente medido dos campos
      (`columnBandSpan`): **3,6 %**, a marcha no alto parado 1,706 ms (1,703 antes). (4) O `wgslSymbols` passa (o desenho do
      mapa lê os mapas do quadro por `cloud_shadow_maps_meta`); a luz que chega em `rgba16float` contra `rg16float`: o
      `cost` do `antialiasing` (sem nuvens, AA temporal, 1280 × 720) 5,811 contra 5,781 ms o quadro (+0,03 ms; o
      antisserrilhado 0,460 contra 0,463), o `timing` do `fog` 0,83 contra 0,84 ms (MSAA, sem o alvo da luz) — fica em
      `rgba16float`. Medidas finais (M4, 1280 × 720, cada caso sozinho): `timing` alto **2,66 ms** ✓, médio **0,85** ✓
      (repetições −0,25…1,56: o quadro leve baixa o relógio), baixo **0,31** ✓, `inside-timing` **2,00** ✓,
      `interior-timing` **0,10** ✓, `weather-timing` acréscimo 0,001 ✓, `sky-timing` o novo 0,071 ✓; **`high-sun` 6,40 →
      5,15 ✗** (caminhos 1,51 → 0,57, panorama 0,37 → 0,01, desenho do mapa 1,65 → 1,67 com 90–112 páginas por quadro,
      marcha 1,76 → 1,78, froxels 0,57, tabela aérea 0,28) e **`high-wind` 4,12 → 3,57 ✗** (caminhos 0,81 → 0,57, mapa 0,31 →
      0,30, panorama 0,36 → 0,01, marcha 1,70). Parado com o sol a 5°, 2,93 ms (a marcha 1,80). Rodados seguidos, os casos de
      tempo saíram com todos os passes 12–25 % mais lentos (o alto 3,47, o médio 2,36): o relógio da GPU; medidos de novo
      sozinhos. Casos de imagem: `noon` 1,0 %, `backlit` 4,1 % (borda/centro 1,019), `types` 1,5/1,7/1,6 %, `sunset` 3,6 %,
      `storm` 2,4 %, `far-cloud` 2,6 %, `beam-gap` +3,0 px, `dusk-blocks` degrau 1,017, matiz 0,0403, alta frequência 2,50 %,
      brilho −9,5 % (era −19 %), `scatter-cache` 0,965, `panorama` 0,008, `sun-sweep` 0,005, `shadow-map` 0,020,
      `ground-shadow`, `wind` e `fly-through` passam; vitest completo passa. **Em aberto na T074: `high-sun` e `high-wind`**
      (o teto de 3 ms). O que falta, estrutural: (a) os caminhos do cache custam ~0,24 ms fixos (a latência de um caminho de
      até 48 colisões) + ~6,3 µs por página, ~0,57 ms com qualquer página andando — o caminho continuado entre quadros (o
      estado na série, alguns passos por quadro) daria o custo da vazão; (b) o desenho do mapa com o sol baixo andando: 90–112
      páginas por quadro de mudança real (as sombras perto da câmera; as colunas de ~36 km giram ~2 m por quadro); (c) com o
      sol baixo parado o quadro já fica em 2,93 ms (a marcha).
      **Rodada 2026-11-21 e — a coluna repartida, os nós do meio, o que não coube** (`ee205471`, `2488a334`; R8 e R11 da
      T074 no research.md). Medido antes por passe e por partes (o passe tirado, M4, `high-sun`, 5,12 ms): na marcha 1,77
      ms, o cone 0,60, o pedaço até o nó 0,49, a leitura do nó 0,17, a luz sem o detalhe 0,27 a menos, a ocupação 0,10, o
      cache de espalhamento na leitura 0,08; 7,1 passos com nuvem por raio (máximo por grupo de 32: 10,9), 48 % com a saída
      antecipada, 52 % dos passos com nuvem com T < 0,3. (1) **O desenho do mapa**: as 289 colunas de uma página em 256
      invocações; as 33 que sobram repartidas em 7 partes do pente (τ de um nó é a soma, nas células acima dele, da extinção
      × o pedaço acima do nó: a soma das partes é a coluna), 1,67 → 1,43 ms, imagem igual (espelho `shadowCombPart`,
      `shadowCombSplit` com teste). (2) **Os nós do meio dos trechos** nas camadas 4…7 do atlas: a marcha integra só até o
      meio nó do lado do sol em 2 passos (erro médio de τ em f64 1,70 % contra 2,34 %): a marcha 1,695 → 1,580 ms no
      `high-wind`, o desenho do mapa +0,1 ms pelas camadas a mais. Medidos e desfeitos: a luz de nível de detalhe pela
      transmitância (o mapa só com T < 0,1: 32 % dos passos com nuvem, nenhum ganho — o grupo SIMD paga o mais caro), a
      marcha em dois laços ("while-while", Aila e Laine 2009: igual), o despacho em ladrilhos 8 × 8 (−0,04), mais passos
      finos depois da nuvem (`CLOUD_EMPTY_TO_COARSE` 12/48: −0,12/−0,23 ms, `sunset` 4,4/4,9 %), o desenho em quatro fases
      entrelaçadas (o mapa com 1/4 do custo por quadro: o degrau do `dusk-blocks` 1,049 — as fases com sóis diferentes
      lidas pelo sol da página) e a cauda do caminho do cache pelo próprio cache com 12 colisões (−0,07 ms). Medidas finais
      (M4, 1280 × 720, cada caso sozinho, a GPU fria): `high-sun` 5,15 → **4,91–4,94 ms** ✗ (o mapa 1,54–1,58, a marcha
      1,64, os caminhos 0,57, froxels +0,36 com a camada, tabela aérea 0,28), `high-wind` 3,57 → **3,41** ✗ (a marcha 1,58,
      os caminhos 0,57, o mapa 0,29–0,36, froxels +0,36), `timing` alto **2,54** ✓ (a marcha 1,59). Rodados em seguida os
      casos de tempo saem 20–40 % mais lentos (o relógio da GPU): médio, baixo, `inside-timing` e `interior-timing` não
      foram medidos frios nesta rodada. Casos de imagem (o código final): `noon` 1,0 %, `backlit` 4,3 %, `types` passa,
      `sunset` 4,0 %, `storm` 2,4 %, `far-cloud` 2,6 %, `beam-gap` +3,0 px, `dusk-blocks` degrau 1,029, matiz 0,0364,
      `scatter-cache` 0,965, `panorama` 0,008, `sun-sweep` 0,005, `shadow-map` 0,020, `ground-shadow` 0,010, `wind` e
      `fly-through` passam; vitest de media/clouds passa. **Em aberto na T074: `high-sun` e `high-wind`.** O que falta: a
      marcha (−0,5 ms no mínimo: o piso parado com o sol a 5° segue ~2,9 ms) não tem mais o que tirar sem mudar a imagem —
      a luz por passo é proporcional às amostras da densidade (~0,1 ms por amostra do cone por passo), e cortes por raio
      não rendem com o grupo SIMD; a peça que falta é a luz do sol perto do ponto sem marchar (um volume de τ até o sol no
      referencial do sol perto da câmera, refeito por páginas como o mapa) ou o volume da forma com níveis de detalhe para
      as amostras longas da luz. O mapa com o sol andando: a demanda (~500 páginas por quadro acima da tolerância, 48 % das
      colunas refeitas mudam menos de 1/255) pede o redesenho por coluna com a previsão por texel (o gradiente dos vizinhos
      × o deslocamento: 32 % das colunas puladas, 2,5 % delas erradas acima de 4/255, medido) com a idade por texel. Os
      caminhos do cache continuados entre quadros (o estado do caminho na série) não foram feitos.
      **Rodada 2026-11-21 f — os níveis de detalhe na luz (medidos, não usados) e o volume de τ até o sol** (R7/R11 da
      T074, rodada f, no research.md). (1) **Os níveis de detalhe do volume da forma**: a pirâmide e a leitura por nível
      na referência f64 (`buildVolumeLevels`, `sampleVolumeLevel`, `volumeLod`; teste em `cloudSunVolume.test.ts`). Lidos
      pela largura das amostras da luz, pioram o τ (a média num cubo, e a luz pede a integral na linha): o cone de 6
      amostras 4,3 → 8,4 % (pela metade da largura 4,0 %); 4 amostras 9,9 %, com os níveis 7,9 %; o pedaço até o meio nó
      em 1 amostra |Δτ| 0,28 contra 0,19 das 2 — os níveis não cortam amostras no mesmo erro, e a GPU não os monta. (2) **O
      volume de τ até o sol** (`cloud_sun_volume*.wgsl`, `cloud_sun_rest.wgsl`, referência `cloudSunVolume.ts`): nós no
      referencial das nuvens em 5 níveis (células de 50·2^k m, 39 m na altura; janelas toroidais de 20 × 8 × 20 páginas de
      8³, até ±64 km; atlas `rgba16float`, série por páginas, e o registro das páginas na série 037), cada nó com o τ do cone
      além da primeira amostra e o resto da luz (o pedaço até o meio nó e o nó do mapa visto do sol); a marcha faz a
      primeira amostra no ponto e lê o resto; as páginas refeitas pela mudança estimada com a taxa medida entre desenhos
      (32 nós de prova), as filas, a escolha (128 por quadro) e o desenho em três passes (0,04 + 0,04 + 0,01–0,06 ms). Em
      f64 o τ do cone pelo volume erra 2,4–3,1 % contra 3,7 % do cone. O resto vale só com a célula até a pegada do pixel
      da marcha (em todos os níveis, o `sunset` ia a 6,5 %); no anel de fora de cada janela o nível seguinte entra (no
      último, o cone). Medidas (M4, 1280 × 720): `timing` alto 2,54 → **2,33 ms** ✓ (a marcha 1,59 → 1,31); `high-wind`
      3,41 → **3,18–3,25** ✗ (a marcha 1,58 → 1,26–1,32); `high-sun` 4,91 → **4,84** ✗ (a marcha 1,64 → 1,43; o resto não
      vale com o sol andando, o cone sim: 16 000 páginas valendo, 3–7 desenhadas por quadro; o mapa 1,56, os caminhos
      0,57, froxels 0,56). Casos de imagem: `sunset` 4,0 %, `dusk-blocks` degrau 1,029, matiz 0,037, `backlit` 3,9 %
      (borda/centro 1,017), `noon` 1,1 %, `types`, `storm` 2,4 %, `far-cloud` 2,7 %, `beam-gap` +3,0 px, `scatter-cache`
      0,965, `panorama` 0,008, `sun-sweep` 0,005, `shadow-map` 0,020, `ground-shadow` 0,010, `wind` e `fly-through`
      passam; vitest de media/clouds passa. Médio, baixo, `inside-timing` e `interior-timing` não medidos nesta rodada.
      **Em aberto na T074: `high-sun` e `high-wind`** — o mapa visto do sol por coluna com a previsão por texel (1,56 ms
      com o sol andando) e os caminhos do cache continuados entre quadros (0,57 ms); a margem do `sunset` (4,0 %, na meta)
      e do degrau do `dusk-blocks` (1,029) não mudou.
      **Rodada 2026-11-21 g — o mapa por coluna (medido, não usado), os caminhos continuados (medidos, desfeitos), o
      `sunset` recuperado** (`596fb6e5`; R8/R11 da T074, rodada g, no research.md). (1) **O `sunset` e o degrau**: o que
      piorou o `sunset` de 3,6 para 4,0 % foi o pedaço até o meio nó (2488a334), não o pulo da faixa nem o pente: até o meio
      nó em 2 passos 4,0 %, em 3 passos 4,0, com o meio nó a pelo menos meio trecho 4,5, até o nó inteiro em 4 passos 3,7,
      em 3 passos **3,6** — fica o nó inteiro em 3 passos no alto, e os nós do meio saem do atlas (8 → 4 camadas). O degrau do
      `dusk-blocks` 1,029 → **1,025** (o caso é determinístico: o mesmo valor em duas rodadas), matiz 0,049 (≤ 0,05, a
      margem caiu de 0,037); sem o volume de τ até o sol na marcha, 1,040 (o volume ajuda). Os 1,017 da rodada d não voltaram:
      a causa que sobra não foi isolada. (2) **O mapa visto do sol por coluna** (o registro de cada texel — o sol do desenho
      dele, o fator ao longo, o erro medido —, a escolha das colunas pelo erro previsto na tela acima de ½ tolerância, as
      mantidas no erro da página): implementado, medido e desfeito. Com o sol a 0,25°/s entre 2° e 8° **todas** as colunas
      das páginas escolhidas passam da metade da tolerância a cada quadro (GPU: 93 páginas, 26 860 colunas = 289 por página;
      f64, cúmulos em células e esparsos: 100 % das colunas) — a ponta do trecho fica a 15–120 km do plano, e 7·10⁻⁵ rad
      por quadro a desloca 1–9 m: com 1/255 de tolerância só a coluna com |ΔT| < ~0,02 por texel ficaria, e com o sol baixo
      toda coluna de ~36 km atravessa nuvem. A demanda é a do próprio sol (a sombra anda 2–3 m por quadro), não a da página:
      o mapa com o sol andando só cai mudando o que se guarda (a reprojeção das colunas pelo deslocamento de cada trecho, o
      mapa pré-filtrado) ou a tolerância pela tela com o antisserrilhado temporal. (3) **Os caminhos do cache continuados
      entre quadros** (16 passos por quadro, o estado na série `scatterPaths` da 037, o lugar na fatia por grupo, só as
      páginas da mudança, a página espera os caminhos dela pela contagem, o último marca o filtro; f64 com teste: o caminho em
      pedaços soma a mesma luz que inteiro): os caminhos 0,57 → 0,35 ms e o `high-wind` 3,27 → 3,06 ms, mas o atraso da luz
      das sondas (os caminhos acabam 1–16 quadros depois da escolha) levou o degrau do `dusk-blocks` a 1,028–1,034 (falha a
      1,03) e, marcando o filtro só no fim da caminhada, o matiz a 0,061: desfeito (o código em
      `scratchpad/t074g/continued-paths.diff`). Medidas (M4, 1280 × 720, o código final, rodados em seguida): `high-sun`
      **4,76 ms** ✗ (o mapa 1,44, a marcha 1,49, os caminhos 0,57, froxels 0,56, tabela aérea 0,28), `high-wind` **3,27** ✗
      (a marcha 1,36, os caminhos 0,57, o mapa 0,27), `timing` alto **2,32** ✓; médio, baixo, `inside-timing` e
      `interior-timing` saíram quentes no fim da série (2,02/1,27/5,26/3,21 ms com repetições de −0,2 a 6,7); de novo, cada um
      sozinho logo depois (a GPU ainda quente da série): `inside-timing` **1,97** ✓, baixo **−0,47** ✓ (repetições
      −1,3…0,6), médio **2,27** ✗ (1,78–2,43), `interior-timing` **1,20** ✗ (0,93–1,62) — no médio e no baixo o código da marcha
      é o mesmo de antes (o pedaço segue em 2 e 1 passos; só a leitura do nó inteiro no lugar do meio nó), e no interior a
      marcha mede 0,04–0,08 ms: o que muda entre as rodadas é o relógio da GPU com o quadro leve (o 0,85/0,31/0,10 da rodada d
      foi com a GPU fria); medir frio de novo antes de fechar. Casos de imagem (rodados com os caminhos continuados; depois de
      desfeitos, `sunset` 3,6 % e `dusk-blocks` 1,025 de novo): `noon` 1,1 %, `backlit` 3,7 % (borda/centro 1,018), `types`, `sunset` 3,6 %, `storm`
      2,4 %, `far-cloud` 2,7 %, `beam-gap` +3,0 px, `scatter-cache` 0,965, `panorama`, `sun-sweep` 0,005, `shadow-map` 0,020,
      `ground-shadow` 0,010, `wind` e `fly-through` passam; vitest de media/clouds passa. **Em aberto na T074: `high-sun` e
      `high-wind`**, o degrau do `dusk-blocks` ≤ 1,02 e a margem do matiz.
      **Fechamento (2026-11-21, escolha do usuário "Fechar a 041") — o critério do sol andando.** No caso `timing` o teto de
      3 ms do `high-sun` passa a valer com o sol no ritmo real (360° por dia, ≈ 0,004°/s, entre 8° e 2°); o sol do ciclo de
      jogo (`high-sun-fast`, 0,25°/s) e o vento de 10 m/s (`high-wind`) ficam medidos e registrados, sem teto — o teto deles
      vai para a T082, transferida para a próxima spec de desempenho. Medidas (M4, 1280 × 720, a GPU fria, cada caso
      sozinho): médio **0,544 ms** ✓ (−0,29…0,93); `interior-timing` **0,317 / 0,383 / 0,200 ms** em três execuções
      seguidas (repetições −0,74…1,35: a diferença com − sem fica no ruído do relógio) — ✗ em duas de três contra 0,3. Os
      passes da camada que rodam na sala fechada sem nenhum pixel de céu: `CloudLightFlow` ~0,46 ms somados (a escolha e o
      desenho do mapa visto do sol 0,064 + 0,068 com 0 páginas desenhadas, as chaves e a escolha do volume de τ 0,038 +
      0,040, o filtro do cache 0,058, a escolha da cobertura 0,045), `CloudFlow` ~0,16 (o aumento 0,053, o `check` 0,035, a
      reconstrução 0,027, a marcha 0,041) e a tabela aérea +0,11 com a camada; maiores diferenças por passe medidas:
      `sky_aerial` +0,108, `shadowSelect` +0,093, `shadow` +0,089. Rodados em seguida: `high-sun` no ritmo real **4,18 ms**
      ✗ (4,17–4,44; o mapa visto do sol **1,61** com ~100 páginas desenhadas por quadro — o mesmo número do sol a
      0,25°/s —, a marcha 1,39, froxels 0,57, `FroxelReachFlow` 0,30, tabela aérea 0,26): com o sol baixo, a tolerância de
      1/255 por texel e as colunas de 15–120 km, 1,2·10⁻⁶ rad por quadro desloca a ponta do trecho 2–15 cm e o erro
      previsto passa da tolerância em poucos quadros — o mapa é refeito a ~1/16 das páginas por quadro mesmo no ritmo
      real; `high-sun-fast` **4,76** (o mapa 1,48, a marcha 1,49, os caminhos 0,57, froxels 0,56, tabela aérea 0,28) e
      `high-wind` **3,21** (a marcha 1,35, os caminhos 0,57, o mapa 0,26), registrados. **Em aberto na T074: o `high-sun`
      no ritmo real (o mapa visto do sol), o `interior-timing` (os passes fixos da camada sem céu), o degrau do
      `dusk-blocks` ≤ 1,02 e a margem do matiz.**
      **Rodada 2026-11-21 h — o desenho do mapa repartido entre grupos; a demanda do sol no ritmo real medida**
      (`62dbf057`; R11 da T074, rodada h, no research.md). (1) Medido: o desenho do mapa era limitado pela latência da
      cadeia de amostras de uma coluna (as mesmas ~100 páginas desenhadas duas vezes: 1,60 → 2,21 ms; com a densidade
      trocada por uma função barata, 6,4 µs por página contra 10,7). Feito: a escolha grava a lista compacta das páginas
      do quadro, um passe de uma invocação escreve os argumentos do despacho indireto (`CloudLayer.shadowArgs`, buffer à
      parte), o desenho faz 5 grupos por página com 58 colunas em 4 partes do pente cada, e um grupo por página física fecha
      o registro e prova as demais. A imagem é a mesma conta. Medidos e desfeitos: 15, 7 e 2 partes (1,07/1,00/0,95 ms
      contra 0,92), os nós das partes na memória do grupo (1,04) e os atômicos sem a redução no grupo (igual). (2) A
      demanda (a escolha agora a conta; o smoke `timing` a registra): no ritmo real ~1670 das ~2048 páginas acima de
      1/255 por quadro, ~1110 acima de 4/255, ~180 acima de 16/255; com 0,25°/s, ~1600–1780 acima de 64/255 — o orçamento
      (~100 páginas por quadro) decide o custo nos dois. (3) Os candidatos, medidos em f64 (o erro de verdade da página
      velha lida pelo sol dela contra a coluna nova pelo mesmo ponto, sol a 5°: 0,6–1,4 nível de 8 bits por quadro no nível
      0, 1–17 nos níveis 3–7; o pente preso a planos fixos do mundo e o pente fino de 16 m dão o mesmo — é a mudança
      física): (b) a reprojeção pelo sol novo já é o que a leitura faz, e a previsão honesta dela (o gradiente por eixo, o
      giro do plano só como cobertura, as provas no ponto da leitura) baixa a demanda acima de 4/255 de ~1110 para ~960 —
      desfeita, sem ganho de custo; (a) a tolerância pela tela: a pegada do pixel na coluna fica abaixo do texel em todos
      os níveis (o fator texel/pegada não reduz nada) e, pelo disco do sol, a luz muda até 0,04 nível por quadro no
      contraste pleno (um nível a cada ~24 quadros, ~85 páginas por quadro), com a marcha no sol pontual; (c) o mapa
      pré-filtrado pelo disco tem o mesmo limite físico. Com 1 nível de 8 bits nenhum dos três chega às ~25 páginas por
      quadro do teto. Medidas (M4, 1280 × 720, rodados em seguida): `high-sun` 4,19 → **3,49 ms** ✗ (o mapa: escolha 0,09
      + desenho 0,92 + fim do registro 0,09 = 1,10 ms, eram 0,09 + 1,60; a marcha 1,38, froxels 0,56, `FroxelReachFlow`
      0,42, tabela aérea 0,26), `high-sun-fast` 4,76 → **4,10** (o desenho 0,73), `high-wind` 3,21 → **3,22**, `timing`
      médio **0,97** ✓. Casos de imagem (os mesmos valores de antes): `sunset` 3,6 %, `dusk-blocks` degrau 1,025, matiz
      0,0491, `sun-below`, `shadow-map` 0,020, `ground-shadow` 0,010; vitest de media/clouds passa. **Em aberto na T074:
      o `high-sun` no ritmo real (−0,5 ms: o desenho de ~100 páginas por quadro que a tolerância de 1/255 pede), o
      `interior-timing`, o degrau do `dusk-blocks` ≤ 1,02 e a margem do matiz.**
      **Rodada 2026-11-21 i — o que rodava sem precisar fora do mapa: `high-sun` 3,54 → 3,26 ms (ainda ✗)**
      (`d8cf7f1f`, `7be0cb50`, `6c0cbea6`; R11 da T074, rodada i, no research.md). O mapa visto do sol não foi tocado.
      Medido antes, cada passe ou parte tirado (M4, 1280 × 720, `high-sun` 3,54): a sombra das nuvens na tabela aérea
      0,24 ms (o disco do sol 0,16, o resto do déficit além de 32 km 0,07); a sombra das nuvens nos froxels 0,14; os
      despachos dos caminhos e do filtro do cache parado 0,09; o `FroxelReachFlow` **0** (o tempo que aparece nele é
      sobreposição com os passes vizinhos: tirado, o quadro não muda); na marcha (1,38): só a densidade 0,53, a luz 0,83
      — dela o resto até o sol (`cloud_sun_rest`) 0,42 (o pedaço marchado 0,24, a coluna e o nó 0,18) —, a integral aérea
      além da tabela 0,08 (a sombra nela 0,04). Feito (a imagem é a mesma conta): (1) a tabela aérea não lê a sombra nas
      fatias que os froxels integram no quadro — quem lê a tabela soma só a diferença dela além deles, e a sombra se
      anulava (o ponto `scene_near_medium_depth`; o `SkyAerialFlow` depois do `FroxelFlow`): 0,264 → 0,111 ms; (2) os
      caminhos e o filtro do cache por despacho indireto (`cloud_scatter_args.wgsl`, `CloudLayer.scatterArgs`): 0,087 →
      0,007; (3) no mapa visto do sol, os nós k e k + 1 da mesma camada numa leitura, o segundo nível só na mistura e a
      coluna do ponto antes da entrada na casca sem páginas nem coordenadas: a tabela 0,111 → 0,067, a marcha −0,02.
      Medidos e desfeitos: as irradiâncias do ambiente lidas uma vez por raio (igual), a soma de prefixos das escolhas em
      série por uma invocação (pior: 0,042 → 0,048 por escolha — a cadeia longa numa invocação custa mais que as 17
      barreiras), a marcha em grupos de 16, 128 e 256 invocações (1,76 / 1,41 / 1,45 contra 1,37 com 64). Medidas
      finais: `high-sun` **3,26 ms** ✗ (3,24–3,29; o mapa 1,09, a marcha 1,37, froxels com − sem 0,15, a tabela aérea
      0,067), `high-sun-fast` 4,10 → **3,90**, `high-wind` 3,22 → **2,95**, `timing` médio **0,69** ✓. Casos (os mesmos
      valores): `sunset` 3,6 %, `dusk-blocks` degrau 1,025 e matiz 0,0491, `sun-below`, `shadow-map` 0,020,
      `ground-shadow` 0,010, `far-cloud` 2,7 %, `fog-in-front` 0,32 %, `beam-air`, `beam-gap`, `scatter-cache`; `sky`
      (`aerial-table`, `aerial-geometry`, `crepuscular`, `beams`) e `fog` (`gi`) passam; vitest de media, scene/sky e
      scene/points passa. **O que falta (0,26 ms) e onde está**: a luz da marcha paga o maior número de amostras com nuvem
      do grupo de 64 raios (12,9 em média) e não a média (7,1 por raio; 411 mil amostras por quadro): uma luz por raio
      dentro do laço custa 0,355 ms, a mesma luz depois do laço 0,070. A luz num passe próprio, uma amostra por invocação
      (a lista compacta pela contagem atômica, despacho indireto; a marcha só com a densidade, um terceiro passe soma e
      compõe), fica estimada em 0,50 ms contra 0,83 — −0,2 a −0,25 ms líquidos, não medido; sozinha não garante os 3 ms.
      **Em aberto na T074: o `high-sun` no ritmo real (3,26 ms), o `interior-timing`, o degrau do `dusk-blocks` ≤ 1,02 e
      a margem do matiz.**
      **Rodada 2026-11-21 j — a luz das amostras da marcha num passe próprio: `high-sun` 3,25 → 2,73–2,78 ms ✓ (teto 3)**
      (`7acfc2d5`; R11 da T074, rodada j, no research.md). O mapa visto do sol não foi tocado. Feito (a mesma conta, em
      outra ordem): a marcha da tela (`cloud_march.wgsl`) só acha as amostras com nuvem e grava cada uma na lista do
      quadro pela contagem atômica (`cloud_light_list.wgsl`, a implementação do ponto `cloud_sample_light`: o ponto, o
      peso na soma do raio `T·(1 − e^(−σ·ds))` — mais o resto na saída antecipada —, a pegada, a coluna do ambiente, o
      cosseno com o sol e a amostra anterior do raio); um passe de uma invocação grava os argumentos do despacho
      indireto e zera a contagem (`cloud_light_args.wgsl`, `CloudLayer.lightArgs`); o passe da luz calcula uma amostra
      por invocação (`cloud_light_samples.wgsl`, `cloud_radiance`); a composição (`cloud_march_compose.wgsl`) soma as do
      raio pela cadeia (teto `CLOUD_MAX_STEPS`) e põe na frente a névoa e a perspectiva aérea. A lista tem o teto do alvo
      dela (16 amostras por raio na média: `lightListA`/`lightListB`/`lightList`, `rgba32float`, 44 MB em 1280 × 720);
      a amostra que não cabe tem a luz calculada no próprio laço — nenhuma fica sem luz. O panorama segue pelo pronto do
      ponto (a luz no laço); `cloud_light.wgsl` ficou com a luz e a marcha por raio foi para `cloud_integrate.wgsl`; a
      referência f64 não muda (a mesma integral). Medidas (M4, 1280 × 720, a GPU fria, mediana de 5): `high-sun` 3,245 →
      **2,781** (2,774–2,811) e, noutra execução, **2,732** (2,699–2,812) ✓ — a marcha 1,370 → 0,47 + a luz 0,26 + a
      composição 0,14 = 0,87 ms (o estimado era −0,2 a −0,25; saiu −0,47 a −0,51); `high-sun-fast` 3,90 → **3,36**,
      `high-wind` 2,95 → **2,42**, `inside-timing` **1,32** ✓. O `timing` médio hoje oscila entre repetições (−1,06 a
      1,72 com o código novo; 1,29 a 2,05 com o de partida, medido em seguida na mesma máquina — a diferença com − sem
      de um quadro leve); por passe, a marcha do médio 1,00 → 0,30–0,36 + 0,14–0,16 + 0,11–0,13. Casos de imagem (os
      mesmos valores): `sunset` 3,6 %, `dusk-blocks` degrau 1,025 e matiz 0,0491, `sun-below`, `ground-shadow` 0,010,
      `far-cloud` 2,7 %, `fog-in-front` 0,29 %, `scatter-cache`; vitest de media/clouds passa. As escolhas de páginas
      (0,04 ms cada) não foram tocadas: o teto fechou sem elas. **O `high-sun` passa. Em aberto na T074: o
      `interior-timing`, o degrau do `dusk-blocks` ≤ 1,02 e a margem do matiz.**
      **Rodada 2026-11-21 k — a memória da lista da luz: 44,2 → 14,7 MB em 1280 × 720 e 398 → 133 MB em 4K (1/3); a
      imagem igual; `high-sun` 2,78–2,79 ms ✓ (teto 3)** (R11 da T074, rodada k, no research.md). A lista tinha três alvos
      `rgba32float` (48 bytes por lugar: o ponto, o peso, a pegada, a coluna do ambiente, o cosseno, a amostra anterior
      e, noutro alvo, a luz). Agora é um alvo `r32uint` de quatro camadas (`CloudLayer.lightList`, 16 bytes por lugar):
      a marcha grava a distância no raio, o peso, a coluna do ambiente e o raio (o bloco); o passe da luz relê o raio
      pelo índice (`cloud_march_ray`, o mesmo da marcha; o ponto, a pegada e o cosseno saem dele e da distância — os
      mesmos valores em f32) e grava a luz no lugar das três primeiras palavras (leitura e escrita no mesmo despacho: o
      `r32uint` do núcleo do WebGPU, nada de extensão); a amostra anterior deixou de existir — a marcha junta as amostras
      do raio e reserva os lugares seguidos delas de uma vez (um `atomicAdd` por trecho, não por amostra), em trechos de
      até 32 (`CLOUD_LIGHT_CHUNK`; o trecho seguinte do mesmo raio leva um lugar a mais com o anterior), e a composição
      soma do último lugar ao primeiro (a mesma ordem de antes). Nenhum valor passou a 16 bits. O tamanho do alvo é o
      teto da lista (16 lugares por raio × 1/16 dos pixels = um lugar por pixel da tela), não a resolução da marcha:
      ficou como estava — o `high-sun` usa 411 mil de 921 mil, mas o teto pela ocupação de uma cena faria a cena mais
      densa pagar a luz na marcha (o trecho que não cabe segue com a luz calculada ali: nenhuma amostra fica sem luz).
      O custo: o vetor das amostras juntadas é zerado a cada raio — com 128 amostras a marcha ia a 0,72 ms (`high-sun`
      2,94); com 32, 0,56; com 16, 0,54 (o mesmo dentro do ruído; ficou 32, menos trechos). Medidas (M4, 1280 × 720, a GPU
      fria, mediana de 5, a partida medida na mesma sessão): `high-sun` 2,712 (2,662–2,903) → **2,780** (2,752–2,890) e, noutra execução, **2,792** (2,756–2,883) ✓; por passe, a
      marcha 0,467 → 0,56, a luz 0,262 → 0,21, a composição 0,146 → 0,16 (soma 0,875 → 0,93); `inside-timing` 0,72 ✓
      (repetições −0,07 a 1,15). Casos de imagem (os mesmos valores): `sunset` 3,6 %, `dusk-blocks` degrau 1,025 e matiz
      0,0491, `far-cloud` 2,7 %, `fog-in-front` 0,29 %, `ground-shadow` 0,010; vitest de media/clouds passa. **Em aberto
      na T074: o `interior-timing`, o degrau do `dusk-blocks` ≤ 1,02 e a margem do matiz.**
- [ ] T075 [GPU] (rodada 20: a faixa ciano/magenta junto ao sol corrigida — a vista do céu limitada a 60 000 e a luz
      do trecho perto em `Froxels.open` saturada no meio-float antes da diferença do fundo; a luz dos froxels em
      unidades de `FROXEL_RADIANCE_UNIT` e o teto na soma do fundo; resta só os feixes suaves contra as fotos, R21
      rodada 20) (rodada 16: o salto 632→633 não se repete — maior salto 1,86; o disco através do cúmulo corrigido; a
      emenda do fundo refeita; segue aberta a faixa ciano na borda da nuvem contra o clarão do sol — rodada 18: o recorte do histórico pela reta
      até o centro da caixa não a tira, quadros 700 e 780 do `solposto` — e os feixes ainda suaves contra as fotos) `solposto` (rodada 15): a luz cai num quadro quando o sol entra atrás do cúmulo (632 → 633; na rodada 14,
      ~20 quadros) e a mancha verde-ciano junto ao sol no horizonte aos 13 s; e os feixes ainda fracos contra as fotos de
      referência (R21, vídeos).
- [x] T076 [US5] O vídeo `tempestade` da rodada 15 (não gravado: a série de GPU parou por um Chrome em estado E quando
      outro smoke começou junto). — **Gravado no fechamento (2026-11-21, `b44e90ab`^, claflow-web porta 5184,
      `scratchpad/041-video/rodada38/`)**: o quadro de prova antes (`prova/tempestade-q0.png`: cúmulos rasos, céu e chão
      sem defeito); 7200 quadros, brilho 51,81 dB, RGB 47,31 dB contra o exato, GPU por quadro média 20,2 ms (mediana 21,2,
      p95 24,9); 95 MB recomprimido em `tempestade-r.mp4` (12,9 MB, CRF 20); conferido o quadro aos 100 s (a base escura do
      sistema sobre a câmera, a faixa clara no horizonte).
- [x] T077 [GPU] O mapa de cobertura em níveis em volta da câmera (R21 rodadas 18–19): níveis de 512² texels (31,25 m no
      nível 0 do alto) por páginas da C2 no endereço toroidal, uma leitura por ponto (a passagem entre níveis no anel de
      fora de cada janela, no desenho), orçamento constante pela mesma função de cobertura; o mapa 0,160 → 0,049 ms; o
      `beam-gap` a +3 px da f64 exata; referência `reference/cloudCoverageLevels.ts` e `cloudCoverageLevels.test.ts`.
- [x] T078 O `beam-gap` mede o ar sozinho (a grade dos froxels até a base da camada) contra a f64 com a mesma nuvem (o
      espelho da densidade com o mapa de cobertura da GPU): contraste a 2,9 %, bordas ≤ 4 px além (R21 rodada 18); a
      `raios-chao` refeita (o morro, os vãos pela geometria) e gravada.
- [x] T079 [GPU] O mosaico nas nuvens escuras do pôr do sol (rodada 36; `solposto` quadro 1000, `solposto-chao`,
      `raios-chao`, `tempestade`): blocos de 4 × 4 px (o bloco 2 × 2 do alvo de ¼) com uma amostra cada onde o gradiente
      temporal larga o histórico — o valor do pixel marchado copiado nos quatro texels. Provado no quadro: com o
      gradiente desligado o mosaico some. A reconstrução passa a dar a cada texel o valor exato interpolado entre os
      pixels marchados dos blocos vizinhos (`cloud_fresh_at`) e a largar o histórico em rampa (`cloud_history_reset`, de 1
      a 1,5 × a tolerância), com o histórico que fica recortado pela caixa; referência `cloudReconstruct.ts` e testes. Caso
      `dusk-blocks` (o sol do `solposto` andando, 1280 × 720): o degrau na borda dos blocos / entre texels 1,317 → 1,069, o
      erro de alta frequência contra a cena parada convergida 4,42 → 3,59 %; `sunset` 3,9 → 3,7 %. Fica registrada a grade
      de 4 px das idades dos texels na média exponencial (2–3 % do brilho linear no caso, < 0,5 nível de 8 bits no vídeo):
      propagar a mudança dos marchados aos outros texels é instável (o modo xadrez se amplifica) e foi descartado.
- [x] T080 [GPU] A grade de 4 px e o atraso da cor no pôr do sol em movimento (rodada 37; `solposto` quadro 1000). Medido
      no `dusk-blocks` antes de desenhar: três atrasos isolados. (1) O mapa visto do sol: a fila da escolha das páginas em
      14 oitavas saturava com o sol andando (o plano gira, colunas de ~30 km) — quase todas na fila de cima, a ordem da
      página física decidia e as de índice alto esperavam até `CLOUD_SHADOW_MAX_AGE`; com o mapa inteiro refeito por quadro
      o matiz atrasado ln(R/B) caía de 0,95 a ~0. Corrigido: 46 filas em meias oitavas e a mudança limitada a 1
      (`shadowPageKey`; teste: com 2048 páginas e 128 por quadro nenhuma espera mais que 32 quadros, antes > 120). O passe do
      mapa em movimento a 1,3° de sol: 0,93 → ~2,2 ms (as 128 páginas por quadro agora são as vistas e com nuvem, não as
      baratas de índice baixo); parado, nada muda (`timing` alto 2,76 ms). (2) O histórico: um texel por bloco marchado a
      cada 4 quadros, média exponencial ~13 quadros atrás e as idades de 0 a 3 quadros no bloco (a grade). O histórico de
      todos os texels segue o desvio medido entre as médias dos valores exatos e dos históricos nos marchados
      (`cloud_history_follow`: β = ½ × o ganho τ²/(τ² + σ²), τ = 10 %/quadro contra o erro padrão relativo da média, e o
      denominador C + (α/2)(F − C) sem viés), numa janela que anda com o texel e sem resposta negativa em frequência
      (`cloud_gradient_weight`, [1,2,1]/[1,3,3,1]; a média 3 × 3 de pesos iguais amplificava faixas de blocos — degrau 6–9 ×);
      o gradiente e a rampa do recorte pela mesma janela. Passe novo por bloco `cloud_check_main` (o histórico no marchado e
      a variância temporal, alvos `check`/`checkNoise`): reconstrução 0,234 → 0,038 + 0,126 ms. Seguindo sempre (sem o
      ganho), o `sunset` caía a 7,6 %; com τ = 0,2, 5,4 %. Referência `cloudReconstruct.ts` (`cloudGradientWeight`,
      `cloudHistoryFollow`) e testes (a grade de blocos em f64: atraso 13 → < 1,2 quadro, idades 3 → < 0,3; a faixa
      alternada se apaga com a janela e cresce com a média de pesos iguais; o fator sem viés). (3) O cache de espalhamento
      (fica registrado): em movimento a luz ~19 % abaixo da cena parada — o sol que anda esquece os caminhos das sondas e
      a luz delas cai nas oitavas (`CLOUD_SCATTER_PRIOR`), mais escuras na base à sombra; com 8 × o orçamento de páginas do
      cache, −8 %. `dusk-blocks`: degrau na borda dos blocos 1,069 → 1,024 (≤ 1,03), alta frequência 3,59 → 2,57 %
      (≤ 3 %), grade 1,9 → 0,6–1,2 % (parada 0,26), matiz contra a cena parada 0,95 → 0,018 (critério novo ≤ 0,05).
      Casos: sunset 3,6 %, noon 1,3 %, backlit 4,0 %, types 2,0/1,7/1,5 %, storm 2,4 %, beam-gap +3,0 px, timing alto
      2,76 ms. Aberto: o brilho do cache de espalhamento com o sol andando (3).

- [x] T081 [GPU] As regressões do gate da rodada 16 (2026-11-20, `r16all`), uma por vez, medidas contra o
      `develop` numa árvore própria (`npm ci` próprio, removida ao fim). (1) `fog-in-front` 6,5 %: determinístico
      e sem depender dos casos de antes (sozinho, 6,53 % também no `eb1804f4`). Bisseção pelo mesmo caso:
      antes da R21 0,05–0,08 % (rodada 15) → `35879b61` (a atmosfera como meio dos froxels) 2,24 % → `eb1804f4` (raios rodada 16)
      6,53 % (o bloco 13, 18; aos 400 quadros ainda 4,2 %: não é só convergência) → `c03e0755` 2,50 % → `eeb10d4b`
      (a reconstrução das nuvens reprojetada sem o deslocamento do AA temporal) 0,62 % → `c54938dd` (o raio da
      marcha sem ele) 0,31 %. Já corrigido no ramo; com as peças abaixo, 0,29 % aos 180 quadros e 0,27 % aos 400.
      (2) O tempo da névoa: o passe mais caro é a injeção dos froxels — a atmosfera como meio deles (`35879b61`,
      R21) na cena da janela (que tem `Sky`). Na mesma página com os kernels trocados (o relógio da GPU muda entre
      execuções; o A/B intercalado entre árvores deu develop 0,82/1,16/1,66 contra o ramo 0,85/1,08/3,21 e não
      separa 0,2 ms): kernels do develop 0,62–0,64 ms, do ramo 0,85–0,88; a injeção antiga sozinha 0,65–0,70, a
      integração antiga −0,03; sem a sombra do terreno no ar −0,12, sem a das nuvens/névoa no ar −0,03. Corrigido
      o trabalho repetido (`aff4a497`): dentro da névoa o `light_visibility` do sol era lido duas vezes no mesmo
      ponto — `SceneMedium` devolve a fonte e a visibilidade que o meio leu e o laço das luzes a reusa; a
      integração tira e^(−σΔ) do produto das transmitâncias já calculadas. 0,85/0,85/0,88 → 0,79/0,79/0,83 ms; o
      resto (~0,17 ms) é a atmosfera nos froxels que o R21 decidiu (~0,3 ms previstos). O `timing` passa a tomar a
      mediana de três rodadas (com o máximo de duas, uma rodada lenta reprovava sozinha: 0,99 contra 0,79 na mesma
      página): 0,86 ms ≤ 1,05; os casos de imagem do `fog` iguais. (3) GI: o tempo esgotado (600 s, no último
      caso) não é custo novo nas sondas: o `globalIllumination` inteiro com o tempo de cada caso (registro novo no
      smoke), um por vez — `develop` 412 s, ramo 492 s. Os kernels da GI iguais (alto 21,4 → 20,8 ms, médio 6,3 →
      5,9, baixo 3,8 → 3,8: nuvens e céu nas sondas não pesam). Dos +80 s: as referências da CPU (código igual)
      +38 s — o mesmo `cornell` mede 16,6–41 s entre execuções; na rodada 16, a `window` 104 s contra 39 hoje, e
      as sondas do `budget` 551 contra 391 ms (a máquina 1,5–2,7× mais lenta: o tempo passou de 600 no último
      caso, `furnace`, de 6 s); o `budget` +23 s e as cenas com `Sky` (`window`, `skyfloor`) +8 s cada, pelo céu
      da 041 no desenho (o desenho sem GI do `budget`, 11×, 54 → 72 ms: +1,6 ms por desenho a 1280 × 720 com o ar
      nos froxels e a perspectiva aérea; a parte da GI por pixel 0–0,7 → 1,2–2,1 ms) — custo da perspectiva aérea
      a conferir na T043 (`bench:check` nas cenas com `Sky`). O teto do executor passa a 900 s para este smoke
      (medido: 492 s com a máquina normal). (4) O erro de validação engolido (R20, "o erro de validação do passe
      não chega ao `engineError`"): sem `captureErrors` (o padrão: o gravador do claflow-web, as apps), o quadro
      inválido e os erros de criação e de escrita iam ao `uncapturederror` do device, que ninguém ouvia — o Chrome
      os escrevia como aviso e o executor só olhava os erros. Corrigido (`2b78dcb5`): o core ouve
      `uncapturederror` (`EngineCore.onUncapturedError`), a cena o emite como `engineError` (`stage:
      'uncaptured'`), e o executor dos smokes reprova a página que escreve um erro do WebGPU (o aviso com o
      contexto do Dawn, `- While …`). Conferido com uma página descartável (cópia fora do tamanho do buffer, sem
      `captureErrors`): 2 `engineError` e o smoke reprovado. Nos casos rodados nesta tarefa, nenhum erro sem
      escopo.

- [ ] T082 [GPU] **Transferida para a próxima spec de desempenho** — sol rápido e vento ≤ 3 ms no perfil alto
      (`high-sun-fast`, o sol a 0,25°/s do ciclo de dia de um jogo, e `high-wind`, o vento de 10 m/s; hoje sem teto no caso
      `timing`, T074). Medidas de partida (M4, 1280 × 720, `596fb6e5`): `high-sun-fast` **4,76 ms** — o mapa visto do sol
      1,44, a marcha 1,49, os caminhos do cache 0,57, froxels 0,56, tabela aérea 0,28; `high-wind` **3,27** — a marcha 1,36,
      os caminhos 0,57, o mapa 0,27 (no fechamento: 4,76 e 3,21). Já tentado e desfeito (R7/R8/R11 da T074 no research.md):
      rodada e — a luz de nível de detalhe pela transmitância (sem ganho, o grupo SIMD paga o mais caro), a marcha em dois
      laços (igual), o despacho em ladrilhos 8 × 8 (−0,04), mais passos finos depois da nuvem (−0,12/−0,23 ms, `sunset`
      4,4/4,9 %), o desenho do mapa em quatro fases entrelaçadas (degrau do `dusk-blocks` 1,049), a cauda do caminho do cache
      pelo próprio cache (−0,07); rodada f — os níveis de detalhe do volume da forma na luz (medidos, não cortam amostras);
      rodada g — o mapa visto do sol por coluna com a previsão por texel (com o sol a 0,25°/s todas as colunas passam da
      metade da tolerância a cada quadro) e os caminhos do cache continuados entre quadros (0,57 → 0,35 ms, `high-wind` 3,06,
      mas o degrau do `dusk-blocks` 1,028–1,034 e o matiz 0,061; `scratchpad/t074g/continued-paths.diff`). O que falta é
      estrutural: o mapa com o sol andando mudando o que se guarda (a reprojeção das colunas pelo deslocamento de cada trecho
      ou o mapa pré-filtrado) ou a tolerância pela tela com o antisserrilhado temporal; os caminhos continuados sem o atraso
      da luz das sondas.

**Checkpoint**: US5 completa quando T047–T049 e T052–T056 fecharem na GPU.

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
- **Fechamento (Fase 7)**: depende de todas as histórias (inclusive a US5).
- **US5 (Fase 8)**: depende de US1–US3 (marcha, densidade, mapa de cobertura, reconstrução). T045 e T046 primeiro (a
  referência antes do shader); T047 → T048 → T049; T050 junto; T052–T055 depois dos kernels; T056 por último.

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
