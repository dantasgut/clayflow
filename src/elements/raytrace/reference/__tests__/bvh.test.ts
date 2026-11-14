import { describe, expect, it } from 'vitest';
import {
    buildLbvh,
    buildScene,
    expandBits,
    LEAF_BIT,
    morton3,
    rayTriangle,
    raySphere,
    refitLeaves,
    sceneHit,
    spherePrimitive,
    traverse,
    trianglePrimitive,
    type Primitive,
    type Vec3,
} from '../bvh';
import { affinePoint, type Mat4 } from '../../../math/reference/xform';

/** Gerador determinístico (LCG) em [0, 1). */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

function randomTriangles(count: number, seed: number): Primitive[] {
    const r = rng(seed);
    const out: Primitive[] = [];
    for (let i = 0; i < count; i++) {
        const c: Vec3 = [r() * 20 - 10, r() * 20 - 10, r() * 20 - 10];
        const p = (): Vec3 => [c[0] + r() - 0.5, c[1] + r() - 0.5, c[2] + r() - 0.5];
        out.push(trianglePrimitive(p(), p(), p()));
    }
    return out;
}

function randomRay(r: () => number): { o: Vec3; d: Vec3 } {
    const o: Vec3 = [r() * 30 - 15, r() * 30 - 15, r() * 30 - 15];
    const t: Vec3 = [r() * 10 - 5, r() * 10 - 5, r() * 10 - 5];
    const d: Vec3 = [t[0] - o[0], t[1] - o[1], t[2] - o[2]];
    const l = Math.hypot(...d);
    return { o, d: [d[0] / l, d[1] / l, d[2] / l] };
}

function bruteForce(prims: readonly Primitive[], o: Vec3, d: Vec3): number {
    let best = Infinity;
    for (const p of prims) best = Math.min(best, p.intersect(o, d, best));
    return best;
}

