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

/** Superfície: métrica, curvaturas, direções principais e ondulações. */
export const surface = { metric, curvature, principal, ripple } as const;
