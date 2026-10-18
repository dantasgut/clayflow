import { describe, expect, it } from 'vitest';
import {
    buildField,
    FIELD,
    marchField,
    sampleField,
    smoothPhi,
    symmetricEigen3,
    type Vec3,
} from '../field';

// Referência do campo dos fluidos (spec 033, T043): autovalores, plano que fica plano, gotas separadas, |∇φ| ≈ 1 e a
// marcha contra a superfície.

const H = 0.1;

/** Partículas numa grade (nx × ny × nz) com espaçamento H a partir de `at`. */
function block(at: Vec3, nx: number, ny: number, nz: number): Vec3[] {
    const out: Vec3[] = [];
    for (let z = 0; z < nz; z++)
        for (let y = 0; y < ny; y++)
            for (let x = 0; x < nx; x++) out.push([at[0] + x * H, at[1] + y * H, at[2] + z * H]);
    return out;
}

/** Cruzamento de φ = 0 ao longo de uma vertical (de cima para baixo), por bissecção na amostra tricúbica. */
function crossingY(
    grid: ReturnType<typeof buildField>,
    x: number,
    z: number,
    top: number,
    bottom: number,
): number {
    let [a, b] = [top, bottom];
    for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2;
        if (sampleField(grid, [x, m, z]).phi > 0) a = m;
        else b = m;
    }
    return (a + b) / 2;
}

