// Referência em CPU da estrutura de raios (spec 033, R1): a mesma aritmética dos módulos WGSL `ray_morton`, `ray_lbvh`,
// `ray_refit` e `ray_scene` — códigos de Morton de 30 bits, hierarquia LBVH de Karras (2012) por prefixos comuns,
// caixas de baixo para cima, travessia de dois níveis com pilha curta e as interseções raio–caixa (lâminas),
// raio–triângulo (Möller–Trumbore) e raio–esfera. Só para os testes e os smokes compararem com a GPU.

import {
    affineBox,
    affineDirection,
    affineInverse,
    affinePoint,
    type Mat4,
} from '../../math/reference/xform';

export type Vec3 = readonly [number, number, number];

/** Caixa alinhada aos eixos. */
export interface Aabb {
    readonly min: Vec3;
    readonly max: Vec3;
}

/** Bit que marca, no filho esquerdo de um nó, a folha (o resto é o índice da primitiva ordenada). */
export const LEAF_BIT = 0x80000000;

/** Nó da hierarquia: caixa e filhos (internos) ou a primitiva (folha: `left` com `LEAF_BIT`). */
export interface BvhNode {
    min: [number, number, number];
    max: [number, number, number];
    left: number;
    right: number;
}

/** Hierarquia de `n` folhas: `n − 1` nós internos (raiz no 0) seguidos das `n` folhas; o pai de cada nó. */
export interface Bvh {
    readonly nodes: BvhNode[];
    readonly parents: Uint32Array;
    /** Primitiva original de cada folha (ordem de Morton). */
    readonly order: Uint32Array;
}

/** Primitiva: a caixa e o teste de interseção em espaço de objeto (distância ou `Infinity`). */
export interface Primitive {
    readonly bounds: Aabb;
    intersect(origin: Vec3, dir: Vec3, tMax: number): number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

/** Espalha os 10 bits baixos de `v` a cada 3 bits (Morton). */
export function expandBits(v: number): number {
    let x = v & 0x3ff;
    x = (x * 0x00010001) & 0xff0000ff;
    x = (x * 0x00000101) & 0x0f00f00f;
    x = (x * 0x00000011) & 0xc30c30c3;
    x = (x * 0x00000005) & 0x49249249;
    return x >>> 0;
}

/** Código de Morton de 30 bits de um ponto normalizado em [0, 1]³. */
export function morton3(x: number, y: number, z: number): number {
    const q = (c: number): number => Math.min(Math.max(Math.floor(c * 1024), 0), 1023);
    return ((expandBits(q(x)) << 2) | (expandBits(q(y)) << 1) | expandBits(q(z))) >>> 0;
}

/** Zeros à esquerda de um u32. */
const clz = (x: number): number => Math.clz32(x >>> 0);

/** Prefixo comum de (código, índice) de i e j; −1 fora de [0, n). Códigos iguais desempatam pelo índice. */
function delta(codes: Uint32Array, i: number, j: number): number {
    if (j < 0 || j >= codes.length) return -1;
    const a = codes[i]!;
    const b = codes[j]!;
    if (a === b) return 32 + clz(i ^ j);
    return clz(a ^ b);
}

/** Caixa que envolve as duas. */
export function unionBox(a: Aabb, b: Aabb): Aabb {
    return {
        min: [
            Math.min(a.min[0], b.min[0]),
            Math.min(a.min[1], b.min[1]),
            Math.min(a.min[2], b.min[2]),
        ],
        max: [
            Math.max(a.max[0], b.max[0]),
            Math.max(a.max[1], b.max[1]),
            Math.max(a.max[2], b.max[2]),
        ],
    };
}

/** Caixa de um conjunto de caixas. */
export function boundsOf(boxes: readonly Aabb[]): Aabb {
    let box: Aabb = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
    };
    for (const b of boxes) box = unionBox(box, b);
    return box;
}

/**
 * Hierarquia LBVH (Karras 2012) sobre as caixas: Morton do centro na caixa do conjunto, ordenação estável pelo código,
 * nós internos por prefixos comuns, caixas de baixo para cima.
 */
