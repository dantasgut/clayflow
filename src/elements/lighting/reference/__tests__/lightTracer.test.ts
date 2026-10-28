/**
 * Cáusticas da referência da CPU (spec 034, T067a): o traçado a partir da luz (`lightTrace`) contra casos analíticos
 * escritos aqui — o sol direto num chão (E cos θ), a lâmina de água plana (Fresnel pelas leis do seno e da tangente,
 * Snell e Beer–Lambert por canal), e a esfera de vidro: o fluxo conservado, o foco no eixo à distância paraxial
 * f = nR / (2(n − 1)) do centro e, com dispersão, o azul focando antes do vermelho.
 */
import { describe, expect, it } from 'vitest';
import {
    dispersionIors,
    lightTrace,
    type PtReceiver,
    type PtScene,
    type Vec3,
} from '../pathTracer';

const DEG = Math.PI / 180;
const E0: Vec3 = [1, 1, 1];

/** Fresnel não polarizado pelas leis do seno e da tangente (oráculo independente). */
function fresnelOracle(i: number, n1: number, n2: number): number {
    if (i === 0) return ((n1 - n2) / (n1 + n2)) ** 2;
    const t = Math.asin((n1 / n2) * Math.sin(i));
    return (
        0.5 * ((Math.sin(i - t) / Math.sin(i + t)) ** 2 + (Math.tan(i - t) / Math.tan(i + t)) ** 2)
    );
}

/** Chão difuso com o topo em `y` (id 0). */
const floorAt = (y: number): PtScene['objects'][number] => ({
    id: 0,
    shape: { kind: 'box', min: [-3, y - 1, -3], max: [3, y, 3] },
    material: { albedo: [0.5, 0.5, 0.5] },
});

/** Receptor quadrado de lado `size` centrado em (0, y, 0) no topo do chão. */
const receiverAt = (y: number, size: number, n: number): PtReceiver => ({
    objectId: 0,
    corner: [-size / 2, y, -size / 2],
    u: [size, 0, 0],
    v: [0, 0, size],
    nx: n,
    ny: n,
});

const mean = (rgb: Float32Array, c: number): number => {
    let s = 0;
    for (let i = c; i < rgb.length; i += 3) s += rgb[i]!;
    return s / (rgb.length / 3);
};

/** Luz a `theta` da vertical, no plano xy, e a janela acima da origem. */
const sun = (theta: number): { direction: Vec3; illuminance: Vec3 } => ({
    direction: [Math.sin(theta), -Math.cos(theta), 0],
    illuminance: E0,
});
const above = (theta: number, h = 5): Vec3 => [-Math.sin(theta) * h, Math.cos(theta) * h, 0];

