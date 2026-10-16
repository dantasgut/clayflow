# Research — 011 HDR e materiais físicos por nós

Levantamento na `develop` após o PR #46 (031, 2026-10-16), que substituiu o levantamento após o PR #45. Achados (A) com
evidência; decisões (R) com alternativas.

**Revisão de 2026-10-16**: o primeiro plano tinha um `StandardMaterial` com todos os parâmetros do OpenPBR ligados e
desligados por pesos fixos; o usuário rejeitou ("liga e desliga com valores fixos não serve"), e a 031 trouxe os grafos
de nós como padrão fundacional. Nesta revisão, **o material é um grafo de nós BSDF** (R5); o OpenPBR é um sub-grafo da
biblioteca, não o modelo do motor. As luzes chegam ao desenho pelos **pontos de cena** da 031 (R7).

## Achados

- **A1 — Cena em 8 bits.** `FrameTargets` declara `color` e `samples` com `format: 'canvas'`
  (`presentation/app/FrameTargets.ts`); o pingue-pongue do pós usa `core.canvasFormat` (`PostFlow.ts`); a cópia de fundo
  da água é `'canvas'` (`WaterSurface.ts`, vista `background`). Os pipelines do forward, sprites e água pegam o formato do
  slot de alvo — trocando o formato dos `FrameTargets`, eles acompanham.
- **A2 — Saída sem codificação.** O forward escreve RGB linear no alvo; o canvas é `bgra8unorm` (não sRGB) e o
  passthrough copia sem codificar. `color.wgsl` tem `tonemap_exposure` (1 − e^(−c·k)) e `gamma_encode`, usados só pelo
  efeito opcional `ToneMapping`, aplicado sobre LDR.
- **A3 — Lambert fixo.** `math/brdf.wgsl`: `BRDF_AMBIENT = 0.18`, `BRDF_DIFFUSE = 0.82`, `lambert_diffuse`. Consumidores:
  `forward.wgsl`, `particle_sprite.wgsl`, `point_sprite.wgsl`, `diffuse/diffuse_sprite.wgsl`,
  `water/water_composite.wgsl` e o smoke `shaderLibrary`.
- **A4 — Luz por pontos de cena, uma direção.** Desde a 031 o forward não conhece luzes: chama
  `scene_light_direction()`, `light_visibility(p, n·l)` e `light_transmission(p, ambiente, direta)`
  (`elements/scene/points/lighting.ts`), com contribuições da `DirectionalLight` com `ShadowMap` e da `WaterSurface`; os
  sprites usam `scene_any_light_direction()` (primeira luz viva do pool). Cor, intensidade, tipo e alcance do pool
  `Light` (`Light.schema`: `kind`, `intensity`, `range`, `position`, `color`) nunca são lidos; não existe `SpotLight`.
- **A5 — Matriz normal já existe.** `WorldTransform.normal = R·S⁻¹` (inversa transposta) aplicada no `vs_main` do
  forward. O item "normal sem matriz normal" do ROADMAP §3.3 está desatualizado; a 011 só mede (escala (1, 3, 1), ≤ 1°).
- **A6 — Ponto `material` de quatro campos.** `SurfaceParams` = `base_color`, `roughness`, `metallic`, `emissive`
  (`material_point_types.wgsl`); o ponto `material` (`elements/material/point/shaders.ts`) aceita código ou grafo
  (`MaterialFunction({ graph })`, 031) e o grafo termina em `output.surfaceParams`. Funções de usuário constroem
  `SurfaceParams(...)` com 4 argumentos (smokes `parametricSurfaces`, `extensionPoints`, `support/extensionScenes`,
  `MaterialFunction.test.ts`) — crescer o struct quebra essas funções.
- **A7 — Grafos de ponto (031).** Nós são funções WGSL com portas tipadas por qualquer tipo WGSL (inclusive structs:
  `output.surfaceParams` sai `SurfaceParams`); o grafo compila para a função do ponto (um `let` por nó, ramificação
  avaliada uma vez); valores de parâmetro vivem no **registro tipado da forma** (`<ponto>:<hash>`) e não recompilam;
  sub-grafos de ponto viram nós (`Subgraph.point`, parâmetros expostos com valor por uso); `toJSON`/`fromJSON` com o
  `NodeRegistry`. 64 nós de ponto (entradas de contexto, matemática, mapeamento, ruído, espaço, superfície diferencial,
  campos, condição) — nenhum nó de cor/BSDF ainda.
