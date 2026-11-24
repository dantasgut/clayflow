// Referência da CPU dos nós de padrão (spec 038): a posição `p·scale + offset` arredondada ao f32 como na GPU (as
// amostras usam escalas potências de 2: o produto é exato em f32, com ou sem FMA), a onda quadrada e a média dela sobre
// a largura em f64. Tolerância (`|gpu − ref| ≤ tol · max(1, |ref|)`) 1e-4: a diferença das larguras em f32 dividida pela
// largura (≥ 0,02 célula nas amostras com filtro); sem filtro, exato.
//
// Padrões com relevo (spec 011: grão, células, anéis, trama, tijolos, tábuas, mossas): a coordenada `p · frequência` arredondada ao f32 como na
// GPU (a célula e a posição dentro dela saem iguais; as amostras usam frequências exatas em f32), o resto em f64.
// Tolerância 2e-3: os gradientes multiplicam pela frequência (até 32) o erro de f32 da posição dentro da célula (~4e-6
// com `p` até 4 e frequência 8) vezes a inclinação dos perfis (até 12 / largura do sulco).
import { hash2, hash3, hashSigned, pcgHash } from '../../math/reference/random';
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
    bend: readonly number[] = [0, 1],
): { value: number; gradient: number[] } {
    const tight = Math.max(1, Math.abs(bend[1]!));
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
        const b = width > 0 ? band(width * Math.max(Math.abs(fx[0]), Math.abs(fy[0]) * tight)) : 1;
        sum[0]! += amp * b * v[0];
        sum[1]! += amp * b * v[1] * fx[0];
        sum[2]! += amp * b * v[2] * fy[0];
        norm += amp;
        amp = f32(amp * gain);
        freq = [f32(freq[0] * lacunarity), f32(freq[1] * lacunarity)];
    }
    const gx = sum[1]! / norm;
    const gy = sum[2]! / norm;
    return { value: sum[0]! / norm, gradient: [gx + gy * bend[0]!, gy * bend[1]!] };
}

/** `node_pattern_brush_gouge`: um risco fundo isolado — (fundura, ∂/∂q.x, ∂/∂q.y). */
function brushGouge(q: V2, per: V2, seed: number, chance: number): [number, number, number] {
    const ix = Math.floor(q[0]);
    const iy = Math.floor(q[1]);
    const fx = q[0] - ix;
    const fy = q[1] - iy;
    const unit = (h: number): number => (h >>> 8) / 16777216;
    const h = cellHash(ix, iy, per, seed);
    if (unit(h) >= chance) return [0, 0, 0];
    const h2 = pcgHash(h);
    const h3 = pcgHash(h2);
    const slope = 0.5 * unit(h2) - 0.25;
    const yc = 0.3 + 0.4 * unit(h3) + slope * (fx - 0.5);
    const depth = 0.4 + 0.6 * unit(pcgHash(h3));
    const t = clamp01(Math.abs(fy - yc) / 0.09);
    const across = 1 - smooth(t);
    const e = clamp01(Math.min(fx, 1 - fx) / 0.25);
    const along = smooth(e);
    const dt = (fy >= yc ? 1 : -1) / 0.09;
    const dacross = -6 * t * (1 - t) * dt;
    const dalong = 6 * e * (1 - e) * (fx < 0.5 ? 4 : -4) * (e < 1 ? 1 : 0);
    return [
        depth * across * along,
        depth * (across * dalong - dacross * slope * along),
        depth * dacross * along,
    ];
}

/** `pattern.brush`: os riscos da escova (altura, gradiente, direção e risco fundo). */
export function patternBrush(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: readonly number[],
    spread: number,
    bendScale: readonly number[],
    deep: number,
    seed: number,
): { value: number; gradient: number[]; direction: number[]; deep: number } {
    const bx = fit(bendScale[0]!, wrap[0]!, 1);
    const by = fit(bendScale[1]!, wrap[1]!, 1);
    const reach = spread / (1.4 * Math.max(bx[0], 1e-6));
    const sum = [0, 0, 0];
    const dir = [0, 0];
    let norm = 0;
    let amp = 1;
    for (let k = 0; k < 4; k++) {
        const fx = fit(f32(scale[0]! * f32(1 + 0.5 * k)), wrap[0]!, 1);
        const fy = fit(f32(scale[1]! * f32(1 + 0.37 * k)), wrap[1]!, 1);
        const w = patternNoise(
            [f32(p[0]! * bx[0]), f32(p[1]! * by[0])],
            [bx[1], by[1]],
            (seed + 16 + k) >>> 0,
        );
        const slant: V2 = [reach * w[1] * bx[0], reach * w[2] * by[0]];
        const v = patternNoise(
            [f32(p[0]! * fx[0]), f32(f32(p[1]! + f32(reach * w[0])) * fy[0])],
            [fx[1], fy[1]],
            (seed + k) >>> 0,
        );
        const b = width > 0 ? band(width * Math.max(Math.abs(fx[0]), Math.abs(fy[0]))) : 1;
        sum[0]! += amp * b * v[0];
        sum[1]! += amp * b * (v[1] * fx[0] + v[2] * fy[0] * slant[0]);
        sum[2]! += amp * b * v[2] * fy[0] * (1 + slant[1]);
        const dl = Math.hypot(1 + slant[1], slant[0]);
        dir[0]! += (amp * (1 + slant[1])) / dl;
        dir[1]! += (amp * -slant[0]) / dl;
        norm += amp;
        amp = f32(amp * 0.8);
    }
    const out = [sum[0]! / norm, sum[1]! / norm, sum[2]! / norm];
    let gouge = 0;
    if (deep > 0) {
        for (let k = 0; k < 2; k++) {
            const gx = fit(f32(scale[0]! * f32(3 + 2 * k)), wrap[0]!, 1);
            const gy = fit(f32(scale[1]! * f32(0.17 + 0.08 * k)), wrap[1]!, 1);
            const g = brushGouge(
                [f32(f32(p[0]! * gx[0]) + 0.5 * k), f32(p[1]! * gy[0])],
                [gx[1], gy[1]],
                (seed + 32 + k) >>> 0,
                deep,
            );
            const b = width > 0 ? band(width * 5 * Math.abs(gy[0])) : 1;
            out[0]! -= 0.8 * b * g[0];
            out[1]! -= 0.8 * b * g[1] * gx[0];
            out[2]! -= 0.8 * b * g[2] * gy[0];
            gouge = Math.max(gouge, b * g[0]);
        }
    }
    const dl = Math.hypot(dir[0]!, dir[1]!);
    return {
        value: out[0]!,
        gradient: [out[1]!, out[2]!],
        direction: [dir[0]! / dl, dir[1]! / dl],
        deep: gouge,
    };
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
    knots = 0,
    knotSize = 0.04,
    knotRings = 6,
    fall = 0.12,
): {
    value: number;
    gradient: number[];
    ring: number;
    knot: number;
    along: number[];
    bend: number[];
} {
    const fx = fit(distortionScale[0]!, wrap[0]!, 1);
    const fr: V2 = [fx[0], distortionScale[1]!];
    const nz = patternNoise([f32(p[0]! * fr[0]), f32(p[1]! * fr[1])], [fx[1], 0], seed);
    const z = depth + distortion * nz[0];
    const wx = fit(wavinessScale[0]!, wrap[0]!, 1);
    const wr: V2 = [wx[0], wavinessScale[1]!];
    const nw = patternNoise([f32(p[0]! * wr[0]), f32(p[1]! * wr[1])], [wx[1], 0], seed + 1);
    const y = p[1]!;
    const r0 = Math.max(Math.sqrt(y * y + z * z), 1e-6);
    // Os nós da madeira: um monte gaussiano por nó somado ao raio, e o miolo de cada um.
    const bump = [0, 0, 0];
    let knot = 0;
    if (knots > 0) {
        const kx = fit(knots, wrap[0]!, 1);
        const kf: V2 = [kx[0], knots];
        const kix = Math.floor(f32(p[0]! * kf[0]));
        const kiy = Math.floor(f32(y * kf[1]));
        const sigma = Math.max(knotSize, 1e-4);
        const lift = knotRings / Math.max(scale, 1e-6);
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                const h = cellHash(kix + dx, kiy + dy, [kx[1], 0], seed + 3);
                if (unit24(h) >= 0.3) continue;
                const h2 = pcgHash(h);
                const ax = (kix + dx + 0.5 + 0.3 * hashSigned(h2)) / kf[0];
                const ay = (kiy + dy + 0.5 + 0.3 * hashSigned(pcgHash(h2))) / kf[1];
                const ex = (p[0]! - ax) / (sigma * 1.6);
                const ey = (y - ay) / sigma;
                const g = Math.exp(-(ex * ex + ey * ey));
                bump[0]! += lift * g;
                bump[1]! += (lift * g * -2 * ex) / (sigma * 1.6);
                bump[2]! += (lift * g * -2 * ey) / sigma;
                knot = Math.max(knot, Math.exp(-4 * (ex * ex + ey * ey)));
            }
    }
    const r = Math.max(r0 + waviness * nw[0] + bump[0]!, 1e-6);
    const dr: V2 = [
        (z * distortion * nz[1] * fr[0]) / r0 + waviness * nw[1] * wr[0] + bump[1]!,
        (y + z * distortion * nz[2] * fr[1]) / r0 + waviness * nw[2] * wr[1] + bump[2]!,
    ];
    // O raio em anéis em f32, como na GPU: o anel (`floor`) e a posição dentro dele saem iguais.
    const s0 = f32(f32(r) * scale);
    const irr = clamp01(irregularity);
    const ni = patternNoise([f32(s0 * 0.1875), 0.5], [0, 0], seed + 2);
    const s = f32(s0 + irr * ni[0]);
    const ds = scale * (1 + irr * 0.1875 * ni[1]);
    const ring = Math.floor(s);
    const t = s - ring;
    const fl = Math.min(0.6, Math.max(0.02, fall));
    const rise = (0.7 * (1 - fl)) / 0.88;
    const ta = clamp01(t / rise);
    const tb = clamp01((t - (1 - fl)) / fl);
    const a = smooth(ta);
    const b = 1 - smooth(tb);
    const dv = ((6 * ta * (1 - ta)) / rise) * b - a * ((6 * tb * (1 - tb)) / fl);
    const k = width > 0 ? band(width * Math.abs(ds) * Math.hypot(dr[0], dr[1])) : 1;
    const h = pcgHash(((ring | 0) ^ Math.imul(seed, 0x9e3779b1)) >>> 0);
    return {
        value: mix(1 - 0.5 * (rise + fl), a * b, k),
        gradient: [k * dv * ds * dr[0], k * dv * ds * dr[1]],
        ring: mix(0.5, unit24(h), k),
        knot,
        along: [p[0]!, r],
        bend: [dr[0], dr[1]],
    };
}

