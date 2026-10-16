import { defineNode } from '../../../scene/graph/NodeDefinition';
import { nodeField } from '../shaders';

// Nó de amostragem do campo da cena (spec 031, R12). Referência: `reference/field.ts`.

/**
 * A aceleração (m/s²) dos campos da cena — os prontos e as funções `field` — sobre um corpo (`inv_mass`, `density`,
 * `volume`) na posição `x` com velocidade `v` (padrão 0) no tempo `time` (padrão 0). É o ponto de cena `field`: a C2
 * compõe os campos em todo shader que usa o nó. Não vale dentro de uma função `field` (chamaria a si mesma).
 */
const sample = defineNode({
    name: 'field.sample',
    inputs: { x: 'vec3f', v: 'vec3f', time: 'f32' },
    outputs: { value: 'vec3f' },
    defaults: { v: 'vec3f(0.0)', time: '0.0' },
    params: {
        inv_mass: { type: 'f32', default: 1 },
        density: { type: 'f32', default: 0 },
        volume: { type: 'f32', default: 0 },
    },
    code: nodeField,
    fn: 'node_field_sample',
});

/** Campo da cena. */
export const field = { sample } as const;
