import { describe, expect, it } from 'vitest';
import { ambientParamsUniform, evalParams, indirectParams } from '../closure';
import {
    CLOSURE_SIZE,
    closureAdd,
    closureDiffuse,
    closureMediumPriority,
    closureThinWalled,
    closureMix,
    closureTransmission,
    flattenClosure,
    unflattenClosure,
} from '../closureNodes';

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

    it('prioridade do meio (spec 034): padrão 0; soma, mistura e achatamento mantêm a maior', () => {
        const water = closureTransmission(1.33, [1, 1, 1], 0, 0, 0);
        const glass = closureMediumPriority(closureTransmission(1.5, [1, 1, 1], 0, 0, 0), 1);
        expect(water.transmission_priority).toBe(0);
        expect(glass.transmission_priority).toBe(1);
        expect(closureAdd(water, glass).transmission_priority).toBe(1);
        expect(closureAdd(glass, closureDiffuse([1, 1, 1], 0)).transmission_priority).toBe(1);
        expect(closureMix(water, glass, 0.3).transmission_priority).toBe(1);
        const flat = flattenClosure(glass);
        expect(flat).toHaveLength(CLOSURE_SIZE);
        expect(unflattenClosure(flat)).toEqual(glass);
    });

    it('parede fina (spec 034): padrão 0; só a marca muda; soma, mistura e achatamento a mantêm', () => {
        const glass = closureTransmission(1.5, [0.5, 0.6, 0.7], 2, 30, 0.2);
        const pane = closureThinWalled(glass);
        expect(glass.transmission_thin).toBe(0);
        expect(pane).toEqual({ ...glass, transmission_thin: 1 });
        expect(closureAdd(glass, pane).transmission_thin).toBe(1);
        expect(closureAdd(closureDiffuse([1, 1, 1], 0), pane).transmission_thin).toBe(1);
        expect(closureMix(glass, pane, 0.3).transmission_thin).toBe(1);
        expect(unflattenClosure(flattenClosure(pane))).toEqual(pane);
    });
});
