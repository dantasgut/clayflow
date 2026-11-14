import { describe, expect, it } from 'vitest';
import {
    affineBox,
    affineDirection,
    affineInverse,
    affineNormal,
    affinePoint,
    mat3Apply,
    mat3Det,
    mat3Inverse,
    mat4Apply,
    mat4Multiply,
    MAT4_IDENTITY,
    projectiveInverse,
    projectivePoint,
    quatMatrix,
    rigidInverse,
    trsNormal,
    trsWorld,
    type Mat4,
    type Vec3,
} from '../xform';
import { randomSeed, randomUnit } from '../random';

// Referência f64 das transformações (spec 037, R3): as propriedades de cada classe — a inversa desfaz, as classes
// coincidem onde se sobrepõem (rígida ⊂ afim ⊂ projetiva), a normal é a inversa transposta, o TRS é T·R·S. A
// equivalência da GPU contra esta referência é o smoke `shaderLibrary` (caso por classe).

const close = (a: readonly number[], b: readonly number[], tol: number): void => {
    expect(a.length).toBe(b.length);
    a.forEach((x, i) => {
        expect(Math.abs(x - b[i]!)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b[i]!)));
    });
};

function randomQuat(r: () => number): [number, number, number, number] {
    const q = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];
    const l = Math.hypot(...q);
    return q.map((v) => v / l) as [number, number, number, number];
}

const randomVec = (r: () => number, lo: number, hi: number): Vec3 => [
    lo + (hi - lo) * r(),
    lo + (hi - lo) * r(),
    lo + (hi - lo) * r(),
];

describe('referência f64 das transformações', () => {
    let draw = 0;
    const r = (): number => randomUnit(randomSeed(0, draw++, 37));
    const cases = Array.from({ length: 64 }, (_, k) => {
        const q = randomQuat(r);
        const [sx, sy, sz] = randomVec(r, 0.5, 2);
        const s: Vec3 = [k % 4 === 3 ? -sx : sx, sy, sz];
        return { q, s, t: randomVec(r, -3, 3) };
    });

    it('rígida: a inversa desfaz e coincide com a afim', () => {
        for (const { q, t } of cases) {
            const m = trsWorld(t, q, [1, 1, 1]);
            close(mat4Multiply(rigidInverse(m), m), MAT4_IDENTITY, 1e-12);
            close(rigidInverse(m), affineInverse(m), 1e-12);
        }
    });

    it('afim: a inversa desfaz ponto e direção; coincide com a projetiva', () => {
        for (const { q, s, t } of cases) {
            const m = trsWorld(t, q, s);
            const inv = affineInverse(m);
            const p: Vec3 = [0.3, -0.7, 4];
            close(affinePoint(inv, affinePoint(m, p)), p, 1e-12);
            close(affineDirection(inv, affineDirection(m, p)), p, 1e-12);
            close(inv, projectiveInverse(m), 1e-12);
        }
    });

    it('afim: singular (|det| ≤ 1e-20) dá a identidade, como a guarda da GPU', () => {
        const m = trsWorld([1, 2, 3], [0, 0, 0, 1], [0, 1, 1]);
        expect(affineInverse(m)).toEqual([...MAT4_IDENTITY]);
    });

    it('normal: a inversa transposta preserva a perpendicularidade', () => {
        for (const { q, s, t } of cases) {
            const m = trsWorld(t, q, s);
            const n = affineNormal(m);
            // Tangente e normal de um plano: o produto escalar continua 0 depois da transformação.
            const tangent: Vec3 = [1, 0, 0];
            const normal: Vec3 = [0, 1, 0];
            const tw = affineDirection(m, tangent);
            const nw = mat3Apply(n, normal);
            expect(Math.abs(tw[0] * nw[0] + tw[1] * nw[1] + tw[2] * nw[2])).toBeLessThan(1e-12);
        }
    });

    it('TRS: T·R·S e a normal R·S⁻¹ (= inversa transposta quando a escala não é nula)', () => {
        for (const { q, s, t } of cases) {
            const m = trsWorld(t, q, s);
            const rot = quatMatrix(q);
            close(affineDirection(m, [1, 0, 0]), mat3Apply(rot, [s[0], 0, 0]), 1e-12);
            close([m[12]!, m[13]!, m[14]!], t, 0);
            close(trsNormal(q, s), affineNormal(m), 1e-12);
        }
        // Escala zero anula o eixo na normal (o recíproco seguro).
        expect(trsNormal([0, 0, 0, 1], [0, 1, 1]).slice(0, 3)).toEqual([0, 0, 0]);
        // Quaternion nulo vira identidade; não normalizado é normalizado.
        expect(quatMatrix([0, 0, 0, 0])).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        close(quatMatrix([0, 0, 0, 2]), [1, 0, 0, 0, 1, 0, 0, 0, 1], 0);
    });

    it('projetiva: a inversa desfaz e o ponto projetado volta', () => {
        const f = 1 / Math.tan(0.5);
        const near = 0.1;
        const far = 50;
        const nf = 1 / (near - far);
        const proj: Mat4 = [
            f / 1.5,
            0,
            0,
            0,
            0,
            f,
            0,
            0,
            0,
            0,
            far * nf,
            -1,
            0,
            0,
            near * far * nf,
            0,
        ];
        const inv = projectiveInverse(proj);
        close(mat4Multiply(inv, proj), MAT4_IDENTITY, 1e-12);
        const p: Vec3 = [0.4, -0.2, -7];
        const ndc = projectivePoint(proj, p);
        const back = mat4Apply(inv, [ndc[0], ndc[1], ndc[2], 1]);
        close(
            back.slice(0, 3).map((v) => v / back[3]!),
            p,
            1e-12,
        );
    });

    it('3×3: determinante e inversa', () => {
        const a = [2, 1, 0, 0, 3, 1, 1, 0, 4];
        expect(mat3Det(a)).toBeCloseTo(25, 12);
        const inv = mat3Inverse(a);
        const id = [0, 1, 2].flatMap((c) =>
            mat3Apply(a, [inv[3 * c]!, inv[3 * c + 1]!, inv[3 * c + 2]!]),
        );
        close(id, [1, 0, 0, 0, 1, 0, 0, 0, 1], 1e-12);
    });

    it('caixa: os 8 cantos transformados', () => {
        const m = trsWorld([1, 0, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2], [2, 1, 1]);
        const box = affineBox(m, { min: [-1, -1, -1], max: [1, 1, 1] });
        close(box.min, [0, -2, -1], 1e-12);
        close(box.max, [2, 2, 1], 1e-12);
    });
});
