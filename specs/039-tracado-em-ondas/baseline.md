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

## 039 refeita — a água parava cedo: a dissipação do PBF (2026-10-29)

Velocidade das partículas da barragem no tanque (PBF, espaçamento 2,5 cm, 4 substeps a 60 Hz), mediana aos 7,5 s:
XSPH 0,05 (o padrão) 0,020 m/s; XSPH 0,01 0,034; sem XSPH 0,042; sem XSPH e sem tensão superficial 0,079 (mas com
gotas soltas que não assentam: a tensão fica). O preset da água (`ParticlePhysics.WATER`) passa a XSPH 0,01. A escala
do XSPH por substep não muda nada nesta cena (já são 4 substeps, o passo do Particles4All). `fluidBehavior` falha igual
no `HEAD` (puddle: a área não cresce com a adesão; estados ≠ fixtures); `wetting` passa.

## 039 refeita — rumo aos 100 FPS: medidas de parede e a referência (2026-10-30)

Medidas pelo tempo de parede (Chrome headless no M4, 1280 × 720, a página `bench/agua.html`, 240 quadros depois de 6 s,
sem o cronômetro de GPU — o cronômetro do quadro custa ~20 ms no tanque; os tempos por passe de render se sobrepõem no
Apple e não somam):

- Tanque completo: **43,7 ms (23 FPS)**; CPU de gravação 1,4 ms (o limite é a GPU); com 3 quadros em voo 39,7 ms.
- Sem a água (só o aquário de vidro e o chão): 11,8 ms. A água (física, campo, malha, traçado, cáusticas) custa ~32 ms.
- A física já tem passo fixo de 60 Hz (`Time`): ~8,5 ms por quadro a 23 FPS (1–3 passos), ~2,5 ms a 100 FPS.
- Teto de interfaces (as rodadas agora o seguem): 16 → 44,5 ms; 8 → 40,0 ms (imagem igual: 5,9 % dos pixels acima
  de 8/255 contra 5,6 % entre duas capturas de 16); 5 → 36,9 ms (16 %, os reflexos nas gotas do chão). O tanque usa 8.

Referência, Particles4All (preset médio, mesmo Chrome, 1280 × 720): 100 000 partículas de água + 41 mil de parede,
**189 FPS (~5,3 ms)**. Física com passo fixo (4 subpassos a cada 1/60 s, grade ordenada a cada subpasso, sem listas
de vizinhos); superfície por elipsoides anisotrópicos na tela com filtro de faixa estreita; composição com custo fixo
por pixel (uma refração traçada contra os sólidos analíticos, uma reflexão, absorção pela espessura). Sem vidro,
cáusticas, GI nem dispersão.

### Ablação no tanque congelado (2026-10-30)

O estado da água muda de uma rodada para outra (45–53 ms em rodadas iguais): as medidas valem só numa sessão, com a
física parada aos 3 s simulados e as configurações alternadas em ciclos (mediana de 3 ciclos de 90 quadros; repetem
dentro de ~0,5 ms). Quadro sem física: 32,2 ms. Economia ao desligar: traçado 15,6; pedido de volume da água 9,5
(sobreposto ao traçado: sem pedido, não há água a traçar); campo 5,6; cáusticas 4,6; filtro da refração 1,9; os passes
de raster (pedido, movimento, composição, resolução temporal) ~0 cada.

Traçado por rodada e por etapa (passes rotulados temporários, cronômetro de compute; teto 8): acerto 4,2 ms, material
1,3, continuação 8,3 (rodada 1: 1,4 / 0,45 / 3,2). Na continuação, a luz direta com sombra no opaco 1,9 ms, o brilho do
sol nas interfaces 0,8, a indireta 0; o resto (~5,6 ms) é o nó e os registros de cada vaga (~400–500 B, 5 vagas por
pixel, dois fechamentos por acerto) lidos e regravados em cada rodada. Por teto: 1 interface já custa 8,7 ms; cada
rodada a mais 2,6 / 1,8 / 0,9 / ~0,5 ms.

O campo refeito só quando a simulação avança (ou mudam os parâmetros, as capacidades, a grade): congelado 32,2 → 26,4
ms; a imagem igual (0,54 % dos pixels acima de 8/255 contra 1,06 % entre duas capturas iguais, na mesma sessão).

O tamanho do registro da vaga pesa: 256 bytes sem uso acrescentados ao registro levam o traçado de 21,6 a 27,6 ms (a
continuação lê e grava o registro inteiro). O meio da pilha em escalares (48 → 32 bytes; as duas pilhas de uma vaga
416 → 272): traçado 21,6 → 18,2 ms no tanque congelado; a lente do smoke `refraction` 26,0 → 23,1 ms, as mesmas
falhas (anteriores) e as medidas de imagem dentro da variação entre rodadas.

