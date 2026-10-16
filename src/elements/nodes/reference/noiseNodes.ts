// Referência da CPU dos nós de ruído (spec 031, R12) sobre a referência da `wgslLib.noise` (`noise.ts`): a posição
// `p·scale + offset` (e a de cada oitava do fBm) arredondada ao f32 como na GPU, a célula e o deslocamento da semente em
// aritmética inteira u32 — exatos, iguais aos da GPU —, a interpolação em f64. Mesma semente, mesma saída. Tolerância
// (`|gpu − ref| ≤ tol · max(1, |ref|)`) 1e-5 em todos: a interpolação em f32 contra f64. As amostras usam escalas
// potências de 2 (o produto `p·scale` é exato em f32, com ou sem FMA na GPU).
import {
    gradientNoise2Cell,
    gradientNoise3Cell,
    hash3,
    hashSigned,
    noiseCell,
    noiseFract,
    pcgHash,
    valueNoise2Cell,
    valueNoise3Cell,
} from './noise';
import { num, uniform, vec, vector, type NodeCase, type NodeValues } from './cases';

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];

/** Constantes de mistura do deslocamento da semente (`node_noise_seed*`). */
const SEED_MIX = [0x9e3779b1, 0x85ebca77, 0xc2b2ae3d] as const;

/** `node_noise_seed*`: a semente vezes as constantes, em u32. */
function seedOffset(seed: number, axis: number): number {
    return Math.imul(seed >>> 0, SEED_MIX[axis]!) >>> 0;
}

/** Célula (u32, deslocada pela semente) e posição dentro dela de `q`. */
function cell3(q: Vec3, seed: number): { c: [number, number, number]; f: Vec3 } {
    return {
        c: [0, 1, 2].map((k) => (noiseCell(q[k]!) + seedOffset(seed, k)) >>> 0) as [
            number,
            number,
            number,
        ],
        f: [noiseFract(q[0]), noiseFract(q[1]), noiseFract(q[2])],
    };
}

const f32 = Math.fround;
const scaled3 = (p: Vec3, scale: number, offset: Vec3): Vec3 => [
    f32(p[0] * scale + offset[0]),
    f32(p[1] * scale + offset[1]),
    f32(p[2] * scale + offset[2]),
];

/** `noise.value2`: ruído de valor 2D com semente, em [-1, 1]. */
function noiseValue2(p: Vec2, scale: number, offset: Vec2, seed = 0): number {
    const q = [f32(p[0] * scale + offset[0]), f32(p[1] * scale + offset[1])] as const;
    return valueNoise2Cell(
        (noiseCell(q[0]) + seedOffset(seed, 0)) >>> 0,
        (noiseCell(q[1]) + seedOffset(seed, 1)) >>> 0,
        noiseFract(q[0]),
        noiseFract(q[1]),
    );
}

/** `noise.gradient2`: ruído de gradiente 2D com semente, em [-1, 1]. */
export function noiseGradient2(p: Vec2, scale: number, offset: Vec2, seed = 0): number {
    const q = [f32(p[0] * scale + offset[0]), f32(p[1] * scale + offset[1])] as const;
    return gradientNoise2Cell(
        (noiseCell(q[0]) + seedOffset(seed, 0)) >>> 0,
        (noiseCell(q[1]) + seedOffset(seed, 1)) >>> 0,
        noiseFract(q[0]),
        noiseFract(q[1]),
    );
}

/** `noise.value3`: ruído de valor 3D com semente, em [-1, 1]. */
export function noiseValue3(p: Vec3, scale: number, offset: Vec3, seed = 0): number {
    const { c, f } = cell3(scaled3(p, scale, offset), seed);
    return valueNoise3Cell(c, f);
}

/** `noise.gradient3`: ruído de gradiente 3D com semente (0: o `gradient_noise3` da biblioteca), em [-1, 1]. */
export function noiseGradient3(p: Vec3, scale: number, offset: Vec3, seed = 0): number {
    const { c, f } = cell3(scaled3(p, scale, offset), seed);
    return gradientNoise3Cell(c, f);
}

