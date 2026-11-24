import { defineNode, type NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { nodePattern } from '../shaders';

// Nós de padrão procedural (spec 038): o xadrez avaliado por pixel na GPU — o padrão de superfície é material, nunca
// geometria. Posição `p·scale + offset` (`scale` células por unidade); `width` a largura do pixel ou do cone do raio no
// espaço de `p` (ex.: `s.footprint` com `p` = posição de mundo; 0 = o xadrez exato). Saída em [0, 1] (0 nas casas pares,
// 1 nas ímpares; a média ao longe), para a rampa de cor (`color.ramp`). Valem em todos os estágios.

/** Xadrez sobre `p` de tipo `vec2f`/`vec3f`, filtrado pela largura `width`. */
function checker(name: 'checker2' | 'checker3', p: 'vec2f' | 'vec3f'): NodeDefinition {
    return defineNode({
        name: `pattern.${name}`,
        inputs: { p, width: 'f32' },
        outputs: { value: 'f32' },
        params: {
            width: { type: 'f32', default: 0 },
            scale: { type: 'f32', default: 1 },
            offset: { type: p },
        },
        code: nodePattern,
        fn: `node_pattern_${name}`,
    });
}

// Padrões com relevo (spec 011): sobre a coordenada `p` de `surface.uvSpace` (com `width` e `wrap` dela), cada um com a
// altura e o gradiente ∂/∂p — a entrada de `surface.bump`. `width`: o detalhe menor que o pixel vai à média; `wrap`: o
// período de `p` por eixo (0 = sem), para fechar sem emenda onde o uv dá a volta. Valem em todos os estágios.
// Referência: `reference/pattern.ts`.

/** Entradas comuns: a coordenada, a largura do pixel e o período — as duas últimas com valor (0). */
const RELIEF_INPUTS = { p: 'vec2f', width: 'f32', wrap: 'vec2f' } as const;
const RELIEF_VALUES = {
    width: { type: 'f32', default: 0 },
    wrap: { type: 'vec2f', default: [0, 0] },
} as const;

/**
 * Grão: `octaves` (1 a 8) oitavas do ruído de gradiente 2D com frequências por eixo `scale` — anisotrópico: `scale`
 * (2, 200) dá riscos ao longo de `p.x` (a escova do metal, a fibra da madeira) —, × `lacunarity` e amplitude × `gain` a
 * cada oitava. Saídas: `value` em [-1, 1] e `gradient` (∂/∂p). `bend` (entrada com valor, (0, 1)): quando `p` é uma
 * coordenada curva (x, f(x, y)) — a do veio da madeira, `along` de `pattern.rings` —, `bend` = ∇f (o `bend` de
 * `pattern.rings`): o gradiente sai na coordenada de fora e o grão acompanha as curvas do veio.
 */
const grain = defineNode({
    name: 'pattern.grain',
    inputs: { ...RELIEF_INPUTS, bend: 'vec2f' },
    outputs: { value: 'f32', gradient: 'vec2f' },
    params: {
        ...RELIEF_VALUES,
        bend: { type: 'vec2f', default: [0, 1] },
        scale: { type: 'vec2f', default: [1, 1] },
        seed: { type: 'u32', default: 0 },
        octaves: { type: 'u32', default: 3 },
        lacunarity: { type: 'f32', default: 2 },
        gain: { type: 'f32', default: 0.5 },
    },
    code: nodePattern,
    fn: 'node_pattern_grain',
});

/**
 * Células (Voronoi 2D): `scale` células por unidade de `p`, o ponto de cada uma deslocado por `jitter` (0 = grade).
 * `height` = smoothstep(0, `crease`, distância à borda) — 0 no sulco entre as células, 1 no platô (o grão do couro) —
 * com o `gradient`; `cell` o valor em [0, 1] da célula; `random` dois valores em [-1, 1] dela (a inclinação de um floco).
 */
const cells = defineNode({
    name: 'pattern.cells',
    inputs: RELIEF_INPUTS,
    outputs: { height: 'f32', gradient: 'vec2f', cell: 'f32', random: 'vec2f' },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'f32', default: 1 },
        jitter: { type: 'f32', default: 1 },
        crease: { type: 'f32', default: 0.1 },
        seed: { type: 'u32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_cells',
});

/**
 * Anéis de crescimento: o corte de um tronco de eixo ao longo de `p.x` (a direção da fibra), com a medula em `p.y` = 0 a
 * `depth` do plano do corte; a profundidade varia `distortion` · ruído(p · `distortion_scale`) — os arcos onde o corte
 * passa perto da medula; `scale` anéis por unidade de raio em média. `irregularity` (0 a 1): a largura varia de ano
 * para ano (até ± 1 anel de deslocamento); `waviness`: a ondulação do raio (em unidades de `p`) pelo ruído(p ·
 * `waviness_scale`) — as linhas tortas também longe da medula. `value` em [0, 1]: do lenho inicial (0) ao tardio (1, a
 * faixa escura e dura), com o `gradient`; `ring` o valor em [0, 1] do anel (o tom de ano para ano). Os nós (olhos):
 * `knots` células por unidade de `p` (0 = sem nós), um nó em três de cada dez — os anéis desviam em volta dele e fecham
 * em `knot_rings` voltas dentro da meia largura `knot_size` (em `p`); `knot` o miolo do nó em [0, 1]. `scale`, `depth`
 * e `knots` são entradas com valor: ligadas a um mesmo nó, a cor e o relevo de uma madeira contam os mesmos anéis e os
 * mesmos nós, do mesmo corte. `fall`: a fração do anel em que o perfil cai do lenho tardio ao inicial do ano seguinte
 * (0,12: abrupta; maior, a crista mais larga e suave). `along` = (p.x, raio) é a coordenada do veio — com a ondulação e
 * o desvio dos nós — e `bend` o gradiente do raio: ligados a `p` e a `bend` de `pattern.grain`, a fibra, os sulcos e
 * os riscos correm paralelos às linhas dos anéis.
 */
const rings = defineNode({
    name: 'pattern.rings',
    inputs: { ...RELIEF_INPUTS, scale: 'f32', depth: 'f32', knots: 'f32' },
    outputs: {
        value: 'f32',
        gradient: 'vec2f',
        ring: 'f32',
        knot: 'f32',
        along: 'vec2f',
        bend: 'vec2f',
    },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'f32', default: 8 },
        depth: { type: 'f32', default: 0.3 },
        distortion: { type: 'f32', default: 0.15 },
        distortion_scale: { type: 'vec2f', default: [1.5, 0.75] },
        seed: { type: 'u32', default: 0 },
        irregularity: { type: 'f32', default: 0 },
        waviness: { type: 'f32', default: 0 },
        waviness_scale: { type: 'vec2f', default: [3, 12] },
        knots: { type: 'f32', default: 0 },
        knot_size: { type: 'f32', default: 0.04 },
        knot_rings: { type: 'f32', default: 6 },
        fall: { type: 'f32', default: 0.12 },
    },
    code: nodePattern,
    fn: 'node_pattern_rings',
});

