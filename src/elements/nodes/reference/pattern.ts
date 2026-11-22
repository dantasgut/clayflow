// Referência da CPU dos nós de padrão (spec 038): a posição `p·scale + offset` arredondada ao f32 como na GPU (as
// amostras usam escalas potências de 2: o produto é exato em f32, com ou sem FMA), a onda quadrada e a média dela sobre
// a largura em f64. Tolerância (`|gpu − ref| ≤ tol · max(1, |ref|)`) 1e-4: a diferença das larguras em f32 dividida pela
// largura (≥ 0,02 célula nas amostras com filtro); sem filtro, exato.
//
// Padrões com relevo (spec 011: grão, células, anéis, trama): a coordenada `p · frequência` arredondada ao f32 como na
// GPU (a célula e a posição dentro dela saem iguais; as amostras usam frequências exatas em f32), o resto em f64.
// Tolerância 2e-3: os gradientes multiplicam pela frequência (até 32) o erro de f32 da posição dentro da célula (~4e-6
// com `p` até 4 e frequência 8) vezes a inclinação dos perfis (até 12 / largura do sulco).
import { hash2, hashSigned, pcgHash } from '../../math/reference/random';
import { num, uniform, vec, vector, type NodeCase, type NodeValues } from './cases';

const f32 = Math.fround;
const fract = (x: number): number => x - Math.floor(x);

/** `node_pattern_square` num eixo: a onda quadrada (±1, período 2) média sobre [q − w/2, q + w/2]. */
export function patternSquare(q: number, w: number): number {
    if (w < 1e-4) return fract(q * 0.5) < 0.5 ? 1 : -1;
    const tri = (x: number): number => Math.abs(fract(x * 0.5) - 0.5);
    return (2 * (tri(q - 0.5 * w) - tri(q + 0.5 * w))) / w;
}

/** `pattern.checker2`: o xadrez 2D em [0, 1] (0 nas casas pares), filtrado pela largura. */
export function patternChecker2(
    p: readonly number[],
    width: number,
    scale: number,
    offset: readonly number[],
): number {
    const w = Math.max(width, 0) * Math.abs(scale);
    const s = [0, 1].map((k) => patternSquare(f32(p[k]! * scale + offset[k]!), w));
    return 0.5 - 0.5 * s[0]! * s[1]!;
}

/** `pattern.checker3`: o xadrez 3D (sólido) em [0, 1], filtrado pela largura. */
export function patternChecker3(
    p: readonly number[],
    width: number,
    scale: number,
    offset: readonly number[],
): number {
    const w = Math.max(width, 0) * Math.abs(scale);
    const s = [0, 1, 2].map((k) => patternSquare(f32(p[k]! * scale + offset[k]!), w));
    return 0.5 - 0.5 * s[0]! * s[1]! * s[2]!;
}

type V2 = readonly [number, number];

const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
const mix = (a: number, b: number, t: number): number => a * (1 - t) + b * t;
/** `node_pattern_band`: 1 abaixo de 0,2 célula por pixel, 0 acima de 0,5 (o limite de Nyquist). */
const band = (w: number): number => 1 - smooth(clamp01((w - 0.2) / 0.3));
const unit24 = (h: number): number => (h >>> 8) / 16777215;

/** `node_pattern_fit`: (frequência, células por período) — inteiro múltiplo de `step` em `wrap`, ou (`scale`, 0). */
function fit(scale: number, wrap: number, step: number): V2 {
    if (wrap <= 0) return [scale, 0];
    // `round` do WGSL: meio para o par (as amostras não caem em meios).
    const n = Math.max(Math.round((scale * wrap) / step), 1) * step;
    return [f32(n / wrap), n];
}

/** `node_pattern_index`: o índice u32 da célula, reduzido módulo `n` quando há período. */
const index = (i: number, n: number): number => (n > 0 ? i - n * Math.floor(i / n) : i | 0) >>> 0;

/** `node_pattern_hash`: o hash da célula com período por eixo e a semente. */
function cellHash(ix: number, iy: number, per: V2, seed: number): number {
    return hash2(
        (index(ix, per[0]) + Math.imul(seed, 0x9e3779b1)) >>> 0,
        (index(iy, per[1]) + Math.imul(seed, 0x85ebca77)) >>> 0,
    );
}

