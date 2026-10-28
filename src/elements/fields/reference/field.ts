// Referência de CPU do campo dos fluidos (spec 033, R11, US7) — a mesma conta dos kernels de `gpu/wgsl/fields/`, numa
// grade densa (a da GPU é esparsa em blocos de 8³ só onde há partículas; os valores dos voxels são os mesmos):
//   1. núcleos anisotrópicos de Yu & Turk (2013): a posição suavizada e a covariância dos vizinhos de cada partícula; os
//      autovalores esticam o núcleo ao longo da superfície (o raio na direção da normal encolhe até 1/k_r do maior) —
//      superfícies planas ficam planas; com poucos vizinhos, um núcleo isotrópico menor (gotas separadas não se fundem);
//   2. a densidade normalizada (massa conservada qualquer que seja a forma do núcleo) nos voxels de ½ espaçamento, a
//      superfície no nível `iso` dela;
//   3. a distância com sinal na faixa estreita (|∇φ| ≈ 1) pelo método iterativo rápido da eikonal a partir dos voxels
//      da interface, o que permite marchar com passos seguros;
//      (a densidade passa antes por um filtro binomial 3 × 3 × 3: sem ondulação na escala das partículas);
//   4. a amostragem por B-spline tricúbica (contínua até a segunda derivada: ponto e normal lisos de perto) e a marcha
//      do raio com refinamento por secante.

import { fieldContactShape } from '../schemas';

export type Vec3 = readonly [number, number, number];

/** Parâmetros do campo. */
export interface FieldParams {
    /** Espaçamento das partículas (m). */
    readonly spacing: number;
    /** Nível da superfície na densidade (padrão `FIELD.iso`; a GPU o ajusta para conservar o volume). */
    readonly iso?: number;
    /** Ângulo de contato com os sólidos em graus (padrão 90: a gota pousada não molha e fica a esfera). */
    readonly contactAngle?: number;
    /**
     * O sólido mais próximo de cada partícula (normal para fora dele, distância), como o solver o escreve; sem ele (ou
     * normal zero), nenhum.
     */
    readonly contacts?: readonly (readonly [number, number, number, number] | undefined)[];
}

/** Constantes do campo (as mesmas do WGSL). */
export const FIELD = Object.freeze({
    /** Voxel em espaçamentos de partícula. */
    voxel: 0.5,
    /** Raio do núcleo (e da vizinhança da covariância) em espaçamentos. */
    radius: 2,
    /** Suavização das posições (Laplaciano de Yu & Turk). */
    smoothing: 0.5,
    /** Razão máxima entre o maior e o menor raio do núcleo. */
    ratio: 4,
    /** Vizinhos abaixo dos quais o núcleo é isotrópico e menor. */
    neighbors: 8,
    /** Raio do núcleo isotrópico das partículas com poucos vizinhos, em fração do raio. */
    sparse: 0.5,
    /** Nível da superfície na densidade normalizada (1 dentro do fluido). */
    iso: 0.42,
    /** Faixa estreita útil do campo, em voxels (o redistanciamento calcula em 3 vezes ela). */
    band: 4,
    /** Iterações do método rápido da eikonal (a distância é exata até essa quantidade de voxels da interface). */
    iterations: 6,
    /** Blocos de voxels por lado (a grade esparsa da GPU). */
    brick: 8,
});

/** Grade densa do campo: origem (canto do voxel 0), tamanho do voxel, dimensões e φ por voxel (x mais rápido). */
export interface FieldGrid {
    readonly origin: Vec3;
    readonly voxel: number;
    readonly dims: readonly [number, number, number];
    readonly phi: Float32Array;
}

