# Research: Nuvens volumétricas (spec 041)

**Data**: 2026-11-17 · **Base**: develop em `c1f3dc05` (a 034 integrada) · **Spec**: [spec.md](./spec.md)

## Levantamento do código (o que a 041 encontra)

| Peça                                    | Onde                                                                                      | O que serve às nuvens                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Céu físico                              | `elements/scene/sky/{Sky,SkyFlow,points}.ts`, `gpu/wgsl/sky/*`                            | Planeta (`sky.radii`, km), tabelas de transmitância 256×64, múltiplo espalhamento 32×32 e vista do céu 192×108 (Hillaire 2020) geradas na GPU; `sky_radiance(dir)`, `sky_sun_transmittance(p)`, `sky_background(dir)`. Contribui a `light_transmission` (ordem 20), `scene_background` e `scene_environment`. **Não há** volume de perspectiva aérea. |
| Pontos de contribuição                  | `elements/scene/points/{lighting,media}.ts`                                               | `light_transmission` = produto dos contribuintes; `light_visibility` = produto; `scene_environment`/`scene_background` = soma; `scene_fog` = composição "na frente de" (rgb + a·rgb', a·a'); `scene_ambient` = soma.                                                                                                                                  |
| Quem lê o céu para os raios que escapam | `refraction_path.wgsl:617`, `gi_screen_trace`, `gi_probe_trace`, `gi_cache_trace`         | Todos por `scene_environment(dir)`: um ponto só para refração, reflexo na água e sondas.                                                                                                                                                                                                                                                              |
| Fundo                                   | `forward_background.wgsl`                                                                 | `scene_background(dir) * fog.a + fog.rgb`, com a névoa pelo ponto bem distante.                                                                                                                                                                                                                                                                       |
| Névoa                                   | `elements/media/{Froxels,FroxelFlow,FogVolume}.ts`, `media_*.wgsl`                        | Grade presa à câmera (alto 160×90×128, médio 128×72×96, baixo 96×54×64), fatias exponenciais até um `far` que segue os volumes (`FroxelFlow` 373–400). Injeção com `light_visibility` × `light_transmission` por luz, HG de um lobo, ambiente por `scene_ambient`. Densidade por constante, grade ou `DensityFunction` (ponto `fog_density`).         |
| Sombra                                  | `presentation/flows/ShadowFlow.ts`, `scene/points/shadowContribution.ts`                  | Mapa de sombra virtual (páginas 128², série por páginas da 037) em `light_visibility`. A sombra das nuvens é transmitância parcial: entra por `light_transmission`, não pelo mapa.                                                                                                                                                                    |
| Canal temporal (037)                    | `scene/descriptors/HistoryShape.ts`, `scene/systems/TemporalChannel.ts`                   | `history: { depth, precision, filtered }` e a série por páginas (`pages.tile`), invalidação no corte e na recriação.                                                                                                                                                                                                                                  |
| Reconstrução por blocos (lição da 034)  | `lighting/reference/reconstructionChange.ts`, registro `2f95313e`                         | Representante 2×2 com gradiente temporal: o valor exato antigo cai onde o bloco mudou. Sem isso, sal e pimenta em conteúdo que se move.                                                                                                                                                                                                               |
| Ruídos nos nós                          | `elements/nodes/noise/index.ts`, `gpu/wgsl/math/noise.wgsl`, `nodes/reference/noise.ts`   | Valor, gradiente (Perlin), fBm, celular 3D (Worley: f1, f2), com referência inteira u32 bit a bit. **Sem período**: nenhum ruído é ladrilhável.                                                                                                                                                                                                       |
| Funções de extensão                     | `elements/extension/*Function.ts` (`DensityFunction` no ponto `fog_density`)              | O padrão para "WGSL ou grafo" avaliado na GPU, sem recompilar ao mudar valores.                                                                                                                                                                                                                                                                       |
| Perfis                                  | `elements/render/Renderer.ts` (`RENDER_PROFILES`)                                         | Tabela alto/médio/baixo; a 041 acrescenta as nuvens a ela.                                                                                                                                                                                                                                                                                            |
| Limites                                 | `core/gpu/GpuContext.ts` (`ENGINE_DRAWING_LIMITS`), `scene/systems/flowBinding/limits.ts` | Pedidos no máximo do adaptador (`PlatformAdapter.limitsCap`); a verificação da composição real de cada estágio contra esses limites está em `flowBinding/limits.ts`.                                                                                                                                                                                  |
| Traçador de referência                  | `elements/lighting/reference/pathTracer.ts`, `scene/reference/atmosphere.ts`              | Meios em caixa com densidade por função e HG; céu por tabela; atmosfera f64. Falta: fase arbitrária, rastreamento delta com majorante para meios de quilômetros.                                                                                                                                                                                      |

## Decisões

### R1 — Onde e como a marcha roda

**Decisão**: compute próprio (`CloudFlow`, fase `forward`, depois do `RefractionCompositeFlow` e antes da água), sobre
a profundidade da cena. Marcha em **um quarto da resolução** (½ × ½) e, a cada quadro, **um pixel de cada bloco 2 × 2**
desse alvo, na ordem de Bayer (1/16 dos pixels da tela por quadro). A casca é a de duas esferas do planeta do `Sky`
(raio do planeta + base, + topo). O raio vai da câmera (ou da entrada na casca) até o primeiro de: saída da casca,
superfície opaca (profundidade da cena), horizonte do planeta. **Teto constante de 96 passos** de densidade (alto; 64
médio; 48 baixo) e de 6 passos de luz por passo denso; passo base `espessura / 64`, crescendo com a distância
(× (1 + d / 8 km)) e encolhendo para ½ dentro da nuvem (marcha em duas velocidades de Schneider: grossa no vazio,
fina ao achar densidade, volta à grossa depois de 6 amostras vazias). Saída antecipada com transmitância < 0,01.
Deslocamento inicial por ruído azul no tempo (sequência R2 por pixel), que o histórico integra.

**Racional**: é o desenho de Horizon (Schneider 2015/2017) e das Volumetric Clouds da Unreal (Hillaire 2016/2020):
o custo por pixel limitado, o detalhe vindo do histórico. O teto constante é regra dura (segurança da GPU). Marchar
contra a profundidade da cena dá o recorte certo de montanhas e objetos dentro da nuvem.

**Alternativas**: (a) estender os froxels até 40 km — as fatias finais teriam quilômetros, sem detalhe; (b) marchar na
resolução cheia — 16× o custo; (c) marchar no fragmento do fundo — sem histórico próprio e sem recorte pela
profundidade das superfícies; (d) meia resolução sem o xadrez de 4 quadros — 4× o custo, pelo orçamento só cabe no
alto.

### R2 — Reconstrução temporal pelo canal 037

**Decisão**: o alvo da marcha (¼ da tela, `rgba16float`: luz espalhada rgb e transmitância) mais um alvo da
**profundidade da nuvem** (`r32float`: a distância média ponderada pela opacidade, Hillaire 2016) são séries temporais
da 037 (`history: { depth: 2, filtered: true }`). A resolução de cada quadro: o pixel marchado entra exato; os outros
três do bloco vêm do histórico reprojetado pela **posição da nuvem** (câmera atual + profundidade da nuvem) e pelo
**vento** (o ponto da nuvem no quadro anterior = p − vento·Δt). Rejeição: recorte pela caixa de vizinhança do quadro
(variância 3 × 3 dos pixels marchados) e o **gradiente temporal** da 034 (`2f95313e`): se o pixel marchado do bloco
diverge da reprojeção além da tolerância, os três do bloco largam o histórico. Disoclusão (profundidade da cena mudou
mais que o pixel) e corte de câmera: invalidação do canal. Depois, o aumento para a tela cheia pela profundidade
(bilateral 2 × 2 com o peso da diferença de profundidade da cena).

**Racional**: a 034 mostrou que blocos com valores de quadros diferentes geram sal e pimenta em conteúdo que se move;
a regra do gradiente temporal resolveu e tem referência (`reconstructionChange.ts`). O estado entre quadros pela 037 é
regra dura (Princípio VII).

**Alternativas**: reprojetar pela profundidade da cena (errado no céu: infinito); sem reprojeção pelo vento (rastro com
vento forte); média exponencial sem rejeição (rastro, a lição da 4090).

### R3 — Volumes de ruído

**Decisão**: dois volumes 3D preparados na GPU por um kernel que avalia a **função de forma** (ponto novo
`cloud_shape`, WGSL ou grafo; o padrão é um grafo de nós da biblioteca):

- **forma** 128³ `rgba8unorm`: R = Perlin-Worley (fBm de Perlin remapeado pelo Worley invertido), G/B/A = fBm de Worley
  em 3 frequências (Schneider 2015);
- **detalhe** 32³ `rgba8unorm`: R/G/B = fBm de Worley em 3 frequências mais altas.

Recalculados só quando a função muda (a revisão do recurso), por fatias de 16 camadas por quadro (forma em 8 quadros,
detalhe em 2), sem custo por quadro depois. Para isso os nós de ruído ganham o parâmetro **`period`** (ruído
ladrilhável: o reticulado e as células com módulo do período), com a referência u32 estendida bit a bit. Memória:
8 MiB + 128 KiB.

**Racional**: avaliar 4+ oitavas de Worley a cada passo da marcha custa ~50× uma leitura de textura. Ladrilhável porque
o volume se repete pelo céu e o vento desliza sem costura. Nada na CPU: o volume é escrito por kernel.

**Alternativas**: ruído por passo (caro demais); volume carregado de arquivo (proibido: imagem pronta e CPU); 3D
`r16float` por canal (o dobro da banda sem ganho visível com 8 bits num remapeamento).

### R4 — Cobertura e mapa de tempo

**Decisão**: mapa 2D `rgba8unorm` 512² cobrindo um quadrado de 64 km (alto; 32 km no médio e baixo, a mesma
resolução) centrado na câmera e deslocado pelo vento: R = cobertura, G = tipo (0 estrato → 0,5 cúmulo → 1
cúmulo-nimbo), B = densidade relativa. Escrito por kernel pela **função de cobertura** (ponto novo `cloud_coverage`:
o valor global da camada, um grafo ou WGSL, com o tempo); recalculado quando a câmera anda 1/8 do quadrado ou a função
muda, e senão um quarto das linhas por quadro (a evolução no tempo). Fora do quadrado, a cobertura global da camada.

**Racional**: é o _weather map_ de Horizon e da Unreal; controla onde há nuvens (US2) e permite céu desenhado pelo grafo
(FR-008). Centrado na câmera para cobrir o horizonte sem textura do mundo inteiro.

**Alternativas**: cobertura só por número (não atende ao mapa da US2); textura do mundo inteiro (memória e precisão).

### R5 — Perfil de altura por tipo

**Decisão**: função analítica da fração de altura `h ∈ [0, 1]` e do tipo `t`: o produto de duas rampas suaves
(`smoothstep` de subida na base e de descida no topo) cujos limites interpolam continuamente entre estrato
(0,00–0,10 / 0,20–0,30), cúmulo (0,00–0,25 / 0,60–0,95) e cúmulo-nimbo (0,00–0,10 / 0,80–1,00), mais o "fundo plano e topo
arredondado" pela erosão do detalhe mais forte na base (Schneider 2017). Sem tabela.

**Racional**: contínuo no tipo (o misto da US2), sem leitura extra, e com referência f64 trivial.

**Alternativas**: tabela 2D de perfis (mais uma textura no estágio; o ganho é nenhum).

### R6 — Vento sem salto

**Decisão**: o deslocamento da forma é `vento × tempo` reduzido módulo o período do volume no `CloudFlow` em f64 (o
mesmo que o `SkyFlow` faz ao copiar o sol: empacotar parâmetros, não processar dados) e enviado no uniforme. Como o
volume é periódico, a redução não salta. O detalhe anda a 1,5× o vento e com inclinação pela altura (o topo à frente,
Schneider 2015); a cobertura anda com o vento pelo deslocamento do quadrado. Mudança de forma no tempo: a função de
cobertura recebe o tempo.

**Racional**: tempo em f32 perde precisão em horas; a redução em f64 mantém o deslocamento exato. Sem salto porque o
módulo é exatamente o período do ruído ladrilhável.

**Alternativas**: o deslocamento acumulado como estado entre quadros (estado temporal fora da 037: proibido); tempo
em f32 direto no shader (deriva após ~1 h a 10 m/s).

### R7 — Autossombra

**Decisão**: em cada passo com densidade, 6 passos para o sol em cone (Schneider 2015), comprimentos crescentes
(0,5·, 1·, 2·, 4·, 8·, 16·passo base), o último lendo só a forma (sem detalhe); além desse trecho, a transmitância
longa pelo **mapa de transmitância visto do sol** (R11). Teto constante.

**Racional**: a marcha curta dá a borda escura e o "pó" (Schneider); o mapa dá a sombra de uma nuvem sobre a outra a
quilômetros, que a marcha curta não alcança.

**Alternativas**: só o mapa (sem detalhe fino na borda); marcha longa (custo × 4).

### R8 — Múltiplo espalhamento e fase

**Decisão**: oitavas de Wrenninge (2013), como em Hillaire 2016: `L = Σ_{i<N} bⁱ σs T(aⁱ σt) p(cⁱ g)`, com
**N = 3** (alto), 2 (médio e baixo), a = 0,5, b = 0,5, c = 0,5 como ponto de partida, **calibrados contra o traçador de
referência** (R16) na cena de teste e registrados com o erro medido. Fase: a aproximação de Mie de **Jendersie &
d'Eon (2023)** — mistura de Henyey-Greenstein e Draine com os quatro parâmetros pelo diâmetro da gotícula (5–50 µm;
padrão 20 µm), lida do artigo e da referência na tarefa da referência. A redução da anisotropia por oitava se aplica a
`g_HG` e `g_D`. O "pó" (escurecimento da borda voltada para o sol): o termo de Schneider `1 − e^(−2 σt d)` aplicado à
oitava 0 só, para o que o traçador mostrar.

**Racional**: o espalhamento múltiplo é o que deixa a nuvem branca e macia (FR-010); as oitavas custam 3 avaliações
do mesmo caminho, sem marcha extra. A fase de J&dE é física (ajuste ao Mie de gotículas reais), barata e tem o brilho
prateado contra o sol (SC-002), que o HG duplo só imita.

**Alternativas**: HG duplo (g₁ 0,8 / g₂ −0,3) — sem base no tamanho da gotícula; traçar caminhos de verdade (custo
fora do orçamento); a tabela de Mie completa (textura extra, ganho pequeno sobre J&dE).

### R9 — Luz ambiente das nuvens

**Decisão**: duas irradiâncias por quadro, do céu (de cima) e do chão (de baixo: albedo do chão × sol transmitido ×
cosseno + céu), integradas da vista do céu por um kernel de 1 grupo num alvo 2 × 1 `rgba16float`; na nuvem, a
mistura pela fração de altura atenuada pela densidade acima e abaixo (o termo de Hillaire 2016), × o albedo de
espalhamento. Lida como textura amostrada: o leitor interpola entre as duas irradiâncias com filtragem de hardware.

**Racional**: o céu azul acima e a luz rebatida do chão por baixo dão a base cinza-azulada e o topo claro (US1);
integrar na GPU segue a regra "nada na CPU".

**Alternativas**: constante da cena (errada no pôr do sol); amostrar a vista do céu em cada passo (caro).

### R10 — Perspectiva aérea (nuvens e toda a geometria)

**Decisão**: o `Sky` ganha o **volume de perspectiva aérea** de Hillaire 2020 (32 × 32 × 32 `rgba16float`: luz
espalhada e transmitância média da câmera até cada fatia, até 32 km, fatias em distribuição quadrática — mais finas
perto, para cenas de metros), gerado pelo `SkyFlow` a cada quadro (~0,08 ms). Vale para **toda a geometria da cena**
sob o céu físico, com ou sem nuvens (FR-022): o passe de composição do céu (R13) aplica-o em cada pixel pela
profundidade da superfície; as nuvens aplicam-no na sua profundidade (R2). Além de 32 km, a integral direta pelas
tabelas de transmitância e múltiplo espalhamento no trecho que falta. As referências de imagem das cenas com `Sky` que
mudarem são regravadas e relatadas com a montagem antes/depois (mudança correta).

**Racional**: em AAA a atmosfera vale para tudo o que está longe; aplicá-la só às nuvens deixaria a montanha nítida na
frente de uma nuvem esmaecida à mesma distância (US3, cenário 5). FR-012 e o cenário 4 da US1 pedem a nuvem a 30 km
esmaecida e azulada; a tabela da vista do céu não dá a luz até um ponto a distância finita. Aplicar na composição (um
passe de tela cheia que já lê a profundidade) e não no fragmento do forward não acrescenta ligação ao forward, o
estágio mais carregado.

**Custo**: tabela 0,08 ms + 0,05 ms a mais na composição (uma leitura 3D por pixel). Cena só com o céu (sem nuvens):
≈ 0,2 ms novos (SC-009: ≤ 0,25 ms).

**Alternativas**: marchar a atmosfera em cada pixel (16 passos × pixel); aplicar no fragmento do forward (mais uma
textura e um uniforme no estágio mais carregado); só nas nuvens (incoerente com a geometria à mesma distância).

### R11 — Mapa de transmitância visto do sol (sombra das nuvens)

**Decisão**: _Beer shadow map_ (Hillaire 2016; Unreal): 512² (alto; 256² médio e baixo) `rgba16float` numa projeção
ortográfica do sol cobrindo 32 km em volta da câmera (alto; 16 km médio e baixo), com encaixe no texel para não
tremer. Por texel: a profundidade da frente da nuvem ao longo do sol, a extinção média e a profundidade ótica máxima;
`T(p) = exp(−min(τ_max, σ̄ · max(0, d(p) − d_frente)))`. Gerado por kernel com teto de 48 passos, **metade das linhas
por quadro** (xadrez), série temporal da 037 com a reprojeção do deslocamento do vento e da câmera. Lido por um
contribuinte novo de `light_transmission` (só para a luz do sol do `Sky`) — o chão, a água, os objetos, as sondas da
GI, a névoa dos froxels e a própria nuvem (R7) recebem a sombra pelo ponto que já usam.

**Racional**: é transmitância parcial e contínua (não visibilidade binária), por isso `light_transmission` e não o mapa
de sombra virtual. Um ponto só cobre todos os receptores (FR-013), sem tocar nos consumidores.

**Alternativas**: marchar até o sol em cada receptor (caro e repetido em vários estágios); misturar no mapa de sombra
virtual (é binário e por páginas da geometria).

### R12 — Nuvens no ambiente, nas sondas e nos raios da refração e do reflexo

**Decisão**: um **panorama das nuvens** 256 × 128 `rgba16float` (luz espalhada e transmitância por direção vista da
câmera, a esfera inteira em latitude-longitude), marchado com 32 passos e 3 de luz, **um quarto dos texels por quadro**
(Bayer 2 × 2), série temporal da 037 (recomeça quando a câmera se afasta mais de 1/4 da espessura da camada). Ponto de
contribuição novo **`sky_cover(dir) -> vec4f`** (composição "na frente de", como `scene_fog`), lido pela contribuição do
`Sky` a `scene_environment`: `sky_radiance(dir) · cover.a + cover.rgb`. Assim os raios da refração (o reflexo na água
inclusive) e as sondas da GI veem as nuvens, e a luz ambiente do céu cai com o encoberto (FR-014, FR-015), sem mudar
nenhum consumidor.

**Racional**: os quatro consumidores já passam por `scene_environment`; somar não serve (a nuvem tapa o céu), por isso
o ponto novo com composição. O panorama é o equivalente à captura em tempo real do céu da Unreal.

**Alternativas**: marchar nuvens em cada raio que escapa (milhares de raios das sondas: caro); contribuir somando a
diferença (`cover.rgb − sky·(1 − a)`): exato, mas acopla a nuvem à fórmula do céu e quebra com outro fundo.

### R13 — Composição na tela: perspectiva aérea, névoa, nuvens e geometria

**Decisão**: `SkyCompositeFlow` (C4, fase `forward`, depois da água — a última superfície que escreve profundidade — e
antes da resolução temporal), que roda sempre que há `Sky`: triângulo de tela cheia sobre a cor da cena com a
profundidade. Em cada pixel, com `(Sa, Ta)` a perspectiva aérea até a superfície (R10) e `(Sc, Tc)` a nuvem do alvo
reconstruído (já marchada até a superfície daquele pixel e já com a perspectiva aérea até ela; `(0, 1)` sem
`CloudLayer`), tudo **atrás da névoa dos froxels**:
`L' = Sc + Tc · (L · Ta + Sa)` e, como `cor = Sfog + Tfog · L`,
`final = Sfog + Tfog · (Sc + Tc · Sa) + Tc · Ta · (cor − Sfog)`, com `(Sfog, Tfog) = scene_fog(p_superfície)` — exato
quando a névoa está na frente das nuvens e da atmosfera distante (os froxels acabam onde os volumes de névoa acabam). O
fundo (o céu, o disco do sol) é a superfície no infinito: a perspectiva aérea já está na tabela da vista do céu
(`Ta = 1`, `Sa = 0` ali) e a nuvem tapa o sol.

