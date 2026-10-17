import { describe, expect, it } from 'vitest';
import { dfgTexel, hammersley } from '../dfg';

// Tabela DFG de referência (spec 011, T025): faixas e limites conhecidos do split-sum e do albedo do sheen.

describe('DFG — referência de CPU', () => {
    it('Hammersley: inverso de bits', () => {
        expect(hammersley(1, 4)).toEqual([0.25, 0.5]);
        expect(hammersley(2, 4)).toEqual([0.5, 0.25]);
    });

    it('liso e de frente: E_ss = A + B ≈ 1 e A ≈ 1 (F0 = 1 reflete tudo)', () => {
        const t = dfgTexel(0.99, 0.03, 1024);
        expect(t.a + t.b).toBeGreaterThan(0.97);
        expect(t.a + t.b).toBeLessThanOrEqual(1.001);
    });

    it('rugoso perde energia no espalhamento simples (a compensação devolve)', () => {
        const t = dfgTexel(0.5, 1, 1024);
        expect(t.a + t.b).toBeLessThan(0.9);
        expect(t.a + t.b).toBeGreaterThan(0.4);
    });

    it('valores em [0, 1] em toda a tabela (amostras reduzidas)', () => {
        for (const mu of [0.05, 0.3, 0.7, 1]) {
            for (const r of [0.05, 0.4, 0.8, 1]) {
                const t = dfgTexel(mu, r, 128);
                for (const x of [t.a, t.b, t.sheen]) {
                    expect(x).toBeGreaterThanOrEqual(0);
                    expect(x).toBeLessThanOrEqual(1.001);
                }
            }
        }
    });
});