type V3 = readonly [number, number, number];

/** `node_pattern_dir3`: uma das 12 direções das arestas do cubo. */
function dir3(h: number): V3 {
    const k = (h >>> 4) % 12;
    const a = (k & 1) === 1 ? -1 : 1;
    const b = (k & 2) === 2 ? -1 : 1;
    if (k < 4) return [0, a, b];
    if (k < 8) return [a, 0, b];
    return [a, b, 0];
}

/** `node_pattern_noise3`: o ruído de gradiente 3D em `q` (já em f32) e a derivada — (valor, ∂/∂q). */
export function patternNoise3(q: V3, seed: number): [number, number, number, number] {
    const i = [Math.floor(q[0]), Math.floor(q[1]), Math.floor(q[2])];
    const f = [q[0] - i[0]!, q[1] - i[1]!, q[2] - i[2]!];
    const corner = (dx: number, dy: number, dz: number): { g: V3; a: number } => {
        const g = dir3(
            hash3(
                (((i[0]! + dx) | 0) + Math.imul(seed, 0x9e3779b1)) >>> 0,
                (((i[1]! + dy) | 0) + Math.imul(seed, 0x85ebca77)) >>> 0,
                (((i[2]! + dz) | 0) + Math.imul(seed, 0xc2b2ae3d)) >>> 0,
            ),
        );
        return { g, a: g[0] * (f[0]! - dx) + g[1] * (f[1]! - dy) + g[2] * (f[2]! - dz) };
    };
    const c000 = corner(0, 0, 0);
    const c100 = corner(1, 0, 0);
    const c010 = corner(0, 1, 0);
    const c110 = corner(1, 1, 0);
    const c001 = corner(0, 0, 1);
    const c101 = corner(1, 0, 1);
    const c011 = corner(0, 1, 1);
    const c111 = corner(1, 1, 1);
    const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
    const dfade = (t: number): number => 30 * t * t * (t * (t - 2) + 1);
    const [ux, uy, uz] = [fade(f[0]!), fade(f[1]!), fade(f[2]!)];
    const x00 = mix(c000.a, c100.a, ux);
    const x10 = mix(c010.a, c110.a, ux);
    const x01 = mix(c001.a, c101.a, ux);
    const x11 = mix(c011.a, c111.a, ux);
    const y0 = mix(x00, x10, uy);
    const y1 = mix(x01, x11, uy);
    const blend = (n: 0 | 1 | 2): number =>
        mix(
            mix(mix(c000.g[n], c100.g[n], ux), mix(c010.g[n], c110.g[n], ux), uy),
            mix(mix(c001.g[n], c101.g[n], ux), mix(c011.g[n], c111.g[n], ux), uy),
            uz,
        );
    return [
        mix(y0, y1, uz),
        blend(0)
            + dfade(f[0]!)
                * mix(
                    mix(c100.a - c000.a, c110.a - c010.a, uy),
                    mix(c101.a - c001.a, c111.a - c011.a, uy),
                    uz,
                ),
        blend(1) + dfade(f[1]!) * mix(x10 - x00, x11 - x01, uz),
        blend(2) + dfade(f[2]!) * (y1 - y0),
    ];
}

/** `pattern.grain3`: o fBm 3D anisotrópico e o gradiente dele. */
export function patternGrain3(
    p: readonly number[],
    width: number,
    scale: readonly number[],
    seed: number,
    octaves: number,
    lacunarity: number,
    gain: number,
): { value: number; gradient: number[] } {
    let freq = [scale[0]!, scale[1]!, scale[2]!];
    let amp = 1;
    let norm = 0;
    const sum = [0, 0, 0, 0];
    const n = Math.min(8, Math.max(1, octaves));
    for (let k = 0; k < n; k++) {
        const v = patternNoise3(
            [f32(p[0]! * freq[0]!), f32(p[1]! * freq[1]!), f32(p[2]! * freq[2]!)],
            seed + k,
        );
        const top = Math.max(Math.abs(freq[0]!), Math.abs(freq[1]!), Math.abs(freq[2]!));
        const b = width > 0 ? band(width * top) : 1;
        sum[0]! += amp * b * v[0];
        for (let c = 0; c < 3; c++) sum[c + 1]! += amp * b * v[c + 1]! * freq[c]!;
        norm += amp;
        amp *= gain;
        freq = freq.map((x) => f32(x * lacunarity));
    }
    return { value: sum[0]! / norm, gradient: [sum[1]! / norm, sum[2]! / norm, sum[3]! / norm] };
}

