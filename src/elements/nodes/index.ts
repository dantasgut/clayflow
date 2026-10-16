import { graphArgument, type GraphArgument } from '../../scene/graph/NodeGraph';
import { defineNode } from '../../scene/graph/NodeDefinition';
import { NodeRegistry } from '../../scene/graph/NodeRegistry';
import { nodeColor, nodeMath, nodeNoise, nodeSurface } from './shaders';
import {
    compact,
    displace,
    distributeOnMesh,
    grid,
    meshOutput,
    pointsOutput,
    prefixSum,
    realizeInstances,
    recomputeNormals,
    reduce,
    sequence,
    sort,
} from './set';

/** Campos da amostra de superfície do ponto `material` (`SurfaceSample`). */
const SURFACE_SAMPLE_FIELDS = {
    world_position: 'vec3f',
    normal: 'vec3f',
    uv: 'vec2f',
    time: 'f32',
    metric: 'vec3f',
    curvature: 'vec4f',
    principal: 'vec3f',
} as const;

/** `a + b`. */
const add = defineNode({
    name: 'math.add',
    inputs: { a: 'f32', b: 'f32' },
    outputs: { value: 'f32' },
    defaults: { b: '0.0' },
    code: nodeMath,
    fn: 'node_math_add',
});

/** Interpolação linear de cores `mix(a, b, t)`. */
const mix = defineNode({
    name: 'math.mix',
    inputs: { a: 'vec3f', b: 'vec3f', t: 'f32' },
    outputs: { value: 'vec3f' },
    code: nodeMath,
    fn: 'node_math_mix',
});

/** Ruído de gradiente 3D `gradient_noise3(p · scale + offset)` em [-1, 1]. */
const gradient3 = defineNode({
    name: 'noise.gradient3',
    inputs: { p: 'vec3f' },
    outputs: { value: 'f32' },
    params: { scale: { type: 'f32', default: 1 }, offset: { type: 'vec3f' } },
    code: nodeNoise,
    fn: 'node_noise_gradient3',
});

/** Rampa de cor de dois pontos: `color_a` em `low`, `color_b` em `high`. */
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
 * Saída do ponto `material`: os parâmetros de superfície. Entradas sem ligação usam as constantes do material da
 * entidade (`m`), como a função pronta.
 */
const surfaceParams = defineNode({
    name: 'output.surfaceParams',
    inputs: {
        base_color: 'vec3f',
        alpha: 'f32',
        roughness: 'f32',
        metallic: 'f32',
        emissive: 'vec3f',
    },
    outputs: { value: 'SurfaceParams' },
    defaults: {
        base_color: 'm.albedo.rgb',
        alpha: 'm.albedo.a',
        roughness: 'm.roughness',
        metallic: 'm.metallic',
        emissive: 'vec3f(0.0)',
    },
    code: nodeSurface,
    fn: 'node_output_surface_params',
    contexts: ['fragment'],
});

/** Nós de conjunto (spec 031, US3): malha, pontos, as primitivas paralelas sobre conjuntos u32 (FR-027) e as saídas. */
const set = {
    grid,
    displace,
    recomputeNormals,
    distributeOnMesh,
    realizeInstances,
    sequence,
    prefixSum,
    sort,
    compact,
    reduce,
    meshOutput,
    pointsOutput,
} as const;

/**
 * Nós da C3 (spec 031): entradas dos pontos (argumentos da função alvo), matemática, ruído, cor e saídas; e os nós de
 * conjunto (`set`). Os nós de entrada são argumentos do ponto (`graphArgument`), não funções: ligam direto no valor que
 * o ponto recebe — também os argumentos `position`, `normal` e `uv` das entradas de ponto dos nós de conjunto
 * (`vertexField`).
 */
export const nodes = {
    input: {
        /** A amostra de superfície do ponto `material` (`s`): posição de mundo, normal, uv, tempo, geometria diferencial. */
        surfaceSample: (): GraphArgument => graphArgument('s', SURFACE_SAMPLE_FIELDS),
        /** O tempo simulado da amostra (`s.time`). */
        time: (): GraphArgument => graphArgument('s', { time: 'f32' }),
        /** As constantes do material da entidade (`m`). */
        material: (): GraphArgument =>
            graphArgument('m', { albedo: 'vec4f', roughness: 'f32', metallic: 'f32' }),
        /**
         * Um argumento das entradas de ponto dos nós de conjunto (`height` de `set.displace`, `density` de
         * `set.distributeOnMesh`): `position` e `normal` (`vec3f`) ou `uv` (`vec2f`) do elemento.
         */
        vertexField: (name: 'position' | 'normal' | 'uv'): GraphArgument => graphArgument(name),
    },
    math: { add, mix },
    noise: { gradient3 },
    color: { ramp },
    output: { surfaceParams },
    set,
} as const;

/** Registro com os nós da C3 (serialização: `NodeGraph.fromJSON`). */
export const defaultNodeRegistry = new NodeRegistry([
    add,
    mix,
    gradient3,
    ramp,
    surfaceParams,
    ...Object.values(set),
]);
