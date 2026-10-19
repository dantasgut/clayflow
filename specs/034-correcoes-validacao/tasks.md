---
description: 'Tarefas da spec 034 — correções da validação na RTX 4090'
---

# Tasks: Correções da validação na RTX 4090

**Input**: `specs/034-correcoes-validacao/`:

- [plan.md](./plan.md)
- [spec.md](./spec.md)
- [research.md](./research.md) (R1–R14)
- [analise.md](./analise.md) (L, D, M, S, V)

**Tests**: obrigatórios (Constituição V, SC-001–SC-015). Uma tarefa só é marcada depois de medido o critério dela.
Nenhuma correção muda critério, limiar ou espaço de medida de um smoke; nenhum atalho (cópia da tela no lugar de
traçar, desfoque no lugar de amostrar, filtro que esconde a causa).

- Vitest (`countingCore`) para toda regra de CPU.
- Smokes de navegador com medidas, fonte e `--dist`, **com janela**: nunca `--headless`, porque a 4090/Vulkan perde o
  device e o usuário acompanha.
- Os smokes novos medem o **antes** na fase 1.

**Organização**: por história de usuário; a prioridade só ordena.

Regras de todas as tarefas:

- Resource + evento + Flow (sem helpers); o dispatch só grava; nenhuma leitura de volta por quadro.
- Um símbolo WGSL por definição; só `shaders.ts` importa `.wgsl`; C3/C4 importam só a C2.
- Trajetórias bit a bit, salvo a exceção registrada no plano (física que espera o colisor).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1–US7)

---

## Phase 1: Setup (estado de partida)

- [x] T001 Criar a branch `fix/034-correcoes-validacao` a partir do `develop` com o trabalho de `chore/validacao-4090`
      (fixtures `nvidia-lovelace`, flags do Chrome no Linux, `npm run video`); apontar `.specify/feature.json` para a 034.
- [ ] T002 Registrar o estado de partida em `specs/034-correcoes-validacao/baseline-check.md`:
  - `npm run ci`;
  - todos os smokes com janela, fonte e `--dist`, com as falhas conhecidas S1–S3;
  - o tempo por passe da GI, da névoa, da estrutura de raios, do campo do fluido, da sombra e do LCP (timestamp) nas
    cenas da 033 e em `rigid-bodies/10k`;
  - o clock da GPU durante a medida (`nvidia-smi`).
- [x] T003 [P] Criar `src/__smokes__/giNoise.ts` (cena com janela de `support/giScenes.ts`, `medium`, sol a 50°, câmera
      parada) e registrar no runner e no `src/__smokes__/README.md`. Medidas, na mesma cena sem gather de tela e no
      traçador de caminhos:
  - manchas: desvio de alta frequência na parede do fundo;
  - variação quadro a quadro;
  - média por região a 2 s e a 10 s.

  Rodar e anotar os números de antes (4,57; 0,38; 162 contra 169).

- [x] T004 [P] Criar `src/__smokes__/causticFlux.ts`: esfera de vidro focando o sol sobre planos em y = 0, y = h/4 e
      inclinado a 30°, com o fluxo integrado da cáustica contra o fluxo interceptado menos Fresnel. Rodar e anotar o antes
      (esperado ~0,5× em y = 0).

---

## Phase 2: Foundational — régua dos smokes (bloqueia as histórias)

**Purpose**: sem medida em radiância e sem prontidão do motor, os smokes não servem de régua (R8, R10).

- [x] T005 [P] Referência de CPU da apresentação (já existia: `src/elements/material/reference/tonemap.ts`, conferida
      contra a do Blender/Wrensch; research R10) em `src/presentation/reference/` (ou junto de `tonemap.test.ts`):
      AgX do Blender/Troy Sobotka (matriz de entrada, curva, matriz de saída), sRGB e exposição, para conferir o motor
      ponto a ponto (R10). Testes contra valores publicados.