- **A8 — Sem tangentes.** O vértice tem 32 B (posição, normal, uv). Anisotropia precisa de uma direção tangente; a
  superfície diferencial (010) dá a direção principal (`nodes.surface.principal`); malhas comuns não têm nada.
- **A9 — Água aproximada.** `water_composite.wgsl`: luz Lambert das constantes, Blinn-Phong, Fresnel puxando para
  `material.ambient` constante, `clamp(color, 0, 1)` no fim; fundo `textureLoad` sem filtro.
- **A10 — Cáusticas por fóton pontual.** `caustics.wgsl`: um fóton por texel (512²) depositado em B-spline 3×3 e borrão
  em tenda; o forward lê bilinear (pelo contribuinte da água em `light_transmission`). A densidade de fótons é a
  resolução do mapa: onde a refração espalha a luz, sobram poucos fótons por texel (ruído); de perto, o bilinear mostra
  a grade.
- **A11 — Sem transparência.** Desde a 031 nada no forward usa mistura (o arame é opaco com alpha-to-coverage); não há
  passe de transmissivos. A água tem a sua própria cópia de fundo.
- **A12 — Pós falso.** FXAA = média de 5 amostras, SSAO = diferença de luminância sem profundidade, bloom 5×5
  (`effects.wgsl`). Fora do escopo (014); a 011 só muda o formato da cadeia.
- **A13 — Bench.** `point-lights` (256 luzes, 200 objetos) declarada `unsupported` para a Clayflow `until: 'F4'`
  (`bench/scenes/point-lights/scene.ts`). O adaptador Three usa `three/webgpu` 0.186 com `addDefaultLighting` imitando
  o Lambert 0,18/0,82 (`bench/engines/three.ts`).
- **A14 — Fixtures de imagem.** Comparadas pixel a pixel: `render-*` (forward, ui, 8 de pós), 8 `fluidSurface-*`,
  `particles-{mpm-fluid,mpm-solid,pbf,sph}`, `softSurface-{fem-sprites,xpbd-cloth}`, `pointCloud`,
  `parametricSurfaces-{curvature,lake}`, as de `nodeGraphs`; hashes de imagem em `extensionPoints-*.json` e
  `parametricSurfaces-*.json`; limiares de cor fixos em `parametricSurfaces.ts` e `extensionPoints.ts`. Fixtures de
  estado (`trajectories`, `contacts`, `fluidBehavior`) não dependem do desenho. A profundidade em [0, 1] (N8) e o arame
  com alpha-to-coverage já foram regravados na 031.

## Decisões

### R1 — Alvo HDR e apresentação

**Decisão**: `FrameTargets.color`, `samples` e a cópia de fundo da água passam a `rgba16float`; o pingue-pongue do pós
também. O último passe do pós deixa de ser "passthrough" e vira a **apresentação**: exposição (EV), mapeamento de tons,
codificação sRGB e pontilhamento para a saída de 8 bits. Sem efeitos, a apresentação lê a cor multiamostrada e faz o
**resolve com mapeamento por amostra** (mapeia cada amostra, depois faz a média) — bordas de alto contraste (sol na
água, metal contra céu escuro) ficam suaves, o que o resolve linear de hardware não dá. Com efeitos, os efeitos operam
no HDR resolvido e a apresentação mapeia a saída do último.

**Alternativas**: tone mapping no fragment do forward (quebra água e transmissão, que precisam do linear); canvas
`rgba16float` sempre (custo de banda e não é suportado como saída padrão em todos os navegadores); manter o
passthrough separado do tone mapping (um passe a mais).

**Consequência no ROADMAP**: a meta da 014 "pós sem efeitos direto no canvas" deixa de existir — o HDR exige um passe
final; o passthrough de cópia some, substituído pela apresentação (que faz trabalho útil: resolve + mapeamento).

### R2 — Operadores de mapeamento de tons e saída HDR

