import { defineNode } from '../../../scene/graph/NodeDefinition';
import { nodeGeometry } from '../shaders';

/**
 * Tangente pelo uv (spec 011, R4): a direção de u na superfície, pelas derivadas de tela da posição e do uv — a tangente
 * do especular anisotrópico de malhas sem tangente no vértice. Só no fragmento.
 */
const tangentUv = defineNode({
    name: 'geometry.tangentUv',
    inputs: { position: 'vec3f', normal: 'vec3f', uv: 'vec2f' },
    outputs: { value: 'vec3f' },
    defaults: { position: 's.world_position', normal: 's.normal', uv: 's.uv' },
    code: nodeGeometry,
    fn: 'node_geometry_tangent_uv',
    contexts: ['fragment'],
});

/** Nós de geometria do fragmento. */
export const geometry = { tangentUv } as const;