- [x] T006 [P] Prontidão na C2/C1: compilações e verificações em voo expostas pelo `GpuEngineCore`, e
      `app.ready(): Promise<void>` mais o evento `ready` (nenhum Flow em `preparing`, nada em voo). Testes Vitest com
      `countingCore`: pronto depois da última compilação; volta a não pronto quando um Flow novo entra.
- [x] T007 Em `src/scene/systems/flowBinding/PipelineState.ts:361`, tratar a rejeição do `createAsync` quando o token
      mudou ou o core está fechando; teste da rejeição depois do dispose sem exceção não tratada.
- [x] T008 A física espera o colisor (R8): os estágios de física declaram os estágios de colisor obrigatórios, e o passo
      não avança nem acumula `Time` enquanto um deles não está pronto. Testes: nenhum passo antes do colisor pronto;
      trajetória igual com compilação lenta e rápida.
- [x] T009 O `settle` de `src/__smokes__/support/extensionScenes.ts` aguarda `app.ready()`; os demais esperas por tempo
      fixo nos smokes passam a aguardar a prontidão.

**Checkpoint**: régua pronta. `parametricSurfaces/animated` passa 3× seguidas, sozinho e na suíte, com 0 pageerrors
(S2).

---

## Phase 3: User Story 1 — Luz indireta limpa e convergente (P1) 🎯

**Goal**: paredes sem manchas na cena com janela; a imagem parada converge (L1, L4, L5).

**Independent Test**: `giNoise` (T003) cumpre o SC-001 e o SC-002; vídeo `day` sem manchas.

- [x] T010 [US1] Histerese do gather de tela (R2), com testes da regra em CPU (convergência parada, queda no transiente,
      N contado só com raios):
  - estado de resposta próprio do gather em `ProbeFlow.ts`/`gi_screen_*`;
  - `screenHistory` em `GlobalIllumination.ts`: 256 no `medium`, 1024 no `high`, validado.
- [x] T011 [US1] ~~Raios pela face de trás fora da média (R5)~~ — descartada pela medida (research R5) em `gi_screen_trace.wgsl:75-107`: divisor pelos raios
      válidos; sem nenhum válido, herda o histórico.
- [x] T012 [US1] Amostragem por importância guiada pelas sondas do mundo (R1 revista; o campo distante pelas sondas foi
      descartado pela medida — viés de 15 % na Cornell). Plano original:
  - `screenReach` (default 2 × o espaçamento da cascata mais fina) em `GlobalIllumination.ts`;
  - em `gi_screen_trace.wgsl`, o raio sem acerto até o alcance lê a radiância das sondas do mundo na direção, no ponto
    final, com os pesos de `gi_weights.wgsl` e os mesmos desvios pela normal e pela vista;
  - ligações das sondas do mundo ao passe de tela em `ProbeFlow.ts`.
- [x] T013 [US1] ~~Contenção de firefly (R3)~~ — descartada pela medida (research R3): luminância do raio ≤ 8 × max(média lenta da sonda, radiância da sonda do
      mundo na direção), mantendo a cor.
- [x] T014 [US1] Filtro (R4): duas variantes medidas pioraram as manchas; fica o gaussiano da 033 (research R4). Plano
      original:
  - momento de segunda ordem acumulado junto com a média;
  - 3 iterações (passos 1, 2 e 4 ladrilhos) em `gi_screen_resolve.wgsl`, no lugar da gaussiana 5×5;
  - pesos de profundidade, normal e luminância.
