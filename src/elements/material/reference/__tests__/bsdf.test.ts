import { describe, expect, it } from 'vitest';
import {
    alpha2Of,
    burleyWrap,
    dCharlie,
    dGgx,
    dGgxAniso,
    f0FromIor,
    f82,
    fDielectric,
    fSchlick,
    orenNayarEnergy,
    thinFilm,
    vSmithCorrelated,
} from '../bsdf';

// Referências das funções de espalhamento (spec 011, T025): normalizações e casos-limite publicados.

/** ∫ f(θ) dω no hemisfério, por quadratura em θ (a função só depende de θ). */
function hemisphere(f: (cosT: number) => number, n = 4096): number {
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) / n) * (Math.PI / 2);
        sum += f(Math.cos(t)) * Math.sin(t);
    }
    return sum * (Math.PI / 2 / n) * 2 * Math.PI;
}

describe('bsdf — referências de CPU', () => {
    it('GGX normalizada: ∫ D(h)·(n·h) dω = 1', () => {
        for (const r of [0.1, 0.3, 0.6, 1]) {
            const a2 = alpha2Of(r);
            expect(hemisphere((c) => dGgx(c, a2) * c, 1 << 16)).toBeCloseTo(1, 2);
        }
    });

    it('GGX anisotrópica com α_t = α_b coincide com a isotrópica', () => {
        const a = 0.3 * 0.3;
        const nh = 0.9;
        const s = Math.sqrt(1 - nh * nh);
        expect(dGgxAniso(s * 0.6, s * 0.8, nh, a, a)).toBeCloseTo(dGgx(nh, a * a), 9);
    });

    it('Charlie normalizada: ∫ D(h)·(n·h) dω = 1', () => {
        for (const r of [0.3, 0.6, 1])
            expect(hemisphere((c) => dCharlie(c, r) * c)).toBeCloseTo(1, 2);
    });

    it('Smith correlacionado é simétrico em v e l', () => {
        expect(vSmithCorrelated(0.3, 0.8, 0.2)).toBeCloseTo(vSmithCorrelated(0.8, 0.3, 0.2), 12);
    });

    it('Fresnel: F0 do IOR 1,5 = 0,04; Schlick perto do exato; F82 com tinta branca = Schlick', () => {
        expect(f0FromIor(1.5)).toBeCloseTo(0.04, 12);
        expect(fDielectric(1, 1.5)).toBeCloseTo(0.04, 9);
        expect(fDielectric(0.0, 1.5)).toBeCloseTo(1, 6);
        const f0: [number, number, number] = [0.9, 0.6, 0.3];
        for (const c of [0.3, 0.7, 1]) {
            expect(f82(f0, [1, 1, 1], c)).toEqual(
                fSchlick(f0, [1, 1, 1], c).map((x) => Math.min(x, 1)),
            );
            expect(
                Math.abs(fSchlick([0.04, 0.04, 0.04], [1, 1, 1], c)[0] - fDielectric(c, 1.5)),
            ).toBeLessThan(0.02);
        }
        // Em μ̄ = 1/7 a refletância é a tinta × Schlick.
        const tint: [number, number, number] = [0.5, 0.8, 1];
        const at = f82(f0, tint, 1 / 7);
        const s = fSchlick(f0, [1, 1, 1], 1 / 7);
        for (let k = 0; k < 3; k++) expect(at[k]).toBeCloseTo(tint[k]! * s[k]!, 9);
    });

    it('Oren-Nayar energético: rugosidade 0 é Lambert; branco conserva energia em toda rugosidade', () => {
        const lambert = orenNayarEnergy([1, 1, 1], 0, 0.7, 0.5, 0.2)[0];
        expect(lambert).toBeCloseTo(0.7 / Math.PI, 9);
        for (const r of [0, 0.5, 1]) {
            for (const nv of [0.2, 0.6, 1]) {
                // Albedo direcional: ∫ f·cos dω_l, com l girando em φ (o termo depende de l·v).
                let sum = 0;
                const n = 256;
                for (let i = 0; i < n; i++) {
                    for (let j = 0; j < n; j++) {
                        const t = ((i + 0.5) / n) * (Math.PI / 2);
                        const p = ((j + 0.5) / n) * 2 * Math.PI;
                        const nl = Math.cos(t);
                        const sv = Math.sqrt(1 - nv * nv);
                        const lv = Math.sin(t) * Math.cos(p) * sv + nl * nv;
                        sum += orenNayarEnergy([1, 1, 1], r, nl, nv, lv)[0] * Math.sin(t);
                    }
                }
                const albedo = sum * (Math.PI / 2 / n) * ((2 * Math.PI) / n);
                expect(albedo).toBeGreaterThan(0.97);
                expect(albedo).toBeLessThan(1.03);
            }
        }
    });

    it('subsuperfície com raio 0 é Lambert e o terminador avança com o raio', () => {
        expect(burleyWrap([1, 1, 1], [0, 0, 0], 0.5)[0]).toBeCloseTo(0.5 / Math.PI, 12);
        expect(burleyWrap([1, 1, 1], [0.5, 0, 0], -0.2)[0]).toBeGreaterThan(0);
        expect(burleyWrap([1, 1, 1], [0.5, 0, 0], -0.2)[1]).toBe(0);
    });

    it('filme fino: espessura 0 = Fresnel da base; a cor muda com o ângulo', () => {
        const base: [number, number, number] = [0.04, 0.04, 0.04];
        expect(thinFilm(0.8, 0, 1.3, base)).toEqual(fSchlick(base, [1, 1, 1], 0.8));
        const a = thinFilm(1, 400, 1.3, base);
        const b = thinFilm(0.5, 400, 1.3, base);
        const hue = (c: readonly number[]) => c[0]! / (c[0]! + c[1]! + c[2]!);
        expect(Math.abs(hue(a) - hue(b))).toBeGreaterThan(0.01);
        for (const x of [...a, ...b]) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(1);
        }
    });
});