const D = 0.70710678;
const DIRS: readonly V2[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [D, D],
    [-D, D],
    [D, -D],
    [-D, -D],
];

/** `node_pattern_noise`: o ruído de gradiente 2D em `q` (já em f32) e a derivada — (valor, ∂/∂x, ∂/∂y). */
export function patternNoise(q: V2, per: V2, seed: number): [number, number, number] {
    const ix = Math.floor(q[0]);
    const iy = Math.floor(q[1]);
    const fx = q[0] - ix;
    const fy = q[1] - iy;
    const g = (dx: number, dy: number): V2 => DIRS[cellHash(ix + dx, iy + dy, per, seed) & 7]!;
    const [ga, gb, gd, ge] = [g(0, 0), g(1, 0), g(0, 1), g(1, 1)];
    const a = ga[0] * fx + ga[1] * fy;
    const b = gb[0] * (fx - 1) + gb[1] * fy;
    const d = gd[0] * fx + gd[1] * (fy - 1);
    const e = ge[0] * (fx - 1) + ge[1] * (fy - 1);
    const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
    const dfade = (t: number): number => 30 * t * t * (t * (t - 2) + 1);
    const ux = fade(fx);
    const uy = fade(fy);
    const value = mix(mix(a, b, ux), mix(d, e, ux), uy);
    const gx =
        mix(mix(ga[0], gb[0], ux), mix(gd[0], ge[0], ux), uy) + dfade(fx) * mix(b - a, e - d, uy);
    const gy =
        mix(mix(ga[1], gb[1], ux), mix(gd[1], ge[1], ux), uy)
        + dfade(fy) * (mix(d, e, ux) - mix(a, b, ux));
    return [1.41421356 * value, 1.41421356 * gx, 1.41421356 * gy];
}

/** `pattern.grain`: o fBm 2D anisotrópico e o gradiente dele. */
export function patternGrain(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: readonly number[],
    seed: number,
    octaves: number,
    lacunarity: number,
    gain: number,
): { value: number; gradient: number[] } {
    let freq: V2 = [scale[0]!, scale[1]!];
    let amp = 1;
    let norm = 0;
    const sum = [0, 0, 0];
    const n = Math.min(8, Math.max(1, octaves));
    for (let k = 0; k < n; k++) {
        const fx = fit(freq[0], wrap[0]!, 1);
        const fy = fit(freq[1], wrap[1]!, 1);
        const v = patternNoise(
            [f32(p[0]! * fx[0]), f32(p[1]! * fy[0])],
            [fx[1], fy[1]],
            (seed + k) >>> 0,
        );
        const b = width > 0 ? band(width * Math.max(Math.abs(fx[0]), Math.abs(fy[0]))) : 1;
        sum[0]! += amp * b * v[0];
        sum[1]! += amp * b * v[1] * fx[0];
        sum[2]! += amp * b * v[2] * fy[0];
        norm += amp;
        amp = f32(amp * gain);
        freq = [f32(freq[0] * lacunarity), f32(freq[1] * lacunarity)];
    }
    return { value: sum[0]! / norm, gradient: [sum[1]! / norm, sum[2]! / norm] };
}