describe('referência da estrutura de raios (spec 033, R1)', () => {
    it('Morton: bits intercalados x, y, z', () => {
        expect(expandBits(0b1)).toBe(0b1);
        expect(expandBits(0b11)).toBe(0b1001);
        expect(morton3(0, 0, 0)).toBe(0);
        expect(morton3(0.9999, 0.9999, 0.9999)).toBe(0x3fffffff);
        // x é o bit mais alto de cada trio.
        expect(morton3(1 / 1024, 0, 0)).toBe(0b100);
        expect(morton3(0, 0, 1 / 1024)).toBe(0b1);
    });

    it('LBVH: toda folha alcançada uma vez a partir da raiz, pais coerentes', () => {
        const prims = randomTriangles(257, 7);
        const bvh = buildLbvh(prims.map((p) => p.bounds));
        const n = prims.length;
        expect(bvh.nodes).toHaveLength(2 * n - 1);
        const seen = new Set<number>();
        const stack = [0];
        while (stack.length > 0) {
            const i = stack.pop()!;
            const node = bvh.nodes[i]!;
            if ((node.left & LEAF_BIT) !== 0) {
                seen.add(node.right);
                continue;
            }
            expect(bvh.parents[node.left]).toBe(i);
            expect(bvh.parents[node.right]).toBe(i);
            // A caixa do pai contém as dos filhos.
            for (const c of [node.left, node.right]) {
                for (let k = 0; k < 3; k++) {
                    expect(bvh.nodes[c]!.min[k]).toBeGreaterThanOrEqual(node.min[k]!);
                    expect(bvh.nodes[c]!.max[k]).toBeLessThanOrEqual(node.max[k]!);
                }
            }
            stack.push(node.left, node.right);
        }
        expect(seen.size).toBe(n);
    });

    it('LBVH com códigos repetidos (primitivas no mesmo ponto) continua válida', () => {
        const prims = Array.from({ length: 40 }, () => spherePrimitive([1, 1, 1], 0.1));
        prims.push(spherePrimitive([5, 5, 5], 0.1));
        const bvh = buildLbvh(prims.map((p) => p.bounds));
        const hit = traverse(bvh, prims, [5, 5, 0], [0, 0, 1], 100);
        expect(hit?.primitive).toBe(40);
        expect(hit?.t).toBeCloseTo(4.9, 6);
    });

    it('travessia igual à força bruta em nuvens aleatórias', () => {
        const prims = randomTriangles(2000, 11);
        const bvh = buildLbvh(prims.map((p) => p.bounds));
        const r = rng(3);
        let hits = 0;
        for (let k = 0; k < 500; k++) {
            const { o, d } = randomRay(r);
            const expected = bruteForce(prims, o, d);
            const got = traverse(bvh, prims, o, d, Infinity);
            if (expected === Infinity) expect(got).toBeNull();
            else {
                hits++;
                expect(got!.t).toBeCloseTo(expected, 9);
            }
        }
        expect(hits).toBeGreaterThan(50);
    });

    it('refit: folhas movidas, mesma topologia, travessia continua igual à força bruta', () => {
        const prims = randomTriangles(500, 5);
        const bvh = buildLbvh(prims.map((p) => p.bounds));
        const moved = prims.map((p) => {
            const c = p.bounds.min;
            return spherePrimitive([c[0] * 0.5 + 3, c[1] * 0.5, c[2] * 0.5 - 2], 0.4);
        });
        refitLeaves(
            bvh,
            moved.map((p) => p.bounds),
        );
        const r = rng(9);
        for (let k = 0; k < 200; k++) {
            const { o, d } = randomRay(r);
            const expected = bruteForce(moved, o, d);
            const got = traverse(bvh, moved, o, d, Infinity);
            expect(got?.t ?? Infinity).toBeCloseTo(expected, 9);
        }
    });

    it('interseções analíticas: triângulo (baricêntricas) e esfera (dentro e fora)', () => {
        const hit = rayTriangle([0.25, 0.25, 1], [0, 0, -1], [0, 0, 0], [1, 0, 0], [0, 1, 0], 10);
        expect(hit?.t).toBeCloseTo(1, 12);
        expect(hit?.u).toBeCloseTo(0.25, 12);
        expect(hit?.v).toBeCloseTo(0.25, 12);
        // Dos dois lados.
        expect(
            rayTriangle([0.25, 0.25, -1], [0, 0, 1], [0, 0, 0], [1, 0, 0], [0, 1, 0], 10)?.t,
        ).toBeCloseTo(1, 12);
        expect(raySphere([0, 0, -5], [0, 0, 1], [0, 0, 0], 1, 100)).toBeCloseTo(4, 12);
        expect(raySphere([0, 0, 0], [0, 0, 1], [0, 0, 0], 1, 100)).toBeCloseTo(1, 12);
        expect(raySphere([0, 3, -5], [0, 0, 1], [0, 0, 0], 1, 100)).toBe(Infinity);
    });

    it('dois níveis: instâncias com matrizes iguais à força bruta em mundo', () => {
        const r0 = rng(21);
        const tris: [Vec3, Vec3, Vec3][] = [];
        for (let i = 0; i < 64; i++) {
            const c: Vec3 = [r0() * 4 - 2, r0() * 4 - 2, r0() * 4 - 2];
            const p = (): Vec3 => [c[0] + r0() - 0.5, c[1] + r0() - 0.5, c[2] + r0() - 0.5];
            tris.push([p(), p(), p()]);
        }
        const prims = tris.map(([a, b, c]) => trianglePrimitive(a, b, c));
        const blas = buildLbvh(prims.map((p) => p.bounds));
        const worlds: Mat4[] = [
            [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            [0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 25, 0, 0, 1],
            // Rotação de 90° em y com translação e escala não uniforme.
            [0, 0, -2, 0, 0, 1, 0, 0, 1, 0, 0, 0, -20, 3, 4, 1],
        ];
        const scene = buildScene(worlds.map((world) => ({ blas, prims, world })));
        const worldTris = worlds.flatMap((w) =>
            tris.map(([a, b, c]) =>
                trianglePrimitive(affinePoint(w, a), affinePoint(w, b), affinePoint(w, c)),
            ),
        );
        const r = rng(13);
        let hits = 0;
        for (let k = 0; k < 300; k++) {
            const o: Vec3 = [r() * 80 - 40, r() * 30 - 15, r() * 30 - 15];
            const w = worlds[k % 3]!;
            const tgt: Vec3 = [w[12]! + r() * 4 - 2, w[13]! + r() * 4 - 2, w[14]! + r() * 4 - 2];
            const d0: Vec3 = [tgt[0] - o[0], tgt[1] - o[1], tgt[2] - o[2]];
            const l = Math.hypot(...d0);
            const d: Vec3 = [d0[0] / l, d0[1] / l, d0[2] / l];
            const expected = bruteForce(worldTris, o, d);
            const got = sceneHit(scene, o, d, Infinity);
            if (expected === Infinity) expect(got).toBeNull();
            else {
                hits++;
                expect(got!.t).toBeCloseTo(expected, 7);
                expect(
                    Math.floor(
                        worldTris.findIndex((p) => p.intersect(o, d, Infinity) === expected) / 64,
                    ),
                ).toBe(got!.instance);
            }
        }
        expect(hits).toBeGreaterThan(20);
    });
});