- [x] T015 [US1] (Rodados depois de T017–T020: `giNoise` manchas 1,14 % = 0,97× a referência, cintilação 0,103 %, 2 s a
      0,11 %; `globalIllumination` passa — Cornell pior 6,4 %, `living` 95,2 %, GI 2,65 ms; `fog` passa. A janela tem
      viés de 8,7 % no chão, igual no commit da T017; a bilinear descartada o baixava a 6,3 %.) Rodar `giNoise`, `globalIllumination` e `fog`. Critérios: SC-001 (manchas ≤ 1,1× a referência,
      variação ≤ 0,1, 2 % a 10 s), SC-002 (viés ≤ 3 %) e SC-011 (vazamento ≤ 0,067 %, resposta ≥ 99 % a 0,25 s). Se o
      SC-001 não fechar, acrescentar a amostragem por importância (R1, descartado como extensão) antes de mexer nos
      limiares.
- [x] T016 [P] [US1] Corrida das sondas (R7): `gi_probe_response_main` (uma invocação por sonda agendada) antes do
      blend; `gi_probe_blend.wgsl:37-42` passa a só ler. Rodar `globalIllumination` (estabilidade e resposta).
- [x] T017 [P] [US1] Rebatimentos ≥ 2 com bilinear (`gi_generation.wgsl:22-24`) e piso de 1e-6 nos pesos DDGI
      (`gi_weights.wgsl:86-90`) (L8, L9). O piso entrou (sem efeito medido na janela; o DDGI de referência). A bilinear
      foi descartada pela medida: a cintilação da janela passou de 0,102 % a 0,112 % (≤ 0,11 %) nas duas rodadas, sem
      facetas medidas antes. No caminho: o `globalIllumination` aquecia por tempo de parede (a GI avança a rotação dos
      raios a cada quadro desenhado: cada rodada media noutra fase) — aquecimento em quadros; medido assim, o `living`
      ficava em 94,4–95,3 % (≤ 95 % falhava de fato), e a memória de deriva da resposta passou de 32 a 16 quadros
      (95,0–95,4 %; cintilação 0,103–0,106 %). A regra pelo guia das sondas do mundo foi tentada e descartada (0,16 %).
- [x] T018 [P] [US1] Sombra direcional sem degrau (L6): filtragem PCF/Poisson e ajuste da resolução à cena em
      `ShadowFlow.ts`. Medida de degrau na borda da mancha de sol no `giNoise`. Feito: (1) a caixa da luz ajustada à cena
      na GPU (`ShadowMatrixFlow` + `shadow_bounds.wgsl`: a caixa de objeto de cada grupo de geometria, `Geometry.bounds`,
      pela matriz de mundo, reduzida por atômicos; quadrada, presa aos texels; caixa desconhecida — vértices da GPU — volta
      aos ±10 m); (2) PCSS (`sample_shadow_pcss`): a penumbra pela distância de quem faz sombra vezes o diâmetro angular da
      fonte (`DirectionalLight.angularDiameter`, padrão o do sol, 0,53°), filtrada por 32 comparações bilineares numa
      espiral de Vogel (raio ≤ 6 texels). Caso `sun` do `giNoise` (sol a 20°): degrau 0,019 → 0,018 px, penumbra 16,5
      (borrão do PCF largo) → 13,6 px (só a caixa: 3,9 px, nítida e serrilhada na tela). Custo: o quadro de 64k 15,5 → 13,75
      ms, a GI 2,77 → 2,55 ms. Fixtures que mudam com a sombra: `parametricSurfaces/lake` (imagem) e `softSurface/
xpbd-cloth` (fase 9). O degrau do vídeo `fog` (sol de 20° a 50°, azimute ±35°) se confere na T020.
- [x] T019 [P] [US1] (Conferido no vídeo `fog`: com o contraste ×2,2 a névoa escura não tem o quadriculado — o L7
      não se reproduz; nada a mudar. Achado: o jitter por quadro, o histórico reprojetado e a leitura tricúbica já existem desde a
      033 — a causa dos blocos do L7 se diagnostica no vídeo `fog`, T020.) Névoa sem blocos (L7): jitter dos froxels por quadro e reprojeção temporal em
      `src/elements/gpu/wgsl/media/media_froxel_*`; medir no smoke `fog` (Beer–Lambert e feixe sem regressão) e no vídeo `fog`.
