# Research — 011 HDR e modelo de material físico em camadas

Levantamento na `develop` após o PR #45 (2026-10-15). Achados (A) com evidência; decisões (R) com alternativas.

## Achados

- **A1 — Cena em 8 bits.** `FrameTargets` declara `color` e `samples` com `format: 'canvas'`
  (`presentation/app/FrameTargets.ts:40,57`); o pingue-pongue do pós usa `core.canvasFormat` (`PostFlow.ts:166,220`);
  a cópia de fundo da água é `'canvas'` (`WaterSurface.ts:110`). Os pipelines do forward, sprites e água pegam o
  formato do slot de alvo (`ForwardFlow.ts:810`, `ParticleFlow.ts:261`, `WaterFlow.ts:254`) — trocando o formato dos
  `FrameTargets`, eles acompanham.
- **A2 — Saída sem codificação.** O forward escreve RGB linear no alvo; o canvas é `bgra8unorm` (não sRGB) e o
  passthrough copia sem codificar. `color.wgsl` tem `tonemap_exposure` (1 − e^(−c·k)) e `gamma_encode`, usados só pelo
  efeito opcional `ToneMapping`, aplicado sobre LDR.
- **A3 — Lambert fixo.** `math/brdf.wgsl`: `BRDF_AMBIENT = 0.18`, `BRDF_DIFFUSE = 0.82`, `lambert_lit`. Consumidores:
  `forward.wgsl`, `particle_sprite.wgsl`, `point_sprite.wgsl`, `diffuse/diffuse_sprite.wgsl`,
  `water/water_composite.wgsl` e o smoke `shaderLibrary`.
- **A4 — Uma luz, só a direção.** `forward.wgsl:94-99` lê `lights[lightSlot].direction`; sem luz, `DEFAULT_LIGHT_DIR`.
  O `lightSlot` é o da luz com `ShadowMap` (`ForwardFlow.ts:1056-1070`). `Light.schema` já tem `kind`, `intensity`,
  `range`, `position`, `color` (`elements/scene/Light.ts:42-50`); não existe `SpotLight` (o JSDoc cita).
- **A5 — Matriz normal já existe.** `WorldTransform.normal = R·S⁻¹` (`Transform.ts:52-56`), composta como inversa
  transposta (`transform_compose_fn.wgsl:38`) e aplicada no `vs_main` (`forward.wgsl:69`). O item "normal sem matriz
  normal" do ROADMAP §3.3 está desatualizado; a 011 só mede (escala (1, 3, 1), ≤ 1°).
- **A6 — Material de quatro campos.** `StandardMaterialSchema` = albedo, roughness, metallic + 2 pads;
  `SurfaceParams` = base_color, roughness, metallic, emissive (`material_point_types.wgsl`). Funções de usuário
  constroem `SurfaceParams(...)` com 4 argumentos (smokes `parametricSurfaces.ts:381`, `extensionPoints.ts:825`,
  `support/extensionScenes.ts:291`, teste `MaterialFunction.test.ts:20`) — crescer o struct quebra essas funções.
- **A7 — Sem tangentes.** O vértice tem 32 B (posição, normal, uv; `ForwardFlow.ts:67-77`). Anisotropia precisa de
  uma direção tangente; a superfície diferencial (010) já dá a direção principal; malhas comuns não têm nada.
- **A8 — Água aproximada.** `water_composite.wgsl:96-128`: luz Lambert das constantes, Blinn-Phong, Fresnel puxando
  para `material.ambient` constante, `clamp(color, 0, 1)` no fim; fundo `textureLoad` sem filtro.
- **A9 — Cáusticas por fóton pontual.** `caustics.wgsl`: um fóton por texel (512²) depositado em B-spline 3×3 e
  borrão em tenda; o forward lê bilinear (`forward.wgsl:117-150`). A densidade de fótons é a resolução do mapa: onde a
  refração espalha a luz, sobram poucos fótons por texel (ruído); de perto, o bilinear mostra a grade.
- **A10 — Sem transparência física.** Só o arame usa mistura alfa (`ForwardFlow.ts:910`); não há ordenação nem passe
  de transmissivos. A água tem a sua própria cópia de fundo.
- **A11 — Pós falso.** FXAA = média de 5 amostras, SSAO = diferença de luminância sem profundidade, bloom 5×5
  (`effects.wgsl`). Fora do escopo (014); a 011 só muda o formato da cadeia.