/** `pattern.cells`: o Voronoi 2D com a altura do sulco, o gradiente e os valores da célula. */
export function patternCells(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: number,
    jitter: number,
    crease: number,
    seed: number,
): { height: number; gradient: number[]; cell: number; random: number[] } {
    const fx = fit(scale, wrap[0]!, 1);
    const fy = fit(scale, wrap[1]!, 1);
    const per: V2 = [fx[1], fy[1]];
    const q: V2 = [f32(p[0]! * fx[0]), f32(p[1]! * fy[0])];
    const ix = Math.floor(q[0]);
    const iy = Math.floor(q[1]);
    const f: V2 = [q[0] - ix, q[1] - iy];
    const point = (ox: number, oy: number): { r: V2; h: number } => {
        const h = cellHash(ix + ox, iy + oy, per, seed);
        return {
            r: [
                ox + 0.5 + jitter * 0.5 * hashSigned(h) - f[0],
                oy + 0.5 + jitter * 0.5 * hashSigned(pcgHash(h)) - f[1],
            ],
            h,
        };
    };
    let best = 1e30;
    let r1: V2 = [0, 0];
    let o1: V2 = [0, 0];
    let h1 = 0;
    for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
            const c = point(dx, dy);
            const d = c.r[0] * c.r[0] + c.r[1] * c.r[1];
            if (d < best) {
                best = d;
                r1 = c.r;
                o1 = [dx, dy];
                h1 = c.h;
            }
        }
    let edge = 1e30;
    let nrm: V2 = [0, 0];
    for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const c = point(o1[0] + dx, o1[1] + dy);
            const dr: V2 = [c.r[0] - r1[0], c.r[1] - r1[1]];
            const l2 = dr[0] * dr[0] + dr[1] * dr[1];
            if (l2 <= 1e-12) continue;
            const dn: V2 = [dr[0] / Math.sqrt(l2), dr[1] / Math.sqrt(l2)];
            const d = 0.5 * ((r1[0] + c.r[0]) * dn[0] + (r1[1] + c.r[1]) * dn[1]);
            if (d < edge) {
                edge = d;
                nrm = dn;
            }
        }
    const cw = Math.max(crease, 1e-4);
    const t = clamp01(edge / cw);
    const k = width > 0 ? band(width * Math.max(Math.abs(fx[0]), Math.abs(fy[0]))) : 1;
    const slope = (k * 6 * t * (1 - t)) / cw;
    const h2 = pcgHash(h1);
    return {
        height: mix(1 - Math.min(cw, 1), smooth(t), k),
        gradient: [-slope * nrm[0] * fx[0], -slope * nrm[1] * fy[0]],
        cell: mix(0.5, unit24(h1), k),
        random: [k * hashSigned(h2), k * hashSigned(pcgHash(h2))],
    };
}

/**
 * `pattern.rings`: o perfil dos anéis de crescimento, o gradiente e o valor do anel; `irregularity` a variação da
 * largura de ano para ano, `waviness` a ondulação do raio pelo ruído(p · `wavinessScale`).
 */
export function patternRings(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: number,
    depth: number,
    distortion: number,
    distortionScale: readonly number[],
    seed: number,
    irregularity = 0,
    waviness = 0,
    wavinessScale: readonly number[] = [3, 12],
): { value: number; gradient: number[]; ring: number } {
    const fx = fit(distortionScale[0]!, wrap[0]!, 1);
    const fr: V2 = [fx[0], distortionScale[1]!];
    const nz = patternNoise([f32(p[0]! * fr[0]), f32(p[1]! * fr[1])], [fx[1], 0], seed);
    const z = depth + distortion * nz[0];
    const wx = fit(wavinessScale[0]!, wrap[0]!, 1);
    const wr: V2 = [wx[0], wavinessScale[1]!];
    const nw = patternNoise([f32(p[0]! * wr[0]), f32(p[1]! * wr[1])], [wx[1], 0], seed + 1);
    const y = p[1]!;
    const r0 = Math.max(Math.sqrt(y * y + z * z), 1e-6);
    const r = Math.max(r0 + waviness * nw[0], 1e-6);
    const dr: V2 = [
        (z * distortion * nz[1] * fr[0]) / r0 + waviness * nw[1] * wr[0],
        (y + z * distortion * nz[2] * fr[1]) / r0 + waviness * nw[2] * wr[1],
    ];
    // O raio em anéis em f32, como na GPU: o anel (`floor`) e a posição dentro dele saem iguais.
    const s0 = f32(f32(r) * scale);
    const irr = clamp01(irregularity);
    const ni = patternNoise([f32(s0 * 0.1875), 0.5], [0, 0], seed + 2);
    const s = f32(s0 + irr * ni[0]);
    const ds = scale * (1 + irr * 0.1875 * ni[1]);
    const ring = Math.floor(s);
    const t = s - ring;
    const ta = clamp01(t / 0.7);
    const tb = clamp01((t - 0.88) / 0.12);
    const a = smooth(ta);
    const b = 1 - smooth(tb);
    const dv = ((6 * ta * (1 - ta)) / 0.7) * b - a * ((6 * tb * (1 - tb)) / 0.12);
    const k = width > 0 ? band(width * Math.abs(ds) * Math.hypot(dr[0], dr[1])) : 1;
    const h = pcgHash(((ring | 0) ^ Math.imul(seed, 0x9e3779b1)) >>> 0);
    return {
        value: mix(0.59, a * b, k),
        gradient: [k * dv * ds * dr[0], k * dv * ds * dr[1]],
        ring: mix(0.5, unit24(h), k),
    };
}

