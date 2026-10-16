import { defineNode } from '../../../scene/graph/NodeDefinition';
import { nodeSurface } from '../shaders';

// Nós de geometria diferencial (spec 031, R12) sobre os campos `metric`, `curvature`, `principal` e `normal` da amostra
// de superfície (`nodes.input.surfaceSample()`; spec 010 — zeros nas geometrias sem geometria diferencial). Valem em
// todos os estágios. Referência: `reference/surface.ts`.

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

/** Geometria diferencial: métrica, curvaturas, direções principais. */
export const surface = { metric, curvature, principal } as const;