/** `pattern.trunk`: os anéis de crescimento no volume (perfil, gradiente, valor do anel, nó, coordenada da fibra). */
export function patternTrunk(
    p: readonly number[],
    width: number,
    scale: number,
    knots: number,
    seed: number,
    irregularity: number,
    waviness: number,
    wavinessScale: readonly number[],
    wander: number,
    wanderScale: number,
    knotSize: number,
    knotRings: number,
    fall: number,
): { value: number; gradient: number[]; ring: number; knot: number; along: number[] } {
    const [px, py, pz] = [p[0]!, p[1]!, p[2]!];
    const at = f32(py * wanderScale);
    const ma = patternNoise([at, 0.5], [0, 0], seed + 4);
    const mb = patternNoise([at, 7.5], [0, 0], seed + 5);
    const pith: V2 = [wander * ma[0], wander * mb[0]];
    const dpith: V2 = [wander * wanderScale * ma[1], wander * wanderScale * mb[1]];
    const q: V2 = [px - pith[0], pz - pith[1]];
    const r0 = Math.max(Math.hypot(q[0], q[1]), 1e-6);
    const dr0 = [q[0] / r0, -(q[0] * dpith[0] + q[1] * dpith[1]) / r0, q[1] / r0];
    const nw = patternNoise3(
        [f32(px * wavinessScale[0]!), f32(py * wavinessScale[1]!), f32(pz * wavinessScale[2]!)],
        seed + 1,
    );
    const bump = [0, 0, 0, 0];
    let knot = 0;
    if (knots > 0) {
        const ki = Math.floor(f32(py * knots));
        const sigma = Math.max(knotSize, 1e-4);
        const lift = knotRings / Math.max(scale, 1e-6);
        for (let d = -1; d <= 1; d++) {
            const c = ki + d;
            const h = hash2((c | 0) >>> 0, (seed + 3) >>> 0);
            if (unit24(h) >= 0.6) continue;
            const h2 = pcgHash(h);
            const h3 = pcgHash(h2);
            const phi = 2 * Math.PI * unit24(h2);
            const len = Math.hypot(Math.cos(phi), 0.35, Math.sin(phi));
            const dir = [Math.cos(phi) / len, 0.35 / len, Math.sin(phi) / len];
            const from = [pith[0], (c + 0.5 + 0.35 * hashSigned(h3)) / knots, pith[1]];
            const v = [px - from[0]!, py - from[1]!, pz - from[2]!];
            const t = v[0]! * dir[0]! + v[1]! * dir[1]! + v[2]! * dir[2]!;
            const perp = v.map((x, n) => x - t * dir[n]!);
            const e = (perp[0]! ** 2 + perp[1]! ** 2 + perp[2]! ** 2) / (sigma * sigma);
            const u = clamp01((t + sigma) / (2 * sigma));
            const w = smooth(u);
            const g = Math.exp(-e);
            bump[0]! += lift * g * w;
            for (let n = 0; n < 3; n++)
                bump[n + 1]! +=
                    lift
                    * (g * w * ((-2 * perp[n]!) / (sigma * sigma))
                        + g * ((6 * u * (1 - u)) / (2 * sigma)) * dir[n]!);
            knot = Math.max(knot, Math.exp(-4 * e) * w);
        }
    }
    const r = Math.max(r0 + waviness * nw[0] + bump[0]!, 1e-6);
    const dr = [0, 1, 2].map(
        (n) => dr0[n]! + waviness * nw[n + 1]! * wavinessScale[n]! + bump[n + 1]!,
    );
    const s0 = f32(f32(r) * scale);
    const irr = clamp01(irregularity);
    const ni = patternNoise([f32(s0 * 0.1875), 0.5], [0, 0], seed + 2);
    const s = f32(s0 + irr * ni[0]);
    const ds = scale * (1 + irr * 0.1875 * ni[1]);
    const ring = Math.floor(s);
    const t = s - ring;
    const fl = Math.min(0.6, Math.max(0.02, fall));
    const rise = (0.7 * (1 - fl)) / 0.88;
    const ta = clamp01(t / rise);
    const tb = clamp01((t - (1 - fl)) / fl);
    const a = smooth(ta);
    const b = 1 - smooth(tb);
    const dv = ((6 * ta * (1 - ta)) / rise) * b - a * ((6 * tb * (1 - tb)) / fl);
    const k = width > 0 ? band(width * Math.abs(ds) * Math.hypot(dr[0]!, dr[1]!, dr[2]!)) : 1;
    const h = pcgHash(((ring | 0) ^ Math.imul(seed, 0x9e3779b1)) >>> 0);
    return {
        value: mix(1 - 0.5 * (rise + fl), a * b, k),
        gradient: dr.map((x) => k * dv * ds * x),
        ring: mix(0.5, unit24(h), k),
        knot,
        along: [(q[0] * r) / r0, py, (q[1] * r) / r0],
    };
}

/** `pattern.iris`: as regiões do globo ocular (íris, pupila, limbo, fibras, posição radial, vasos). */
export function patternIris(
    p: readonly number[],
    width: number,
    iris: number,
    pupil: number,
    fibers: number,
    seed: number,
): {
    iris: number;
    pupil: number;
    limbus: number;
    fiber: number;
    radial: number;
    vein: number;
    bowl: number;
    gradient: number[];
    rim: number;
} {
    const l = Math.max(Math.hypot(p[0]!, p[1]!, p[2]!), 1e-6);
    const d = [f32(f32(p[0]!) / f32(l)), f32(f32(p[1]!) / f32(l)), f32(f32(p[2]!) / f32(l))];
    const rho = Math.hypot(d[0]!, d[2]!);
    const size = Math.max(iris, 1e-3);
    const t = rho / size;
    const edge = Math.max(0.02, width / (l * size));
    const front = d[1]! >= 0 ? 1 : 0;
    const step = (a: number, b: number, x: number): number => smooth(clamp01((x - a) / (b - a)));
    const disc = front * (1 - step(1 - edge, 1 + edge, t));
    const hole = front * (1 - step(pupil - edge, pupil + edge, t));
    const radial = clamp01((t - pupil) / Math.max(1 - pupil, 1e-3));
    const limbus = disc * step(0.78, 1, t);
    const n = Math.max(Math.round(fibers), 1);
    const turn = (Math.atan2(d[2]!, d[0]!) / (2 * Math.PI) + 0.5) * n;
    let fiber = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let k = 0; k < 3; k++) {
        fiber +=
            amp * patternNoise([f32(turn * f), f32(radial * 1.5 * f)], [n * f, 0], seed + k)[0];
        norm += amp;
        amp *= 0.55;
        f *= 2;
    }
    const at = (s: number): V3 => [f32(d[0]! * s), f32(d[1]! * s), f32(d[2]! * s)];
    const ridge = 1 - Math.abs(patternNoise3(at(5), seed + 7)[0]) * 6;
    const fine = 1 - Math.abs(patternNoise3(at(13), seed + 8)[0]) * 9;
    const far = clamp01(step(1.1, 2, t) + (1 - front));
    const vein = clamp01(Math.max(ridge, 0.6 * fine)) * far * (1 - disc);
    const u = clamp01((t - 0.35) / 0.65);
    const bowl = front * (1 - smooth(u));
    const r = Math.max(rho, 1e-6);
    const axial = [d[0]! / r, 0, d[2]! / r];
    const along = d[0]! * axial[0]! + d[2]! * axial[2]!;
    const slope = (-front * 6 * u * (1 - u)) / 0.65;
    const gradient = [0, 1, 2].map((n) => (slope * (axial[n]! - d[n]! * along)) / (l * size));
    return {
        iris: disc,
        pupil: hole,
        limbus,
        fiber: fiber / norm,
        radial,
        vein,
        bowl,
        gradient,
        rim: far * (1 - disc),
    };
}