/** Núcleo anisotrópico de uma partícula: o centro (suavizado) e a matriz G (o núcleo vale onde |G (x − c)| < 1). */
export interface Kernel {
    readonly center: Vec3;
    /** G, linha por linha (simétrica). */
    readonly g: readonly number[];
    readonly det: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Autovalores e autovetores de uma matriz simétrica 3 × 3 (Jacobi cíclico): valores em ordem decrescente e os vetores
 * correspondentes (colunas de R, com M = R diag(λ) Rᵀ).
 */
export function symmetricEigen3(m: readonly number[]): { values: number[]; vectors: Vec3[] } {
    const a = [...m];
    const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let sweep = 0; sweep < 12; sweep++) {
        const off = a[1]! * a[1]! + a[2]! * a[2]! + a[5]! * a[5]!;
        if (off < 1e-24) break;
        for (const [p, q] of [
            [0, 1],
            [0, 2],
            [1, 2],
        ] as const) {
            const apq = a[p * 3 + q]!;
            if (Math.abs(apq) < 1e-30) continue;
            const app = a[p * 4]!;
            const aqq = a[q * 4]!;
            const theta = (aqq - app) / (2 * apq);
            const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1);
            const s = t * c;
            // A ← Jᵀ A J, V ← V J (rotação no plano p, q).
            for (let k = 0; k < 3; k++) {
                const akp = a[k * 3 + p]!;
                const akq = a[k * 3 + q]!;
                a[k * 3 + p] = c * akp - s * akq;
                a[k * 3 + q] = s * akp + c * akq;
            }
            for (let k = 0; k < 3; k++) {
                const apk = a[p * 3 + k]!;
                const aqk = a[q * 3 + k]!;
                a[p * 3 + k] = c * apk - s * aqk;
                a[q * 3 + k] = s * apk + c * aqk;
            }
            for (let k = 0; k < 3; k++) {
                const vkp = v[k * 3 + p]!;
                const vkq = v[k * 3 + q]!;
                v[k * 3 + p] = c * vkp - s * vkq;
                v[k * 3 + q] = s * vkp + c * vkq;
            }
        }
    }
    const pairs = [0, 1, 2].map((k) => ({
        value: a[k * 4]!,
        vector: [v[k]!, v[3 + k]!, v[6 + k]!] as Vec3,
    }));
    pairs.sort((x, y) => y.value - x.value);
    return { values: pairs.map((p) => p.value), vectors: pairs.map((p) => p.vector) };
}

/** Vizinhos dentro de `r` (grade uniforme de células de lado `r`). */
function neighborsOf(positions: readonly Vec3[], r: number): number[][] {
    const cells = new Map<string, number[]>();
    const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
    positions.forEach((p, i) => {
        const k = key(Math.floor(p[0] / r), Math.floor(p[1] / r), Math.floor(p[2] / r));
        let list = cells.get(k);
        if (list === undefined) cells.set(k, (list = []));
        list.push(i);
    });
    return positions.map((p) => {
        const out: number[] = [];
        const [cx, cy, cz] = [Math.floor(p[0] / r), Math.floor(p[1] / r), Math.floor(p[2] / r)];
        for (let dz = -1; dz <= 1; dz++)
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++)
                    for (const j of cells.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
                        const d = sub(positions[j]!, p);
                        if (dot(d, d) < r * r) out.push(j);
                    }
        return out;
    });
}

/** Peso da vizinhança da covariância a `d` de `r` (Yu & Turk: 1 − (d/r)³). */
function neighborWeight(d: number, r: number): number {
    return d < r ? 1 - (d / r) ** 3 : 0;
}