/**
 * Trama de tecido: `scale` fios por unidade de `p` nos dois sentidos — a urdidura ao longo de `p.y`, a trama ao longo de
 * `p.x`. Ligamento: a urdidura passa `over` fios por cima e `under` por baixo, deslocada `shift` a cada fio (tela 1/1/1,
 * o padrão; sarja do jeans 3/1/1; cetim 4/1/2); `gap` a fração do passo sem fio. Saídas: `height` em [0, 1] e o
 * `gradient`; `warp` 1 onde o fio à vista é de urdidura; `thread` o valor em [0, 1] do fio à vista; `gap` 1 no vão;
 * `fiber` a direção em `p` da fibra do fio à vista — o fio é um cilindro de fibras torcidas em hélice de ângulo `twist`
 * (radianos) com o eixo dele: a tangente do brilho anisotrópico, que quebra o realce em tracinhos de fio em fio —;
 * `strand` os cabos do fio torcido em [0, 1] (três faixas em hélice em torno do fio: 1 na crista do cabo, 0 no sulco;
 * 1 sem torção).
 */
const weave = defineNode({
    name: 'pattern.weave',
    inputs: RELIEF_INPUTS,
    outputs: {
        height: 'f32',
        gradient: 'vec2f',
        warp: 'f32',
        thread: 'f32',
        gap: 'f32',
        fiber: 'vec2f',
        strand: 'f32',
    },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'f32', default: 1 },
        over: { type: 'u32', default: 1 },
        under: { type: 'u32', default: 1 },
        shift: { type: 'u32', default: 1 },
        gap: { type: 'f32', default: 0.1 },
        seed: { type: 'u32', default: 0 },
        twist: { type: 'f32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_weave',
});