**Decisão**: `ToneMapping` vira o Resource de apresentação da cena (um por cena, inserido pelos estágios padrão, como o
`FrameTargets`): `operator: 'agx' | 'aces' | 'neutral' | 'linear'` (padrão `'agx'`, o padrão do Blender 4 — melhor
preservação de matiz em realces saturados que o ACES), `exposure` em EV (padrão 0), `dither: true`, `output: 'sdr' |
'hdr'`. AgX pela aproximação polinomial de referência (Sobotka/Blender, matriz de entrada e saída + contraste
"base"), ACES pelo ajuste RRT+ODT de Hill, neutro pela curva Khronos PBR Neutral. Pontilhamento: ruído triangular de
±1 nível de código (gradiente intercalado, sem textura). `output: 'hdr'`: o canvas é configurado com
`toneMapping: { mode: 'extended' }` e formato `rgba16float` quando `GPUCanvasContext` aceita; a apresentação escreve a
luminância relativa ao branco de referência sem comprimir acima de 1; sem suporte, cai em `'sdr'` e anuncia
`presentationFallback`.

**Alternativas**: só ACES (realces saturados viram amarelo/branco; o próprio Blender trocou); Reinhard (achata
contraste); LUT 3D (precisa de textura, fica para a 012 como opção).

**Consequência na C1**: `CanvasOptions` ganha `toneMapping` e `format` (configuração do contexto); nenhum valor da C1
atravessa — a C4 pede pela C2 como hoje pede `alphaMode`.

### R3 — Funções de espalhamento (BSDF)

**Decisão**: biblioteca WGSL `bsdf` com as funções físicas, usadas pelos nós (R5) e pela avaliação de luz (R7):
Cook-Torrance com GGX (isotrópico e anisotrópico, α_t/α_b como Kulla/OpenPBR), visibilidade de Smith correlacionada em
altura (Heitz), Fresnel de Schlick com F0 do IOR (dielétrico) e F82 para a borda do metal (OpenPBR); difuso Lambert e
Oren-Nayar energético (a rugosidade difusa do OpenPBR); sheen "Charlie" (Estevez-Kulla 2017) com visibilidade de
Neubelt; filme fino de Belcour-Barla 2017 (o do `KHR_materials_iridescence`); subsuperfície por perfil de Burley
avaliada como difuso com "wrap" por canal (a transição suave e colorida; o passe na tela é da 014). **Compensação de
múltiplo espalhamento** (Fdez-Agüera 2019 / Turquin): `1 + F0·(1/E_ss − 1)` com a tabela DFG de 2 canais (E(μ, α) e o
albedo do sheen) gerada **em compute** uma vez (32×32, `PbrTables`). **Controle de serrilhado especular**
(Tokuyoshi-Kaplanyan 2019): `α² += min(2·σ², κ)` com σ² das derivadas de tela da normal.

**Alternativas**: Blinn-Phong normalizado (não conserva energia); Smith não correlacionado (escurece bordas); sem
multiespalhamento (metal rugoso perde até 60 % da energia — reprova o teste de forno); aproximação analítica do DFG
(erro > 3 % no forno em rugosidade alta).

### R4 — Tangente por nó, sem mudar o vértice

**Decisão**: o vértice continua 32 B. A tangente é **uma entrada do lobo especular**, ligada por nós:
`nodes.geometry.tangentUv` (referencial cotangente por derivadas de tela de posição e uv — Schüler 2013; só
`fragment`), `nodes.surface.principal` (a direção principal da 010, já existente) ou qualquer vetor do grafo (projetado
no plano tangente pelo nó). Sem ligação, a tangente é a do referencial cotangente quando há uv, senão uma direção
estável derivada da normal. Girar o realce é girar o vetor no grafo (`nodes.space.rotate…` ou um parâmetro de ângulo do
nó).

**Alternativas**: atributo de tangente no vértice (muda o layout de 32 B, todas as geometrias, sombra, sprites e
fixtures); MikkTSpace na CPU (só geometrias de CPU, não as escritas pela GPU); enum `anisotropyFrame` no material (o
plano rejeitado: escolha fixa em vez de ligação).

### R5 — Material como grafo de nós BSDF (fechamento de lobos)

**Decisão**: o ponto `material` passa a devolver um **fechamento** (`Closure`, struct WGSL) e os materiais são grafos
de nós que o produzem, como os nós de shader do Blender:

