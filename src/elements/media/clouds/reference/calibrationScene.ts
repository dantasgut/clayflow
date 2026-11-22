// Cena da calibração do espalhamento múltiplo das nuvens (spec 041, T023, R8): uma nuvem isolada — um cilindro de 1 km de
// raio entre 1500 e 2500 m, extinção 0,02/m, albedo 0,99, fase de Jendersie & d'Eon a 20 µm —, só a luz do sol (sem céu
// nem chão), em 18 vistas: de baixo, de baixo perto da borda, de lado do lado do sol, contra o sol (a borda), de cima e de
// lado na perpendicular, com o sol a 60°, 30° e 10°. A verdade é o rastreamento delta (Novák 2018) no meio com o pico de
// frente a menos de 2° tratado como transmitido (δ-M): o pico de Mie das gotículas (HG com g ≈ 0,995) desvia ~0,3° e
// leva metade da fase; tirá-lo do traçador muda a luz a < 1° do sol e derruba o erro padrão de 25–55 % (600 caminhos com a
// fase completa) para ~1 % (100 000 caminhos).
import {
    buildVolume,
    cloudDensity,
    jdeParams,
    shellSegments,
    type CloudModel,
    type Vec3,
} from './cloudModel';
import { phaseTruncation, truncatedPhase } from './cloudScatter';
import {
    deltaRng,
    deltaTrackRadiance,
    tabulatePhase,
    type PtDeltaScene,
} from '../../../lighting/reference/pathTracer';

const RADIUS = 1000;
const one = buildVolume(() => [1, 1, 1, 1], 2);
const zero = buildVolume(() => [0, 0, 0, 0], 2);

/** A nuvem isolada da calibração. */
export const calibrationCloud: CloudModel = {
    groundRadius: 6_360_200,
    base: 1500,
    top: 2500,
    coverage: (x, z) => (x * x + z * z <= RADIUS * RADIUS ? [1, 0.5, 1] : [0, 0.5, 1]),
    density: 0.02,
    albedo: 0.99,
    shape: one,
    detail: zero,
    shapeScale: 12000,
    detailScale: 1800,
    shapeOffset: [0, 0, 0],
    detailOffset: [0, 0, 0],
    windDir: [1, 0],
};

/** Uma vista: o nome, o sol, a origem e a direção (unitárias). */
export interface CalibrationView {
    readonly name: string;
    readonly sun: Vec3;
    readonly o: Vec3;
    readonly d: Vec3;
}

const unit = (v: Vec3): Vec3 => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
};

/** As 18 vistas (6 por elevação do sol, 60°, 30° e 10°). */
export function calibrationViews(): CalibrationView[] {
    const out: CalibrationView[] = [];
    for (const el of [60, 30, 10]) {
        const e = (el * Math.PI) / 180;
        const sun: Vec3 = [Math.cos(e), Math.sin(e), 0];
        const views: Omit<CalibrationView, 'sun'>[] = [
            { name: 'de baixo', o: [0, 0, 0], d: [0, 1, 0] },
            { name: 'de baixo, perto da borda', o: [0, 0, 0], d: unit([0.45, 1, 0]) },
            { name: 'de lado (lado do sol)', o: [6000, 2000, 0], d: [-1, 0, 0] },
            {
                name: 'contra o sol (borda)',
                o: [-6000, 1700, 0],
                d: unit([6000 - 1000 * 0.9, 300, 0]),
            },
            { name: 'de cima', o: [0, 6000, 0], d: [0, -1, 0] },
            { name: 'de lado (perpendicular)', o: [0, 2000, 6000], d: [0, 0, -1] },
        ];
        for (const v of views) out.push({ ...v, name: `${el}°, ${v.name}`, sun });
    }
    return out;
}

/** A verdade de uma vista: a média de `paths` caminhos do rastreamento delta no meio truncado e o erro padrão relativo. */
export function calibrationTruth(index: number, paths: number): { L: number; se: number } {
    const v = calibrationViews()[index]!;
    const m = calibrationCloud;
    const p = jdeParams(20);
    const t = phaseTruncation(p);
    const kT = 1 - m.albedo * t.fc;
    const scene: PtDeltaScene = {
        medium: {
            majorant: m.density * kT,
            extinction: (x) => cloudDensity(m, x) * m.density * kT,
            albedo: (m.albedo * (1 - t.fc)) / kT,
            phase: tabulatePhase((c) => truncatedPhase(c, p, t)),
            spans: (o, d, tMax) => shellSegments(m, o, d, tMax),
        },
        sunDir: v.sun,
        sun: [1, 1, 1],
        sky: () => [0, 0, 0],
    };
    let s = 0;
    let s2 = 0;
    for (let k = 0; k < paths; k++) {
        const L = deltaTrackRadiance(scene, v.o, v.d, deltaRng(index * 7919 + 101, k), 8192)[0];
        s += L;
        s2 += L * L;
    }
    const mean = s / paths;
    return { L: mean, se: Math.sqrt(Math.max(0, s2 / paths - mean * mean) / paths) / mean };
}
