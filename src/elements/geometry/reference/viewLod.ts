/**
 * Referência (f64) do critério de nível das vistas da malha adaptativa (spec 041, R20): o espelho de
 * `surface_adapt_light.wgsl` (o nível do mapa de sombra virtual onde o retalho cai e os segmentos pelo erro em texels)
 * e de `surface_adapt_view.wgsl` (a histerese e a marcação dos retalhos refeitos), para os testes.
 */

/** O que o critério da luz lê do `ShadowMatrix` do quadro. */
export interface ShadowFrameRef {
    /** Meio lado do primeiro nível (m). */
    readonly firstLevelRadius: number;
    /** Páginas por lado de um nível. */
    readonly pagesPerLevel: number;
    /** Níveis ativos. */
    readonly levels: number;
    /** A câmera no plano da luz. */
    readonly camera: readonly [number, number];
}

/** Texels por lado de uma página (`SV_PAGE`). */
const PAGE_TEXELS = 128;
/** A fração da histerese (`ADAPT_HYSTERESIS`). */
export const VIEW_HYSTERESIS = 0.75;

/** Lado de um texel do nível `k` (m) — `sv_texel`. */
export function svTexel(m: ShadowFrameRef, k: number): number {
    return (2 * m.firstLevelRadius * 2 ** k) / m.pagesPerLevel / PAGE_TEXELS;
}

/**
 * O nível do mapa onde cai a caixa [lo, hi] do plano da luz: o do ponto dela mais perto da câmera pela distância de
 * Chebyshev (`sv_level` com a distância da caixa).
 */
export function svLevelOfBox(
    m: ShadowFrameRef,
    lo: readonly [number, number],
    hi: readonly [number, number],
): number {
    const gx = Math.max(lo[0] - m.camera[0], m.camera[0] - hi[0], 0);
    const gy = Math.max(lo[1] - m.camera[1], m.camera[1] - hi[1], 0);
    const d = Math.max(gx, gy);
    const usable = m.firstLevelRadius * (1 - 4 / m.pagesPerLevel);
    const k = Math.ceil(Math.log2(Math.max(d / usable, 1)));
    return Math.min(Math.max(k, 0), Math.max(m.levels, 1) - 1);
}

/** Nível para `n` segmentos por lado (`adapt_level_of`). */
export function levelOf(n: number, maxLevel: number): number {
    if (Number.isNaN(n)) return maxLevel;
    // `u32` do kernel: o −0 de `ceil` vira 0.
    return (
        Math.max(0, Math.min(Math.ceil(Math.log2(Math.min(n, 2 ** maxLevel)) - 1e-4), maxLevel)) + 0
    );
}

/**
 * Segmentos por lado na vista da luz (`adapt_light_segments`): o erro de corda κ·h²/8 até `error` texels e nenhum
 * segmento menor que `segment` texels, entre 1 e 2^L.
 */
export function lightSegments(o: {
    readonly worldSize: number;
    readonly kappa: number;
    readonly texel: number;
    readonly error: number;
    readonly segment: number;
    readonly maxLevel: number;
}): number {
    let n = o.worldSize * Math.sqrt(o.kappa / (8 * o.error * o.texel));
    n = Math.min(n, o.worldSize / (o.segment * o.texel));
    return Math.min(Math.max(n, 1), 2 ** o.maxLevel);
}

/** O nível pedido com a histerese contra o pedido anterior `previous` (`adapt_view_level`). */
export function viewLevel(n: number, maxLevel: number, previous: number | undefined): number {
    const level = levelOf(n, maxLevel);
    if (
        previous !== undefined
        && previous > level
        && previous <= maxLevel
        && n > VIEW_HYSTERESIS * 2 ** (previous - 1)
    )
        return previous;
    return level;
}

/** O registro de um retalho na série dos níveis: o nível efetivo e as bases dos vértices e dos índices. */
export interface PatchRecordRef {
    readonly level: number;
    readonly vertexBase: number;
    readonly indexBase: number;
}

/**
 * Os retalhos refeitos (`surface_adapt_view_mark_main`): o que mudou de nível ou de base, ou cujo vizinho (a costura)
 * mudou de nível; sem o registro anterior, todos. Grade P × Q, sem domínio periódico.
 */
export function redoPatches(
    p: number,
    q: number,
    now: readonly PatchRecordRef[],
    previous: readonly PatchRecordRef[] | undefined,
): boolean[] {
    return now.map((r, i) => {
        if (previous === undefined) return true;
        const o = previous[i]!;
        if (r.level !== o.level || r.vertexBase !== o.vertexBase || r.indexBase !== o.indexBase)
            return true;
        const pi = i % p;
        const qi = Math.floor(i / p);
        const neighbors = [
            [pi - 1, qi],
            [pi + 1, qi],
            [pi, qi - 1],
            [pi, qi + 1],
        ].filter(([x, y]) => x! >= 0 && x! < p && y! >= 0 && y! < q);
        return neighbors.some(([x, y]) => {
            const j = y! * p + x!;
            return now[j]!.level !== previous[j]!.level;
        });
    });
}

/** Vértices e índices de um retalho no nível `l` (`adapt_counts`). */
export function patchCounts(l: number): { vertices: number; indices: number } {
    const n = 2 ** l;
    return { vertices: (n + 1) * (n + 1), indices: 6 * n * n };
}

/** As bases dos vértices e dos índices de cada retalho pelos níveis (os prefixos de `surface_adapt_scan_main`). */
export function patchRecords(levels: readonly number[]): PatchRecordRef[] {
    let v = 0;
    let i = 0;
    return levels.map((level) => {
        const r = { level, vertexBase: v, indexBase: i };
        const c = patchCounts(level);
        v += c.vertices;
        i += c.indices;
        return r;
    });
}
