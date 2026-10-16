import { defineNode, type NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { nodeNoise } from '../shaders';

// Nós de ruído (spec 031, R12) sobre a `wgslLib.noise`: posição `p · scale + offset` e semente (u32; 0 = o ruído da
// biblioteca). Mesma semente, mesma saída na GPU e na referência da CPU (`reference/noise.ts`, aritmética inteira u32).
// Valem em todos os estágios.

/** Parâmetros comuns: escala, deslocamento (`vec2f` ou `vec3f`) e semente. */
function noiseParams(offset: 'vec2f' | 'vec3f') {
    return {
        scale: { type: 'f32', default: 1 },
        offset: { type: offset },
        seed: { type: 'u32', default: 0 },
    } as const;
}

/** Ruído escalar em [-1, 1] sobre `p` de tipo `vec2f`/`vec3f`. */
function lattice(name: string, p: 'vec2f' | 'vec3f'): NodeDefinition {
    return defineNode({
        name: `noise.${name}`,
        inputs: { p },
        outputs: { value: 'f32' },
        params: noiseParams(p),
        code: nodeNoise,
        fn: `node_noise_${name}`,
    });
}

/**
 * Celular (Worley) 3D: um ponto por célula no centro deslocado por `jitter` (0 = grade regular, 1 = célula inteira);
 * `f1`/`f2` distâncias ao mais próximo e ao segundo, `cell` valor em [0, 1] da célula mais próxima.
 */
const cellular3 = defineNode({
    name: 'noise.cellular3',
    inputs: { p: 'vec3f' },
    outputs: { f1: 'f32', f2: 'f32', cell: 'f32' },
    params: { ...noiseParams('vec3f'), jitter: { type: 'f32', default: 1 } },
    code: nodeNoise,
    fn: 'node_noise_cellular3',
});

/**
 * fBm 3D: `octaves` (1 a 12) oitavas do ruído de gradiente, frequência × `lacunarity` e amplitude × `gain` a cada uma,
 * semente + k na oitava k; normalizado pela soma das amplitudes (em [-1, 1]).
 */
const fbm3 = defineNode({
    name: 'noise.fbm3',
    inputs: { p: 'vec3f' },
    outputs: { value: 'f32' },
    params: {
        ...noiseParams('vec3f'),
        octaves: { type: 'u32', default: 5 },
        lacunarity: { type: 'f32', default: 2 },
        gain: { type: 'f32', default: 0.5 },
    },
    code: nodeNoise,
    fn: 'node_noise_fbm3',
});

/** Ruídos: valor e gradiente em 2D e 3D, celular e fBm em 3D. */
export const noise = {
    value2: lattice('value2', 'vec2f'),
    gradient2: lattice('gradient2', 'vec2f'),
    value3: lattice('value3', 'vec3f'),
    gradient3: lattice('gradient3', 'vec3f'),
    cellular3,
    fbm3,
} as const;