**Racional**: a cor da cena já traz a névoa; a fórmula reordena para "névoa, nuvem, atmosfera, superfície" sem refazer
a névoa. A ordem igual à das Volumetric Clouds da Unreal (a nuvem com a atmosfera até ela, sobre a cena com a
atmosfera). O `CloudFlow` marcha depois da água pela mesma razão (a nuvem para na superfície da água).

**Alternativas**: nuvens como contribuinte de `scene_fog` (cada fragmento leria o alvo de nuvens: mais ligações no
forward); compor antes da névoa (a névoa perto da câmera ficaria atrás da nuvem); compor antes da água (a água sem
perspectiva aérea).

### R14 — Custo zero sem nuvens

**Decisão**: sem `CloudLayer` na cena, nenhum Flow das nuvens prepara pipeline, nenhum alvo é alocado (`allocation:
'onDemand'`, como os froxels) e nenhum ponto recebe contribuição — custo zero. Com a camada e sem céu visível (um
interior), a marcha principal sai cedo por pixel (a profundidade da cena não alcança a casca) e só a sombra e o panorama
seguem, fatiados: ≤ 0,3 ms. A SC-005 foi ajustada para dizer isso (cena sem camada: zero; com a camada e sem céu
visível: ≤ 0,3 ms).

**Racional**: a sombra das nuvens entra pela janela de um interior; desligá-la seria errado.

### R15 — Perfis e limites

**Decisão**: `RENDER_PROFILES` ganha `clouds`: passos (96/64/48), passos de luz (6/5/4), oitavas (3/2/2), panorama
(256×128 / 192×96 / 128×64), sombra (512²·32 km / 256²·16 km / 256²·16 km), cobertura (64/32/32 km). Os alvos das
nuvens que outros estágios leem (a sombra, o panorama, as irradiâncias, a tabela aérea) são **texturas amostradas**:
pelo mérito, a leitura é filtrada pelo hardware (bilinear na sombra e no panorama, trilinear na tabela 3D) e cai no
cache de textura, mais barato que a interpolação manual de um buffer. As saídas dos kernels são texturas de storage.
O contribuinte de `light_transmission` acrescenta uma textura amostrada, um amostrador e um uniforme a cada pipeline
que lê a luz (forward, injeção dos froxels, traçado da GI e da refração). A contagem de ligações por estágio (buffers
e texturas de storage, texturas amostradas, uniformes) é registrada antes e depois e verificada contra os limites do
adaptador pela composição real (`flowBinding/limits.ts`, testes `bindingCounts`, `limits`, `adapterLimits`); o
`deviceFloor` roda com as nuvens.

**Racional**: o motor pede o máximo do adaptador; o que se controla é que a composição real caiba no que o adaptador
dá, medido e testado, e que cada dado tenha a forma de menor custo.

### R16 — Referência f64

**Decisão**: duas referências em `elements/media/clouds/reference/`, só para testes e smokes:

1. **`cloudModel.ts`**: a densidade (perfil de altura, cobertura, forma e erosão a partir da referência u32 dos ruídos
   com `period`), a fase de J&dE, o mapa de transmitância e a aproximação por oitavas — o espelho em f64 do que os
   shaders calculam, para os testes AAA de cada função;
2. **`pathTracer.ts` estendido**: meio com fase arbitrária e **rastreamento delta com majorante** (Novák et al. 2018)
   para a camada de quilômetros, o céu pela tabela da atmosfera f64 e o sol pela transmitância dela. É a verdade
   contra a qual a aproximação por oitavas é calibrada (R8) e o smoke compara (SC-001, SC-002, SC-004).

Cena de validação: uma nuvem isolada (caixa de 2 km com a densidade do modelo, semente fixa) contra o sol a 10° e a
60°, vista de baixo, de lado e contra o sol; uma camada de cobertura 0,5 para a cobertura medida (SC-003) e a sombra
no chão (SC-004). O smoke compara por região (média por bloco de 16 px), como a memória "referência da CPU distorce"
pede: a mesma representação de densidade nos dois lados.

### R17 — Orçamento por passe (M4, 1280 × 720, alto)

| Passe                                        | Frequência                        | Estimativa   | Teto do smoke       |
| -------------------------------------------- | --------------------------------- | ------------ | ------------------- |
| Volumes de ruído                             | só quando a função muda (fatiado) | 0            | —                   |
| Cobertura 512²                               | ¼ das linhas por quadro           | 0,03 ms      | 0,1 ms              |
| Irradiâncias do céu e do chão                | por quadro                        | 0,01 ms      | 0,05 ms             |
| Perspectiva aérea 32³ (no `SkyFlow`)         | por quadro, também sem nuvens     | 0,08 ms      | 0,15 ms             |
| Mapa de transmitância 512² × 48 passos       | ½ por quadro                      | 0,25 ms      | 0,4 ms              |
| Marcha principal (¼ res, 1 de 4 por bloco)   | por quadro                        | 1,10 ms      | 1,5 ms              |
| Reconstrução temporal + aumento para a tela  | por quadro                        | 0,25 ms      | 0,35 ms             |
| Panorama 256 × 128                           | ¼ por quadro                      | 0,20 ms      | 0,3 ms              |
| Composição (perspectiva aérea, névoa, nuvem) | por quadro, também sem nuvens     | 0,15 ms      | 0,2 ms              |
| **Total**                                    |                                   | **≈ 2,1 ms** | **3,0 ms** (SC-005) |

Estimativa da marcha: 640 × 360 / 4 = 57,6 mil raios; ~70 amostras médias com saída antecipada, 2 leituras 3D + 1 2D
por amostra densa e 6 de luz em ~25 % delas → ~25 milhões de leituras por quadro, na ordem de 0,5–1 ms no M4 pela taxa
de textura. Médio: ≤ 2 ms; baixo: ≤ 1,2 ms. Só o céu, sem nuvens (a perspectiva aérea na geometria): tabela +
composição ≈ 0,2 ms (SC-009). A medida por passe entra no bench (cena `clouds/*`) e no smoke.

### R19 — O tempo: pressão, vento e tempestades (2026-11-18)

**Pedido** (o usuário, 2026-11-17): "Se fizer sentido considere zonas de baixa e alta pressão para formação de nuvens
com tempestades". Faz sentido: hoje a cobertura é um número, um mapa ou um grafo sem causa; o tempo dá a causa — a
pressão — e dela saem, pelos equilíbrios clássicos da meteorologia dinâmica, o vento, a subida e a descida do ar e,
com elas, onde há nuvens, de que tipo e até que altura. Fora do escopo: chuva, raios, dinâmica de fluidos da atmosfera
e convecção resolvida (o modelo é diagnóstico: a pressão é dada; a convecção é parametrizada pela convergência).

**Decisão**:

1. **Campo de pressão** p(x, z, t) (Pa, a anomalia em torno da média), no ponto novo `cloud_pressure`
   (`fn pressure_fn(xz, time, data) -> f32`, WGSL ou grafo; `CloudPressureFunction`), avaliado no referencial que anda
   com o **vento de condução** (o `wind` da camada: a corrente que leva os sistemas, a do nível de ~500–700 hPa). Sem
   função, o **padrão de sistemas** da biblioteca (`cloud_pressure_default.wgsl`): um reticulado de células de lado `L`
   (`weather.scale`, padrão 1500 km), no máximo um sistema por célula, cada um o núcleo de suporte compacto
   `A·(1 − d²/R²)³` (C²: o laplaciano, que dá a subida, é contínuo; a soma das 3 × 3 células é exata porque R ≤ L e o
   centro fica no miolo da célula). A vida: a geração `floor(t/T + φ)` sorteia centro, tipo e força; o envelope
   `sin²(π·idade)` nasce de zero, cresce e se desfaz — a troca de geração acontece com o sistema extinto, sem salto
   (`T` = `weather.lifetime`, padrão 2 dias). Baixas com R = 0,75 L e amplitude `A` (padrão 1200 Pa); altas com R = L e
   no máximo o teto do equilíbrio regular `0,8·ρ f_e² R²/24` (no centro de `A(1 − d²/R²)³`, |G|·κ = 6A/(ρR²) ≤ f²/4,
   Holton §3.2.5) — largas e de gradiente fraco, como na atmosfera. A amplitude escala com a rotação, `A(φ) =
A₄₅·f_e(φ)/f_e(45°)` (a análise de escala do equilíbrio, Δp ~ ρ f U L: o vento característico fica o mesmo em toda
   latitude, e perto do equador os sistemas são fracos, como lá são).

2. **Coriolis**: f = 2Ω sin φ, Ω = 7,2921159·10⁻⁵ rad/s, φ = `weather.latitude` (padrão 45°). Plano f (um f para a
   cena: os sistemas visíveis cabem em ~3° de latitude). Convenção: leste = +x, norte = −z (mão direita com y para cima).

3. **Vento equilibrado**: das derivadas pelo estêncil de 9 pontos (lado `L/64`; erro O(h²/L²) ~ 2·10⁻⁴), com
   G = −∇p/ρ (ρ = 1,2 kg/m³) em complexo (leste + i·norte), o equilíbrio estacionário entre o gradiente, Coriolis, a
   centrífuga da curvatura das isóbaras e um atrito linear r:

   `U = G / (r + i·a)`, a = f + κ_e·u_t, com u_t (a componente ao longo das isóbaras) a raiz regular de
   `u_t (r² + a²) = |G|·a`.

   Limites: κ = 0 → Guldberg–Mohn (1876), `U = G/(r + i f)`, o vento cruza as isóbaras para a baixa com o ângulo
   atan(r/f); r → 0 → o **vento gradiente** (Holton §3.2, `V = −fR/2 + √(f²R²/4 + R·∂p/∂n/ρ)` na baixa); r → 0 e
   κ → 0 → o **geostrófico** `u_g = −∂p/∂N/(ρf)`, `v_g = ∂p/∂E/(ρf)`; f → 0 → o **antitríptico** (o vento desce o
   gradiente). O sentido do giro sai do sinal de f: u_t(−f) = −u_t(f) — anti-horário em volta da baixa no norte, horário
   no sul. A curvatura das isóbaras `κ = (p_NN p_E² − 2 p_EN p_E p_N + p_EE p_N²)/|∇p|³` (positiva no anti-horário em
   volta da baixa) entra como `κ_e = κ·f²/(f² + r²)`: perto do equador o escoamento sinótico é dominado pelo atrito e
   não entra no ramo ciclostrófico espontâneo (a bifurcação de u_t em f = 0 daria um salto; os ciclones não se formam a
   menos de ~5° do equador porque f ≈ 0, Gray 1968) — o vento é contínuo na latitude (teste: passos de 0,05° entre −3° e
   3°). A raiz: no referencial f > 0, φ(0) = −|G|f ≤ 0 e φ(|G|/2r) = |G|(r − a)²/(2r) ≥ 0 — há sempre raiz; o intervalo
   encolhe a |G|/f no ciclone e a 2|G|/f no anticiclone regular; varredura de 16 intervalos e bisseção de 24 no primeiro
   que muda de sinal (a menor raiz: o ramo regular; teto constante). Sem raiz regular no anticiclone, o teto `a = f/2`,
   `u_t = f/(2|κ_e|)` (a outra raiz, com a ≈ 0, daria |G|/r, sem sentido físico). Atritos: o da atmosfera livre r =
   10⁻⁵ s⁻¹ (~1 dia; regulariza o equador) no vento das nuvens; o da camada limite `weather.friction` (padrão
   6·10⁻⁵ s⁻¹: o vento perto do chão cruza as isóbaras a ~30° a 45°, o valor típico sobre terra) na subida. Conferido
   na referência contra a solução analítica do vórtice gaussiano a 0,1 % (baixa e alta, regular e no teto, 45° N/S,
   20°).

4. **Subida (Ekman)**: a divergência do vento com atrito no plano f é `∇·U = −r∇²p/(ρ(r² + f²))` (o termo de Coriolis
   não diverge); a continuidade na camada limite de espessura H = 1 km sobe o ar até o topo dela:
   **`w = H·r·∇²p/(ρ(r² + f²))`** — positivo nas baixas (convergência), negativo nas altas (subsidência), finito no
   equador. Com r ≪ f, `w = (H r/f)·ζ_g`, a forma do bombeamento de Ekman `w = √(K/2f)·ζ_g` (Holton, cap. 8) com o
   modelo de lâmina (`H r/f = √(K/2f)`). Na baixa padrão (1200 Pa, R = 1125 km, 45°): ~4 cm/s no centro, a escala
   sinótica.

5. **Frentes**: onde os sistemas se encontram a deformação do vento domina a rotação — o parâmetro de Okubo–Weiss
   `W = s_n² + s_s² − ζ²` (Okubo 1970; Weiss 1991) do vento de Guldberg–Mohn, das segundas derivadas da pressão. A
   intensidade `smoothstep(0,45; 0,75; √max(W, 0)/f_e)`, calibrada na referência: em volta de um sistema isolado do
   padrão, ≤ 0,41 (nenhuma faixa); entre uma baixa e uma alta vizinhas, 0,62; entre duas baixas, 0,81. A faixa só onde
   o ar não desce (`F·(1 − descida)`): a faixa frontal é de convergência; no anel em volta de um vórtice intenso (Ro ≳ 1)
   a deformação também domina, mas lá o ar desce (−0,2 a −0,8 m/s na baixa de mesoescala da cena `tempestade`). A
   frontogênese de verdade pede um campo de temperatura (Petterssen 1936), que o modelo não tem: a deformação é o
   indicador cinemático da zona frontal.

6. **Do tempo às nuvens** (`weatherClouds`): com `lift = smoothstep(0; 2 cm/s; w)` e `sink = smoothstep(0; 1 cm/s; −w)`,
   a subida leva a cobertura pedida a `max(c₀, 0,75)`, o tipo ao cúmulo-nimbo (1) e o topo à tropopausa (1); a
   subsidência leva a cobertura a `c₀/4`, o tipo a `min(t₀, 0,25)` (estratocúmulo sob a inversão) e o topo a 0,6 do
   tempo bom; a frente, a cobertura a 0,85, o topo a 0,55 da casca e o tipo a 0,3 (estratiforme espesso, onde não há
   subida). `c₀`, `t₀` e o topo do tempo bom são os da camada (`coverage`, `type`, `top`): com o tempo, a casca vai da
   base à **tropopausa** (`weather.tropopause`, padrão 11 km — a latitude média; 16–17 km nos trópicos) e o topo do
   tempo bom é a fração `(top − base)/(tropopausa − base)`. A convergência como gatilho da convecção profunda é a
   parametrização clássica (Charney & Eliassen 1964; Kuo 1974): o modelo não resolve a convecção, decide onde ela
   acontece.

7. **Evolução (série da 037)**: o estado (cobertura pedida, tipo, topo) num quadrado de 128² texels (~2 km) centrado na
   câmera, do lado do mapa de cobertura, é **série temporal** (`weather`, `rgba32float`, `history: { depth: 2 }`): a
   fatia anterior lida em `x − U·Δt` (semi-Lagrangiano: estável para qualquer Δt, inclusive o tempo acelerado) relaxa
   para o alvo com o tempo de formação τ (`weather.formation`, padrão 20 min — a vida de uma célula convectiva):
   `s = alvo + (antes − alvo)·e^(−Δt/τ)` — as nuvens se formam e se desfazem em τ e andam com o vento local, girando em
   volta das baixas. 32 bits porque o passo por quadro é ~10⁻⁵ (Δt/τ a 60 Hz): em 16 bits (2,4·10⁻⁴ perto de 0,5) se
   perderia. O centro do quadrado é calculado no shader pela vista (o de agora) e pela vista anterior (o da fatia
   anterior), a mesma conta nos dois lados — nada guardado fora da 037. Sem histórico (primeiro quadro, corte, fora da
   fatia anterior), o alvo.

8. **O cúmulo-nimbo**: a torre até a tropopausa pelo **topo local** — o canal A do mapa de cobertura, a fração de altura
   do topo das nuvens na casca: o perfil de altura vai da base ao topo local (`h_l = h/topo`), não ao da casca; sem o
   tempo, 1 (o resultado de antes). A **bigorna** pelo `anvil bias` do Nubis (Schneider 2017): perto do topo da torre
   (h_l 0,65–0,85) a cobertura sobe como `c^e`, `e = 1 − 0,6·a`, `a = smoothstep(0,9; 1; tipo)` — só o cúmulo-nimbo
   maduro (o ar que sobe na torre sai para os lados onde a estabilidade da tropopausa o para: Houze 2014, cap. 8). Com
   tipo < 0,9, nada muda (as cenas sem o tempo, tipo 0,5 ± 0,4, não mudam); o teto do rastreamento delta passa a
   `teto^e` quando o tipo local alcança 0,9.

9. **O vento na marcha e no deslocamento**: o estado do tempo anda com o vento local (item 7); a reconstrução temporal
   reprojeta pelo vento do quadrado do tempo no ponto da nuvem (lugar `cloud_wind_at`; sem o tempo, o uniforme). O ruído
   de forma segue com o vento de condução (exato, módulo o período, R6): é a turbulência de pequena escala; a estrutura
   sinótica (onde há nuvens, o tipo, a altura) é a que gira com o vento local.

10. **Fora do quadrado** (256 km de lado no alto, o do mapa de cobertura): o tempo bom (a densidade fora do mapa usa a
    cobertura, o tipo e o topo do tempo bom); na borda (1/16 do lado) o estado cede ao tempo bom, sem costura. As torres
    de uma tempestade a mais de 128 km da câmera não aparecem — limite do quadrado, registrado (o horizonte das torres
    de 11 km fica a ~370 km).

**Racional**: os equilíbrios (geostrófico, gradiente, Guldberg–Mohn, Ekman) são a física de primeira ordem da escala
sinótica, com solução fechada por ponto — trabalho fixo por texel, sem simulação de fluido; o estado pela 037 dá a
inércia das nuvens (formar e desfazer leva tempo) e o transporte pelo vento local, sem estado fora do canal; o grafo de
pressão deixa a cena desenhar o tempo (uma frente fria, um ciclone) e o padrão dá um tempo plausível sem autoria.

**Alternativas rejeitadas**: (a) simular a atmosfera (equações primitivas, convecção resolvida) — fora do escopo, ordens
de grandeza além do orçamento; (b) mapas de tempo autorados misturados no tempo (o caminho do Nubis) — sem causa física,
o vento não sai da pressão; (c) só o geostrófico — diverge no equador e ignora a curvatura (erra 30–50 % numa baixa
intensa); (d) o estado em 16 bits — o relaxamento se perde; (e) o estado na CPU — proibido; (f) a deformação total
`D = √(s_n² + s_s²)` como frente — acende um anel em volta de todo vórtice; (g) o vento local no ruído de forma por
mapa de fluxo de duas fases — dobraria a leitura mais cara da marcha e só imita o transporte por uma janela de tempo.

**Como a indústria trata o tempo e o cúmulo-nimbo**:

- **Decima / Nubis** (Schneider & Vos 2015; Schneider 2017, 2022, 2023): o _weather map_ é autorado ou procedural — em
  Horizon Zero Dawn, cobertura, precipitação e tipo de nuvem por canal; o Nubis de 2017 acrescenta a altura e o
  `anvil bias` (a cobertura elevada a um expoente menor que 1 no alto da nuvem) para o cúmulo-nimbo; em Horizon Forbidden
  West, as tempestades são volumes de nuvem modelados (voxels) — não há pressão nem vento derivado: o tempo é direção de
  arte, misturada no tempo.
- **Unreal Engine 5** (Volumetric Cloud Component, Hillaire 2020): a densidade é um material que o usuário escreve (em
  geral lendo um _weather map_ de cobertura e tipo e um perfil vertical); a camada tem altitude e espessura; o vento e o
  tempo são parâmetros do material — sistemas de tempo são de terceiros e também autorais.
- **Frostbite** (Hillaire 2016): a distribuição das nuvens por uma textura de tempo (cobertura e tipo) pintada ou
  procedural, o perfil vertical por tipo numa textura; sem dinâmica.

Nenhuma das três deriva o vento da pressão nem forma a tempestade pela convergência: o motor passa a ter a causa, e o
grafo de pressão ocupa o lugar do mapa autorado (a cena ainda desenha o tempo, agora pela pressão).

**Ligações** (inferência do layout pela composição real): `cloud_weather_map` — storage 1 (`cameras`), amostradas 1 (a
fatia anterior), storage textures 2 (o estado, o vento), uniformes 1, mais o pool da função de pressão quando ela tem
parâmetros; `cloud_coverage_weather` — storage 1, amostradas 1, storage texture 1, uniforme 1 (o do mapa de cobertura
sem o tempo: uniforme 1, storage texture 1); a reconstrução com o tempo — +1 amostrada (o vento) e +1 amostrador
(antes: amostradas 5, uniforme 1, storage 1, storage textures 2). As marchas, a sombra, o panorama e os caminhos não
mudam de ligações (o topo local vem do canal A do mapa de cobertura que eles já leem).