/** `pattern.bricks`: as fiadas de peças com junta (altura, gradiente, valor da peça, junta). */
export function patternBricks(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: readonly number[],
    shift: number,
    gap: number,
    bevel: number,
    seed: number,
): { height: number; gradient: number[]; brick: number; mortar: number } {
    const fx = fit(scale[0]!, wrap[0]!, 1);
    const fy = fit(scale[1]!, wrap[1]!, shift !== 0 ? 2 : 1);
    const qy = f32(p[1]! * fy[0]);
    const row = Math.floor(qy);
    const qx = f32(f32(p[0]! * fx[0]) + shift * row);
    const col = Math.floor(qx);
    const f: V2 = [qx - col - 0.5, qy - row - 0.5];
    const g = Math.min(0.9, Math.max(0, gap));
    const aspect = fy[0] / fx[0];
    const ex = (0.5 - Math.abs(f[0])) * aspect - 0.5 * g;
    const ey = 0.5 - Math.abs(f[1]) - 0.5 * g;
    const d = Math.min(ex, ey);
    const bw = Math.max(bevel, 1e-4);
    const t = clamp01(d / bw);
    const k = width > 0 ? band(width * Math.max(Math.abs(fx[0]), Math.abs(fy[0]))) : 1;
    const slope = ((k * 6 * t * (1 - t)) / bw) * fy[0];
    const face = Math.max(1 - g, 0) * Math.max(1 - g / Math.max(aspect, 1e-6), 0);
    return {
        height: mix(face, smooth(t), k),
        gradient: ex < ey ? [-Math.sign(f[0]) * slope, 0] : [0, -Math.sign(f[1]) * slope],
        brick: mix(0.5, unit24(cellHash(col, row, [fx[1], fy[1]], seed)), k),
        mortar: mix(1 - face, d <= 0 ? 1 : 0, k),
    };
}

/** `pattern.planks`: as tábuas do assoalho (coordenada da peça, altura, gradiente, valor da peça, junta). */
export function patternPlanks(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: number,
    length: number,
    layout: number,
    gap: number,
    bevel: number,
    seed: number,
): { p: number[]; height: number; gradient: number[]; plank: number; joint: number } {
    const n = Math.max(Math.round(length), 1);
    const herring = layout === 1;
    const fx = fit(scale, wrap[0]!, herring ? 2 * n : n);
    const fy = fit(scale, wrap[1]!, herring ? 2 * n : 1);
    const q: V2 = [f32(p[0]! * fx[0]), f32(p[1]! * fy[0])];
    let id: V2;
    let local: V2;
    let turned = false;
    let per: V2;
    if (herring) {
        const cx = Math.floor(q[0]);
        const cy = Math.floor(q[1]);
        const m = cx - cy - 2 * n * Math.floor((cx - cy) / (2 * n));
        turned = m >= n;
        if (turned) {
            const first = cy - (2 * n - 1 - m);
            id = [cx, first];
            local = [q[1] - first, q[0] - cx];
        } else {
            id = [cx - m, cy];
            local = [q[0] - id[0], q[1] - cy];
        }
        per = [fx[1], fy[1]];
    } else {
        const row = Math.floor(q[1]);
        const shift = Math.floor(f32((n * (cellHash(-7, row, [0, fy[1]], seed) >>> 8)) / 16777216));
        const along = f32(f32(q[0] + shift) / n);
        id = [Math.floor(along), row];
        local = [f32((along - id[0]) * n), q[1] - row];
        per = [fx[1] / n, fy[1]];
    }
    const h = cellHash(id[0], id[1], per, seed + (turned ? 17 : 0));
    const h2 = pcgHash(h);
    const ex = Math.min(local[0], n - local[0]) - 0.5 * gap;
    const ey = Math.min(local[1], 1 - local[1]) - 0.5 * gap;
    const bw = Math.max(bevel, 1e-4);
    const d = Math.min(ex, ey);
    const t = clamp01(d / bw);
    const towardLocal: V2 =
        ex < ey ? [local[0] < 0.5 * n ? 1 : -1, 0] : [0, local[1] < 0.5 ? 1 : -1];
    const toward: V2 = turned ? [towardLocal[1], towardLocal[0]] : towardLocal;
    const k = width > 0 ? band(width * Math.max(Math.abs(fx[0]), Math.abs(fy[0]))) : 1;
    const slope = (k * 6 * t * (1 - t)) / bw;
    return {
        p: [
            local[0] / fx[0] + (16 * (h2 >>> 8)) / 16777216,
            local[1] / fx[0] + (2 * (pcgHash(h2) >>> 8)) / 16777216 - 1,
        ],
        height: mix(1, smooth(t), k),
        gradient: [slope * toward[0] * fx[0], slope * toward[1] * fy[0]],
        plank: mix(0.5, unit24(h), k),
        joint: k * (d <= 0 ? 1 : 0),
    };
}

/** `pattern.fissures`: as placas alongadas e a rede de fissuras (altura, gradiente, valor da placa). */
export function patternFissures(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: readonly number[],
    jitter: number,
    crease: number,
    seed: number,
): { height: number; gradient: number[]; plate: number } {
    const fx = fit(scale[0]!, wrap[0]!, 1);
    const fy = fit(scale[1]!, wrap[1]!, 1);
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
    const top = Math.max(Math.abs(fx[0]), Math.abs(fy[0]));
    let edge = 1e30;
    let slope: V2 = [0, 0];
    for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const c = point(o1[0] + dx, o1[1] + dy);
            const dr: V2 = [c.r[0] - r1[0], c.r[1] - r1[1]];
            const l2 = dr[0] * dr[0] + dr[1] * dr[1];
            if (l2 <= 1e-12) continue;
            const dn: V2 = [dr[0] / Math.sqrt(l2), dr[1] / Math.sqrt(l2)];
            const stretch = top / Math.max(Math.hypot(dn[0] * fx[0], dn[1] * fy[0]), 1e-6);
            const d = 0.5 * ((r1[0] + c.r[0]) * dn[0] + (r1[1] + c.r[1]) * dn[1]) * stretch;
            if (d < edge) {
                edge = d;
                slope = [-dn[0] * fx[0] * stretch, -dn[1] * fy[0] * stretch];
            }
        }
    const cw = Math.max(crease, 1e-4);
    const t = clamp01(edge / cw);
    const k = width > 0 ? band(width * top) : 1;
    const steep = (k * 6 * t * (1 - t)) / cw;
    return {
        height: mix(1 - Math.min(cw, 1), smooth(t), k),
        gradient: [steep * slope[0], steep * slope[1]],
        plate: mix(0.5, unit24(h1), k),
    };
}

