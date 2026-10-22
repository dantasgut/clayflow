/**
 * Dielétricos da referência da CPU (spec 034, T037/R10) contra casos analíticos escritos aqui, sem usar as funções do
 * traçador como oráculo: Fresnel pelas leis do seno e da tangente, placa paralela pela soma das reflexões múltiplas,
 * Snell na esfera pelo desvio 2(i − r), ângulo crítico, Beer–Lambert, pilha de meios (encaixados, sobrepostos com
 * prioridade e coincidentes) pelo método da adição de camadas, dispersão por canal, parede fina, a água por tabela de
 * alturas e a amostra GGX contra a integral numérica da BSDF de Walter et al. (2007).
 */
import { describe, expect, it } from 'vitest';
import {
    fresnelDielectric,
    radianceAt,
    sampleDielectricInterface,
    type PtDielectric,
    type PtObject,
    type PtScene,
    type Vec3,
} from '../pathTracer';

const DEG = Math.PI / 180;

/** Fresnel não polarizado pelas leis do seno e da tangente (oráculo independente); 1 acima do ângulo crítico. */
function fresnelOracle(i: number, n1: number, n2: number): number {
    if (i === 0) return ((n1 - n2) / (n1 + n2)) ** 2;
    const st = (n1 / n2) * Math.sin(i);
    if (st >= 1) return 1;
    const t = Math.asin(st);
    const rs = (Math.sin(i - t) / Math.sin(i + t)) ** 2;
    const rp = (Math.tan(i - t) / Math.tan(i + t)) ** 2;
    return 0.5 * (rs + rp);
}

/** Elemento do método da adição: transmitância e refletâncias pelos dois lados. */
interface Layer {
    t: number;
    rl: number;
    rr: number;
}
const iface = (n1: number, n2: number): Layer => {
    const r = fresnelOracle(0, n1, n2);
    return { t: 1 - r, rl: r, rr: r };
};
const absorber = (a: number): Layer => ({ t: a, rl: 0, rr: 0 });
/** Duas camadas em série com as reflexões múltiplas entre elas (incoerentes). */
function stackOf(...layers: Layer[]): Layer {
    return layers.reduce((a, b) => {
        const k = 1 / (1 - a.rr * b.rl);
        return {
            t: a.t * b.t * k,
            rl: a.rl + a.t * a.t * b.rl * k,
            rr: b.rr + b.t * b.t * a.rr * k,
        };
    });
}

const norm = (v: Vec3): Vec3 => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
};
const angleBetween = (a: Vec3, b: Vec3): number =>
    Math.acos(
        Math.min(
            1,
            (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a) / Math.hypot(...b),
        ),
    );

/** Céu aceso só num cone estreito em torno de `dir`. */
const coneSky =
    (dir: Vec3, radiusDeg: number) =>
    (d: Vec3): Vec3 =>
        angleBetween(d, dir) < radiusDeg * DEG ? [1, 1, 1] : [0, 0, 0];

const glass = (ior: number, extra: Partial<PtDielectric> = {}): PtObject['material'] => ({
    albedo: [0, 0, 0],
    dielectric: { ior, ...extra },
});

function trace(scene: PtScene, origin: Vec3, dir: Vec3, samples: number): Vec3 {
    return radianceAt(scene, origin, dir, { width: 1, height: 1, samples, bounces: 0 });
}