Tanque inteiro com a física (três rodadas de 240 quadros): **44,5 → 33,4 ms (22,5 → 30 FPS)** com o teto de 8
interfaces, o campo refeito só com passo da física e o meio compacto.

A dispersão adiada fora do registro da vaga (`RefractionSplit`, o mesmo índice, ~200 bytes com a terceira pilha):
traçado 18,2 → 15,7 ms no tanque congelado; a lente do smoke `refraction` 23,1 → 21,6 ms, as mesmas falhas. O caso
`ripple` sozinho dá 1–3 degraus de borda em 5670 cruzamentos com o código de antes e com o de agora (p99 0,77–0,79 px):
pré-existente, não aparece na rodada completa.

### O mapa do quadro inteiro e o que falta para 100 FPS (2026-10-30)

Ablação no tanque congelado (mesma sessão, 3 ciclos): quadro 22,2 ms. Economia ao desligar: traçado 11,5; pedido de
volume 6,9 (sobreposto ao traçado); cáusticas 4,7; forward 1,9; filtro da refração 1,7; mapa da luz da água 0,9; o
resto (TLAS, sombras, froxels, partículas, composição, movimento, resolução temporal, superfícies, transformações) ≤ 0,2
cada.

Com a física rodando (passes rotulados temporários, ~3,6 passos por quadro sob o cronômetro): a física soma ~8,3 ms por
quadro, ~2,1 ms por passo de 60 Hz (36 864 partículas, 4 subpassos × 4 iterações); as listas de vizinhos ~27 % disso
(soma de prefixos das células, ordenação nas células, busca). O campo refeito ~4 ms por passo (redistância 0,9, malha
0,9, mapa da luz 0,7, densidade/suavização/início/apron ~0,9). A 100 FPS (0,6 passo por quadro): física ~1,3 ms e campo
~2,4 ms por quadro — cabem; o que não cabe é o desenho fixo (22 ms).

Traçado por rodada (fila de 88 mil representantes, meia resolução, teto 8): acertos 3,6 ms, material 1,3, continuação
4,2, o resto 0,7; as rodadas 0 e 1 (a câmera até a primeira interface; a reflexão e a transmissão dentro da água)
somam ~5,8 ms. Rodada quase vazia: 0,15–0,2 ms fixos (teto 8 → 12 → 16: 22,6 → 23,1 → 23,9 ms).

Cáusticas por etapa: emissão 1,75 ms (as tentativas por rejeição na caixa da água, até 32 marchas de ocupação por
fóton, ~0,6; o raio reto da correção, ~0,8), rebotes ~1,9 (o acerto domina), preparação 0,3, resolução 0,1. Despachar
os rebotes pelos fótons vivos (argumentos indiretos) não muda nada (4,74 ms antes e depois): descartado.

Os dois cortes sem perda de qualidade que restavam, medidos antes de escrever (tanque congelado, mesma sessão):

- Despachos por rodada do traçado: 6 e 12 despachos vazios a mais por rodada (54 e 108 no quadro) custam +0,1 e +0,7
  ms (~6 µs cada). Fundir os 2–3 despachos pequenos de cada rodada daria ~0,1 ms: descartado. O custo fixo das rodadas
  finais é a latência dos poucos raios que ainda marcham, não o número de despachos.
- As marchas de ocupação da emissão das cáusticas: dobrá-las leva as cáusticas de 4,74 a 5,10 ms — elas custam ~0,4
  ms. Emitir pelos blocos ocupados pede uma marcha de contagem inteira por fóton (o peso pelo comprimento dentro dos
  blocos): o ganho líquido ≤ 0,3 ms, com um estimador novo. Descartado.

Sem baixar a qualidade, o quadro do tanque fica em ~22 ms congelado e ~33 ms com a física; os 100 FPS pedem os perfis
de qualidade (teto de interfaces, resolução do traçado, fótons e frequência das cáusticas) — a configuração do
renderizador, decisão do usuário.

### Os botões de qualidade (2026-10-30)

Tanque congelado, 1280 × 720, mesma sessão, sem captura durante a medida (a captura do canvas deixa os quadros
seguintes ~6 ms mais lentos). Imagem contra a referência (teto 16 para o teto; 262 144 fótons para os fótons), depois
de 150 quadros; o piso é a diferença entre duas capturas da mesma configuração (0,33–0,55 % dos pixels > 8/255, média
~1/255).