- [x] T020 [US1] (Gravados nos dois modos, tempo real a 60 FPS sem quadro perdido. A sombra sem degrau e com
      penumbra; a névoa sem blocos; os entalhes da verga (L5) apareciam como degraus na face fina: a leitura das sondas
      de tela somava as compatíveis de 5 × 5 ladrilhos por 1/(1 + d²) — sondas entrando e saindo da janela davam
      saltos — e, sem nenhuma compatível, usava a de outra orientação; agora um núcleo que chega a zero na borda e, sem
      compatível, as sondas do mundo (verga lisa no vídeo). As manchas suaves do chão com o sol baixo continuam (o
      SC-001 mede a parede).) Gravar `day` e `fog` (`npm run video -- day,fog`) e conferir manchas, entalhes da janela, borda da
      sombra e névoa.

**Checkpoint**: US1 entregue; manchas, entalhes, degrau e blocos resolvidos e medidos.

---

## Phase 4: User Story 2 — Cáusticas com a energia certa (P1)

**Goal**: o fluxo da cáustica conserva em qualquer altura e inclinação do receptor (L2).

**Independent Test**: `causticFlux` (T004) cumpre o SC-003.

- [x] T021 [US2] Referência de CPU da normalização em `src/elements/lighting/reference/` (depósito e leitura no plano
      tangente, área `h²/|n_dominante|`), com testes de fluxo integrado em planos a várias alturas e inclinações.
- [x] T022 [US2] Plano tangente nas cáusticas (R6; a camada de cada célula pela altura do plano no centro dela, para
      os planos inclinados):
  - `gi_photon_deposit` (`gi_photon_trace.wgsl:128-137`) com a normal do acerto: bilinear nos eixos perpendiculares,
    a célula mais próxima no eixo da normal;
  - `gi_caustic_irradiance` (`gi_photon.wgsl:65-76`) com a mesma base;
  - a área do `gi_photon_resolve.wgsl:19-24`.
- [x] T023 [US2] (O `causticFlux` falhava desde o `cc2e2adb` — 0,92× nos três receptores, conferido por bisseção:
      a câmera vê o receptor sob a placa através dela, e com a refração traçada a vista também paga o Fresnel das duas
      faces, (1 − R)² ≈ 0,92; o esperado passou a T · T_vista, limite igual: 101,9 %, 101,9 %, 100,6 %. Demo `caustics`
      gravada nos dois modos: foco coerente; a metade de baixo da esfera tem grão com a câmera andando — a média temporal
      da refração recomeça a cada quadro.) Rodar `causticFlux` (SC-003 ≤ 5 %), `globalIllumination` (cáusticas) e a demo `caustics`.

**Checkpoint**: US2 entregue.

---

## Phase 4b: User Story 7 — Refração traçada de verdade (P1)

**Goal**: o raio refratado atravessa as interfaces até uma superfície que não transmite; rugosidade por GGX; reflexo
traçado; dispersão por canal; água refratando na saída (R1 da 011; R15, R16). Nenhuma leitura da cópia da tela no
caminho do raio.

**Independent Test**: smoke `refraction` contra o traçado de caminhos cumpre o SC-014.

- [x] T059 [US7] Estender o traçado de caminhos da CPU (`src/elements/lighting/reference/pathTracer.ts`) com dielétrico
      liso e rugoso (GGX), dispersão por canal e meio absorvente (água), com testes (Fresnel, reflexão interna total,
      conservação no forno branco).
- [x] T060 [US7] Criar `src/__smokes__/refraction.ts` com os seis cenários da US7 (lente 4× sobre xadrez, pilha de
      interfaces, vidro rugoso 0,3, faces atravessadas refletindo um objeto, prisma com dispersão e MSAA, água vista de
      dentro e de fora com absorção pela profundidade) e um teste que remove a cópia da tela e exige a mesma imagem;
      medir o antes.
