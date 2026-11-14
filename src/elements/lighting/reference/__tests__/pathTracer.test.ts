import { describe, expect, it } from 'vitest';
import { radianceAt, renderPathTraced, regionMeans, type PtScene, type Vec3 } from '../pathTracer';

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

    it('meio colorido (T067a): no voo livre cada canal atenua pelo próprio coeficiente, exp(−σ_c·d)', () => {
        const sigma: Vec3 = [0.25, 0.5, 1];
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
                    absorption: sigma,
                    g: 0,
                },
            ],
        };
        const cam = { position: [0, 0, -1] as const, target: [0, 0, 5] as const, fovY: 0.01 };
        const full = renderPathTraced(scene, cam, {
            width: 1,
            height: 1,
            samples: 6000,
            bounces: 0,
        });
        for (let c = 0; c < 3; c++) {
            const want = Math.exp(-sigma[c]! * 2);
            expect(Math.abs(full.rgb[c]! - want) / want).toBeLessThan(0.06);
        }
    });

    it('dielétrico absorvente com espalhamento dentro (T067a): a absorção conta uma vez pelo caminho, não de novo do evento', () => {
        // Índice 1 (sem Fresnel nem desvio), absorção 0,5/m por 2 m; dentro, espalhamento forte quase todo para a frente.
        const scene: PtScene = {
            objects: [
                {
                    id: 0,
                    shape: { kind: 'quad', corner: [-50, -50, 5], u: [100, 0, 0], v: [0, 100, 0] },
                    material: { albedo: [0, 0, 0], emission: [1, 1, 1] },
                },
                {
                    id: 1,
                    shape: { kind: 'box', min: [-5, -5, 0], max: [5, 5, 2] },
                    material: {
                        albedo: [0, 0, 0],
                        dielectric: {
                            ior: 1,
                            color: [Math.exp(-0.5), Math.exp(-0.5), Math.exp(-0.5)],
                            depth: 1,
                        },
                    },
                },
            ],
            media: [
                {
                    min: [-5, -5, 0],
                    max: [5, 5, 2],
                    scattering: [2, 2, 2],
                    absorption: [0, 0, 0],
                    g: 0.99,
                },
            ],
        };
        const cam = { position: [0, 0, -1] as const, target: [0, 0, 5] as const, fovY: 0.01 };
        const full = renderPathTraced(scene, cam, {
            width: 1,
            height: 1,
            samples: 4000,
            bounces: 64,
        });
        // Os desvios de g = 0,99 alongam o caminho em ~1 %: exp(−1) a 6 %.
        expect(Math.abs(full.rgb[0]! - Math.exp(-1)) / Math.exp(-1)).toBeLessThan(0.06);
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

    it('firstSample: duas metades independentes compõem a imagem de 2N amostras', () => {
        const scene: PtScene = {
            objects: [
                {
                    id: 1,
                    shape: { kind: 'quad', corner: [-50, 0, -50], u: [100, 0, 0], v: [0, 0, 100] },
                    material: { albedo: [0.8, 0.8, 0.8] },
                },
                {
                    id: 2,
                    shape: { kind: 'quad', corner: [-1, 3, -1], u: [2, 0, 0], v: [0, 0, 2] },
                    material: { albedo: [0, 0, 0], emission: [5, 5, 5] },
                },
            ],
        };
        const camera = { position: [0, 1, 4] as const, target: [0, 0, 0] as const, fovY: 1 };
        const opts = { width: 6, height: 4, samples: 4, bounces: 1 };
        const a = renderPathTraced(scene, camera, opts);
        const b = renderPathTraced(scene, camera, { ...opts, firstSample: 4 });
        const both = renderPathTraced(scene, camera, { ...opts, samples: 8 });
        expect(Array.from(a.rgb)).not.toEqual(Array.from(b.rgb));
        for (let i = 0; i < both.rgb.length; i++)
            expect((a.rgb[i]! + b.rgb[i]!) / 2).toBeCloseTo(both.rgb[i]!, 6);
    });
});