/** `noise.cellular3`: distâncias ao ponto mais próximo e ao segundo, e o valor em [0, 1] da célula mais próxima. */
export function noiseCellular3(
    p: Vec3,
    scale: number,
    offset: Vec3,
    seed: number,
    jitter: number,
): { f1: number; f2: number; cell: number } {
    const { c, f } = cell3(scaled3(p, scale, offset), seed);
    let d1 = 1e30;
    let d2 = 1e30;
    let h1 = 0;
    for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const o = [dx, dy, dz] as const;
                const h = hash3((c[0] + dx) >>> 0, (c[1] + dy) >>> 0, (c[2] + dz) >>> 0);
                const hy = pcgHash(h);
                const j = [hashSigned(h), hashSigned(hy), hashSigned(pcgHash(hy))].map(
                    (v) => 0.5 * v,
                );
                const r = o.map((ok, k) => ok + 0.5 + jitter * j[k]! - f[k]!);
                const d = r[0]! * r[0]! + r[1]! * r[1]! + r[2]! * r[2]!;
                if (d < d1) {
                    d2 = d1;
                    d1 = d;
                    h1 = h;
                } else if (d < d2) {
                    d2 = d;
                }
            }
        }
    }
    return { f1: Math.sqrt(d1), f2: Math.sqrt(d2), cell: (h1 >>> 8) / 16777215 };
}

/** `noise.fbm3`: oitavas do ruído de gradiente 3D (semente + k na oitava k), normalizado pela soma das amplitudes. */
export function noiseFbm3(
    p: Vec3,
    scale: number,
    offset: Vec3,
    seed: number,
    octaves: number,
    lacunarity: number,
    gain: number,
): number {
    let q = scaled3(p, scale, offset);
    let amp = 1;
    let sum = 0;
    let norm = 0;
    const n = Math.min(12, Math.max(1, octaves));
    for (let k = 0; k < n; k++) {
        const { c, f } = cell3(q, (seed + k) >>> 0);
        sum += amp * gradientNoise3Cell(c, f);
        norm += amp;
        amp *= gain;
        q = [f32(q[0] * lacunarity), f32(q[1] * lacunarity), f32(q[2] * lacunarity)];
    }
    return sum / norm;
}

/**
 * Entradas comuns: posição, escala (potência de 2), deslocamento e semente (as amostras ímpares com semente 0, o ruído da
 * biblioteca).
 */
function lattice(random: () => number, k: number, n: 2 | 3): NodeValues {
    return {
        p: vector(random, n, -4, 4),
        scale: 2 ** Math.floor(uniform(random, -1, 3)),
        offset: vector(random, n, -2, 2),
        seed: k % 2 === 0 ? Math.floor(uniform(random, 1, 1 << 20)) : 0,
    };
}

const v2 = (x: NodeValues, n: string): Vec2 => vec(x[n]) as unknown as Vec2;
const v3 = (x: NodeValues, n: string): Vec3 => vec(x[n]) as unknown as Vec3;

/** Casos dos nós `noise.*`. */
export const noiseCases: readonly NodeCase[] = [
    {
        node: 'noise.value2',
        tolerance: 1e-5,
        sample: (r, k) => lattice(r, k, 2),
        reference: (x) => ({
            value: noiseValue2(v2(x, 'p'), num(x.scale), v2(x, 'offset'), num(x.seed)),
        }),
    },
    {
        node: 'noise.gradient2',
        tolerance: 1e-5,
        sample: (r, k) => lattice(r, k, 2),
        reference: (x) => ({
            value: noiseGradient2(v2(x, 'p'), num(x.scale), v2(x, 'offset'), num(x.seed)),
        }),
    },
    {
        node: 'noise.value3',
        tolerance: 1e-5,
        sample: (r, k) => lattice(r, k, 3),
        reference: (x) => ({
            value: noiseValue3(v3(x, 'p'), num(x.scale), v3(x, 'offset'), num(x.seed)),
        }),
    },
    {
        node: 'noise.gradient3',
        tolerance: 1e-5,
        sample: (r, k) => lattice(r, k, 3),
        reference: (x) => ({
            value: noiseGradient3(v3(x, 'p'), num(x.scale), v3(x, 'offset'), num(x.seed)),
        }),
    },
    {
        node: 'noise.cellular3',
        tolerance: 1e-5,
        sample: (r, k) => ({ ...lattice(r, k, 3), jitter: uniform(r, 0, 1) }),
        reference: (x) =>
            noiseCellular3(v3(x, 'p'), num(x.scale), v3(x, 'offset'), num(x.seed), num(x.jitter)),
    },
    {
        node: 'noise.fbm3',
        tolerance: 1e-5,
        sample: (r, k) => ({
            ...lattice(r, k, 3),
            octaves: 1 + (k % 8),
            lacunarity: uniform(r, 1.5, 2.5),
            gain: uniform(r, 0.3, 0.7),
        }),
        reference: (x) => ({
            value: noiseFbm3(
                v3(x, 'p'),
                num(x.scale),
                v3(x, 'offset'),
                num(x.seed),
                num(x.octaves),
                num(x.lacunarity),
                num(x.gain),
            ),
        }),
    },
];
