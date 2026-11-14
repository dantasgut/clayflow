# Base da 037 (T001)

Apple M4 (`apple-metal-3`), Chrome 155, `feature/037-padronizacao-matematica` em `485b4c4b` (034 `e7f179b4` com a
correção da prontidão), 2026-10-23. Toda troca da 037 se compara a estes números.

A primeira rodada (sobre `d38416d6`) não vale como base: a prontidão travava em 14 smokes (`RefractionMotionFlow` e
`RefractionDenoiseFlow` com o alvo de movimento obrigatório), corrigido na 034 em `e7f179b4`.

## Smokes (37, sem `videoScenes`, que pede a cena como argumento) — fonte e `--dist`

26 passam; as mesmas 11 falham no fonte e no `--dist`, com os mesmos números:

| Smoke                | Falha                                                                                                                                                      | Origem                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `antialiasing`       | parado 1,05 % (≤ 1) e bordas 3,01 % (≤ 3); rastro 15,69 % e rastro escuro 7,45 % (≤ 1); órbita pose 3 3,30 % (≤ 3); custo 2,60 ms (≤ 1,5)                  | 034 pausada (decisões pendentes)           |
| `refraction`         | controle da lente: a medida dos degraus acusa o ruído da referência (1 de 3401)                                                                            | 034 pausada (controle A/B/C)               |
| `fog`                | `glass`: vidro dentro 65,80 % (fonte) / 67,42 % (`--dist`), ≤ 3 %                                                                                          | **034** — névoa para na primeira interface |
| `materials`          | `transmission-refraction` Fresnel 0 × 0; `translucent-backlit` 0 (luz de trás não atravessa); `transmission-layers` vidro de trás não aparece              | **034** — novo, leituras zeradas           |
| `giNoise`            | `cornell-high` 7,93 / 8,80 / 1,22 %; `cornell-medium` 17,88 / 19,74 / 2,81 %; `window-high` 8,60 %; `window-medium` 9,70 / 3,41 / 1,32 %; `fogWalk` 362,9× | herdado (nasceu vermelho na 034, US3)      |
| `fluidField`         | campo + marcha da água 10,58 ms (≤ 2,5)                                                                                                                    | herdado (medida real desde a Fase 2, H3)   |
| `fluidSurface`       | cáusticas 1,29× (≥ 1,3); GPU 12,56 ms passa                                                                                                                | herdado (H5)                               |
| `extensionPoints`    | xadrez 0 trocas; olho de peixe 3,34 px; hashes `material/*` e `fisheye/*`                                                                                  | herdado (H4)                               |
| `nodeGraphs`         | (c) cor da caixa 181 difere 109                                                                                                                            | herdado (H4)                               |
| `parametricSurfaces` | lago 63 px claros / 35 escuros; hashes `lake/image`, `curvatureMaterial/image`, `adaptive/sphere`                                                          | herdado (H4)                               |
| `softSurface`        | `xpbd-cloth`: o corpo não aparece (46/189 px)                                                                                                              | herdado (H4)                               |

Bit a bit e intactos: `trajectories` (7 solvers × 30/60/144 Hz), `time`, `transforms`, `stress60s` (3600 quadros,
30,88 MB sem crescimento).

As duas falhas marcadas **034** são regressões da refração traçada (`ea8e47ac`), não da 037; ficam para a retomada da
034 (ver a seção de pausa em `specs/034-refracao-fisica/tasks.md`). Na 037 valem como estão: nenhuma troca pode piorá-las.

## `npm run bench:check` (baseline `7f5605d`, perfil `apple-metal-3-chrome155-macos-1280x720-ifpfky`, tolerância 10 %)

Reprovado. Duas medidas; na primeira a máquina estava com 26 de 36 GB em uso, na segunda sem swap e 72 % livre. As
variações que mudam entre as duas são carga da máquina; as que se repetem idênticas ficam **a confirmar** numa terceira
medida com a máquina ociosa antes de serem chamadas de regressão:

| Cena                  | Variante      | Métrica | Baseline | 1ª medida | 2ª medida | Leitura                        |
| --------------------- | ------------- | ------- | -------- | --------- | --------- | ------------------------------ |
| `instances`           | 100k          | gpuMs   | 0,68     | 1,87      | 1,87      | a confirmar                    |
| `instances`           | 100k          | cpuMs   | 0,04     | 0,49      | 0,49      | a confirmar                    |
| `instances`           | 10k-functions | gpuMs   | 0,30     | 0,80      | 0,80      | a confirmar                    |
| `instances`           | 10k-functions | cpuMs   | 0,05     | 0,13      | 0,13      | a confirmar                    |
| `instances`           | 1m            | gpuMs   | 2,32     | 2,32      | 2,62      | ruído                          |
| `unique-objects`      | 1k            | gpuMs   | 1,02     | 1,23      | 1,22      | a confirmar (+20 %)            |
| `global-illumination` | off           | gpuMs   | 1,65     | 2,93      | 1,87      | carga (cai 36 % entre medidas) |
| `global-illumination` | off           | cpuMs   | 0,16     | 0,74      | < 0,18    | carga                          |
| `surfaces`            | wave-uniform  | cpuMs   | 0,25     | 0,43      | 0,41      | a confirmar                    |

Os quadros (p95/p99) melhoraram em quase todas as cenas (partículas 64k −48 a −65 %, GI `medium` −43 %), o que não
combina com uma regressão geral do motor; os valores idênticos nas duas medidas de `instances` pedem a terceira medida.

## Logs

`base037b/` no scratchpad da sessão: `smokes-src.log`, `smokes-dist.log`, `build.log`, `bench.log`;
`bench/results/latest.{json,md}`.

## Variação entre rodadas (medida na T013)

`antialiasing` repete os números exatamente na maioria das rodadas (parado 1,05 / 3,01 %, rastros 15,69 / 7,45 %), mas
uma rodada em três sai diferente (bordas 3,00–3,05 %, rastro 15,29–16,86 %, escuro 5,88 %), com o código da base e com
o da 037 — sempre dentro de um lote de smokes (sozinho, repete a base). `giNoise` e `fog` variam na segunda casa (viés `cornell-medium` 17,88–18,13 %; `fogWalk` 351–497×). Na
comparação, uma diferença só conta se repetir em duas rodadas.

## Bench depois da US4 (T032, 2026-10-23, máquina folgada: carga 2–3)

Terceira medida: `instances/100k` GPU 1,85 ms / CPU 0,22 ms; `10k-functions` GPU 0,81 / CPU 0,13; `unique-objects/1k`
GPU 1,26; GI desligada GPU 3,12 / CPU 0,72 (1,87 e 2,93 nas anteriores: oscila). As três medidas de `instances`
coincidem (1,87 / 1,87 / 1,85 ms) com a máquina carregada e folgada: a diferença contra o baseline `7f5605d` é real e
**herdada da 034** (a base da 037 já a tinha); a 037 não muda esses números. Fica para a retomada da 034.

Antisserrilhado com a inversa guardada (`T029-taa-inversa-guardada.patch`): custo 2,43 / 2,46 ms contra 2,40 / 2,43 ms
com a inversa por pixel — sem ganho mensurável (a inversa 4 × 4 por pixel é barata perto das leituras de textura).

## Portão final (T050, 2026-10-24, depois das decisões da T048)

Três rodadas no fonte e três com `--dist` (`npm run build:lib` entre elas), 37 smokes cada: 0 erros de página; 26
passam e as mesmas 11 da base falham nas seis rodadas. Números contra a base:

- `antialiasing`: parado 1,02 % (base 1,05), bordas e rastro claro passam (3,01 e 15,69 % na base), rastro escuro
  13,73 % (7,45), órbita 3,31 % (3,30), custo 2,39–2,62 ms (2,60), idênticos nas seis rodadas. O histórico em 32 bits
  (T042) baixa o caso parado, mas no lote ele não chega a ≤ 1 % (sozinho, 0,98–1,02 %). O rastro escuro não vem da
  precisão (com `'half'` também dá 13,73 %): fica todo dentro do vidro (com `noglass=1` o rastro passa, 0,78 %) — o
  sinal traçado da refração e o seu filtro, pendência da 034. O pior desvio no vidro tem o mesmo tamanho em todas as
  variantes (base 15,69 % claro no quadro 23, pixel (207, 143); semente antiga da refração 15,69 % escuro no mesmo
  pixel; atual 13,73 % escuro): a 037 troca o sinal do resíduo, não o aumenta.
- `fog` vidro dentro 65,80–66,38 % (65,80); `giNoise` `cornell-medium` 19,59–19,70 % (17,88–18,13: a T014 trocou a
  sequência aleatória da GI e da refração, o viés continua do mesmo tamanho e reprovado como na base); demais iguais.
- `materials`: além das três leituras zeradas da 034, `transmission-dispersion` reprova em 4 das 6 rodadas
  (separação Abbe 40 / 18 de 28–40 px, saturada). Medido à parte: com a semente antiga da refração (antes da T014) o
  mesmo smoke inteiro dá 17 / 17 px e também reprova em 2 de 3 (o critério pede Abbe 18 > Abbe 40); sozinho o caso
  passa com as duas sementes (6–20 px, varia de rodada a rodada). A medida das bordas depende da realização do ruído do
  sinal traçado — fragilidade do critério da 034 (US de transmissão), não regressão física da 037. Fica para a
  retomada da 034, com a imagem convergida ou a referência no lugar de uma amostra.
- `readiness` registra a recusa esperada por prazo (`Application.whenReady()` com o material trocando) e passa.

Logs: `t037/gate2/` no scratchpad da sessão (`src1-3.log`, `build.log`, `dist1-3.log`); dispersão em `t037/disp/`.

## Bench final (T051, 2026-10-24, depois das decisões da T048)

`npm run bench:check -- --headless` contra o baseline `7f5605d`: as mesmas regressões da base da 037 e da medida da
T032, com os mesmos números — `instances/100k` GPU 1,87 ms (base 1,87 / 1,87 / 1,85), `10k-functions` GPU 0,81 (0,80 /
0,81), `unique-objects/1k` GPU 1,27 (1,23 / 1,22 / 1,26), GI desligada GPU 2,08 (oscila entre 1,87 e 3,12 nas medidas
anteriores). Nenhuma cena nova regride; os quadros (p95/p99) melhoram em quase todas (partículas 64k −41 a −50 %, GI
`medium` −41 %, corpos rígidos 10k −37 a −40 %). A 037 não muda o custo do motor; as regressões de `instances` são da 034.
Log: `t037/bench_t051.log` no scratchpad da sessão.

## Portão do canal temporal (T060, 2026-10-24, depois da T053–T059)

Os 38 smokes (os 37 e o `energy`), três rodadas no fonte e três com `--dist` (o build da biblioteca passa), contra o
portão da T050: as mesmas 11 falhas nas seis rodadas, `energy` passa nas seis, nenhum erro de página.

- `antialiasing`: parado 1,02 %, rastro escuro 13,73 %, órbita 3,31 % — idênticos ao portão nas seis rodadas (a conta
  não muda: o histórico vem da fatia anterior do canal em vez da cópia de paridade). Custo do antisserrilhado 2,21–2,48 ms
  (portão 2,35–2,62; mediana 2,38 contra 2,41, 0,99×).
- `fog` vidro dentro 66,49–67,77 % (portão 65,80–66,38), `giNoise` `cornell-medium` 19,70 % (19,59–19,70): a faixa de
  variação de rodada a rodada que o filtro antigo também mostra sobre a C2 nova (medido na T055); demais iguais.