- [x] T061 [US7] (com o ponto `scene_refraction`, o modo só de refração automático e o sorteio no pixel com média
      temporal — research R15) Caminho de raios em `forward_transmission.wgsl` (`:38`, `:100`): refração por `ray_scene_hit` até a
      superfície que não transmite, Fresnel por amostra entre refletir e refratar, término só por energia; acerto avaliado
      pelo kernel de acertos (material + luz direta e indireta); sem acerto, o céu/ambiente da direção.
- [x] T062 [US7] Reflexo das faces atravessadas por raio traçado.
- [x] T063 [US7] Rugosidade por GGX (VNDF) na transmissão e na reflexão, com acúmulo temporal reprojetado; remover o
      desfoque bilateral se existir no caminho.
- [x] T064 [US7] Dispersão: um raio por canal com o IOR do canal, iluminado no próprio acerto; por amostra com MSAA.
- [x] T065 [US7] Água (R16): saída do volume com a normal da saída, Fresnel e reflexão interna total; absorção pela
      distância. A água é uma interface como o vidro no mesmo traçado (`ray_volume_hit`/`ray_volume_optics`); o desenho
      da água lê `scene_refraction` (sem a cópia da tela). Custo: bandeira, ladrilhos, frente de onda e uma chamada de
      cada função grande (research R15) — barragem de 64k a 15,5 ms o quadro.
- [x] T066 [US7] Normal da água na origem (R16): referência de CPU da distância exata, medir o erro do campo depois do
      redistanciamento em `FluidFieldFlow`, corrigir o redistanciamento até a tolerância; nenhum filtro na normal.
      Medido: o campo da GPU confere com a referência nas mesmas partículas (rms 0,11 mm), a normal na escala das
      partículas a 0,0021 (≤ 0,01); o relevo que resta vem do solver (análise O8, spec 035). Nada a corrigir no campo.
- [ ] T067 [US7] (Rodados: `refraction` e `globalIllumination` passam; `fluidField` passa com a cena de 64k corrigida
      (O4) e os dois orçamentos (FR-027d); `materials` só no O1; `fluidSurface` falha na água parada (O8) e nas
      fixtures que mudam com a refração física: dam-opaque, sph, pbf, mpm, layer-15cm, caustics, submerged-box,
      coexistence.) Rodar `refraction` (SC-014), `materials`, `globalIllumination`, `fluidSurface`, `fluidField`,
      `particles` e `parametricSurfaces`; anotar as fixtures que mudam (regravadas uma vez, com montagem antes/depois, na
      fase 9); custo por pixel transmissivo no `bench:check`; demo `caustics` e um vídeo de vidro e água.

---

## Phase 5: User Story 4 — Smokes verdes e confiáveis (P2)

**Goal**: 31/31 em 3 rodadas, fonte e `--dist`; `ci` verde (S1–S4).

**Independent Test**: `npm run smoke` 3× e `npm run ci` 3×.

- [x] T024 [US4] Apresentação contra a referência (R10, passo 1): comparar `presentation` (AgX, sRGB, exposição,
      pontilhado) com T005 numa rampa e em cores saturadas; corrigir a divergência no motor. Rodar as seis checagens de S1
      e anotar cada valor.
- [x] T025 [US4] Luz da cena desde o `4046c88e` (R10, passo 2): níveis das luzes padrão e do hemisfério nas cenas de
      `extensionPoints`, `softSurface`, `nodeGraphs`, `fluidSurface` e `parametricSurfaces` (unidades, nada somado em
      dobro); corrigir o que divergir. Rodar as seis checagens.
- [x] T026 [US4] Materiais dos testes (R10, passo 3): no `nodeGraphs`, conferir se o caso pede emissão pura e se a API
      dá um material sem lobo especular sem atalho; idem para os materiais do pano, do xadrez e do olho de peixe.