export function buildLbvh(boxes: readonly Aabb[]): Bvh {
    const n = boxes.length;
    if (n === 0) return { nodes: [], parents: new Uint32Array(0), order: new Uint32Array(0) };
    const scene = boundsOf(boxes);
    const extent = sub(scene.max, scene.min).map((e) => (e > 0 ? e : 1)) as unknown as Vec3;
    const keyed = boxes.map((b, i) => {
        const c = [0, 1, 2].map(
            (k) => ((b.min[k]! + b.max[k]!) * 0.5 - scene.min[k]!) / extent[k]!,
        );
        return { code: morton3(c[0]!, c[1]!, c[2]!), index: i };
    });
    // Estável: códigos iguais mantêm a ordem original (como a ordenação radix da GPU).
    keyed.sort((a, b) => a.code - b.code || a.index - b.index);
    const codes = Uint32Array.from(keyed.map((k) => k.code));
    const order = Uint32Array.from(keyed.map((k) => k.index));
    const leaf0 = n - 1;
    const nodes: BvhNode[] = Array.from({ length: 2 * n - 1 }, () => ({
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
        left: 0,
        right: 0,
    }));
    const parents = new Uint32Array(2 * n - 1).fill(0xffffffff);
    for (let j = 0; j < n; j++) {
        const leaf = nodes[leaf0 + j]!;
        const b = boxes[order[j]!]!;
        leaf.min = [...b.min];
        leaf.max = [...b.max];
        leaf.left = (LEAF_BIT | j) >>> 0;
        leaf.right = order[j]!;
    }
    for (let i = 0; i < n - 1; i++) {
        const [first, last] = rangeOf(codes, i);
        const split = splitOf(codes, first, last);
        const left = split === first ? leaf0 + split : split;
        const right = split + 1 === last ? leaf0 + split + 1 : split + 1;
        nodes[i]!.left = left;
        nodes[i]!.right = right;
        parents[left] = i;
        parents[right] = i;
    }
    refit({ nodes, parents, order });
    return { nodes, parents, order };
}

/** Faixa de folhas [primeira, última] coberta pelo nó interno i (Karras 2012, alg. 3). */
function rangeOf(codes: Uint32Array, i: number): [number, number] {
    const d = delta(codes, i, i + 1) - delta(codes, i, i - 1) >= 0 ? 1 : -1;
    const dMin = delta(codes, i, i - d);
    let lMax = 2;
    while (delta(codes, i, i + lMax * d) > dMin) lMax *= 2;
    let l = 0;
    for (let t = lMax >> 1; t >= 1; t >>= 1) {
        if (delta(codes, i, i + (l + t) * d) > dMin) l += t;
    }
    const j = i + l * d;
    return d > 0 ? [i, j] : [j, i];
}

/** Divisão da faixa [first, last]: a última folha do filho esquerdo. */
function splitOf(codes: Uint32Array, first: number, last: number): number {
    const common = delta(codes, first, last);
    let split = first;
    let step = last - first;
    do {
        step = (step + 1) >> 1;
        const next = split + step;
        if (next < last && delta(codes, first, next) > common) split = next;
    } while (step > 1);
    return split;
}

/** Recalcula as caixas internas de baixo para cima (o mesmo que o refit da GPU, que usa contadores atômicos). */
export function refit(bvh: Bvh): void {
    const n = bvh.order.length;
    for (let i = n - 2; i >= 0; i--) {
        // Internos em ordem decrescente não garantem filhos prontos: resolve por recursão memorizada.
        boxOf(bvh, i);
    }
}

function boxOf(bvh: Bvh, node: number): BvhNode {
    const nd = bvh.nodes[node]!;
    if ((nd.left & LEAF_BIT) !== 0 || nd.min[0] !== Infinity) return nd;
    const a = boxOf(bvh, nd.left);
    const b = boxOf(bvh, nd.right);
    const u = unionBox(a, b);
    nd.min = [...u.min];
    nd.max = [...u.max];
    return nd;
}