/** `pattern.dents`: as mossas do metal martelado (altura 2 · d² presa em 1, gradiente, valor da mossa). */
export function patternDents(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: number,
    jitter: number,
    seed: number,
): { height: number; gradient: number[]; cell: number } {
    const fx = fit(scale, wrap[0]!, 1);
    const fy = fit(scale, wrap[1]!, 1);
    const per: V2 = [fx[1], fy[1]];
    const q: V2 = [f32(p[0]! * fx[0]), f32(p[1]! * fy[0])];
    const ix = Math.floor(q[0]);
    const iy = Math.floor(q[1]);
    const f: V2 = [q[0] - ix, q[1] - iy];
    let best = 1e30;
    let r1: V2 = [0, 0];
    let h1 = 0;
    for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
            const h = cellHash(ix + dx, iy + dy, per, seed);
            const r: V2 = [
                dx + 0.5 + jitter * 0.5 * hashSigned(h) - f[0],
                dy + 0.5 + jitter * 0.5 * hashSigned(pcgHash(h)) - f[1],
            ];
            const d = r[0] * r[0] + r[1] * r[1];
            if (d < best) {
                best = d;
                r1 = r;
                h1 = h;
            }
        }
    const k = width > 0 ? band(width * Math.max(Math.abs(fx[0]), Math.abs(fy[0]))) : 1;
    const inside = 2 * best < 1;
    return {
        height: mix(0.3, Math.min(2 * best, 1), k),
        gradient: inside ? [k * -4 * r1[0] * fx[0], k * -4 * r1[1] * fy[0]] : [0, 0],
        cell: mix(0.5, unit24(h1), k),
    };
}

/** `node_pattern_shingle_cross`: o perfil transversal da telha de capa e canal — (altura em [0, 1], ∂/∂u). */
function shingleCross(u: number): V2 {
    const a = Math.abs(2 * u - 1);
    const side = u >= 0.5 ? 2 : -2;
    const c = 0.62;
    const half = 1.57079633;
    if (a < c) {
        const x = (half * a) / c;
        return [0.3 + 0.7 * Math.cos(x), ((-0.7 * Math.sin(x) * half) / c) * side];
    }
    const x = (half * (a - c)) / (1 - c);
    return [0.3 * (1 - Math.sin(x)), ((-0.3 * Math.cos(x) * half) / (1 - c)) * side];
}

/** `pattern.shingles`: as fiadas sobrepostas (altura, gradiente, valor da telha à vista, vão, posição na fiada). */
export function patternShingles(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: readonly number[],
    shift: number,
    gap: number,
    bevel: number,
    profile: number,
    irregularity: number,
    seed: number,
): { height: number; gradient: number[]; tile: number; gap: number; along: number } {
    const fx = fit(scale[0]!, wrap[0]!, 1);
    const fy = fit(Math.abs(scale[1]!), wrap[1]!, shift !== 0 ? 2 : 1);
    const per: V2 = [fx[1], fy[1]];
    const up = scale[1]! < 0 ? -1 : 1;
    const qy = f32(f32(p[1]! * fy[0]) * up);
    const row = Math.floor(qy);
    const v = qy - row;
    const qx = f32(f32(p[0]! * fx[0]) + shift * row);
    const col = Math.floor(qx);
    const u = qx - col;
    const h = cellHash(col, row, per, seed);
    const qx0 = f32(f32(p[0]! * fx[0]) + shift * (row - 1));
    const col0 = Math.floor(qx0);
    const u0 = qx0 - col0;
    const h0 = cellHash(col0, row - 1, per, seed);
    const aspect = fy[0] / fx[0];
    const foot = (Math.min(0.9, Math.max(0, irregularity)) * (pcgHash(h) >>> 8)) / 16777216;
    const ex = (0.5 - Math.abs(u - 0.5)) * aspect - 0.5 * Math.max(gap, 0);
    const ey = v - foot;
    const d = Math.min(ex, ey);
    const bw = Math.max(bevel, 1e-4);
    const t = clamp01(d / bw);
    const own = smooth(t);
    const toward: V2 = ex < ey ? [(u >= 0.5 ? -1 : 1) * fy[0], 0] : [0, fy[0]];
    const steep = (6 * t * (1 - t)) / bw;
    const dOwn: V2 = [steep * toward[0], steep * toward[1]];
    const pf = clamp01(profile);
    const c = shingleCross(u);
    const c0 = shingleCross(u0);
    const flat = 0.5 * (own - v + 1);
    const dFlat: V2 = [0.5 * dOwn[0], 0.5 * (dOwn[1] - fy[0])];
    const curved = mix(c0[0], c[0], own);
    const dCurved: V2 = [
        mix(c0[1], c[1], own) * fx[0] + (c[0] - c0[0]) * dOwn[0],
        (c[0] - c0[0]) * dOwn[1],
    ];
    const k = width > 0 ? band(width * Math.max(Math.abs(fx[0]), Math.abs(fy[0]))) : 1;
    return {
        height: mix(0.5, mix(flat, curved, pf), k),
        gradient: [k * mix(dFlat[0], dCurved[0], pf), k * up * mix(dFlat[1], dCurved[1], pf)],
        tile: mix(0.5, unit24(d > 0 ? h : h0), k),
        gap: k * (d <= 0 ? 1 : 0),
        along: v,
    };
}

/** `node_pattern_cell_pair`: os dois pontos de célula mais próximos de `q` (relativos a ele) e o hash do primeiro. */
function cellPair(q: V2, per: V2, seed: number, jitter: number): { r1: V2; r2: V2; h: number } {
    const ix = Math.floor(q[0]);
    const iy = Math.floor(q[1]);
    const f: V2 = [q[0] - ix, q[1] - iy];
    let d1 = 1e30;
    let d2 = 1e30;
    let r1: V2 = [0, 0];
    let r2: V2 = [0, 0];
    let h1 = 0;
    for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
            const h = cellHash(ix + dx, iy + dy, per, seed);
            const r: V2 = [
                dx + 0.5 + jitter * 0.5 * hashSigned(h) - f[0],
                dy + 0.5 + jitter * 0.5 * hashSigned(pcgHash(h)) - f[1],
            ];
            const d = r[0] * r[0] + r[1] * r[1];
            if (d < d1) {
                d2 = d1;
                r2 = r1;
                d1 = d;
                r1 = r;
                h1 = h;
            } else if (d < d2) {
                d2 = d;
                r2 = r;
            }
        }
    return { r1, r2, h: h1 };
}

/** `node_pattern_round`: a posição na célula arredondada, t = 2 · d₁ / (d₁ + d₂), e ∂t/∂q. */
function cellRound(c: { r1: V2; r2: V2 }): [number, number, number] {
    const d1 = Math.max(Math.hypot(c.r1[0], c.r1[1]), 1e-6);
    const d2 = Math.max(Math.hypot(c.r2[0], c.r2[1]), 1e-6);
    const s = d1 + d2;
    const k = 2 / (s * s);
    return [
        (2 * d1) / s,
        k * ((d1 * c.r2[0]) / d2 - (d2 * c.r1[0]) / d1),
        k * ((d1 * c.r2[1]) / d2 - (d2 * c.r1[1]) / d1),
    ];
}

/** `pattern.areoles`: as células arredondadas (a almofada, o gradiente, o valor da célula e a borda). */
export function patternAreoles(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: number,
    jitter: number,
    wall: number,
    seed: number,
): { height: number; gradient: number[]; cell: number; wall: number } {
    const fx = fit(scale, wrap[0]!, 1);
    const fy = fit(scale, wrap[1]!, 1);
    const c = cellPair(
        [f32(p[0]! * fx[0]), f32(p[1]! * fy[0])],
        [fx[1], fy[1]],
        seed,
        Math.min(jitter, 0.8),
    );
    const t = cellRound(c);
    const k = width > 0 ? band(width * Math.max(Math.abs(fx[0]), Math.abs(fy[0]))) : 1;
    const e = clamp01((t[0] - 1 + wall) / Math.max(wall, 1e-4));
    return {
        height: mix(0.5, 1 - t[0] * t[0], k),
        gradient: [k * -2 * t[0] * t[1] * fx[0], k * -2 * t[0] * t[2] * fy[0]],
        cell: mix(0.5, unit24(c.h), k * (1 - smooth(clamp01((t[0] - 0.55) / 0.35)))),
        wall: k * smooth(e),
    };
}