/**
 * Tricô (ponto meia, o direito da malha): colunas de pontos em V — `scale` colunas por unidade de `p.x` e `scale` ·
 * `aspect` carreiras por unidade de `p.y`; cada ponto são duas pernas de fio de meia largura 0,2 · `thickness` da
 * coluna, que sobem do meio da coluna para as bordas e passam por baixo da carreira de cima. Saídas: `height` em [0, 1]
 * e o `gradient`; `fiber` a direção em `p` da fibra à vista (o eixo da perna com a torção `twist`, em radianos);
 * `stitch` o valor em [0, 1] do ponto; `gap` 1 no fundo entre as pernas; `strand` os cabos do fio torcido em [0, 1].
 */
const knit = defineNode({
    name: 'pattern.knit',
    inputs: RELIEF_INPUTS,
    outputs: {
        height: 'f32',
        gradient: 'vec2f',
        fiber: 'vec2f',
        stitch: 'f32',
        gap: 'f32',
        strand: 'f32',
    },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'f32', default: 1 },
        aspect: { type: 'f32', default: 1.4 },
        thickness: { type: 'f32', default: 1 },
        seed: { type: 'u32', default: 0 },
        twist: { type: 'f32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_knit',
});

/**
 * Limiar suave com gradiente: `value` = smoothstep(`low`; `high`; valor) e o `gradient` pela regra da cadeia sobre o
 * gradiente de entrada (∂/∂p, de um padrão) — recorta uma faixa de um padrão sem perder a derivada (a fresta onde o
 * grão passa de um nível, o lenho tardio saliente, a crosta da ferrugem): a entrada de `surface.relief` e de
 * `surface.bump`. `low` > `high` inverte.
 */
const threshold = defineNode({
    name: 'pattern.threshold',
    inputs: { value: 'f32', gradient: 'vec2f' },
    outputs: { value: 'f32', gradient: 'vec2f' },
    params: { low: { type: 'f32', default: 0 }, high: { type: 'f32', default: 1 } },
    code: nodePattern,
    fn: 'node_pattern_threshold',
});

/**
 * Tijolos: fiadas de peças retangulares com junta — `scale` (peças por unidade de `p.x`, fiadas por unidade de `p.y`),
 * cada fiada deslocada `shift` peça (0,5: a amarração do tijolo; 0: a grade do azulejo); `gap` a largura da junta e
 * `bevel` a da aresta arredondada, em frações da altura da fiada. Saídas: `height` em [0, 1] (0 na junta, 1 na face) e
 * o `gradient`; `brick` o valor em [0, 1] da peça; `mortar` 1 na junta.
 */
const bricks = defineNode({
    name: 'pattern.bricks',
    inputs: RELIEF_INPUTS,
    outputs: { height: 'f32', gradient: 'vec2f', brick: 'f32', mortar: 'f32' },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'vec2f', default: [1, 2] },
        shift: { type: 'f32', default: 0.5 },
        gap: { type: 'f32', default: 0.1 },
        bevel: { type: 'f32', default: 0.08 },
        seed: { type: 'u32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_bricks',
});