/** Reajusta as folhas com caixas novas (mesma topologia) e recalcula os internos. */
export function refitLeaves(bvh: Bvh, boxes: readonly Aabb[]): void {
    const n = bvh.order.length;
    for (let j = 0; j < n; j++) {
        const leaf = bvh.nodes[n - 1 + j]!;
        const b = boxes[bvh.order[j]!]!;
        leaf.min = [...b.min];
        leaf.max = [...b.max];
    }
    for (let i = 0; i < n - 1; i++) {
        bvh.nodes[i]!.min = [Infinity, Infinity, Infinity];
        bvh.nodes[i]!.max = [-Infinity, -Infinity, -Infinity];
    }
    refit(bvh);
}

/** Interseção raio–caixa por lâminas: a entrada em [0, tMax], ou `Infinity`. */
export function rayBox(origin: Vec3, invDir: Vec3, box: Aabb, tMax: number): number {
    let t0 = 0;
    let t1 = tMax;
    for (let k = 0; k < 3; k++) {
        const a = (box.min[k]! - origin[k]!) * invDir[k]!;
        const b = (box.max[k]! - origin[k]!) * invDir[k]!;
        t0 = Math.max(t0, Math.min(a, b));
        t1 = Math.min(t1, Math.max(a, b));
    }
    return t0 <= t1 ? t0 : Infinity;
}

/** Interseção raio–triângulo (Möller–Trumbore), dos dois lados: distância e baricêntricas (u, v), ou `null`. */
export function rayTriangle(
    origin: Vec3,
    dir: Vec3,
    a: Vec3,
    b: Vec3,
    c: Vec3,
    tMax: number,
): { t: number; u: number; v: number } | null {
    const e1 = sub(b, a);
    const e2 = sub(c, a);
    const p = cross(dir, e2);
    const det = dot(e1, p);
    if (Math.abs(det) < 1e-12) return null;
    const inv = 1 / det;
    const s = sub(origin, a);
    const u = dot(s, p) * inv;
    if (u < 0 || u > 1) return null;
    const q = cross(s, e1);
    const v = dot(dir, q) * inv;
    if (v < 0 || u + v > 1) return null;
    const t = dot(e2, q) * inv;
    return t > 0 && t < tMax ? { t, u, v } : null;
}

/** Interseção raio–esfera: a primeira distância positiva < tMax, ou `Infinity`. */
export function raySphere(
    origin: Vec3,
    dir: Vec3,
    center: Vec3,
    radius: number,
    tMax: number,
): number {
    const oc = sub(origin, center);
    const b = dot(oc, dir);
    const c = dot(oc, oc) - radius * radius;
    const a = dot(dir, dir);
    const disc = b * b - a * c;
    if (disc < 0) return Infinity;
    const s = Math.sqrt(disc);
    const t0 = (-b - s) / a;
    const t1 = (-b + s) / a;
    if (t0 > 0 && t0 < tMax) return t0;
    if (t1 > 0 && t1 < tMax) return t1;
    return Infinity;
}

/** Pilha da travessia (a mesma da GPU). */
export const STACK_SIZE = 32;

