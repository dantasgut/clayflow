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