/**
 * Tábuas (o assoalho): peças de 1 largura por `length` larguras (inteiro), `scale` larguras por unidade de `p`.
 * `arrangement` 0: réguas em fileiras ao longo de `p.x`, cada fileira deslocada ao acaso; 1: espinha de peixe. Saídas: `p` a
 * coordenada dentro da peça (o comprimento ao longo de x, com um deslocamento próprio de cada peça) — a entrada dos
 * padrões do veio: cada tábua com os seus anéis, na sua direção —; `height` em [0, 1] (0 na junta de largura `gap`, 1
 * na face, a aresta arredondada em `bevel`, em larguras) e o `gradient`; `plank` o valor em [0, 1] da peça; `joint` 1
 * na junta.
 */
const planks = defineNode({
    name: 'pattern.planks',
    inputs: RELIEF_INPUTS,
    outputs: { p: 'vec2f', height: 'f32', gradient: 'vec2f', plank: 'f32', joint: 'f32' },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'f32', default: 4 },
        length: { type: 'f32', default: 6 },
        arrangement: { type: 'u32', default: 0 },
        gap: { type: 'f32', default: 0.02 },
        bevel: { type: 'f32', default: 0.04 },
        seed: { type: 'u32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_planks',
});

/**
 * Fissuras (a casca de árvore): placas alongadas separadas por uma rede de fissuras que se ramificam e se juntam — um
 * Voronoi 2D com frequência por eixo `scale` (placas por unidade de `p.x` e de `p.y`), o ponto de cada célula
 * deslocado por `jitter`. `height` = smoothstep(0, `crease`, distância à borda da placa), com a fissura da mesma
 * largura em `p` em qualquer direção (`crease` em células do eixo de maior frequência) — 0 no fundo da fissura, 1 na
 * face —, com o `gradient`; `plate` o valor em [0, 1] da placa.
 */
const fissures = defineNode({
    name: 'pattern.fissures',
    inputs: RELIEF_INPUTS,
    outputs: { height: 'f32', gradient: 'vec2f', plate: 'f32' },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'vec2f', default: [4, 1] },
        jitter: { type: 'f32', default: 1 },
        crease: { type: 'f32', default: 0.2 },
        seed: { type: 'u32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_fissures',
});

/**
 * Mossas (o metal martelado): uma calota côncava por célula de um Voronoi 2D de `scale` células por unidade de `p`
 * (`jitter`: 0 = grade) — a altura é 2 · d² (d a distância ao ponto da célula), presa em 1: o fundo no ponto, a aresta
 * viva onde duas mossas se encontram. Saídas: `height` em [0, 1] e o `gradient`; `cell` o valor em [0, 1] da mossa.
 */
const dents = defineNode({
    name: 'pattern.dents',
    inputs: RELIEF_INPUTS,
    outputs: { height: 'f32', gradient: 'vec2f', cell: 'f32' },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'f32', default: 1 },
        jitter: { type: 'f32', default: 1 },
        seed: { type: 'u32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_dents',
});

/**
 * Fiadas sobrepostas (o telhado): telhas, placas de ardósia ou escamas em fiadas ao longo de `p.x`, cada uma deitada
 * sobre a fiada de baixo — `scale` (telhas por unidade de `p.x`, fiadas por unidade de `p.y`; negativo em y: o pé das
 * telhas para o lado de `p.y` maior), cada fiada deslocada
 * `shift` telha (0,5: as juntas desencontradas; 0: as colunas da telha de capa e canal). A telha é um plano inclinado,
 * grossa no pé (a borda de baixo, à vista) e enfiada sob a fiada de cima: a altura cai do pé ao topo e desce um degrau
 * para a telha de baixo — o dente de serra que faz a sombra de cada fiada. `gap` o vão lateral entre duas telhas e
 * `bevel` a borda arredondada, em alturas de fiada; `irregularity` o recuo do pé de cada telha, ao acaso (fração da
 * fiada); `profile` (0 a 1) a fração da altura que vem do perfil da telha de capa e canal (a capa convexa, o canal
 * côncavo entre duas). Saídas: `height` em [0, 1] e o `gradient`; `tile` o valor em [0, 1] da telha à vista; `gap` 1
 * onde a que se vê é a de baixo (no vão, sob o pé recuado); `along` a posição na fiada (0 no pé, 1 no topo).
 */