/** Os núcleos anisotrópicos das partículas (posição suavizada, G e det G). */
export function anisotropicKernels(positions: readonly Vec3[], params: FieldParams): Kernel[] {
    const r = FIELD.radius * params.spacing;
    const lists = neighborsOf(positions, r);
    return positions.map((p, i) => {
        let wsum = 0;
        const mean = [0, 0, 0];
        for (const j of lists[i]!) {
            const w = neighborWeight(
                Math.sqrt(dot(sub(positions[j]!, p), sub(positions[j]!, p))),
                r,
            );
            wsum += w;
            for (let k = 0; k < 3; k++) mean[k]! += w * positions[j]![k]!;
        }
        const xw: Vec3 = [mean[0]! / wsum, mean[1]! / wsum, mean[2]! / wsum];
        const lambda = FIELD.smoothing;
        const center: Vec3 = [0, 1, 2].map(
            (k) => (1 - lambda) * p[k]! + lambda * xw[k]!,
        ) as unknown as Vec3;
        if (lists[i]!.length < FIELD.neighbors) {
            const rs = FIELD.sparse * r;
            const [fa, fc] = fieldContactShape(params.contactAngle ?? 90);
            const contact = params.contacts?.[i];
            if (
                fa > 0
                && contact !== undefined
                && dot(contact as unknown as Vec3, contact as unknown as Vec3) > 0.25
                && contact[3] < rs
            ) {
                // A calota pousada (a regra do WGSL): achatada contra o sólido, centrada nele, com o volume do núcleo.
                const len = Math.hypot(contact[0], contact[1], contact[2]);
                const n: Vec3 = [contact[0] / len, contact[1] / len, contact[2] / len];
                const a = rs * fa;
                const c = rs * fc;
                const g = [0, 0, 0, 0, 0, 0, 0, 0, 0];
                for (let x = 0; x < 3; x++)
                    for (let y = 0; y < 3; y++)
                        g[x * 3 + y] = (x === y ? 1 / a : 0) + (1 / c - 1 / a) * n[x]! * n[y]!;
                return {
                    center: [0, 1, 2].map(
                        (k) => center[k]! - n[k]! * contact[3],
                    ) as unknown as Vec3,
                    g,
                    det: 1 / (a * a * c),
                };
            }
            const s = 1 / rs;
            return { center, g: [s, 0, 0, 0, s, 0, 0, 0, s], det: s * s * s };
        }
        const c = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (const j of lists[i]!) {
            const d = sub(positions[j]!, p);
            const w = neighborWeight(Math.sqrt(dot(d, d)), r);
            const e = sub(positions[j]!, xw);
            for (let a = 0; a < 3; a++)
                for (let b = 0; b < 3; b++) c[a * 3 + b]! += w * e[a]! * e[b]!;
        }
        for (let k = 0; k < 9; k++) c[k]! /= wsum;
        const { values, vectors } = symmetricEigen3(c);
        // O raio ao longo de cada eixo próprio, relativo ao maior (até 1/k_r dele): o maior vale `r`.
        const s1 = Math.max(values[0]!, 1e-12);
        const radii = values.map((v) => r * Math.max(v / s1, 1 / FIELD.ratio));
        const g = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (let k = 0; k < 3; k++) {
            const inv = 1 / radii[k]!;
            const e = vectors[k]!;
            for (let a = 0; a < 3; a++)
                for (let b = 0; b < 3; b++) g[a * 3 + b]! += inv * e[a]! * e[b]!;
        }
        return { center, g, det: 1 / (radii[0]! * radii[1]! * radii[2]!) };
    });
}

/** Integral do núcleo (1 − q²)³ na bola unitária: normaliza a densidade (massa conservada). */
const KERNEL_NORM = (4 * Math.PI * 16) / 315;

/** Densidade normalizada em `x` (1 dentro do fluido em repouso). */
export function densityAt(kernels: readonly Kernel[], x: Vec3, params: FieldParams): number {
    const mass = params.spacing ** 3;
    let rho = 0;
    for (const k of kernels) {
        const d = sub(x, k.center);
        const g = k.g;
        const q: Vec3 = [
            g[0]! * d[0] + g[1]! * d[1] + g[2]! * d[2],
            g[3]! * d[0] + g[4]! * d[1] + g[5]! * d[2],
            g[6]! * d[0] + g[7]! * d[1] + g[8]! * d[2],
        ];
        const q2 = dot(q, q);
        if (q2 >= 1) continue;
        const t = 1 - q2;
        rho += (mass * k.det * t * t * t) / KERNEL_NORM;
    }
    return rho;
}