- `materials`: a mensagem nova `transmission-refraction: Beer-Lambert com razão Infinity` em 2 das 6 rodadas (a placa
  fina lida 0). Medido à parte: no vidro liso, com o MSAA deste smoke (sem vetores de movimento o filtro não roda), a
  composição usa a amostra crua da refração, e ~4 % dos pixels de uma placa de IOR 1,5 escolhem o lobo refletido
  (Fresnel 4 %), que aqui não vê luz: pixels pretos espalhados, também no HEAD antes da 037 (382–436 de 10 201 em torno
  do centro). Qual pixel cai preto depende só do quadro da refração (a semente): o quadro 39 escurece o pixel medido com
  a sequência da T014, não com a antiga; 40 a 42 não. A rodada cai no 39 ou no 40 conforme o tempo da prontidão. É a
  mesma fragilidade da `transmission-dispersion` (uma amostra no lugar da imagem convergida), da retomada da 034, não
  regressão do canal temporal; o critério fica.
- Custo das instâncias (medianas das seis rodadas, portão → agora): froxels por despacho 0,63 → 0,64 ms (1,02×), névoa a
  1280 × 720 0,64 → 0,645 (1,01×); GI com as sondas de tela, tempo de parede por quadro 56,36 → 56,11 ms e kernels 3,52
  → 3,43 (≤ 1,00×); filtro da refração à-trous 0,321 → 0,320 e a passada temporal 0,078 → 0,166 ms — ela grava agora o
  guia e o par à-trous que antes saíam por três cópias de alvo por quadro, fora dos passes medidos. Medido à parte a
  1280 × 720 (50 conjuntos por envio, tempo de parede até a fila terminar): as três cópias 0,160 ms por quadro, gravar o
  guia e o par 0,06. O filtro todo: 0,078 + 0,321 + 0,160 ≈ 0,56 ms → 0,166 + 0,320 ≈ 0,49 ms (0,87×).

- Vídeos (`npm run video -- lente,cornell,nevoa`): `cornell` e `nevoa` passam a conferência da codificação; `lente` dá
  brilho 48,9–49,3 dB (≥ 50) — o HEAD antes da 037 também (49,25 dB): o ruído do sinal traçado da refração no H.264, da 034.

Logs: `t037/gate3/` no scratchpad da sessão (`src1-3.log`, `build.log`, `dist1-3.log`).

## Energia dos corpos moles (T061–T066, 2026-10-24)

- `softEnergy` (novo) passa em quatro rodadas seguidas. Pior erro de cada termo contra a f64 bem abaixo do limite (pano
  XPBD de 2304 partículas, 6721 arestas e 7 blocos: cinética 6,5e-8 ≤ 9,8e-6, potencial 4,6e-5 ≤ 1,3e-3, elástica
  1,6e-6 ≤ 4,8e-4; MPM no chão: elástica 2,3e-7 ≤ 1,8e-3); as fatias contra a potência e a janela; a lei do
  amortecimento: FEM 2,2e-5 ≤ 7,0e-5 (potência) e 3,2e-6 ≤ 5,1e-5 (janela); XPBD 9,3e-3 ≤ 1,0e-1 e 1,5e-2 ≤ 8,7e-2 — o
  limite largo do XPBD é o arredondamento real da velocidade (pred − pos)/dt com o substep de 1/480 s: |pos|/(|v|·dt)
  passa de 100 em 20 passos, e o erro medido (~1 %) vem daí.
- Custo no M4 (mediana de 80 quadros, duas passadas): 0,049 ms com um corpo XPBD de 65 536 partículas, 0,056–0,059
  ms com 1024 corpos de 64, 0,048–0,050 ms com um MPM de 32 768 — limite 1 % do quadro de 60 Hz (0,167 ms). A primeira
  versão (um grupo por corpo) custava 1,015 ms no corpo de 65 536, mais que o solver XPBD (0,69 ms); por isso os blocos.
- Sem mudança: `energy`, `trajectories`, `particles`, `readiness`, `fluidBehavior`, `rigidContacts`, `stress60s`
  passam; `softSurface` (xpbd-cloth) e `parametricSurfaces` com as mesmas falhas do portão, idênticas.
- `npm run ci`: 1827 testes, 0 erro de lint, 1346 avisos (os mesmos de antes).

Logs: `t037/soft/` e `t037/soft2/` no scratchpad da sessão.
