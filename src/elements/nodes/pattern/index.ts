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
 * cada oitava. Saídas: `value` em [-1, 1] e `gradient` (∂/∂p).
 */
const grain = defineNode({
    name: 'pattern.grain',
    inputs: RELIEF_INPUTS,
    outputs: { value: 'f32', gradient: 'vec2f' },
    params: {
        ...RELIEF_VALUES,
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
 * faixa escura e dura), com o `gradient`; `ring` o valor em [0, 1] do anel (o tom de ano para ano).
 */
const rings = defineNode({
    name: 'pattern.rings',
    inputs: RELIEF_INPUTS,
    outputs: { value: 'f32', gradient: 'vec2f', ring: 'f32' },
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
    },
    code: nodePattern,
    fn: 'node_pattern_rings',
});

/**
 * Trama de tecido: `scale` fios por unidade de `p` nos dois sentidos — a urdidura ao longo de `p.y`, a trama ao longo de
 * `p.x`. Ligamento: a urdidura passa `over` fios por cima e `under` por baixo, deslocada `shift` a cada fio (tela 1/1/1,
 * o padrão; sarja do jeans 3/1/1; cetim 4/1/2); `gap` a fração do passo sem fio. Saídas: `height` em [0, 1] e o
 * `gradient`; `warp` 1 onde o fio à vista é de urdidura; `thread` o valor em [0, 1] do fio à vista; `gap` 1 no vão.
 */
const weave = defineNode({
    name: 'pattern.weave',
    inputs: RELIEF_INPUTS,
    outputs: { height: 'f32', gradient: 'vec2f', warp: 'f32', thread: 'f32', gap: 'f32' },
    params: {
        ...RELIEF_VALUES,
        scale: { type: 'f32', default: 1 },
        over: { type: 'u32', default: 1 },
        under: { type: 'u32', default: 1 },
        shift: { type: 'u32', default: 1 },
        gap: { type: 'f32', default: 0.1 },
        seed: { type: 'u32', default: 0 },
    },
    code: nodePattern,
    fn: 'node_pattern_weave',
});

/**
 * Padrões: o xadrez em 2D (superfícies planas, uv) e em 3D (sólido); e os padrões com relevo — a trama de tecido, as
 * células com sulcos, os anéis de crescimento e o grão.
 */
export const pattern = {
    checker2: checker('checker2', 'vec2f'),
    checker3: checker('checker3', 'vec3f'),
    grain,
    cells,
    rings,
    weave,
} as const;
