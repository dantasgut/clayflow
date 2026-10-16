import { defineNode, type NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { nodeMath } from '../shaders';

// Nós de matemática (spec 031, R12): tipos fixos por nó — sem sufixo, escalar (`f32`); `2`/`3`/`4`, vetor de tantas
// componentes. Valem em todos os estágios. Referência: `reference/math.ts`.

/** Escalar de entrada `inputs` e saída `value`, função `node_math_<fn>`. */
function scalar(
    name: string,
    fn: string,
    inputs: Readonly<Record<string, string>>,
    defaults: Readonly<Record<string, string>> = {},
    output = 'f32',
): NodeDefinition {
    return defineNode({
        name: `math.${name}`,
        inputs,
        outputs: { value: output },
        defaults,
        code: nodeMath,
        fn: `node_math_${fn}`,
    });
}

const AB = { a: 'f32', b: 'f32' } as const;
const AB3 = { a: 'vec3f', b: 'vec3f' } as const;

/** Constante escalar: o parâmetro `value` (muda sem recompilar). */
const value = defineNode({
    name: 'math.value',
    outputs: { value: 'f32' },
    params: { value: { type: 'f32' } },
    code: nodeMath,
    fn: 'node_math_value',
});
/** Constante `vec2f`. */
const value2 = defineNode({
    name: 'math.value2',
    outputs: { value: 'vec2f' },
    params: { value: { type: 'vec2f' } },
    code: nodeMath,
    fn: 'node_math_value2',
});
/** Constante `vec3f`. */
const value3 = defineNode({
    name: 'math.value3',
    outputs: { value: 'vec3f' },
    params: { value: { type: 'vec3f' } },
    code: nodeMath,
    fn: 'node_math_value3',
});
/** Constante `vec4f`. */
const value4 = defineNode({
    name: 'math.value4',
    outputs: { value: 'vec4f' },
    params: { value: { type: 'vec4f' } },
    code: nodeMath,
    fn: 'node_math_value4',
});

/** Separa um `vec2f` nas componentes `x`, `y`. */
const split2 = defineNode({
    name: 'math.split2',
    inputs: { v: 'vec2f' },
    outputs: { x: 'f32', y: 'f32' },
    code: nodeMath,
    fn: 'node_math_split2',
});
/** Separa um `vec3f` nas componentes `x`, `y`, `z`. */
const split3 = defineNode({
    name: 'math.split3',
    inputs: { v: 'vec3f' },
    outputs: { x: 'f32', y: 'f32', z: 'f32' },
    code: nodeMath,
    fn: 'node_math_split3',
});
/** Separa um `vec4f` nas componentes `x`, `y`, `z`, `w`. */
const split4 = defineNode({
    name: 'math.split4',
    inputs: { v: 'vec4f' },
    outputs: { x: 'f32', y: 'f32', z: 'f32', w: 'f32' },
    code: nodeMath,
    fn: 'node_math_split4',
});

/**
 * Nós de matemática: constantes (`value*`, parâmetro `value`); aritmética escalar (`add`, `sub`, `mul`, `div`, `min`,
 * `max`, `abs`, `floor`, `fract`); `mix`, `clamp` (padrão [0, 1]), `smoothstep` (padrão [0, 1]); `pow`, `sqrt`, `sin`,
 * `cos`, `tan`, `atan2`; vetores de 3 componentes (`add3`, `sub3`, `mul3`, `div3` por componente, `scale3` por escalar,
 * `mix3`, `dot`, `cross`, `normalize`, `length`, `distance`); conversões `u32` ↔ `f32` (`toFloat`; `toUint`, truncado e
 * preso em 0); separar e combinar (`split2/3/4`, `combine2/3/4`).
 */
export const math = {
    value,
    value2,
    value3,
    value4,
    add: scalar('add', 'add', AB, { b: '0.0' }),
    sub: scalar('sub', 'sub', AB, { b: '0.0' }),
    mul: scalar('mul', 'mul', AB, { b: '1.0' }),
    div: scalar('div', 'div', AB, { b: '1.0' }),
    min: scalar('min', 'min', AB),
    max: scalar('max', 'max', AB),
    abs: scalar('abs', 'abs', { x: 'f32' }),
    floor: scalar('floor', 'floor', { x: 'f32' }),
    fract: scalar('fract', 'fract', { x: 'f32' }),
    mix: scalar('mix', 'mix', { a: 'f32', b: 'f32', t: 'f32' }),
    clamp: scalar(
        'clamp',
        'clamp',
        { x: 'f32', low: 'f32', high: 'f32' },
        { low: '0.0', high: '1.0' },
    ),
    smoothstep: scalar(
        'smoothstep',
        'smoothstep',
        { edge0: 'f32', edge1: 'f32', x: 'f32' },
        { edge0: '0.0', edge1: '1.0' },
    ),
    pow: scalar('pow', 'pow', { x: 'f32', e: 'f32' }, { e: '2.0' }),
    sqrt: scalar('sqrt', 'sqrt', { x: 'f32' }),
    sin: scalar('sin', 'sin', { x: 'f32' }),
    cos: scalar('cos', 'cos', { x: 'f32' }),
    tan: scalar('tan', 'tan', { x: 'f32' }),
    atan2: scalar('atan2', 'atan2', { y: 'f32', x: 'f32' }),
    add3: scalar('add3', 'add3', AB3, { b: 'vec3f(0.0)' }, 'vec3f'),
    sub3: scalar('sub3', 'sub3', AB3, { b: 'vec3f(0.0)' }, 'vec3f'),
    mul3: scalar('mul3', 'mul3', AB3, { b: 'vec3f(1.0)' }, 'vec3f'),
    div3: scalar('div3', 'div3', AB3, { b: 'vec3f(1.0)' }, 'vec3f'),
    scale3: scalar('scale3', 'scale3', { v: 'vec3f', s: 'f32' }, { s: '1.0' }, 'vec3f'),
    mix3: scalar('mix3', 'mix3', { a: 'vec3f', b: 'vec3f', t: 'f32' }, {}, 'vec3f'),
    dot: scalar('dot', 'dot', AB3),
    cross: scalar('cross', 'cross', AB3, {}, 'vec3f'),
    normalize: scalar('normalize', 'normalize', { v: 'vec3f' }, {}, 'vec3f'),
    length: scalar('length', 'length', { v: 'vec3f' }),
    distance: scalar('distance', 'distance', AB3),
    toFloat: scalar('toFloat', 'to_float', { x: 'u32' }),
    toUint: scalar('toUint', 'to_uint', { x: 'f32' }, {}, 'u32'),
    split2,
    combine2: scalar('combine2', 'combine2', { x: 'f32', y: 'f32' }, {}, 'vec2f'),
    split3,
    combine3: scalar('combine3', 'combine3', { x: 'f32', y: 'f32', z: 'f32' }, {}, 'vec3f'),
    split4,
    combine4: scalar(
        'combine4',
        'combine4',
        { x: 'f32', y: 'f32', z: 'f32', w: 'f32' },
        {},
        'vec4f',
    ),
} as const;
