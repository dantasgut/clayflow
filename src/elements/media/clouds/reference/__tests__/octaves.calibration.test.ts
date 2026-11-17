import { describe, expect, it } from 'vitest';
import {
    buildVolume,
    cloudDensity,
    jdeParams,
    jdePhase,
    marchCloud,
    shellSegments,
    type CloudModel,
    type CloudOctaves,
    type Vec3,
} from '../cloudModel';
import { CLOUD_OCTAVES } from '../../schemas';
import {
    deltaRng,
    deltaTrackRadiance,
    tabulatePhase,
    type PtDeltaScene,
} from '../../../../lighting/reference/pathTracer';

// Calibração das oitavas do espalhamento múltiplo (spec 041, T023, R8): a aproximação `Σ bⁱ σs e^(−aⁱ τ) p(cⁱ g)` contra
// o transporte completo por rastreamento delta (Novák 2018) numa nuvem isolada — um cilindro de 1 km de raio entre 1500 e
// 2500 m, extinção 0,02/m (profundidade ótica ~20 na vertical), albedo 0,99, fase de Jendersie & d'Eon a 20 µm —, só a
// luz do sol (sem céu nem chão, para isolar o que as oitavas aproximam), vista de baixo, de lado e contra o sol, com o
// sol a 60° e a 10°. Mede-se o erro relativo por vista com os coeficientes escolhidos; o registro vai para o
// research.md (R8).

const RADIUS = 1000;
const one = buildVolume(() => [1, 1, 1, 1], 2);
const zero = buildVolume(() => [0, 0, 0, 0], 2);

const model: CloudModel = {
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

const phase = jdeParams(20);
const tabulated = tabulatePhase((c) => jdePhase(c, phase));

/** Vistas: origem e direção (unitária). */
function views(): { name: string; o: Vec3; d: Vec3 }[] {
    const n = (v: Vec3): Vec3 => {
        const l = Math.hypot(...v);
        return [v[0] / l, v[1] / l, v[2] / l];
    };
    return [
        { name: 'de baixo', o: [0, 0, 0], d: [0, 1, 0] },
        { name: 'de baixo, perto da borda', o: [0, 0, 0], d: n([0.45, 1, 0]) },
        { name: 'de lado (lado do sol)', o: [6000, 2000, 0], d: [-1, 0, 0] },
        // Contra o sol, olhando a borda de cima para baixo do lado oposto ao sol (o brilho prateado).
        { name: 'contra o sol (borda)', o: [-6000, 1700, 0], d: n([6000 - 1000 * 0.9, 300, 0]) },
    ];
}

/** O meio do cilindro para o rastreamento delta (o majorante é a extinção máxima do perfil). */
const scene = (sun: Vec3): PtDeltaScene => ({
    medium: {
        majorant: model.density,
        extinction: (p) => cloudDensity(model, p) * model.density,
        albedo: model.albedo,
        phase: tabulated,
        spans: (o, d, tMax) => shellSegments(model, o, d, tMax),
    },
    sunDir: sun,
    sun: [1, 1, 1],
    sky: () => [0, 0, 0],
});

const traced = (sun: Vec3, o: Vec3, d: Vec3, paths: number, seed: number): number => {
    let s = 0;
    const sc = scene(sun);
    for (let k = 0; k < paths; k++) s += deltaTrackRadiance(sc, o, d, deltaRng(seed, k), 512)[0];
    return s / paths;
};

const octave = (sun: Vec3, o: Vec3, d: Vec3, oct: CloudOctaves): number =>
    marchCloud(
        model,
        o,
        d,
        Infinity,
        { sunDir: sun, sun: [1, 1, 1], ambientUp: [0, 0, 0], ambientDown: [0, 0, 0] },
        phase,
        oct,
        192,
        48,
    ).scattered[0];

describe('calibração das oitavas (T023)', () => {
    it('a aproximação por oitavas fica perto do transporte completo; os coeficientes escolhidos são registrados', () => {
        const results: string[] = [];
        const truth: { sun: Vec3; o: Vec3; d: Vec3; L: number; name: string }[] = [];
        for (const elevation of [60, 10]) {
            const e = (elevation * Math.PI) / 180;
            const sun: Vec3 = [Math.cos(e), Math.sin(e), 0];
            for (const v of views()) {
                const L = traced(sun, v.o, v.d, 600, elevation * 10 + truth.length);
                truth.push({ sun, o: v.o, d: v.d, L, name: `${elevation}°, ${v.name}` });
            }
        }
        // Busca em grade dos coeficientes (a, b, c) pelo menor erro relativo médio.
        let best = { count: 3, a: 0.5, b: 0.5, c: 0.5, err: Infinity };
        for (const count of [2, 3, 4, 5, 6, 8])
            for (const a of [0.15, 0.25, 0.35, 0.45, 0.5, 0.55, 0.65])
                for (const b of [0.7, 0.8, 0.85, 0.9, 0.95, 1])
                    for (const c of [0.5, 0.6, 0.7, 0.8, 0.9]) {
                        const oct = { count, a, b, c };
                        let err = 0;
                        for (const t of truth)
                            err += Math.abs(octave(t.sun, t.o, t.d, oct) / t.L - 1) / truth.length;
                        if (err < best.err) best = { count, a, b, c, err };
                    }
        const chosen = { count: best.count, a: best.a, b: best.b, c: best.c };
        for (const t of truth) {
            const L = octave(t.sun, t.o, t.d, chosen);
            results.push(
                `${t.name}: traçador ${t.L.toExponential(3)}, oitavas ${L.toExponential(3)} (${((L / t.L - 1) * 100).toFixed(1)} %)`,
            );
        }
        console.log(
            `[oitavas] N=${best.count} a=${best.a} b=${best.b} c=${best.c}, erro médio ${(best.err * 100).toFixed(1)} %\n${results.join('\n')}`,
        );
        // Os coeficientes de produção são os da grade; o piso medido (31,9 %) é o limite do modelo de oitavas —
        // registrado no research.md (R8) e nas pendências; o teste guarda contra piorar.
        expect([best.count, best.a, best.b, best.c]).toEqual([
            3,
            CLOUD_OCTAVES.a,
            CLOUD_OCTAVES.b,
            CLOUD_OCTAVES.c,
        ]);
        expect(best.err).toBeLessThan(0.33);
    }, 300_000);
});