/** `pattern.veins`: as nervuras da folha (altura, gradiente, principais, distância à central, valor da aréola). */
export function patternVeins(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: readonly number[],
    veins: number,
    slope: number,
    curve: number,
    thickness: number,
    fine: number,
    seed: number,
    irregular = 0,
    taper = 0,
    ladder = 0,
): { height: number; gradient: number[]; main: number; across: number; cell: number } {
    const fx = fit(scale[0]!, wrap[0]!, 1);
    const fy = fit(scale[1]!, wrap[1]!, 1);
    const len = fy[0] / fx[0];
    const qx = f32(p[0]! * fx[0]);
    const qy = f32(p[1]! * fy[0]);
    const xb = (qx - Math.floor(qx)) * len;
    const yb = qy - Math.floor(qy) - 0.5;
    const ay = Math.abs(yb);
    const sy = yb >= 0 ? 1 : -1;
    const thin = 1 - (clamp01(taper) * xb) / len;
    const w0 = Math.max(thickness * thin, 1e-4);
    const t0 = clamp01(ay / w0);
    const m0 = 1 - smooth(t0);
    const g0: V2 = [0, ((-6 * t0 * (1 - t0)) / w0) * sy * fy[0]];
    const n = Math.max(Math.round(veins), 1);
    const sp = len / n;
    const sl = Math.max(slope, 1e-3);
    const ds = -1 / sl - 2 * curve * ay;
    let s = (xb - ay / sl - curve * ay * ay) / sp + (yb < 0 ? 0.5 : 0);
    let gs: V2 = [1 / sp, ds / sp];
    const side = yb < 0 ? 1 : 0;
    if (irregular > 0) {
        const wn = patternNoise([f32(s), f32(3 * ay)], [n, 0], (seed + 7 + side) >>> 0);
        s += irregular * wn[0];
        gs = [
            gs[0] * (1 + irregular * wn[1]),
            gs[1] * (1 + irregular * wn[1]) + 3 * irregular * wn[2],
        ];
    }
    const fs = s - Math.floor(s) - 0.5;
    const gl = Math.max(Math.hypot(gs[0], gs[1]), 1e-6);
    const d1 = Math.abs(fs) / gl;
    const fade = 0.5 * (1 - 1.4 * ay);
    const w1 = w0 * Math.max(fade, 0.12);
    const dw1 = fade > 0.12 ? -0.7 * w0 : 0;
    const t1 = clamp01(d1 / w1);
    const m1 = 1 - smooth(t1);
    const sg = fs >= 0 ? 1 : -1;
    const dt1: V2 = [
        (sg * gs[0]) / gl / w1,
        ((sg * gs[1]) / gl + (2 * curve * d1 * ds) / (1 + ds * ds) - (d1 * dw1) / w1) / w1,
    ];
    const k6 = -6 * t1 * (1 - t1);
    const g1: V2 = [k6 * dt1[0] * fy[0], k6 * dt1[1] * sy * fy[0]];
    let m3 = 0;
    let g3: V2 = [0, 0];
    if (ladder > 0) {
        const span = Math.floor(s);
        const phase =
            (pcgHash(
                ((((span - n * Math.floor(span / n)) | 0) >>> 0) * 2
                    + side
                    + Math.imul(seed, 0x9e3779b1))
                    >>> 0,
            )
                >>> 8)
            / 16777216;
        const wn = patternNoise(
            [f32(2 * s), f32(0.25 * ladder * ay)],
            [2 * n, 0],
            (seed + 9 + side) >>> 0,
        );
        const run: V2 = [
            Math.round((ladder * len) / Math.sqrt(1 + sl * sl)) / len,
            (ladder * sl) / Math.sqrt(1 + sl * sl),
        ];
        const tt = run[0] * xb + run[1] * ay + phase + 0.18 * wn[0];
        const gt: V2 = [
            run[0] + 0.18 * 2 * wn[1] * gs[0],
            run[1] + 0.18 * (2 * wn[1] * gs[1] + 0.25 * ladder * wn[2]),
        ];
        const ft = tt - Math.floor(tt) - 0.5;
        const glt = Math.max(Math.hypot(gt[0], gt[1]), 1e-6);
        const w3 = 0.3 * w0;
        const t3 = clamp01(Math.abs(ft) / glt / w3);
        m3 = 1 - smooth(t3);
        const k3 = (-6 * t3 * (1 - t3) * (ft >= 0 ? 1 : -1)) / glt / w3;
        g3 = [k3 * gt[0] * fy[0], k3 * gt[1] * sy * fy[0]];
    }
    let m2 = 0;
    let g2: V2 = [0, 0];
    let cell = 0.5;
    if (fine > 0) {
        const vx = fit(fine, wrap[0]!, 1);
        const vy = fit(fine, wrap[1]!, 1);
        const c = cellPair([f32(p[0]! * vx[0]), f32(p[1]! * vy[0])], [vx[1], vy[1]], seed, 0.8);
        const t = cellRound(c);
        const t2 = clamp01((t[0] - 0.75) / 0.25);
        const k2 = width > 0 ? band(width * Math.max(Math.abs(vx[0]), Math.abs(vy[0]))) : 1;
        m2 = k2 * smooth(t2);
        const steep = (k2 * 6 * t2 * (1 - t2)) / 0.25;
        g2 = [steep * t[1] * vx[0], steep * t[2] * vy[0]];
        cell = mix(0.5, unit24(c.h), k2 * (1 - smooth(clamp01((t[0] - 0.55) / 0.35))));
    }
    const k1 = width > 0 ? band((width * fy[0]) / Math.min(sp, 1)) : 1;
    const k3 = width > 0 ? band(width * fy[0] * Math.max(ladder, 1 / Math.min(sp, 1))) : 1;
    const main = Math.max(m0, m1, 0.5 * k3 * m3);
    let height = k1 * m0;
    let gradient: V2 = [k1 * g0[0], k1 * g0[1]];
    if (0.7 * k1 * m1 > height) {
        height = 0.7 * k1 * m1;
        gradient = [0.7 * k1 * g1[0], 0.7 * k1 * g1[1]];
    }
    if (0.4 * k3 * m3 > height) {
        height = 0.4 * k3 * m3;
        gradient = [0.4 * k3 * g3[0], 0.4 * k3 * g3[1]];
    }
    if (0.35 * m2 > height) {
        height = 0.35 * m2;
        gradient = [0.35 * g2[0], 0.35 * g2[1]];
    }
    return { height, gradient: [gradient[0], gradient[1]], main: k1 * main, across: 2 * ay, cell };
}

