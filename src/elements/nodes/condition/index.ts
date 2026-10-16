import { defineNode } from '../../../scene/graph/NodeDefinition';
import {
    NODE_COMPARE_EQUAL,
    NODE_COMPARE_GREATER,
    NODE_COMPARE_GREATER_EQUAL,
    NODE_COMPARE_LESS,
    NODE_COMPARE_LESS_EQUAL,
    NODE_COMPARE_NOT_EQUAL,
} from '../../gpu/shaders/constants';
import { nodeCondition } from '../shaders';

// Nós de condição (spec 031, R12). Valem em todos os estágios. Referência: `reference/condition.ts`.

/** Códigos do parâmetro `op` de `condition.compare` (as constantes compartilhadas `NODE_COMPARE_*`). */
export const compareOps = Object.freeze({
    less: NODE_COMPARE_LESS.value,
    lessEqual: NODE_COMPARE_LESS_EQUAL.value,
    greater: NODE_COMPARE_GREATER.value,
    greaterEqual: NODE_COMPARE_GREATER_EQUAL.value,
    equal: NODE_COMPARE_EQUAL.value,
    notEqual: NODE_COMPARE_NOT_EQUAL.value,
});

/**
 * Comparação de `a` com `b` (padrão 0): 1,0 verdadeiro, 0,0 falso. `op` (`compareOps`; padrão `less`) muda sem
 * recompilar; igualdade dentro de `epsilon`.
 */
const compare = defineNode({
    name: 'condition.compare',
    inputs: { a: 'f32', b: 'f32' },
    outputs: { value: 'f32' },
    defaults: { b: '0.0' },
    params: {
        op: { type: 'u32', default: NODE_COMPARE_LESS.value },
        epsilon: { type: 'f32', default: 1e-6 },
    },
    code: nodeCondition,
    fn: 'node_condition_compare',
});

/** Escolha escalar: `if_true` com `condition` > 0,5, senão `if_false`. */
const select = defineNode({
    name: 'condition.select',
    inputs: { if_false: 'f32', if_true: 'f32', condition: 'f32' },
    outputs: { value: 'f32' },
    code: nodeCondition,
    fn: 'node_condition_select',
});

/** Escolha de `vec3f` (cores, posições): `if_true` com `condition` > 0,5, senão `if_false`. */
const select3 = defineNode({
    name: 'condition.select3',
    inputs: { if_false: 'vec3f', if_true: 'vec3f', condition: 'f32' },
    outputs: { value: 'vec3f' },
    code: nodeCondition,
    fn: 'node_condition_select3',
});

/** Condições: comparação e escolha. */
export const condition = { compare, select, select3 } as const;