**Custo estimado** (a medir, SC-012): o estado 128² × (9 avaliações da pressão × 9 células do padrão + 40 avaliações da
raiz do vento) ≈ 1,3 M núcleos e 0,7 M avaliações por quadro — ~0,02–0,05 ms no M4; o mapa de cobertura pelo tempo, o
de hoje mais 4 leituras por texel (~0,03 → ~0,04 ms).

### R19 (revisto) — a aparência do cúmulo-nimbo, o grão e o chão que pisca (2026-11-18)

O vídeo `tempestade` da rodada 7 passava nos testes, mas a tempestade madura era um banco branco largo e baixo, de topo
liso, sem torre nem bigorna em leque, com a base clara; o céu não escurecia; o chão da câmera subia e descia inteiro; e
as bordas ralas e as nuvens finas do alto saíam granuladas. Causas, isoladas uma a uma:

- **O topo liso e largo.** No mapeamento do tempo, toda a área da subida (raio de ~40 km na baixa de σ = 30 km) virava
  cobertura ≥ 0,75, tipo 1 e o topo do estado 1: todas as colunas iam à tropopausa, e o `anvil bias` (a cobertura elevada a
  `c^0,4` a 65–85 % da altura) alargava o topo de cada uma — um muro de 80 km de topo plano. Nas tempestades reais
  (e nas de Horizon Forbidden West, MSFS, UE5) há torres de alturas diferentes (cúmulos congestos entre células que furam
  a tropopausa) e uma bigorna de gelo que é outra nuvem: fina (1–3 km), no nível de equilíbrio, levada pelo vento da alta
  troposfera para longe da torre. Correção: (1) **o alcance da torre** — o topo do estado é o teto; a coluna sobe a
  `fair + (z − fair)·smoothstep(0,55; 0,95; tipo local)` (`cloud_tower_reach`/`towerReach`): só a célula mais forte vai à
  tropopausa; (2) **a bigorna como estado próprio** — o quarto canal da série do tempo: nasce onde o estado já tem a torre
  na tropopausa e é cúmulo-nimbo (`smoothstep(0,85; 1; topo)·smoothstep(0,85; 1; tipo)`), é trazida pelo vento da alta
  troposfera (`weather.shear` × o vento da camada; padrão 2,5) e se desfaz em 4 tempos de formação (o gelo sublima em
  horas); na densidade, uma lâmina de 2 km com o topo 800 m abaixo da tropopausa (as torres mais fortes passam por cima:
  o topo saliente), a forma pelo volume deslocado com o vento de cima e a extinção do gelo (0,25 × a da camada: IWC
  ~0,1 g/m³, raio efetivo ~30 µm). O `anvil bias` saiu.
- **A base clara.** A extinção era a mesma para todo tipo: a densidade 1 do cúmulo raso. A água condensada de uma torre
  cresce com a altura acima da base (adiabática: ~1–3 g/m³ no núcleo de um cúmulo-nimbo contra 0,3–0,5 no cúmulo raso;
  σ ≈ 1,5·LWC/(ρ_w·r_e)): **a água da torre** (`cloud_tower_water`/`towerWater`) sobe o fator da extinção de 1 a 3 nos 3 km
  acima do topo do tempo bom e o devolve a 1 na glaciação (5,5–8,5 km: −20 °C a −38 °C na atmosfera padrão, cristais
  maiores). Sem o tempo o topo do tempo bom é o da casca e o fator é 1 (nada muda nas outras cenas). O majorante do
  rastreamento delta com o tempo passa a 3.
- **O enquadramento.** A torre a 55 km com o sol atrás da câmera: a face vista era a iluminada (branca, como nas fotos com
  o sol nas costas) e a 10° de altura no quadro. A cena nova: o sol de fim de tarde a 20°, 50° à direita da torre (fora do
  quadro: o lado virado para a câmera fica na sombra), o sistema chegando de 65 km a 12 km (a câmera debaixo dele no fim) e
  a câmera a 60 m sobre as colinas olhando 12° para cima.
- **O grão.** Dois achados. (1) O passo da marcha era `espessura da casca/64` com o piso `trecho/passos`: com o tempo a
  casca vai à tropopausa (9,8 km contra 1,6 km), o passo perto subia de 25 m para 153 m e o piso de um raio a 30° de 19 m
  para 153 m. Corrigido: o passo e o cone da luz pela espessura do tempo bom (`cloud_layer_thickness`) e a ocupação do raio
  (`cloud_ray_occupancy`: 32 trechos iguais marcados pelo topo das colunas no mapa de cobertura, com os vizinhos; o piso
  pela parte ocupada e os trechos vazios pulados, cada pulo um passo do orçamento; sem o tempo o raio fica ocupado onde há
  cobertura: a marcha de antes). E o detalhe pela pegada do pixel da marcha (`cloud_footprint`: os canais B e A cedem ao
  mais grosso quando a oitava mais fina deles fica abaixo dela; a referência com o ângulo do pixel da GPU). (2) Mas o grão
  das bordas ralas ficou: medido na borda de baixo de um cúmulo (o passa-alta 5 × 5 na região, a mesma cena e o mesmo
  quadro), a reprojeção pelo vento da camada no lugar do vento do tempo não muda (0,96), a marcha só com o passo fino não
  muda (0,96), o cache de espalhamento desligado piora (1,39), o detalhe pela pegada tira 10 % do ruído que muda de um
  quadro ao outro (0,59 → 0,53); o relógio mais lento é o que tira: 0,77 a 2 s por quadro, 0,64 a 1 s, e a 1/60 s a borda
  fica lisa em 60 quadros. A causa é a reconstrução temporal (a média exponencial de peso 0,25, cada pixel marchado a cada
  4 quadros: ~7 amostras) que não acumula quando a forma muda a cada quadro do tempo acelerado; cada pixel fica com o
  ruído do deslocamento inicial de uma amostra. A `tempestade` passa a 2 s por quadro (4 h em 120 s). Em aberto no motor:
  a reconstrução de uma série muito acelerada (o detalhe que anda com o vento local, ou mais amostras quando o histórico é
  largado).
- **O chão que pisca** (caso `storm-ground`, a cena da rodada 7 a 4 s por quadro): a transmitância até o sol no chão da
  câmera, GPU contra a referência f64 no mesmo quadro, sobe e desce junto nas duas (2,7–3,7 s do vídeo: 0 → 0,79 → 0,08 na
  GPU, 0 → 1,00 → 0,06 na referência; 14,7–15,7 s: as duas vão e voltam entre 0,36 e 1,00), luz somada −7 %: é a borda
  esfarrapada de um cúmulo passando pelo sol, a 24 m de vento por quadro, e a câmera a 2 m via só os primeiros metros de
  chão (o quarto de baixo do quadro inteiro numa sombra só). Na cena nova a câmera fica a 60 m e o chão visível vai de
  ~200 m a ~6 km.

### R19 (rodada 9) — os discos, os pontos claros, a base cinza e o grão (2026-11-18)

Os defeitos apontados no vídeo `tempestade` da rodada 8, isolados um a um na mesma cena sem o terreno (o quadro 4500,
75 s do vídeo; cada hipótese pela troca de uma peça):

- **Os discos e a risca.** Não é a bigorna (sem ela, o disco e a risca ficam), nem o alcance da torre (com alcance 1 em
  toda coluna, também), nem a água da torre, nem a ocupação do raio, nem o cache de espalhamento, nem o mapa visto do sol
  (com a marcha ao sol de força bruta, ficam). Com τ = 0 até o sol somem: é luz. Com o sol a 45° o disco fica no mesmo
  lugar: é forma. Vista de 3,5 km de altura: o disco é um cúmulo raso, chato e largo (5–10 km, < 1 km de altura) na frente
  da torre, sob a inversão baixada pela subsidência em volta da baixa (topo 0,6 × o do tempo bom), visto de baixo com o
  topo aceso pelo sol baixo — o perfil inteiro espremido na camada fina com a largura das células de 8 km da cobertura:
  uma panqueca. A risca é uma fenda reta entre duas colunas da torre (a fatia vertical da densidade: colunas de paredes
  lisas, o campo 2D extrudado) por onde o sol entra. Correções: (1) **os cúmulos rasos menores, não achatados** — a
  largura de um cúmulo é da ordem da profundidade (Plank 1969); sob a inversão baixada a erosão sobe com a fração perdida
  da profundidade (`cloud_shallow_erosion`, até 0,9) e o volume de detalhe parte o corpo em cúmulos humildes; (2) **as
  térmicas** — o tipo e a cobertura locais acima do topo do tempo bom variam com o fBm de Worley da forma
  (`cloud_tower_thermal`: ±0,5 × o desvio do fBm de Worley da média no tipo, ±0,6 × na cobertura no alto): paredes e topo em couve-flor, sem fendas retas;
  (3) **a convecção trimodal** (Johnson et al. 1999): o alcance da torre com o modo congesto (`cloud_tower_reach`: 0,4 do
  caminho, parado no congelamento) entre o raso e o profundo; (4) **o topo glaciado é o gelo da bigorna**
  (`cloud_tower_water`: depois da glaciação o fator vai a `CLOUD_ANVIL_WATER`, não a 1) — a torre e a bigorna que sai
  dela são o mesmo meio, sem a fronteira de 4 × na extinção onde a lâmina cortava a torre.
- **A base cinza.** O ambiente local da estimativa das oitavas (céu × h + chão × (1 − h)) não via a nuvem: na base de uma
  torre de 10 km recebia o céu inteiro, e a estimativa pesa ≥ 20 % contra as sondas (`CLOUD_SCATTER_PRIOR` 16 contra a
  janela 64). Agora o céu e o chão chegam pela transmitância difusa (duas correntes, Bohren 1987: `1/(1 + ¾(1 − g)τ)`,
  g = 0,85) — a maior entre a da coluna acima (a cobertura local do mapa × o trecho até o topo da coluna) e a do caminho
  até o sol (o τ que a luz já calculou: a parede vê o céu de lado) (`cloud_ambient_occlusion`, `cloud_ambient_local`;
  `ambientLocal` na referência). A coluna é lida na primeira amostra com densidade de cada raio e a cada 8 depois: com 5
  amostras do volume (3 acima, 2 abaixo, o chão pelo mapa visto do sol) o `timing` alto ia a 3,98 ms (orçamento 3), e
  uma amostra do volume no meio do trecho deixava manchas de 1 km na base (acerta ou erra os buracos da forma). Contra o
  traçador f64 (rastreamento delta δ-M, 8000 caminhos) num cilindro de 3 km de raio da base à tropopausa, sol a 40°: a
  razão base/topo iluminado é 0,077 no traçador, 0,038 na marcha das oitavas (era 0,386 sem a oclusão: a base 5 × a
  verdade, cinza); na GPU os caminhos das sondas pesam ≥ 80 % e trazem a luz que vaza pelos lados.
- **Os pontos claros e o grão.** O gradiente temporal da reconstrução comparava as médias dos 3 × 3 blocos (histórico
  contra valor exato) com a tolerância fixa 0,2; na borda rala, com cada amostra ora na nuvem ora fora, a média de 9
  amostras diverge só pelo ruído e o bloco largava o histórico a cada marcha: o pixel com o valor de uma amostra (os
  pontos claros, o grão). Medido (o passa-alta temporal na borda da bigorna, 12 quadros): 0,96 nível; nunca largar, 0,57.
  Como na A-SVGF (Schied et al. 2018) o gradiente deve medir a mudança, não o ruído da amostra: a tolerância soma o erro
  padrão da média dos valores exatos (`cloud_gradient_noise`: o da transmitância e, onde ela varia, o da luz relativa;
  a dispersão da luz nos blocos opacos é estrutura, não ruído, e com ela o `sunset` ia de 14,2 a 18,3 %). O fator mede o
  meio-termo contra o atraso: com 2 desvios a borda ia a 0,76 e o quadro inteiro de 0,19 a 0,12 nível, mas o histórico
  mantido atrasava a luz do `storm` com o tempo andando (1,6 → 5,1 %, acima dos 5 %); com ½ desvio, 3,9 % e a borda 0,89,
  o quadro 0,15 (p99,9 13,5 → 10). As saídas sugeridas antes (mexer na reconstrução por amostras, ou o detalhe com o vento
  local) não atacam a causa: a reprojeção pelo vento da camada não mudava (0,96) e a cobertura em 16 bits também não.
  Em aberto: o grão restante é o de ~7 amostras por pixel sem o histórico longo numa série acelerada.

### R11 (revisto) — o mapa visto do sol e o cache de espalhamento por páginas (2026-11-19)

**Pergunta do usuário**: "Não dá para usar atlas, páginas ou arena?" Sim — as duas estruturas refeitas inteiras (o mapa) ou
por fração fixa (o cache) a cada quadro passam para as peças que a 034 consolidou: a série por páginas da C2
(`history: { depth: 1, pages }`: o carimbo de cada página e o relógio de época), o endereçamento toroidal da tabela do mapa
de sombra virtual e a soma de prefixos comum (`page_alloc.wgsl`) para a escolha em ordem. Nenhuma estrutura paralela: o
atlas é o descritor `shadow` da camada, o registro das páginas é o descritor `shadowPages`, o cache é o descritor
`scatter`; a arena de pools não se aplica (nada é enviado pela CPU).

**O mapa visto do sol** (`cloud_shadow_pages.wgsl`, `cloud_shadow.wgsl`, `cloud_shadow_lookup.wgsl`; referência
`reference/cloudShadowPages.ts`):

- _Mapa de recortes_ no plano perpendicular ao sol: 8 níveis, texel de 50 m no primeiro (cada nível dobra), 8 × 8
  páginas de 16² texels por nível em volta da câmera, presas à página (endereço toroidal `g mod 8`, como a tabela da
  034); 512 páginas, o último nível cobre ±294 km. Todas as páginas da janela ficam residentes (os receptores — o chão, a
  névoa, a GI, a marcha, a tabela aérea — estão em toda parte, não só onde há pixels de superfície); o atlas tem 23 × 23
  lugares de 17² texels (a coluna da vizinha em +x e +y: o par do filtro bilinear nunca cruza para a página física ao
  lado). A deformação asinh do mapa antigo não serve a páginas (a câmera que anda desloca todos os texels por frações); o
  recorte dá páginas inteiras ao andar e texel/distância entre 1/46 e 1/92. Medido: com 6 × 6 páginas (1/30–1/60) o ar e
  as nuvens a 25–60 km ficavam com texels de 1,6 km e o τ interpolado entre colunas de nuvem e de céu escurecia o ar
  (`far-cloud` 11,1 %; T do mapa 0,12 contra 0,85 exata a 30 km); com 8 × 8, 5,1 %. Texels anisotrópicos (finos na
  altitude, como o mapa antigo, com a direita horizontal) foram tentados e desfeitos: `sun-low` foi a 0,080.
- _Referencial das nuvens_: o plano passa pelo pivô (o vento × tempo mais a célula de 16 km que contém a câmera no
  referencial das nuvens); o conteúdo de uma página não muda com o vento uniforme. O mapa de cobertura passou a ter a
  grade no mesmo referencial (os texels andam com as nuvens): com a grade presa ao mundo, a nuvem mudava de forma ao
  passar por ela, e o mapa preso às nuvens era refeito à toa. A base do plano é a rotação mínima de +y ao sol (contínua
  até o sol a −90°; `cross(y, sol)` trocava de eixo a 82° e refaria o mapa inteiro). O centro das janelas fica na faixa
  da casca na parte vertical do plano: com o sol baixo as colunas das nuvens ficam a 1,5–4 km da câmera no plano e
  precisavam dos níveis finos (`sun-below` a −0,3°: 0,074 → 0,045).
- _Cada página com o seu sol_: o registro guarda o sol do desenho; o consumidor escolhe a página pelo plano do quadro e
  lê o ponto pelo plano do sol da página (a mesma coluna que ela guardou). Sem isso, a página de alguns quadros atrás lia
  a coluna de outro lugar com o sol andando (voltas na luz do chão: `sun-low` 4 contra 1 da referência; com ela, 0–1).
- _Invalidação_: obrigatória (no mesmo quadro, acima do orçamento) a página sem carimbo na época da série, que entrou na
  janela, de outro conteúdo (a assinatura FNV-1a dos valores que mudam as colunas) ou de outra célula do pivô. As demais,
  pela mudança da transmitância desde o desenho — a maior entre a **prevista** (o deslocamento lateral das linhas: o plano
  girando nos cantos da página e a coluna inclinando até a ponta do trecho mais longe do plano, mais o vento que sobra —
  o local menos o da camada —, × o gradiente de T medido entre texels vizinhos com fator 2; o deslocamento dos nós pelo
  comprimento do trecho; a evolução da forma pela deriva do detalhe, o tempo de formação ou 600 s com função de
  cobertura) e a **medida** (4 colunas de prova por página por quadro, embaralhadas, refeitas com o sol da página e
  comparadas com os nós 4, 8, 12 e 16 guardados no registro). Tolerância: 1/255 em T (um nível de 8 bits da luz direta
  plena). Teto da idade: 240 quadros.
- _Prioridade e orçamento_: a fila em oitavas de (mudança/tolerância) × quadros desde o desenho × √2 por nível mais fino
  × 4 vista pela câmera; até o orçamento (128/96/64 páginas por quadro no alto/médio/baixo, 25/19/12,5 % do atlas), da fila
  mais alta à mais baixa e, dentro do corte, pela ordem da página (somas de prefixos no grupo: independe dos atômicos).
  As provas das páginas não escolhidas correm no mesmo passe do desenho (um grupo por página física): a latência de uma
  coluna, sem um passe a mais na cadeia (num passe à parte, 0,19 ms de latência com só 1000 colunas).
- _Reserva grossa_: no recorte todos os níveis ficam residentes — o mais grosso cobre ±294 km — e a página que entra na
  janela é desenhada no mesmo quadro: nunca se lê página ausente.
- _O texel à direita fino, em degraus com a troca misturada_ (T055, rodadas 14, 15, 21 e 35 do `sunset`): com o sol baixo
  a vizinha em cima é a mesma coluna deslocada ao longo de si (~Δ/tan(el)) e a resolução em cima sobra; a à direita é outra
  coluna de ~30 km pelo detalhe, e a bilinear de τ entre elas escurecia a borda prateada das nuvens a 50–100 km rente ao
  sol (em f64, o mapa emulado a 10,1 % da exata; o texel à direita ÷2 a 5,6 %, ÷4 a 4,4 %; em cima ÷2 ou ÷4 sem mudança).
  Com o sol alto o texel quadrado: com 0,2 em toda elevação a borda do feixe de um vão a 35° (`beam-gap`) saía 11,8 px
  mais larga que a f64. A razão em degraus 1 / ½ / 0,2 pela contínua `tan(el)/tan(19°)` (`cloud_shadow_step_aspect`,
  espelho `shadowStepAspect`), nunca acima dela (o degrau mais fino logo abaixo do limiar; o mais grosso só com a
  contínua 5 % acima: `CLOUD_SHADOW_STEP_HYSTERESIS`), com a janela de 8 / 14 / 32 páginas à direita. Cada degrau tem o
  seu lugar nas 46 páginas físicas à direita do nível (0,2 nas 32 primeiras, ½ nas 14 seguintes, 1 nas 8 primeiras; 2944
  páginas, atlas de 935² × 4 camadas): dois degraus vizinhos ficam residentes juntos. **A troca** (`CloudShadowMaps`: o
  degrau de onde, o para onde e o peso; espelho `shadowMapsBegin`/`shadowMapsEnd`): o sol que pede o degrau vizinho
  começa a troca com peso 0; as páginas do mapa novo entram na fila `CLOUD_SHADOW_KEY_PREPARE` (o meio das 14) dentro do
  orçamento de páginas por quadro (o de 0,2 em 16 quadros a 128 por quadro); com todas valendo depois do desenho do
  quadro, o peso sobe 1/32 por quadro (`CLOUD_SHADOW_STEP_FRAMES`) e a leitura mistura os dois mapas — o nó (a marcha),
  a transmitância (o chão e as superfícies, as leituras do disco também) e, no ar, um dos dois por quadro pelo peso
  (`light_volume_visibility`); no peso 1 o de onde sai. O sol que volta ao de onde inverte a troca (o peso complementar:
  o mapa de onde seguiu mantido); o que salta dois degraus num quadro troca de uma vez (as páginas de 1 e 0,2 se
  sobrepõem). O estado entre quadros é o registro logo depois das páginas na série `shadowPages` (`CLOUD_SHADOW_STATE_SLOT`,
  carimbado; sem carimbo na época, o degrau do sol), gravado pela escolha do quadro. Medido no `solposto` (o sol de 60° a
  −4°): no degrau de ~9,8° o maior salto por quadro 0,38 nível no céu, 0,45 no horizonte e 0,22 no chão (a troca de uma
  vez, rodada 21: 7,9 / 6,7 / 4,8); no de 19°, 0,82 / 1,03 no céu e no horizonte, e o chão cai 35 níveis em 14 quadros
  com o sol entrando atrás da nuvem (o vídeo da troca de uma vez cai junto, nos mesmos quadros). Referência f64 e testes
  (`cloudShadowPages.test.ts`: os mapas disjuntos e o endereçamento de cada degrau; a troca quadro a quadro — o mapa novo
  em `⌈2048/128⌉` quadros, a rampa de 1/N, a folga, a inversão, o salto de dois degraus; o que se lê muda por quadro no
  máximo 1/N da diferença dos dois mapas nas colunas f64 de cúmulos em células). O mapa (escolha + desenho) 0,11 ms a
  60° no perfil alto (≤ 0,4). A faixa de mistura dos níveis nos 8 % de fora do raio útil (30 → 15 → 8 %).
