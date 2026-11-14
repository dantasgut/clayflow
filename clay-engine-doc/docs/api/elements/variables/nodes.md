[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / nodes

# Variable: nodes

> `const` **nodes**: `object`

Defined in: [src/elements/nodes/index.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/index.ts#L60)

Biblioteca base de nós da C3 (spec 031, R12): entradas de contexto (`input`: argumentos do ponto alvo, sem código),
matemática, mapeamentos, rampas de cor, ruídos, condições, conversões de espaço, campo da cena, geometria diferencial e
saídas — nós de ponto, cada um com a referência da CPU em `reference/` e a tolerância documentada em
`reference/library.ts` —; e os nós de conjunto (`set`). Os de ponto valem em todos os estágios, salvo os que dizem o
contrário (`output.surfaceParams`, só `fragment`).

## Type Declaration

### bsdf

> **bsdf**: `object`

Nós de espalhamento: um lobo cada.

#### bsdf.conductor

> **conductor**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Especular de condutor (metal): F0 na cor, tinta da borda F82, rugosidade, anisotropia em [−1, 1] e tangente.

#### bsdf.dielectric

> **dielectric**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Especular de dielétrico: reflexão pelo IOR, tinta, rugosidade, anisotropia e tangente — a energia que não reflete
segue para os lobos de baixo (difuso, subsuperfície, transmissão).

#### bsdf.diffuse

> **diffuse**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Difuso (Oren-Nayar energético; rugosidade 0 = Lambert).

#### bsdf.emission

> **emission**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Emissão: cor × luminância em nits (sem teto até o limite do formato HDR).

#### bsdf.sheen

> **sheen**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Brilho de fibra (veludo, algodão): cor e rugosidade do sheen.

#### bsdf.subsurface

> **subsurface**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Subsuperfície no modelo (pele, cera, mármore): cor e raio de espalhamento por canal em [0, 1].

#### bsdf.translucent

> **translucent**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Parede fina translúcida (cortina, folha): a luz de trás atravessa espalhada, sem refratar o fundo.

#### bsdf.transmission

> **transmission**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Transmissão com refração do que está atrás: IOR, a cor atingida a `depth` unidades de percurso (Beer-Lambert; 0 = sem
absorção), número de Abbe (dispersão; 0 = sem) e rugosidade.

### closure

> **closure**: `object`

Nós de composição de fechamentos.

#### closure.add

> **add**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Soma `a` e `b` (os lobos nos seus bins; um dielétrico fica sobre o difuso).

#### closure.layer

> **layer**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Camada: o especular dielétrico de `top` como verniz sobre `base`, atenuando-a pelo que reflete e pela cor de absorção
`top_color`, com o peso `top_weight` (o verniz da madeira, a pintura de carro).

#### closure.mediumPriority

> **mediumPriority**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Prioridade do meio na sobreposição de volumes transmissivos (o vidro mergulhado na água: o de maior prioridade vale
dentro dele, e a borda do outro que passa por dentro não é interface). Empate: o último em que o raio entrou.

#### closure.mix

> **mix**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Mistura `a` e `b` por `t` em [0, 1] (0 = `a`): a máscara entre dois materiais.

#### closure.normal

> **normal**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Normal própria dos lobos de base (de um nó ou de um campo); comprimento 0 = a geométrica.

#### closure.opacity

> **opacity**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Opacidade (recorte parcial) em [0, 1]: o material vai ao passe de transmissivos.

#### closure.thinFilm

> **thinFilm**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Filme fino (iridescência) de espessura em nm e IOR do filme sobre o especular de base.

#### closure.thinWalled

> **thinWalled**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Transmissão como parede fina (o `thin_walled` do OpenPBR): placa de espessura zero — vidraça, bolha. A luz atravessa
sem desviar e reflete com as reflexões múltiplas entre as faces (2R/(1 + R)); absorção e rugosidade da transmissão
não valem nela.

### color

> **color**: `object`

Nós de cor.

#### color.hsv

> **hsv**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Cor de matiz (voltas em [0, 1)), saturação e valor.

#### color.luminance

> **luminance**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Luminância (Rec. 709) de uma cor linear.

#### color.ramp

> **ramp**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Rampa de cor de dois pontos: `color_a` em `low`, `color_b` em `high`, linear, presa nos extremos.

#### color.ramp4

> **ramp4**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Rampa de cor de quatro paradas: `stopK.rgb` na posição `stopK.w` (posições crescentes), linear por trecho, presa nos
extremos. Padrão: preto, vermelho, amarelo, branco em 0, 1/3, 2/3, 1.

#### color.rgb

> **rgb**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Cor das componentes `r`, `g`, `b` (cada uma com valor ou ligação).

#### color.temperature

> **temperature**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Cor de corpo negro da temperatura em K (1000–40000), normalizada no máximo 1.

### condition

> **condition**: `object`

Condições: comparação e escolha.

#### condition.compare

> **compare**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Comparação de `a` com `b` (padrão 0): 1,0 verdadeiro, 0,0 falso. `op` (`compareOps`; padrão `less`) muda sem
recompilar; igualdade dentro de `epsilon`.

#### condition.select

> **select**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Escolha escalar: `if_true` com `condition` > 0,5, senão `if_false`.

#### condition.select3

> **select3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Escolha de `vec3f` (cores, posições): `if_true` com `condition` > 0,5, senão `if_false`.

### field

> **field**: `object`

Campo da cena.

#### field.sample

> **sample**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

A aceleração (m/s²) dos campos da cena — os prontos e as funções `field` — sobre um corpo (`inv_mass`, `density`,
`volume`) na posição `x` com velocidade `v` (padrão 0) no tempo `time` (padrão 0). É o ponto de cena `field`: a C2
compõe os campos em todo shader que usa o nó. Não vale dentro de uma função `field` (chamaria a si mesma).

### geometry

> **geometry**: `object`

Nós de geometria do fragmento.

#### geometry.tangentUv

> **tangentUv**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Tangente pelo uv (spec 011, R4): a direção de u na superfície, pelas derivadas de tela da posição e do uv — a tangente
do especular anisotrópico de malhas sem tangente no vértice. Só no fragmento.

### input

> **input**: `object`

Entradas de contexto: amostra de superfície e posição de mundo (`material`), material da entidade (`material`),
vértice (entradas de ponto dos nós de conjunto), partícula (`field`, `emit`), célula da grade paramétrica (`surface`),
tempo (pontos com argumento `time`), câmera (`camera`).

#### input.camera

> `readonly` **camera**: (`name`) => [`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

Um argumento do ponto `camera`: a câmera `c` (projeção, `fov`, `orthoHeight`, `near`, `far`, `aspect`), a matriz
de mundo `world` (`mat4x4f`) ou a razão de aspecto do alvo `aspect`.

##### Parameters

###### name

[`CameraArgument`](../type-aliases/CameraArgument.md)

##### Returns

[`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

#### input.cell

> `readonly` **cell**: (`name`) => [`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

A célula da grade paramétrica do ponto `surface`: a coordenada `u` ou `v` (`f32`) da amostra.

##### Parameters

###### name

`"v"` \| `"u"`

##### Returns

[`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

#### input.material

> `readonly` **material**: () => [`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

As constantes do material da entidade (`m`, ponto `material`).

##### Returns

[`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

#### input.particle

> `readonly` **particle**: (`name`) => [`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

Um argumento de partícula: no ponto `field`, a posição `x`, a velocidade `v` (`vec3f`) e o corpo `body` (massa
inversa, densidade, volume); no ponto `emit`, o índice global `i` e a semente `seed` (`u32`) da emitida.

##### Parameters

###### name

[`ParticleArgument`](../type-aliases/ParticleArgument.md)

##### Returns

[`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

#### input.surfaceSample

> `readonly` **surfaceSample**: () => [`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

A amostra de superfície do ponto `material` (`s`): posição de mundo, normal, uv, tempo, a geometria diferencial
da 010 (`metric`, `curvature`, `principal`) e a largura do pixel ou do cone do raio no ponto (`footprint`, em
metros) com as derivadas do uv (`duvdx`, `duvdy`) — a entrada `width` dos nós de ruído (spec 034).

##### Returns

[`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

#### input.time

> `readonly` **time**: () => [`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

O tempo simulado (argumento `time` dos pontos `surface`, `space`, `field`, `transform`, `camera` e `emit`). No
ponto `material` o tempo é o campo `time` da amostra (`surfaceSample`).

##### Returns

[`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

#### input.vertexField

> `readonly` **vertexField**: (`name`) => [`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

Um argumento das entradas de ponto dos nós de conjunto — o vértice (`height` de `set.displace`, `density` de
`set.distributeOnMesh`): `position` e `normal` (`vec3f`) ou `uv` (`vec2f`) do elemento.

##### Parameters

###### name

`"position"` \| `"normal"` \| `"uv"`

##### Returns

[`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

#### input.worldPosition

> `readonly` **worldPosition**: () => [`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

A posição de mundo da amostra do ponto `material` (`s.world_position`).

##### Returns

[`GraphArgument`](../../platform/web/interfaces/GraphArgument.md)

### map

> **map**: `object`

Mapeamentos escalares: faixa e curva por pontos.

#### map.curve4

> **curve4**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Curva por quatro pontos `pK = (x, y)` (x crescente): linear por trecho, constante fora dos extremos. Padrão: a
identidade em [0, 1].

#### map.range

> **range**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Faixa: `x` de `[in_min, in_max]` para `[out_min, out_max]`, linear; presa nos extremos com `clamped` ≠ 0 (padrão).
Faixa de entrada vazia: tratada como 1e-6.

### material

> **material**: `object`

Materiais como sub-grafos de ponto (spec 011, R11): o OpenPBR e a biblioteca de materiais prontos.

#### material.openpbr

> **openpbr**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

`material.openpbr` — o OpenPBR Surface 1.1 como nó (sem entradas; os parâmetros da norma com valor por uso):
`nodes.material.openpbr.with({ base_metalness: 0.9, coat_weight: 1, coat_roughness: 0.03 })`. Devolve o fechamento.

### math

> **math**: `object`

Nós de matemática: constantes (`value*`, parâmetro `value`); aritmética escalar (`add`, `sub`, `mul`, `div`, `min`,
`max`, `abs`, `floor`, `fract`); `mix`, `clamp` (padrão [0, 1]), `smoothstep` (padrão [0, 1]); `pow`, `sqrt`, `sin`,
`cos`, `tan`, `atan2`; vetores de 3 componentes (`add3`, `sub3`, `mul3`, `div3` por componente, `scale3` por escalar,
`mix3`, `dot`, `cross`, `normalize`, `length`, `distance`); conversões `u32` ↔ `f32` (`toFloat`; `toUint`, truncado e
preso em 0); separar e combinar (`split2/3/4`, `combine2/3/4`).

#### math.abs

> `readonly` **abs**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.add

> `readonly` **add**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.add3

> `readonly` **add3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.atan2

> `readonly` **atan2**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.clamp

> `readonly` **clamp**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.combine2

> `readonly` **combine2**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.combine3

> `readonly` **combine3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.combine4

> `readonly` **combine4**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.cos

> `readonly` **cos**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.cross

> `readonly` **cross**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.distance

> `readonly` **distance**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.div

> `readonly` **div**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.div3

> `readonly` **div3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.dot

> `readonly` **dot**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.floor

> `readonly` **floor**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.fract

> `readonly` **fract**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.length

> `readonly` **length**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.max

> `readonly` **max**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.min

> `readonly` **min**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.mix

> `readonly` **mix**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.mix3

> `readonly` **mix3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.mul

> `readonly` **mul**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.mul3

> `readonly` **mul3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.normalize

> `readonly` **normalize**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.pow

> `readonly` **pow**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.scale3

> `readonly` **scale3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.sin

> `readonly` **sin**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.smoothstep

> `readonly` **smoothstep**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.split2

> **split2**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Separa um `vec2f` nas componentes `x`, `y`.

#### math.split3

> **split3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Separa um `vec3f` nas componentes `x`, `y`, `z`.

#### math.split4

> **split4**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Separa um `vec4f` nas componentes `x`, `y`, `z`, `w`.

#### math.sqrt

> `readonly` **sqrt**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.sub

> `readonly` **sub**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.sub3

> `readonly` **sub3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.tan

> `readonly` **tan**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.toFloat

> `readonly` **toFloat**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.toUint

> `readonly` **toUint**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### math.value

> **value**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Constante escalar: o parâmetro `value` (muda sem recompilar).

#### math.value2

> **value2**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Constante `vec2f`.

#### math.value3

> **value3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Constante `vec3f`.

#### math.value4

> **value4**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Constante `vec4f`.

### noise

> **noise**: `object`

Ruídos: valor e gradiente em 2D e 3D, celular e fBm em 3D.

#### noise.cellular3

> **cellular3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Celular (Worley) 3D: um ponto por célula no centro deslocado por `jitter` (0 = grade regular, 1 = célula inteira);
`f1`/`f2` distâncias ao mais próximo e ao segundo, `cell` valor em [0, 1] da célula mais próxima.

#### noise.fbm3

> **fbm3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

fBm 3D: `octaves` (1 a 12) oitavas do ruído de gradiente, frequência × `lacunarity` e amplitude × `gain` a cada uma,
semente + k na oitava k; normalizado pela soma das amplitudes (em [-1, 1]).

#### noise.gradient2

> `readonly` **gradient2**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### noise.gradient3

> `readonly` **gradient3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### noise.value2

> `readonly` **value2**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### noise.value3

> `readonly` **value3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

### output

> **output**: `object`

Saídas de pontos.

#### output.closure

> **closure**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Saída de fechamento do ponto `material` (spec 011): o fechamento composto pelos nós `bsdf.*`/`closure.*`. Sem
ligação, o fechamento pronto das constantes do material da entidade. Só em `fragment`.

#### output.surfaceParams

> **surfaceParams**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Saída do ponto `material`: os parâmetros de superfície. Entradas sem ligação usam as constantes do material da
entidade (`m`), como a função pronta. Só em `fragment`.

### pattern

> **pattern**: `object`

Padrões: o xadrez em 2D (superfícies planas, uv) e em 3D (sólido).

#### pattern.checker2

> `readonly` **checker2**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

#### pattern.checker3

> `readonly` **checker3**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

### set

> **set**: `object`

Nós de conjunto (spec 031, US3): malha, pontos, as primitivas paralelas sobre conjuntos u32 (FR-027) e as saídas.

#### set.compact

> **compact**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.compact`: os índices dos elementos não nulos, em ordem (`Compaction` estável). Contagem da GPU: o total
aceito vai ao registro `SetCount` da saída e `CountToArgs` deriva o despacho e o desenho.

#### set.displace

> **displace**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.displace`: cada vértice anda `scale · height(position, normal, uv)` ao longo da normal. A entrada de ponto
`height` aceita um grafo de ponto com os argumentos `position`, `normal` e `uv` (nós `graphArgument`) que devolve
`f32`, fundido no kernel (sem grafo: 0). Normais, uv e triângulos seguem iguais; contagens as da entrada.

#### set.distributeOnMesh

> **distributeOnMesh**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.distributeOnMesh`: até `per_triangle` pontos (K, padrão 1) por triângulo da malha. O candidato (t, k) tem
posição baricêntrica uniforme na área pelo hash de (`seed`, t, 3k) e (`seed`, t, 3k + 1), normal e uv
interpolados, e é aceito quando o hash de (`seed`, t, 3k + 2) em [0, 1) fica abaixo da densidade — a entrada de
ponto `density` (grafo com `position`, `normal`, `uv` → `f32`, presa em [0, 1]; sem grafo: 1). Determinística: a
decisão só depende de (semente, t, k) e os aceitos são compactados de forma estável (flags + soma de prefixos), na
ordem (t, k) — nunca na ordem dos atômicos.

Contagem da GPU: candidatos (triângulos · K) num registro próprio, compactação com a contagem da GPU, o total aceito
no registro `SetCount` dos pontos e `CountToArgs` — sem leitura de volta. Capacidade: triângulos · K.

#### set.grid

> **grid**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.grid`: grade nu × nv (`resolution`, padrão 16 × 16; mínimo 2) de extensão `size` (padrão 2 × 2) no plano y = 0,
centrada na origem, com a orientação do plano pronto da `ParametricSurface` (o vértice (iu, iv) em (v, 0, u)),
normal +y, uv em [0, 1]² e triângulos anti-horários vistos de +y. Contagem da CPU (= capacidade).

Saída `mesh`: nu·nv vértices e 2(nu−1)(nv−1) triângulos.

#### set.meshOutput

> **meshOutput**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.meshOutput`: a malha na `GraphGeometry` alvo — vértices copiados (até a capacidade do alvo), índices dos
triângulos (os além da contagem, ou com vértice além dos copiados, degenerados (0, 0, 0): sem
`indirect-first-instance` o desenho é direto pela capacidade), arestas de arame (a, b), (b, c), (c, a) por triângulo
quando o alvo tem `wireEdges` (zeradas além da contagem) e o registro indireto: byte 0, triângulos · 3 índices;
byte 20, arestas · 6 vértices. Sem alvo (entidade sem `GraphGeometry`), não grava nada.

#### set.pointsOutput

> **pointsOutput**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.pointsOutput`: os pontos como vértices da `GraphGeometry` alvo (posição, normal, uv 0) para o desenho por
sprites (`PointSpriteMaterial`: um quad por vértice da capacidade). Os vértices além da contagem vão para fora do
volume desenhável (|p| ≥ 1e30, descartados pelo sprite); índices zerados e registro indireto vazio.

#### set.prefixSum

> **prefixSum**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.prefixSum`: soma de prefixos (`PrefixSum`) do conjunto u32 — exclusiva, ou inclusiva com `inclusive` ≠ 0.
Contagem a da entrada.

#### set.realizeInstances

> **realizeInstances**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.realizeInstances`: uma esfera UV de raio `radius` (padrão 0,05) por ponto — `segments` (≥ 3, padrão 8) por
`rings` (≥ 2, padrão 6): (segments + 1)(rings + 1) vértices com normal radial e uv, 2·segments·rings triângulos
anti-horários vistos de fora (os dos polos degenerados). Contagem da GPU, derivada da dos pontos no próprio fluxo.

#### set.recomputeNormals

> **recomputeNormals**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.recomputeNormals`: a normal de cada vértice vira a média normalizada das normais unitárias das faces
adjacentes ((b − a) × (c − a)); vértice sem face mantém a normal. Determinística: soma em ponto fixo (`fixed_point`,
resolução ~1e-6) por `atomicAdd` inteiro, independente da ordem. Posições, uv, triângulos e contagens da entrada.

#### set.reduce

> **reduce**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.reduce`: redução (`Reduce`) do conjunto u32 a um valor — `op` 0 soma, 1 mínimo, 2 máximo. Saída de um
elemento (contagem da CPU, 1); entrada vazia dá 0. Trocar `op` refaz o kernel (fora da gravação, em `update`).

#### set.sequence

> **sequence**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.sequence`: conjunto u32 `start + i · step`, i < `count` (≥ 1, padrão 256) — a fonte dos nós das primitivas.
Contagem da CPU.

#### set.sort

> **sort**: [`SetNodeDefinition`](../../platform/web/interfaces/SetNodeDefinition.md)

`set.sort`: ordenação radix estável crescente (`RadixSort`) dos `bits` menos significativos (múltiplo de 4 em
[4, 32], padrão 32). Contagem a da entrada.

### space

> **space**: `object`

Conversões de espaço: ponto, direção, normal, as inversas por classe (afim, rígida, projetiva — a classe é escolhida
pelo nó, na montagem do grafo; spec 037, R3) e a projeção.

#### space.direction

> **direction**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Direção (w = 0): `(m · (d, 0)).xyz`.

#### space.inverse

> **inverse**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Inversa de uma matriz afim (`[R | t]⁻¹ = [R⁻¹ | −R⁻¹·t]`; a última linha deve ser (0, 0, 0, 1)).

#### space.inverseProjective

> **inverseProjective**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Inversa de uma 4×4 geral (projeções; cofatores).

#### space.inverseRigid

> **inverseRigid**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Inversa de uma matriz rígida (rotação + translação, sem escala): `[R | t]⁻¹ = [Rᵀ | −Rᵀ·t]`, exata.

#### space.normal

> **normal**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Normal: a inversa transposta da parte 3×3 de `m` aplicada a `n`, normalizada (escala não uniforme e espelhos).

#### space.point

> **point**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Ponto (w = 1): `(m · (p, 1)).xyz`.

#### space.project

> **project**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Projeção com divisão perspectiva: `clip = m · (p, 1)`, devolve `clip.xyz / clip.w` (NDC).

### surface

> **surface**: `object`

Superfície: métrica, curvaturas, direções principais e ondulações.

#### surface.curvature

> **curvature**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Curvaturas (de `curvature` = (K, H, k₁, k₂)): gaussiana, média, principais, a curvatura total √((k₁² + k₂²)/2) e o
índice de forma (2/π)·atan2(k₁ + k₂, k₁ − k₂) — 1 calota convexa, 0 sela, −1 calota côncava.

#### surface.metric

> **metric**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Primeira forma: `e`, `f`, `g` (de `metric`) e o elemento de área `area` = √(EG − F²).

#### surface.principal

> **principal**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Direções principais tangentes: `d1` = a direção de k₁ (`principal`) projetada no plano tangente de `normal` e
normalizada; `d2` = n × d₁. Zeros em ponto umbílico ou degenerado.

#### surface.ripple

> **ripple**: [`NodeDefinition`](../../platform/web/interfaces/NodeDefinition.md)

Ondulações (spec 034, T065b): a normal perturbada por oito trens de onda no plano perpendicular a `up` — a altura
h = Σ s/(8kᵢ)·sen(φᵢ), comprimentos de `size` (m) a cerca de um terço dele, fase pela dispersão de águas profundas
(ω = √(g k)·`speed`) e o tempo `time` (ligar no `time` da amostra: o tempo simulado). A inclinação tem módulo até
`strength` e vale só nas faces voltadas para `up`. Liga no `closure.normal`. Referência: `reference/surface.ts`.