- **Nós BSDF** (cada um devolve `Closure` com um lobo e o seu peso): `bsdf.diffuse` (cor, rugosidade difusa),
  `bsdf.conductor` (cor F0, tinta da borda F82, rugosidade, anisotropia, tangente), `bsdf.dielectric` (IOR, cor
  especular, rugosidade, anisotropia, tangente — o especular de um dielétrico: reflexão, a energia restante segue para a
  camada de baixo), `bsdf.transmission` (IOR, cor e profundidade de absorção, número de Abbe, rugosidade),
  `bsdf.translucent` (parede fina: transmissão difusa sem refração), `bsdf.sheen` (cor, rugosidade),
  `bsdf.subsurface` (cor, raio por canal), `bsdf.emission` (cor, luminância em nits).
- **Nós de composição**: `closure.mix(a, b, t)`, `closure.add(a, b)`, `closure.layer(top, base)` (o de cima atenua o de
  baixo por `1 − F_top` direcional, com escurecimento e absorção pela cor do de cima no caminho de ida e volta — o
  verniz da madeira, a pintura de carro), `closure.thinFilm(c, espessura, ior)` (iridescência sobre o especular),
  `closure.opacity(c, alfa)`, `closure.normal(c, n)` (normal própria de um lobo; o verniz pode ter normal diferente da
  base).
- **Saídas**: `output.closure` (novo) e `output.surfaceParams` (009, mantido). Entradas sem ligação do
  `output.closure`: o fechamento pronto (R8).

**Representação**: o `Closure` tem um número fixo de lobos por tipo — difuso, especular de base, especular de cima
(verniz), sheen, transmissão, subsuperfície, emissão, opacidade e as normais. `closure.mix` e `closure.add` de dois
lobos do mesmo tipo e camada fundem os parâmetros pelo peso (rugosidade em α², cores lineares) — a mesma regra do
Blender EEVEE quando o número de fechamentos excede os bins; `closure.layer` põe o especular de cima na camada de cima.
A regra de fusão é documentada e medida (US3).

**Especialização pelo grafo**: cada nó BSDF declara os lobos que produz (metadado da definição); a compilação do grafo
conhece os lobos presentes e gera o avaliador só com eles (os ausentes não entram no shader). A máscara entra na chave
do pipeline, como a topologia na 008; mudar valores não recompila (registro tipado da 031); mudar a topologia recompila
em transição. Uma `MaterialFunction` de código declara os lobos que usa (`lobes: […]`).

**OpenPBR é um sub-grafo**: `nodes.material.openpbr` — `Subgraph.point` sobre os nós acima, com todos os parâmetros do
OpenPBR Surface 1.1 expostos (base, specular, coat, transmission, thin-walled, fuzz, thin-film, subsurface, emission,
geometry opacity). É um nó como outro qualquer: pode ser usado inteiro, decomposto ou misturado.

**Alternativas**: `StandardMaterial` com todos os parâmetros OpenPBR e pesos (o plano rejeitado: valores fixos que
ligam e desligam camadas); classes separadas por material (`GlassMaterial`, `ClothMaterial` — duplica shaders, não
compõe); uber-shader sem especialização (paga todos os lobos em todo pixel, ~3× o base); fechamentos dinâmicos de
tamanho arbitrário (não cabem num fragment shader sem memória dinâmica; o EEVEE também usa bins fixos).

### R6 — Transmissão e refração

**Decisão**: quando há algum material com lobo de transmissão ou opacidade (máscara da R5), a cor HDR resolvida dos
opacos (e da água) é copiada para a **cópia de cena com mips** (`sceneCopy`, uma por cena, nos `FrameTargets`, mips
gerados em compute — gaussiana separável por nível); a mesma cópia serve a água (substitui a vista `background`
própria da `WaterSurface`). Os transmissivos são desenhados num passe próprio em **duas camadas por descasque de
profundidade**: primeiro a camada mais distante (teste `greater` contra uma profundidade própria), lendo a cópia; nova
cópia; depois a mais próxima (`less`), lendo a cópia que já contém a camada distante — vidro atrás de vidro e o verso
de um objeto espesso aparecem, sem ordenação na CPU. Refração: o raio refratado pelo IOR percorre a espessura (distância
entre as duas camadas quando há as duas; senão a do lobo) e é projetado na tela; leitura no mip pela rugosidade.
Absorção Beer-Lambert pela cor e profundidade do lobo. **Dispersão**: IOR por canal pelo número de Abbe, três leituras.

**Alternativas**: ordenação de trás para frente na CPU (as posições são da GPU; ler de volta é proibido); OIT ponderado
(não refrata); traçado de raios (sem hardware no WebGPU; limitação documentada para 3+ camadas).

