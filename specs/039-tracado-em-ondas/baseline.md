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