| Teto de interfaces | Quadro (ms) | Pixels > 8/255 | Média | Onde muda                        |
| ------------------ | ----------- | -------------- | ----- | -------------------------------- |
| 16                 | 25,1        | referência     |       |                                  |
| 8 (atual)          | 23,1        | 0,84 %         | 1,09  | quase nada                       |
| 5                  | 22,3        | 1,86 %         | 1,49  | reflexos nas gotas               |
| 4                  | 21,6        | 2,00 %         | 1,67  |                                  |
| 3                  | 20,2        | 2,89 %         | 2,02  | bordas do vidro e a linha d'água |
| 2                  | 19,1        | 7,10 %         | 5,13  | as paredes do aquário pretas     |
| 1                  | 16,9        | 7,87 %         | 6,78  |                                  |

| Fótons das cáusticas | Quadro (ms) | Pixels > 8/255 | Média |
| -------------------- | ----------- | -------------- | ----- |
| 262 144              | 28,2        | referência     |       |
| 65 536 (atual)       | 23,1        | 9,35 %         | 2,53  |
| 32 768               | 21,2        | 14,33 %        | 3,42  |
| 16 384               | 20,7        | 18,50 %        | 4,27  |
| 8 192                | 20,3        | 20,59 %        | 4,70  |
| desligadas           | ~18,4       | —              | —     |

A diferença dos fótons fica no desenho fino das cáusticas no chão e nas poças (a média móvel do hash converge para um
padrão estável em cada contagem); à vista, 65 536 e 262 144 se confundem.

Escala de render (sessões separadas): 960 × 540 ~19,6 ms; 640 × 360 entre 15,4 e 11,9 ms (a GPU baixa o clock com
pouca carga: as medidas nessa escala variam entre ciclos). A 640 × 360 as cáusticas (~3,7 ms, independentes da
resolução) e o traçado (~4,2 ms, a latência das rodadas finais) seguem dominando: ~12 ms não escalam com os pixels.

Perfis combinados com a física rodando (mesma sessão): atual 32,2 ms (31 FPS); teto 4 29,9; teto 3 29,3; 16 384
fótons 29,3; teto 4 + 16 384 27,7; teto 3 + 16 384 26,7; teto 3 sem cáusticas 24,0 ms (42 FPS).

Defeitos achados nas cáusticas (o código é meu): os buffers dos fótons só crescem — depois de 262 144 fótons, 65 536
custam 31 ms em vez de 22,5 (os rebotes despacham os blocos da capacidade, vazios); e desligar os fótons (0) e
religá-los deixa as cáusticas ~7 ms mais caras daí em diante. Os dois buffers são `core.create` no Flow: entram na
migração do renderizador.

### Quantos blocos do campo mudam por passo (2026-10-30)

Tanque com a física rodando, uma leitura do pool do PBF por instante (36 864 partículas): deslocamento por passo
|v|·(1/60). Um bloco (10 cm, 8 voxels de 1,25 cm) muda quando alguma partícula a menos de R dele passa da tolerância τ
no passo; "acumulado" soma a deriva (taxa por bloco = deslocamento máximo / τ, até 1). Blocos ocupados: ~6 900 com R =
5 cm (o núcleo), ~12 600 com R = 10 cm (núcleo + faixa da redistância) — a maioria pelas gotas paradas no chão.

| Simulado | Deslocamento p50 / p99 (mm) | τ 0,5 mm, R 5 cm      | τ 0,5 mm, R 10 cm    | τ 1 mm, R 10 cm      |
| -------- | --------------------------- | --------------------- | -------------------- | -------------------- |
| 3 s      | 2,26 / 7,24                 | 31 %                  | 32 %                 | 30 %                 |
| 6 s      | 0,80 / 2,97                 | 14 % (acumulado 17 %) | 9 % (acumulado 12 %) | 9 % (acumulado 11 %) |
| 10 s     | 0,19 / 0,86                 | 11 % (acumulado 14 %) | 8 % (acumulado 10 %) | 5 % (acumulado 8 %)  |
| 20 s     | 0,05 / 0,35                 | 2 % (acumulado 8 %)   | 3 % (acumulado 7 %)  | 0 % (acumulado 4 %)  |