/** Constrói o campo numa grade densa em volta das partículas: densidade, φ inicial e redistanciamento. */
export function buildField(positions: readonly Vec3[], params: FieldParams): FieldGrid {
    const kernels = anisotropicKernels(positions, params);
    const voxel = FIELD.voxel * params.spacing;
    const margin = FIELD.radius * params.spacing + 4 * voxel;
    const lo = [0, 1, 2].map((k) => Math.min(...positions.map((p) => p[k]!)) - margin);
    const hi = [0, 1, 2].map((k) => Math.max(...positions.map((p) => p[k]!)) + margin);
    const dims = [0, 1, 2].map((k) => Math.ceil((hi[k]! - lo[k]!) / voxel) + 1) as [
        number,
        number,
        number,
    ];
    const origin: Vec3 = [lo[0]!, lo[1]!, lo[2]!];
    const n = dims[0] * dims[1] * dims[2];
    const rho = new Float32Array(n);
    const at = (x: number, y: number, z: number): number => x + dims[0] * (y + dims[1] * z);
    for (let z = 0; z < dims[2]; z++)
        for (let y = 0; y < dims[1]; y++)
            for (let x = 0; x < dims[0]; x++)
                rho[at(x, y, z)] = densityAt(
                    kernels,
                    [origin[0] + x * voxel, origin[1] + y * voxel, origin[2] + z * voxel],
                    params,
                );
    return {
        origin,
        voxel,
        dims,
        phi: redistance(smoothDensity(rho, dims), dims, voxel, params.iso ?? FIELD.iso),
    };
}

/**
 * Filtro binomial 3 × 3 × 3 da densidade (pesos (1, 2, 1)³ / 64; fora da grade, zero): zera a ondulação na escala do
 * espaçamento das partículas (2 voxels) sem deslocar uma superfície plana.
 */
export function smoothDensity(
    rho: Float32Array,
    dims: readonly [number, number, number],
): Float32Array {
    const [nx, ny, nz] = dims;
    const out = new Float32Array(rho.length);
    for (let z = 0; z < nz; z++)
        for (let y = 0; y < ny; y++)
            for (let x = 0; x < nx; x++) {
                let sum = 0;
                for (let dz = -1; dz <= 1; dz++)
                    for (let dy = -1; dy <= 1; dy++)
                        for (let dx = -1; dx <= 1; dx++) {
                            const [qx, qy, qz] = [x + dx, y + dy, z + dz];
                            if (qx < 0 || qy < 0 || qz < 0 || qx >= nx || qy >= ny || qz >= nz)
                                continue;
                            sum +=
                                (2 - Math.abs(dx))
                                * (2 - Math.abs(dy))
                                * (2 - Math.abs(dz))
                                * rho[qx + nx * (qy + ny * qz)]!;
                        }
                out[x + nx * (y + ny * z)] = sum / 64;
            }
    return out;
}

/**
 * φ inicial pela densidade (a distância de primeira ordem ao nível `iso`, positiva fora) e a distância com sinal pela
 * eikonal a partir da interface (`eikonal`).
 */
export function redistance(
    rho: Float32Array,
    dims: readonly [number, number, number],
    voxel: number,
    iso: number = FIELD.iso,
): Float32Array {
    const [nx, ny, nz] = dims;
    const at = (x: number, y: number, z: number): number =>
        Math.min(nx - 1, Math.max(0, x))
        + nx * (Math.min(ny - 1, Math.max(0, y)) + ny * Math.min(nz - 1, Math.max(0, z)));
    // A faixa de cálculo é mais larga que a útil: φ₀ (de primeira ordem) é impreciso, e uma fronteira congelada perto da
    // interface prenderia o perfil.
    const band = 3 * FIELD.band * voxel;
    const phi0 = new Float32Array(rho.length);
    for (let z = 0; z < nz; z++)
        for (let y = 0; y < ny; y++)
            for (let x = 0; x < nx; x++) {
                const i = at(x, y, z);
                const gx = (rho[at(x + 1, y, z)]! - rho[at(x - 1, y, z)]!) / (2 * voxel);
                const gy = (rho[at(x, y + 1, z)]! - rho[at(x, y - 1, z)]!) / (2 * voxel);
                const gz = (rho[at(x, y, z + 1)]! - rho[at(x, y, z - 1)]!) / (2 * voxel);
                const g = Math.max(Math.hypot(gx, gy, gz), iso / band);
                phi0[i] = Math.max(-band, Math.min(band, (iso - rho[i]!) / g));
            }
    return eikonal(phi0, dims, voxel);
}

