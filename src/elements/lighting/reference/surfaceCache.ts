// Referência f64 do cache de irradiância nas superfícies (spec 034, T059, T060e): a regra de `gi_cache.wgsl` na mesma
// representação — a tabela de espalhamento aberto em palavras `u32` (8 por célula: a chave, 0 = vazia; a época; o último
// quadro em que um acerto a usou; a normal octaédrica em 2 × 16 bits; o ponto e o lado em bits de f32) e os valores por
// célula (a chave e a época para que foram acumulados, o estado da resposta e a irradiância de cada rebatimento). A
// chave, a busca e a inserção (`touch`), a validade (`ready`), a seleção do quadro (`select`) e o acúmulo (`blend`).
// As contas de ponto flutuante são em f64; os bits que a GPU guarda (o ponto, o lado, a normal) passam por f32 e pelo
// empacotamento como lá.
import { NONE } from '../../../scene/shaders/engineConstants';
import { hash3, pcgHash } from '../../math/reference/random';
import { adaptiveHysteresis, RESPONSE_EMPTY, type ResponseState } from './response';

/** Posições sondadas a partir da posição da chave (a busca e a inserção). */
export const CACHE_PROBE = 8;
/** Quadros sem uso depois dos quais a célula pode ser tomada por outra chave. */
export const CACHE_EVICT = 120;
/** Quadros desde o último uso em que a célula ainda é atualizada. */
export const CACHE_RECENT = 2;
/** Palavras do índice por célula. */
export const CACHE_WORDS = 8;
/** Histerese máxima do acúmulo das células. */
export const CACHE_MEMORY = 0.95;
/** Sem célula (o `NONE` da GPU). */
export const CACHE_NONE = NONE.value;

type Vec3 = readonly [number, number, number];

const bits = new DataView(new ArrayBuffer(4));
/** Os bits de `x` como f32 (o `bitcast<u32>` da GPU). */
export function f32Bits(x: number): number {
    bits.setFloat32(0, x, true);
    return bits.getUint32(0, true);
}
/** O f32 dos bits `b`. */
export function bitsF32(b: number): number {
    bits.setUint32(0, b >>> 0, true);
    return bits.getFloat32(0, true);
}

/** Octaédrica de uma direção unitária, em [-1, 1]² (`gi_oct_encode`). */
export function octEncode(n: Vec3): [number, number] {
    const l1 = Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]);
    let x = n[0] / l1;
    let y = n[1] / l1;
    if (n[2] < 0) {
        const sx = x >= 0 ? 1 : -1;
        const sy = y >= 0 ? 1 : -1;
        [x, y] = [(1 - Math.abs(y)) * sx, (1 - Math.abs(x)) * sy];
    }
    return [x, y];
}

/** `pack2x16snorm` do WGSL. */
export function pack2x16snorm(x: number, y: number): number {
    const q = (v: number): number => Math.round(Math.min(Math.max(v, -1), 1) * 32767) & 0xffff;
    return (q(x) | (q(y) << 16)) >>> 0;
}

/** Os parâmetros do cache no quadro (os de `gi.cache` e `gi.cacheSize`). */
export interface CacheParams {
    /** Células na tabela. */
    readonly cells: number;
    /** Lado da célula mais fina (m). */
    readonly base: number;
    /** Lados da célula mais fina além dos quais o nível dobra. */
    readonly lod: number;
    /** O quadro (a contagem da série das sondas). */
    readonly frame: number;
    /** A época da série das sondas. */
    readonly epoch: number;
}

/** A chave de um ponto: a chave (nunca 0), a primeira posição na tabela e o lado da célula. */
export interface CacheKey {
    readonly key: number;
    readonly start: number;
    readonly size: number;
}

/** A chave do ponto `p` de normal `n` vista da câmera em `eye` (`gi_cache_key`). */
export function cacheKey(p: Vec3, n: Vec3, eye: Vec3, c: CacheParams): CacheKey {
    const d = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
    const level = Math.min(
        Math.max(Math.floor(Math.log2(Math.max(d / (c.lod * c.base), 1))), 0),
        15,
    );
    const size = c.base * 2 ** level;
    const cell = p.map((v) => Math.floor(v / size) >>> 0) as [number, number, number];
    const o = octEncode(n).map((v) => Math.min(Math.floor((v * 0.5 + 0.5) * 4), 3)) as [
        number,
        number,
    ];
    const salt = Math.imul((level | ((o[0] + 4 * o[1]) << 4)) >>> 0, 0x9e3779b9) >>> 0;
    const h = pcgHash((hash3(cell[0], cell[1], cell[2]) ^ salt) >>> 0);
    return {
        key: (h | 1) >>> 0,
        start: pcgHash((h ^ 0x85ebca6b) >>> 0) % c.cells,
        size,
    };
}

/** O cache: a tabela (palavras) e os valores por célula. */
export interface SurfaceCache {
    readonly table: Uint32Array;
    readonly values: CacheValues[];
}

/** Os valores de uma célula: a chave e a época do acúmulo, a resposta e a irradiância por rebatimento. */
export interface CacheValues {
    key: number;
    epoch: number;
    state: ResponseState;
    irradiance: [number, number, number][];
}

export function createCache(cells: number): SurfaceCache {
    return {
        table: new Uint32Array(cells * CACHE_WORDS),
        values: Array.from({ length: cells }, () => ({
            key: 0,
            epoch: 0,
            state: RESPONSE_EMPTY,
            irradiance: [],
        })),
    };
}

const at = (cell: number, word: number): number => cell * CACHE_WORDS + word;

/** A célula vale na época atual (`gi_cache_current`). */
export function cacheCurrent(cache: SurfaceCache, cell: number, c: CacheParams): boolean {
    return cache.table[at(cell, 1)] === c.epoch >>> 0;
}

