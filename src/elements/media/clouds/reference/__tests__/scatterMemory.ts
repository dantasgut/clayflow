// A sensibilidade da luz guardada nas sondas do cache de espalhamento ao ângulo do sol e da câmera (spec 041, T074), em
// f64: na nuvem da calibração (o cilindro de 1 km, `calibrationScene.ts`) com a atmosfera da Terra — a luz do sol que chega
// a cada colisão atenuada pela atmosfera até ela, o céu da atmosfera de referência (tabelado por direção), o chão —, a
// luz de 8 sondas vistas de 3 câmeras (contra o sol, de frente, de baixo) na resolução da grade (o binomial 3 × 3 × 3 a
// 100 m, como o filtro do cache), com os mesmos caminhos (as mesmas sementes) a ±δ do ângulo. Três formas de guardar:
// `today` (a luz em unidades da iluminância do sol no topo: o que o cache guardava até a T074), `sunOnly` (÷ a transmitância
// da atmosfera até a sonda) e `parts` (a parte do sol ÷ a iluminância que chega à sonda, a do céu ÷ a irradiância do céu:
// `scatterNormalize`). A sensibilidade de cada sonda é a maior entre os canais de `|q(θ+δ) − q(θ−δ)| / (2δ·q(θ))`; a do
// conjunto, a média pela luminância. Usado por `scatterMemory.test.ts` (as memórias do cache derivadas dela).
import {
    earthAtmosphere,
    multipleScattering,
    skyRadiance,
    sunTransmittance,
} from '../../../../scene/reference/atmosphere';
import { deltaRng } from '../../../../lighting/reference/pathTracer';
import { calibrationCloud } from '../calibrationScene';
import { jdeParams, type Vec3 } from '../cloudModel';
import {
    phaseTruncation,
    scatterNormalize,
    scatterWalk,
    type ScatterLight,
    type ScatterParts,
} from '../cloudScatter';

const m = calibrationCloud;
const phase = jdeParams(20);
const trunc = phaseTruncation(phase);
const kT = 1 - m.albedo * trunc.fc;
const atm = earthAtmosphere(1);
const RADIUS = 1000;
/** O albedo do chão. */
const GROUND = 0.3;

/** A profundidade ótica do cilindro (1500–2500 m, raio 1 km, extinção constante) de `x` na direção `d`, exata. */
function cylinderDepth(x: Vec3, d: Vec3): number {
    let t0 = 0;
    let t1 = Infinity;
    if (Math.abs(d[1]) > 1e-12) {
        const a = (m.base - x[1]) / d[1];
        const b = (m.top - x[1]) / d[1];
        t0 = Math.max(t0, Math.min(a, b));
        t1 = Math.min(t1, Math.max(a, b));
    } else if (x[1] < m.base || x[1] > m.top) return 0;
    const A = d[0] * d[0] + d[2] * d[2];
    if (A < 1e-12) {
        if (x[0] * x[0] + x[2] * x[2] > RADIUS * RADIUS) return 0;
    } else {
        const B = x[0] * d[0] + x[2] * d[2];
        const C = x[0] * x[0] + x[2] * x[2] - RADIUS * RADIUS;
        const disc = B * B - A * C;
        if (disc < 0) return 0;
        const s = Math.sqrt(disc);
        t0 = Math.max(t0, (-B - s) / A);
        t1 = Math.min(t1, (-B + s) / A);
    }
    return Math.max(0, t1 - t0) * m.density;
}

const msMemo = new Map<string, Vec3>();
const ms = (r: number, muS: number): Vec3 => {
    const k = `${Math.round(r * 2)}:${Math.round(muS * 400)}`;
    let v = msMemo.get(k);
    if (v === undefined) {
        v = multipleScattering(atm, r, muS, 24, 16);
        msMemo.set(k, v);
    }
    return v;
};

/** O céu visto a 2 km (por unidade de iluminância do sol) tabelado em 24 × 24 direções, lido bilinear. */
function skyTable(sun: Vec3): (d: Vec3) => Vec3 {
    const NA = 24;
    const NE = 24;
    const lo = -0.2;
    const tab: Vec3[] = [];
    for (let j = 0; j < NE; j++)
        for (let i = 0; i < NA; i++) {
            const el = lo + (Math.PI / 2 - lo) * (j / (NE - 1));
            const az = (2 * Math.PI * i) / NA;
            tab.push(
                skyRadiance(
                    atm,
                    2,
                    [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)],
                    sun,
                    48,
                    ms,
                ),
            );
        }
    return (d) => {
        const el = Math.asin(Math.max(-1, Math.min(1, d[1])));
        let az = Math.atan2(d[2], d[0]);
        if (az < 0) az += 2 * Math.PI;
        const fj = Math.max(0, Math.min(NE - 1.001, ((el - lo) / (Math.PI / 2 - lo)) * (NE - 1)));
        const fi = (az / (2 * Math.PI)) * NA;
        const j0 = Math.floor(fj);
        const i0 = Math.floor(fi);
        const wj = fj - j0;
        const wi = fi - i0;
        const g = (i: number, j: number): Vec3 => tab[j * NA + (((i % NA) + NA) % NA)]!;
        return [0, 1, 2].map(
            (c) =>
                (1 - wj) * ((1 - wi) * g(i0, j0)[c]! + wi * g(i0 + 1, j0)[c]!)
                + wj * ((1 - wi) * g(i0, j0 + 1)[c]! + wi * g(i0 + 1, j0 + 1)[c]!),
        ) as unknown as Vec3;
    };
}

