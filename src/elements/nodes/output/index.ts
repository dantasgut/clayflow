import { defineNode } from '../../../scene/graph/NodeDefinition';
import { nodeOutput } from '../shaders';

/**
 * Saída do ponto `material`: os parâmetros de superfície. Entradas sem ligação usam as constantes do material da
 * entidade (`m`), como a função pronta. Só em `fragment`.
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
    code: nodeOutput,
    fn: 'node_output_surface_params',
    contexts: ['fragment'],
});

/**
 * Saída de fechamento do ponto `material` (spec 011): o fechamento composto pelos nós `bsdf.*`/`closure.*`. Sem
 * ligação, o fechamento pronto das constantes do material da entidade. Só em `fragment`.
 */
const closure = defineNode({
    name: 'output.closure',
    inputs: { closure: 'Closure' },
    outputs: { value: 'Closure' },
    defaults: {
        closure:
            'closure_from_params(SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0)))',
    },
    code: nodeOutput,
    fn: 'node_output_closure',
    contexts: ['fragment'],
});

/** Saídas de pontos. */
export const output = { surfaceParams, closure } as const;