/** Acerto mais próximo nas primitivas da hierarquia: distância e primitiva original, ou `null`. */
export function traverse(
    bvh: Bvh,
    prims: readonly Primitive[],
    origin: Vec3,
    dir: Vec3,
    tMax: number,
): { t: number; primitive: number } | null {
    const n = bvh.order.length;
    if (n === 0) return null;
    const inv: Vec3 = [1 / dir[0], 1 / dir[1], 1 / dir[2]];
    let best = tMax;
    let hit = -1;
    const stack: number[] = [n === 1 ? 0 : 0];
    if (n === 1) {
        const t = prims[bvh.order[0]!]!.intersect(origin, dir, best);
        return t < best ? { t, primitive: bvh.order[0]! } : null;
    }
    while (stack.length > 0) {
        if (stack.length > STACK_SIZE) throw new Error('traverse: pilha estourou');
        const node = bvh.nodes[stack.pop()!]!;
        if (rayBox(origin, inv, node, best) === Infinity) continue;
        if ((node.left & LEAF_BIT) !== 0) {
            const prim = node.right;
            const t = prims[prim]!.intersect(origin, dir, best);
            if (t < best) {
                best = t;
                hit = prim;
            }
            continue;
        }
        // O filho mais próximo por último (sai primeiro da pilha).
        const l = bvh.nodes[node.left]!;
        const r = bvh.nodes[node.right]!;
        const tl = rayBox(origin, inv, l, best);
        const tr = rayBox(origin, inv, r, best);
        if (tl <= tr) {
            if (tr !== Infinity) stack.push(node.right);
            if (tl !== Infinity) stack.push(node.left);
        } else {
            if (tl !== Infinity) stack.push(node.left);
            stack.push(node.right);
        }
    }
    return hit < 0 ? null : { t: best, primitive: hit };
}

/** Triângulo como primitiva. */
export function trianglePrimitive(a: Vec3, b: Vec3, c: Vec3): Primitive {
    return {
        bounds: {
            min: [
                Math.min(a[0], b[0], c[0]),
                Math.min(a[1], b[1], c[1]),
                Math.min(a[2], b[2], c[2]),
            ],
            max: [
                Math.max(a[0], b[0], c[0]),
                Math.max(a[1], b[1], c[1]),
                Math.max(a[2], b[2], c[2]),
            ],
        },
        intersect: (o, d, tMax) => rayTriangle(o, d, a, b, c, tMax)?.t ?? Infinity,
    };
}

/** Esfera como primitiva. */
export function spherePrimitive(center: Vec3, radius: number): Primitive {
    return {
        bounds: {
            min: [center[0] - radius, center[1] - radius, center[2] - radius],
            max: [center[0] + radius, center[1] + radius, center[2] + radius],
        },
        intersect: (o, d, tMax) => raySphere(o, d, center, radius, tMax),
    };
}

/** Instância da cena: uma hierarquia de baixo (BLAS) com as suas primitivas e a matriz de mundo. */
export interface RayInstance {
    readonly blas: Bvh;
    readonly prims: readonly Primitive[];
    readonly world: Mat4;
}

/** Cena de dois níveis: a hierarquia de cima (TLAS) sobre as caixas de mundo das instâncias. */
export interface RaySceneRef {
    readonly tlas: Bvh;
    readonly instances: readonly RayInstance[];
}

/** TLAS por LBVH sobre as caixas de mundo das instâncias. */
export function buildScene(instances: readonly RayInstance[]): RaySceneRef {
    const boxes = instances.map((inst) => affineBox(inst.world, inst.blas.nodes[0]!));
    return { tlas: buildLbvh(boxes), instances };
}

/**
 * Acerto mais próximo na cena de dois níveis: a TLAS escolhe as instâncias; o raio vai ao espaço de objeto de cada
 * uma (a distância é preservada porque a direção não é normalizada) e desce a BLAS.
 */
export function sceneHit(
    scene: RaySceneRef,
    origin: Vec3,
    dir: Vec3,
    tMax: number,
): { t: number; instance: number; primitive: number } | null {
    const instPrims: Primitive[] = scene.instances.map((inst) => {
        const inv = affineInverse(inst.world);
        return {
            bounds: affineBox(inst.world, inst.blas.nodes[0]!),
            intersect: (o: Vec3, d: Vec3, t: number): number =>
                traverse(inst.blas, inst.prims, affinePoint(inv, o), affineDirection(inv, d), t)?.t
                ?? Infinity,
        };
    });
    const top = traverse(scene.tlas, instPrims, origin, dir, tMax);
    if (top === null) return null;
    const inst = scene.instances[top.primitive]!;
    const inv = affineInverse(inst.world);
    const low = traverse(
        inst.blas,
        inst.prims,
        affinePoint(inv, origin),
        affineDirection(inv, dir),
        tMax,
    );
    return low === null ? null : { t: low.t, instance: top.primitive, primitive: low.primitive };
}