describe(
    'referência da CPU — cáusticas pelo traçado a partir da luz (spec 034, T067a)',
    { timeout: 60_000 },
    () => {
        it('sol direto a 30°: o chão recebe E cos θ em todas as células', () => {
            const theta = 30 * DEG;
            const map = lightTrace({ objects: [floorAt(0)] }, sun(theta), receiverAt(0, 1, 8), {
                photons: 160_000,
                center: above(theta),
                halfWidth: 1.5,
            });
            const want = Math.cos(theta);
            expect(Math.abs(mean(map.rgb, 0) - want) / want).toBeLessThan(0.002);
            for (let i = 0; i < map.rgb.length; i += 3)
                expect(Math.abs(map.rgb[i]! - want) / want).toBeLessThan(0.05);
        });

        it('lâmina de água plana a 0° e 30°: E cos θ (1 − R) exp(−σ_c h / cos θ_t) por canal', () => {
            const h = 0.3;
            const sigma: Vec3 = [1.5, 0.4, 0.2];
            for (const deg of [0, 30]) {
                const theta = deg * DEG;
                const scene: PtScene = {
                    objects: [
                        floorAt(0),
                        {
                            id: 1,
                            // O fundo da água dentro do chão: o chão é a primeira superfície que o fóton encontra.
                            shape: { kind: 'box', min: [-3, -0.01, -3], max: [3, h, 3] },
                            material: {
                                albedo: [0, 0, 0],
                                dielectric: {
                                    ior: 1.333,
                                    color: sigma.map((s) => Math.exp(-s)) as unknown as Vec3,
                                    depth: 1,
                                },
                            },
                        },
                    ],
                };
                const map = lightTrace(scene, sun(theta), receiverAt(0, 1, 4), {
                    photons: 250_000,
                    center: above(theta),
                    halfWidth: 1.5,
                });
                const thetaT = Math.asin(Math.sin(theta) / 1.333);
                const t = 1 - fresnelOracle(theta, 1, 1.333);
                for (let c = 0; c < 3; c++) {
                    const want =
                        Math.cos(theta) * t * Math.exp((-sigma[c]! * h) / Math.cos(thetaT));
                    expect(Math.abs(mean(map.rgb, c) - want) / want).toBeLessThan(0.01);
                }
            }
        });

        it('esfera de vidro: o fluxo se conserva e o foco cai no eixo, à distância paraxial nR / (2(n − 1)) do centro', () => {
            const n = 1.5;
            const r = 0.1;
            const cy = 0.5;
            const f = (n * r) / (2 * (n - 1));
            const scene: PtScene = {
                objects: [
                    floorAt(cy - f),
                    {
                        id: 1,
                        shape: { kind: 'sphere', center: [0, cy, 0], radius: r },
                        material: { albedo: [0, 0, 0], dielectric: { ior: n } },
                    },
                ],
            };
            const map = lightTrace(scene, sun(0), receiverAt(cy - f, 0.1, 21), {
                photons: 250_000,
                center: [0, 3, 0],
                halfWidth: 0.15,
            });
            // Sem absorção: o que sai da janela chega a alguma superfície ou escapa (o teto de interfaces quase nunca corta).
            const total = map.received[0] + map.landedElsewhere[0] + map.escaped[0];
            expect(Math.abs(total - map.emitted[0]) / map.emitted[0]).toBeLessThan(1e-3);
            let peak = 0;
            let at = -1;
            for (let i = 0; i < map.rgb.length; i += 3)
                if (map.rgb[i]! > peak) [peak, at] = [map.rgb[i]!, i / 3];
            expect(at).toBe(10 * 21 + 10);
            expect(peak).toBeGreaterThan(20);
        });

        it('esfera dispersiva: o azul (índice maior) foca antes — num plano além dos dois focos, a mancha dele é mais larga', () => {
            const glass = { ior: 1.5, abbe: 20 };
            const [nr, , nb] = dispersionIors(glass);
            const r = 0.1;
            const cy = 0.5;
            const fb = (nb * r) / (2 * (nb - 1));
            const fr = (nr * r) / (2 * (nr - 1));
            expect(nb).toBeGreaterThan(nr);
            expect(fr).toBeGreaterThan(fb);
            // Feixe paraxial (raio 0,2 R: aberração esférica pequena) e o plano a 3 f do centro.
            const y = cy - 3 * fr;
            const scene: PtScene = {
                objects: [
                    floorAt(y),
                    {
                        id: 1,
                        shape: { kind: 'sphere', center: [0, cy, 0], radius: r },
                        material: { albedo: [0, 0, 0], dielectric: glass },
                    },
                ],
            };
            const size = 0.06;
            const cells = 61;
            const map = lightTrace(scene, sun(0), receiverAt(y, size, cells), {
                photons: 90_000,
                center: [0, 3, 0],
                halfWidth: 0.02,
            });
            const rms = (c: number): number => {
                let w = 0;
                let m2 = 0;
                for (let j = 0; j < cells; j++)
                    for (let i = 0; i < cells; i++) {
                        const e = map.rgb[(j * cells + i) * 3 + c]!;
                        const x = ((i + 0.5) / cells - 0.5) * size;
                        const z = ((j + 0.5) / cells - 0.5) * size;
                        w += e;
                        m2 += e * (x * x + z * z);
                    }
                return Math.sqrt(m2 / w);
            };
            // A mancha de cada canal: o feixe de meia largura h cruza no foco f_c e chega a 3f com raio ~h (3 f − f_c) / f_c.
            const spot = (fc: number): number => (0.02 * (3 * fr - fc)) / fc;
            expect(rms(2)).toBeGreaterThan(rms(0));
            expect(rms(2) / rms(0)).toBeCloseTo(spot(fb) / spot(fr), 1);
        });
    },
);