/** Recomeça a célula no ponto (`gi_cache_reset`). */
function reset(
    cache: SurfaceCache,
    cell: number,
    p: Vec3,
    n: Vec3,
    size: number,
    c: CacheParams,
): void {
    const t = cache.table;
    t[at(cell, 1)] = c.epoch;
    t[at(cell, 2)] = c.frame;
    const o = octEncode(n);
    t[at(cell, 3)] = pack2x16snorm(o[0], o[1]);
    t[at(cell, 4)] = f32Bits(p[0]);
    t[at(cell, 5)] = f32Bits(p[1]);
    t[at(cell, 6)] = f32Bits(p[2]);
    t[at(cell, 7)] = f32Bits(size);
}

/**
 * A célula do ponto `p` (normal `n`), marcada como usada no quadro; com `insert`, criada se não existe numa posição vazia
 * ou sem uso há `CACHE_EVICT` quadros (a mais antiga das sondadas). `CACHE_NONE` sem ela (`gi_cache_touch`).
 */
export function cacheTouch(
    cache: SurfaceCache,
    p: Vec3,
    n: Vec3,
    eye: Vec3,
    insert: boolean,
    c: CacheParams,
): number {
    const k = cacheKey(p, n, eye, c);
    const t = cache.table;
    let victim = CACHE_NONE;
    let victimKey = 0;
    let oldest = 0;
    for (let q = 0; q < CACHE_PROBE; q++) {
        const cell = (k.start + q) % c.cells;
        const key = t[at(cell, 0)]!;
        const current = key !== 0 && cacheCurrent(cache, cell, c);
        if (key === k.key) {
            if (!current) reset(cache, cell, p, n, k.size, c);
            t[at(cell, 2)] = c.frame;
            return cell;
        }
        // A vazia ou de outra época: a idade máxima (como `NONE` na GPU).
        const age = current ? (c.frame - t[at(cell, 2)]!) >>> 0 : CACHE_NONE;
        if (age > oldest) {
            oldest = age;
            victim = cell;
            victimKey = key;
        }
    }
    if (!insert || victim === CACHE_NONE || oldest < CACHE_EVICT) return CACHE_NONE;
    if (t[at(victim, 0)] !== victimKey) return CACHE_NONE;
    t[at(victim, 0)] = k.key;
    reset(cache, victim, p, n, k.size, c);
    return victim;
}

/** A célula tem acúmulo para a chave que a ocupa na época atual (`gi_cache_ready`). */
export function cacheReady(cache: SurfaceCache, cell: number, c: CacheParams): boolean {
    if (cell === CACHE_NONE) return false;
    const v = cache.values[cell]!;
    return v.key === cache.table[at(cell, 0)] && v.epoch === c.epoch && v.state.frames !== 0;
}

/**
 * Células atualizadas no quadro (`gi_cache_budget`): a vaga `capacity` dividida pelo período das sondas de tela
 * (`period`: 1, 2 ou 4), inteira na janela de resposta a uma luz ou à cena que mudou (`responding`).
 */
export function cacheBudget(capacity: number, period: number, responding: boolean): number {
    return responding ? capacity : Math.floor(capacity / Math.max(period, 1));
}

/**
 * As células a atualizar no quadro (`gi_cache_select_main`): as da época atual usadas há até `CACHE_RECENT` quadros,
 * até `budget` delas; a varredura começa `frame × budget` células adiante (o rodízio). Na GPU a ordem da lista é a dos
 * atômicos; aqui, a da varredura — o conjunto é o mesmo quando cabe no orçamento.
 */
export function cacheSelect(cache: SurfaceCache, budget: number, c: CacheParams): number[] {
    const list: number[] = [];
    for (let j = 0; j < c.cells; j++) {
        const cell = (j + c.frame * budget) % c.cells;
        if (cache.table[at(cell, 0)] === 0 || !cacheCurrent(cache, cell, c)) continue;
        if (c.frame - cache.table[at(cell, 2)]! > CACHE_RECENT) continue;
        if (list.length < budget) list.push(cell);
    }
    return list;
}

/**
 * O acúmulo de uma célula selecionada (`gi_cache_blend_main`): a irradiância dos raios de cada rebatimento (`fresh`, a
 * fração dos raios na média em `coverage`) misturada à da célula pela histerese adaptativa (memória limitada a
 * `CACHE_MEMORY`); os valores de outra chave ou de outra época recomeçam. `changed`: a luz ou a cena mudou há poucos
 * quadros (a série da mudança).
 */
export function cacheBlend(
    cache: SurfaceCache,
    cell: number,
    fresh: readonly (readonly [number, number, number])[],
    coverage: number,
    hysteresis: number,
    changed: boolean,
    c: CacheParams,
): void {
    if (coverage <= 0) return;
    const key = cache.table[at(cell, 0)]!;
    const v = cache.values[cell]!;
    const same = v.key === key && v.epoch === c.epoch;
    const state = same ? v.state : RESPONSE_EMPTY;
    const last = fresh[fresh.length - 1]!;
    const r = adaptiveHysteresis(state, Math.max(last[0], last[1], last[2]), hysteresis, {
        changed,
    });
    const h = Math.min(r.h, CACHE_MEMORY);
    v.irradiance = fresh.map((f, g) => {
        const old = same ? (v.irradiance[g] ?? [0, 0, 0]) : [0, 0, 0];
        return [0, 1, 2].map((k) => f[k]! + (old[k]! - f[k]!) * h) as [number, number, number];
    });
    v.state = r.state;
    v.key = key;
    v.epoch = c.epoch;
}
