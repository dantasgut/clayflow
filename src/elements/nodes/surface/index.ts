import { defineNode } from '../../../scene/graph/NodeDefinition';
import { nodeSurface } from '../shaders';

// Nós de geometria diferencial (spec 031, R12) sobre os campos `metric`, `curvature`, `principal` e `normal` da amostra
// de superfície (`nodes.input.surfaceSample()`; spec 010 — zeros nas geometrias sem geometria diferencial). Valem em
// todos os estágios; e as ondulações da normal (spec 034). Referência: `reference/surface.ts`.

/** Primeira forma: `e`, `f`, `g` (de `metric`) e o elemento de área `area` = √(EG − F²). */
const metric = defineNode({
    name: 'surface.metric',
    inputs: { metric: 'vec3f' },
    outputs: { e: 'f32', f: 'f32', g: 'f32', area: 'f32' },
    code: nodeSurface,
    fn: 'node_surface_metric',
});

/**
 * Curvaturas (de `curvature` = (K, H, k₁, k₂)): gaussiana, média, principais, a curvatura total √((k₁² + k₂²)/2) e o
 * índice de forma (2/π)·atan2(k₁ + k₂, k₁ − k₂) — 1 calota convexa, 0 sela, −1 calota côncava.
 */
const curvature = defineNode({
    name: 'surface.curvature',
    inputs: { curvature: 'vec4f' },
    outputs: {
        gaussian: 'f32',
        mean: 'f32',
        k1: 'f32',
        k2: 'f32',
        curvedness: 'f32',
        shape_index: 'f32',
    },
    code: nodeSurface,
    fn: 'node_surface_curvature',
});

/**
 * Direções principais tangentes: `d1` = a direção de k₁ (`principal`) projetada no plano tangente de `normal` e
 * normalizada; `d2` = n × d₁. Zeros em ponto umbílico ou degenerado.
 */
const principal = defineNode({
    name: 'surface.principal',
    inputs: { principal: 'vec3f', normal: 'vec3f' },
    outputs: { d1: 'vec3f', d2: 'vec3f' },
    code: nodeSurface,
    fn: 'node_surface_principal',
});

/**
 * Ondulações (spec 034, T065b): a normal perturbada por oito trens de onda no plano perpendicular a `up` — a altura
 * h = Σ s/(8kᵢ)·sen(φᵢ), comprimentos de `size` (m) a cerca de um terço dele, fase pela dispersão de águas profundas
 * (ω = √(g k)·`speed`) e o tempo `time` (ligar no `time` da amostra: o tempo simulado). A inclinação tem módulo até
 * `strength` e vale só nas faces voltadas para `up`. Liga no `closure.normal`. Referência: `reference/surface.ts`.
 */
const ripple = defineNode({
    name: 'surface.ripple',
    inputs: { position: 'vec3f', normal: 'vec3f', time: 'f32' },
    outputs: { value: 'vec3f' },
    params: {
        strength: { type: 'f32', default: 0.3 },
        size: { type: 'f32', default: 0.05 },
        speed: { type: 'f32', default: 1 },
        up: { type: 'vec3f', default: [0, 1, 0] },
    },
    code: nodeSurface,
    fn: 'node_surface_ripple',
});

/**
 * Espaço do padrão (spec 011): a coordenada `p` = uv · `scale` + `offset` (repetições por unidade de uv, por eixo — numa
 * esfera, (2, 1) deixa o padrão quadrado no equador), a largura do pixel ou do cone em `p` (`width`), as tangentes de `p` em
 * mundo (`du`, `dv`: ∂posição/∂p) e o período de `p` numa volta do uv (`wrap`) — as entradas dos padrões com relevo
 * (`pattern.weave`, `cells`, `rings`, `grain`) e de `surface.bump`. Sem ligação, lê a amostra (`s.uv`, `s.duvdx`,
 * `s.duvdy`, `s.dpdu`, `s.dpdv`).
 */
const uvSpace = defineNode({
    name: 'surface.uvSpace',
    inputs: {
        uv: 'vec2f',
        duvdx: 'vec2f',
        duvdy: 'vec2f',
        dpdu: 'vec3f',
        dpdv: 'vec3f',
        scale: 'vec2f',
    },
    outputs: { p: 'vec2f', width: 'f32', du: 'vec3f', dv: 'vec3f', wrap: 'vec2f' },
    params: {
        scale: { type: 'vec2f', default: [1, 1] },
        offset: { type: 'vec2f', default: [0, 0] },
    },
    defaults: {
        uv: 's.uv',
        duvdx: 's.duvdx',
        duvdy: 's.duvdy',
        dpdu: 's.dpdu',
        dpdv: 's.dpdv',
    },
    code: nodeSurface,
    fn: 'node_surface_uv_space',
});

/**
 * Relevo (spec 011): a normal perturbada pela altura de gradiente `gradient` (∂h/∂p, de um padrão) sobre as tangentes
 * `du`, `dv` de `surface.uvSpace` — o gradiente de superfície de Mikkelsen (2020). `strength` é a altura em unidades de
 * `p`: o relevo acompanha o tamanho do padrão. Liga no `closure.normal` (ou na `normal` de outro `surface.bump`, para
 * somar dois relevos). Sem tangentes (os acertos dos raios), devolve a normal.
 */
const bump = defineNode({
    name: 'surface.bump',
    inputs: { normal: 'vec3f', du: 'vec3f', dv: 'vec3f', gradient: 'vec2f', strength: 'f32' },
    outputs: { value: 'vec3f' },
    params: { strength: { type: 'f32', default: 1 } },
    defaults: { normal: 's.normal' },
    code: nodeSurface,
    fn: 'node_surface_bump',
});

/** Superfície: métrica, curvaturas, direções principais, ondulações, o espaço dos padrões no uv e o relevo. */
export const surface = { metric, curvature, principal, ripple, uvSpace, bump } as const;