- **A12 — Bench.** `point-lights` (256 luzes, 200 objetos) declarada `unsupported` para a Clayflow `until: 'F4'`
  (`bench/scenes/point-lights/scene.ts:15`). O adaptador Three usa `three/webgpu` 0.186 com `addDefaultLighting`
  imitando o Lambert 0,18/0,82 (`bench/engines/three.ts:20-25`).
- **A13 — Fixtures de imagem.** Comparadas pixel a pixel: `render-*` (forward, ui, 8 de pós), 8 `fluidSurface-*`,
  `particles-{mpm-fluid,mpm-solid,pbf,sph}`, `softSurface-{fem-sprites,xpbd-cloth}`, `pointCloud`,
  `parametricSurfaces-{curvature,lake}`; hashes de imagem em `extensionPoints-*.json` e `parametricSurfaces-*.json`;
  limiares de cor fixos em `parametricSurfaces.ts:1062` e `extensionPoints.ts:738`. Fixtures de estado
  (`trajectories`, `contacts`, `fluidBehavior`) não dependem do desenho.

## Decisões

### R1 — Alvo HDR e apresentação

**Decisão**: `FrameTargets.color`, `samples` e a cópia de fundo da água passam a `rgba16float`; o pingue-pongue do pós
também. O último passe do pós deixa de ser "passthrough" e vira a **apresentação**: exposição (EV), mapeamento de tons,
codificação sRGB e pontilhamento para a saída de 8 bits. Sem efeitos, a apresentação lê a cor multiamostrada e faz o
**resolve com mapeamento por amostra** (mapeia cada amostra, depois faz a média) — bordas de alto contraste (sol na
água, metal contra céu escuro) ficam suaves, o que o resolve linear de hardware não dá. Com efeitos, os efeitos operam
no HDR resolvido e a apresentação mapeia a saída do último.

**Alternativas**: tone mapping no fragment do forward (quebra mistura, água e transmissão, que precisam do linear);
canvas `rgba16float` sempre (custo de banda e não é suportado como saída padrão em todos os navegadores); manter o
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
luminância relativa ao branco de referência sem comprimir acima de 1 (o operador comprime só até o pico da tela);
sem suporte, cai em `'sdr'` e anuncia `presentationFallback`.

**Alternativas**: só ACES (realces saturados viram amarelo/branco; o próprio Blender trocou); Reinhard (achata
contraste); LUT 3D (precisa de textura, fica para a 012 como opção).

**Consequência na C1**: `CanvasOptions` ganha `toneMapping` e `format` (configuração do contexto); nenhum valor da C1
atravessa — a C4 pede pela C2 como hoje pede `alphaMode`.

### R3 — Modelo de sombreamento (base e especular)

**Decisão**: Cook-Torrance com GGX, visibilidade de Smith correlacionada em altura (Heitz) e Fresnel de Schlick com F0
do IOR (dielétrico) ou da cor (metal; F82 de OpenPBR para a borda do metal: `specular_color` como tinta da borda).
Difuso: Lambert energético (`(1 − F_avg)` da camada especular por cima, como no OpenPBR, base dielétrica sob um
"verniz" especular). **Compensação de múltiplo espalhamento** (Fdez-Agüera 2019 / Turquin): fator `1 + F0·(1/E_ss − 1)`
com a tabela DFG de 2 canais (E(μ, α) e o termo do sheen) gerada **em compute** uma vez na inicialização (32×32, sem
textura em arquivo). Anisotropia: GGX anisotrópico (α_t, α_b de `roughness` e `specular_anisotropy`, como Kulla/OpenPBR)
com a tangente da R4. Controle de serrilhado especular: rugosidade alargada pela variância da normal na tela
(Tokuyoshi-Kaplanyan 2019: `α² += min(2·σ², κ)` com σ² das derivadas da normal).

**Alternativas**: Blinn-Phong normalizado (não conserva energia); Smith não correlacionado (escurece bordas); sem
multiespalhamento (metal rugoso perde até 60 % da energia — reprova o teste de forno).

### R4 — Tangente sem mudar o vértice

**Decisão**: o vértice continua 32 B. A tangente vem do **referencial cotangente** por derivadas de tela de posição e
uv no fragment (Schüler 2013) quando a geometria tem uv; nas superfícies diferenciais (010), da direção principal; sem
uv nem superfície, de uma direção de mundo do material (`specular_anisotropy_direction` como vetor de mundo projetado
no plano tangente). O material declara `anisotropyFrame: 'uv' | 'principal' | 'world'`.

