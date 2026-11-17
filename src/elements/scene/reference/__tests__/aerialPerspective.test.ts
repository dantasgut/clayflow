import { describe, expect, it } from 'vitest';
import {
    aerialPerspective,
    earthAtmosphere,
    multipleScattering,
    skyRadiance,
    transmittanceToTop,
    type Vec3,
} from '../atmosphere';

// Perspectiva aérea da referência f64 (spec 041, T008): da câmera até um ponto a distância finita.

const atmosphere = earthAtmosphere();
const sun: Vec3 = [Math.cos(0.6), Math.sin(0.6), 0];
const horizon: Vec3 = [0, 0.05, Math.sqrt(1 - 0.05 * 0.05)];
/** Ψms em tabela grossa memorizada (o mesmo em todos os casos: o teste compara caminhos, não a tabela). */
const msCache = new Map<string, Vec3>();
const ms = (r: number, muS: number): Vec3 => {
    const key = `${r.toFixed(1)}:${muS.toFixed(2)}`;
    let v = msCache.get(key);
    if (v === undefined) {
        v = multipleScattering(atmosphere, r, muS, 16, 12);
        msCache.set(key, v);
    }
    return v;
};

describe('aerialPerspective', () => {
    it('distância 0: nada espalhado, transmitância 1', () => {
        // Act
        const a = aerialPerspective(atmosphere, 0.2, horizon, sun, 0, 32, ms);
        // Assert
        expect(a.scattered).toEqual([0, 0, 0]);
        expect(a.transmittance).toEqual([1, 1, 1]);
    });

    it('no infinito acima do horizonte é a radiância do céu', () => {
        const far = aerialPerspective(atmosphere, 0.2, horizon, sun, 1e6, 128, ms);
        const sky = skyRadiance(atmosphere, 0.2, horizon, sun, 128, ms);
        for (let c = 0; c < 3; c++) expect(far.scattered[c]!).toBeCloseTo(sky[c]!, 12);
    });

    it('cresce com a distância, a transmitância cai, e o azul se espalha mais que o vermelho', () => {
        let last = aerialPerspective(atmosphere, 0.2, horizon, sun, 0, 32, ms);
        for (const d of [0.5, 2, 10, 30]) {
            const a = aerialPerspective(atmosphere, 0.2, horizon, sun, d, 64, ms);
            for (let c = 0; c < 3; c++) {
                expect(a.scattered[c]!).toBeGreaterThan(last.scattered[c]!);
                expect(a.transmittance[c]!).toBeLessThan(last.transmittance[c]!);
            }
            expect(a.transmittance[2]!).toBeLessThan(a.transmittance[0]!);
            last = a;
        }
    });

    it('a transmitância de um trecho vertical é a razão das transmitâncias até o topo', () => {
        const up: Vec3 = [0, 1, 0];
        const a = aerialPerspective(atmosphere, 0.2, up, sun, 3, 256, ms);
        const r = atmosphere.bottomRadius + 0.2;
        const t0 = transmittanceToTop(atmosphere, r, 1, 512);
        const t1 = transmittanceToTop(atmosphere, r + 3, 1, 512);
        for (let c = 0; c < 3; c++) expect(a.transmittance[c]!).toBeCloseTo(t0[c]! / t1[c]!, 5);
    });
});