O que escala com os blocos na reconstrução (densidade, suavização, início, redistância, apron, malha) soma ~2,8 dos ~4
ms por passo; as etapas por partícula (junção, grade, núcleos, marcação, ~0,4 ms) e o mapa da luz (0,7) ficam. Com
~15 % dos blocos refeitos: ~2,3 ms a menos por passo, menos a marcação dos blocos sujos — ~1,2–1,4 ms por quadro a 100
FPS, na água assentada; na barragem (30–40 % dos blocos), pouco. Riscos: o nível que conserva o volume é global (muda
todos os blocos a cada passo, a menos que vire um deslocamento aplicado na leitura) e a redistância e a suavização
leem os vizinhos (as bordas entre blocos refeitos e mantidos).

## Depois da migração do espaço de trabalho (b34bd5f4, 2026-10-31)

Série inteira dos smokes no HEAD; cada falha rodada também com o `src` de antes da migração (`4440b7fe`) no mesmo Chrome.

- Passam (28): adapterLimits, bigMesh, caustics, churn, computeKernels, contactSet, dispatchCost, energy, gpuTiming, hdr,
  integration, lighting, limits, multiApp, particles, pointCloud, readiness, render, rigidContacts, scale1m,
  shaderLibrary, sky, softEnergy, stress60s, time, trajectories, transforms, wetting.
- Falham igual antes da migração (mesmas mensagens e os mesmos hashes de estado): extensionPoints, fluidBehavior,
  deviceFloor e globalIllumination (`gi_trace` 11 > 10 buffers de storage), materials, nodeGraphs, parametricSurfaces
  (só o ruído dos fótons nas contagens de pixels das cáusticas), rayScene (`whenReady` no prazo), softSurface,
  fluidSurface.
- Timeout de 120 s igual antes: antialiasing, fog, giNoise, refraction.
- fluidField: o caso `normal` não consegue mais adaptador da GPU depois dos casos `gpu`…`close`, igual antes; derruba o
  adaptador para o resto da sessão do navegador, então roda por último ou sozinho.
- Ajustados à API nova (sem mudar critério): computeKernels e limits (os primitivos recebem o Resource de trabalho),
  fluidField (a onda do estágio de consulta), shaderLibrary (só schemas na lista), nodeGraphs (o nome do buffer termina
  com a identidade do Resource de trabalho).

## Os perfis do renderizador no tanque (SC-009, 2026-10-31)

Tanque da página `bench/agua.html` a 1280×720 no M4, Chrome headless, `bench/runner/zzProfiles.ts` (aplica o perfil,
assenta 150 quadros, mede 90 pelo intervalo entre quadros; tempos sem capturas, imagem numa rodada à parte). O "alto"
é o do tanque como roda hoje: o perfil alto com o teto de 8 interfaces que a cena pede por cima dele.

| Perfil            | Congelado (2 ciclos) | Com a física (2 rodadas, ordens opostas) | Alvo SC-009 | Imagem contra o alto (> 8/255) | Piso de ruído |
| ----------------- | -------------------- | ---------------------------------------- | ----------- | ------------------------------ | ------------- |
| alto (teto 8)     | 24,7 / 26,1 ms       | 34,4–40,5 / 40,3–40,5 ms                 | ≤ 33 ms     | —                              | 0,45 %        |
| médio (4, 16 384) | 19,2 / 19,7 ms       | 29,2–29,6 / 29,3–29,7 ms                 | ≤ 22 ms     | 8,9 % (média 2,8)              | 0,37 %        |
| baixo (3, sem)    | 14,6 / 14,9 ms       | 23,8–31,3 / 23,4–23,6 ms                 | ≤ 17 ms     | 22,3 % (média 6,9)             | 0,21 %        |

- Nenhum perfil fecha a SC-009 com a física; congelados, o médio e o baixo ficam perto (19 e 15 ms). O que falta é o
  passo da física e o traçado por quadro — a Opção B (T134–T136).
- Médio: o padrão das cáusticas no fundo quase some (16 384 fótons) e as paredes de vidro ganham bordas verdes (os
  caminhos que esgotam as 4 interfaces).
- Baixo: regiões pretas grandes — com 3 interfaces o caminho vidro → água → vidro não fecha e a energia restante conta
  como absorvida. Como definido, o perfil baixo não serve ao tanque; o teto mínimo que fecha a cena é 4 (o do médio).
- Os dois defeitos das cáusticas (T129, SC-008): depois de 262 144 fótons a volta ao alto custa 32,8–33,4 ms contra
  30,5–32,6 antes deles (era +8,5 ms antes da migração); depois de desligar e religar, 32,8–33,1 (era +7 ms) — o que
  sobra (≤ 1 ms) está dentro da variação entre ciclos. Teto 16 nessas medidas (o perfil alto sem o ajuste da cena).