/** A irradiância do céu de cima (a integral do cosseno no hemisfério). */
function upIrradiance(sky: (d: Vec3) => Vec3): Vec3 {
    const o = [0, 0, 0];
    const n = 32;
    for (let j = 0; j < n; j++)
        for (let i = 0; i < 2 * n; i++) {
            const mu = (j + 0.5) / n;
            const ph = (Math.PI * (i + 0.5)) / n;
            const s = Math.sqrt(1 - mu * mu);
            const v = sky([s * Math.cos(ph), mu, s * Math.sin(ph)]);
            for (let c = 0; c < 3; c++) o[c]! += v[c]! * mu * (1 / n) * (Math.PI / n);
        }
    return o as unknown as Vec3;
}

/** O sol na elevação `deg` (graus), azimute +x. */
export function sunAtElevation(deg: number): Vec3 {
    const e = (deg * Math.PI) / 180;
    return [Math.cos(e), Math.sin(e), 0];
}

const transmittance = (x: Vec3, sun: Vec3): Vec3 =>
    sunTransmittance(atm, Math.max(x[1], 0) / 1000, sun);

/** A luz da cena com o sol `sun` (iluminância 1 no topo) e a irradiância do céu de cima. */
function lightOf(sun: Vec3): { light: ScatterLight; up: Vec3 } {
    const sky = skyTable(sun);
    const up = upIrradiance(sky);
    const tg = transmittance([0, 0, 0], sun);
    const groundSun = (x: Vec3): Vec3 => {
        const e = (Math.exp(-cylinderDepth(x, sun) * kT) * Math.max(sun[1], 0)) / Math.PI;
        return [0, 1, 2].map((c) => GROUND * tg[c]! * e) as unknown as Vec3;
    };
    return {
        up,
        light: {
            sunDir: sun,
            sunAt: (x) => transmittance(x, sun),
            sunDepth: (x) => cylinderDepth(x, sun),
            sky,
            groundSun,
            ground: (x) => {
                const s = groundSun(x);
                return [0, 1, 2].map((c) => s[c]! + GROUND * up[c]!) as unknown as Vec3;
            },
        },
    };
}

const PROBES: readonly Vec3[] = [
    [0, 2000, 0],
    [900, 2000, 0],
    [-900, 2000, 0],
    [0, 2450, 0],
    [0, 1550, 0],
    [1150, 2000, 0],
    [-1150, 2000, 0],
    [0, 2000, 900],
];
const CAMERAS: readonly Vec3[] = [
    [-8000, 0, 0],
    [8000, 0, 0],
    [0, 0, 300],
];

/** As sensibilidades (1/°, média pela luminância) das três formas de guardar. */
export interface ScatterSensitivity {
    readonly today: number;
    readonly sunOnly: number;
    readonly parts: number;
}

const lum = (v: readonly number[]): number => 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
const rotate = (d: Vec3, axis: Vec3, a: number): Vec3 => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = axis[0] * d[0] + axis[1] * d[1] + axis[2] * d[2];
    const x: Vec3 = [
        axis[1] * d[2] - axis[2] * d[1],
        axis[2] * d[0] - axis[0] * d[2],
        axis[0] * d[1] - axis[1] * d[0],
    ];
    return [0, 1, 2].map((i) => d[i]! * c + x[i]! * s + axis[i]! * k * (1 - c)) as unknown as Vec3;
};

/**
 * A sensibilidade ao ângulo `which` (o sol ou a câmera, que sobe pelo eixo horizontal perpendicular à vista) com o sol
 * em `elevation` (graus), `paths` caminhos por sonda da vizinhança e `delta` graus.
 */