- _O que a referência f64 mostrou_ (`cloudShadowPages.test.ts`, cúmulos em células, páginas nos níveis 0, 2 e 4): o mapa
  por colunas pontuais tem detalhe menor que o texel — com o sol andando 0,005°/quadro a 15°, o próprio mapa refeito a cada
  quadro muda até 180 níveis num texel por quadro (p50 33), e a 0,05°/quadro a 8°, 255. A previsão pelo gradiente medido
  entre texels vizinhos não alcança essa mudança subtexel; o esquema é conservador nisso (com o sol andando, as páginas
  com nuvem passam da tolerância a cada quadro) e a medida pelas provas cobre o resto. Parado, nenhuma página é refeita e
  o que se lê é o refeito (erro 0); com orçamento para todas, o erro fica na tolerância; com ⅓, perto do que o mapa
  refeito muda por quadro. Em aberto (peça própria): o mapa pré-filtrado (a média de T na pegada do texel), que tiraria o
  serrilhado temporal dos níveis grossos que o mapa antigo também tinha.

**O cache de espalhamento** (`cloud_scatter_pages.wgsl`, `cloud_scatter.wgsl`, `cloud_scatter_filter.wgsl`): as sondas em
páginas de 8³ numa série por páginas de buffer (as palavras globais — a geração da grade —, o registro de cada página — o
sol e o quadro do último caminho, a geração, quantas sondas tinham nuvem — e as sondas). Antes, a série de duas fatias
copiava a grade inteira a cada quadro (os ⅞ que não caminhavam) e o filtro refazia todas as sondas; e o anel do sol por
fase de grupos (`scatterSun`) saiu: o sol é do registro da página. Por quadro, a escolha (um grupo) põe na lista as
páginas pela idade × ⅛ sem nuvem × a raiz de (proximidade da câmera, metade a 32 km, × 2 vista) — a câmera só desempata: com a proximidade e a visibilidade inteiras, as páginas distantes caminhavam menos, esqueciam a média com o sol andando e caíam nas oitavas (`far-cloud` 11,1 → 10,5 %, `overcast-ambient` 15 %) (a que nunca caminhou nesta geração primeiro), até o
orçamento (200/96/36 páginas: o mesmo número de sondas que caminhava com a fração fixa de ⅛); a geração sobe quando a
grade recomeça (o corte, o centro que muda), e as páginas de outra geração valem zero. O filtro refaz só as sondas cuja
vizinhança tem uma página que caminhou (na geração nova, todas), lendo o cache por uma vista só de leitura (com os
atômicos dos caminhos, 0,24 ms; com a vista, 0,15).

**Ordem do quadro**: a mesma (fase `shadow`, prioridade −1): cobertura → irradiâncias → escolha e desenho das páginas do
mapa → escolha, caminhos e filtro do cache → panorama. A marcha lê o cache filtrado do quadro (ler o do quadro anterior
devolvia as estrias do crepúsculo, ver o filtro; não testado de novo nesta rodada).

### R21 — Raios de sol de verdade: a atmosfera como meio dos froxels (2026-11-19)

**Pedido.** Os feixes de luz e de sombra no ar saindo dos vãos das nuvens e passando entre colinas (as duas fotos de
referência do usuário: o pôr do sol sobre o mar e o céu azul com névoa). Os da R18 saíram fracos: a luz do ar vinha só da
tabela de Hillaire (32 × 32 colunas na tela: ~2° por coluna, mais larga que um feixe) com a sombra das nuvens, e sem a
sombra do terreno.

**Desenho (combinado com o usuário; o padrão da névoa volumétrica da Unreal 5 com o céu de Hillaire e o mapa de sombra
das nuvens, pela arquitetura do motor).**

- _Pontos novos de cena_ (`scene/points/media.ts`): `scene_medium(p, view) -> SceneMedium` (a extinção rgb e a luz que o
  meio contínuo espalha para a câmera, com as fontes e a sombra delas já nele), `scene_medium_extinction(p)` (só a extinção:
  o que a integração lê) e `scene_near_fog(p) -> SceneNearFog` (os meios perto da câmera entre ela e o ponto, e até onde,
  ao longo do raio, eles já integram o meio contínuo). Resource + ponto: quem integra perto não conhece o céu; o céu não
  conhece os froxels.
- _O `Sky` contribui o meio_ (com a tabela da câmera escrita): Rayleigh, Mie, ozônio e a névoa seca nova (`Sky.haze`:
  uma camada de aerossol com `e^(−h/H)` e a fase de Mie, a camada de mistura do fim de tarde; em `sky_medium`, logo em
  todas as tabelas e na referência `mediumAt`), no ponto do ar pelo mesmo sistema do planeta da tabela (o centro sob a
  câmera ativa). A luz simples: as fases de Rayleigh e de Cornette-Shanks × a transmitância até o sol pela curvatura (como
  a tabela) × a sombra do terreno e dos objetos (`light_visibility`: o mapa de sombra virtual) × o que mais tapa o sol no
  ar (`light_volume_visibility`, ponto novo: as nuvens e a névoa dos volumes; só onde o sol passa pelo terreno). A
  múltipla (Ψms) sem sombra, como a tabela e a Unreal. Só até o alcance da tabela (32 km, radial). A parte lisa (a
  densidade, as fases, a transmitância até o sol, Ψms) no centro do froxel e só as sombras no ponto sorteado: com a
  densidade no ponto sorteado, o céu variava ±1,2 % de um quadro para o outro (a densidade de Mie muda ~13 % numa fatia de
  10 % da distância subindo 10°) e a cobertura 0 diferia 2,4 % do céu sem camada; no centro, 0,3 % em 8 quadros (a
  convergência) e 5,7 × 10⁻⁴.
- _A sombra das nuvens num ponto do ar_ (`light_volume_visibility`, `cloud_volume_visibility.wgsl`): a superfície
  (`light_transmission`) faz a média do disco do sol em 16 pontos e a bilinear de `e^(−τ)` texel a texel (até 72
  leituras); o froxel acumula no tempo e leva uma amostra por quadro — um ponto do disco da penumbra (o raio pela
  distância ao meio do trecho da casca na coluna), um dos dois níveis da mistura pela fração dela e um texel do par
  bilinear pelos pesos dele, sorteados pela sequência R2 do quadro deslocada pelo hash do ponto (a média temporal de
  `e^(−τ)`, sem o viés de Jensen). Duas leituras.
- _A decisão da GPU: o meio só onde ele conta_ (`FroxelReachFlow`, fase `post`; canal `Froxels.reach` da 037): no fim do
  quadro, a maior profundidade da cena (blocos de 4 × 4 por invocação, `atomicMax` por grupo) vira, pelo canto mais
  esticado da tela, a maior distância vista (o fundo: infinita); o meio conta no quadro seguinte com névoa dos volumes ou
  com `σ_ext(câmera) × distância > 10⁻³` (abaixo disso a luz do ar no caminho mais longo fica abaixo de 0,1 % da dele).
  Numa sala fechada de 10 m, τ ≈ 4 × 10⁻⁴: nada roda. No começo da grade, a decisão do quadro (lida do canal) vai a um
  texel lido pelo desenho (`froxel_state`) e aos argumentos do despacho indireto da injeção, do acúmulo e da integração
  (nenhum grupo sem o meio); sem ele, a leitura dos froxels devolve nada e alcance 0 — a tabela do `Sky` soma a
  perspectiva aérea inteira, como antes desta peça (sem salto ao voltar, só os feixes finos que faltam por um quadro).
  Ao voltar, o histórico recomeça (a decisão do quadro anterior está no texel do canal).
- _Os froxels integram o meio_ (`FroxelFlow` com o slot opcional do `Sky`): com a tabela escrita, a grade existe mesmo sem
  `FogVolume` e vai até 32 km (a profundidade da vista da última fatia, até o plano distante da câmera); a injeção soma
  `scene_medium(p, raio)` à luz dos volumes no mesmo ponto sorteado (o acúmulo temporal e o recorte pela vizinhança da
  T058 valem para os dois); a integração soma à extinção cinza dos volumes a do meio, por canal, no meio da fatia
  (`(1 − e^(−x))/x` pela série com x pequeno: as fatias de centímetros perdiam a precisão do f32), e grava a transmitância
  só dos volumes. A luz ambiente da grade grossa só é calculada com volumes de névoa (a do meio é a Ψms dele).
- _A passagem perto/longe — escolha: a grade longe soma só o trecho além dos froxels, pela diferença da luz espalhada da
  própria tabela_ (`sky_scene_fog_far`): `S = Sfroxels(min(d, a)) + Tvol·(Sa(d) − Sa(min(d, a)))·E`, a transmitância a da
  tabela inteira (`Tvol·Ta(d)`), com `a` o alcance dos froxels no raio (`scene_near_fog.reach`, até 32 km). No fundo (a
  atmosfera inteira na vista do céu), a luz espalhada sai negativa: `−Sa(a)·E` (o trecho que os froxels refazem com as
  sombras finas). Por que a diferença e não a tabela começando onde os froxels acabam: a tabela é lida também pela marcha e
  pelo panorama das nuvens, pelos reflexos e pelo déficit do fundo da R18, sempre desde a câmera; refazê-la desde o fim dos
  froxels mudaria todos esses consumidores, e a diferença de duas leituras da mesma coluna é exatamente a integral dela
  entre os dois pontos (zero em `d = a`: sem degrau; a luz do trecho perto nunca entra duas vezes). A transmitância da
  atmosfera fica inteira com a tabela porque a grade guarda um canal só de extinção (cinza) e a do ar é cromática; dentro
  da grade a integração usa a cromática para atenuar a luz espalhada.
- _As nuvens_: a marcha passa a compor o que está na frente da nuvem pelos meios perto da câmera e a tabela só do fim deles
  até a nuvem (`Sc = L·Tn·Ta(dc) + (1 − Tc)·(Sn + Tn·(Sa(dc) − Sa(alcance)))`), e a composição fica `cor·Tc + Sc` (a névoa
  dos volumes deixou de entrar ali pela frente da nuvem inteira). Sem a atmosfera na grade, o alcance é 0 e a conta é a de
  antes com a névoa dos volumes até a nuvem (`cor·Tc + Sfog·(1 − Tc) + Tfog·Sc` da R13 = `cor·Tc + Sc'`). Com a atmosfera
  nos froxels e a composição antiga, o ar atrás de uma nuvem a menos de 32 km ficaria na frente dela.
- _A penumbra do disco do sol no ar_ (`shadow_virtual_volume`): com um bloqueador entre as quatro profundidades lidas, a
  meia largura da penumbra no ponto é `(z − z_bloqueador)·tan(raio do sol)`; se passa de meio texel, a amostra vai a um
  ponto do disco dela (a sequência do quadro, girada) e o acúmulo temporal dos froxels faz a média (PCSS de uma amostra por
  quadro). Limite: o bloqueador é procurado só no texel do ponto, então do lado aceso a penumbra vai até um texel da borda
  (com o sol a 0,27°, a penumbra a 1 km do bloqueador tem 4,7 m, menor que o texel dos níveis do volume).
- _Proibido e não usado_: desfoque radial em tela, qualquer falso de pós-processo, tabela de resposta por direção da luz.
  A luz e a sombra no ar são calculadas a cada quadro contra o mapa de sombra virtual (da geometria) e o mapa visto do sol
  (das nuvens), as estruturas de aceleração derivadas da geometria de agora.
- _Laços_: a integração tem o laço fixo das fatias; a injeção chama o meio uma vez por froxel; a penumbra, no máximo duas
  leituras do mapa. Nada na CPU além do uniforme.

**Referência f64** (`media/reference/froxelAtmosphere.ts`, teste `froxelAtmosphere.test.ts`): o espelho de uma coluna da
grade (128 fatias exponenciais de 0,1 m até 32 km, a fonte média em 32 pontos por fatia uniformes no índice — o limite do
acúmulo —, a extinção por canal no meio da fatia), a leitura dos froxels e da tabela como a GPU, e a emenda. Turbidez 8 com
névoa seca de 0,2/km a 500 m; o sol a 10°, 30° à direita da vista; uma colina opaca entre o sol e o raio de 2 a 4 km:

- o feixe: a razão da luz que o ar acrescenta na sombra (2,4–3,6 km) e ao sol logo depois (4,4–5,6 km), 0,2848 nos
  froxels contra 0,2817 na integral contínua (1,1 %); na sombra fica 20 % da luz do ar livre (a múltipla);
- a coluna contra a integral contínua de 50 m a 32 km: pior 1,28 % (aos 4,2 km, a fatia com a borda da sombra);
- a emenda com os froxels até 12 km e a tabela além: pior 0,14 % contra a integral até 31,5 km, degrau no fim dos froxels
  0,004 %; contar a luz duas vezes daria 0,0948 contra 0,0531 a 32 km.

**Medidas na GPU** (M4, perfil alto, GPU ocupada por `readyForFrame`, intervalo de quadro; a base é `7a42cbc9` numa
árvore própria, removida depois):

| medida                                                                                                   | base         | R21                                         |
| -------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------- |
| smoke `sky`, `beams` (a luz que o ar na sombra de uma colina deixa de espalhar, contra a referência f64) | —            | 14,00 contra 14,05 nits (0,3 %)             |
| `sky`, `aerial-geometry` (S e T até placas a 2, 10, 30 e 40 km contra a referência)                      | ≤ 5 %        | pior 1,0 % (40 km: além dos froxels)        |
| quadro sem a camada no caso `timing` (só o céu; a atmosfera nos froxels)                                 | 2,50 ms      | 2,83 ms (+0,33)                             |
| `timing` alto (nuvens: com − sem a camada)                                                               | 2,82 ms      | 3,19–3,41 ms (mediana de 5, várias rodadas) |
| `interior-timing` (a camada numa sala fechada)                                                           | 0,378 ms     | 0,03–0,18 ms (o meio não roda)              |
| `fog`, os froxels a 1280 × 720                                                                           | 0,64–0,78 ms | 0,78 ms                                     |
| `clear-sky` (cobertura 0 contra o céu sem camada)                                                        | ≤ 10⁻³       | 0                                           |

Do acréscimo do `timing` alto, medido por partes: a sombra das nuvens nos froxels 0,1 ms (sem ela, 6,08 contra 6,19 ms de
quadro com a camada), a marcha das nuvens com os meios perto da câmera ~0,15 ms; o resto (~0,25 ms) não foi atribuído —
as medidas por passe se sobrepõem nesta GPU, e mover os froxels antes da luz das nuvens ou a redução do alcance para o
pós não mudou o quadro. Em aberto (T074).

Outros smokes: `sky` (todos os casos), `fog` (froxels 0,78 ms, o feixe a 1,4 %), `render`, `virtualTextures`,
`parametricSurfaces` e `globalIllumination` passam — este com o critério "a luz global só soma" até a precisão do alvo
meio-float (2⁻¹⁰ do valor: 8 nits a 10 952 no céu da janela, um passo do meio-float ali, com o ar perto da câmera vindo
dos froxels); `clouds`: tudo menos `timing` alto (acima) e `sunset` 15,5 % (aberto antes, 15,8 %); `fog-in-front` passa
com a captura aos 180 quadros (a marcha das nuvens é refeita quando a névoa entra; 4,5 % aos 60, 0,83 % aos 180).

**Vídeos** (`scratchpad/041-video/rodada15/`): `solposto` 1200 quadros (51,0 dB brilho, 46,4 dB RGB; GPU média 16,6 ms) e
`raios` (céu azul contra o sol, 900 quadros, 51,6/47,9 dB, 13,9 ms); a `tempestade` não foi gravada (o gravador caiu
quando outro smoke começou na mesma GPU e um Chrome ficou em estado E; a série parou pela regra). Variação quadro a
quadro: `raios` maior salto 0,19 nível, nenhuma alternância; `solposto` um salto só, quadros 632 → 633 (imagem 127,8 →
112,9, chão 88 → 67, céu 159 → 148): o sol entra atrás do cúmulo e a luz cai num quadro — na rodada 14 a mesma passagem
levava ~20 quadros (560–580, chão 92 → 70). Em aberto (T075), com a mancha verde-ciano junto ao sol no horizonte aos 13 s
(nova; provável radiância negativa do fundo — a vista do céu menos o trecho perto pela tabela mais os froxels, com o ar
perto da câmera sombreado pelas colinas que a tabela não sombreia). **Contra as fotos**: os feixes não aparecem como nas
fotos — no `raios` há listras diagonais fracas sob o cúmulo; no `solposto`, nenhum feixe visível; o disco do sol aparece
como um ponto através da nuvem espessa no `raios`. A peça (o ar com as sombras finas perto da câmera, a emenda exata, a
decisão da GPU) está medida contra a referência; a intensidade dos feixes na imagem ainda não chega às fotos.

#### R21, rodada 16 — o que impedia os feixes, o disco através da nuvem e a emenda no fundo (2026-11-20)

- _O disco do sol através de um cúmulo espesso_ (`raios`): a marcha das nuvens parava com T < 0,01 e devolvia esse T; o
  disco no teto do alvo (60 000) passava como 600 nits por cima de uma nuvem cinza de algumas centenas — um ponto branco.
  Um cúmulo tem τ ~ 20–50 (T ~ 10⁻⁹ ou menos): na saída antecipada o resto da nuvem conta como opaco (T = 0); a fração
  visível do disco e o excesso dele leem o mesmo T.
- _Os feixes, isolados antes de propor_ (caso novo `beam-air` do smoke `clouds`: a cena da `raios` com e sem nuvens, a
  grade dos froxels lida por coluna):
  - a referência f64 dá o ar à sombra com 2–3 % da luz do ar ao sol nesse caminho, e o feixe (a luz do ar ao sol menos a da
    sombra) como 60–77 % da radiância do pixel a 5–20° do sol — os feixes têm de ser fortes;
  - a sombra das nuvens chega aos froxels: o ar até ~2 km da câmera ganha 2,5–4 % da luz sem nuvens, a razão da
    referência; a resolução não é o gargalo (fatias de 0,2–1 km a 2–10 km, a coluna de froxel ~20 m a 3 km, o texel do mapa
    visto do sol ~25–45 m ali; a penumbra do disco, ~10 m);
  - o que faltava: o ar sob a base das nuvens pesava pouco — a névoa seca da cena (0,08/km, ~39 km de visibilidade) é rala
    para o ar das fotos (úmido, 10–20 km de visibilidade: 0,2–0,4/km), e quase toda a luz do ar vinha das fatias de 2–14
    km, acima da base, aceso. A densidade é parâmetro da cena: `raios` passa a 0,25/km até 1,2 km (~15 km de visibilidade)
    e `solposto` a 0,15/km até 600 m.
- _A mancha verde-ciano junto ao sol no pôr do sol_: no fundo, a emenda tirava da vista do céu o trecho perto pela tabela
  da perspectiva aérea (colunas de ~2° interpoladas) e somava os froxels; a vista do céu e a tabela são duas discretizações
  do mesmo trecho, e ao pôr do sol esse trecho é 85 % do azul do céu no horizonte (0,0017 de 0,0020, referência f64) — a
  diferença entre elas vira canal negativo. Não é arredondamento (a conta mostra a diferença das tabelas, não do meio-float):
  os froxels passam a integrar também a luz do meio sem nenhuma sombra (`U`, ponto `scene_medium_open`, por coluna na
  textura `Froxels.open`) e o fundo fica `vista do céu − déficit além de 32 km − U + S`, sem leitura grossa do trecho perto
  (o déficit da sombra das nuvens só além do alcance: `Sky.aerialShadowFar`). Teste f64 com uma colina na frente do sol
  (o sol a 0,5°, o ar dos primeiros 5 km na sombra dela): a forma nova a 0,23 % da integral exata, a antiga a 0,44 %, nenhum
  canal negativo.
- _O `interior-timing` bimodal_: a troca da camada vira as flags que compõem os pontos de cena só no despacho seguinte, e a
  janela de medida caía nas trocas dos pipelines grandes (o quadro sem a camada de 1,7 a 3,5 ms). O caso espera o motor
  pronto de novo antes de medir: 0,002–0,119 ms (mediana 0,010; a base dava 0,378) — as nuvens não custam nada com o meio
  desligado pela GPU numa sala fechada.

