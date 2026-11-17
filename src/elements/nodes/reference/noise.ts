// Referência em CPU do módulo WGSL `noise` (spec 005, R7): mesma aritmética inteira (u32) e a mesma interpolação, para
// os smokes `shaderLibrary` e `nodeGraphs` compararem com a GPU (e referência dos nós de ruído, spec 031). Cada ruído tem
// a forma por célula (`*Cell`: a célula inteira u32 e a posição dentro dela), como no WGSL.

export { hash2, hash3, hashSigned, pcgHash } from '../../math/reference/random';
import { hash2, hash3, hashSigned } from '../../math/reference/random';

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number): number => a * (1 - t) + b * t;
/** `noise_cell*` por componente: a célula inteira como u32 (o bitcast do i32). */
export const noiseCell = (v: number): number => Math.floor(v) >>> 0;
/** `fract` do WGSL: `v − floor(v)`. */
export const noiseFract = (v: number): number => v - Math.floor(v);
const cell = noiseCell;
const fract = noiseFract;

export function valueNoise2(x: number, y: number): number {
    return valueNoise2Cell(cell(x), cell(y), fract(x), fract(y));
}

export function valueNoise2Cell(cx: number, cy: number, fx: number, fy: number): number {
    const a = hashSigned(hash2(cx, cy));
    const b = hashSigned(hash2((cx + 1) >>> 0, cy));
    const d = hashSigned(hash2(cx, (cy + 1) >>> 0));
    const e = hashSigned(hash2((cx + 1) >>> 0, (cy + 1) >>> 0));
    return mix(mix(a, b, fade(fx)), mix(d, e, fade(fx)), fade(fy));
}

export function valueNoise3(x: number, y: number, z: number): number {
    return valueNoise3Cell([cell(x), cell(y), cell(z)], [fract(x), fract(y), fract(z)]);
}

export function valueNoise3Cell(
    c: readonly [number, number, number],
    f: readonly [number, number, number],
): number {
    const u = f.map(fade);
    const v = (dx: number, dy: number, dz: number): number =>
        hashSigned(hash3((c[0] + dx) >>> 0, (c[1] + dy) >>> 0, (c[2] + dz) >>> 0));
    const x00 = mix(v(0, 0, 0), v(1, 0, 0), u[0]!);
    const x10 = mix(v(0, 1, 0), v(1, 1, 0), u[0]!);
    const x01 = mix(v(0, 0, 1), v(1, 0, 1), u[0]!);
    const x11 = mix(v(0, 1, 1), v(1, 1, 1), u[0]!);
    return mix(mix(x00, x10, u[1]!), mix(x01, x11, u[1]!), u[2]!);
}

const S = 0.70710678;
const DIRS2: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [S, S],
    [-S, S],
    [S, -S],
    [-S, -S],
];

function grad2(h: number, fx: number, fy: number): number {
    const g = DIRS2[h & 7]!;
    return g[0] * fx + g[1] * fy;
}

export function gradientNoise2(x: number, y: number): number {
    return gradientNoise2Cell(cell(x), cell(y), fract(x), fract(y));
}

export function gradientNoise2Cell(cx: number, cy: number, fx: number, fy: number): number {
    const a = grad2(hash2(cx, cy), fx, fy);
    const b = grad2(hash2((cx + 1) >>> 0, cy), fx - 1, fy);
    const d = grad2(hash2(cx, (cy + 1) >>> 0), fx, fy - 1);
    const e = grad2(hash2((cx + 1) >>> 0, (cy + 1) >>> 0), fx - 1, fy - 1);
    const r = 1.41421356 * mix(mix(a, b, fade(fx)), mix(d, e, fade(fx)), fade(fy));
    return Math.min(1, Math.max(-1, r));
}

function grad3(h: number, fx: number, fy: number, fz: number): number {
    const k = h & 15;
    const u = k < 8 ? fx : fy;
    const v = k < 4 ? fy : k === 12 || k === 14 ? fx : fz;
    return ((k & 1) === 0 ? u : -u) + ((k & 2) === 0 ? v : -v);
}

export function gradientNoise3(x: number, y: number, z: number): number {
    return gradientNoise3Cell([cell(x), cell(y), cell(z)], [fract(x), fract(y), fract(z)]);
}