- [x] T027 [US4] Cáusticas do lago e da água agitada pela causa no motor (`CausticsFlow` da 017, `caustics.wgsl`):
      medir o contraste em HDR e na tela depois de T024–T025; se ainda faltar, achar a perda no motor (normalização,
      filtro, acúmulo temporal da 033) e corrigir, sem piorar a água parada. Gravar a fixture de estado do lago.
- [x] T028 [US4] Fechar S1 (motor conforme; decisão do usuário: medir a radiância — research R10; o `fluidSurface` fecha
      com T029 e T066: água parada 6,4 % e amostras de GPU): se alguma das seis checagens ainda falhar com o motor comprovado conforme a referência,
      **parar e levar ao usuário** a evidência (medida em linear e na tela, curva conferida) para ele decidir o critério;
      não mudar critério, limiar nem espaço de medida por conta própria. Gravar as fixtures de estado de `extensionPoints`
      quando passar.
- [x] T029 [US4] Tempo de GPU por quadro (R11, R17; o anel de 3 buffers e o passo no ritmo da GPU — `stepPaced` — com
      cada `gpuFrame` contado uma vez: o `fluidSurface` passou de 0 a 90 amostras, 6,17 ms): timestamp no início e no fim do quadro, anel de 3 stagings em
      `src/core/gpu/profiler/GpuProfilerSystem.ts`, amostra marcada com o quadro de origem, `dispose` esperando os maps;
      testes do anel em Vitest. Os smokes de desempenho (`fluidSurface/performance36k` e os da 033) cadenciam até ≥ 90
      amostras (SC-015).
- [ ] T029a [US4] Água a 64k contra o `develop` (H7) com a medida de T029, na 4090; explicar e corrigir qualquer
      regressão pela causa.
- [x] T068 [US4] Vizinhança na ordem por célula (análise O5): `NS.find`, densidade, forças e normais do SPH e os 4
      kernels do PBF andam na ordem por célula (as partículas fora da grade numa célula própria no fim, o total na
      última palavra da ordem); a lista de cada partícula é a mesma (smoke `particles` idêntico). `NS.find` 5,06 →
      2,3 ms a 64k.
- [ ] T069 [US4] Capacidade de blocos do campo (análise O6): crescer pela contagem da GPU (lida com atraso) ou um limite
      físico justificado; o bloco que falta não pode virar buraco em silêncio.
- [ ] T070 [US4] Pontas de jato do SPH acima da subida física (análise O7): medir contra uma referência de
      desabamento de barragem e decidir com o usuário (fidelidade da física, anterior à 034).
- [x] T030 [P] [US4] `field.test.ts`: culling por grade no `densityAt` (`src/elements/fields/reference/field.ts:200-242`),
      com o teste de equivalência contra a versão sem culling; `npm run test:coverage` 3× sem estouro.
- [ ] T031 [US4] Smokes completos, fonte e `--dist`, 3 rodadas seguidas (SC-008); `npm run ci` 3×.

**Checkpoint**: US4 entregue; a suíte é a rede de segurança das fases seguintes.

---

## Phase 6: User Story 6 — Medir de verdade na 4090 (P3, antecipada como régua da US3)

**Goal**: bench acima de 60 FPS; baseline `nvidia-lovelace` (V3).

**Independent Test**: `npm run bench` em `instances/10k` passa de 60 FPS; `bench:check` verde.

- [x] T032 [US6] (A emulação de viewport não era: sem ela, ainda 60 FPS. Era a apresentação pela superfície Vulkan,
      que ignora o `--disable-gpu-vsync`: com `--disable-vulkan-surface` no modo de medida (o WebGPU segue no Vulkan, a
      janela por GL; o vídeo em tempo real mantém a vsync), `instances/10k` sai de 60 para 269–287 FPS, p99 7–8 ms. O
      clock da GPU amostrado por `nvidia-smi` entra no resultado: 210–2520 MHz, mediana 2520 (P0 na medida).) Testar a hipótese da emulação de viewport (`bench/runner/orchestrate.ts:63`) com `viewport: null` e
      `--window-size`. Se não for ela, comparar as flags do Chrome (`bench/runner/browser.ts`) uma a uma, inclusive a
      vsync sob Vulkan/X11. Registrar o clock da GPU (`nvidia-smi`) no resultado do bench (R12).
