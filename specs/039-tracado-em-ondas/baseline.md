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
avaliavam o material da água na marcha pelo seletor composto: agora leem o fechamento de cada corpo, avaliado uma vez
por quadro na onda pelo `FluidFieldFlow` (`FluidField.closures`) — o meio homogêneo por corpo.
