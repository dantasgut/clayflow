import { defineNode } from '../../../scene/graph/NodeDefinition';
import { nodeColor, nodeMap } from '../shaders';

// Nós de mapeamento (spec 031, R12): faixa, curva por pontos e rampas de cor. Valem em todos os estágios. Referência:
// `reference/map.ts`.

/**
 * Faixa: `x` de `[in_min, in_max]` para `[out_min, out_max]`, linear; presa nos extremos com `clamped` ≠ 0 (padrão).
 * Faixa de entrada vazia: tratada como 1e-6.
 */
const range = defineNode({
    name: 'map.range',
    inputs: { x: 'f32' },
    outputs: { value: 'f32' },
    params: {
        in_min: { type: 'f32', default: 0 },
        in_max: { type: 'f32', default: 1 },
        out_min: { type: 'f32', default: 0 },
        out_max: { type: 'f32', default: 1 },
        clamped: { type: 'u32', default: 1 },
    },
    code: nodeMap,
    fn: 'node_map_range',
});

/**
 * Curva por quatro pontos `pK = (x, y)` (x crescente): linear por trecho, constante fora dos extremos. Padrão: a
 * identidade em [0, 1].
 */
const curve4 = defineNode({
    name: 'map.curve4',
    inputs: { x: 'f32' },
    outputs: { value: 'f32' },
    params: {
        p0: { type: 'vec2f', default: [0, 0] },
        p1: { type: 'vec2f', default: [1 / 3, 1 / 3] },
        p2: { type: 'vec2f', default: [2 / 3, 2 / 3] },
        p3: { type: 'vec2f', default: [1, 1] },
    },
    code: nodeMap,
    fn: 'node_map_curve4',
});

/** Rampa de cor de dois pontos: `color_a` em `low`, `color_b` em `high`, linear, presa nos extremos. */
const ramp = defineNode({
    name: 'color.ramp',
    inputs: { t: 'f32' },
    outputs: { color: 'vec3f' },
    params: {
        color_a: { type: 'vec3f' },
        color_b: { type: 'vec3f', default: [1, 1, 1] },
        low: { type: 'f32', default: 0 },
        high: { type: 'f32', default: 1 },
    },
    code: nodeColor,
    fn: 'node_color_ramp',
});

/**
 * Rampa de cor de quatro paradas: `stopK.rgb` na posição `stopK.w` (posições crescentes), linear por trecho, presa nos
 * extremos. Padrão: preto, vermelho, amarelo, branco em 0, 1/3, 2/3, 1.
 */
const ramp4 = defineNode({
    name: 'color.ramp4',
    inputs: { t: 'f32' },
    outputs: { color: 'vec3f' },
    params: {
        stop0: { type: 'vec4f', default: [0, 0, 0, 0] },
        stop1: { type: 'vec4f', default: [1, 0, 0, 1 / 3] },
        stop2: { type: 'vec4f', default: [1, 1, 0, 2 / 3] },
        stop3: { type: 'vec4f', default: [1, 1, 1, 1] },
    },
    code: nodeColor,
    fn: 'node_color_ramp4',
});

/** Mapeamentos escalares: faixa e curva por pontos. */
export const map = { range, curve4 } as const;

/** Rampas de cor: dois pontos e quatro paradas. */
export const color = { ramp, ramp4 } as const;