/** `pattern.weave`: a trama (altura, gradiente, urdidura à vista, valor do fio, vão). */
export function patternWeave(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: number,
    over: number,
    under: number,
    shift: number,
    gap: number,
    seed: number,
): { height: number; gradient: number[]; warp: number; thread: number; gap: number } {
    const ov = Math.max(over, 1);
    const m = ov + Math.max(under, 1);
    const fx = fit(scale, wrap[0]!, m);
    const fy = fit(scale, wrap[1]!, m);
    const q: V2 = [f32(p[0]! * fx[0]), f32(p[1]! * fy[0])];
    const ix = Math.floor(q[0]);
    const iy = Math.floor(q[1]);
    const f: V2 = [q[0] - ix - 0.5, q[1] - iy - 0.5];
    const g = Math.min(0.9, Math.max(0, gap));
    const hw = 0.5 * (1 - g);
    const inside = [Math.abs(f[0]) < hw, Math.abs(f[1]) < hw] as const;
    const section = f.map((c, k) => (inside[k] ? 1 - (c * c) / (hw * hw) : 0)) as [number, number];
    const slope = f.map((c, k) => (inside[k] ? (-2 * c) / (hw * hw) : 0)) as [number, number];
    const top = (i: number, j: number): number => {
        const s = j + shift * i;
        return s - m * Math.floor(s / m) + 0.5 < ov ? 1 : 0;
    };
    const dive = (t: number): V2 => {
        const u = clamp01(2 * t);
        return [smooth(u), 12 * u * (1 - u)];
    };
    const warpTop = top(ix, iy);
    let hTop: number;
    let gTop: V2;
    let hLow: number;
    let gLow: V2;
    if (warpTop > 0.5) {
        const wn = 1 - top(ix, iy + 1);
        const wp = 1 - top(ix, iy - 1);
        const next = dive(f[1]);
        const prev = dive(-f[1]);
        const along = 1 - 0.55 * (next[0] * wn + prev[0] * wp);
        hTop = section[0] * along;
        gTop = [slope[0] * along, section[0] * -0.55 * (next[1] * wn - prev[1] * wp)];
        hLow = 0.45 * section[1];
        gLow = [0, 0.45 * slope[1]];
    } else {
        const wn = top(ix + 1, iy);
        const wp = top(ix - 1, iy);
        const next = dive(f[0]);
        const prev = dive(-f[0]);
        const along = 1 - 0.55 * (next[0] * wn + prev[0] * wp);
        hTop = section[1] * along;
        gTop = [section[1] * -0.55 * (next[1] * wn - prev[1] * wp), slope[1] * along];
        hLow = 0.45 * section[0];
        gLow = [0.45 * slope[0], 0];
    }
    const upper = hTop >= hLow;
    const warp = upper ? warpTop : 1 - warpTop;
    const thread =
        warp > 0.5 ? cellHash(ix, -1, [fx[1], 0], seed) : cellHash(-1, iy, [0, fy[1]], seed);
    const k = width > 0 ? band(width * Math.max(Math.abs(fx[0]), Math.abs(fy[0]))) : 1;
    const grad = upper ? gTop : gLow;
    return {
        height: mix(0.5, upper ? hTop : hLow, k),
        gradient: [k * grad[0] * fx[0], k * grad[1] * fy[0]],
        warp: mix(ov / m, warp, k),
        thread: mix(0.5, unit24(thread), k),
        gap: mix(g * g, !inside[0] && !inside[1] ? 1 : 0, k),
    };
}

