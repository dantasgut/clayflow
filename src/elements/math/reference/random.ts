// Referência f64 única da aleatoriedade (spec 037, R2): a família `random` do WGSL com a mesma aritmética u32.
// `pcg_hash`, `hash2`, `hash3`, `hash_signed` são bit a bit (as sementes dos nós e a sequência dos emissores dependem
// deles); `random_next` é o gerador com estado (`H(s + 0x9e3779b9)`) e `random_unit` a conversão em [0, 1).
// O `pcgHash` é o de produção (`../random.ts`, o dono da conta do lado da CPU), reexportado: os valores de controle do
// teste o conferem.

import { pcgHash } from '../random';

export { pcgHash };

export function hash2(x: number, y: number): number {
    return pcgHash((x ^ pcgHash(y)) >>> 0);
}

export function hash3(x: number, y: number, z: number): number {
    return pcgHash((x ^ pcgHash((y ^ pcgHash(z)) >>> 0)) >>> 0);
}

/** `hash_signed`: hash → [−1, 1] fechado. */
export const hashSigned = (h: number): number => (h >>> 8) * (2 / 16777215) - 1;

/** `random_unit`: hash → [0, 1), nunca 1 (os 24 bits altos sobre 2²⁴). */
export const randomUnit = (h: number): number => (h >>> 8) / 16777216;

/** Incremento do gerador com estado (a razão áurea em 32 bits). */
export const RANDOM_GOLDEN = 0x9e3779b9;

/** `random_next`: avança o estado e devolve o hash dele. */
export function randomNext(state: { value: number }): number {
    state.value = (state.value + RANDOM_GOLDEN) >>> 0;
    return pcgHash(state.value);
}

/** Fluxos nomeados (os `RANDOM_STREAM_*` do WGSL). */
export const RANDOM_STREAM = {
    refraction: 1,
    giWorld: 2,
    giScreenRays: 3,
    giScreenLight: 4,
    giPhoton: 5,
    diffuse: 6,
    froxel: 7,
    giScreenGuide: 8,
    giScatter: 9,
    giCache: 10,
    user: 64,
} as const;

/** `random_seed(fluxo, índice, quadro)`: a semente de um fluxo nomeado. */
export const randomSeed = (stream: number, index: number, frame: number): number =>
    hash3(index, frame, stream);