**Alternativas**: atributo de tangente no vértice (muda layout de 32 B, todas as geometrias, sombra, sprites e
fixtures — o mesmo motivo que manteve o pool diferencial separado na 010); MikkTSpace na CPU (só geometrias de CPU,
não as escritas pela GPU).

### R5 — Camadas OpenPBR e especialização

**Decisão**: o `StandardMaterial` passa a ter **todos** os parâmetros do OpenPBR Surface 1.1 relevantes ao tempo real
(base, specular, coat, transmission, thin-walled, fuzz/sheen, thin-film, subsurface, emission, geometry opacity),
com valores neutros por padrão (= o material de hoje: base com rugosidade e metalicidade, IOR 1,5). Como a maioria dos
materiais usa poucas camadas, o pipeline é **especializado por máscara de camadas ativas** (constantes `override` do
WGSL: `LAYER_COAT`, `LAYER_TRANSMISSION`, …): a máscara entra na chave do grupo de desenho (como a topologia na 008); o
código das camadas desligadas é eliminado na compilação. Uma função `material` declara as camadas que pode ligar (por
opção da `MaterialFunction`), o que entra na máscara.

Camadas:

- **Verniz (coat)**: segundo lobo GGX isotrópico com IOR e rugosidade próprios, Fresnel do verniz atenuando a base
  `(1 − F_coat)`, absorção pela cor do verniz no caminho de ida e volta, escurecimento da base (`coat_darkening`) pela
  reflexão interna total aproximada do OpenPBR, normal própria do verniz igual à geométrica (a 012 dá mapas separados).
- **Transmissão**: R6.
- **Parede fina (thin-walled)**: transmissão difusa (translucidez) sem refração; a luz do outro lado entra pelo
  cosseno do verso.
- **Sheen (fuzz)**: distribuição "Charlie" (Estevez-Kulla 2017) com visibilidade de Neubelt; atenua a base pelo albedo
  do sheen (canal 2 da tabela DFG).
- **Filme fino**: Belcour-Barla 2017 (o modelo do `KHR_materials_iridescence`), espessura em nm e IOR do filme, sobre
  o Fresnel da base/especular.
- **Subsuperfície (no modelo)**: difusão por perfil de Burley normalizado avaliada como difuso com "wrap" dependente do
  raio por canal (cor de espalhamento × raio) e transmissão pelo verso em objetos finos; dá a transição suave e
  colorida da pele. O passe de espalhamento na tela (Jimenez) é da 014 e lerá estes mesmos parâmetros.
- **Emissão**: `emission_color × emission_luminance` (nits), somada antes da apresentação; sem limite em 1.
- **Opacidade**: `geometry_opacity` < 1 manda o objeto ao passe de transmissivos com mistura alfa.

**Alternativas**: classes separadas por material (`GlassMaterial`, `ClothMaterial`) — duplica shaders e quebra a função
`material` única; uber-shader sem especialização — paga todas as camadas em todo pixel (≈ 3× o custo do base);
`MeshPhysicalMaterial`-like (glTF) — subconjunto do OpenPBR (sem coat colorido com escurecimento, sem fuzz com
rugosidade, sem subsuperfície), e a meta é superá-lo.

### R6 — Transmissão e refração

**Decisão**: após os opacos (e a água), a cor HDR resolvida é copiada para a **cópia de cena com mips** (`sceneCopy`,
uma por cena, nos `FrameTargets`, cadeia de mips gerada em compute — gaussiana separável por nível); a mesma cópia
serve a água (substitui o `background` próprio da `WaterSurface`). Os transmissivos são desenhados num passe próprio
em **duas camadas por descasque de profundidade**: primeiro a camada mais distante (teste `greater` contra uma
profundidade própria), lendo a cópia; nova cópia; depois a mais próxima (`less`), lendo a cópia que já contém a camada
distante. Assim vidro atrás de vidro e o verso de um objeto espesso aparecem, sem ordenação na CPU. Refração: o raio
refratado pelo IOR percorre `transmission_depth`/espessura do objeto (espessura = distância entre a camada de frente e
a de trás quando há as duas; senão `thickness` do material) e é projetado na tela; leitura no nível de mip pela
rugosidade (lobo de transmissão alargado). Absorção Beer-Lambert por `transmission_color` à `transmission_depth`.
**Dispersão**: IOR por canal pelo número de Abbe (`n_λ = n_d + (n_d − 1)/V · (λ_d⁻² … )` simplificado nas três
amostras R, G, B), três leituras deslocadas.

