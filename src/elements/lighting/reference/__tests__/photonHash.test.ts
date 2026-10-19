/**
 * Referência do hash das cáusticas (spec 034, R6): um fluxo uniforme sobre um plano volta como a irradiância certa em
 * qualquer altura e inclinação — no plano em múltiplo inteiro da célula (a fronteira de duas camadas: antes, metade), a
 * ¼ de célula, inclinado a 30° e a 60°, e com a normal num eixo diferente.
 */
import { describe, expect, it } from 'vitest';
import { PhotonHash } from '../photonHash';

type Vec3 = [number, number, number];

/** Base ortonormal de um plano de normal `n` (dois vetores tangentes). */
function tangents(n: Vec3): [Vec3, Vec3] {
    const t: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const dot = t[0] * n[0] + t[1] * n[1] + t[2] * n[2];
    const u: Vec3 = [t[0] - dot * n[0], t[1] - dot * n[1], t[2] - dot * n[2]];
    const l = Math.hypot(...u);
    const uu: Vec3 = [u[0] / l, u[1] / l, u[2] / l];
    const v: Vec3 = [
        n[1] * uu[2] - n[2] * uu[1],
        n[2] * uu[0] - n[0] * uu[2],
        n[0] * uu[1] - n[1] * uu[0],
    ];
    return [uu, v];
}

/**
 * Deposita fótons em grade fina (jitter determinístico) sobre um quadrado de lado `side` no plano por `origin` com
 * normal `n`, com irradiância `e` (W/m²), e devolve a irradiância média lida no centro (longe das bordas).
 */
function planeIrradiance(origin: Vec3, n: Vec3, cell: number, e: number): number {
    const hash = new PhotonHash(cell);
    const [u, v] = tangents(n);
    const side = 0.6;
    const steps = 240;
    const da = (side / steps) ** 2;
    let seed = 1;
    const rand = (): number => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    for (let a = 0; a < steps; a++)
        for (let b = 0; b < steps; b++) {
            const s = ((a + rand()) / steps - 0.5) * side;
            const t = ((b + rand()) / steps - 0.5) * side;
            const p: Vec3 = [
                origin[0] + u[0] * s + v[0] * t,
                origin[1] + u[1] * s + v[1] * t,
                origin[2] + u[2] * s + v[2] * t,
            ];
            hash.deposit(p, n, e * da);
        }
    let sum = 0;
    let count = 0;
    for (let a = -10; a <= 10; a++)
        for (let b = -10; b <= 10; b++) {
            const s = (a / 10) * 0.1;
            const t = (b / 10) * 0.1;
            const p: Vec3 = [
                origin[0] + u[0] * s + v[0] * t,
                origin[1] + u[1] * s + v[1] * t,
                origin[2] + u[2] * s + v[2] * t,
            ];
            sum += hash.irradiance(p, n);
            count++;
        }
    return sum / count;
}

describe('hash das cáusticas — conservação do fluxo (spec 034, R6)', () => {
    const cell = 0.02;
    const cases: [string, Vec3, Vec3][] = [
        ['chão em y = 0 (fronteira de camadas)', [0, 0, 0], [0, 1, 0]],
        ['chão a ¼ de célula', [0, cell / 4, 0], [0, 1, 0]],
        ['chão a ½ célula', [0, cell / 2, 0], [0, 1, 0]],
        ['rampa a 30°', [0, 0.013, 0], [0, Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]],
        ['rampa a 60°', [0, 0.007, 0], [0, Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)]],
        ['parede em x', [0.04, 0.3, 0], [-1, 0, 0]],
        ['plano oblíquo', [0.01, 0.02, 0.03], [0.48, 0.6, 0.64]],
    ];
    for (const [name, origin, normal] of cases) {
        it(`${name}: a irradiância lida é a depositada (≤ 2 %)`, () => {
            const l = Math.hypot(...normal);
            const n: Vec3 = [normal[0] / l, normal[1] / l, normal[2] / l];
            const e = planeIrradiance(origin, n, cell, 100);
            expect(Math.abs(e / 100 - 1)).toBeLessThan(0.02);
        });
    }
});