const shingles = defineNode({
    name: 'pattern.shingles',
    inputs: { ...RELIEF_INPUTS, scale: 'vec2f' },
    outputs: { height: 'f32', gradient: 'vec2f', tile: 'f32', gap: 'f32', along: 'f32' },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'vec2f', default: [2, 4] },
        shift: { type: 'f32', default: 0.5 },
        gap: { type: 'f32', default: 0.04 },
        bevel: { type: 'f32', default: 0.08 },
        profile: { type: 'f32', default: 0 },
        irregularity: { type: 'f32', default: 0 },
        seed: { type: 'u32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_shingles',
});

/**
 * Aréolas: células arredondadas (as almofadas do limbo de uma folha entre as vênulas, as bolhas, os seixos) — `scale`
 * células por unidade de `p`, o ponto de cada uma deslocado por `jitter` (até 0,8). A posição na célula é 2 · d₁ /
 * (d₁ + d₂), das distâncias aos dois pontos mais próximos: as curvas de nível são círculos e a rede das bordas tem os
 * cantos arredondados, sem as arestas retas do Voronoi. Saídas: `height` em [0, 1] — a almofada abaulada e lisa, 1 no
 * meio e 0 na borda — e o `gradient`; `cell` o valor em [0, 1] da célula; `wall` a borda em [0, 1], de largura `wall`
 * (a fração da meia célula).
 */
const areoles = defineNode({
    name: 'pattern.areoles',
    inputs: RELIEF_INPUTS,
    outputs: { height: 'f32', gradient: 'vec2f', cell: 'f32', wall: 'f32' },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'f32', default: 1 },
        jitter: { type: 'f32', default: 0.8 },
        wall: { type: 'f32', default: 0.25 },
        seed: { type: 'u32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_areoles',
});

/**
 * Nervuras (a folha): a nervura central ao longo de `p.x`, as secundárias que saem dela dos dois lados, alternadas, as
 * terciárias em escada entre duas secundárias e a rede fina das vênulas. `scale`: lâminas por unidade de `p.x` (o
 * comprimento) e de `p.y` (a largura; a nervura central no meio de cada lâmina). `veins` secundárias de cada lado por
 * comprimento de lâmina (inteiro); saem com a inclinação `slope` (a tangente do ângulo com a central) e curvam para a
 * ponta com `curve`; `irregular` (0 a 0,35) varia o espaçamento e o ângulo de uma para a outra e ao longo de cada
 * uma. `thickness` a meia largura da central na base, em larguras da lâmina, e `taper` (0 a 1) a fração que ela perde
 * até a ponta (as secundárias têm a metade e afinam até a margem). `ladder`: terciárias por largura de lâmina (0: sem)
 * — degraus tortos entre duas secundárias vizinhas, cada vão com a sua fase. `fine` as aréolas por unidade de `p` (0:
 * sem): as vênulas são as bordas arredondadas delas (as de `pattern.areoles` com a mesma semente e `jitter` 0,8).
 * Saídas: `height` em [0, 1] (1 na crista da central, 0,7 na das secundárias, 0,4 na das terciárias, 0,35 na das
 * vênulas, 0 no limbo) e o `gradient`; `main` as nervuras central, secundárias e terciárias em [0, 1]; `across` a
 * distância à central (0 nela, 1 na margem); `cell` o valor em [0, 1] da aréola entre as vênulas.
 */
const veins = defineNode({
    name: 'pattern.veins',
    inputs: RELIEF_INPUTS,
    outputs: { height: 'f32', gradient: 'vec2f', main: 'f32', across: 'f32', cell: 'f32' },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'vec2f', default: [0.5, 1] },
        veins: { type: 'f32', default: 7 },
        slope: { type: 'f32', default: 1 },
        curve: { type: 'f32', default: 1 },
        thickness: { type: 'f32', default: 0.03 },
        fine: { type: 'f32', default: 30 },
        seed: { type: 'u32', default: 0 },
        irregular: { type: 'f32', default: 0 },
        taper: { type: 'f32', default: 0 },
        ladder: { type: 'f32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_veins',
});

