import { describe, expect, it } from 'vitest';
import { adaptiveHysteresis, GI_RESPONSE, RESPONSE_EMPTY, type ResponseState } from '../response';

// Histerese adaptativa das sondas (spec 033, T036): a mudança de verdade reduz a histerese; o ruído não; parado, volta à
// do acúmulo.

/** Gerador determinístico em [0, 1). */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** Roda `n` quadros com a luminância de `sample`; devolve o estado, as histereses e os quadros em mudança. */
function run(
    state: ResponseState,
    n: number,
    sample: (k: number) => number,
): { state: ResponseState; hs: number[]; transients: number } {
    const hs: number[] = [];
    let transients = 0;
    for (let k = 0; k < n; k++) {
        const r = adaptiveHysteresis(state, sample(k), 0.97);
        state = r.state;
        hs.push(r.h);
        if (r.transient) transients++;
    }
    return { state, hs, transients };
}

describe('histerese adaptativa das sondas (spec 033, US4)', () => {
    it('recomeçar dá histerese 0 e os primeiros quadros fazem a média', () => {
        const a = adaptiveHysteresis(RESPONSE_EMPTY, 2, 0.97);
        expect(a.h).toBe(0);
        expect(a.state.mean).toBe(2);
        const b = adaptiveHysteresis(a.state, 2.1, 0.97);
        expect(b.transient).toBe(false);
        expect(b.h).toBeCloseTo(0.5);
        expect(b.state.mean).toBeCloseTo(2.05);
    });

    it('ruído forte em torno de uma média fixa: quase nunca acelera e a média fica estável', () => {
        const r = rng(7);
        // Luminância com desvio de 60 % (poucos raios numa fonte pequena).
        const noisy = (): number => 1 + 0.6 * (r() + r() + r() - 1.5) * 2;
        const warm = run(RESPONSE_EMPTY, 200, noisy);
        const after = run(warm.state, 2000, noisy);
        expect(after.transients / 2000).toBeLessThan(0.01);
        expect(after.hs.filter((h) => h === 0.97).length / 2000).toBeGreaterThan(0.99);
        expect(Math.abs(after.state.mean - 1)).toBeLessThan(0.15);
    });

    it('uma luz que acende: a histerese cai para a de resposta e a média alcança 95 % em ≤ 15 quadros (0,25 s)', () => {
        const r = rng(3);
        const warm = run(RESPONSE_EMPTY, 300, () => 0.1 * (0.9 + 0.2 * r()));
        let state = warm.state;
        let reached = -1;
        let sawResponse = false;
        for (let k = 0; k < 60; k++) {
            const x = 10 * (0.9 + 0.2 * r());
            const step = adaptiveHysteresis(state, x, 0.97);
            if (step.h === GI_RESPONSE.hysteresis) sawResponse = true;
            state = step.state;
            if (reached < 0 && state.mean >= 0.95 * 10) reached = k + 1;
        }
        expect(sawResponse).toBe(true);
        expect(reached).toBeGreaterThan(0);
        expect(reached).toBeLessThanOrEqual(15);
    });

    it('depois da mudança, parado, volta à histerese do acúmulo (sem rastro)', () => {
        const r = rng(11);
        let state = run(RESPONSE_EMPTY, 300, () => 0.1).state;
        state = run(state, 30, () => 10 * (0.95 + 0.1 * r())).state;
        const settled = run(state, 100, () => 10 * (0.95 + 0.1 * r()));
        expect(settled.hs.slice(-50).every((h) => h === 0.97)).toBe(true);
        expect(Math.abs(settled.state.mean - 10)).toBeLessThan(0.2);
    });
});
