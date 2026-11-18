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

1. *Os froxels da névoa perto e a tabela além.* Os froxels (160 × 90 × 128) já estão presos à câmera e já leem
   `light_visibility` (a sombra da geometria): dariam a sombra do terreno no ar perto. Mas só existem com um `FogVolume`
   e cobrem dezenas de metros a poucas centenas; os feixes das nuvens estão a 2–150 km. Pôr o ar da atmosfera como meio
   dos froxels (sempre alocados com um `Sky`, a extinção de Rayleigh e Mie injetada, a perspectiva aérea emendada no fim
   deles) é uma peça estrutural nova — ver a proposta abaixo.
2. *A tabela da perspectiva aérea com a sombra* (escolhida). A tabela já cobre a tela da câmera e 32 km em fatias
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

| sol | horizonte do lado do sol (2°) | zênite | horizonte oposto (5°) |
| --- | --- | --- | --- |
| 60° | 9521, (0,279; 0,308), 9200 K | 1511, (0,228; 0,232) | 6935, (0,257; 0,281) |
| 20° | 12439, (0,321; 0,347), 6000 K | 762, (0,227; 0,231) | 6383, (0,271; 0,301) |
| 10° | 16533, (0,374; 0,384), 4200 K | 538, (0,234; 0,239) | 4962, (0,290; 0,325) |
| 3° | 11013, (0,461; 0,413), 2700 K | 282, (0,256; 0,262) | 2395, (0,351; 0,375) |
| 0° | 3556, (0,522; 0,392), 1900 K | 127, (0,280; 0,271) | 747, (0,429; 0,382) |
| −2° | 684, (0,484; 0,393), 2200 K | 44, (0,285; 0,258) | 77, (0,430; 0,316) |
| −4° | 204, (0,486; 0,395), 2200 K | 8, (0,285; 0,243) | 5, (0,266; 0,231) |

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