/**
 * Brilhos pontuais: as células do sorteio dos flocos menores que o pixel (os flocos da pintura metálica, os cristais
 * da neve, os grãos da areia) — a entrada de `closure.glints`. `scale` flocos por unidade de `p` (por lado). A célula
 * do pixel é a de uma grade de 0,7 a 1,4 pixel de lado (2ⁿ flocos) e a do nível seguinte, de lado dobrado, com a
 * mistura contínua entre os dois; fixa em `p` (o objeto): os brilhos não andam com a câmera. Saídas: `cells` (o valor
 * em [0, 1] da célula em cada nível e a mistura) e `count`, o número de flocos na célula do primeiro nível — 0 com os
 * flocos maiores que 2 pixels (resolvidos pelo padrão) e sem a largura do pixel.
 */
const glints = defineNode({
    name: 'pattern.glints',
    inputs: RELIEF_INPUTS,
    outputs: { cells: 'vec3f', count: 'f32' },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'f32', default: 1 },
        seed: { type: 'u32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_glints',
});

/**
 * Escova: os riscos de um metal escovado — quatro passadas de riscos finos ao longo de `p.x` (`scale` riscos por
 * unidade de `p` ao longo e através, crescendo de passada em passada), cada uma com a direção variando de lugar para
 * lugar até `spread` radianos (um ruído largo de `bend_scale` ondas por unidade de `p` desloca os riscos: levemente
 * curvos, cruzando-se em ângulos pequenos), e os riscos fundos isolados — uma célula em `deep` (0 a 1) de duas grades
 * alongadas, cada sulco com ângulo e fundura próprios. Saídas: `value` (os finos em [-1, 1] menos os fundos, até −1,8), o
 * `gradient`, `direction` (a direção dos riscos em `p`, unitária: a tangente do lobo anisotrópico) e `deep` (o risco
 * fundo em [0, 1]).
 */
const brush = defineNode({
    name: 'pattern.brush',
    inputs: RELIEF_INPUTS,
    outputs: { value: 'f32', gradient: 'vec2f', direction: 'vec2f', deep: 'f32' },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'vec2f', default: [2, 200] },
        spread: { type: 'f32', default: 0.06 },
        bend_scale: { type: 'vec2f', default: [1.5, 3] },
        deep: { type: 'f32', default: 0.1 },
        seed: { type: 'u32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_brush',
});

/**
 * Padrões: o xadrez em 2D (superfícies planas, uv) e em 3D (sólido); e os padrões com relevo — a trama de tecido, o
 * tricô, a escova do metal, as células com sulcos, os anéis de crescimento (com os nós da madeira), os tijolos, as tábuas do assoalho, as fissuras da casca, as mossas, as fiadas sobrepostas do telhado, as nervuras da folha, as aréolas arredondadas, as células dos brilhos pontuais, o grão e o
 * limiar com gradiente.
 */
// Padrões maciços (spec 011): sobre a coordenada `p` em 3D de `surface.solidSpace` (a posição no objeto) — o padrão
// existe no volume e a superfície o corta, sem emenda nem polo. O gradiente ∂/∂p é a entrada de `surface.solidRelief`.

/**
 * Grão maciço: `octaves` (1 a 8) oitavas do ruído de gradiente 3D com frequências por eixo `scale` — anisotrópico:
 * `scale` (60, 2, 60) dá fibras ao longo de `p.y` —, × `lacunarity` e amplitude × `gain` a cada oitava. Saídas: `value`
 * em [-1, 1] e `gradient` (∂/∂p). Com `p` = `along` de `pattern.trunk`, corre ao longo da fibra do tronco.
 */
const grain3 = defineNode({
    name: 'pattern.grain3',
    inputs: { p: 'vec3f', width: 'f32' },
    outputs: { value: 'f32', gradient: 'vec3f' },
    params: {
        width: { type: 'f32', default: 0 },
        scale: { type: 'vec3f', default: [1, 1, 1] },
        seed: { type: 'u32', default: 0 },
        octaves: { type: 'u32', default: 3 },
        lacunarity: { type: 'f32', default: 2 },
        gain: { type: 'f32', default: 0.5 },
    },
    code: nodePattern,
    fn: 'node_pattern_grain3',
});