### R7 — Luzes por pontos de cena

**Decisão**: o desenho chama um único ponto de cena, `scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) ->
vec3f`, que **soma** as contribuições (o padrão `ContributionPoint` da 031, combinação por soma; pronto: zero). Cada
classe de luz contribui com o seu módulo, que percorre os slots vivos do pool `Light` do seu `kind` e avalia o
fechamento com `closure_eval(c, n, v, l, radiância)`:

- `DirectionalLight` (lux), `PointLight` e o novo **`SpotLight`** (candela; cones interno/externo com transição suave
  em cos) — atenuação física `I / d²` com janela suave até o alcance (`(1 − (d/r)⁴)²`, Frostbite/UE), descarte por
  alcance no laço;
- o novo **`HemisphereLight`** (cor do céu, do chão, intensidade): difuso por `mix(chão, céu, 0.5 + 0.5·n.y)` e
  especular pela radiância do hemisfério na direção refletida, alargada pela rugosidade, × DFG. Os estágios padrão
  inserem um (como o `FrameTargets`), exposto em `defaults.ambient`, ajustável e removível: some a constante 0,18.

A sombra e a água continuam pontos próprios, agora **por luz**: `light_visibility(light, p, n·l)` (a `ShadowMap` da luz
que projeta contribui; as outras luzes, 1) e `light_transmission(light, p) -> vec3f` (a água: cáusticas e absorção para
quem está embaixo; fora, 1). O sprite (`particle_sprite`, `point_sprite`, `diffuse_sprite`) usa o mesmo
`scene_lighting` com o fechamento do material da partícula sobre a normal do impostor; `scene_any_light_direction` e
`scene_light_direction` saem. **Sem luz direta na cena, só a ambiente ilumina**; smokes e cenas de bench que dependiam
da direção padrão ganham uma `DirectionalLight` explícita. Limite: 1024 luzes por cena (acima, ignoradas com aviso
único `lightLimit`); a 013 troca o laço pela lista por cluster.

**Alternativas**: laço de luzes dentro do forward (o forward voltaria a conhecer as luzes — o acoplamento que a 031
removeu); limite baixo (8, como engines antigas — inviabiliza `point-lights`); clustered já aqui (é a 013).

### R8 — Compatibilidade do ponto `material`

**Decisão**: `SurfaceParams` continua válido. O ponto `material` aceita os dois retornos, detectados na compilação
(pelo tipo de retorno da função de código ou pelo nó de saída do grafo): `-> SurfaceParams` (009) é adaptado por
`closure_from_params` — difuso + dielétrico IOR 1,5 + condutor pela metalicidade, a "base" do OpenPBR — e
`-> Closure` (011) vai direto. **Sem `MaterialFunction`**, a entidade usa o fechamento pronto (`closure_ready(m)`) das
constantes do `StandardMaterial` (cor, rugosidade, metalicidade, que já existem) — o mesmo adaptador. O
`StandardMaterial` não cresce: as camadas vêm do grafo, não de campos fixos.

**Alternativas**: crescer `SurfaceParams` (quebra todas as funções existentes, A6); um segundo ponto para fechamentos
(duplica o registro e a escolha de adaptador); `StandardMaterial` com todos os parâmetros (o plano rejeitado).

### R9 — Mesmo modelo nos sprites e na água

**Decisão**: o sombreamento é `closure_eval` (R3, R5) com `scene_lighting` (R7) em todo desenho iluminado — malhas,
superfícies paramétricas, geometrias de grafo, sprites de partícula e partículas secundárias. A água
(`water_composite`) avalia um fechamento dielétrico de IOR do material: Fresnel exato (sem o fator arbitrário
`reflectivity`), especular GGX com a rugosidade da água (nova: `roughness`, padrão 0,02), reflexo do `HemisphereLight`
na direção refletida, refração na `sceneCopy` com leitura bilinear filtrada, absorção Beer-Lambert, sem `clamp` em
[0, 1]. `ambient`, `shininess` e `reflectivity` do `FluidSurfaceMaterial` ficam obsoletos (aviso único;
`shininess` → rugosidade equivalente). `lambert_diffuse`, `BRDF_AMBIENT` e `BRDF_DIFFUSE` saem (cada símbolo uma vez;
`shaderLibrary` atualizado).

### R10 — Cáusticas por malha refratada