/**
 * Amostra comum dos padrões com relevo: `p` em [-4, 4]; a largura (um terço sem filtro); o período — um quarto das
 * amostras com período 2 ou 4 por eixo (frequência = células inteiras / período, exata em f32).
 */
function relief(random: () => number, k: number): NodeValues {
    return {
        p: vector(random, 2, -4, 4),
        width: k % 3 === 0 ? 0 : uniform(random, 0.005, 0.2),
        wrap: k % 4 === 1 ? [2, 4] : [0, 0],
    };
}

/** Amostra: `p` em [-4, 4], escala potência de 2, deslocamento, e a largura (um terço sem filtro). */
function sample(random: () => number, k: number, n: number): NodeValues {
    const scale = [1, 2, 4, 8][k % 4]!;
    return {
        p: vector(random, n, -4, 4),
        width: k % 3 === 0 ? 0 : uniform(random, 0.02, 0.6) / scale,
        scale,
        offset: vector(random, n, -1, 1),
    };
}

export const patternCases: readonly NodeCase[] = [
    {
        node: 'pattern.checker2',
        tolerance: 1e-4,
        sample: (r, k) => sample(r, k, 2),
        reference: (x) => ({
            value: patternChecker2(vec(x.p), num(x.width), num(x.scale), vec(x.offset)),
        }),
    },
    {
        node: 'pattern.checker3',
        tolerance: 1e-4,
        sample: (r, k) => sample(r, k, 3),
        reference: (x) => ({
            value: patternChecker3(vec(x.p), num(x.width), num(x.scale), vec(x.offset)),
        }),
    },
    {
        node: 'pattern.grain',
        tolerance: 2e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [
                [1, 1],
                [2, 8],
                [4, 0.5],
                [8, 2],
            ][k % 4]!,
            seed: k % 5,
            octaves: 1 + (k % 4),
            lacunarity: 2,
            gain: uniform(r, 0.3, 0.7),
        }),
        reference: (x) =>
            patternGrain(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                vec(x.scale),
                num(x.seed),
                num(x.octaves),
                num(x.lacunarity),
                num(x.gain),
            ),
    },
    {
        node: 'pattern.cells',
        tolerance: 2e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [1, 2, 4, 8][k % 4]!,
            jitter: uniform(r, 0, 1),
            crease: uniform(r, 0.05, 0.4),
            seed: k % 5,
        }),
        reference: (x) =>
            patternCells(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                num(x.scale),
                num(x.jitter),
                num(x.crease),
                num(x.seed),
            ),
    },
    {
        node: 'pattern.rings',
        tolerance: 2e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [1, 2, 4, 8][k % 4]!,
            depth: uniform(r, 0.2, 1),
            distortion: uniform(r, 0, 0.3),
            distortion_scale: [
                [1, 0.5],
                [2, 1],
                [0.5, 2],
            ][k % 3]!,
            seed: k % 5,
            irregularity: k % 2 === 0 ? 0 : uniform(r, 0, 1),
            waviness: k % 3 === 0 ? 0 : uniform(r, 0, 0.05),
            waviness_scale: [
                [2, 4],
                [1, 8],
            ][k % 2]!,
        }),
        reference: (x) =>
            patternRings(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                num(x.scale),
                num(x.depth),
                num(x.distortion),
                vec(x.distortion_scale),
                num(x.seed),
                num(x.irregularity),
                num(x.waviness),
                vec(x.waviness_scale),
            ),
    },
    {
        node: 'pattern.weave',
        tolerance: 2e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [1, 2, 4, 8][k % 4]!,
            over: [1, 3, 4, 2][k % 4]!,
            under: [1, 1, 1, 2][k % 4]!,
            shift: [1, 1, 2, 1][k % 4]!,
            gap: uniform(r, 0, 0.5),
            seed: k % 5,
        }),
        reference: (x) =>
            patternWeave(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                num(x.scale),
                num(x.over),
                num(x.under),
                num(x.shift),
                num(x.gap),
                num(x.seed),
            ),
    },
];