export function gradientNoise3Cell(
    c: readonly [number, number, number],
    f: readonly [number, number, number],
): number {
    const u = f.map(fade);
    const g = (dx: number, dy: number, dz: number): number =>
        grad3(
            hash3((c[0] + dx) >>> 0, (c[1] + dy) >>> 0, (c[2] + dz) >>> 0),
            f[0] - dx,
            f[1] - dy,
            f[2] - dz,
        );
    const x00 = mix(g(0, 0, 0), g(1, 0, 0), u[0]!);
    const x10 = mix(g(0, 1, 0), g(1, 1, 0), u[0]!);
    const x01 = mix(g(0, 0, 1), g(1, 0, 1), u[0]!);
    const x11 = mix(g(0, 1, 1), g(1, 1, 1), u[0]!);
    return Math.min(1, Math.max(-1, mix(mix(x00, x10, u[1]!), mix(x01, x11, u[1]!), u[2]!)));
}

// Ruído periódico (spec 041, R3): o reticulado com o índice inteiro da célula reduzido módulo `period` (> 0) — os cantos
// `(c + d) mod period` — e só então deslocado pela semente; a saída repete com período `period` (em unidades de rede).
// Mesma aritmética inteira do WGSL (`noise_wrap*`, `*_period`).

/** `noise_wrap*` por componente: `floor(v)` reduzido módulo `period` (> 0), em [0, period). */
export const noiseWrap = (v: number, period: number): number =>
    ((Math.floor(v) % period) + period) % period;

/** Canto da célula periódica: `(c + d) mod period` deslocado pela semente (u32). */
const corner = (c: number, d: number, period: number, seed: number): number =>
    (((c + d) % period) + seed) >>> 0;

export function valueNoise2Period(
    c: readonly [number, number],
    f: readonly [number, number],
    period: number,
    seed: readonly [number, number],
): number {
    const v = (dx: number, dy: number): number =>
        hashSigned(hash2(corner(c[0], dx, period, seed[0]), corner(c[1], dy, period, seed[1])));
    const ux = fade(f[0]);
    return mix(mix(v(0, 0), v(1, 0), ux), mix(v(0, 1), v(1, 1), ux), fade(f[1]));
}

export function gradientNoise2Period(
    c: readonly [number, number],
    f: readonly [number, number],
    period: number,
    seed: readonly [number, number],
): number {
    const g = (dx: number, dy: number): number =>
        grad2(
            hash2(corner(c[0], dx, period, seed[0]), corner(c[1], dy, period, seed[1])),
            f[0] - dx,
            f[1] - dy,
        );
    const ux = fade(f[0]);
    const r = 1.41421356 * mix(mix(g(0, 0), g(1, 0), ux), mix(g(0, 1), g(1, 1), ux), fade(f[1]));
    return Math.min(1, Math.max(-1, r));
}

const corner3 = (
    c: readonly [number, number, number],
    d: readonly [number, number, number],
    period: number,
    seed: readonly [number, number, number],
): [number, number, number] => [
    corner(c[0], d[0], period, seed[0]),
    corner(c[1], d[1], period, seed[1]),
    corner(c[2], d[2], period, seed[2]),
];

export function valueNoise3Period(
    c: readonly [number, number, number],
    f: readonly [number, number, number],
    period: number,
    seed: readonly [number, number, number],
): number {
    const u = f.map(fade);
    const v = (dx: number, dy: number, dz: number): number =>
        hashSigned(hash3(...corner3(c, [dx, dy, dz], period, seed)));
    const x00 = mix(v(0, 0, 0), v(1, 0, 0), u[0]!);
    const x10 = mix(v(0, 1, 0), v(1, 1, 0), u[0]!);
    const x01 = mix(v(0, 0, 1), v(1, 0, 1), u[0]!);
    const x11 = mix(v(0, 1, 1), v(1, 1, 1), u[0]!);
    return mix(mix(x00, x10, u[1]!), mix(x01, x11, u[1]!), u[2]!);
}

export function gradientNoise3Period(
    c: readonly [number, number, number],
    f: readonly [number, number, number],
    period: number,
    seed: readonly [number, number, number],
): number {
    const u = f.map(fade);
    const g = (dx: number, dy: number, dz: number): number =>
        grad3(hash3(...corner3(c, [dx, dy, dz], period, seed)), f[0] - dx, f[1] - dy, f[2] - dz);
    const x00 = mix(g(0, 0, 0), g(1, 0, 0), u[0]!);
    const x10 = mix(g(0, 1, 0), g(1, 1, 0), u[0]!);
    const x01 = mix(g(0, 0, 1), g(1, 0, 1), u[0]!);
    const x11 = mix(g(0, 1, 1), g(1, 1, 1), u[0]!);
    return Math.min(1, Math.max(-1, mix(mix(x00, x10, u[1]!), mix(x01, x11, u[1]!), u[2]!)));
}