// Milhares de caminhos por caso (a água por marcha): o prazo cobre o CI com os arquivos em paralelo.
describe('referência da CPU — dielétricos (spec 034, R10)', { timeout: 30_000 }, () => {
    it('Fresnel exato: as leis do seno e da tangente, incidência normal, Brewster e reflexão interna total', () => {
        for (const i of [0, 10, 30, 45, 60, 75, 85, 89]) {
            expect(fresnelDielectric(Math.cos(i * DEG), 1, 1.5)).toBeCloseTo(
                fresnelOracle(i * DEG, 1, 1.5),
                12,
            );
            expect(fresnelDielectric(Math.cos(i * DEG), 1.33, 1.5)).toBeCloseTo(
                fresnelOracle(i * DEG, 1.33, 1.5),
                12,
            );
        }
        expect(fresnelDielectric(1, 1, 1.5)).toBeCloseTo(0.04, 12);
        // Em Brewster a componente p some: R = Rs/2.
        const b = Math.atan(1.5);
        const t = Math.asin(Math.sin(b) / 1.5);
        expect(fresnelDielectric(Math.cos(b), 1, 1.5)).toBeCloseTo(
            0.5 * (Math.sin(b - t) / Math.sin(b + t)) ** 2,
            12,
        );
        // Do vidro para o ar: ângulo crítico asin(1/1,5) = 41,81°.
        expect(fresnelDielectric(Math.cos(41.5 * DEG), 1.5, 1)).toBeLessThan(1);
        expect(fresnelDielectric(Math.cos(42 * DEG), 1.5, 1)).toBe(1);
    });

    it('placa paralela: sai paralela ao raio de entrada com T = (1 − R)/(1 + R) pelas reflexões múltiplas', () => {
        const slab: PtObject = {
            id: 1,
            shape: { kind: 'box', min: [-50, -50, 0], max: [50, 50, 0.5] },
            material: glass(1.5),
        };
        for (const i of [0, 45, 60]) {
            const dir: Vec3 = [Math.sin(i * DEG), 0, Math.cos(i * DEG)];
            const scene: PtScene = { objects: [slab], sky: coneSky(dir, 0.3) };
            const l = trace(scene, [0, 0, -1], dir, 40000);
            const r = fresnelOracle(i * DEG, 1, 1.5);
            expect(Math.abs(l[0] - (1 - r) / (1 + r))).toBeLessThan(0.006);
        }
    });

    it('Beer–Lambert: placa absorvente, a = cor^(L/profundidade) por passagem, T = (1 − R)²a / (1 − R²a²)', () => {
        const color: Vec3 = [0.3, 0.7, 1];
        const slab: PtObject = {
            id: 1,
            shape: { kind: 'box', min: [-50, -50, 0], max: [50, 50, 0.5] },
            material: glass(1.5, { color, depth: 1 }),
        };
        const scene: PtScene = { objects: [slab], sky: coneSky([0, 0, 1], 0.3) };
        const l = trace(scene, [0, 0, -1], [0, 0, 1], 40000);
        const r = 0.04;
        for (let c = 0; c < 3; c++) {
            const a = color[c]! ** 0.5;
            expect(Math.abs(l[c]! - ((1 - r) ** 2 * a) / (1 - r * r * a * a))).toBeLessThan(0.006);
        }
    });

    it('Snell na esfera: o raio direto sai desviado 2(i − r), com (1 − R)² da energia', () => {
        for (const i of [20, 40, 60]) {
            const n = 1.5;
            const r = Math.asin(Math.sin(i * DEG) / n);
            const dev = 2 * (i * DEG - r);
            const exit: Vec3 = [0, -Math.sin(dev), Math.cos(dev)];
            const scene: PtScene = {
                objects: [
                    {
                        id: 1,
                        shape: { kind: 'sphere', center: [0, 0, 0], radius: 1 },
                        material: glass(n),
                    },
                ],
                sky: coneSky(exit, 0.3),
            };
            const l = trace(scene, [0, Math.sin(i * DEG), -5], [0, 0, 1], 40000);
            const fr = fresnelOracle(i * DEG, 1, n);
            expect(Math.abs(l[1] - (1 - fr) ** 2)).toBeLessThan(0.006);
        }
    });

    it('ângulo crítico de dentro d’água: abaixo dele n²/(1 + R) do céu (a radiância por n²); acima, reflexão interna total', () => {
        const n = 1.33;
        const critical = Math.asin(1 / n);
        const water: PtObject = {
            id: 1,
            shape: { kind: 'box', min: [-50, -1, -50], max: [50, 1, 50] },
            material: glass(n),
        };
        const field: PtObject = {
            id: 1,
            shape: {
                kind: 'heightField',
                min: [-50, -1, -50],
                max: [50, 2, 50],
                nx: 2,
                nz: 2,
                heights: new Float32Array([1, 1, 1, 1]),
            },
            material: glass(n),
        };
        for (const volume of [water, field]) {
            const scene: PtScene = {
                objects: [volume],
                sky: (d) => (d[1] > 0 ? [1, 1, 1] : [0, 0, 0]),
            };
            for (const deg of [0, 30, 48]) {
                expect(deg * DEG).toBeLessThan(critical);
                const l = trace(
                    scene,
                    [0, 0, 0],
                    [Math.sin(deg * DEG), Math.cos(deg * DEG), 0],
                    20000,
                );
                const r = fresnelOracle(deg * DEG, n, 1);
                expect(Math.abs(l[0] - (n * n) / (1 + r)) / ((n * n) / (1 + r))).toBeLessThan(
                    0.006,
                );
            }
            const above = trace(
                scene,
                [0, 0, 0],
                [Math.sin(49.5 * DEG), Math.cos(49.5 * DEG), 0],
                2000,
            );
            expect(above[0]).toBe(0);
        }
    });

    it('água por tabela de alturas: a normal do topo inclinado refrata pela lei de Snell', () => {
        const n = 1.33;
        const slope = Math.tan(15 * DEG);
        // Topo h = 1 + slope·x: normal (−slope, 1, 0); de dentro olhando para +y, incidência de 15°.
        const heights = new Float32Array([
            1 - slope * 20,
            1 + slope * 20,
            1 - slope * 20,
            1 + slope * 20,
        ]);
        const normal = norm([-slope, 1, 0]);
        const i = 15 * DEG;
        const t = Math.asin(n * Math.sin(i));
        // Direção refratada: a t da normal, do mesmo lado tangencial do raio (d − (d·N)N ∝ +tangente).
        const tangent = norm([1, slope, 0]);
        const sinSide = 1;
        const out = norm([
            normal[0] * Math.cos(t) + sinSide * tangent[0] * Math.sin(t),
            normal[1] * Math.cos(t) + sinSide * tangent[1] * Math.sin(t),
            0,
        ]);
        const scene: PtScene = {
            objects: [
                {
                    id: 1,
                    shape: {
                        kind: 'heightField',
                        min: [-20, -2, -20],
                        max: [20, 7, 20],
                        nx: 2,
                        nz: 2,
                        heights,
                    },
                    material: glass(n),
                },
            ],
            sky: coneSky(out, 0.3),
        };
        const l = trace(scene, [0, 0, 0], [0, 1, 0], 20000);
        const r = fresnelOracle(i, n, 1);
        expect(Math.abs(l[0] - (1 - r) * n * n) / ((1 - r) * n * n)).toBeLessThan(0.01);
    });

    it('pilha de meios: esfera de vidro dentro d’água usa ar→água→vidro→água→ar (adição das quatro interfaces)', () => {
        const scene: PtScene = {
            objects: [
                {
                    id: 1,
                    shape: { kind: 'box', min: [-10, -10, -10], max: [10, 10, 10] },
                    material: glass(1.33),
                },
                {
                    id: 2,
                    shape: { kind: 'sphere', center: [0, 0, 0], radius: 1 },
                    material: glass(1.5, { priority: 1 }),
                },
            ],
            sky: coneSky([0, 0, 1], 0.3),
        };
        const l = trace(scene, [0, 0, -20], [0, 0, 1], 40000);
        const want = stackOf(iface(1, 1.33), iface(1.33, 1.5), iface(1.5, 1.33), iface(1.33, 1)).t;
        const wrong = stackOf(iface(1, 1.33), iface(1, 1.5), iface(1.5, 1), iface(1.33, 1)).t;
        expect(Math.abs(l[0] - want)).toBeLessThan(0.004);
        expect(Math.abs(want - wrong)).toBeGreaterThan(0.05);
    });

    it('pilha de meios: esfera meio mergulhada — dentro do vidro a borda da água não é interface nem absorve', () => {
        const half = 0.5; // água absorve metade por passagem de 9 unidades
        const scene: PtScene = {
            objects: [
                {
                    id: 1,
                    shape: { kind: 'box', min: [-20, -10, -20], max: [20, 0, 20] },
                    material: glass(1.33, { color: [half, half, half], depth: 9 }),
                },
                {
                    id: 2,
                    shape: { kind: 'sphere', center: [0, 0, 0], radius: 1 },
                    material: glass(1.5, { priority: 1 }),
                },
            ],
            sky: coneSky([0, -1, 0], 0.3),
        };
        const l = trace(scene, [0, 5, 0], [0, -1, 0], 40000);
        // Ar → vidro (y = 1), vidro → água (y = −1), 9 unidades de água, água → ar (y = −10).
        const want = stackOf(iface(1, 1.5), iface(1.5, 1.33), absorber(half), iface(1.33, 1)).t;
        // Se a água valesse dentro do vidro: mais uma unidade absorvida e a interface vidro→água em y = 0.
        const wrong = stackOf(
            iface(1, 1.5),
            iface(1.5, 1.33),
            absorber(half ** (10 / 9)),
            iface(1.33, 1),
        ).t;
        expect(Math.abs(l[0] - want)).toBeLessThan(0.004);
        expect(Math.abs(want - wrong)).toBeGreaterThan(0.02);
    });

    it('interfaces coincidentes: vidro encostado na água cruza vidro→água de uma vez', () => {
        const scene: PtScene = {
            objects: [
                {
                    id: 1,
                    shape: { kind: 'box', min: [-50, -50, 0], max: [50, 50, 1] },
                    material: glass(1.5),
                },
                {
                    id: 2,
                    shape: { kind: 'box', min: [-50, -50, 1], max: [50, 50, 2] },
                    material: glass(1.33),
                },
            ],
            sky: coneSky([0, 0, 1], 0.3),
        };
        const l = trace(scene, [0, 0, -5], [0, 0, 1], 40000);
        const want = stackOf(iface(1, 1.5), iface(1.5, 1.33), iface(1.33, 1)).t;
        const wrong = stackOf(iface(1, 1.5), iface(1.5, 1), iface(1, 1.33), iface(1.33, 1)).t;
        expect(Math.abs(l[0] - want)).toBeLessThan(0.004);
        expect(Math.abs(want - wrong)).toBeGreaterThan(0.03);
    });

    it('dispersão: cada canal sai da esfera pelo próprio índice, separado dos outros', () => {
        const ior = 1.5;
        const abbe = 20;
        const k = (ior - 1) / abbe;
        const iors = [ior - 0.5 * k, ior, ior + 0.5 * k];
        const i = 60 * DEG;
        for (let c = 0; c < 3; c++) {
            const r = Math.asin(Math.sin(i) / iors[c]!);
            const dev = 2 * (i - r);
            const scene: PtScene = {
                objects: [
                    {
                        id: 1,
                        shape: { kind: 'sphere', center: [0, 0, 0], radius: 1 },
                        material: glass(ior, { abbe }),
                    },
                ],
                sky: coneSky([0, -Math.sin(dev), Math.cos(dev)], 0.15),
            };
            const l = trace(scene, [0, Math.sin(i), -5], [0, 0, 1], 60000);
            const fr = fresnelOracle(i, 1, iors[c]!);
            for (let o = 0; o < 3; o++) {
                if (o === c) expect(Math.abs(l[o]! - (1 - fr) ** 2)).toBeLessThan(0.025);
                else expect(l[o]).toBe(0);
            }
        }
    });

    it('parede fina: atravessa sem desviar com T = (1 − R)/(1 + R) e reflete o resto', () => {
        for (const deg of [0, 45]) {
            const dir: Vec3 = [Math.sin(deg * DEG), 0, Math.cos(deg * DEG)];
            const pane: PtObject = {
                id: 1,
                shape: { kind: 'quad', corner: [-50, -50, 0], u: [100, 0, 0], v: [0, 100, 0] },
                material: glass(1.5),
            };
            const r = fresnelOracle(deg * DEG, 1, 1.5);
            const through = trace(
                { objects: [pane], sky: coneSky(dir, 0.3) },
                [0, 0, -1],
                dir,
                40000,
            );
            expect(Math.abs(through[0] - (1 - r) / (1 + r))).toBeLessThan(0.006);
            const mirrored: Vec3 = [dir[0], 0, -dir[2]];
            const back = trace(
                { objects: [pane], sky: coneSky(mirrored, 0.3) },
                [0, 0, -1],
                dir,
                40000,
            );
            expect(Math.abs(back[0] - (2 * r) / (1 + r))).toBeLessThan(0.006);
        }
    });

    it.each([
        [0.25, 35],
        [0.64, 65],
    ])(
        'GGX (α %s, %i°): a amostra pela distribuição visível com peso G1 integra a BSDF de Walter (reflexão e transmissão)',
        (alpha, deg) => {
            const n1 = 1;
            const n2 = 1.5;
            const thetaO = deg * DEG;
            const wo: Vec3 = [Math.sin(thetaO), 0, Math.cos(thetaO)];
            const d: Vec3 = [-wo[0], -wo[1], -wo[2]];
            // Funções de teste da direção de saída: 1 e x em cada hemisfério.
            const tests: [string, (w: Vec3) => number][] = [
                ['reflexão', (w) => (w[2] > 0 ? 1 : 0)],
                ['transmissão', (w) => (w[2] < 0 ? 1 : 0)],
                ['reflexão·x', (w) => (w[2] > 0 ? w[0] : 0)],
                ['transmissão·x', (w) => (w[2] < 0 ? w[0] : 0)],
            ];
            // Monte Carlo pela amostra do traçador (sequência determinística).
            let seed = 12345;
            const rand = (): number => {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                return seed / 4294967296;
            };
            const mc = tests.map(() => 0);
            const N = 400000;
            for (let s = 0; s < N; s++) {
                const smp = sampleDielectricInterface(d, [0, 0, 1], n1, n2, alpha, [
                    rand(),
                    rand(),
                    rand(),
                ]);
                if (smp === null) continue;
                tests.forEach(([, g], k) => (mc[k]! += smp.weight * g(smp.dir)));
            }
            // Oráculo: ∫ f(wo, wi)|cos θi| g(wi) dωi por quadratura, com a BSDF de Walter et al. 2007 (G separável).
            const lambda = (c: number): number => {
                const t2 = (1 - c * c) / (c * c);
                return 0.5 * (-1 + Math.sqrt(1 + alpha * alpha * t2));
            };
            const g1 = (c: number): number => 1 / (1 + lambda(Math.abs(c)));
            const ggx = (cosH: number): number =>
                (alpha * alpha) / (Math.PI * (cosH * cosH * (alpha * alpha - 1) + 1) ** 2);
            const dotv = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
            const quad = tests.map(() => 0);
            const NT = 600;
            const NP = 1200;
            for (let it = 0; it < NT; it++) {
                for (const hemi of [1, -1]) {
                    const theta = ((it + 0.5) / NT) * (Math.PI / 2);
                    const ct = Math.cos(theta) * hemi;
                    for (let ip = 0; ip < NP; ip++) {
                        const phi = ((ip + 0.5) / NP) * 2 * Math.PI;
                        const wi: Vec3 = [
                            Math.sin(theta) * Math.cos(phi),
                            Math.sin(theta) * Math.sin(phi),
                            ct,
                        ];
                        const dw = Math.sin(theta) * (Math.PI / 2 / NT) * ((2 * Math.PI) / NP);
                        let f: number;
                        if (hemi > 0) {
                            const h = norm([wo[0] + wi[0], wo[1] + wi[1], wo[2] + wi[2]]);
                            const fr = fresnelOracle(Math.acos(Math.min(1, dotv(wo, h))), n1, n2);
                            f =
                                (fr * ggx(h[2]) * g1(wo[2]) * g1(wi[2]))
                                / (4 * wo[2] * Math.abs(wi[2]));
                        } else {
                            // Walter (21): η_o do lado de wo, η_i do de wi; h_t = −(η_i wi + η_o wo).
                            let h = norm([
                                -(n2 * wi[0] + n1 * wo[0]),
                                -(n2 * wi[1] + n1 * wo[1]),
                                -(n2 * wi[2] + n1 * wo[2]),
                            ]);
                            if (h[2] < 0) h = [-h[0], -h[1], -h[2]];
                            const oh = dotv(wo, h);
                            const ih = dotv(wi, h);
                            if (oh <= 0 || ih >= 0) continue;
                            const ft = fresnelOracle(Math.acos(Math.min(1, oh)), n1, n2);
                            const den = n2 * ih + n1 * oh;
                            f =
                                ((Math.abs(ih) * Math.abs(oh)) / (Math.abs(wi[2]) * wo[2]))
                                * ((n1 * n1 * (1 - ft) * ggx(h[2]) * g1(wo[2]) * g1(wi[2]))
                                    / (den * den));
                        }
                        const w = f * Math.abs(ct) * dw;
                        tests.forEach(([, g], k) => (quad[k]! += w * g(wi)));
                    }
                }
            }
            tests.forEach(([name], k) => {
                expect(Math.abs(mc[k]! / N - quad[k]!), name).toBeLessThan(0.004);
            });
        },
    );

    it('GGX liso no limite α → 0: a direção de Snell com peso (n1/n2)² na transmissão', () => {
        const d = norm([Math.sin(40 * DEG), 0, -Math.cos(40 * DEG)]);
        const t = sampleDielectricInterface(d, [0, 0, 1], 1, 1.5, 0, [0.5, 0.5, 0.99])!;
        expect(t.transmitted).toBe(true);
        expect(t.weight).toBeCloseTo(1 / 2.25, 12);
        const sinT = Math.hypot(t.dir[0], t.dir[1]);
        expect(sinT).toBeCloseTo(Math.sin(40 * DEG) / 1.5, 12);
        const r = sampleDielectricInterface(d, [0, 0, 1], 1, 1.5, 0, [0.5, 0.5, 0])!;
        expect(r.transmitted).toBe(false);
        expect(r.weight).toBe(1);
        expect(r.dir[2]).toBeCloseTo(Math.cos(40 * DEG), 12);
    });
});