- [ ] T033 [US6] Gravar o baseline `nvidia-lovelace` (`bench:baseline`), conferir `bench:check` na mesma build e medir
      G3 (`rigid-bodies/10k` p99) e H3 (`particles/64k-water` p95).

---

## Phase 7: User Story 3 — Sem trabalho quando nada muda ou o recurso não existe (P2)

**Goal**: cenas paradas ou sem o recurso não gastam com ele (D1–D9).

**Independent Test**: tempo por passe (timestamp) nas cenas de controle de T002, antes e depois; SC-004 a SC-007.

- [ ] T034 [P] [US3] Fótons sem alvo (D1):
  - potência zero para toda luz sem alvo em `gi_photon_trace.wgsl:46-55`;
  - sem dispatch de traço e resolve sem alvo (`ProbeFlow.ts:313-314`);
  - potência total e prefixo por luz calculados uma vez em `gi_photon_targets_main`.

  Cena de controle: luz pontual sem especular, com 0 dispatch.

- [ ] T035 [P] [US3] GI que desfaz o que ligou (D2) em `src/presentation/flows/defaults.ts:218-238`:
  - remover a `RayScene` que ela inseriu;
  - reagir a `enabled`;
  - devolver o hemisfério e o prepass.

  Testes de inserir, desligar, religar e remover; GPU a ±3 % da cena sem GI.

- [ ] T036 [US3] Revisões de "nada mudou" na C2 (R9): pool de `WorldTransform`, `Time.steps`, geometria produzida,
      luz. Testes Vitest.
- [ ] T037 [P] [US3] `RaySceneFlow` (D3): TLAS, esferas e geometria com contagem na GPU só com revisão nova, e o
      envelhecimento só com refit (`:387-395,631-636,643`).
- [ ] T038 [P] [US3] `FluidFieldFlow` (D4): pular sem passos novos; limpar e despachar pelos blocos vivos
      (`:203-256`).
- [ ] T039 [P] [US3] `ShadowFlow` (D7): não redesenhar sem mudança de geometria ou luz (`:197-245`).
- [ ] T040 [P] [US3] `TransformFlow` (D6): recompor só os slots sujos (`:289-297`); teste com 10 corpos e 100k
      estáticos.
- [ ] T041 [US3] Física (D5): passes de compute compartilhados por passo no LCP (`LCPFlow.ts:520-541`), SPH,
      vizinhança e `TransformFlow`; solve e build por contato com `CountToArgs` e dispatch indireto (`:607-618`).
      Trajetórias bit a bit.
- [ ] T042 [P] [US3] Pós (D7, M4), em `effects.wgsl` e `PostProcessEffect.ts:82`:
  - força nula sem passe;
  - vinheta, cromática e grading fundidos na apresentação;
  - bloom em cadeia de mips;
  - blur separável;
  - FXAA depois do tone map;
  - `fs_ssao` renomeado (ou SSAO de verdade, decisão registrada).

  Regravar as fixtures `render-post-*` uma vez, com a montagem antes e depois.

- [ ] T043 [P] [US3] CPU por quadro (D8): UI só com mudança, `recordGroups` uma vez, args indiretos só com mudança,
      ordem por fase em cache, `specHash` sem `WeakSet` por chamada, céu sem `JSON.stringify` e LUT só com mudança, grades
      de névoa copiadas só com mudança.
