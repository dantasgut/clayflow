// Referência da CPU dos nós de condição (spec 031, R12). Tolerância 1e-6 (resultados exatos: 0, 1 ou uma das entradas).
import { compareOps } from '../condition';
import { num, uniform, vec, vector, type NodeCase } from './cases';

/** `condition.compare`: 1 verdadeiro, 0 falso (operações de `compareOps`; igualdade dentro de `epsilon`). */
export function compare(a: number, b: number, op: number, epsilon: number): number {
    const r =
        op === compareOps.less
            ? a < b
            : op === compareOps.lessEqual
              ? a <= b
              : op === compareOps.greater
                ? a > b
                : op === compareOps.greaterEqual
                  ? a >= b
                  : op === compareOps.equal
                    ? Math.abs(a - b) <= epsilon
                    : op === compareOps.notEqual
                      ? Math.abs(a - b) > epsilon
                      : false;
    return r ? 1 : 0;
}

const OPS = Object.values(compareOps);

/** Casos dos nós `condition.*`. */
export const conditionCases: readonly NodeCase[] = [
    {
        node: 'condition.compare',
        tolerance: 1e-6,
        // Um terço das amostras com `b` = `a` (a igualdade e os limites dos ≤/≥ aparecem).
        sample: (r, k) => {
            const a = uniform(r, -2, 2);
            return {
                a,
                b: k % 3 === 0 ? a : uniform(r, -2, 2),
                op: OPS[k % OPS.length]!,
                epsilon: k % 2 === 0 ? 0 : 0.5,
            };
        },
        reference: (x) => ({ value: compare(num(x.a), num(x.b), num(x.op), num(x.epsilon)) }),
    },
    {
        node: 'condition.select',
        tolerance: 1e-6,
        sample: (r) => ({
            if_false: uniform(r, -4, 4),
            if_true: uniform(r, -4, 4),
            condition: uniform(r, -1, 2),
        }),
        reference: (x) => ({ value: num(x.condition) > 0.5 ? num(x.if_true) : num(x.if_false) }),
    },
    {
        node: 'condition.select3',
        tolerance: 1e-6,
        sample: (r) => ({
            if_false: vector(r, 3, -4, 4),
            if_true: vector(r, 3, -4, 4),
            condition: uniform(r, -1, 2),
        }),
        reference: (x) => ({
            value: [...(num(x.condition) > 0.5 ? vec(x.if_true) : vec(x.if_false))],
        }),
    },
];
