import { describe, expect, it } from 'vitest';
import {
    earthAtmosphere,
    miePhase,
    rayleighPhase,
    skyRadiance,
    sunTransmittance,
    transmittanceToTop,
    type Vec3,
} from '../atmosphere';

const sunAt = (elevationDeg: number): Vec3 => {
    const e = (elevationDeg * Math.PI) / 180;
    return [Math.cos(e), Math.sin(e), 0];
};

/** Integral de uma fase sobre a esfera (deve dar 1). */
function phaseIntegral(f: (c: number) => number): number {
    const n = 20000;
    let s = 0;
    for (let i = 0; i < n; i++) {
        const c = -1 + (2 * (i + 0.5)) / n;
        s += f(c) * (2 / n);
    }
    return s * 2 * Math.PI;
}

describe('referência do céu físico (spec 033, R4)', () => {
    const atm = earthAtmosphere();

    it('fases normalizadas', () => {
        expect(phaseIntegral(rayleighPhase)).toBeCloseTo(1, 3);
        expect(phaseIntegral((c) => miePhase(c, 0.8))).toBeCloseTo(1, 2);
    });

    it('transmitância: 1 no topo, cai com o ângulo zenital, vermelho passa mais que azul', () => {
        const top = transmittanceToTop(atm, atm.topRadius - 1e-6, 1);
        expect(top[2]).toBeGreaterThan(0.999);
        let prev = 2;
        for (const e of [90, 60, 30, 10, 5, 2]) {
            const t = sunTransmittance(atm, 0, sunAt(e));
            expect(t[1]).toBeLessThan(prev);
            expect(t[0]).toBeGreaterThan(t[2]);
            prev = t[1];
        }
        // Zênite: transmitância verde típica ~0,9.
        expect(sunTransmittance(atm, 0, sunAt(90))[1]).toBeGreaterThan(0.8);
        // Abaixo do horizonte a partir do chão: 0.
        expect(sunTransmittance(atm, 0, sunAt(-5))).toEqual([0, 0, 0]);
    });

    it('céu azul ao meio-dia; o sol no horizonte avermelha a luz (razão vermelho/azul monótona)', () => {
        const zenith: Vec3 = [0, 1, 0];
        const noon = skyRadiance(atm, 0.2, zenith, sunAt(60), 48);
        expect(noon[2]).toBeGreaterThan(noon[0]);
        let prevRatio = 0;
        for (const e of [60, 30, 10, 3]) {
            const t = sunTransmittance(atm, 0.2, sunAt(e));
            const ratio = t[0] / t[2];
            expect(ratio).toBeGreaterThan(prevRatio);
            prevRatio = ratio;
        }
    });

    it('múltiplo espalhamento soma luz (radiância maior que só o espalhamento simples)', () => {
        const view: Vec3 = [0.6, 0.8, 0];
        const sun = sunAt(30);
        const full = skyRadiance(atm, 0.2, view, sun, 48);
        const single = skyRadiance(atm, 0.2, view, sun, 48, () => [0, 0, 0]);
        for (let c = 0; c < 3; c++) expect(full[c]).toBeGreaterThan(single[c]!);
    });
});