export function scatterSensitivity(
    which: 'sun' | 'view',
    elevation: number,
    paths: number,
    delta = 0.5,
    spacing = 100,
): ScatterSensitivity {
    const angles =
        which === 'sun' ? [elevation - delta, elevation, elevation + delta] : [elevation];
    const lights = angles.map((a) => lightOf(sunAtElevation(a)));
    const tilt = which === 'view' ? [-delta, 0, delta] : [0, 0, 0];
    const rows: { L: number; s: [number, number, number] }[] = [];
    for (const x0 of PROBES)
        for (const eye of CAMERAS) {
            const acc = [0, 1, 2].map(() => ({ sun: [0, 0, 0], sky: [0, 0, 0] }));
            let seed = 0;
            for (let a = -1; a <= 1; a++)
                for (let b = -1; b <= 1; b++)
                    for (let c = -1; c <= 1; c++) {
                        const w = ((2 - Math.abs(a)) * (2 - Math.abs(b)) * (2 - Math.abs(c))) / 64;
                        const x: Vec3 = [
                            x0[0] + a * spacing,
                            x0[1] + b * spacing,
                            x0[2] + c * spacing,
                        ];
                        const rel: Vec3 = [x[0] - eye[0], x[1] - eye[1], x[2] - eye[2]];
                        const l = Math.hypot(...rel);
                        const dc: Vec3 = [rel[0] / l, rel[1] / l, rel[2] / l];
                        const h = Math.hypot(dc[0], dc[2]) || 1;
                        const axis: Vec3 = [-dc[2] / h, 0, dc[0] / h];
                        for (let k = 0; k < 3; k++) {
                            const lt = lights[which === 'sun' ? k : 0]!;
                            const dcam = rotate(dc, axis, (tilt[k]! * Math.PI) / 180);
                            const parts: ScatterParts = { sun: [0, 0, 0], sky: [0, 0, 0] };
                            for (let n = 0; n < paths; n++)
                                scatterWalk(
                                    m,
                                    x,
                                    dcam,
                                    lt.light,
                                    phase,
                                    trunc,
                                    deltaRng(seed + n * 31 + 7, 5),
                                    48,
                                    undefined,
                                    parts,
                                );
                            for (let ch = 0; ch < 3; ch++) {
                                acc[k]!.sun[ch]! += (w * parts.sun[ch]!) / paths;
                                acc[k]!.sky[ch]! += (w * parts.sky[ch]!) / paths;
                            }
                        }
                        seed += 100_003;
                    }
            const sunOf = (k: number): Vec3 => sunAtElevation(angles[which === 'sun' ? k : 0]!);
            const upOf = (k: number): Vec3 => lights[which === 'sun' ? k : 0]!.up;
            const T1 = transmittance(x0, sunOf(1));
            const U1 = upOf(1);
            const ones: Vec3 = [1, 1, 1];
            const today = (k: number): number[] =>
                [0, 1, 2].map((c) => acc[k]!.sun[c]! + acc[k]!.sky[c]!);
            const sunOnly = (k: number): number[] => {
                const T = transmittance(x0, sunOf(k));
                return [0, 1, 2].map(
                    (c) =>
                        ((acc[k]!.sun[c]! + acc[k]!.sky[c]!) / Math.max(T[c]!, 1e-3))
                        * Math.max(T1[c]!, 1e-3),
                );
            };
            const parts = (k: number): number[] => {
                const q = scatterNormalize(acc[k]!, ones, transmittance(x0, sunOf(k)), upOf(k));
                return [0, 1, 2].map(
                    (c) => q.sun[c]! * Math.max(T1[c]!, 1e-3) + q.sky[c]! * U1[c]!,
                );
            };
            const S = (f: (k: number) => number[]): number =>
                Math.max(
                    ...[0, 1, 2].map((c) => Math.abs(f(2)[c]! - f(0)[c]!) / (2 * delta * f(1)[c]!)),
                );
            rows.push({ L: lum(today(1)), s: [S(today), S(sunOnly), S(parts)] });
        }
    const total = rows.reduce((a, r) => a + r.L, 0);
    const mean = (i: number): number => rows.reduce((a, r) => a + r.L * r.s[i]!, 0) / total;
    return { today: mean(0), sunOnly: mean(1), parts: mean(2) };
}

/**
 * O desvio relativo de um caminho (luminância, média pela luminância nas sondas e câmeras) com o sol em `elevation`: o
 * ruído da sonda filtrada com `window` caminhos é ele × √(Σw²/janela), Σw² = (6/16)³ do binomial 3 × 3 × 3.
 */
export function scatterPathDeviation(elevation: number, paths: number): number {
    const { light } = lightOf(sunAtElevation(elevation));
    let weighted = 0;
    let total = 0;
    for (const x of PROBES)
        for (const eye of CAMERAS) {
            const rel: Vec3 = [x[0] - eye[0], x[1] - eye[1], x[2] - eye[2]];
            const l = Math.hypot(...rel);
            const dcam: Vec3 = [rel[0] / l, rel[1] / l, rel[2] / l];
            let s1 = 0;
            let s2 = 0;
            for (let n = 0; n < paths; n++) {
                const v = lum(
                    scatterWalk(m, x, dcam, light, phase, trunc, deltaRng(n * 31 + 7, 5), 48),
                );
                s1 += v;
                s2 += v * v;
            }
            const mean = s1 / paths;
            weighted += Math.sqrt(Math.max(0, s2 / paths - mean * mean));
            total += mean;
        }
    return weighted / total;
}

/** Σw² do filtro binomial 3 × 3 × 3 (1, 2, 1)³/64. */
export const SCATTER_FILTER_WEIGHT_SQUARES = (6 / 16) ** 3;