**Decisão**: trocar o fóton pontual pela **malha de cáusticas** (Evan Wallace, em compute + render): uma grade de N×N
vértices sobre a vista da luz da água (padrão 2× a resolução do mapa por eixo) é refratada em compute (o traçado de
hoje até o receptor) e desenhada como triângulos no mapa de cáusticas `rgba16float` com mistura aditiva; a intensidade
de cada triângulo é a razão de áreas (origem / chegada, pelas derivadas de tela), vezes Fresnel e absorção. Cada
triângulo cobre continuamente a área onde a luz chega: sem ruído de contagem e sem buracos, com bordas nítidas onde a
luz concentra. Mapa padrão 1024² (`WaterSurface.lightSize`). A leitura no contribuinte `light_transmission` da água usa
**B-spline bicúbico** (4 leituras bilineares): sem grade de perto. A mistura aditiva segue a ordem das primitivas
(definida pela API) — imagem determinística no mesmo dispositivo.

**Alternativas**: mais fótons por texel (custo linear, ruído persiste); borrão maior (borra as bordas nítidas);
acúmulo temporal (é da 014, e complementa — não substitui — a reconstrução contínua).

### R11 — Biblioteca de materiais como sub-grafos

**Decisão**: `nodes.material.*` — cada material pronto é um **sub-grafo de ponto** sobre os nós BSDF, com os
parâmetros relevantes expostos e valores físicos documentados (fonte): `woodRaw`, `woodVarnishedGloss`,
`woodVarnishedMatte`, `cotton`, `wool`, `velvet`, `silk`, `denim`, `sheerFabric`, `leather`, `rubber`, `ceramic`,
`porcelain`, `plasticMatte`, `plasticGloss`, `metalPolished`, `metalBrushed`, `carPaint`, `glass`, `metalOxidized`,
`skin`, `wax`, `marble` (IOR e F0 de tabelas publicadas: madeira ~1,53; verniz ~1,5; seda anisotropia ~0,8; vidro de
janela 1,52 / Abbe 58; ouro, alumínio, cobre e ferro com F0/F82 do OpenPBR). Uso:

- inteiro: `Materials.woodVarnishedGloss({ coat_color: … })` → `MaterialFunction` com o grafo de um nó;
- como nó num grafo maior: misturar madeira e metal por uma máscara de ruído, trocar o verniz por outro, ligar a
  rugosidade a um campo — o material pronto é ponto de partida, não um valor fixo;
- serializável (`toJSON`), registrado no `NodeRegistry` padrão.

As versões sem padrão (veios, trama, flocos) são uniformes; a 012 liga os padrões às mesmas entradas.

### R12 — Comparação com o Three.js

**Decisão**: cena de bench nova `materials` (galeria 5×5 de esferas com os materiais da biblioteca e os
correspondentes no `MeshPhysicalMaterial`: clearcoat, sheen, transmission, iridescence, anisotropy, dispersion), mais
`point-lights` (implementada agora) e uma variante `water-lake` com a água. Medidas no smoke `materials` (Clayflow) e
numa página de comparação lado a lado (as duas engines na mesma página, imagens lidas no fim — leitura de volta só no
teste):

- **faixas**: maior passo entre pixels vizinhos num gradiente e comprimento das sequências iguais;
- **energia**: teste de forno (hemisfério branco uniforme) por rugosidade — desvio da radiância;
- **cintilação especular**: variância temporal da luminância numa esfera brilhante sob câmera girando devagar;
- **serrilhado de borda**: energia de alta frequência ao longo das silhuetas de alto contraste;
- tempo de quadro pelo bench.
  O Three entra com `antialias: true` (MSAA 4×) e `AgX`/`ACESFilmic` equivalente para comparação justa.

### R13 — Fixtures

**Decisão**: as fixtures de imagem (A14) são regravadas **uma vez**, depois de toda a mudança visual, numa tarefa
própria com a lista e uma montagem antes/depois para o usuário; os limiares de cor fixos dos smokes são recalibrados
pela mesma montagem. As de estado ficam bit a bit (verificado).

### R14 — Vídeos

Galeria de materiais girando sob luz que se move; um grafo de material sendo editado (mistura madeira/metal por ruído,
verniz trocado); água (lago da 010 e tanque da 017) com o material novo e as cáusticas por malha de perto; comparação
lado a lado Clayflow × Three nas cenas `materials` e `water-lake`.