**Alternativas**: ordenação de trás para frente na CPU (as posições são da GPU; ler de volta é proibido); OIT ponderado
(não refrata); traçado de raios (não há hardware no WebGPU; documentado como limitação para 3+ camadas).

### R7 — Luzes

**Decisão**: o sombreamento soma **todas as luzes do pool** (direcional, pontual, spot), até 1024 por cena (acima:
ignoradas com aviso único `lightLimit` e a contagem exposta), com descarte por alcance no laço. Novo `SpotLight`
(`innerConeAngle`, `outerConeAngle`, transição suave em cos). Atenuação física: `I / d²` com janela suave até o alcance
(`(1 − (d/r)⁴)²`, a do Frostbite/UE). Unidades: direcional em lux, pontual e spot em candela, emissão em nits; com a
exposição padrão (EV 0 = ×1) as cenas são autoradas como hoje (sol ~3) — luzes realistas (sol 100 000 lux) usam EV
alto, documentado. Novo **`HemisphereLight`** (cor do céu, cor do chão, intensidade): a luz ambiente difusa (irradiância
de hemisfério por `mix(chão, céu, 0.5 + 0.5·n.y)`) e especular (radiância do hemisfério na direção refletida, alargada
pela rugosidade, × DFG). Os estágios padrão inserem um `HemisphereLight` (como inserem o `FrameTargets`), exposto em
`defaults.ambient` e ajustável/removível: some a constante 0,18 escondida. **Sem luz direta na cena, só a ambiente
ilumina** (não há mais direção padrão escondida); smokes e cenas de bench que dependiam dela ganham uma
`DirectionalLight` explícita. A sombra continua a da luz que projeta (013 dá sombras às outras).

Laço sem iluminação clustered: 256 luzes × 1280×720 é o caso do bench `point-lights` (A12), que passa a ter
implementação Clayflow e mede o custo contra o Three; a 013 troca o laço pela lista por cluster.

**Alternativas**: limite baixo (8, como engines antigas) — inviabiliza `point-lights`; clustered já aqui — é a 013.

### R8 — Função `material` com camadas, compatível

**Decisão**: `SurfaceParams` (4 campos) continua existindo e válido. Novo struct `SurfaceLayers` com todas as camadas.
O ponto `material` aceita duas assinaturas, detectadas pelo tipo de retorno no texto da função:
`material_fn(s, m, data) -> SurfaceParams` (009; adaptador `surface_layers_from_params` preenche o resto a partir de
`m`) e `material_fn(s, m, data) -> SurfaceLayers` (011; a função recebe também os valores do material em
`material_layers_default(m)` para mudar só o que quiser). Ambas passam por `material_eval`, que devolve
`SurfaceLayers` ao sombreamento.

**Alternativas**: crescer `SurfaceParams` (quebra todas as funções existentes, A6); um segundo ponto (`material_layers`)
— duplica o mecanismo de registro e a escolha de adaptador.

### R9 — Mesmo modelo nos sprites e na água

**Decisão**: o sombreamento vira o módulo `lighting` (laço das luzes, ambiente, sombra) sobre `pbr` (BRDF, camadas) e
`pbr_dfg` (tabela). `particle_sprite`, `point_sprite`, `diffuse_sprite` usam a normal do impostor esférico com o
material base (cor, rugosidade); a água (`water_composite`) usa `pbr` com uma camada dielétrica de IOR do material:
Fresnel exato (Schlick com F0 do IOR, sem o fator arbitrário `reflectivity`, que vira peso do especular documentado
como 1 = físico), especular GGX com a rugosidade da água (nova: `roughness`, padrão 0,02), reflexo do
`HemisphereLight` na direção refletida, refração na `sceneCopy` com leitura bilinear filtrada, absorção Beer-Lambert,
e sem `clamp` em [0, 1]. `ambient`, `shininess` e `reflectivity` do `FluidSurfaceMaterial` ficam obsoletos (mantidos
com aviso de obsolescência e mapeados: `shininess` → rugosidade equivalente). `lambert_lit` e as constantes saem da
biblioteca (cada símbolo uma vez; `shaderLibrary` atualizado).