- A medida de 33 ms "com a física" anterior não se reproduz hoje nem no código de antes da migração (45–63 ms com o
  Chrome do usuário e os servidores do app abertos; 34–40 ms depois): o tempo ao vivo depende do estado da água e da
  carga na GPU, e as comparações valem só na mesma sessão.

## A Opção B2 (xadrez) e o perfil baixo com cáusticas (2026-10-31)

Perfil baixo corrigido (decisão do usuário: as cáusticas ficam em todo perfil): teto 4 e 8 192 fótons. B2
(`renderer.tracing.checkerboard`): metade dos blocos 2×2 traçada por quadro, a vez no bloco avançando por traçado e por
ciclo de 8 quadros e a fase do xadrez trocando a cada 4 ciclos (descorrelação com a sequência de 64 posições do
antisserrilhado), carimbos por até 16 quadros e a reconstrução com os blocos do quadro e do anterior.

Tempo (1280×720, M4; congelado 2 ciclos; com a física, duas rodadas na mesma sessão em ordens opostas):

| Configuração     | Congelado      | Com a física             |
| ---------------- | -------------- | ------------------------ |
| alto (teto 8)    | 26,0 / 26,0 ms | 48,3–51,1 / 46,5–46,6 ms |
| alto + B2        | 21,1 / 21,3 ms | 39,5–41,2 / 36,7–36,9 ms |
| médio            | 19,5 / 19,6 ms | 33,4–36,3 / 33,5–34,7 ms |
| médio + B2       | 15,5 / 15,5 ms | 27,9–28,7 / 28,6–29,4 ms |
| baixo (4, 8 192) | 20,6 / 20,8 ms | 33,4 / 34,1–36,3 ms      |
| baixo + B2       | 15,8 / 16,2 ms | 28,1–28,2 / 28,4–28,8 ms |

- Imagem do baixo contra o alto: 11,7 % dos pixels > 8/255 (média 3,2); piso 0,46 %.
- SC-010 da B2 (câmera parada, 600 quadros de espera, mesma sessão): **não passa**. Controle — duas configurações
  idênticas com nomes diferentes: 0,39–0,41 %; médio contra médio + B2: 1,56–1,64 % (limite 0,6 %), com as diferenças
  nas bordas (o xadrez do chão, o vidro, a superfície da água), e o mesmo com 150 ou 600 quadros (viés, não convergência
  lenta). A descorrelação com o antisserrilhado e a vizinhança de dois quadros não mudaram o número. A leitura: o valor
  exato de cada pixel é reaproveitado por até 14 quadros (4 sem a B2) enquanto o resto do quadro muda de posição de
  amostra a cada quadro — as bordas resolvem diferente. Pela SC-010, a B2 fica desligada nos perfis (decisão do usuário).
- 60 FPS (SC-009 revista) não fecham: o melhor com a física é ~28 ms (médio ou baixo + B2). Com a física rodando o quadro
  faz ~1,7 passo de 60 Hz (cada um ~6 ms: PBF 2,1, campo 4), e congelado o melhor desenho é ~15,5 ms.

### O mapa do médio com xadrez (2026-10-31)

Ablação no tanque congelado, perfil médio (com a B2), `zzAbl.ts`, 3 ciclos. O primeiro ciclo saiu 4 ms mais rápido
que os outros dois (15,5 contra 19,7 ms: a GPU baixando o clock depois de horas de medidas); valem as economias dos
dois últimos. Economia ao desligar: traçado ~9 ms; pedido de volume ~6,6 (sobreposto ao traçado); cáusticas ~2,9;
filtro da refração ~2,75; forward ~2,2; composição e movimento ~0,3; sombras, névoa, GI e céu ~0. O traçado continua
sendo a maior parte: a B1 (os caminhos que continuam no quadro seguinte) ataca as rodadas finais, que custam pela
latência dos poucos raios que ainda marcham.

### As cáusticas a cada N quadros (Opção B3, 2026-10-31)

`renderer.caustics.interval`: uma emissão de fótons a cada N quadros; nos outros a média móvel do hash fica. Médio
com xadrez, congelado: 19,9 → 18,5 ms com N = 2 (−1,4 ms; a GPU nesta sessão ~4 ms mais lenta que de manhã); com a
física, 31,4/24,8 → 29,6/23,6 ms. Imagem parada (600 quadros): o piso entre dois ciclos da mesma configuração sobe de
0,47 % para 1,05 % (as cáusticas mais ruidosas) e a diferença contra N = 1 fica em 0,72–0,83 % (limite 0,6 %). Pela
SC-010, N = 1 em todos os perfis; o ajuste fica disponível.