describe('campo dos fluidos — referência (spec 033, US7)', () => {
    it('autovalores e autovetores de uma simétrica 3 × 3 (Jacobi)', () => {
        const m = [4, 1, 0, 1, 3, 0.5, 0, 0.5, 1];
        const { values, vectors } = symmetricEigen3(m);
        expect(values[0]).toBeGreaterThanOrEqual(values[1]!);
        expect(values[1]).toBeGreaterThanOrEqual(values[2]!);
        for (let k = 0; k < 3; k++) {
            const v = vectors[k]!;
            const mv = [0, 1, 2].map(
                (r) => m[r * 3]! * v[0] + m[r * 3 + 1]! * v[1] + m[r * 3 + 2]! * v[2],
            );
            for (let r = 0; r < 3; r++) expect(mv[r]).toBeCloseTo(values[k]! * v[r]!, 6);
        }
    });

    it('uma camada de partículas dá uma superfície plana (sem ondulação na escala delas)', () => {
        const particles = block([0, 0, 0], 16, 4, 16);
        const grid = buildField(particles, { spacing: H });
        const heights: number[] = [];
        for (let k = 0; k < 40; k++) {
            const x = 0.5 + (k % 8) * 0.0731;
            const z = 0.5 + Math.floor(k / 8) * 0.0913;
            heights.push(crossingY(grid, x, z, 0.8, 0.1));
        }
        const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
        const sd = Math.sqrt(heights.reduce((a, b) => a + (b - mean) ** 2, 0) / heights.length);
        // A superfície acima da última camada (y = 0,3) e plana: desvio bem abaixo do espaçamento.
        expect(mean).toBeGreaterThan(0.3);
        expect(mean).toBeLessThan(0.3 + H);
        expect(sd).toBeLessThan(0.02 * H);
    });

    it('duas gotas a 4 espaçamentos uma da outra não se fundem', () => {
        const a = block([0, 0, 0], 3, 3, 3);
        const b = block([0.6, 0, 0], 3, 3, 3);
        const grid = buildField([...a, ...b], { spacing: H });
        expect(sampleField(grid, [0.1, 0.1, 0.1]).phi).toBeLessThan(0);
        expect(sampleField(grid, [0.7, 0.1, 0.1]).phi).toBeLessThan(0);
        expect(sampleField(grid, [0.4, 0.1, 0.1]).phi).toBeGreaterThan(0);
    });

    it('esfera de partículas: |∇φ| ≈ 1 na faixa e a marcha acerta a superfície a menos de meio espaçamento', () => {
        const R = 5 * H;
        const particles: Vec3[] = [];
        for (let z = -6; z <= 6; z++)
            for (let y = -6; y <= 6; y++)
                for (let x = -6; x <= 6; x++)
                    if (Math.hypot(x, y, z) * H <= R) particles.push([x * H, y * H, z * H]);
        const grid = buildField(particles, { spacing: H });
        // A superfície de referência: o raio do cruzamento ao longo de +x.
        const surface = (() => {
            let [a, b] = [R + 3 * H, 0];
            for (let k = 0; k < 40; k++) {
                const m = (a + b) / 2;
                if (sampleField(grid, [m, 0, 0]).phi > 0) a = m;
                else b = m;
            }
            return (a + b) / 2;
        })();
        expect(Math.abs(surface - R)).toBeLessThan(H);
        for (const dir of [
            [1, 0, 0],
            [0, 1, 0],
            [0.6, 0.48, 0.64],
            [-0.36, 0.8, -0.48],
        ] as Vec3[]) {
            const origin: Vec3 = [dir[0] * 1.5, dir[1] * 1.5, dir[2] * 1.5];
            const hit = marchField(grid, origin, [-dir[0], -dir[1], -dir[2]], 3);
            expect(hit).not.toBeNull();
            const r = Math.hypot(...hit!.p);
            expect(Math.abs(r - surface)).toBeLessThan(0.5 * H);
            // A normal aponta para fora, ao longo do raio da esfera.
            expect(hit!.n[0] * dir[0] + hit!.n[1] * dir[1] + hit!.n[2] * dir[2]).toBeGreaterThan(
                0.95,
            );
            // |∇φ| ≈ 1 perto da superfície (distância com sinal).
            const g = sampleField(grid, hit!.p).grad;
            expect(Math.hypot(...g)).toBeGreaterThan(0.85);
            expect(Math.hypot(...g)).toBeLessThan(1.15);
        }
    });

    it('o filtro de φ (spec 034) não desloca um plano e mantém |∇φ| ≤ 1', () => {
        const dims = [12, 12, 12] as const;
        const voxel = 0.01;
        const cap = (FIELD.iterations + 1) * voxel;
        // Plano y = 6 voxels, distância limitada ao teto, com ruído de um voxel na interface.
        const phi = new Float32Array(12 * 12 * 12);
        for (let z = 0; z < 12; z++)
            for (let y = 0; y < 12; y++)
                for (let x = 0; x < 12; x++)
                    phi[x + 12 * (y + 12 * z)] = Math.max(
                        -cap,
                        Math.min(cap, (y + 0.5 - 6) * voxel),
                    );
        const out = smoothPhi(phi, dims, voxel);
        // Longe das bordas da grade (o teto entra pelas bordas), o plano fica onde estava.
        for (let y = 3; y < 9; y++)
            expect(out[6 + 12 * (y + 12 * 6)]).toBeCloseTo(phi[6 + 12 * (y + 12 * 6)]!, 6);
        // No interior (nas bordas da grade entra o teto, também do lado de dentro: no motor, bloco ausente é só fora).
        for (let i = 3; i < 10; i++) {
            const a = out[6 + 12 * (i + 12 * 6)]!;
            const b = out[6 + 12 * (i - 1 + 12 * 6)]!;
            expect(Math.abs(a - b)).toBeLessThanOrEqual(voxel * (1 + 1e-6));
        }
        // Um voxel fora do plano é atenuado: o ruído de um voxel cai.
        const bumped = Float32Array.from(phi);
        bumped[6 + 12 * (6 + 12 * 6)]! -= 0.5 * voxel;
        const d =
            smoothPhi(bumped, dims, voxel)[6 + 12 * (6 + 12 * 6)]! - out[6 + 12 * (6 + 12 * 6)]!;
        expect(Math.abs(d)).toBeLessThan(0.5 * voxel * 0.1);
    });
});
