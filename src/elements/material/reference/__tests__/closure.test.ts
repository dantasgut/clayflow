import { describe, expect, it } from 'vitest';
import { ambientParamsUniform, evalParams } from '../closure';

// Referência do fechamento pronto (spec 011): o forno fecha em 1 e a luz por trás não reflete.

describe('base do OpenPBR — referência de CPU', () => {
    it('teste de forno: branco dielétrico e metálico refletem a radiância do ambiente', () => {
        for (const metallic of [0, 1])
            for (const roughness of [0, 0.5, 1])
                for (const nv of [0.3, 1])
                    expect(
                        ambientParamsUniform({ albedo: [1, 1, 1], roughness, metallic }, nv, 1)[0],
                    ).toBeCloseTo(1, 3);
    });

    it('luz por trás da superfície: nada refletido; de frente, difuso de um branco fosco perto de 1/π', () => {
        const m = { albedo: [1, 1, 1] as const, roughness: 1, metallic: 0 };
        expect(evalParams(m, [0, 1, 0], [0, 1, 0], [0, -1, 0], [1, 1, 1])).toEqual([0, 0, 0]);
        const front = evalParams(m, [0, 1, 0], [0, 1, 0], [0, 1, 0], [1, 1, 1])[0];
        expect(front).toBeGreaterThan(0.25);
        expect(front).toBeLessThan(0.4);
    });
});