/** Solução da eikonal discreta (unidades de voxel) pelos vizinhos a ≤ b ≤ c dos três eixos (Zhao 2005). */
export function eikonalSolve(a0: number, b0: number, c0: number): number {
    const [a, b, c] = [a0, b0, c0].sort((p, q) => p - q) as [number, number, number];
    let d = a + 1;
    if (d > b) {
        d = 0.5 * (a + b + Math.sqrt(Math.max(0, 2 - (a - b) ** 2)));
        if (d > c) {
            const s = a + b + c;
            d = (s + Math.sqrt(Math.max(0, s * s - 3 * (a * a + b * b + c * c - 1)))) / 3;
        }
    }
    return d;
}

/**
 * Distância com sinal pelo método iterativo rápido (Jacobi; Zhao 2005): os voxels da interface (algum vizinho das faces
 * do outro lado de φ₀) guardam φ₀; os outros começam no teto e, a cada iteração, ficam com o menor entre o valor deles
 * e a solução da eikonal pelos vizinhos — a distância anda um voxel por iteração. Depois de `FIELD.iterations`, o que
 * não foi alcançado fica no teto (iterações + 1 voxels): um limite inferior da distância (os passos da marcha seguros).
 */
export function eikonal(
    phi0: Float32Array,
    dims: readonly [number, number, number],
    voxel: number,
): Float32Array {
    const [nx, ny, nz] = dims;
    const at = (x: number, y: number, z: number): number =>
        Math.min(nx - 1, Math.max(0, x))
        + nx * (Math.min(ny - 1, Math.max(0, y)) + ny * Math.min(nz - 1, Math.max(0, z)));
    const cap = (FIELD.iterations + 1) * voxel;
    const frozen = new Uint8Array(phi0.length);
    let phi = new Float32Array(phi0.length);
    const offsets = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
    ] as const;
    for (let z = 0; z < nz; z++)
        for (let y = 0; y < ny; y++)
            for (let x = 0; x < nx; x++) {
                const i = at(x, y, z);
                const p = phi0[i]!;
                const inside = p <= 0;
                // Interface: em cada eixo, a fração do voxel até o cruzamento com um vizinho do outro lado (a menor);
                // a distância ao plano pelos cruzamentos, 1 / √(Σ 1/θ²) (Chopp).
                let inv = 0;
                for (let a = 0; a < 3; a++) {
                    let theta = Infinity;
                    for (const sgn of [1, -1]) {
                        const o = offsets[2 * a + (sgn > 0 ? 0 : 1)]!;
                        const q = phi0[at(x + o[0], y + o[1], z + o[2])]!;
                        if (q <= 0 !== inside) theta = Math.min(theta, p / (p - q));
                    }
                    if (theta < Infinity) inv += 1 / Math.max(theta, 1e-6) ** 2;
                }
                frozen[i] = inv > 0 ? 1 : 0;
                phi[i] =
                    inv > 0 ? (inside ? -1 : 1) * (voxel / Math.sqrt(inv)) : inside ? -cap : cap;
            }
    for (let it = 0; it < FIELD.iterations; it++) {
        const next = Float32Array.from(phi);
        for (let z = 0; z < nz; z++)
            for (let y = 0; y < ny; y++)
                for (let x = 0; x < nx; x++) {
                    const i = at(x, y, z);
                    if (frozen[i] === 1) continue;
                    const m = (dx: number, dy: number, dz: number): number =>
                        Math.min(
                            Math.abs(phi[at(x + dx, y + dy, z + dz)]!),
                            Math.abs(phi[at(x - dx, y - dy, z - dz)]!),
                        ) / voxel;
                    const d = eikonalSolve(m(1, 0, 0), m(0, 1, 0), m(0, 0, 1)) * voxel;
                    const c = phi[i]!;
                    next[i] = Math.sign(c) * Math.min(Math.abs(c), d);
                }
        phi = next;
    }
    return phi;
}

