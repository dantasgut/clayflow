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

### R15 — Espalhamento sob a superfície (T113)

**Decisão**: o perfil de difusão normalizado de Christensen e Burley 2015 ("Approximate Reflectance Profiles for
Efficient Subsurface Scattering"), R(r) = A (e^(−r/d) + e^(−r/3d)) / (8π d r) com d = ℓ/s e s = 1,9 − A + 3,5 (A − 0,8)²
(a luz que entra difusa), parametrizado pelo albedo da superfície `color` e pelo caminho livre médio `radius` em
**milímetros** por canal, com a escala do mundo `scale` (unidades por metro) no fechamento. No desenho, depois do passe
principal e só para as entidades com o lobo: a luz direta que entra por pixel é guardada sem amostras, juntada em volta
de cada ponto com amostragem por importância do perfil (número constante de amostras, o disco no plano tangente
projetado na tela, o peso por canal pelo perfil na distância de verdade até a superfície de cada amostra) e somada à cor
da cena menos a luz do próprio ponto. A luz que atravessa as partes finas usa a espessura do mapa de sombra da luz (da
primeira superfície que a luz vê até o ponto) e a parte do perfil além dela, ¼ e^(−t/d) + ¾ e^(−t/3d). No ponto (e nos
acertos dos raios) o lobo é o perfil integrado: o difuso de albedo `color`.

**Racional**:

- o perfil tem dois parâmetros com sentido físico (o albedo que se vê e o caminho livre médio que se mede), amostragem
  por importância com inversa exata e a mesma curva serve à difusão e à transmissão — conferidos contra um passeio
  aleatório (`material/reference/subsurface.ts`): a fração acumulada a menos de 0,03 para A ≤ 0,8; a transmissão pela
  placa a menos de 0,075, e **sem** o albedo como fator (o passeio mostra que a placa fina transmite quase tudo; com o
  albedo o modelo ficava 2 a 3 vezes abaixo);
- o passe principal fica como é (o lobo no ponto, com MSAA e com o alvo da luz do temporal) e a difusão entra como uma
  correção somada (o juntado menos o local): enquanto os pipelines dela compilam, ou com ela desligada, o material
  desenha certo no ponto, com a mesma energia; a soma é feita redesenhando a geometria na profundidade do passe
  principal, e a cobertura do MSAA vale para ela;
- só a luz direta é juntada: medir a luz rebatida de novo no passe custava 1,5 ms dos 5,7 ms da subsuperfície no quadro
  dos translúcidos, e ela já é lisa na escala do perfil;
- as amostras por pixel se alternam num padrão de 4 × 4 pixels e a soma faz a média do bloco na mesma superfície: 16
  amostras por pixel valem 256, sem grão e sem estado entre quadros (a acumulação temporal pelo canal da 037 pediria os
  vetores de movimento, que só existem no modo temporal); a luz do próprio ponto não entra na média — a borda nítida de
  uma sombra some exata.

**Alternativas consideradas**:

- **Perfil separável de Jimenez** (Jimenez et al. 2015, "Separable Subsurface Scattering"): dois passes de tela com um
  núcleo fixo por material, sem ruído. O núcleo é um ajuste artístico (soma de gaussianas por material, não o albedo e
  o caminho livre médio), a separação erra em superfícies curvas e em bordas de profundidade, e pede a irradiância de
  toda a tela num alvo e os parâmetros por pixel — no forward com MSAA, alvos a mais no passe principal de toda cena.
- **Passeio aleatório nos raios** (o volumétrico de produção): a verdade, e é a referência f64 daqui. No desenho pediria
  raios dentro do corpo por pixel (dezenas de eventos por caminho no mármore e no leite) e acumulação temporal. Nos
  acertos dos raios da luz rebatida seria um laço de eventos por acerto — custo fixo novo por raio —, e o que um acerto
  desses contribui é a média do perfil: o difuso do mesmo albedo dá a mesma energia. Fica de fora.
- **O "wrap" local de antes** (o terminador avançado por canal, raio adimensional): sem difusão entre pixels, sem a luz
  que atravessa e sem escala física — o que o usuário viu como "nada de SSS".
- **Parametrizar pelo caminho livre médio difuso** (a eq. 8 do artigo): equivalente; o caminho livre médio é o que as
  tabelas de Jensen et al. 2001 dão direto (1/(σ_s′ + σ_a)).

**Limites conhecidos**: a difusão é na tela (o que está fora dela não entra; peças diferentes no mesmo plano trocam
luz); só as luzes direcionais com sombra atravessam; a espessura é ao longo da direção da luz; acima de A = 0,9 o
perfil perde a cauda longa (0,065 na fração acumulada com A = 0,93).

### R16 — Reflexo nítido dos opacos lisos (T114)

**Decisão**: o reflexo do lobo especular liso de um opaco (o metal polido, o verniz, o plástico brilhante) vem de um
raio por pixel na direção refletida, traçado pela cadeia da refração — o mesmo pedido por pixel, a mesma fila, a mesma
reconstrução em meia resolução —, e somado à cor do desenho pelo peso do lobo. O desenho só escolhe os pixels (o lobo
liso, pela rugosidade do fechamento no ponto) e grava a direção e o peso; o passe principal deixa de fora a parte lisa
da especular indireta.

**Racional**: a luz indireta especular vinha das sondas da luz global (um mapa octaédrico de 8 × 8 por sonda) ou do
hemisfério de duas cores — sem imagem dos objetos. A cadeia da refração já segue um raio qualquer pela cena com o
material avaliado por classe, a luz direta com sombra no ponto atingido, a luz rebatida, o céu no escape e os
transmissivos no caminho: o reflexo de um opaco é o mesmo caminho começando na superfície em vez de na câmera. Custo
fixo por pixel liso; sem pixel liso, a fila fica vazia.

**Alternativas**:

- **Uma segunda cadeia só para o reflexo** (outro Resource, outro estágio): a mesma coisa duas vezes — os estados dos
  caminhos e a onda dos acertos em dobro na memória. Descartada (estrutura paralela equivalente).
- **Reflexo no espaço da tela**: não vê o que está fora do quadro nem atrás dos objetos (o céu acima, o vizinho
  encoberto); o motor não copia a tela para a refração pelo mesmo motivo.
- **Sondas de reflexo de resolução maior**: imagem pré-calculada consultada, com paralaxe errada perto dos objetos.
- **Decidir no material (uma marca de "liso")**: a rugosidade é valor do grafo, pode vir de um padrão (a ferrugem tem
  metal liso e óxido áspero no mesmo objeto): a decisão é por pixel.
- **Somar no desenho principal lendo o traçado do quadro anterior**: um quadro de atraso e nenhuma reprojeção. A soma
  depois do traçado, no mesmo quadro, não tem atraso.

**Limites conhecidos**: um reflexo só (o ponto atingido responde com a luz indireta no lobo liso dele); só entidades
com função `material`; a cena precisa da estrutura de raios (a da luz global ou a dos transmissivos) — sem ela o lobo
fica com a luz indireta; com MSAA o reflexo tem uma amostra por pixel e a soma vale para o pixel inteiro (a borda do
objeto coberta em parte fica com a luz indireta removida nas amostras sem pedido); a rugosidade entre 0,08 e 0,16
mistura um espelho com a luz indireta em vez de amostrar o lobo.

### R17 — Deslocamento: o relevo do material como geometria (T115)

**Decisão**: o relevo de um material é uma função de altura em milímetros, definida uma vez por nós
(`surface.uvSpace` → `pattern.*` → `surface.relief`; os dos materiais prontos são os sub-grafos `nodes.relief.*`), com
dois consumidores. No material, `surface.reliefNormal` inclina a normal por pixel. Na geometria, o ponto novo
`displacement` (`fn displacement_fn(s: SurfaceSample, data) -> f32`) é chamado pelos kernels do `SurfaceFlow`
(`surface_displaced_at`: a malha uniforme e a adaptativa) e move cada vértice da `ParametricSurface` ao longo da
normal; a função é a `DisplacementFunction` da entidade, cujo grafo é o mesmo sub-grafo ligado a
`surface.displacement`. A unidade é o milímetro, com a escala do mundo em unidades por metro (`scale`), como na
subsuperfície (R15).

**A passagem deslocamento → relevo → média**: os padrões filtram pela largura que recebem. No ponto `displacement` a
amostra traz, no lugar das derivadas de tela do uv, o dobro do passo da malha no uv: o detalhe com menos de quatro segmentos por
período não vira geometria (2026-11-24: antes era o passo, e as cristas de dois a quatro segmentos saíam em contas). No material a largura é a do pixel: o mesmo detalhe continua na normal até ficar menor que o pixel, e daí
vai à média. A malha adaptativa (spec 010) escolhe o nível de cada retalho pelo tamanho na tela (`screen`): de perto os
segmentos encolhem no mundo e mais relevo passa da normal para a geometria, sem regra à parte. Na adaptativa, o passo
de um vértice de borda é o do menor nível dos retalhos que a dividem (e no canto, dos quatro): os dois lados calculam a
mesma altura e não abre fresta.

**A normal dos vértices** continua a da superfície sem o relevo: a inclinação vem do material, do mesmo relevo, em
todas as frequências até o pixel. Gravar a normal deslocada no vértice somaria o relevo duas vezes nas frequências que
a malha resolve, ou obrigaria o material a avaliar o relevo duas vezes (na largura do pixel e na da malha) para
subtrair.

**Quem vê a geometria deslocada**: os vértices são gravados na GPU no buffer da geometria. O desenho, o mapa de sombra
virtual e a estrutura de raios (que reconstrói a hierarquia da malha adaptativa quando ela é escrita) leem esse buffer:
a silhueta, a sombra e os acertos dos raios são os da geometria deslocada. Nos acertos dos raios o material não tem as
tangentes do uv (`dpdu`, `dpdv` zero): a normal ali é a da superfície sem o relevo. O colisor de superfície
(`SurfaceColliderFlow`) amostra `surface_at`, sem o deslocamento.

**Achado — a caixa vazia na travessia dos raios**: a malha adaptativa abaixo do nível máximo deixa triângulos vazios na
hierarquia (a contagem é da GPU; a capacidade é a do nível máximo), com caixa invertida (mínimo > máximo). O teste de
lâminas (`ray_box`) dava [−∞, +∞] para essa caixa: todo raio que entrava no objeto descia pela parte vazia inteira. No
quadro do relevo (malhas no nível 4 com capacidade do nível 5: três quartos vazios) a luz rebatida custava ~40 ms
(65,5 ms o quadro; 24,3 ms depois). A caixa vazia passou a ser um erro de acerto (`lo.x <= hi.x` no teste), na GPU e
na referência.

**Custo medido** (quadro `relevo` da galeria, 1440 × 960, M4): 9,9 ms sem deslocamento; 26,7 ms com seis superfícies
deslocadas (~1,2 milhão de triângulos de ~1 px: o desenho ~11 ms, as páginas da sombra ~5 ms, os raios da luz rebatida
1,4 ms). O custo é o dos triângulos pequenos no desenho e na sombra; `screen` troca geometria por normal.

**Alternativas**:

- **Mapa de altura em imagem** (bitmap amostrado no vértice ou no pixel): proibido (nada de bitmap de altura; o padrão
  é material, calculado).
- **Relevo por paralaxe no pixel** (marchar a altura no fragmento): não muda a silhueta, a sombra projetada nem o que
  os raios acertam; um laço por pixel em toda a tela para um efeito que a geometria dá onde ela existe.
- **`set.displace` do grafo de conjunto** (spec 031): desloca uma malha de grade fixa, sem a malha adaptativa; serve à
  geometria por grafo, não ao relevo de um material numa superfície qualquer. Mantido como está.
- **Tesselação no desenho** (estágio de tesselação): não existe no WebGPU; e a geometria ficaria só no desenho — a
  sombra e os raios não a veriam.
- **A altura dentro da `SurfaceFunction`**: obrigaria cada superfície a conhecer o material; o ponto separado deixa a
  mesma superfície com ou sem relevo e o mesmo relevo em qualquer superfície.
- **Função de altura duplicada** (uma no material, outra na geometria): descartada — o sub-grafo do relevo é um nó
  usado nos dois grafos.

**Limites conhecidos**: só `ParametricSurface` (as malhas de vértices fixos — `SphereGeometry`, `BoxGeometry` — ficam
com o relevo na normal); o deslocamento é ao longo da normal (sem saliências que voltem sobre si); onde o uv converge
(os polos da esfera) o padrão aperta e o relevo com ele; na costura de um uv periódico as duas bordas calculam a altura
em uv 0 e 1 — iguais pelo período do padrão, a menos do arredondamento; a geometria diferencial (`SurfaceDiff`) é a da
superfície sem o relevo; a inclinação de `surface.reliefNormal` é presa em 76°; a ferrugem (`metalOxidized`) e os
tecidos de trama continuam com o relevo só na normal (`surface.bump`, em unidades do padrão).

### R18 — Variedade da biblioteca: lobo anisotrópico no reflexo, pintura metálica, tábuas e nós (T117)

**O lobo anisotrópico no reflexo traçado.** O reflexo dos opacos (R16) tem um raio por pixel e nenhum acúmulo próprio: o
filtro temporal da refração só existe com o antisserrilhado temporal e só para os pedidos dos transmissivos. O lobo do
metal escovado é estreito num eixo e largo no outro: a fração de espelho passa a ser a do eixo estreito (a rugosidade
vezes √(1 − |anisotropia|)) e a direção do raio é a refletida por uma micronormal sorteada no eixo largo — a marginal da
distribuição GGX das inclinações, s = α_l · q / √(1 − q²). O sorteio é o mesmo ao longo de uma linha da escova na tela
(a razão áurea no índice da linha através das ranhuras): o reflexo sai em fios, como as ranhuras o devolvem; deslocado
pelo desvio de subpixel da câmera, muda a cada quadro com o antisserrilhado temporal, e a resolução temporal (o canal
da spec 037) acumula o lobo. Alternativas descartadas: levar os pedidos de reflexo ao filtro temporal da refração (os
guias do filtro são os do ponto atingido, que muda a cada sorteio; e não cobre o MSAA); ranhuras explícitas na normal do
material (abaixo do pixel viram espelho). Limite: sem o antisserrilhado temporal o lobo é um fio por linha, com serrilha;
os lobos rugosos isotrópicos continuam com a luz das sondas.

**Pintura de carro.** A receita anterior (pigmento difuso + flocos esparsos + verniz) dá pérola ou laca. As outras
engines fazem a base metálica: o Principled BSDF do Blender com `metallic` 1 e `coat` 1 de normal própria, o verniz de
duas normais da Unreal, as três camadas do V-Ray/Arnold. Aqui: condutor da cor da tinta em 92 % da base, lobo médio
(0,36), a normal de cada floco inclinada até ~8°, a tinta da borda escura (o flop) e o verniz em camada com a normal
dele (o `closure.layer` já guarda a normal do verniz separada da da base). Os flocos precisam de ~2,5 px para aparecer:
abaixo disso o filtro dos padrões os leva à média — falta um modelo estatístico de brilhos pontuais abaixo do pixel.

**Tábuas.** `pattern.planks` devolve a coordenada de cada peça (com deslocamento próprio), e os padrões do veio leem
essa coordenada: cada tábua tem os seus anéis, na sua direção, sem um nó de madeira por arranjo. A emenda do veio cai
nas juntas. O relevo do veio não entra na normal dos assoalhos (as tangentes do uv não acompanham a peça girada): só a
junta e o poro, na normal do verniz.

**Nós da madeira.** Um monte gaussiano somado ao raio dos anéis (`pattern.rings`): onde a inclinação do monte passa da
do raio, os anéis fecham em voltas; em volta, desviam. O gradiente continua analítico.

**Fissuras da casca.** Um Voronoi com frequência por eixo (`pattern.fissures`) dá as placas alongadas e a rede que se
ramifica e se junta; a distância à borda é levada à métrica de `p`, para a fissura ter a mesma largura em qualquer
direção.

### R19 — Luz de área retangular e o lobo anisotrópico largo (T120)

**Decisão**: a luz de área é um tipo de luz do pool (`RectLight`, tipo 3: centro, normal, eixo da largura, meias
medidas, luminância em cd/m²) com uma contribuição própria a `scene_direct_lighting`: a resposta do fechamento com cada
lobo **integrado sobre o retângulo, por pixel, sem sorteio** (`closure_area_eval`). Os lobos especulares (a base, com a
anisotropia, e o verniz) partem o retângulo pelas células de uma grade polar no plano das inclinações da micronormal —
5 anéis de massa conhecida da GGX (até 97 %) por 8 raios, 48 cantos refletidos até o plano da luz, 40 células; cada
célula, recortada pelo retângulo (Sutherland-Hodgman), entra com o integrando exato na direção do centroide do pedaço
vezes o ângulo sólido dele, e a célula inteira dentro entra com a massa exata dela. Os lobos largos (difuso,
subsuperfície, parede fina, sheen) usam os 4 × 4 pontos de Gauss-Legendre do retângulo. Onde as luzes são lidas por
raio ou por volume (a luz rebatida, os acertos dos raios, a névoa), o painel vale pelo centro (`light_incoming`: a
luminância pela área e pelo cosseno, pelo inverso do quadrado). Erro medido contra a integral densa (referência f64
`material/reference/areaLight.ts`): até 3 % da energia do lobo, do espelho (α 0,0025) ao lobo largo (α 0,25),
isotrópico e anisotrópico, com o painel inteiro, pela metade e fora; o difuso, abaixo de 0,1 % (smoke `lighting`, caso
`rect-light`).

**Racional**: nas fotos de referência os realces são manchas largas (janela, painel de estúdio), que o sol — um ponto —
não dá; e o metal escovado mostra as fontes como manchas macias, esticadas através da escova, com os riscos por dentro.
A integral pelo lobo resolve os dois com a mesma peça: é exata no limite do espelho (as células ficam pequenas no
plano da luz e desenham a borda do painel com a largura delas, sem serrilha) e no do lobo largo (as células são maiores
que o painel e ele entra inteiro), e vale para o lobo anisotrópico sem nada a mais — a grade é a do lobo, com os dois α.
Sem sorteio, não há ruído no MSAA nem estado entre quadros (nenhuma série do canal 037 é necessária).

**O reflexo do ambiente no lobo anisotrópico largo (o metal escovado)**: as manchas das fontes vêm desta integral; o
resto do ambiente continua vindo da radiância das sondas (`closure_base_mirror`: o eixo largo é áspero, sem raio).
Avaliadas e descartadas: (a) várias amostras do lobo por pixel, traçadas e acumuladas pelo canal temporal — ruído no
MSAA (que não acumula) e fantasma no temporal para o que é só a imagem borrada de fontes que a integral analítica dá sem
custo de raio; (b) a sonda lida em várias direções ao longo do eixo largo — o mapa de cada sonda tem 8 × 8 direções
(~25° por texel), mais largo que o eixo largo do lobo (α 0,2: ~23° de largura a meia altura): espalhar as leituras não
muda o que se vê; o que limita é a resolução angular da sonda, não o número de leituras.

**Alternativas**:

- **LTC (Heitz et al. 2016)**: a integral exata de um lobo de cosseno transformado; precisa da tabela de ajuste (a
  matriz por rugosidade e ângulo, um ajuste não linear por texel), só cobre o GGX isotrópico (o anisotrópico pede uma
  tabela 4D: Kt et al. 2022) e cada lobo novo pede o seu ajuste. A grade do lobo não tem tabela e vale para qualquer
  lobo de que se saiba a distribuição das micronormais. Custo: a LTC é mais barata (um polígono integrado por lobo);
  fica como a otimização possível para os lobos isotrópicos.
- **Painel emissivo na cena visto pelo reflexo traçado**: só vale para os lobos lisos (um raio), dobra a luz com a das
  sondas no difuso e deixa o lobo médio e o anisotrópico com a sonda borrada.
- **Ponto mais representativo (Karis 2013)**: uma luz pontual deslocada com a energia corrigida — a forma da mancha não
  é a do painel; descartado (aproximação visual).
- **Amostras fixas no retângulo para o especular**: com o lobo mais estreito que o espaço entre as amostras, a mancha
  vira pontos.

**Limites conhecidos**: sem sombra da luz de área (a penumbra de um emissor extenso pede a visibilidade integrada — por
raios ou por um mapa de sombra com a largura do emissor); o painel não aparece no quadro nem nos reflexos traçados (é
luz, não geometria: uma esfera cromada mostra o painel pelo realce integrado, não pelo raio); a luz que atravessa os
materiais com subsuperfície (`scene_transmitted_lighting`) não inclui as luzes de área (falta a espessura, que vem do
mapa de sombra); a cauda do lobo além de 97 % da massa fica de fora (a mancha cai um pouco mais depressa longe do
painel: até 25 % a menos onde ela vale menos de 5 % do pico); custo fixo de 40 células por lobo especular e por luz de
área, em todo pixel alcançado (na galeria a 1440 × 960, três painéis: ver a T120).

**Metal escovado.** O acabamento da referência é o acetinado de lixa passada à mão: riscos finos quase paralelos, com a
direção variando alguns graus e cruzando-se, e riscos fundos isolados. `pattern.brush` dá a altura, a direção local
dos riscos (a tangente do lobo) e o risco fundo; o lobo é largo (rugosidade 0,33 a 0,47) e só moderadamente alongado
(anisotropia 0,15): as passadas cruzadas alargam o lobo também ao longo da escova. O condutor é aço inoxidável (F0
0,56, 0,57, 0,58): o tom chumbo vem de refletir a metade do ambiente escuro, sem escurecer nada. A mancha de uma fonte
se alonga **através** da escova (é o que as ranhuras fazem com a luz); na referência as manchas são largas ao longo dela
porque os painéis são largos — a galeria usa painéis mais largos que altos.
