import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { jdeParams, marchCloud, opticalDepth, type Vec3 } from '../cloudModel';
import {
    marchScatter,
    phaseTruncation,
    scatterLookup,
    scatterProbePosition,
    scatterWalk,
    type ScatterGrid,
    type ScatterLight,
} from '../cloudScatter';
import { calibrationCloud, calibrationViews } from '../calibrationScene';
import { CLOUD_OCTAVES, CLOUD_SCATTER_MAX_COLLISIONS } from '../../schemas';
import { deltaRng } from '../../../../lighting/reference/pathTracer';

// Calibração do transporte não local das nuvens (spec 041, T023, R8): o esquema do cache de espalhamento (sondas a 100 m
// com `WALKS` caminhos cada, interpoladas na marcha, mais o espalhamento simples exato com o feixe δ-M) contra o
// rastreamento delta (`fixtures/cloud-calibration-truth.json`, 100 000 caminhos por vista, `bench/runner/cloudTruth.ts`)
// nas seis vistas de uma elevação do sol. O erro de cada vista entra no research.md (R8); as oitavas do perfil (a
// estimativa local que as sondas substituem) são medidas junto, para o registro.

/** Caminhos por sonda. */
const WALKS = Number(process.env.CLOUD_CALIBRATION_WALKS ?? 1500);

interface Truth {
    readonly views: readonly { name: string; L: number; se: number }[];
}

const truth = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            'src/elements/media/clouds/reference/__tests__/fixtures/cloud-calibration-truth.json',
        ),
        'utf8',
    ),
) as Truth;

/** O erro relativo das sondas e das oitavas em cada vista da elevação `el`; o critério do esquema. */
export function calibrateElevation(el: number): void {
    const m = calibrationCloud;
    const p = jdeParams(20);
    const t = phaseTruncation(p);
    const grid: ScatterGrid = { size: [32, 10, 32], center: [0, 0], x0: 1e6, reach: 1600 / 1e6 };
    const lines: string[] = [];
    const errors: number[] = [];
    calibrationViews().forEach((v, index) => {
        if (Math.round((Math.asin(v.sun[1]) * 180) / Math.PI) !== el) return;
        const ref = truth.views[index]!;
        const light: ScatterLight = {
            sunDir: v.sun,
            sunAt: () => [1, 1, 1],
            sunDepth: (x) => opticalDepth(m, x, v.sun, 96),
            sky: () => [0, 0, 0],
            ground: () => [0, 0, 0],
        };
        const memo = new Map<number, Vec3>();
        let seed = index * 1_000_003;
        const probe = (i: number, j: number, k: number): Vec3 => {
            const key = (k * grid.size[1] + j) * grid.size[0] + i;
            const hit = memo.get(key);
            if (hit !== undefined) return hit;
            const x = scatterProbePosition(m, grid, i, j, k);
            const rel = [x[0] - v.o[0], x[1] - v.o[1], x[2] - v.o[2]];
            const l = Math.hypot(...rel);
            const dcam: Vec3 = [rel[0]! / l, rel[1]! / l, rel[2]! / l];
            let s = 0;
            for (let w = 0; w < WALKS; w++)
                s += scatterWalk(
                    m,
                    x,
                    dcam,
                    light,
                    p,
                    t,
                    deltaRng(seed++, 5),
                    CLOUD_SCATTER_MAX_COLLISIONS,
                )[0];
            const value: Vec3 = [s / WALKS, s / WALKS, s / WALKS];
            memo.set(key, value);
            return value;
        };
        const L = marchScatter(
            m,
            v.o,
            v.d,
            Infinity,
            light,
            p,
            t,
            (x) => scatterLookup(m, grid, x, probe),
            400,
        ).scattered[0];
        const oct = marchCloud(
            m,
            v.o,
            v.d,
            Infinity,
            { sunDir: v.sun, sun: [1, 1, 1], ambientUp: [0, 0, 0], ambientDown: [0, 0, 0] },
            p,
            { count: 3, ...CLOUD_OCTAVES },
            192,
            48,
        ).scattered[0];
        const e = L / ref.L - 1;
        errors.push(e);
        lines.push(
            `${v.name}: traçador ${ref.L.toExponential(3)} (±${(ref.se * 100).toFixed(1)} %), sondas ${(e * 100).toFixed(1)} %, oitavas ${((oct / ref.L - 1) * 100).toFixed(1)} %`,
        );
    });
    const mean = errors.reduce((a, b) => a + Math.abs(b), 0) / errors.length;
    console.log(
        `[espalhamento, sol a ${el}°] erro médio ${(mean * 100).toFixed(1)} %\n${lines.join('\n')}`,
    );
    // Critério (R8): a média das vistas a ≤ 5 % e cada vista a ≤ 15 % (a borda dura do cilindro entre duas sondas e o
    // ruído dos caminhos por sonda; as vistas e os números ficam no research.md).
    expect(errors).toHaveLength(6);
    expect(mean).toBeLessThanOrEqual(0.05);
    for (const e of errors) expect(Math.abs(e)).toBeLessThanOrEqual(0.15);
}