/** `pattern.glints`: as células do sorteio dos brilhos pontuais em dois níveis, a mistura e a contagem de flocos. */
export function patternGlints(
    p: readonly number[],
    width: number,
    scale: number,
    seed: number,
): { cells: number[]; count: number } {
    const w = f32(width * Math.abs(scale));
    const t = clamp01((w - 0.2) / 0.3);
    const k = smooth(t);
    if (k <= 0) return { cells: [0, 0, 0], count: 0 };
    const lod = Math.max(f32(Math.log2(w)) + 0.5, 0);
    const level = Math.floor(lod);
    const side = 2 ** level;
    const q: V2 = [f32(p[0]! * scale), f32(p[1]! * scale)];
    const ha = cellHash(Math.floor(q[0] / side), Math.floor(q[1] / side), [0, 0], seed + 2 * level);
    const hb = cellHash(
        Math.floor(q[0] / (2 * side)),
        Math.floor(q[1] / (2 * side)),
        [0, 0],
        seed + 2 * level + 2,
    );
    return { cells: [unit24(ha), unit24(hb), lod - level], count: (side * side) / k };
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
    twist = 0,
): {
    height: number;
    gradient: number[];
    warp: number;
    thread: number;
    gap: number;
    fiber: number[];
    strand: number;
} {
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
    const turn = Math.sin(twist) * Math.sqrt(Math.max(warp > 0.5 ? section[0] : section[1], 0));
    const fiber: V2 = warp > 0.5 ? [turn, Math.cos(twist)] : [Math.cos(twist), -turn];
    const across = Math.min(1, Math.max(-1, (warp > 0.5 ? f[0] : f[1]) / hw));
    const along = warp > 0.5 ? q[1] : q[0];
    const strand =
        twist !== 0
            ? 0.5 + 0.5 * Math.cos(3 * Math.asin(across) + Math.sign(twist) * 2 * Math.PI * along)
            : 1;
    return {
        height: mix(0.5, upper ? hTop : hLow, k),
        gradient: [k * grad[0] * fx[0], k * grad[1] * fy[0]],
        warp: mix(ov / m, warp, k),
        thread: mix(0.5, unit24(thread), k),
        gap: mix(g * g, !inside[0] && !inside[1] ? 1 : 0, k),
        fiber: [mix(1 - ov / m, fiber[0], k), mix(ov / m, fiber[1], k)],
        strand: mix(twist !== 0 ? 0.5 : 1, strand, k),
    };
}

/** `pattern.knit`: o tricô em ponto meia (altura, gradiente, fibra à vista, valor do ponto, fundo). */
export function patternKnit(
    p: readonly number[],
    width: number,
    wrap: readonly number[],
    scale: number,
    aspect: number,
    thickness: number,
    seed: number,
    twist = 0,
): {
    height: number;
    gradient: number[];
    fiber: number[];
    stitch: number;
    gap: number;
    strand: number;
} {
    const fx = fit(scale, wrap[0]!, 1);
    const fy = fit(f32(scale * Math.max(aspect, 1e-3)), wrap[1]!, 1);
    const q: V2 = [f32(p[0]! * fx[0]), f32(p[1]! * fy[0])];
    const ix = Math.floor(q[0]);
    const iy = Math.floor(q[1]);
    const f: V2 = [q[0] - ix, q[1] - iy];
    const side = f[0] >= 0.5 ? 1 : -1;
    const a = Math.abs(f[0] - 0.5);
    const w = 0.2 * Math.min(1, Math.max(0.1, thickness));
    let h = 0;
    let g: V2 = [0, 0];
    let row = 0;
    let secBest = 0;
    let turnBest = 0;
    for (let r = -1; r <= 1; r++) {
        const t = (f[1] - r + 0.25) / 1.5;
        const d = a - (0.03 + 0.27 * t);
        if (t <= 0 || t >= 1 || Math.abs(d) >= w) continue;
        const sec = 1 - (d * d) / (w * w);
        const e = 2 * t - 1;
        const env = 1 - e * e;
        if (sec * env > h) {
            h = sec * env;
            g = [
                side * ((-2 * d) / (w * w)) * env,
                (((2 * d) / (w * w)) * 0.27 * env - sec * 4 * e) / 1.5,
            ];
            row = r;
            secBest = sec;
            turnBest =
                3 * Math.asin(Math.min(1, Math.max(-1, d / w)))
                + Math.sign(twist) * side * 4 * Math.PI * t;
        }
    }
    const k = width > 0 ? band(width * Math.max(Math.abs(fx[0]), Math.abs(fy[0]))) : 1;
    const stitch = cellHash(ix, iy + row, [fx[1], fy[1]], seed);
    const ax: V2 = [(side * 0.27) / fx[0], 1.5 / fy[0]];
    const al = Math.hypot(ax[0], ax[1]);
    const axis: V2 = [ax[0] / al, ax[1] / al];
    const turn = Math.sin(twist) * Math.sqrt(Math.max(secBest, 0));
    const c = Math.cos(twist);
    const fiber: V2 = [axis[0] * c + axis[1] * turn, axis[1] * c - axis[0] * turn];
    return {
        height: mix(0.35, h, k),
        gradient: [k * g[0] * fx[0], k * g[1] * fy[0]],
        fiber: [mix(0, fiber[0], k), mix(1, fiber[1], k)],
        stitch: mix(0.5, unit24(stitch), k),
        gap: mix(0.15, h <= 0 ? 1 : 0, k),
        strand: mix(
            twist !== 0 ? 0.5 : 1,
            twist !== 0 && h > 0 ? 0.5 + 0.5 * Math.cos(turnBest) : 1,
            k,
        ),
    };
}

