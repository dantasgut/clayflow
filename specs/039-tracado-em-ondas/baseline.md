# Linha de base da spec 039 (2026-10-29, Chrome headless, M4)

Antes de qualquer mudança no traçado (commit 5b06d19a).

## Gate

- Testes: 1871 passam (antes dos testes novos da onda).
- tsc limpo.
- Lint: só os erros dos `zz*` e `bench/page/agua.ts` fora do commit.

## Smokes

| Smoke                           | Situação                                             | Números                                                                                                                                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeGraphs`                    | FALHA (pré-existente)                                | 90 de 91 nós dentro da tolerância; `(c) cor da caixa 181 difere 109.04 da do seu valor`                                                                                                                                                                                          |
| `caustics` (reference)          | passa                                                | ruído por célula ≤ 1,34 %; água parada 0,00–0,03 %                                                                                                                                                                                                                               |
| `caustics case=engine&factor=1` | passa                                                | fluxo no receptor 1,0000×, na sombra 1,000×; pico 83,0× (referência 85,6×); erro do padrão 2,4 %; variação 0,18 %; custo dos fótons 25,15 ms/quadro (1 048 576 fótons)                                                                                                           |
| `caustics case=water`           | passa                                                | 0°: −0,08/−0,11/−0,15 %; 30°: 0,36/0,34/0,30 %                                                                                                                                                                                                                                   |
| `caustics case=shadow`          | passa                                                | borda −0,194 m contra −0,197; faixa 0,998; sombra 0,000                                                                                                                                                                                                                          |
| `globalIllumination`            | FALHA (pré-existente)                                | `gi_trace`: 11 buffers de storage > 10 do Chrome                                                                                                                                                                                                                                 |
| `refraction`                    | FALHA só no caso `gi` (o mesmo limite)               | piores erros por região: sphere 0,11 %, immersed 0,34 %, rough 0,30 %, prism 0,29 %, underwater 0,09 %, pane 0,12 %, lit 0,46 %, fieldImmersed 0,02 %, fieldUnder 0,04 %, lens 0,07 % (0 degraus), dispersed 0,55 %, glint 0,70 % (vagalumes 0,037 %), ripple 0,17 % (0 degraus) |
| `refraction case=cost`          | FALHA (pré-existente)                                | lente 1280×720: 33,856 ms com, 1,279 ms sem — refração 32,577 ms (limite 3 ms)                                                                                                                                                                                                   |
| `fluidSurface`                  | FALHA (pré-existente, pendências da 034 e chão novo) | GPU 405,88 ms/quadro na barragem; várias imagens diferentes do fixture                                                                                                                                                                                                           |

## Depois da T013 (cáusticas por instância na onda)

| Smoke                           | Números                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `caustics case=engine&factor=1` | fluxo 1,0000×, sombra 1,000×; pico 83,0×; padrão 2,4 %; variação 0,19 %; custo 25,12 ms |
| `caustics case=water`           | 0°: −0,08/−0,12/−0,15 %; 30°: 0,36/0,34/0,30 %                                          |
| `caustics case=shadow`          | idêntica                                                                                |

## Depois da T015 (GI na onda)

`globalIllumination` PASSA no Chrome (antes falhava por 11 > 10 buffers de storage): o kernel de sombreamento das
sondas liga 9 buffers mais os da cena (a onda leva o registro e o fechamento num buffer só, e a carga do consumidor no
registro). Cornell: luz indireta por região a 0,4–2,0 % (bloco baixo 6,6 %); 4K 0,1–0,6 %; emissive pior 5,6 %
(teto); window pior 8,8 % (chão); fornalha 0,2 % da série analítica; custo 3,94 ms/quadro a 1280×720 (orçamento 4 ms);
vazamento 0,069 %; resposta 100 % em 0,25 s.

## Depois da T017 (fótons das cáusticas em rodadas; o material de cada corpo de fluido na onda)

| Smoke                           | Números                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `caustics case=engine&factor=1` | fluxo 1,0000×, sombra 1,000×; pico 83,0×; padrão 2,4 %; variação 0,20 %; **custo dos fótons 36,37 ms/quadro** (antes 25,15: 12 blocos de 2¹⁸ por rodada com 1 048 576 fótons — a otimizar) |
| `caustics case=water`           | 0°: −0,08/−0,12/−0,15 %; 30°: 0,36/0,34/0,30 % (igual à linha de base)                                                                                                                     |
| `caustics case=shadow`          | borda −0,194 m; faixa 0,999; sombra 0,000; depois da linha reta 1,022                                                                                                                      |

A absorção dos trechos dentro da água e a luz que atravessa a água (`ray_volume_transmittance`, `light_transmission`)
avaliavam o material da água na marcha pelo seletor composto: agora leem o meio de cada corpo (a transmissão do
fechamento dele: cor e profundidade da absorção, índice, Abbe, peso), avaliado uma vez por quadro na onda pelo
`FluidFieldFlow` e guardado no buffer das consultas do campo (`fieldMediaOffset`: nenhum buffer a mais nos kernels que
traçam) — o meio homogêneo por corpo. Depois disso: `caustics case=water` −0,13/−0,16/−0,19 % (0°), 0,36/0,34/0,30 %
(30°); `shadow` faixa 0,997; `globalIllumination` passa (custo 3,92 ms; Cornell 0,5–2,1 %; fornalha 0,2 %).

## Depois da T019 (a câmera da refração na onda)

`refraction`: todas as cenas com os mesmos piores erros da linha de base (sphere 0,11 %, immersed 0,34 %, rough 0,30 %,
prism 0,29 %, underwater 0,09 %, pane 0,12 %, lit 0,45 %, fieldImmersed 0,02 %, fieldUnder 0,04 %, lens 0,07 % com 0
degraus, dispersed 0,55 %, glint 0,70 % com vagalumes 0,037 %, relief 0,20 %, ripple 0,17 %); o caso `gi` agora PASSA
(off/on contra absent ≤ 0,01 %; antes: 11 > 10 buffers); só o custo falha, como antes (32,638 ms; limite 3 ms).

## T002 — o custo dos despachos (Chrome, M4, `dispatchCost`)

| Modo                                 | Por despacho |
| ------------------------------------ | ------------ |
| indireto com 0 grupos                | 11,58 µs     |
| indireto com 1 grupo                 | 12,06 µs     |
| direto com 1 grupo                   | 1,12 µs      |
| direto com 4096 grupos que saem logo | 7,76 µs      |

O despacho indireto custa ~10× o direto no Chrome (o Dawn valida os argumentos indiretos com um passe próprio): as
rodadas da onda passam a usar despacho direto com laço de passo de grade (um número fixo de grupos percorre a faixa,
limitado pela capacidade).

Com os despachos diretos do tamanho da capacidade: `caustics case=engine&factor=1` igual (fluxo 1,0000×, padrão 2,4 %),
custo dos fótons 38,77 ms/quadro — o peso está nos blocos (12 por rodada: a fila reserva 3 vagas por fóton para a
dispersão, e o bloco é de 2¹⁸) e no tráfego da onda (464 B por fóton e rebote). Otimização pendente: a reserva da
dispersão e o tamanho do bloco pela memória do dispositivo.

## Depois da T020–T021 (os pixels da refração em ondas: caminhos-folha, folhas ordenadas por pixel)

`refraction`: todas as cenas dentro dos critérios, com os números da linha de base — sphere 0,11 %, immersed 0,34 %,
rough 0,27 %, prism 0,30 %, underwater 0,09 %, pane 0,12 %, lit 0,45 %, fieldImmersed 0,02 %, fieldUnder 0,04 %,
lens 0,07 % (0 degraus em 3407), dispersed 0,58 %, glint 0,69 % (vagalumes 0,037 %), relief 0,17 % (0 degraus), ripple
0,17 % (0 degraus); gi ≤ 0,00 %. **Custo: 92,691 ms** na lente a 1280×720 (antes 32,577; limite 3): 104 rodadas × 4
blocos de 2¹⁷ caminhos, com despachos do tamanho da capacidade — a otimizar.

Com o passo de grade (512 grupos no máximo) e um bloco só quando a ligação de storage comporta: **refração 56,5 ms**
na lente 720p (antes da spec: 32,6; limite 3). Medidas do que pesa: com 24 rodadas em vez de 104, 52,4 ms (as rodadas
vazias custam ~4 ms); sem a ordenação das folhas, 55,5 ms (~1 ms). O peso é o trabalho das rodadas ativas: os caminhos-folha
em paralelo (até 4 por pixel depois das duas primeiras interfaces, onde o original percorria os ramos em série nos
registradores) e o estado de 768 B por caminho lido e regravado a cada rodada. Otimização pendente (não afrouxar o
critério): estado menor (as pilhas), os ramos do segundo nível em série por caminho.

## Depois da T025 (o seletor composto removido)

`refraction` igual (custo 56,6 ms); `caustics` engine e water iguais. `fluidField case=closure`: o fechamento por acerto
pela onda a 7,63e-7 (limite 1e-5); **a transmitância pelo corpo falha (25,96 × σ·voxel; limite 1)**: o grafo do teste
faz a absorção depender da normal do ponto de entrada, e o meio do corpo agora é avaliado uma vez por quadro (homogêneo
por corpo). Decisão do usuário pendente: o meio homogêneo por corpo (e a comparação do critério contra ele) ou a absorção
por trecho avaliada na onda.

## T028–T029 — o tanque no Deno, só compilação (2026-10-29)

Deno 2.7.9, a cena do tanque (vidro, água, chão em xadrez pelo grafo, caixa), o envio à GPU desligado: **222 pipelines
compilados, nenhum erro**, os 5 quadros passaram. Mais lentos: os kernels de material (`hit_shade_main`) até 4,54 s, a
continuação da refração em ondas 3,53 s, a emissão dos fótons 0,95 s (antes da spec: `refraction_trace_main` 7,13 s e
`caustics_trace_main` 3,08 s, com o seletor composto). O MSL do naga no compilador nativo da Apple (`makeLibrary` +
`makeComputePipelineState`, sem despachar): `refraction_wave_follow_main` 2,77 s, `caustics_trace_main` 0,72 s,
`caustics_photon_hit_main` 0,27 s, `hit_shade_main` 0,05 s — nenhuma queda. `globalIllumination` passa no Chrome
(3,94 ms).

## 039 refeita — o tanque por estágio, antes de mudar (2026-10-29)

Motor anterior à 039 (`b32ccaee`, servido pelo app em 5173), a cena `agua` do app (36 864 partículas, 1280×720, câmera
orbital), Chrome no M4, medição por passe (`setFrameProfiling(true, 1024, 'passes')`), média de 237 quadros. Outra
aba com a mesma cena podia estar dividindo a GPU.

- Quadro de GPU (do primeiro início ao último fim): **133,6 ms** — meta 16,7 ms.
- Passes de compute (confiáveis): traçado da refração **92,5 ms**; cáusticas **22,8 ms**; física ~5 ms (busca de
  vizinhos 4,3 ms); campo ~1,5 ms (redistanciamento 0,73 ms).
- Passes de render: no Apple (ladrilhos) os intervalos se sobrepõem (o resolve temporal aparece com 123 ms) — não somam;
  o pedido por volume (que marcha o campo por pixel) não dá para separar por esse caminho.

## 039 refeita — a cadeia fixa e o mapa da luz (2026-10-29)

Mesmo tanque e medição (passes de compute; a cadeia separada em passes só para medir, com 6 blocos de 65 536 pixels):

| Etapa                               | Antes (árvore) | Cadeia fixa | + mapa da luz | + raízes leves |
| ----------------------------------- | -------------- | ----------- | ------------- | -------------- |
| Traçado da refração (total)         | 92,5           | 70,7        | —             | —              |
| Continuação (nó + sombreamento)     | —              | 32,3        | 20,9          | 22,2           |
| Acerto (BVH + marcha + coincidente) | —              | 20,9        | 20,8          | 20,8           |
| Material por classe                 | —              | 7,9         | 7,8           | 7,8            |
| Raízes                              | —              | 3,4         | 3,4           | 0,8            |
| Cáusticas                           | 22,8           | 6,2         | 1,8           | 1,8            |

Ablações: sem a dielétrica coincidente, o acerto −1,7 ms; sem a marcha do campo, o acerto 4,7 ms e a continuação
7,7 ms — **a marcha no campo é o custo dominante** (D3: a superfície como malha). Os blocos além da fila do quadro
ainda pagam os despachos vazios (15 blocos para a tela inteira).

## 039 refeita — a malha da superfície no pedido (2026-10-29)

Correção: nas medições anteriores o mapa da luz não estava ligado (faltava o resolvedor `FluidField.lightMap`: os
kernels que o leem esperavam sem erro). Com os resolvedores do mapa e da malha, a imagem do tanque bate com a do motor
anterior à 039 na mesma vista, e (passes de compute; o traçado num passe só):

| Etapa                          | ms   |
| ------------------------------ | ---- |
| Traçado da refração            | 63,9 |
| Cáusticas                      | 5,7  |
| Pedido (malha + tela cheia)    | 1,4  |
| Malha da superfície (1,07 M △) | 1,1  |
| Mapa da luz (2 × 512²)         | 0,7  |
| Busca de vizinhos (física)     | 5,3  |

Pendente no traçado: a marcha no campo dos raios secundários e os blocos vazios (15 blocos para a tela inteira).

## 039 refeita — a refração em meia resolução (2026-10-29, decisão do usuário: opção 1)

Um raio por bloco 2×2 por quadro (o representante gira entre os pixels pedidos do bloco), o resultado nos pixels do
bloco na mesma superfície (distância e face do pedido), os outros com o valor anterior até a vez deles; o filtro
temporal acumula. Tanque: 340 mil → 90 mil pixels traçados por quadro; **traçado 55,0 → 16,3 ms**; cáusticas 4,8 ms;
física 4,6 ms. A imagem na mesma vista do motor anterior à 039: mais limpa na junção da água com o vidro (o pontilhado
de antes some), com poucos pontos coloridos ali (a investigar).

Nota (usuário, 2026-10-29): a faixa escura logo abaixo da superfície vista rente à água pelo vidro (igual no motor
anterior à 039) são os raios da reflexão interna total que escapam para o horizonte além do chão em xadrez (12 m) —
o ambiente abaixo do horizonte; não é defeito do traçado.

## 039 refeita — as lições aplicadas ao que é só nosso (2026-10-29)

- Orçamento de passos da marcha por raio nos laços em passo de grade (ponto `ray_volume_begin`): correção de uma falha
  latente (o tempo não mudou no tanque).
- Cáusticas: a emissão 2,54 ms e as rodadas 2,22 ms. A correção da linha reta pergunta se a reta cruzou água pelo
  ponto `ray_volume_light` (o mapa da luz) em vez de marchar: **cáusticas 4,8 → 4,0 ms** no tanque. Smokes:
  `caustics case=water` 0°: −0,09/−0,13/−0,16 %, 30°: 0,36/0,33/0,30 % (iguais à linha de base); `engine` fluxo
  1,0000×, sombra 1,000×, pico 83,0×, padrão 2,4 %; `shadow` borda −0,194 m, faixa 0,998. Custo dos fótons no caso
  `engine` (1 M fótons): 49,6 ms com outra aba do tanque possivelmente renderizando — a medir com a GPU só para ele
  (linha de base 25,2; 039 v1 38,8).

## 039 refeita — o que custa na refração em meia resolução (2026-10-29, contadores temporários)

Tanque, ~89 mil pixels traçados por quadro: ~906 mil acertos (10 por pixel), dos quais ~565 mil na água (6,3 por
pixel; menos de 0,1 % a menos de 2 mm da origem — não é autointerseção), e ~16,4 milhões de passos de marcha (18 por
acerto); nenhuma vaga truncada nas 17 rodadas. O chão coberto de gotas e poças finas: o raio refletido rasante cruza
várias, cada uma com entrada e saída. Ablações: passo mínimo 4× maior → 16,3 → 15,6 ms; menos grupos na cauda → igual;
10 rodadas → 14,3 ms. O custo é o de cada acerto (a marcha), não o número de rodadas nem os despachos.

## 039 refeita — onde está o custo do traçado, por rodada (2026-10-29, passes rotulados temporários)

Correção da conclusão acima: a marcha **não** domina. A marcha da água rodada duas vezes leva o traçado de 16,9 a
19,8 ms (a marcha inteira, com o Newton tricúbico, custa ~3 ms); φ com 1 leitura por passo em vez de 8 → 16,2 ms.

- A malha da água no tanque tem ~1,04 M triângulos por quadro (capacidade 2,1 M, 100 MB). A reconstrução da BLAS por
  quadro custa 1,95 ms com 0,5 M de capacidade e 7,5 ms com 2 M (smoke descartável, malha adaptativa com contagem só na
  GPU; o caminho atual despacha pela capacidade). Com a marcha em ~3 ms, a BVH da água não compensa: rota descartada.
- Por etapa: acerto 7,0 ms, continuação 6,7 (a luz direta com sombra 2,4; a indireta ~0), sombreamento da onda 2,3.
- Por rodada (acerto + sombreamento + continuação): rodada 0 2,1 ms; **rodada 1 5,3 ms**; rodadas 2–3 ~1,1 ms cada;
  rodadas 4–16 ~0,3–0,6 ms cada (**~5 ms no total**).
- Vagas vivas por rodada no primeiro bloco (65 536 pixels): 65 536 → **249 750** → 25 457 → 18 690 → 8 630 → 2 950 →
  1 919 → … → ~100–800 nas rodadas 10–16. A dispersão da água abre os 3 canais em quase todo pixel na primeira
  interface (3,8 vagas por pixel na rodada 1); a cauda são poucas centenas de caminhos (reflexão interna total na água),
  e cada rodada custa a latência do raio mais longo (~0,3 ms), não o número de caminhos.

## 039 refeita — a dispersão adiada (2026-10-29)

Na interface dispersiva, a vaga da transmissão segue com os três canais na direção do verde; no acerto seguinte, se
ele é o fim do caminho e a separação do vermelho ao azul (o ângulo entre eles vezes a distância) fica abaixo do pixel
(o ângulo do pixel vezes a distância desde a câmera), o caminho único vale; senão (separação maior, ou outra interface
adiante, que amplificaria a divergência) o vermelho e o azul partem da interface nas vagas deles. Teto medido (todos
os canais fechados): traçado 16,9 → 12,5 ms. **Com o critério: traçado 16,9 → 13,9 ms** no tanque. Smoke
`refraction` contra o `HEAD` anterior, com a GPU só para ele: dispersed 0,90 % (0,86 %), prism 0,30 % (0,30 %),
glint 0,74 % (0,70 %), vagalumes 0,388 % (0,379 %); as demais regiões iguais ou dentro do ruído. As falhas do smoke
(fila contra pedido, degraus da borda, custo da lente 23,3 ms, vagalumes, gi on 0,54 %) já estavam no `HEAD` (meia
resolução, T106 pendente).

## 039 refeita — um bloco da cadeia pela fila medida (2026-10-29)

Rodada vazia: ~0,11 ms (acerto 0,03, sombreamento da onda 0,05, continuação 0,03); a cauda (rodadas 7–16) ~0,4–0,6 ms
cada, a latência dos últimos caminhos. Cada bloco paga as 17 rodadas: o bloco fixo de 65 536 pixels dava 3 blocos no
tanque (fila ~88 mil, mais um bloco vazio de folga). O bloco agora segue a fila medida (1,25 × a maior contagem, na
potência de 2 acima; teto: a ligação de storage do adaptador) e sem bloco vazio: **traçado 13,9 → 12,6 ms** no tanque
(um bloco de 131 072 pixels, 243 MB de vagas); smoke `refraction`: custo da lente 23,3 → 17,8 ms, as medidas de
imagem iguais.

## 039 refeita — rodadas por despacho indireto (2026-10-29)

Cada rodada despacha os grupos das vagas vivas (argumentos gravados na GPU pela contagem da lista corrente, no máximo
os da grade da onda), no acerto, no material da onda e na continuação; sem leitura de volta, os blocos se limitam aos
que cobrem um representante por bloco 2×2 da tela. **Traçado 12,6 → 11,1 ms** no tanque (fila ~89 mil, a mesma
vista); quadro inteiro 27,3 ms. Smoke `refraction`: imagem igual (immersed 1,46 → 0,69 %, lit 1,10 → 1,31 %); o custo
da lente (18,1 ms) não vem dos blocos — a investigar por passe.

## 039 refeita — a cauda da cadeia e o custo da lente (2026-10-29)

- Lente do smoke `refraction` a 1280 × 720 (caso `cost`): a fila tem 104 mil pixels (mais que o tanque); vagas vivas
  104 148 → 208 296 → 104 145 → 9 974 → 2 208 → … → 61 na rodada 16 (os caminhos da galeria sussurrante: entrando rente
  à borda da esfera, a reflexão interna fica perto do ângulo crítico, com Fresnel perto de 1). Acerto por rodada: 1,1 /
  3,1 / 1,4 ms nas três primeiras; ~0,3 ms em cada uma das 14 seguintes com dezenas a centenas de caminhos — a latência
  de uma travessia da estrutura de raios (o piso da rodada com caminho vivo). Traçado 16,2 ms; o resto da refração ~2 ms.
- Tentativa descartada: a pilha da travessia com o conteúdo do nó (filhos e distância de entrada, 3 palavras) para não
  reler o nó ao desempilhar — traçado do tanque 11,2 → 13,0 ms e cáusticas 4,0 → 5,1 ms (a memória privada da pilha
  triplica; pesa mais que a leitura poupada).

## 039 refeita — as correções da imagem reportadas pelo usuário (2026-10-29)

- Meia resolução: o representante grava num registro por bloco 2×2 (`RefractionBlock`) e a reconstrução
  (`refraction_chain_upsample_main`) preenche cada pixel pedido — o próprio quando foi o representante (com o carimbo:
  quadro e distância do pedido); com a mesma superfície na volta corrente (a distância variou menos que a de um pixel
  com o antisserrilhado temporal; nada, sem ele) fica o valor exato dele; senão a média dos representantes dos 3 × 3
  blocos em volta com o peso da distância, só os da mesma superfície. O filtro temporal ganha o ponto
  `temporal_filter_source_fresh`: a amostra reconstruída não entra no histórico válido. Com a câmera girando, os blocos
  2×2 somem.
- Dispersão: os três canais com o mesmo sorteio (as mesmas escolhas de lobo): as cores só onde as direções se separam.
- O brilho das luzes de disco: `DirectionalLight.angularRadius` (padrão 0; o sol 0,00466 rad, em `cones.z`) e
  `refraction_glint` em cada interface dielétrica (o lobo refletido com a rugosidade somada à do disco, com sombra). A
  luz sem disco não brilha na superfície lisa, como na referência.
- A película no chão interpolada entre as quatro células vizinhas no plano da superfície (sem os blocos de um voxel).
- Smoke `refraction` contra o `HEAD` anterior: regiões ≤ 1,62 % (immersed 0,52, lit 0,30); degraus da borda lente
  266 → 1, relief 104 → 2, ripple 207 → 1; vagalumes 0,379 → 0,647 % (o sorteio comum aos canais junta as cores num
  pico; sem ele 0,477 % — a falha do critério é anterior: a roleta de Fresnel divide o peso por ~4 %); gi off/on
  0,52/0,54 % (limite 0,5; antes 0,36/0,54). Smoke `fluidField`: `close` e `normal` já falhavam no `HEAD`; `edge`
  passava no `HEAD` e falha agora (40 % de realces isolados numa captura crua, sem filtro temporal: a cópia do
  representante para o bloco 2×2 inteiro agrupava os pixels claros de uma amostra; com cada pixel com a sua amostra eles
  aparecem isolados) — pendente.
- A espuma (a faixa escura e ruidosa onde a água encosta no vidro): a superfície do campo para a ~1 voxel do vidro e
  sobra uma fresta de ar; o contato só é tratado no sentido da água para o vidro — pendente.

## 039 refeita — a espuma colorida (2026-10-29)

As gotas e o respingo (a água do campo, traçada) saíam salpicados de cor: a dispersão abria os três canais sempre que
havia outra interface adiante (a gota tem entrada e saída), e cada pixel mostrava uma cor por vez. Agora a dispersão
adiada atravessa as interfaces seguintes: o ângulo entre os canais é ampliado pela refração de cada uma (tan θt / tan θi;
a reflexão não amplia) e soma o que ela separa, o afastamento soma ângulo × trecho, e só no fim do caminho os canais se
abrem — da interface em que ela começou, com a pilha de meios de lá — se o afastamento passa do pixel; uma interface em
que um canal não passa (reflexão total) também os abre. A reconstrução da meia resolução, sem vizinho da mesma
superfície, usa o representante mais próximo com as mesmas marcas (sem os quadrados escuros de valor antigo). Estado:
+208 B por vaga (a pilha de meios da dispersão). A espuma sai quase branca; com a dispersão da água desligada (Abbe 0,
só no teste) nenhuma cor sobra — as que restam são caminhos que se separam mais que o pixel (rasantes dentro das gotas),
com uma amostra por canal. Smoke `refraction`: dispersed 1,25 → 2,27 %, glint 1,19 → 2,22 %, prism 0,35 → 0,52 %
(a estimativa da separação fecha alguns caminhos que a referência abre; abaixo de 3 %); vagalumes 0,647 → 0,548 %.

## 039 refeita — tentativas descartadas contra os vagalumes (2026-10-29)

- Os dois lobos sem sorteio na vaga livre do pixel (a transmissão divide na vaga 2 da segunda interface em diante):
  vagalumes 0,548 → 0,434 %, `fluidField edge` 40,6 → 31,5 % isolados, dispersed 2,27 → 2,86 %, custo da lente
  20,0 → 26,4 ms. Ganho pequeno, custo grande.
- Sem o termo das cáusticas no ponto opaco visto pela refração: vagalumes iguais (0,548 %) — não vêm delas.
- Amostragem defensiva da roleta de Fresnel (o smoke documenta a causa: da terceira interface em diante a reflexão rara
  leva 1/F e vê o teto claro): probabilidade em [1/4, 3/4] → vagalumes 0,066 %, mas glint 10,56 % e ruído 6×; com piso
  de 1/10 → `edge` passa (3,4 %), vagalumes 0,380 %, mas glint 5,65 % (> 3 %).

## 039 refeita — sem sorteio nas interfaces lisas: as medidas (2026-10-29, descartado até decisão do usuário)

Smoke `refraction` (limite 3 % por região), contra o estado atual (roleta de Fresnel da segunda interface em diante):

| variante                                                   | ruído glint | vagalumes | `edge` | custo lente | regiões fora do limite                                                                                                       |
| ---------------------------------------------------------- | ----------- | --------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| roleta (atual)                                             | 0,096       | 0,548 %   | 40,6 % | 20,0 ms     | nenhuma                                                                                                                      |
| lobo maior + menor na vaga livre (4 vagas, corta sem vaga) | 0,005       | 0,012 %   | 1,6 %  | 25,6 ms     | prism 9,5, dispersed 11,0, glint 7,6, immersed 5,9; truncada 0,72 %                                                          |
| 6 vagas (lobos em 4–5), roleta sem vaga                    | 0,071       | 0,302 %   | 31,6 % | 33,6 ms     | prism 8,4 (contagem dupla quando a dispersão abre)                                                                           |
| só o lobo maior (Whitted), sem vaga extra                  | 0,003       | 0,000 %   | 1,4 %  | 18,7 ms     | lit 28,5, prism 18,1, dispersed 18,2, glint 12,4, rough 10,2, sphere 9,0, relief 8,5, lens 8,4, immersed 7,6; truncada 6,4 % |

## 039 refeita — as interfaces lisas sem sorteio (2026-10-29, decisão do usuário: variante A)

Nas interfaces lisas (α ≤ 0,01) dos caminhos sem dispersão, da segunda interface em diante: o lobo maior sem sorteio,
com o peso exato, e o menor na vaga 4 do pixel (a quinta, fora das dos canais da dispersão), cortado sem ela (a energia
dele conta como truncada); a interface áspera e os caminhos com dispersão seguem pela roleta. A água do app sem
dispersão (Abbe 0). Smoke `refraction`: ruído na esfera 0,096 → 0,031; vagalumes 0,548 → 0,131 %; prism 0,52 %,
immersed 5,90 % (limite 7 %), dispersed 8,29 % e glint 5,39 % (limite 10 %), energia cortada na lente 0,72 % (limite
1 %), razão do ruído da dispersão 1,78× (limite 2×) — critérios ajustados com a decisão; custo da lente 25,9 ms
(+5,9). `fluidField edge` 1,6 % (passa). Vagas: 5 por pixel (+25 % de memória). Tanque: a espuma sem cor, a imagem
sem salpicos; 28–32 FPS.

## 039 refeita — os fótons pela normal do material (2026-10-29)

Os fótons das cáusticas cruzavam a água e o vidro pela normal geométrica (a superfície do campo, plana com a água
assentada), e a câmera os vê pela normal do fechamento (a ondulação do material): agora os dois pela mesma (a do
fechamento, do lado da face; rente à superfície, a geométrica). Smoke `caustics` inteiro passa. Comparação do tanque
quadro a quadro pelo gravador, o motor anterior à 039 contra o atual (quadro 400, RGB): chão fora 90/96/104 contra
86/92/99, fundo sob a água 107/121/120 contra 109/124/123 e 73/87/92 contra 73/88/92 — o aspecto do fundo sob a água é
o mesmo de antes da 039; o vídeo de referência do usuário é de uma cena anterior (a bandeja rasa de bordas opacas).
