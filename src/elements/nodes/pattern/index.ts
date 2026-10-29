import { defineNode, type NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { nodePattern } from '../shaders';

// Nós de padrão procedural (spec 038): o xadrez avaliado por pixel na GPU — o padrão de superfície é material, nunca
// geometria. Posição `p·scale + offset` (`scale` células por unidade); `width` a largura do pixel ou do cone do raio no
// espaço de `p` (ex.: `s.footprint` com `p` = posição de mundo; 0 = o xadrez exato). Saída em [0, 1] (0 nas casas pares,
// 1 nas ímpares; a média ao longe), para a rampa de cor (`color.ramp`). Valem em todos os estágios.

/** Xadrez sobre `p` de tipo `vec2f`/`vec3f`, filtrado pela largura `width`. */
function checker(name: 'checker2' | 'checker3', p: 'vec2f' | 'vec3f'): NodeDefinition {
    return defineNode({
        name: `pattern.${name}`,
        inputs: { p, width: 'f32' },
        outputs: { value: 'f32' },
        params: {
            width: { type: 'f32', default: 0 },
            scale: { type: 'f32', default: 1 },
            offset: { type: p },
        },
        code: nodePattern,
        fn: `node_pattern_${name}`,
    });
}

/** Padrões: o xadrez em 2D (superfícies planas, uv) e em 3D (sólido). */
export const pattern = {
    checker2: checker('checker2', 'vec2f'),
    checker3: checker('checker3', 'vec3f'),
} as const;
