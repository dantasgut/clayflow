import { describe, expect, it } from 'vitest';
import { ambientParamsUniform, evalParams, indirectParams } from '../closure';

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

    it('closure_indirect (spec 033): com irradiância e radiância especular iguais, o forno do hemisfério uniforme', () => {
        for (const roughness of [0.1, 0.5, 1])
            for (const metallic of [0, 1]) {
                const m = { albedo: [0.7, 0.4, 0.2] as const, roughness, metallic };
                const uniform = ambientParamsUniform(m, 0.6, 2);
                const indirect = indirectParams(m, 0.6, {
                    diffuse: [2, 2, 2],
                    specular: [2, 2, 2],
                });
                for (let k = 0; k < 3; k++) expect(indirect[k]).toBeCloseTo(uniform[k]!, 10);
            }
    });

    it('closure_indirect (spec 033): rugosidade 0 lê só a radiância especular; 1, só a irradiância', () => {
        const metal = { albedo: [1, 1, 1] as const, roughness: 0.001, metallic: 1 };
        const sharp = indirectParams(metal, 1, { diffuse: [0, 0, 0], specular: [1, 1, 1] });
        expect(sharp[0]).toBeGreaterThan(0.9);
        const rough = indirectParams({ ...metal, roughness: 1 }, 1, {
            diffuse: [0, 0, 0],
            specular: [1, 1, 1],
        });
        expect(rough[0]).toBeCloseTo(0, 10);
    });
});
