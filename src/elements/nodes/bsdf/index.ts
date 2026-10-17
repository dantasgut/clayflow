import { defineNode, type NodeParam } from '../../../scene/graph/NodeDefinition';
import { nodeBsdf } from '../shaders';

// Nós de espalhamento (spec 011, R5): um lobo cada, como os BSDF do Blender. Toda entrada aceita um valor (o parâmetro
// de mesmo nome, que muda sem recompilar e pode ser exposto num sub-grafo) ou uma ligação de outro nó. A marca
// `lobe:<nome>` diz ao material quais lobos o shader precisa.

/** Valor de uma entrada `vec3f`. */
const v3 = (value: readonly [number, number, number]): NodeParam => ({
    type: 'vec3f',
    default: value,
});
/** Valor de uma entrada `f32`. */
const f = (value: number): NodeParam => ({ type: 'f32', default: value });

/** Difuso (Oren-Nayar energético; rugosidade 0 = Lambert). */
const diffuse = defineNode({
    name: 'bsdf.diffuse',
    inputs: { color: 'vec3f', roughness: 'f32' },
    outputs: { value: 'Closure' },
    params: { color: v3([0.8, 0.8, 0.8]), roughness: f(0) },
    code: nodeBsdf,
    fn: 'node_bsdf_diffuse',
    tags: ['lobe:diffuse'],
});

/** Especular de condutor (metal): F0 na cor, tinta da borda F82, rugosidade, anisotropia em [−1, 1] e tangente. */
const conductor = defineNode({
    name: 'bsdf.conductor',
    inputs: {
        color: 'vec3f',
        edge_tint: 'vec3f',
        roughness: 'f32',
        anisotropy: 'f32',
        tangent: 'vec3f',
    },
    outputs: { value: 'Closure' },
    params: {
        color: v3([0.9, 0.9, 0.9]),
        edge_tint: v3([1, 1, 1]),
        roughness: f(0.2),
        anisotropy: f(0),
        tangent: v3([0, 0, 0]),
    },
    code: nodeBsdf,
    fn: 'node_bsdf_conductor',
    tags: ['lobe:specular', 'lobe:anisotropy'],
});

/**
 * Especular de dielétrico: reflexão pelo IOR, tinta, rugosidade, anisotropia e tangente — a energia que não reflete
 * segue para os lobos de baixo (difuso, subsuperfície, transmissão).
 */
const dielectric = defineNode({
    name: 'bsdf.dielectric',
    inputs: { ior: 'f32', tint: 'vec3f', roughness: 'f32', anisotropy: 'f32', tangent: 'vec3f' },
    outputs: { value: 'Closure' },
    params: {
        ior: f(1.5),
        tint: v3([1, 1, 1]),
        roughness: f(0.1),
        anisotropy: f(0),
        tangent: v3([0, 0, 0]),
    },
    code: nodeBsdf,
    fn: 'node_bsdf_dielectric',
    tags: ['lobe:specular', 'lobe:anisotropy'],
});

/**
 * Transmissão com refração do que está atrás: IOR, a cor atingida a `depth` unidades de percurso (Beer-Lambert; 0 = sem
 * absorção), número de Abbe (dispersão; 0 = sem) e rugosidade.
 */
const transmission = defineNode({
    name: 'bsdf.transmission',
    inputs: { ior: 'f32', color: 'vec3f', depth: 'f32', abbe: 'f32', roughness: 'f32' },
    outputs: { value: 'Closure' },
    params: { ior: f(1.5), color: v3([1, 1, 1]), depth: f(0), abbe: f(0), roughness: f(0) },
    code: nodeBsdf,
    fn: 'node_bsdf_transmission',
    tags: ['lobe:transmission'],
});

/** Parede fina translúcida (cortina, folha): a luz de trás atravessa espalhada, sem refratar o fundo. */
const translucent = defineNode({
    name: 'bsdf.translucent',
    inputs: { color: 'vec3f' },
    outputs: { value: 'Closure' },
    params: { color: v3([0.8, 0.8, 0.8]) },
    code: nodeBsdf,
    fn: 'node_bsdf_translucent',
    tags: ['lobe:translucent'],
});

/** Brilho de fibra (veludo, algodão): cor e rugosidade do sheen. */
const sheen = defineNode({
    name: 'bsdf.sheen',
    inputs: { color: 'vec3f', roughness: 'f32' },
    outputs: { value: 'Closure' },
    params: { color: v3([1, 1, 1]), roughness: f(0.3) },
    code: nodeBsdf,
    fn: 'node_bsdf_sheen',
    tags: ['lobe:sheen'],
});

/** Subsuperfície no modelo (pele, cera, mármore): cor e raio de espalhamento por canal em [0, 1]. */
const subsurface = defineNode({
    name: 'bsdf.subsurface',
    inputs: { color: 'vec3f', radius: 'vec3f' },
    outputs: { value: 'Closure' },
    params: { color: v3([0.8, 0.5, 0.4]), radius: v3([1, 0.4, 0.2]) },
    code: nodeBsdf,
    fn: 'node_bsdf_subsurface',
    tags: ['lobe:subsurface'],
});

/** Emissão: cor × luminância em nits (sem teto até o limite do formato HDR). */
const emission = defineNode({
    name: 'bsdf.emission',
    inputs: { color: 'vec3f', luminance: 'f32' },
    outputs: { value: 'Closure' },
    params: { color: v3([1, 1, 1]), luminance: f(1) },
    code: nodeBsdf,
    fn: 'node_bsdf_emission',
    tags: ['lobe:emission'],
});

/** Nós de espalhamento: um lobo cada. */
export const bsdf = {
    diffuse,
    conductor,
    dielectric,
    transmission,
    translucent,
    sheen,
    subsurface,
    emission,
} as const;