/** `pattern.threshold`: smoothstep(low; high; valor) com o gradiente pela regra da cadeia. */
export function patternThreshold(
    value: number,
    gradient: readonly number[],
    low: number,
    high: number,
): { value: number; gradient: number[] } {
    const span = high - low;
    const d = Math.abs(span) < 1e-6 ? (span >= 0 ? 1e-6 : -1e-6) : span;
    const t = clamp01((value - low) / d);
    const s = (6 * t * (1 - t)) / d;
    return { value: smooth(t), gradient: [s * gradient[0]!, s * gradient[1]!] };
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
            bend: k % 2 === 0 ? [0, 1] : vector(r, 2, -2, 2),
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
                vec(x.bend),
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
            knots: k % 2 === 0 ? 0 : [1, 2][k % 4 === 1 ? 0 : 1]!,
            knot_size: uniform(r, 0.05, 0.15),
            knot_rings: uniform(r, 1, 4),
            fall: k % 3 === 0 ? 0.12 : uniform(r, 0.1, 0.4),
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
                num(x.knots),
                num(x.knot_size),
                num(x.knot_rings),
                num(x.fall),
            ),
    },
    {
        node: 'pattern.iris',
        // As bordas (íris, pupila, limbo) e os vasos são degraus de inclinação até 50 por unidade: o erro de f32 da
        // direção (1e-7) e do `atan2` fica abaixo disto.
        tolerance: 5e-3,
        sample: (r, k) => ({
            p: vector(r, 3, -1, 1),
            width: k % 3 === 0 ? 0 : uniform(r, 0.001, 0.02),
            iris: uniform(r, 0.35, 0.6),
            pupil: uniform(r, 0.2, 0.5),
            fibers: [16, 32, 48][k % 3]!,
            seed: k % 5,
        }),
        reference: (x) =>
            patternIris(
                vec(x.p),
                num(x.width),
                num(x.iris),
                num(x.pupil),
                num(x.fibers),
                num(x.seed),
            ),
    },
    {
        node: 'pattern.grain3',
        tolerance: 2e-3,
        sample: (r, k) => ({
            p: vector(r, 3, -4, 4),
            width: k % 3 === 0 ? 0 : uniform(r, 0.005, 0.2),
            scale: [
                [1, 1, 1],
                [8, 0.5, 8],
                [2, 4, 1],
            ][k % 3]!,
            seed: k % 5,
            octaves: 1 + (k % 4),
            lacunarity: 2,
            gain: uniform(r, 0.3, 0.7),
        }),
        reference: (x) =>
            patternGrain3(
                vec(x.p),
                num(x.width),
                vec(x.scale),
                num(x.seed),
                num(x.octaves),
                num(x.lacunarity),
                num(x.gain),
            ),
    },
    {
        node: 'pattern.trunk',
        tolerance: 2e-3,
        sample: (r, k) => ({
            p: vector(r, 3, -4, 4),
            width: k % 3 === 0 ? 0 : uniform(r, 0.005, 0.2),
            scale: [1, 2, 4, 8][k % 4]!,
            knots: k % 2 === 0 ? 0 : [0.5, 1][k % 4 === 1 ? 0 : 1]!,
            seed: k % 5,
            irregularity: k % 2 === 0 ? 0 : uniform(r, 0, 1),
            waviness: k % 3 === 0 ? 0 : uniform(r, 0, 0.05),
            waviness_scale: [
                [2, 0.5, 2],
                [1, 1, 1],
            ][k % 2]!,
            wander: k % 4 === 0 ? 0 : uniform(r, 0, 0.2),
            wander_scale: [0.5, 1][k % 2]!,
            knot_size: uniform(r, 0.05, 0.15),
            knot_rings: uniform(r, 1, 4),
            fall: k % 3 === 0 ? 0.12 : uniform(r, 0.1, 0.4),
        }),
        reference: (x) =>
            patternTrunk(
                vec(x.p),
                num(x.width),
                num(x.scale),
                num(x.knots),
                num(x.seed),
                num(x.irregularity),
                num(x.waviness),
                vec(x.waviness_scale),
                num(x.wander),
                num(x.wander_scale),
                num(x.knot_size),
                num(x.knot_rings),
                num(x.fall),
            ),
    },
    {
        node: 'pattern.bricks',
        tolerance: 2e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [
                [1, 2],
                [2, 4],
                [4, 4],
                [2, 8],
            ][k % 4]!,
            shift: [0.5, 0, 0.25][k % 3]!,
            gap: uniform(r, 0.02, 0.3),
            bevel: uniform(r, 0.05, 0.3),
            seed: k % 5,
        }),
        reference: (x) =>
            patternBricks(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                vec(x.scale),
                num(x.shift),
                num(x.gap),
                num(x.bevel),
                num(x.seed),
            ),
    },
    {
        node: 'pattern.planks',
        tolerance: 2e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [1, 2, 4, 8][k % 4]!,
            length: [4, 2, 1][k % 3]!,
            arrangement: k % 2,
            gap: uniform(r, 0.02, 0.2),
            bevel: uniform(r, 0.05, 0.3),
            seed: k % 5,
        }),
        reference: (x) =>
            patternPlanks(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                num(x.scale),
                num(x.length),
                num(x.arrangement),
                num(x.gap),
                num(x.bevel),
                num(x.seed),
            ),
    },
    {
        node: 'pattern.fissures',
        tolerance: 2e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [
                [4, 1],
                [8, 2],
                [2, 2],
                [8, 1],
            ][k % 4]!,
            jitter: uniform(r, 0, 1),
            crease: uniform(r, 0.05, 0.4),
            seed: k % 5,
        }),
        reference: (x) =>
            patternFissures(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                vec(x.scale),
                num(x.jitter),
                num(x.crease),
                num(x.seed),
            ),
    },
    {
        node: 'pattern.dents',
        tolerance: 2e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [1, 2, 4, 8][k % 4]!,
            jitter: uniform(r, 0, 1),
            seed: k % 5,
        }),
        reference: (x) =>
            patternDents(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                num(x.scale),
                num(x.jitter),
                num(x.seed),
            ),
    },
    {
        node: 'pattern.shingles',
        tolerance: 2e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [
                [2, 4],
                [4, -4],
                [1, 2],
                [8, 4],
            ][k % 4]!,
            shift: [0.5, 0, 0.25][k % 3]!,
            gap: uniform(r, 0, 0.2),
            bevel: uniform(r, 0.05, 0.3),
            profile: k % 2 === 0 ? 0 : uniform(r, 0, 1),
            irregularity: k % 5 === 0 ? 0 : uniform(r, 0, 0.4),
            seed: k % 5,
        }),
        reference: (x) =>
            patternShingles(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                vec(x.scale),
                num(x.shift),
                num(x.gap),
                num(x.bevel),
                num(x.profile),
                num(x.irregularity),
                num(x.seed),
            ),
    },
    {
        node: 'pattern.brush',
        // O gradiente dos riscos é a frequência deles (dezenas por unidade nas amostras) vezes a derivada do ruído.
        tolerance: 5e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [
                [2, 32],
                [1, 16],
                [4, 64],
            ][k % 3]!,
            spread: uniform(r, 0, 0.1),
            bend_scale: [
                [1, 2],
                [2, 4],
            ][k % 2]!,
            deep: [0, 0.3, 1][k % 3]!,
            seed: k % 5,
        }),
        reference: (x) =>
            patternBrush(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                vec(x.scale),
                num(x.spread),
                vec(x.bend_scale),
                num(x.deep),
                num(x.seed),
            ),
    },
    {
        node: 'pattern.veins',
        // O gradiente das nervuras divide pela meia largura delas (até 1 / 0,005 nas secundárias junto da margem).
        tolerance: 5e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [
                [0.5, 1],
                [1, 2],
                [0.25, 1],
                [1, 4],
            ][k % 4]!,
            veins: [5, 8, 3][k % 3]!,
            slope: uniform(r, 0.5, 1.5),
            curve: k % 2 === 0 ? 0 : uniform(r, 0, 2),
            thickness: uniform(r, 0.04, 0.1),
            fine: [0, 8, 16][k % 3]!,
            seed: k % 5,
            irregular: [0, 0.2, 0.3][k % 3]!,
            taper: k % 2 === 0 ? 0 : 0.6,
            ladder: [0, 6][k % 2]!,
        }),
        reference: (x) =>
            patternVeins(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                vec(x.scale),
                num(x.veins),
                num(x.slope),
                num(x.curve),
                num(x.thickness),
                num(x.fine),
                num(x.seed),
                num(x.irregular),
                num(x.taper),
                num(x.ladder),
            ),
    },
    {
        node: 'pattern.areoles',
        // O gradiente divide pela soma das distâncias aos dois pontos (pequena onde três células se encontram perto).
        tolerance: 5e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [1, 4, 8][k % 3]!,
            jitter: uniform(r, 0, 0.8),
            wall: uniform(r, 0.1, 0.5),
            seed: k % 5,
        }),
        reference: (x) =>
            patternAreoles(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                num(x.scale),
                num(x.jitter),
                num(x.wall),
                num(x.seed),
            ),
    },
    {
        node: 'pattern.glints',
        tolerance: 2e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [8, 32, 128, 16][k % 4]!,
            seed: k % 5,
        }),
        reference: (x) => patternGlints(vec(x.p), num(x.width), num(x.scale), num(x.seed)),
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
            twist: k % 2 === 0 ? 0 : uniform(r, -0.6, 0.6),
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
                num(x.twist),
            ),
    },
    {
        node: 'pattern.knit',
        tolerance: 2e-3,
        sample: (r, k) => ({
            ...relief(r, k),
            scale: [1, 2, 4, 8][k % 4]!,
            aspect: [1, 1.5, 0.5][k % 3]!,
            thickness: uniform(r, 0.4, 1),
            seed: k % 5,
            twist: k % 2 === 0 ? 0 : uniform(r, -0.6, 0.6),
        }),
        reference: (x) =>
            patternKnit(
                vec(x.p),
                num(x.width),
                vec(x.wrap),
                num(x.scale),
                num(x.aspect),
                num(x.thickness),
                num(x.seed),
                num(x.twist),
            ),
    },
    {
        node: 'pattern.threshold',
        tolerance: 1e-4,
        sample: (r, k) => {
            const low = uniform(r, -1, 1);
            return {
                value: uniform(r, -1.5, 1.5),
                gradient: vector(r, 2, -20, 20),
                low,
                high: k % 9 === 8 ? low : low + uniform(r, -1, 1),
            };
        },
        reference: (x) => patternThreshold(num(x.value), vec(x.gradient), num(x.low), num(x.high)),
    },
];