#### R21, rodada 18 — a borda do feixe é a da nuvem; os raios chegando ao chão (2026-11-20)

- _A borda macia do `beam-gap`, isolada_: o caso passa a medir também o ar sozinho (a grade dos froxels lida até a base da
  camada em cada coluna, contra a f64 na direção do centro da coluna) e a largura de cada borda (10–90 % do excesso). Contra
  a f64 do cilindro ideal (a laje cheia de 700–950 m com borda dura), o ar da GPU tinha 3,5 × o excesso e bordas de 30/71 px
  contra 12/36. Mas essa f64 não é a nuvem que a GPU desenha: o estrato tem perfil de altura e erosão, e o vão sai do mapa
  de cobertura (texel de 250 m, bilinear). Com a visibilidade da f64 pela profundidade ótica até o sol no espelho f64 da
  densidade (`cloudModel`) com o mapa de cobertura lido da GPU — a mesma representação; `referenceModel` passa a usar o mapa
  da GPU também com a função de cobertura —, o ar da GPU fica a 2,9 % da f64 no contraste (1,818 contra 1,872) e as bordas a
  30/71 contra 26/69 px. Os froxels (acúmulo, sorteio no froxel), o mapa visto do sol (texel de 50 m, a leitura bilinear
  sorteada) e a penumbra juntos somam ≤ 4 px à borda; ela é a do próprio vão. Com o mapa de cobertura de 4096² (62,5 m), a
  borda de subida cai de 30 para 16 px (a f64, 12) — a causa é a resolução do mapa de cobertura (256 km em 1024 texels),
  não o mapa visto do sol. Critérios novos no caso: contraste do ar a ≤ 15 % da f64 e bordas a ≤ 2 colunas de froxel (8 px)
  além das da f64 — passam. Chaves de ensaio do caso: `el`, `base`, `top`, `r`, `ss`/`ds`, `wx`/`wz`, `texel`, `cov`. Na
  geometria da `raios-chao` (sol a 30°, camada 800–1000 m, vão de 400 m) o ar dá contraste 4,84 contra 5,05 da f64 (4 %).
- _A resolução do mapa de cobertura_ (aberto, T077): um vão autorado de algumas centenas de metros tem ~2–3 texels; a borda
  dele fica com ~250 m de rampa, e os vãos de 400 m perto um do outro se fundem. O caminho é o do mapa visto do sol — níveis
  em volta da câmera por páginas no canal paginado da C2, sem estrutura paralela.
- _A cena `raios-chao`_ (claflow-web): três coisas medidas impediam os feixes chegando ao chão. (1) De 5 m sobre o chão
  plano, as manchas a 0,7–1,5 km ficam a menos de 0,5° abaixo do horizonte e as lombas de ±4 m a 120–250 m as escondem;
  a câmera passa ao alto de um morro (o chão a 74 m, na borda do vale largo do rumo do sol), de onde o vale fica 4–7° abaixo
  do horizonte. (2) A mancha a uma distância d tem o vão a d do meio da linha do sol na camada: com d < r + ~250 m, a borda
  macia do vão chega à linha do sol e o disco aparece através da nuvem; as manchas ficam a ≥ 750 m. (3) A luz espalhada pela
  névoa cai com o ângulo ao sol (a fase de Mie a 10° é ~4–5 × a de 30°): os feixes para o lado (a ~30° do sol) existem no
  ar mas quase não se destacam da base da camada; os fortes são os das manchas perto do rumo do sol. Os vãos de 720–800 m
  numa camada de 200 m (a lente acesa de 2r − 346 m) ficam a ≥ 900 m um do outro. Quadro conferido: contraste linear
  dentro/fora dos feixes 3,2 junto aos vãos e 2,1 junto ao chão; o vale aceso a ~2 × a sombra.
- _Vídeos_ (`scratchpad/041-video/rodada18/`): `raios-chao` 960 quadros, 9,7 MB, 54,0 dB, GPU média 14,3 ms; maior salto da
  região dos feixes 0,21 nível, do vale 0,54, nenhuma alternância. `solposto` 1200 quadros, 19,2 MB, 51,2 dB: com o recorte
  do histórico das nuvens pela reta até o centro da caixa (alteração na árvore, não registrada), a mancha ciano/magenta na
  borda de uma nuvem pequena junto ao sol no horizonte segue nos quadros 700 e 780 — o recorte por canal não é a causa
  (ou não é a única); os casos `sunset` (15,5 %, como antes) e `backlit` (5,6 %) não mudam com ele. Aberto em T075.

#### R21, rodada 19 — o mapa de cobertura em níveis em volta da câmera; os vãos procedurais (2026-11-20)

- _O mapa de cobertura em níveis_ (T077; `cloud_coverage_pages.wgsl`, `cloud_coverage_draw.wgsl`, referência
  `reference/cloudCoverageLevels.ts`): o quadrado único de 1024² texels de 250 m (256 km), refeito inteiro a cada quadro,
  virou um mapa de recortes no referencial do vento, como o mapa visto do sol — níveis de 512² texels em volta da câmera
  (31,25 m no nível 0 do perfil alto, cada nível dobra; 62,5 m no médio, 125 m no baixo), páginas de 16², janela de 32²
  páginas presa à página, endereço toroidal. O atlas é uma textura em camadas (uma por nível) lida com o endereço que se
  repete: o texel global `i` no texel `i mod 512`, e o par bilinear do outro lado da costura é o vizinho no toro — uma
  amostra só, sem conta de página. Série por páginas da C2 (o alvo e o registro de cada página: a página global, o quadro,
  a assinatura, a janela), a escolha do quadro num grupo (as somas de prefixos de `page_alloc`) e o desenho pela mesma
  função de cobertura (ou o tempo, ou os campos da camada) com orçamento constante (128/96/64 páginas): obrigatórias no
  quadro a página que entra na janela, a de outra assinatura e a da série que recomeçou; com o conteúdo que muda no tempo
  (a função de cobertura, o tempo), as demais pela idade (oitavas de quadros × √2 por nível mais fino); sem isso, a
  página desenhada não muda. Nenhuma estrutura nova além do descritor `coverage` refeito, do registro e da lista do
  quadro; o mapa visto do sol não mudou.
- _A passagem entre níveis com uma leitura só_: com a mistura na leitura (os 30 %, depois 15 % e 5 % de fora com duas
  leituras), a marcha e os caminhos do cache custavam ~0,3 ms a mais — o código da segunda leitura, não a frequência dela
  (medido: sem ela, 3,26 ms; com a faixa de 5 %, 3,56). A mistura passou ao desenho: o nível `k` cobre o ponto até 255
  texels do centro da janela (Chebyshev; o centro é o canto da página da câmera, a janela de cada nível sai da do nível 0
  por deslocamento de bits) e o anel de páginas de fora guarda o valor levado à bilinear do nível seguinte (`smoothstep`
  de 240 a 255 texels): na borda, o nível `k` vale o que o `k + 1` lê ali (diferença < 10⁻⁴ no teste). A página do anel é
  refeita quando a janela anda.
- _O alcance do último nível_: com 5 níveis o último cobria 119,5 km dos 128 do mapa antigo, e as amostras entre os dois
  caíam no campo procedural (~4 × o custo de uma leitura): a marcha +0,2 ms. Os níveis vão até o último cobrir a metade do
  lado do mapa: 6 no alto (1000 m, até 239 km), 5 no médio, 4 no baixo. Com isso a marcha deixou de avaliar o campo além do
  mapa antigo também: 2,23 → 1,55 ms.
- _Referência f64_ (`cloudCoverageLevels.test.ts`): o volume desenhado página a página e lido com o filtro do hardware é a
  bilinear dos texels globais (< 10⁻¹²); cada página da janela tem uma página física só; o nível escolhido sempre cobre o
  ponto; o campo liso pela leitura em níveis fica dentro do erro da bilinear do nível usado, sem salto maior que o do
  campo em 5 m dentro do mapa (a costura com o campo no ponto além do último nível é a de antes); um vão de 80 m a 200 m da
  câmera é resolvido (0,15 no centro; o mapa de 250 m dava > 0,9), borda de 10–90 % ≤ 1,3 texel.

| medida (M4, perfil alto, GPU ocupada, `readyForFrame`)       | base (`548a0c67`, mesma sessão) | rodada 19                 |
| ------------------------------------------------------------ | ------------------------------- | ------------------------- |
| o mapa de cobertura (escolha + desenho, parado)              | 0,160 ms                        | 0,044 + 0,005 ms          |
| `timing` alto (nuvens: com − sem a camada, mediana de 5)     | 3,23 ms (3,03–3,37)             | 2,66 ms (2,63–2,71)       |
| a marcha / os caminhos do cache                              | 2,23 / 1,33 ms                  | 1,55 / 1,46 ms            |
| `beam-gap`: bordas do ar contra a f64 exata (o vão sem mapa) | 30/71 contra 12/36 px (rod. 18) | 9/77 contra 14/74 (+3 px) |
| `beam-gap`: contraste do ar contra a f64 com a mesma nuvem   | 2,9 %                           | 0,5 %                     |

O `beam-gap` ganhou a f64 exata (a densidade com a função de cobertura no ponto, sem mapa) e o critério de ≤ 4 px além
dela. Smokes rodados (só os casos da cobertura): `coverage-map` (6 níveis, pior 0/255), `beam-gap`, `timing` alto,
`pressure-wind`, `front`, `noon`, `types`, `far-cloud` — passam.

- _A `raios-chao` sem furo desenhado_ (claflow-web): a cobertura 0,78 num estratocúmulo (tipo 0,25) de 750–900 m, a forma
  em 900 m e o detalhe em 220 m (os vãos de tamanhos e bordas variados saem do ruído de Perlin-Worley e da erosão), extinção
  0,6/m, vento (2,5; −1,5) m/s, o sol a 20°, a névoa seca de 0,3/km. A regra do vão: o raio do sol cruza a camada
  deslocando-se 150/tan 20° = 412 m, então só os vãos com raio acima de ~206 m deixam o sol passar direto (a lente acesa
  tem 2r − 412 m: os pouco maiores dão os feixes estreitos); os de 50–400 m só passam luz pelas bordas ralas (os feixes
  difusos) — com o sol a 15–20° e a camada de 150 m, os vãos pequenos não fazem feixe direto. A posição da câmera saiu de
  uma vista do lado do sol para a origem (o que se vê do chão pelos vãos é o chão aceso): a câmera a 6 m em (−257, 834),
  15° ao lado do azimute do sol, levantada 8°, na sombra, com as manchas acesas a ~100–300 m na frente dela.
- _Vídeo_ (`scratchpad/041-video/rodada19/raios-chao.mp4`): 960 quadros, 9,0 MB, 53,2 dB brilho, 49,4 dB RGB, GPU média
  15,6 ms; maior salto do brilho médio 0,12 nível (quadro 348), nenhuma alternância. Vê-se a base da camada com vãos
  irregulares, feixes estreitos descendo à esquerda do centro até o horizonte, o céu azul pelos vãos à direita e as
  manchas douradas na grama em primeiro plano, ao lado da sombra; o disco do sol aparece como um ponto pela borda rala de
  um vão. Em aberto: os feixes perto da câmera (o ar entre ela e as manchas a 100–300 m) ficam fracos contra a base clara
  junto ao sol — o contraste forte é o dos feixes ao horizonte.

#### R21, rodada 20 — a faixa ciano/magenta junto ao sol; a `raios-chao` com a camada rasa (2026-11-20)

- _A faixa ciano/magenta na borda das nuvens contra o clarão do sol baixo_ (T075; `solposto`, quadros 700 e 780),
  isolada no quadro exato (a cena pelo gravador com passo fixo, os alvos lidos da GPU, sem vídeo): a nuvem aumentada
  (`CloudLayer.view`) e o alvo de ¼ (`march`) são laranjas e lisos na borda; a faixa está no fundo visto pelo vão ralo
  (T 0,96–0,99), e igual sem a resolução temporal (`aa=off`) — não é a reconstrução, o aumento, a composição, o excesso do
  disco nem o bloom. O fundo com os froxels é `vista do céu − U + S` (rodada 16) e, a 7° do sol a 11,7°, as duas
  parcelas grandes passavam do teto: a vista do céu saía limitada a 60 000 por canal em `sky_background` e a luz do trecho
  perto sem sombra (`Froxels.open`, rgba16float) saturava em 65 504 — o vermelho de verdade é 98 500 (lido depois da
  correção). A diferença de duas parcelas cortadas deixava cada canal errado de um jeito: na linha que atravessa a faixa,
  o fundo ia de (3292, 828, 5676) (magenta) a (2718, 3750, 5450) (ciano) e (−1291, 5485, 4114) (vermelho negativo) em
  ~80 px — a nuvem em volta, (12 808, 8768, 4944).
- _A correção, na causa_: (1) a luz integrada dos froxels (`scatter` e `open`) é gravada em unidades de
  `FROXEL_RADIANCE_UNIT` = 64 (só o expoente muda: a precisão relativa do meio-float é a mesma; o teto vai a ~4 × 10⁶,
  acima da fase de frente do Mie com g = 0,8 × a iluminância do sol; quem lê — `froxel_fog`, `scene_near_fog` e os
  smokes `clouds` e `fog` — multiplica de volta); (2) o céu em volta do disco não é limitado em `sky_background` (o
  disco continua no teto, o excesso vai ao `SkyOverflowFlow` como antes): o fundo limita a soma em `forward_background`
  (`BACKGROUND_MAX` = 60 000, o teto de antes). No mesmo quadro o fundo pelo vão fica (11 912, 8878, 5641), liso, e a
  menor cor da cena é positiva; a faixa some nos quadros 700 e 780.
- _Smokes_ (só os casos ligados): `clouds` `beam-air`, `beam-gap` (o ar a 0,5 % da f64 com a mesma nuvem, bordas +3 px
  da exata, como na rodada 19), `clear-sky` (0), `fog-in-front`, `backlit` (5,6 %), `sun-low` — passam; `sunset` segue
  em 15,9 % (15,5 % na base desde a rodada 16, o pico da referência 32,0 → 32,2 nits: a mesma região, aberto); `sky`
  inteiro passa (`beams` a 0,1 % da referência, `crepuscular`); `fog` `beam` passa (erro médio 1,5 %, pior 2,9 %).
- _A `raios-chao` com a camada rasa_ (uma tentativa, só configuração; não registrada, o diff em
  `scratchpad/r20-raios-chao.diff`): camada de 80 m (720–800 m), cobertura 0,6 (0,72 no primeiro mapa), tipo 0,15, forma
  700 m, detalhe 160 m, densidade 0,6, sol a 20°, névoa seca 0,4/km até 1 km; o lugar da câmera escolhido por uma vista de
  cima do chão (a 640 m, abaixo da base) com o relevo da cena: (−160, 830), na sombra pelo mapa, manchas a 50–300 m no
  rumo de 10–15° do sol. O quadro de prova não tem feixes perto da câmera: o disco do sol aparece direto (a câmera está ao
  sol) e o céu em volta é um véu claro. Medidas: no mapa visto de cima, o chão "aceso" contra o "à sombra" fica em 1,35 ×
  (sRGB do verde, ~1,9 × linear) — com uma camada de 80 m a cobertura 0,6–0,72 dá sobretudo nuvem rala, não vãos limpos
  com sombra escura; no quadro, a variação fina do ar (8 px contra a média de 81 px, por linha entre o chão e a base) é
  0,8–3,3 % rms, e o chão perto, p90/p10 = 1,2–1,5 linear. A causa: sem sombra escura sob a camada não há feixe (o feixe
  é a luz do ar ao sol menos a da sombra); a camada rasa com o perfil do estrato e a erosão fica translúcida nas bordas, e
  a luz que passa pela nuvem rala ilumina o ar todo. Não gravado.

## Fontes

- Schneider & Vos, "The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn", SIGGRAPH 2015 Advances; Schneider,
  "Nubis: Authoring Real-Time Volumetric Cloudscapes with the Decima Engine", SIGGRAPH 2017 Advances.
