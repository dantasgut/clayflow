import { describe, expect, it } from 'vitest';
import {
    fresnelDielectric,
    radianceAt,
    renderPathTraced,
    regionMeans,
    type PtMaterial,
    type PtScene,
} from '../pathTracer';

describe('traçador de caminhos de referência (spec 033, R8)', () => {
    it('forno: dentro de uma caixa emissora de albedo 0,5, a série de rebatimentos é exata', () => {
        const scene: PtScene = {
            objects: [
                {
                    id: 0,
                    shape: { kind: 'box', min: [-1, -1, -1], max: [1, 1, 1] },
                    material: { albedo: [0.5, 0.5, 0.5], emission: [1, 1, 1] },
                },
            ],
        };
        for (const [bounces, expected] of [
            [0, 1],
            [1, 1.5],
            [3, 1.875],
        ] as const) {
            const l = radianceAt(scene, [0, 0, 0], [0.3, 0.2, 1], {
                width: 1,
                height: 1,
                samples: 16,
                bounces,
            });
            expect(l[0]).toBeCloseTo(expected, 6);
        }
    });

    it('luz direta: plano de Lambert sob luz pontual (albedo/π · I · cos / d²)', () => {
        const scene: PtScene = {
            objects: [
                {
                    id: 1,
                    shape: { kind: 'quad', corner: [-50, 0, -50], u: [100, 0, 0], v: [0, 0, 100] },
                    material: { albedo: [0.8, 0.8, 0.8] },
                },
            ],
            lights: [{ kind: 'point', position: [0, 2, 0], intensity: [100, 100, 100] }],
        };
        const l = radianceAt(scene, [1, 1, 0], [-1, -1, 0], {
            width: 1,
            height: 1,
            samples: 4,
            bounces: 0,
        });
        // Ponto atingido (0, 0, 0): cos = 1, d = 2.
        expect(l[0]).toBeCloseTo((0.8 / Math.PI) * (100 / 4), 6);
    });

    it('emissor de área: radiância de um plano de Lambert sob um quadrado emissor igual ao fator de forma', () => {
        // Quadrado 2×2 a altura 1 sobre o ponto: fator de forma por quatro quadrantes de canto (X = Y = 1).
        const x = 1;
        const quadrant =
            (1 / (2 * Math.PI))
            * 2
            * (x / Math.sqrt(1 + x * x))
            * Math.atan(x / Math.sqrt(1 + x * x));
        const formFactor = 4 * quadrant;
        const scene: PtScene = {
            objects: [
                {
                    id: 0,
                    shape: { kind: 'quad', corner: [-1, 1, -1], u: [2, 0, 0], v: [0, 0, 2] },
                    material: { albedo: [0, 0, 0], emission: [1, 1, 1] },
                },
                {
                    id: 1,
                    shape: { kind: 'quad', corner: [-50, 0, -50], u: [100, 0, 0], v: [0, 0, 100] },
                    material: { albedo: [1, 1, 1] },
                },
            ],
        };
        const l = radianceAt(scene, [0.5, 0.5, 0], [-1, -1, 0], {
            width: 1,
            height: 1,
            samples: 8000,
            bounces: 0,
        });
        expect(Math.abs(l[0] - formFactor) / formFactor).toBeLessThan(0.02);
    });

    it('Beer-Lambert: meio só absorvente atenua por exp(−σ·d), nos dois modos', () => {
        const scene: PtScene = {
            objects: [
                {
                    id: 0,
                    shape: { kind: 'quad', corner: [-5, -5, 5], u: [10, 0, 0], v: [0, 10, 0] },
                    material: { albedo: [0, 0, 0], emission: [1, 1, 1] },
                },
            ],
            media: [
                {
                    min: [-5, -5, 0],
                    max: [5, 5, 2],
                    scattering: [0, 0, 0],
                    absorption: [0.5, 0.5, 0.5],
                    g: 0,
                },
            ],
        };
        const cam = { position: [0, 0, -1] as const, target: [0, 0, 5] as const, fovY: 0.01 };
        const single = renderPathTraced(scene, cam, {
            width: 1,
            height: 1,
            samples: 1,
            bounces: 0,
            media: 'single',
        });
        expect(single.rgb[0]).toBeCloseTo(Math.exp(-1), 5);
        const full = renderPathTraced(scene, cam, {
            width: 1,
            height: 1,
            samples: 4000,
            bounces: 0,
        });
        expect(Math.abs(full.rgb[0]! - Math.exp(-1)) / Math.exp(-1)).toBeLessThan(0.04);
    });

    it('regiões: média por instância vista', () => {
        const scene: PtScene = {
            objects: [
                {
                    id: 3,
                    shape: { kind: 'quad', corner: [-5, -5, 5], u: [5, 0, 0], v: [0, 10, 0] },
                    material: { albedo: [0, 0, 0], emission: [2, 2, 2] },
                },
                {
                    id: 4,
                    shape: { kind: 'quad', corner: [0, -5, 5], u: [5, 0, 0], v: [0, 10, 0] },
                    material: { albedo: [0, 0, 0], emission: [0, 1, 0] },
                },
            ],
        };
        const img = renderPathTraced(
            scene,
            { position: [0, 0, 0], target: [0, 0, 5], fovY: 1 },
            { width: 16, height: 8, samples: 1, bounces: 0 },
        );
        const means = regionMeans(img);
        expect(means.get(3)?.[0]).toBeCloseTo(2, 6);
        expect(means.get(4)?.[1]).toBeCloseTo(1, 6);
    });

    describe('dielétrico (spec 034)', () => {
        /** Emissor branco grande em z = −2 e uma placa de vidro (espessura 0,1) em z ∈ [−1,1; −1]. */
        const slab = (dielectric: NonNullable<PtMaterial['dielectric']>): PtScene => ({
            objects: [
                {
                    id: 0,
                    shape: { kind: 'quad', corner: [-50, -50, -2], u: [100, 0, 0], v: [0, 100, 0] },
                    material: { albedo: [0, 0, 0], emission: [1, 1, 1] },
                },
                {
                    id: 1,
                    shape: { kind: 'box', min: [-5, -5, -1.1], max: [5, 5, -1] },
                    material: { albedo: [0, 0, 0], dielectric },
                },
            ],
        });
        const opts = { width: 1, height: 1, samples: 20000, bounces: 0 } as const;
        /** Placa na incidência normal com as reflexões múltiplas entre as faces: (1 − R)/(1 + R). */
        const slabT = (ior: number): number => {
            const r = fresnelDielectric(1, 1, ior);
            return (1 - r) / (1 + r);
        };

        it('Fresnel: 4 % na incidência normal do vidro; reflexão interna total além do ângulo crítico', () => {
            expect(fresnelDielectric(1, 1, 1.5)).toBeCloseTo(0.04, 6);
            expect(fresnelDielectric(1, 1.5, 1)).toBeCloseTo(0.04, 6);
            const critical = Math.cos(Math.asin(1 / 1.5));
            expect(fresnelDielectric(critical - 1e-3, 1.5, 1)).toBe(1);
        });

        it('placa lisa: o emissor visto através dela com (1 − R)/(1 + R)', () => {
            const l = radianceAt(slab({ ior: 1.5 }), [0, 0, 0], [0, 0, -1], opts);
            expect(Math.abs(l[0] / slabT(1.5) - 1)).toBeLessThan(0.01);
        });

        it('absorção: e^(−σ·L) pelo trecho dentro do vidro', () => {
            const l = radianceAt(
                slab({ ior: 1.5, absorption: [4, 0, 0] }),
                [0, 0, 0],
                [0, 0, -1],
                opts,
            );
            // Cada travessia da placa (0,1) atenua e^(−0,4); a maior parte da luz atravessa uma vez.
            expect(Math.abs(l[0] / (slabT(1.5) * Math.exp(-0.4)) - 1)).toBeLessThan(0.02);
            expect(Math.abs(l[1] / slabT(1.5) - 1)).toBeLessThan(0.01);
        });

        it('dispersão: cada canal atravessa com o Fresnel do próprio índice', () => {
            const iors = [1.4, 1.5, 1.6] as const;
            const l = radianceAt(slab({ ior: iors }), [0, 0, 0], [0, 0, -1], opts);
            for (let c = 0; c < 3; c++)
                expect(Math.abs(l[c]! / slabT(iors[c]!) - 1)).toBeLessThan(0.01);
        });

        it('forno branco: uma esfera de vidro, lisa ou áspera, no céu uniforme conserva a energia', () => {
            for (const roughness of [0, 0.3, 0.7]) {
                const scene: PtScene = {
                    objects: [
                        {
                            id: 1,
                            shape: { kind: 'sphere', center: [0, 0, -3], radius: 1 },
                            material: { albedo: [0, 0, 0], dielectric: { ior: 1.5, roughness } },
                        },
                    ],
                    sky: () => [1, 1, 1],
                };
                const l = radianceAt(scene, [0, 0, 0], [0.1, 0.05, -1], { ...opts, samples: 8000 });
                // Nunca cria energia. Liso, exatamente 1; rugosidade 0,3, a perda do espalhamento único das micro-faces
                // (≈ 1 %); 0,7 (α = 0,49) perde bem mais pelas interfaces (o espalhamento múltiplo não é modelado).
                expect(l[0]).toBeLessThanOrEqual(1 + 1e-9);
                if (roughness === 0) expect(l[0]).toBeGreaterThan(0.999);
                if (roughness === 0.3) expect(l[0]).toBeGreaterThan(0.97);
            }
        });
    });
});