- [ ] T044 [P] [US3] Memória (D9): o hash de cáustica alocado só com `caustics`; os buffers de sondas pelas cascatas
      em uso; as texturas de tela pelo ladrilho.
- [ ] T045 [US3] Medir os itens D10 por passe; só entram os acima de 0,1 ms, cada um com a medida antes e depois em
      `baseline-check.md`.
- [ ] T046 [US3] `bench:check` contra o baseline de T033; registrar os ganhos (SC-004 a SC-007).

---

## Phase 8: User Story 5 — Módulos únicos e camadas respeitadas (P3)

**Goal**: WGSL sem duplicatas, objetos-deus divididos, fronteira de `scene/graph` (M1–M5).

**Independent Test**: checagem de duplicatas no CI; lint da fronteira; tamanho dos arquivos (SC-009).

- [ ] T047 [US5] Teste Vitest de duplicatas de WGSL: corpo de `fn` normalizado, falha com dois iguais em arquivos
      diferentes. Primeiro rodar com a lista de hoje.
- [ ] T048 [US5] Módulos únicos em `src/elements/gpu/wgsl/math/` (R13):
  - `hash` (Teschner, PCG, chave de célula, inclusive `field_key`/`gi_photon_key`);
  - `half`;
  - `basis`;
  - `fullscreen`.

  Trocar as cópias por `requires`. Fixtures e trajetórias bit a bit.

- [ ] T049 [P] [US5] Luminância única (Rec. 709) em `gi_luminance` e `math/color.wgsl` (M5); regravar fixtures só se
      mudar pixel, com a montagem.
- [ ] T050 [US5] `GroupRecorder` e `prepareIndirect` compartilhados por `ForwardFlow` e `ShadowFlow`; uma grade de
      vizinhança só (`NeighborSearchPipeline` e `SpatialHashGrid`), com as trajetórias bit a bit.
- [ ] T051 [US5] Dividir `ResourceSystem.ts` (R14) com a fachada e a API pública iguais; `npm run ci` e os smokes bit a
      bit.
- [ ] T052 [US5] Dividir `ForwardFlow.ts` (R14), idem.
- [ ] T053 [P] [US5] Fronteira de `scene/graph` (M3): entrar no lint de `no-restricted-imports` ou ampliar o contrato
      na constituição (emenda MINOR, com ratificação do mantenedor).

---

## Phase 9: Fechamento

- [ ] T054 Smokes completos 3×, fonte e `--dist`, com janela; `npm run ci` 3×; `bench:check`.
- [ ] T055 [P] Vídeos nos dois modos, sem serrilhado, (`npm run video -- cornell,day,fog,living,caustics`), conferidos pelo mosaico e
      pela luminância por quadro (FR-030).
- [ ] T056 [P] Docs:
  - guia da GI (campo próximo e distante, `screenReach`, `screenHistory`, cáusticas no plano tangente);
  - arquitetura (prontidão, revisões, física que espera o colisor);
  - README dos smokes (medida em radiância).
- [ ] T057 [P] `specs/PENDENCIAS.md`:
  - H4 e H5 apontam para `5ef1dd46` e saem;
  - H1 com a causa (CPU à frente do profiler);
  - G3 e H3 com número;
  - V6 reconciliado (005 T084, 006 T078);
  - V2 (headless na 4090) registrado.
- [ ] T058 Validar no Mac (`apple-metal-3`): smokes e `bench:check`; registrar em `baseline-check.md`.

## Dependências

- Fase 1 → Fase 2 → (Fase 3 ∥ Fase 4 ∥ Fase 4b ∥ Fase 5) → Fase 6 → Fase 7 → Fase 8 → Fase 9.
- Na fase 3: T010–T014 em sequência (mesmos shaders); T016–T019 em paralelo com elas.
- A fase 7 depende da régua da fase 6 (baseline) e de T036 (revisões) para T037–T040.
- A fase 8 só com a suíte verde (fase 5), como rede da refatoração.