/**
 * Tronco: os anéis de crescimento no volume — um tronco de eixo ao longo de `p.y`, `scale` anéis por unidade de raio,
 * a medula serpenteando (`wander`, `wander_scale`), os anéis ondulados (`waviness`, `waviness_scale`) e de largura
 * irregular (`irregularity` em [0, 1]), o perfil de `pattern.rings` (`fall`: a fração do anel em que o lenho tardio cai
 * ao inicial do ano seguinte). Os nós são os galhos: retas que saem da medula inclinadas para cima, `knots` células por
 * unidade ao longo do eixo (um galho em seis de cada dez), de meia largura `knot_size`, desviando `knot_rings` anéis.
 * A superfície que corta o volume mostra o que a serra mostra: anéis concêntricos no topo, linhas e "catedrais" nas
 * faces ao longo do eixo, o olho do nó onde corta um galho. Saídas: `value` em [0, 1] (0 o lenho inicial, 1 o tardio)
 * e o `gradient` (∂/∂p); `ring` o valor em [0, 1] do anel; `knot` o miolo do nó em [0, 1]; `along` a coordenada da
 * fibra (a `p` de `pattern.grain3`: o grão fica dentro das superfícies dos anéis e desvia com elas).
 */
const trunk = defineNode({
    name: 'pattern.trunk',
    inputs: { p: 'vec3f', width: 'f32', scale: 'f32', knots: 'f32' },
    outputs: { value: 'f32', gradient: 'vec3f', ring: 'f32', knot: 'f32', along: 'vec3f' },
    params: {
        width: { type: 'f32', default: 0 },
        scale: { type: 'f32', default: 8 },
        knots: { type: 'f32', default: 0 },
        seed: { type: 'u32', default: 0 },
        irregularity: { type: 'f32', default: 0 },
        waviness: { type: 'f32', default: 0 },
        waviness_scale: { type: 'vec3f', default: [3, 1, 3] },
        wander: { type: 'f32', default: 0 },
        wander_scale: { type: 'f32', default: 1 },
        knot_size: { type: 'f32', default: 0.04 },
        knot_rings: { type: 'f32', default: 6 },
        fall: { type: 'f32', default: 0.12 },
    },
    code: nodePattern,
    fn: 'node_pattern_trunk',
});

/**
 * Olho: as regiões de um globo ocular centrado na origem de `p` (de `surface.solidSpace`), com o olhar ao longo de
 * `p.y` — a íris (`iris`: o raio dela na esfera unitária, 0,49), a pupila (`pupil`: fração do raio da íris), o anel
 * escuro da borda (`limbus`), as fibras radiais do estroma (`fiber` em [-1, 1], `fibers` por volta), a posição entre a
 * pupila e a borda (`radial`), os vasos da esclera (`vein`), a tigela da íris atrás da córnea (`bowl` e o `gradient`
 * dela, a entrada de `surface.solidRelief`) e a distância à íris na esclera (`rim`). Ver `node_pattern_iris`.
 */
const iris = defineNode({
    name: 'pattern.iris',
    inputs: { p: 'vec3f', width: 'f32', iris: 'f32', pupil: 'f32' },
    outputs: {
        iris: 'f32',
        pupil: 'f32',
        limbus: 'f32',
        fiber: 'f32',
        radial: 'f32',
        vein: 'f32',
        bowl: 'f32',
        gradient: 'vec3f',
        rim: 'f32',
    },
    params: {
        width: { type: 'f32', default: 0 },
        iris: { type: 'f32', default: 0.49 },
        pupil: { type: 'f32', default: 0.32 },
        fibers: { type: 'f32', default: 48 },
        seed: { type: 'u32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_iris',
});

export const pattern = {
    grain3,
    trunk,
    iris,
    checker2: checker('checker2', 'vec2f'),
    checker3: checker('checker3', 'vec3f'),
    grain,
    brush,
    cells,
    rings,
    weave,
    knit,
    bricks,
    planks,
    fissures,
    dents,
    shingles,
    veins,
    areoles,
    glints,
    threshold,
} as const;
