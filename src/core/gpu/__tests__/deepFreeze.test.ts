import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../deepFreeze';

describe('deepFreeze', () => {
    it('congela objetos e arrays aninhados e devolve o mesmo objeto', () => {
        const spec = { a: { b: [1, { c: 2 }] }, d: 'x' };
        const out = deepFreeze(spec);
        expect(out).toBe(spec);
        expect(Object.isFrozen(spec)).toBe(true);
        expect(Object.isFrozen(spec.a)).toBe(true);
        expect(Object.isFrozen(spec.a.b)).toBe(true);
        expect(Object.isFrozen(spec.a.b[1])).toBe(true);
    });

    it('não entra em funções nem no prototype delas', () => {
        function body(): void {}
        const spec = { body };
        deepFreeze(spec);
        expect(Object.isFrozen(spec)).toBe(true);
        expect(Object.isFrozen(body)).toBe(false);
        expect(Object.isFrozen(body.prototype)).toBe(false);
    });

    it('para em objetos já congelados (compartilhados não são revisitados)', () => {
        const inner = { x: { y: 1 } };
        Object.freeze(inner);
        const spec = { inner };
        deepFreeze(spec);
        expect(Object.isFrozen(spec)).toBe(true);
        // `inner` já estava congelado: o filho mutável dele não é tocado.
        expect(Object.isFrozen(inner.x)).toBe(false);
    });

    it('ciclos terminam', () => {
        const a: Record<string, unknown> = { v: 1 };
        a.self = a;
        expect(() => deepFreeze(a)).not.toThrow();
        expect(Object.isFrozen(a)).toBe(true);
    });

    it('atribuição posterior lança TypeError em módulo estrito', () => {
        const spec = deepFreeze({ n: 1, nested: { m: 2 } });
        expect(() => {
            (spec as { n: number }).n = 2;
        }).toThrow(TypeError);
        expect(() => {
            spec.nested.m = 3;
        }).toThrow(TypeError);
    });

    it('primitivos passam inalterados', () => {
        expect(deepFreeze(3)).toBe(3);
        expect(deepFreeze(null)).toBe(null);
    });
});