/** Pesos da B-spline cúbica uniforme para a fração `t` (e as derivadas). */
function bspline(t: number): { w: number[]; d: number[] } {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
        w: [
            (1 - t) ** 3 / 6,
            (3 * t3 - 6 * t2 + 4) / 6,
            (-3 * t3 + 3 * t2 + 3 * t + 1) / 6,
            t3 / 6,
        ],
        d: [-((1 - t) ** 2) / 2, (3 * t2 - 4 * t) / 2, (-3 * t2 + 2 * t + 1) / 2, t2 / 2],
    };
}

/** φ e ∇φ pela B-spline tricúbica no ponto de mundo `p`. */
export function sampleField(grid: FieldGrid, p: Vec3): { phi: number; grad: Vec3 } {
    const g = [0, 1, 2].map((k) => (p[k]! - grid.origin[k]!) / grid.voxel);
    const base = g.map((v) => Math.floor(v));
    const b = g.map((v, k) => bspline(v - base[k]!));
    const [nx, ny, nz] = grid.dims;
    const read = (x: number, y: number, z: number): number =>
        grid.phi[
            Math.min(nx - 1, Math.max(0, x))
                + nx * (Math.min(ny - 1, Math.max(0, y)) + ny * Math.min(nz - 1, Math.max(0, z)))
        ]!;
    let phi = 0;
    const grad = [0, 0, 0];
    for (let k = 0; k < 4; k++)
        for (let j = 0; j < 4; j++)
            for (let i = 0; i < 4; i++) {
                const v = read(base[0]! + i - 1, base[1]! + j - 1, base[2]! + k - 1);
                const [wx, wy, wz] = [b[0]!.w[i]!, b[1]!.w[j]!, b[2]!.w[k]!];
                phi += v * wx * wy * wz;
                grad[0]! += v * b[0]!.d[i]! * wy * wz;
                grad[1]! += v * wx * b[1]!.d[j]! * wz;
                grad[2]! += v * wx * wy * b[2]!.d[k]!;
            }
    return { phi, grad: grad.map((v) => v / grid.voxel) as unknown as Vec3 };
}

/**
 * Marcha do raio (origem, direção unitária) contra o campo até `tMax`: passos pela distância (φ é distância com sinal na
 * faixa; fora dela, o passo da faixa), o cruzamento refinado por secante; o ponto e a normal (∇φ normalizado).
 */
export function marchField(
    grid: FieldGrid,
    origin: Vec3,
    dir: Vec3,
    tMax: number,
): { t: number; p: Vec3; n: Vec3 } | null {
    const minStep = 0.25 * grid.voxel;
    let t = 0;
    let prev = sampleField(grid, origin).phi;
    let tPrev = 0;
    if (prev <= 0) return null;
    while (t < tMax) {
        t += Math.max(prev * 0.9, minStep);
        const p: Vec3 = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
        const s = sampleField(grid, p).phi;
        if (s <= 0) {
            // Secante entre o último passo fora e este dentro.
            let [a, fa, b, fb] = [tPrev, prev, t, s];
            for (let k = 0; k < 6; k++) {
                const m = a + (b - a) * (fa / (fa - fb));
                const pm: Vec3 = [
                    origin[0] + dir[0] * m,
                    origin[1] + dir[1] * m,
                    origin[2] + dir[2] * m,
                ];
                const fm = sampleField(grid, pm).phi;
                if (fm > 0) [a, fa] = [m, fm];
                else [b, fb] = [m, fm];
            }
            const tc = a + (b - a) * (fa / (fa - fb));
            const pc: Vec3 = [
                origin[0] + dir[0] * tc,
                origin[1] + dir[1] * tc,
                origin[2] + dir[2] * tc,
            ];
            const g = sampleField(grid, pc).grad;
            const l = Math.hypot(...g) || 1;
            return { t: tc, p: pc, n: [g[0] / l, g[1] / l, g[2] / l] };
        }
        tPrev = t;
        prev = s;
    }
    return null;
}
