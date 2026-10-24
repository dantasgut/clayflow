import { defineNode } from '../../../scene/graph/NodeDefinition';
import { nodeSpace } from '../shaders';

// Nós de conversão de espaço (spec 031, R12): a matriz é uma entrada do grafo (`mat4x4f`: a matriz de mundo da
// entidade, a vista ou a projeção da câmera — argumentos de ponto como `world` do ponto `camera` ou a saída de outro nó).
// Objeto → mundo: a matriz de mundo; mundo → objeto: `space.inverse` dela; mundo → vista: a vista. Valem em todos os
// estágios. Referência: `reference/space.ts`.

/** Ponto (w = 1): `(m · (p, 1)).xyz`. */
const point = defineNode({
    name: 'space.point',
    inputs: { m: 'mat4x4f', p: 'vec3f' },
    outputs: { value: 'vec3f' },
    code: nodeSpace,
    fn: 'node_space_point',
});

/** Direção (w = 0): `(m · (d, 0)).xyz`. */
const direction = defineNode({
    name: 'space.direction',
    inputs: { m: 'mat4x4f', d: 'vec3f' },
    outputs: { value: 'vec3f' },
    code: nodeSpace,
    fn: 'node_space_direction',
});

/** Normal: a inversa transposta da parte 3×3 de `m` aplicada a `n`, normalizada (escala não uniforme e espelhos). */
const normal = defineNode({
    name: 'space.normal',
    inputs: { m: 'mat4x4f', n: 'vec3f' },
    outputs: { value: 'vec3f' },
    code: nodeSpace,
    fn: 'node_space_normal',
});

/** Inversa de uma matriz afim (`[R | t]⁻¹ = [R⁻¹ | −R⁻¹·t]`; a última linha deve ser (0, 0, 0, 1)). */
const inverse = defineNode({
    name: 'space.inverse',
    inputs: { m: 'mat4x4f' },
    outputs: { value: 'mat4x4f' },
    code: nodeSpace,
    fn: 'node_space_inverse',
});

/** Inversa de uma matriz rígida (rotação + translação, sem escala): `[R | t]⁻¹ = [Rᵀ | −Rᵀ·t]`, exata. */
const inverseRigid = defineNode({
    name: 'space.inverseRigid',
    inputs: { m: 'mat4x4f' },
    outputs: { value: 'mat4x4f' },
    code: nodeSpace,
    fn: 'node_space_inverse_rigid',
});

/** Inversa de uma 4×4 geral (projeções; cofatores). */
const inverseProjective = defineNode({
    name: 'space.inverseProjective',
    inputs: { m: 'mat4x4f' },
    outputs: { value: 'mat4x4f' },
    code: nodeSpace,
    fn: 'node_space_inverse_projective',
});

/** Projeção com divisão perspectiva: `clip = m · (p, 1)`, devolve `clip.xyz / clip.w` (NDC). */
const project = defineNode({
    name: 'space.project',
    inputs: { m: 'mat4x4f', p: 'vec3f' },
    outputs: { value: 'vec3f' },
    code: nodeSpace,
    fn: 'node_space_project',
});

/**
 * Conversões de espaço: ponto, direção, normal, as inversas por classe (afim, rígida, projetiva — a classe é escolhida
 * pelo nó, na montagem do grafo; spec 037, R3) e a projeção.
 */
export const space = {
    point,
    direction,
    normal,
    inverse,
    inverseRigid,
    inverseProjective,
    project,
} as const;