### R10 — Cáusticas por malha refratada

**Decisão**: trocar o fóton pontual pela **malha de cáusticas** (o método de Evan Wallace, feito em compute + render):
uma grade de N×N vértices sobre a vista da luz da água (padrão 2× a resolução do mapa por eixo) é refratada em compute
(mesmo traçado de hoje até o receptor) e desenhada como triângulos no mapa de cáusticas `rgba16float` com mistura
aditiva; a intensidade de cada triângulo é a razão de áreas (área de origem / área de chegada, pelas derivadas de
tela no fragment), vezes Fresnel e absorção. Cada triângulo cobre continuamente a área onde a luz chega: sem ruído de
contagem e sem buracos, com bordas de cáustica nítidas onde a luz concentra. Resolução padrão do mapa sobe para 1024²
(`WaterSurface.lightSize`). O forward lê o mapa com **filtro B-spline bicúbico** (4 leituras bilineares) em vez do
bilinear: sem grade visível de perto. A mistura aditiva em `rgba16float` segue a ordem das primitivas (definida pela
API) — imagem determinística no mesmo dispositivo.

**Alternativas**: mais fótons por texel (custo linear e ruído ainda presente); borrão maior (borra as bordas nítidas,
o oposto do físico); acúmulo temporal (é da 014, e complementa — não substitui — a reconstrução contínua).

### R11 — Biblioteca de materiais

**Decisão**: `Materials` (fábricas estáticas no domínio do material, como `ParticleMaterial.WATER`):
`WOOD_RAW`, `WOOD_VARNISHED_GLOSS`, `WOOD_VARNISHED_MATTE`, `COTTON`, `WOOL`, `VELVET`, `SILK`, `DENIM`, `SHEER_FABRIC`,
`LEATHER`, `RUBBER`, `CERAMIC`, `PORCELAIN`, `PLASTIC_MATTE`, `PLASTIC_GLOSS`, `METAL_POLISHED`, `METAL_BRUSHED`,
`CAR_PAINT`, `GLASS`, `METAL_OXIDIZED`, `SKIN`, `WAX`, `MARBLE` — cada um uma função `(overrides?) => StandardMaterial`
com valores documentados e a fonte (IOR e F0 de tabelas publicadas: madeira ~1,53; verniz ~1,5; seda anisotropia
~0,8; vidro de janela 1,52 / Abbe 58; ouro, alumínio, cobre e ferro com F0/F82 do OpenPBR). As versões sem padrão
(veios, trama, flocos) são uniformes; a 012 liga os padrões às mesmas camadas.

### R12 — Comparação com o Three.js

**Decisão**: cena de bench nova `materials` (galeria 5×5 de esferas com os materiais da biblioteca correspondentes no
`MeshPhysicalMaterial`: clearcoat, sheen, transmission, iridescence, anisotropy, dispersion), mais `point-lights`
(implementada agora) e uma variante `water-lake` com a água. Medidas no smoke `materials` (Clayflow) e numa página de
comparação lado a lado (ambas as engines na mesma página, imagens lidas no fim — leitura de volta só no teste):

- **faixas**: maior passo entre pixels vizinhos num gradiente e comprimento das sequências iguais;
- **energia**: teste de forno (hemisfério branco uniforme) por rugosidade — desvio da radiância;
- **cintilação especular**: variância temporal da luminância numa esfera brilhante sob câmera girando devagar;
- **serrilhado de borda**: energia de alta frequência ao longo das silhuetas de alto contraste;
- tempo de quadro pelo bench.
  O Three entra com `antialias: true` (MSAA 4×) e `ACESFilmic`/`AgX` equivalente para comparação justa.

### R13 — Fixtures

**Decisão**: as fixtures de imagem (A13) são regravadas **uma vez**, depois de toda a mudança visual, numa tarefa
própria com a lista e uma montagem antes/depois para o usuário; os limiares de cor fixos dos smokes são recalibrados
pela mesma montagem. As de estado ficam bit a bit (verificado).

### R14 — Vídeos

Galeria de materiais girando sob luz que se move; água (lago da 010 e tanque da 017) com o material novo e as cáusticas
por malha de perto; comparação lado a lado Clayflow × Three nas cenas `materials` e `water-lake`.