- Hillaire, "Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite", SIGGRAPH 2016 PBS course.
- Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique", EGSR 2020
  ([artigo](https://diglib7.eg.org/bitstream/handle/10.1111/cgf14050/v39i4pp013-022.pdf),
  [slides](https://blog.selfshadow.com/publications/s2020-shading-course/hillaire/s2020_pbs_hillaire_slides.pdf)).
- Wrenninge, Kulla & Lundqvist, "Oz: The Great and Volumetric", SIGGRAPH 2013 Talks.
- Jendersie & d'Eon, "An Approximate Mie Scattering Function for Fog and Cloud Rendering", SIGGRAPH 2023 Talks
  ([artigo](https://research.nvidia.com/labs/rtr/approximate-mie/publications/approximate-mie.pdf),
  [suplemento](https://research.nvidia.com/labs/rtr/approximate-mie/publications/approximate-mie-supplemental.pdf)).
- Novák et al., "Monte Carlo Methods for Physically Based Volume Rendering", SIGGRAPH 2018 Course.
- Unreal Engine, "Volumetric Cloud Component"
  ([documentação](https://dev.epicgames.com/documentation/unreal-engine/volumetric-cloud-component-in-unreal-engine)):
  marcha em resolução reduzida com reconstrução temporal, _Beer shadow map_, captura do céu com nuvens.
- Johnson, Rickenbach, Rutledge, Ciesielski & Schubert, "Trimodal Characteristics of Tropical Convection", J. Climate 12,
  1999 (os rasos, os congestos no congelamento e os profundos) (R19).
- Plank, "The Size Distribution of Cumulus Clouds in Representative Florida Populations", J. Appl. Meteor. 8, 1969 (a
  largura dos cúmulos da ordem da profundidade) (R19).
- Bohren, "Multiple scattering of light and some of its observable consequences", Am. J. Phys. 55, 1987 (a transmitância
  difusa de uma camada sem absorção, duas correntes) (R19).
- Schied et al., "Gradient Estimation for Real-Time Adaptive Temporal Filtering", HPG 2018 (o gradiente temporal) (R19).
- Holton & Hakim, _An Introduction to Dynamic Meteorology_, 5.ª ed., Academic Press, 2013 (§2.4 o vento
  geostrófico, §3.2 o vento gradiente e o teto do anticiclone, cap. 8 a camada de Ekman e o bombeamento) (R19).
- Guldberg & Mohn, _Études sur les mouvements de l'atmosphère_, 1876 (o equilíbrio com atrito linear) (R19).
- Charney & Eliassen, "On the growth of the hurricane depression", _J. Atmos. Sci._ 21, 1964; Kuo, "Further studies of
  the parameterization of the influence of cumulus convection on large-scale flow", _J. Atmos. Sci._ 31, 1974 (a
  convergência como gatilho da convecção) (R19).
- Okubo, "Horizontal dispersion of floatable particles in the vicinity of velocity singularities such as convergences",
  _Deep-Sea Research_ 17, 1970; Weiss, "The dynamics of enstrophy transfer in two-dimensional hydrodynamics", _Physica D_
  48, 1991 (o parâmetro de Okubo–Weiss) (R19).
- Petterssen, "Contribution to the theory of frontogenesis", _Geofysiske Publikasjoner_ 11, 1936 (a deformação e as
  frentes) (R19).
- Gray, "Global view of the origin of tropical disturbances and storms", _Mon. Wea. Rev._ 96, 1968 (os ciclones longe
  do equador) (R19).
- Houze, _Cloud Dynamics_, 2.ª ed., Academic Press, 2014 (cap. 8, o cúmulo-nimbo e a bigorna na tropopausa) (R19).
- Schneider, "Nubis, Evolved: Real-Time Volumetric Clouds for Skies, Environments, and VFX", SIGGRAPH 2022 Advances;
  Schneider, "Nubis³: Methods (and madness) to model and render immersive real-time voxel-based clouds", SIGGRAPH 2023
  Advances (as tempestades por volumes modelados) (R19).

## Implementação — decisões e medidas (2026-11-17)

Registradas durante a implementação (as tarefas citam os números; os smokes os repetem).

### R1 — o cone de luz

O cone de Schneider com crescimento × 2 (trechos até 16 passos base) dava, pelo ponto médio dos trechos longos que
cruzam a borda da nuvem, −3 % de luz na mediana contra a referência f64 do mesmo modelo (`noon`; com o mesmo cone na
referência, a GPU ficava a 1 %). Crescimento × 1,5 (0,5·1,5ⁱ passos base, i = 0…5): o mapa visto do sol cobre o resto.

### R3 — o contraste do Perlin-Worley

O fBm de gradiente normalizado tem σ ≈ 0,2: com ele em [−1, 1] → [0, 1], a forma base fica em [0,72; 0,93] (5–95 %,
medido na referência) e a remapeação da cobertura não esculpe nada — as nuvens saíam como lâminas lisas. O grafo padrão
leva ±0,5 a [0, 1].

### R4 — a cobertura é a fração do céu coberta

Com um número global, a densidade não varia no plano (no modelo de Schneider a variação vem do mapa de tempo): a
cobertura medida saía 0 % ou 100 %. Sem função de cobertura, a cobertura local é `L = g(c, tipo) + 0,4·(u − 0,5)`: `u` um
fBm de gradiente 2D (3 oitavas, células de 8 km) uniformizado pela normal acumulada aproximada (σ = 0,2014, medido; a
uniformização dá 21,3 / 50,0 / 78,6 % de área acima do limiar para 20 / 50 / 80 %), e `g` a inversa da área coberta
medida na referência f64 com os volumes completos (a fração das colunas com transmitância < 0,5):

| g                       | 0   | 0,1   | 0,2   | 0,3   | 0,4   | 0,5   | 0,6   | 0,7   |
| ----------------------- | --- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| área, cúmulo (tipo 0,5) | 0   | 0,016 | 0,142 | 0,370 | 0,604 | 0,834 | 0,975 | 0,999 |
| área, estrato (tipo 0)  | 0   | 0,004 | 0,063 | 0,242 | 0,476 | 0,720 | 0,914 | 0,989 |

Medido na GPU (smoke `clouds`, `coverage`, vista de cima a 60 km): 0 / 19,2 / 49,3 / 80,4 / 100 % para 0 / 0,2 / 0,5 /
0,8 / 1 (SC-003).

### R8 — calibração das oitavas (T023)

Contra o rastreamento delta (`octaves.calibration.test.ts`: cilindro de 1 km de raio, 1500–2500 m, σt 0,02/m, albedo
0,99, J&dE a 20 µm, só o sol; vistas de baixo, perto da borda, de lado e contra o sol, com o sol a 60° e a 10°), a melhor
combinação na grade (N 2–8, a 0,15–0,65, b 0,7–1, c 0,5–0,9) é **N = 3, a = 0,35, b = 0,95, c = 0,6**, com erro médio de
**31,9 %**: −40 % de baixo e −52 % de lado com o sol a 60°, −67 % de baixo com o sol a 10°, +27 % de lado com o sol a 10°;
na borda contra o sol, 0,7–2 %. O modelo de oitavas não reproduz a difusão através de nuvem espessa: o critério de 5 % da
SC-001 contra o transporte completo **não fecha** com ele (em aberto, PENDENCIAS). A imagem do motor fica a ≤ 4 % (luz) e
0,009 (transmitância) do mesmo modelo calculado em f64 com cobertura total, e a 7,5 % / 0,030 com cobertura 0,5. Os
perfis médio e baixo também usam 3 oitavas (o custo é o da fase e da exponencial; com 2 o erro cresce).

### R11 — o mapa visto do sol por quartos

A extinção média do trecho inteiro (o Beer shadow map de Hillaire 2016) superestima τ onde a coluna tem vazios e no
topo dos cúmulos (125 % a 300 m do topo, no teste de unidade); escurecia a nuvem 20 % (mediana 0,80 contra a
referência). O texel guarda τ acumulado ao fim de cada quarto do trecho da casca ao longo do sol (os nós são da
geometria, recalculados na leitura), com a erosão; linear entre os nós. Mapa inteiro a cada quadro (sem série), 384² e
32 passos no alto (512² × 48 custava 1,4–2,0 ms medidos; 384² × 32, 0,8 ms) — a precisão do `noon` não mudou.

### R13 — a composição

Dois passes de tela cheia com mistura do hardware (produto por canal e soma), que descartam o pixel sem efeito. O
perfilador por passe conta a sobreposição de passes seguidos no TBDR (a composição aparece com 1,2–3,9 ms logo depois da
marcha); a medida é o tempo do quadro com e sem a camada.

### R17 — tempos medidos (M4, 1280 × 720)

Tempo do quadro com nuvens menos o do mesmo céu sem a camada (smoke `clouds`, `timing`; a GPU é dividida com o
navegador e a primeira cena da rodada é mais lenta): alto 2,3–2,8 ms, médio 0,8–1,6 ms, baixo 0,6 ms (2,2–2,4 ms na
primeira cena). Por passe no alto: tabela aérea 0,07–0,12, cobertura 0,03, ambiente 0,05, mapa visto do sol 0,8, panorama
0,15–0,19, marcha 0,75–0,82, reconstrução 0,07, aumento 0,23–0,30 ms.

### Retomada — o excesso de luz com o sol baixo (T020/T024/T026), isolado termo a termo

`sunset` (sol a 4°): a GPU sai 27 % acima da referência f64 do mesmo modelo na mediana (sol de costas: 10 %; a 20°,
mediana 0,984 com extremos 0,44/1,57; a 60°, 0,983). Descartados por medida:

- τ até o sol: com o cone da GPU e o resto exato, a referência fica igual (1,270); com o mapa visto do sol da própria
  GPU lido como o shader lê, também (1,278); o mapa no chão acerta a 0,011 com o sol a 4°;
- a tabela de transmitância do céu: ≤ 1,2 % da integral f64 a 1°, ≤ 0,5 % a 4°, nas altitudes da camada;
- a perspectiva aérea além de 32 km: todas as nuvens do caso estão mais perto;
- o termo ambiente: × 1,3 na referência leva a mediana de 1,27 a 1,21 (é ~¼ da luz).
  Sobra o termo do sol na marcha da câmera com τ grande (as oitavas `e^(−aⁱτ)` amplificam qualquer diferença de τ ao
  longo do raio da câmera); os diagnósticos ficam no smoke (`?el=`, `?az=`, `?cone=1`, `?amb=`).

  **Causa achada (2026-11-17), amostra a amostra num raio** (os termos do shader exportados num buffer, contra
  `marchCloud`): a marcha lia o mapa como T e refazia `τ = −log(max(T, 1e−6))` — τ saturava em 13,8, contra 30–50 com o
  sol a 4°, e `e^(−0,35²·13,8)` deixava passar o sol (o diagnóstico `map=1` lia o mapa em f64, sem a saturação). Com τ
  lido direto, sobrou o mapa: 4 nós lineares num trecho de ~35 km erravam τ em dezenas e as colunas além de ±16 km saíam
  da borda. Na emulação f64 (luz do sol por região contra τ exato, a 4°): 4 nós lineares até 50 %; 16 nós lineares até
  14 %; 16 nós com o pedaço até o nó marchado pelo receptor ≤ 2,2 % (com a altura do texel ≤ ~80 m: a 125 m, 10 %).
  Desenho: volume 4 × rgba16f (16 nós), 64 passos por coluna, coordenadas do plano do sol `x0·sinh(2a·k)` (perto da
  câmera ~115 × 60–140 m, até ±200 km). A perspectiva aérea além de 32 km passou a ser integrada (a fonte uniforme
  errava 10 % a 100 km na direção do sol baixo). Na reconstrução, o gradiente temporal filtrado nos 3 × 3 blocos (A-SVGF)
  no lugar do de uma amostra. O smoke compara a média de 48 quadros com 32 × 32 raios por região. Resultado na T024.

### Retomada — espalhamento múltiplo (T023)

Nas 18 vistas (sol a 60°, 30° e 10°, seis vistas cada) contra o rastreamento delta: oitavas 47,1 %; difusão local
`e^(−τ)p(θ) + M(1 − e^(−τ))(1 + kτ)^(−p) p_HG(θ)` na melhor grade, 41,2 %. Nenhuma função local do τ até o sol
representa a luz que entra pelas laterais de uma nuvem espessa: falta o transporte não local (uma grade de propagação
da luz na camada, iterada na GPU pela série 037). Em aberto.

### R8 (revisto) — transporte não local: o cache de espalhamento por sondas (T023, 2026-11-17)

**O que as engines e os artigos fazem** (lido para esta decisão):

- _Oitavas_ (Wrenninge 2013; Hillaire 2016, Frostbite; Hillaire 2020 e o componente Volumetric Cloud do UE5): função local
  do τ até o sol no ponto, com o ambiente por altura. Barato, sem ruído, mas não vê a luz que entra pelas laterais.
- _Nubis_ (Schneider 2015/2017; "Nubis, Evolved" 2022; "Nubis³" 2023): oitavas/aproximações locais e, nas nuvens em
  voxels, o perfil dimensional (distância à borda) como termo de probabilidade de espalhamento — também local.
- _Bouthors et al. 2008_: transferência de placa pré-calculada por Monte Carlo e o ponto coletor na superfície — não local,
  mas exige a superfície (malha/hipertextura) da nuvem.
- _Difusão_ (aproximação de difusão; LPV/grade de propagação; Koerner et al. 2014, difusão com limitador de fluxo,
  "Flux-Limited Diffusion for Multiple Scattering in Participating Media"): não local, determinística e barata por
  iteração, mas a radiância fica em P1 (linear na direção).
- _Radiance cascades_ e _froxels_ de propagação: estruturas de cache em 2D/tela; em 3D volumétrico não há resultado
  publicado para meios espessos com fase de Mie.
- _Cache de radiância por sondas com caminhos_ (o que as sondas da GI da 033/034 já fazem para superfícies): o transporte
  completo por Monte Carlo, amortizado no tempo e interpolado no espaço.

**Medido antes de escolher** (cilindro da calibração, 18 vistas; verdade por rastreamento delta):

1. A verdade antiga (600 caminhos com a fase completa) tinha erro padrão de 25–55 % por vista: o pico de Mie (HG com
   g = 0,9946, metade da fase) faz o próximo evento ao sol explodir quando a direção do caminho cai a < 0,5° do sol. Os
   47,1 % e 41,2 % registrados antes eram em boa parte ruído. A verdade nova trata o núcleo do pico (θ < 2°, 42,9 % da fase
   a 20 µm) como transmitido (δ-M, Wiscombe 1977: desvio de ~0,3°, ~5 m por km) e usa 100 000 caminhos: erro padrão
   0,8–2,5 % (`__tests__/fixtures/cloud-calibration-truth.json`, gerado por `scatter.truth.test.ts`).
2. Contra essa verdade: oitavas de produção (N 3, a 0,35, b 0,95, c 0,6) **50,9 %** de erro médio (de −89 % a −1 %; a
   melhor da grade, 37,6 %); difusão com limitador de fluxo e δ-Eddington (grade de 100 m, protótipo f64) **38,8–48,3 %**,
   com −62 a −97 % nas vistas para a frente (de baixo, perto da borda, contra o sol): a radiância de uma nuvem de g ≈ 0,8 é
   de frente e P1 não a representa; sondas com harmônicos zonais até a ordem 1/2/3/8: 27,4/12,6/10,2/8,4 %; sondas com a
   luz espalhada **na direção da câmera** (o caminho começa pela fase em volta dela): **3,1 %**.
3. Na cena do `noon` (a imagem física com sol, céu e chão por rastreamento delta, 64 × 36, 512 caminhos), a distribuição
   da luz das nuvens das oitavas já é a do traçador (p5 8940 contra 9017 nits; p95/p5 3,21 contra 3,15), embora pixel a
   pixel a razão vá de 0,69 a 1,42: **a base não sai clara por causa das oitavas**; o contraste baixo da imagem vem da
   exposição e da curva de tom (ver "Contraste", abaixo).

**Decisão**: cache de espalhamento por sondas (`CloudLayer.scatter`, série da 037; `cloud_scatter.wgsl` no
`CloudLightFlow`, fase `shadow`, entre o mapa visto do sol e o panorama). Grade 160 × 32 × 160 no alto (128 × 24 × 128,
96 × 16 × 96), no plano centrada na câmera (encaixe de 4 km) e deformada por `2000·sinh(asinh(32)·a)` (sondas de ~104 m
perto, ~190 m a 3 km, ~330 m a 6 km, até ±64 km), na altitude uniforme na camada. Por quadro, um grupo de sondas em cada 8
caminha (os outros carregam a fatia anterior): se houver nuvem na sonda ou numa das seis vizinhas, um caminho de
rastreamento delta no meio com o núcleo truncado, primeira direção pela fase completa em volta da direção da câmera (o
núcleo com a chance `fc`, como direção da câmera), próximo evento ao sol pelo mapa visto do sol, o céu ao sair por cima, o
chão com a sombra das nuvens ao sair por baixo; tetos de 256 passos e 48 colisões (a 24 colisões a luz cai 3–4 %, a 48 é
igual à de 1024 a 0,1 %). A série guarda a soma (em unidades da iluminância do sol) e a contagem, janela de 64 caminhos;
recomeça no corte, quando a série não vale e quando a câmera troca o encaixe do centro (a posição anterior vem da
`previousView`). Na marcha: `σs·(E·e^(−(1 − ω·fc)τ)·p(θ) + J)`, o feixe do sol com o pico transmitido (sem esse termo a luz
que o núcleo desvia menos de 2° não chega a ninguém: −8 a −18 % nas nuvens finas, medido pixel a pixel) e `J` a luz das
sondas interpolada, misturada às oitavas ≥ 1 e ao ambiente local com peso de 16 caminhos (a sonda nova dá as oitavas; fora
da grade, as oitavas). O sol que anda esquece a média na proporção do ângulo (`e^(−Δ/0,25°)` por quadro, pela série de um
texel `scatterSun`): com o sol parado o cache converge; com o sol descendo depressa (os vídeos, 0,02–0,05° por quadro) a
imagem fica nas oitavas — com 1° de memória, poucos caminhos por sonda (desvio de um caminho 2,7 ao meio dia e 5,4 com o
sol a 10°, medido) davam manchas na nuvem do crepúsculo. Nada na CPU: o empacotamento só calcula a truncagem pelo diâmetro (`cloudPhaseTruncation`).

**Calibração** (`scatter.calibration.{60,30,10}.test.ts`, a referência f64 do mesmo esquema, `cloudScatter.ts`, 1500
caminhos por sonda, sondas a 100 m): erro médio **3,7 % (60°), 2,1 % (30°), 4,1 % (10°)** — 3,3 % nas 18 vistas, contra
50,9 % das oitavas; 14 das 18 vistas a ≤ 5 %. Fora: 60° de baixo perto da borda +11,2 %, contra o sol +7,9 % (30°) e
+8,5 % (10°), 10° na perpendicular +6,5 %. A causa é a interpolação das sondas na parede dura do cilindro (a densidade
salta de 0 a 1): com sondas a 50 m a vista da borda vai a +2,2 % e a contra o sol a 10° a +4,5 % (medido). **Critério
ajustado** (racional AAA): a média das vistas a ≤ 5 % e cada vista a ≤ 15 %. Para ≤ 5 % por vista seriam sondas de 50 m perto da
câmera — 8 × as sondas e os caminhos do cache, no mesmo orçamento —, e a nuvem real não tem parede dura (a densidade sobe
em 100–300 m pela erosão e pelo perfil). Na GPU: as sondas convergidas contra caminhos f64 nas mesmas sondas (smoke
`clouds`, `scatter-cache`, 120 sondas, a soma) **−4,0 %**; a marcha com as sondas contra a referência que lê as mesmas
sondas: `noon` 2,3 %, `sunset` 4,0 %, `backlit` 3,2 % (borda/centro 0,997), `types` 2,4/2,7/2,5 %, `far-cloud` 3,5 %. A
imagem da GPU do `noon` contra a imagem física (rastreamento delta da cena inteira, 25 regiões de nuvem): 9,0 % na média
(as oitavas: 12,8 %; pior região 17 % contra 33 %), a GPU 7 % abaixo na mediana — a perspectiva aérea da GPU (−2 a −3 %,
o traçador não tem atmosfera), o peso das oitavas que fica (8 de 72 caminhos) e o mapa visto do sol linear entre os nós
no próximo evento (−4 % nas sondas). O tempo do passe fica para a T035.

### Contraste das nuvens (a nuvem "achatada", 2026-11-17)

Medido isolando cada termo, contra a imagem física (rastreamento delta da cena do `noon`, 64 × 36, com sol, céu e chão):

- **HDR antes da curva**: p95/p5 da luminância das nuvens — oitavas 3,21, traçador 3,15, GPU com as sondas 2,75; parte
  alta/base (pelo primeiro ponto denso no raio) — oitavas 1,36, traçador 1,08, GPU 1,06. As oitavas não clareavam a base:
  exageravam a parte alta; o contraste físico desta nuvem vista de baixo é pequeno.
- **Curva de tom e exposição**: o mesmo HDR do traçador sai 1,15 com AgX a −13 EV e 1,28 a −14,5. A exposição −13 das
  cenas fica 1,5 EV acima da de um fotômetro de luz incidente ao meio dia (EV100 15, a regra do "sunny 16": −14,47 pela
  iluminância horizontal da atmosfera f64): as nuvens caem no ombro da curva. **Fora da física; corrigido** nas cenas do
  claflow-web (a exposição pelo fotômetro em função da elevação do sol; abaixo de 8°, 15 % da queda, como o fotógrafo que
  expõe para o céu).
- **A espessura ótica**: a extinção padrão (0,04/m na densidade 1, ~0,028/m na densidade média da forma) é a de uma nuvem
  fina; um cúmulo de ~0,4 g/m³ com gotículas de 20 µm tem `3·LWC/(2ρr)` ≈ 0,06/m. Com 0,08 na densidade 1, o traçador dá
  p95/p5 4,07 (contra 3,15). As cenas de cúmulos do claflow-web passam a 0,08 (o padrão da camada não muda: a cobertura
  medida da SC-003 foi calibrada com ele).
- **Ambiente** (`cloud_ambient`) e **"powder"**: o ambiente local é a estimativa a que as sondas se sobrepõem (as sondas
  levam o céu e o chão com a sombra das nuvens pelos caminhos); o motor não tem termo "powder" e o traçador não pede
  um (a borda escura vem do transporte).

Resultado na cena `nuvens` (quadros do vídeo, pixels de nuvem acima do horizonte): p95/p5 **1,17–1,23 → 1,38–1,46**, p5
0,79 → 0,56 (a base cinza), com a mesma curva AgX.

### Retomada — o pôr do sol do claflow-web (2026-11-17)

- **A cor**: o caso `colors` do smoke `sky` mede o céu perto do sol e no zênite e a luz do sol no chão e a 3 km com o
  sol a 60°, 20° e 4° contra a referência f64: razão vermelho/azul do céu perto do sol 0,421 → 0,600 → 2,069 (ref 0,423 →
  0,603 → 2,089), do sol no chão 1,27 → 1,81 → 12,0 (ref 1,27 → 1,81 → 12,0), a 3 km 1,17 → 1,49 → 5,38 (ref idem a
  ≤ 0,4 %). A física estava certa; a cena `pordosol` olhava de costas para o sol (azimute (0,8; 0,6), câmera para
  (−1000, 200, −600)): passou a olhar para ele.
- **O chão que pisca**: o caso `sun-sweep` do smoke `clouds` desce o sol de 12° a 1° no azimute da cena e compara a
  transmitância até o sol no chão da câmera, pelo mapa, com a integral da referência: o sol fica atrás das nuvens até
  6,1° (ref 6,0°), passa por uma abertura e some de novo a 4,3° (ref 4,3°); diferença média 0,016. Os degraus do vídeo
  (quadros ~257 e ~331) são o sol entrando e saindo da abertura — na cena o sol desce 11° em 8 s, e 0,1° são 4 quadros.

### Retomada — a nuvem achatada (2026-11-17)

Medido na referência f64 (cobertura 0,5, tipo 0,5, camada de 1500 a 4000 m, 400 colunas, densidade > 0,02): a forma
de base tem pouca variância (o Perlin-Worley remapeado fica em ~0,64–0,9), e a borda da nuvem segue a curva de nível
do perfil de altura: base mediana 1956 m, topo mediano 3106 m, 10–90 % dos topos entre 2806 e 3219 m (413 m), densidade
quase constante dentro (0,70–0,76). Com o tipo igual em todo ponto, todas as nuvens param na mesma altura — o tapete
liso visto de cima. Correção: o campo do tipo em volta do tipo pedido (`typeField`/`cloud_type_field`, ±0,4 em
células de 3 km, o canal G do mapa — o tipo por ponto do mapa de tempo de Schneider 2015 e de Hillaire 2016): topos
de 2294 a 3394 m (10–90 %, 1,1 km), espessura p90 1313 → 1638 m. A cobertura medida não mudou (19,4/49,8/81,4 %).
O contraste na imagem do `nuvens` (meio-dia, exposição −13) não mudou: luminância apresentada das nuvens p95/p5 1,17
antes e depois — em aberto; o branco fica no alto da curva de tom (p5 0,80) e o modelo de oitavas calibrado (T023)
clareia a base (a difusão local não representa a luz que entra pelas laterais).

### R17 (revisto) — os tempos pelo método do bench (2026-11-17)

- **Medir com a GPU ocupada.** No ritmo de 60 Hz, com quadros de 3–6 ms, o M4 baixa o relógio da GPU: as passagens das
  nuvens (limitadas pela latência e pela ULA) mediam até 1,5 × mais nos primeiros ~15 s de um app e no perfil baixo
  sozinho, e as da tela (limitadas pela banda) quase não mudavam. A diferença "com − sem a camada" saía do relógio. O
  caso `timing` grava o quadro seguinte assim que a GPU aceita, aquece 600 quadros e intercala com e sem a camada.
- **Os 15,4 ms do vídeo `nuvens`** eram a soma dos passes (`totalMs`, que conta a sobreposição) no ritmo de 60 Hz; o
  intervalo do quadro era ~9,7 ms: 6,3 ms das nuvens (o cache de espalhamento 4,9, a marcha 2,4, o mapa visto do sol
  0,8, sobrepostos) e 3,3 ms do resto.
- **A causa do custo**: fora do mapa de cobertura (64 km), a densidade avaliava o fBm procedural da cobertura e do tipo
  a cada passo — os caminhos das sondas (grade de ±64 km) e a marcha distante. O mapa passou a 256 km (1024² no alto:
  250 m por texel; o fBm mais fino tem 2 km). Os caminhos: o majorante pelo teto da densidade (`g + 0,2`: ~37 % menos
  colisões nulas, sem viés) e a colisão nula decidida pela forma sem o detalhe. Os caminhos são latência (um caminho de
  256 passos em série; o tempo do passe não muda com metade das sondas): despachados por último, com a marcha lendo o
  cache do quadro anterior, a GPU os sobrepõe.
- **Resultado** (caso `timing`): alto 2,76 ms, médio 1,60, baixo 1,59 (o baixo fica nos passes de tela iguais aos três
  perfis: a marcha em ¼, a reconstrução, o aumento, a composição).

### R18 — Raios crepusculares e anticrepusculares (2026-11-18)

**Pedido.** O pôr do sol do claflow-web não mostrava feixes de luz e sombra no ar entre as nuvens. A perspectiva aérea
(R10, a tabela 32³) integrava a luz simples do sol em todo ponto do ar, sem saber das nuvens que o tapam.

**Como as engines fazem.** Frostbite (Hillaire 2020) e a Unreal 5 integram o espalhamento da atmosfera ao longo do raio da
câmera com a visibilidade do sol em cada ponto: a Unreal amostra o mapa de sombra das nuvens (`VolumetricCloudShadowMap`,
"cloud shadow on atmosphere") no volume da perspectiva aérea (32 × 32 × 16 por padrão) e sombreia só a parte simples (a
múltipla, que é a luz do céu, fica); a névoa volumétrica (froxels) faz o mesmo perto com o mapa de sombra da geometria.

**As duas formas avaliadas no motor.**

1. _Os froxels da névoa perto e a tabela além._ Os froxels (160 × 90 × 128) já estão presos à câmera e já leem
   `light_visibility` (a sombra da geometria): dariam a sombra do terreno no ar perto. Mas só existem com um `FogVolume`
   e cobrem dezenas de metros a poucas centenas; os feixes das nuvens estão a 2–150 km. Pôr o ar da atmosfera como meio
   dos froxels (sempre alocados com um `Sky`, a extinção de Rayleigh e Mie injetada, a perspectiva aérea emendada no fim
   deles) é uma peça estrutural nova — ver a proposta abaixo.
2. _A tabela da perspectiva aérea com a sombra_ (escolhida). A tabela já cobre a tela da câmera e 32 km em fatias
   quadráticas; a luz simples de cada subpasso passa a ser × a visibilidade do sol no ponto do ar
   (`sky_aerial_visibility`: o ponto `light_transmission` sem a parte da própria atmosfera — a sombra das nuvens pelo mapa
   visto do sol, com a penumbra do disco). A tabela passa para a fase `shadow` (`SkyAerialFlow`, prioridade −1,5), depois
   da `CloudLightFlow`, que escreve o mapa do quadro; nada de mapa do quadro anterior.

**O fundo.** A vista do céu (192 × 108, simétrica no azimute) não pode ter a sombra. A tabela grava, por coluna, o déficit
da sombra no fundo (`Sky.aerialShadow`, 32 × 32): a luz simples que o ar sombreado deixa de espalhar, da câmera até o fim
da atmosfera ou do mapa visto do sol (150 km; o mapa cobre ±200 km), atenuada até a câmera — a tabela até 32 km e o resto
em 32 trechos iguais, a primeira invocação do grupo soma. O fundo da cena (`scene_background` do `Sky`) tira o déficit da
radiância do céu pela coluna da direção na tela da câmera ativa (um raio refletido fora da tela lê a borda, e o déficit
some meia tela além). A composição das nuvens não muda: o fundo atrás delas já vem com o déficit, a perspectiva aérea na
frente delas vem da tabela sombreada.

**Medidas.**

- Referência f64 (`aerialColumn`, o espelho do kernel, contra `aerialPerspective` com a mesma visibilidade e passos de
  ~1,6 m): duas nuvens (caixas de 1,5–2,5 km, extinção 3/km) com o sol a 10° de lado; o ar sob elas perde mais de 40 %
  da luz por km, o feixe entre elas é o do céu limpo (diferença < 10⁻⁶); a coluna segue a integral exata a 1,35 % (pior
  fatia, aos 12,5 km: o subpasso corta a borda da sombra); o déficit até 150 km a 2,5 % dele (`crepuscularRays.test.ts`).
- Os subpassos (4 por fatia) cortados no fim da atmosfera (o subpasso que cruza o chão do planeta vai só até ele) e a
  leitura da tabela de um ponto abaixo do chão do planeta no chão (as colunas vizinhas terminavam em outras distâncias):
  no smoke `sky`, `aerial-geometry` (a placa a 30 km fica abaixo do chão do planeta), 4 subpassos pelo meio davam 7,1 %
  (2 passavam por acaso, 8,19 contra 8,09 de luz espalhada); com o corte e a leitura no chão, 8,09 contra 8,09.

**Proposta (peça estrutural, não feita): a sombra do terreno no ar.** As colinas sombreiam o ar perto do chão com o sol
baixo. O mapa de sombra virtual só tem páginas onde há pixels da tela; um ponto do ar cai em páginas que ninguém pediu. A
forma da Unreal é a névoa volumétrica: os froxels com o ar da atmosfera como meio (o `Sky` contribuindo a extinção e o
espalhamento de Rayleigh e Mie a `fog_density`/à injeção, a luz pelo `light_visibility` e pelo `light_transmission`), a
tabela começando onde os froxels terminam (`sky_aerial` a partir da última fatia), e os froxels alocados com o `Sky` e
não só com um `FogVolume`. Precisa da decisão sobre o custo (~0,3 ms dos froxels em toda cena com céu).

### R18 (cont.) — o sol, o chão e a cor do céu no pôr do sol do claflow-web (2026-11-18)

**O sol.** O disco já tinha o tamanho real (raio 0,004675 rad, 0,536°) e a radiância física (`E·T/(π r²)`, ~10⁹ nits ao
meio dia), mas o fundo guarda no máximo `SKY_SUN_DISK_MAX` (60 000; o alvo é meio-float): a energia do disco era cortada
~25 000 vezes, e nenhum espalhamento da lente podia mostrar o clarão (o `Bloom` era um desfoque 5 × 5 com limiar).

- O excesso vai para `FrameTargets.overflow` (sob demanda, em unidades de 65 536): o `SkyOverflowFlow`, depois da
  composição das nuvens, desenha um retângulo em volta do disco com a cobertura do pixel pela distância angular (a energia
  não depende do deslocamento da amostra), só no fundo, × a névoa dos volumes e × a transmitância das nuvens no pixel.
- A fração visível do disco (o fundo × a transmitância das nuvens, a média em 8 × 8 pontos dele) é acumulada pela série
  `Sky.sunVisibility` (peso 1/8, como a cor na resolução temporal): pixel a pixel, a energia do disco seguia o
  deslocamento da amostra na silhueta do relevo e o ruído da marcha, e o clarão piscava (`pordosol`, quadros 276–277: 16
  níveis, 6,7 % da imagem alternando; depois, alternância máxima 0,31 %).
- O `Bloom` virou o espalhamento da lente com a energia conservada: `(1 − G)·cor + G·espalhada`, sem limiar, `G` = 4 %
  (o véu de uma objetiva boa, 1–4 %), a função de espalhamento θ⁻³ (o termo de espalhamento de Spencer et al. 1995) pela
  pirâmide de 7 níveis de Jimenez (2014) com o peso da energia por oitava (`c = 2^(2 − p)` = 0,5). A pirâmide guarda a
  radiância × 2⁻¹⁵ e soma o excesso: o clarão tem a energia inteira do sol. Contrato novo dos efeitos de vários passes
  (`EffectStage`, `EffectTexture`: as texturas de trabalho no `PostWork`, por descritor), e o `PostFlow` limpa o excesso
  depois de ler.
- A auréola de Mie vem da vista do céu (a fase de Cornette-Shanks com g = 0,8, a tabela densa em volta do azimute do sol);
  com os aerossóis de um fim de tarde no campo (turbidez 8 nas cenas do pôr do sol: profundidade ótica vertical ~0,04 a
  550 nm; a de Hillaire, 0,005, é ar de montanha com ~200 km de visibilidade) ela fica do tamanho da das fotos.
- **O traço vertical claro na nuvem acima do sol aos 5 s** (`solposto`): a resolução temporal guarda o fundo parado por 64
  quadros sem recorte e o reilumina pela razão da luz que chega; no fundo a luz era a do céu atrás das nuvens, e a luz das
  próprias nuvens (o sol descendo, o pico de frente da fase andando com ele) ficava ~1 s para trás. A máscara reativa do
  disco recomeça o histórico por onde o disco passa: ali aparecia a nuvem de agora no meio da atrasada — um traço do largo
  do disco (12 px) ao longo do caminho do sol, claro com a nuvem clareando, escuro (a 2°) com ela escurecendo. Correção
  pela causa: a composição das nuvens leva também a luz que chega à das nuvens passa-baixa (`luz·Tc' + Y(Sc')`, a média 3
  × 3 a 3 px, mais larga que o texel da marcha: o detalhe menor que ele não entra na faixa da reiluminação); e a máscara
  do disco só onde a luz dele que passa pelas nuvens pesa no pixel (1/64).

**O chão.** As normais e N·L estavam certos; o relevo é que era raso: até ~2 km as colinas tinham 4–9 m em comprimentos
de 1,6 km (encostas de ~1 %), e o chão saía chapado com qualquer sol. A cena ganhou colinas de 400–900 m com ±22 m
(encostas de 15–25 %) e ondulações de 120–250 m (±4 m), com um vale largo no rumo do sol e do lado oposto (o horizonte
do sol baixo e o da sombra da Terra abertos). A exposição seguia o fotômetro de luz incidente inteiro até 11°: o chão
ficava com o mesmo brilho do meio dia até o fim da tarde. Agora segue metade da mudança do fotômetro em todas as
elevações (a regra do "sunny 16" seguida em parte, como no lapso de tempo do dia para a noite): do meio dia a 20° a imagem
escurece 0,9 EV, a 5° 2,1 EV, no horizonte 3,4 EV, a −4° 5,5 EV.

**A cor do céu com o ângulo.** A tabela da vista do céu segue a referência f64 (smoke `sky`, `colors`: razão R/B a ≤ 1 %
com o sol a 60°, 20° e 4°). Medido na referência (cd/m², xy CIE, temperatura de cor; turbidez 1):

| sol | horizonte do lado do sol (2°) | zênite               | horizonte oposto (5°) |
| --- | ----------------------------- | -------------------- | --------------------- |
| 60° | 9521, (0,279; 0,308), 9200 K  | 1511, (0,228; 0,232) | 6935, (0,257; 0,281)  |
| 20° | 12439, (0,321; 0,347), 6000 K | 762, (0,227; 0,231)  | 6383, (0,271; 0,301)  |
| 10° | 16533, (0,374; 0,384), 4200 K | 538, (0,234; 0,239)  | 4962, (0,290; 0,325)  |
| 3°  | 11013, (0,461; 0,413), 2700 K | 282, (0,256; 0,262)  | 2395, (0,351; 0,375)  |
| 0°  | 3556, (0,522; 0,392), 1900 K  | 127, (0,280; 0,271)  | 747, (0,429; 0,382)   |
| −2° | 684, (0,484; 0,393), 2200 K   | 44, (0,285; 0,258)   | 77, (0,430; 0,316)    |
| −4° | 204, (0,486; 0,395), 2200 K   | 8, (0,285; 0,243)    | 5, (0,266; 0,231)     |

Os valores publicados de céu limpo (zênite de ~100–300 cd/m² com o sol no horizonte e ~10 cd/m² a −4°; o zênite azul e o
"purple light" no crepúsculo pela banda de Chappuis do ozônio, cuja absorção — 0,65/1,881/0,085 × 10⁻³ por km no pico,
~300 DU — está na referência) batem na ordem de grandeza e na cor. A tabela está certa; o que a imagem perdia era a curva
de tom: o AgX leva os realces saturados ao branco — o horizonte do lado do sol a 1° (2100 K, x 0,50 y 0,40) saía a
~4200 K na tela (248/215/165), e as nuvens douradas do sol baixo quase brancas. As cenas das nuvens passam à curva
Khronos PBR Neutral (o motor já a tinha: identidade até ~0,76, guarda a matiz e a saturação até perto do branco): o mesmo
horizonte sai 253/213/169 com a exposição dele, e a nuvem ao sol a 3° fica laranja (251/189/115 contra 233/205/136).

**Custo medido (M4, `solposto`, passes):** a tabela da perspectiva aérea com a sombra fica abaixo de 0,25 ms (fora dos
12 passes mais caros); o `Bloom` (15 passes) idem; a composição com o alvo da luz 1,4 ms (antes 1,5); o excesso do sol e
a máscara reativa ~1,3 ms cada no relógio do passe (um retângulo de dezenas de pixels: o tempo é o do passe de desenho
vazio no M4). Fora destas mudanças, o `ShadowFlow` (o mapa de sombra do terreno) mede ~45 ms por quadro nestas cenas do
claflow-web — com o relevo novo e sem ele (medido com as colinas zeradas): está em aberto, não é desta rodada.

**A referência das nuvens com a sombra no ar.** A perspectiva aérea na frente das nuvens do smoke `clouds` passa a ter a
mesma sombra na referência f64 (a luz simples × `e^(−τ)` das nuvens até o sol, `opticalDepth` do modelo). No `sunset`, a
razão mediana GPU/referência das 32 regiões fica 0,990 (com a referência sem a sombra, a pior região dava 70 %: GPU 7,75
contra 26,0 nits), mas quatro regiões de nuvem rala a ~15 km rente ao horizonte (T 0,81) têm o ar menos sombreado na GPU que na referência
(8,8 contra 2,5 nits; a pior luz a 203 % pela medida da SC-001): em aberto. Candidatos: a referência é um raio só para o
centro do sol (a GPU faz a média da penumbra do disco pelo mapa) e o mapa visto do sol guarda só o primeiro trecho da casca
do lado do sol.

### R8 (T074, 2026-11-21) — a luz das sondas em partes, as memórias pela sensibilidade medida, a grade no referencial das nuvens

**O que mudava o cache com o sol andando.** A sonda guardava a luz em unidades da iluminância do sol no topo: a cor e o
brilho do sol baixo (a transmitância da atmosfera até a sonda) entravam no que a página guarda e mudavam ~26 %/° entre 2°
e 8° — a memória de 0,25° vinha disso, e a 0,25°/s ela pedia o teto de páginas todo quadro.

**A medida (f64, `reference/__tests__/scatterMemory.ts`).** A nuvem da calibração (o cilindro de 1 km, extinção 0,02/m,
albedo 0,99) com a atmosfera da Terra (a luz do sol em cada colisão atenuada até ela, o céu da atmosfera de referência
tabelado por direção, o chão), 8 sondas × 3 câmeras (contra o sol, de frente, de baixo), na resolução da grade (o
binomial 3 × 3 × 3 a 100 m, como o filtro), com os mesmos caminhos (as mesmas sementes) a ±0,5°. A sensibilidade de cada
sonda é o pior canal de `|q(θ+δ) − q(θ−δ)|/(2δ·q)`; a do conjunto, a média pela luminância:

| sol | em unidades do sol no topo (antes) | ÷ a transmitância até a sonda | em partes (sol ÷ a luz que chega, céu ÷ a irradiância) | câmera |
| --- | --- | --- | --- | --- |
| 2° | 41,4 %/° | 65,9 | 4,35 | 4,23 |
| 4° | 27,8 | 19,2 | 2,52 | 3,71 |
| 6° | 19,5 | 9,6 | 3,64 | 4,84 |
| 8° | 15,1 | 8,1 | 6,01 | 8,15 |

Dividir tudo pela transmitância só não basta: a parte do céu não segue a luz do sol que chega à sonda (com o sol a 2° ela
piora). Em partes, o que sobra é a geometria (a sombra das nuvens que anda com o sol, a fase para a câmera): 4,1 %/° de
média. O ruído da sonda filtrada com a janela cheia: um caminho tem 1,64 × a média (desvio relativo, média pela
luminância), × √(Σw²/64) do binomial = 4,7 %. A memória iguala o atraso ao ruído: 4,7/4,13 = **1,14°** no sol (eram
0,25°: o atraso de 6,5 % na forma de antes) e 4,7/5,23 = **0,90°** na câmera; o esquecimento é `e^(−(Δθ_sol/M_sol +
Δθ_câmera/M_câmera))`. O teste reduzido (`scatterMemory.test.ts`, 16 caminhos) reproduz as duas memórias a ±40 %.

**A grade no referencial das nuvens.** O centro é a câmera menos o deslocamento do vento, encaixado a 4 km, de volta ao
mundo: as sondas andam com as nuvens e o vento não muda o que guardam (só o que sobra além dele, a bigorna; a evolução do
detalhe segue pela idade). Quando o centro muda (a câmera, nesse referencial, cruza o encaixe: a 10 m/s, a cada 400 s), a
grade de antes é levada à de agora — a sonda nova lê a filtrada de antes no seu ponto × `min(1, A_agora/A_antes)` (as
áreas da sonda no plano: a de antes mais espaçada vale menos caminhos) — e só o que entra pela borda recomeça.

**Os dois orçamentos e a latência.** As páginas que mudaram desde o último caminho caminham no orçamento da mudança
(`scatter.motion`), as novas e as paradas que não encheram no de encher (`scatter.budget`). Medido no M4: o passe dos
caminhos custa ~0,24 ms fixos (a latência de um caminho de até 48 colisões) + ~6,3 µs por página; com 40 páginas por
quadro, 0,57 ms com o sol andando ou com o vento (a câmera vista das sondas que andam). O fixo é da latência: menos
páginas não o tiram — a peça que falta é o caminho continuado entre quadros (o estado do caminho na série, alguns passos
por quadro), em que o custo por quadro é o da vazão.

**O panorama.** Refeito pela mudança medida: a cada 8 quadros, 64 texels sorteados refeitos e comparados na escolha
seguinte com o desenho guardado (a luz relativa média e a transmitância média, 2 %). A média, não a maior: o ruído de
poucos caminhos das páginas que caminham muda cada texel, e o que o panorama dá é a soma de muitos. A marcha de um texel
tem a latência do desenho inteiro (64 texels custavam 0,36 ms, o mesmo que os 32 768): as provas a cada 8 quadros.

### R11 (T074, 2026-11-21) — o mapa visto do sol pela pegada do pixel; a faixa do pulo do vazio pelo trecho

**O mapa.** A tolerância de 1/255 da transmitância valia igual para toda página. Agora, na vista da câmera, o pixel maior
que o texel faz a média dos texels: a mudança da página × texel/pegada (a pegada do pixel na coluna do centro da página
mais perto da câmera). Medidos e desfeitos: o desconto do deslocamento abaixo de meio pixel (a página velha não se move
abaixo do pixel — salta no redesenho, e o salto da luz é o que o gradiente temporal da reconstrução vê) e a tolerância de
2 % fora da vista (as páginas fora do quadro alimentam os caminhos do cache de espalhamento, e o salto delas chega à luz
vista): com eles, o degrau dos blocos do `dusk-blocks` ia a 1,041 (sem, 1,017). Com o sol a 0,25°/s entre 2° e 8°, 90–112
páginas desenhadas por quadro — as colunas de ~36 km giram ~2 m por quadro no fim do trecho, e as sombras no chão e no ar
perto da câmera mudam mais de um nível por quadro: o desenho segue 1,67 ms. Com o vento (o mapa anda com o referencial das
nuvens), 4–9 páginas por quadro pela evolução do detalhe, 0,30 ms.

**A faixa do pulo do vazio.** O pulo da marcha pela faixa de altura em que a coluna pode ter nuvem (`68a47bb1`) usava a
faixa das pontas do trecho com 0,05 de folga na cobertura; nos trechos de quilômetros do raio rente ao horizonte, o campo
da cobertura (8 km) e o do tipo (3 km) passam entre as pontas além da folga: o `sunset` foi de 3,6 a 4,4 % (sem o pulo,
3,6). A faixa do trecho usa a cobertura mais alta que um campo de gradiente até G alcança entre as pontas,
`(c0 + c1 + G·len)/2`, e o tipo no intervalo dele; G pelo maior gradiente medido na f64 (3,5·10⁻⁴/m na cobertura,
1,7·10⁻³/m no tipo, em 200 000 pontos) × 1,5. Com uma função de cobertura (gradiente desconhecido) ou o tempo, da base ao
topo das colunas.

### R11 (T074, 2026-11-21 e) — a coluna repartida, os nós do meio dos trechos, a marcha medida por partes

**A marcha por partes** (`high-sun`, 1,77 ms, cada parte tirada e medida): o cone 0,60, o pedaço até o nó 0,49, a leitura
do nó 0,17, o detalhe nas amostras da luz 0,27, a ocupação 0,10, a leitura do cache 0,08. Por raio: 39 passos, 7,1 com
nuvem (o maior de 32 vizinhos: 10,9), 14 grossos, 18 finos vazios; 48 % saem pela transmitância. A luz por passo segue o
número de amostras da densidade; o que muda por raio (a luz barata com T < 0,1, 32 % dos passos com nuvem) não rende: o
grupo SIMD paga o caminho mais caro. A marcha em dois laços (Aila e Laine 2009) e o despacho em ladrilhos 8 × 8 também não.

**Os nós do meio**: o pente grava 32 nós; os 16 da coluna nas camadas 0…3 (o que a superfície, o ar, as provas e o
registro leem), os do meio de cada trecho nas 4…7. O pedaço da marcha vai só até o meio nó, em 2 passos com o mesmo
espaçamento: em f64 o erro médio de τ ao longo de uma coluna de 36 km a 4° sai 1,70 % contra 2,34 %; a marcha −0,12 ms, o
desenho +0,1 ms.

**O desenho da página**: as 33 colunas além das 256 invocações repartidas em 7 partes seguidas do pente — a soma das
partes é a coluna em qualquer repartição (τ de um nó: a extinção × o pedaço da célula acima dele) —, 1,67 → 1,43 ms. O
redesenho em quatro fases entrelaçadas (um quarto dos texels por quadro, os quatro do filtro de fases diferentes) custava
1/4, mas as fases desenhadas com sóis de até 3 quadros atrás, lidas pelo sol da página, deixavam o degrau dos blocos do
`dusk-blocks` em 1,049: desfeito. A demanda com o sol andando: ~500 páginas por quadro acima de 1/255; das colunas refeitas,
48 % mudam menos que isso; a previsão por texel (o maior |ΔT| aos vizinhos × o deslocamento das colunas) pula 32 % delas e
erra 2,5 % acima de 4/255 — a peça seguinte, com a idade por texel no registro.

### R7/R11 (T074, 2026-11-21 f) — os níveis de detalhe na luz (medidos e não usados), o volume de τ até o sol perto da câmera

**Os níveis de detalhe do volume da forma na luz (f64, `cloudSunVolume.test.ts`, os volumes da forma padrão).** A pirâmide
(a média 2 × 2 × 2 do volume periódico, `buildVolumeLevels`; a leitura trilinear entre níveis, `sampleVolumeLevel`) lida
pela largura da amostra (`volumeLod`) piora o τ do cone: a média num cubo de lado `len` tira a variação lateral, e a luz
pede a integral na linha. Na camada padrão (400 pontos com nuvem, sol a 4°/30°/70°): o cone de 6 amostras 4,3/3,5/3,2 %;
com o nível pela largura inteira 8,4/6,6/6,4 %; pela metade da largura 4,0/3,1 % (o único ganho, no mesmo número de
amostras); 4 amostras do mesmo comprimento 9,9–10,2 %, com o nível pela metade 7,9–8,0 %; o detalhe cedendo pela largura
(o `cloud_footprint` da vista nas amostras da luz) piora sempre (11–15 %). O pedaço até o meio nó (até 1125 m): 2 amostras
|Δτ| 0,19, com o nível 0,15; 1 amostra 0,43, com o nível 0,28. Os níveis não deixam a luz com menos amostras no mesmo
erro — a peça que corta amostras é a de baixo; a referência guarda a pirâmide e o teste, a GPU não a monta.

**O volume de τ até o sol.** Nós no referencial das nuvens, em 5 níveis (o nível `k` com células de `50·2^k` m no plano; a
casca em 64 células na altura, 39 m na padrão, em todos), páginas de 8³ células (9³ nós: o da vizinha em cada eixo, a
leitura filtra dentro da página) numa janela toroidal de 20 × 8 × 20 páginas por nível (±4·2^k km, até ±64 km), no atlas
`rgba16float` (os níveis em z; 93 MB). Cada nó guarda (r) o τ do cone além da primeira amostra (12 amostras no meio de
partes iguais) e (g) o resto da luz do fim dele (`cloud_sun_rest`: o pedaço até o meio nó e o nó do mapa visto do sol). A
marcha faz a primeira amostra do cone no ponto (a borda escura, que os nós alisariam) e lê o resto do cone no volume; o
resto da luz também, onde vale. Medido em f64 (texel 50 m, 39 m na altura): o τ do cone 2,4–3,1 % contra 3,7–3,9 % das 6
amostras; a 100 m, 5,3–6,2 %; a 200 m, 11 %. As páginas pelo registro da série 037 (a página global, a assinatura, o sol e
o tempo do desenho, as taxas medidas e 32 nós de prova das duas partes) e o carimbo do atlas: valem desenhadas para a
janela de agora, na época atual, com a mudança estimada (a taxa medida × o deslocamento desde o desenho — no cone,
`L·Δθ_sol` mais a deriva do detalhe; no resto, `10 km·Δθ_sol` mais a deriva) abaixo de `0,06·2^k`; a fila pela mudança
acima de `0,02·2^k` (o resto só quando o redesenho dele dura 2 s no ritmo medido); o orçamento de 128 páginas por quadro.
A taxa de partida do cone, a medida na f64: 0,0029/m (0,025/° com o trecho de 490 m, e o mesmo por metro de deriva).
**Onde a marcha gasta a luz** (o volume ligado por partes, `high-sun`): até 8 km 0,04 ms, de 8 a 32 km 0,11, de 32 a 128
km 0,15 — por isso os níveis. **O resto em células grossas borra a sombra de uma nuvem na outra** com o sol baixo: com ele
em todos os níveis o `sunset` foi a 6,5 % (o cone só, 4,0 %; o resto até 2 pixels da marcha, 4,3 %): o resto vale só com
a célula até a pegada do pixel da marcha; o cone em todos. No anel de fora de cada janela o nível seguinte entra pela
distância à borda (no último, o cone), sem degrau de luz.

### R8/R11 (T074, 2026-11-21 g) — o mapa por coluna e os caminhos continuados (medidos, desfeitos); o pedaço até o nó inteiro

**O `sunset` (3,6 → 4,0 % desde 2488a334).** O pedaço marchado de cada passo com nuvem ia só até o meio nó do mapa (os
nós do meio dos trechos nas camadas 4…7): metade do comprimento marchado ao longo da coluna do ponto, e o τ do resto vinha
mais do mapa filtrado entre colunas vizinhas (outra linha de ~30 km pelo detalhe). Medido na GPU (pior região): até o meio
nó em 2 passos 4,0 %; em 3 passos 4,0 (o espaçamento não é o que conta); com o meio nó a pelo menos meio trecho do fim do
cone (mais marchado, espaçamento maior) 4,5; até o nó inteiro em 4 passos 3,7; em 3 passos 3,6. Decisão: o nó inteiro em 3
passos no alto; os nós do meio saem do atlas. A f64 de uma coluna só (sem o filtro entre colunas) não vê a diferença: lá o
meio nó em 2 passos erra o τ 1,70 % contra 2,34 %.

**O degrau do `dusk-blocks`.** O caso é determinístico (o mesmo valor em rodadas seguidas do mesmo código): 1,029 → 1,025
com o pedaço até o nó inteiro; sem o volume de τ até o sol na marcha, 1,040. O pior quadro é sempre o do sol a −0,67°. Os
1,017 da rodada d (antes de ee205471/2488a334 e do volume) não voltaram; a causa que sobra não foi isolada.

**O mapa visto do sol por coluna (implementado, medido e desfeito).** O registro de cada texel (o sol do desenho da coluna,
o fator ao longo — o maior |ΔT| entre nós × 16 —, o erro medido pelas provas); a página escolhida refaz só as colunas de
erro previsto na tela acima de ½ tolerância — o deslocamento lateral do sol delas ao de agora (o plano girando no ponto
do texel, a coluna inclinando até a ponta mais longe do plano) × o gradiente do texel aos quatro vizinhos com o fator 2, e
o deslocamento dos nós × o fator ao longo — e o erro das mantidas soma ao da página na escolha (a soma limita o de cada
texel). Com o sol a 0,25°/s entre 2° e 8°, todas as colunas passam: na GPU 93 páginas e 26 860 colunas por quadro (289 por
página); na f64 (cúmulos em células, densos ou esparsos, sol a 5° e 15°), 100 %. Razão: a alavanca (a ponta do trecho ao
plano) é de 15–120 km e o sol anda 7·10⁻⁵ rad por quadro, 1–9 m na nuvem; com o fator 2 e ½ de 1/255, só a coluna com
|ΔT| < ~0,02 por texel ficaria, e com o sol baixo toda coluna de ~36 km atravessa nuvem. A sombra anda de verdade 2–3 m
por quadro: o que o mapa refaz é a mudança física. O que pode baixar o custo com o sol andando é mudar o que se guarda —
as colunas reprojetadas pelo deslocamento de cada trecho (a mudança pelo sol é uma rotação conhecida; o erro de segunda
ordem, mas a leitura do atlas não pode ser feita no mesmo passe que o escreve) ou o mapa pré-filtrado — ou a tolerância
pela tela com o antisserrilhado temporal (o `dusk-blocks` mede o salto).

**Os caminhos continuados (implementados, medidos e desfeitos).** O caminho anda até 16 passos por quadro e o que não acaba
guarda o estado (16 palavras) na série `scatterPaths` (canal 037, a fatia anterior lida); um passe antes dos novos os
continua e soma na sonda quando acaba; só as páginas da mudança continuam (as de encher a janela acabam no quadro: com
todas, o cache não enchia no transitório e o alto parado medido ia a 4,2 ms); a página espera os caminhos dela pela
contagem; os grupos sem trabalho saem juntos antes das barreiras (sem isso, 0,61 + 0,47 ms no alto parado). f64: o caminho
em pedaços soma a mesma luz que inteiro com o mesmo gerador. No `high-wind`: os caminhos 0,57 → 0,35 ms (com 32 passos
0,37, com 24 0,38: o passe dos que seguem tem o custo da vazão, ~0,24 ms — o "custo fixo" era trabalho, não só latência),
o caso 3,27 → 3,06 ms. Mas a luz das sondas chega 1–16 quadros depois da escolha: com o sol rápido do `dusk-blocks` o
degrau dos blocos foi a 1,028–1,034 (falha a 1,03) e, com o filtro marcado só no fim da caminhada, o matiz a 0,061.

### R20 — A geometria por vista: a malha adaptativa refeita para cada vista (2026-11-19)

**Decisão do usuário** (2026-11-19, "Na 41"): a geometria por vista entra na 041 — a prática padrão (o LOD do terreno por
vista de sombra no Unreal, CDLOD e geoclipmaps) para o mapa de sombra virtual não receber os 4,5 M triângulos da malha da
câmera em páginas onde cada triângulo ocupa menos de um texel. Medido antes (rodada 13): com o sol andando, `ShadowFlow`
3,48 ms + páginas 0,25 ms, o quadro +1,4 ms contra o sol parado.

**A peça geral.** Uma _vista_ é quem olha a geometria e, por isso, o critério do erro dela: a câmera ativa, a luz
direcional com os níveis do mapa de sombra virtual e, depois, os reflexos e as outras câmeras (pedido 5 do MorphSociety,
ADR 0001). No modelo Resource + evento + Flow:

- _Quem pede e quem consome_: o consumidor da vista (o `ShadowFlow` para a luz; um reflexo ou outra câmera depois) pede à
  geometria `requestView({ key, kind, source, error?, segment? })` no `framePrepare` dele, e a solta (`releaseView`)
  quando a geometria deixa de ser desenhada; é o padrão `reserve` dos Resources (como `FluidField.reserve`), não um
  helper. A geometria que se refaz por vista (a `ParametricSurface` adaptativa) guarda o pedido no dado e redescreve-se:
  a C2 aloca os descritores novos (os que não mudam ficam) e recompõe a entidade (`entitiesRecomposed`). As demais
  geometrias devolvem `false` e o consumidor desenha a malha de sempre.
- _A saída por vista_ (descritores no Resource da geometria, escritos só pela GPU): `view:<key>:vertices`,
  `view:<key>:indices` e `view:<key>:indirect` (o registro do desenho indexado, como o da câmera), com o **orçamento
  constante** da vista (`adaptive.viewBudget`, padrão o menor entre `budget` e 262 144 triângulos: até 2 vértices e 3
  índices por triângulo — o nível 0 tem 4 vértices em 2 triângulos —, 16 MB de vértices e 3 MB de índices no terreno). A
  malha da câmera ativa continua a de sempre (`vertices`, `indices`, `indirect`), com o mesmo critério e os mesmos
  pipelines. As caixas dos aglomerados ficam no consumidor (a série por páginas do `ShadowFlow`, T060a): são a estrutura
  de aceleração do cache dele (o carimbo das caixas é o do cache das páginas), refeitas quando a vista é produzida; na
  geometria seriam uma segunda série com o mesmo conteúdo.
- _O produtor_ (o `SurfaceFlow`): cada vista tem o seu trabalho no `SurfaceWork` (parâmetros, retalhos, histograma e o
  despacho indireto da emissão, uma parte por vista) e os pipelines das seis passadas (a variante por superfície e tipo).
  Por quadro, a vista roda quando a superfície é avaliada (todos os retalhos), quando o que define o critério muda (na da
  luz: a direção dela, o mapa e a posição da câmera ativa, o centro dos níveis; na de câmera: a posição e o campo de visão
  dela) ou quando é nova; parada, nada roda e nada é marcado. O que roda é marcado como produzido no quadro
  (`produced(geometria, 'view:<key>:vertices')`, spec 031): o consumidor sabe que a vista mudou sem ler de volta.
- _O critério de cada vista_ (o nível de cada retalho, 2^l segmentos por lado):
  - câmera: o da malha da câmera ativa (erro de corda abaixo de `tolerance` e o segmento abaixo de `screen` da altura da
    imagem), com a câmera da vista (`surface_adapt_view_camera.wgsl`);
  - luz: o erro medido em **texels do nível do mapa virtual onde o retalho cai** (`surface_adapt_light.wgsl`): o nível é o
    do ponto do retalho mais perto da câmera no plano da luz (a distância de Chebyshev da caixa dos 3 × 3 pontos do
    retalho projetados pelo `ShadowMatrix` do quadro: a mesma regra de `sv_level` com que os receptores pedem as
    páginas — um ponto do plano da luz cai num nível só); o erro de corda κ·h²/8 fica abaixo de `error` texels (0,5: a
    profundidade e a silhueta no mapa erram menos que o viés de 1 texel) e nenhum segmento fica abaixo de `segment`
    texels (1: nenhum triângulo menor que o texel). Sem o referencial do quadro, o nível máximo.
- _Refazer só o que mudou_: os níveis efetivos e as bases de cada retalho de cada vista ficam numa série da C2 (spec 037,
  constituição VII: `surface_view_levels` no `SurfaceWork`, `history: { depth: 2 }`, um `vec4u` por retalho de cada
  vista, a fatia do quadro e a do anterior pelo slot `levels`). Depois do orçamento e dos prefixos (os da malha da câmera,
  as mesmas passadas), a marcação (`surface_adapt_view_mark_main`) refaz o retalho cujo nível efetivo ou cujas bases
  mudaram, ou cujo vizinho mudou de nível (a costura); a passada seguinte escreve o despacho indireto da emissão — a
  grade inteira se algum retalho foi marcado (a emissão pula os não marcados), nenhum grupo se nenhum. A histerese (o
  retalho num nível mais fino só desce quando pede menos de ¾ dos segmentos do nível de baixo) lê o pedido anterior da
  mesma série. Com o sol andando, a malha da vista é refeita pelo critério e o retalho que não mudou de nível não é
  reescrito; a vista que não muda não suja página nenhuma (as caixas dos aglomerados iguais), e com o sol parado nada roda
  — o cache estático das páginas (rodada 11) continua valendo.
- _O consumidor_ (o `ShadowFlow`): pede a vista da luz a cada geometria que projeta, com `source` = a entidade do mapa;
  desenha a vista (vértices, índices, o registro indireto, os aglomerados e as caixas) a partir do quadro em que o
  produtor a escreveu pela primeira vez (antes, a malha de sempre); a troca muda o conteúdo dos grupos e recomeça o cache.
  A deformação da geometria na vista é a marca de produção da vista.
- _Atlas, arena e páginas_: as páginas são as do mapa virtual e da série das caixas, como já eram; a série dos níveis é
  uma série de fatias (todo retalho de toda vista é lido a cada geração, não há residência a decidir); a arena de pools
  não se aplica (nada é enviado pela CPU); nenhum atlas novo.
- _Orçamento total dos laços_: o nível da luz tem dois laços fixos de 3 (9 pontos); a marcação, quatro vizinhos; a emissão
  e os prefixos são os da malha da câmera (laços fixos pelo número de retalhos); nada roda na CPU além dos parâmetros.
- _Sem o desenho indireto_ ('indirect-first-instance' ausente) a malha fica no nível máximo, maior que a capacidade da
  vista: a vista não é gerada e o consumidor segue com a malha de sempre.

Referência: `reference/viewLod.ts` (o nível do mapa da caixa, os segmentos, a histerese e a marcação) com o teste
`viewLod.reference.test.ts` (o erro exato da interpolação da senoide em f64 abaixo de 0,5 texel do nível, o nível da
caixa igual ao do ponto mais perto pela força bruta, a marcação dos retalhos de uma grade).

**Medidas (rodada 14, M4, perfil alto, GPU ocupada por `readyForFrame`, 2 × 120 quadros por fase; `solposto` do
claflow-web; antes = `a5a983ae` por uma árvore própria, removida depois).** Por passe (soma dos passes do `ShadowFlow`):

| quadro de partida  | fase    | antes: médio / mediana / p90 (ms) | depois: médio / mediana / p90 (ms) | `SurfaceFlow.view` |
| ------------------ | ------- | --------------------------------- | ---------------------------------- | ------------------ |
| 735 (sol a 10°)    | parado  | 0,11 / 0,10 / 0,11                | 0,06 / 0,06 / 0,06                 | 0                  |
| 735                | andando | 2,03–2,08 / 0,11 / 4,39–4,47      | 0,22–0,26 / 0,22–0,25 / 0,26–0,32  | 0,15               |
| 1050 (sol a −1,7°) | parado  | 0,09 / 0,09 / 0,09                | 0,06 / 0,06 / 0,07                 | 0                  |
| 1050               | andando | 2,91 / 4,27–4,29 / 4,63           | 0,18–0,23 / 0,20–0,28 / 0,23–0,31  | 0,15               |

A GPU por quadro (mediana do intervalo dos tempos de GPU) com o sol andando a 1050: 23,6 → 18,6 ms (parado, 17,2 nos
dois). Antes, o cache das páginas recomeça a cada ~0,08° de giro (`cacheDirection`) e as páginas recebiam os aglomerados
da malha da câmera (4,5 M triângulos); depois, os da vista da luz. Com o sol parado nada da vista roda (0 ms) e o cache
estático vale (o `ShadowFlow` parado caiu de 0,09–0,11 a 0,06 ms: menos aglomerados nas caixas e nas listas).

_A sombra igual_: quadros com o sol a 10°, 5°, 3° e 1° (`solposto`, 200 quadros parados em cada) e a 5°, 3° e 1°
(`solpostooposto`, de costas para o sol, as encostas acesas e as sombras das colinas à vista), antes contra depois: a
diferença média no chão ≤ 0,031 nível de 8 bits, p99 ≤ 0,7, nenhum pixel do chão com diferença > 8 no `solpostooposto` e
≤ 0,01 % no `solposto` (o ruído da resolução temporal); sem buraco nem acne (montagem
`scratchpad/041-video/rodada14/montagem-antes-depois.png`).

_Um defeito achado no caminho_: a primeira versão ligava o mesmo buffer substituto às arestas e à geometria diferencial
das vistas; duas ligações graváveis do mesmo buffer no despacho invalidam o passe — e os quadros em que a vista rodava
saíam inteiros inválidos sem `engineError` (o chão sumia; o tempo do `ShadowRequestFlow` ia a 2 ms e o intervalo a 6 ms).
Corrigido com um substituto próprio para as arestas. Em aberto (fora desta peça): o erro de validação do passe não chega
ao `engineError`.
