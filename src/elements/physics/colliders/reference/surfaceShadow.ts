// Referência f64 da sombra de uma superfície de altura (spec 041, rodada 13): o horizonte e a visibilidade do disco da
// luz num campo de altura analítico (`exactSurfaceVisibility`, marcha fina na função) e o espelho da marcha da GPU no
// campo amostrado com a pirâmide de máximos (`surface_shadow.wgsl`: `marchSurfaceVisibility`), com a construção do
// campo e da pirâmide (`surface_collider_build.wgsl`: `scb_height_finish`, `scb_pyramid`).

/** Altura de um campo analítico: y = h(x, z). */
export type HeightFunction = (x: number, z: number) => number;

/** Fração do disco de raio angular `r` (centro na elevação `e`) acima do horizonte de elevação `alpha`. */
export function diskFraction(alpha: number, e: number, r: number): number {
    if (r <= 0) return alpha >= e ? 0 : 1;
    const x = Math.min(1, Math.max(-1, (alpha - e) / r));
    return (Math.acos(x) - x * Math.sqrt(Math.max(1 - x * x, 0))) / Math.PI;
}

/** Elevação (rad) da direção `l` (para a luz) e a direção horizontal unitária dela. */
function elevationOf(
    l: readonly [number, number, number],
): { e: number; ux: number; uz: number } | undefined {
    const hl = Math.hypot(l[0], l[2]);
    if (hl <= 1e-12 * Math.hypot(l[0], l[1], l[2])) return undefined;
    return { e: Math.atan2(l[1], hl), ux: l[0] / hl, uz: l[2] / hl };
}

/**
 * Visibilidade exata do disco da luz (direção `l` para a luz, raio angular `r`) no ponto `p` sobre o campo analítico
 * `h` limitado à caixa `[x0, x1] × [z0, z1]`: o horizonte pela marcha de passo `step` (m) até sair da caixa. O ponto
 * parte da altura da superfície quando está nela (`p[1] ≥ h − tol`).
 */
export function exactSurfaceVisibility(
    h: HeightFunction,
    box: readonly [number, number, number, number],
    p: readonly [number, number, number],
    l: readonly [number, number, number],
    r: number,
    step: number,
    tol = 0,
): number {
    const dir = elevationOf(l);
    if (dir === undefined) return 1;
    const hc = h(p[0], p[2]);
    const y0 = p[1] >= hc - tol ? Math.max(p[1], hc) : p[1];
    let s = -Infinity;
    for (let t = step; ; t += step) {
        const x = p[0] + dir.ux * t;
        const z = p[2] + dir.uz * t;
        if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) break;
        s = Math.max(s, (h(x, z) - y0) / t);
    }
    return diskFraction(s === -Infinity ? -Math.PI / 2 : Math.atan(s), dir.e, r);
}

/** O campo de alturas amostrado nos nós, com a pirâmide de máximos (o layout da GPU). */
export interface SampledSurfaceField {
    readonly nx: number;
    readonly nz: number;
    readonly lo: readonly [number, number];
    readonly hi: readonly [number, number];
    readonly heights: Float64Array;
    readonly side: number;
    readonly levels: number;
    /** Os níveis 1…K em sequência (o nível k em `(P² − (P >> (k − 1))²)/3`). */
    readonly pyramid: Float64Array;
}

const NO_HEIGHT = -3e38;

/** Amostra `h` nos `nx × nz` nós da caixa e constrói a pirâmide (os 3 × 3 nós no nível 1, os 4 filhos acima). */
export function sampleSurfaceField(
    h: HeightFunction,
    box: readonly [number, number, number, number],
    nx: number,
    nz: number,
): SampledSurfaceField {
    const heights = new Float64Array(nx * nz);
    for (let iz = 0; iz < nz; iz++)
        for (let ix = 0; ix < nx; ix++)
            heights[ix + nx * iz] = h(
                box[0] + (ix * (box[1] - box[0])) / (nx - 1),
                box[2] + (iz * (box[3] - box[2])) / (nz - 1),
            );
    let side = 2;
    while (side < Math.max(nx - 1, nz - 1)) side *= 2;
    const levels = Math.log2(side);
    const pyramid = new Float64Array((side * side - 1) / 3).fill(NO_HEIGHT);
    const start = (k: number): number => (side * side - (side >> (k - 1)) ** 2) / 3;
    for (let k = 1; k <= levels; k++) {
        const dim = side >> k;
        for (let cz = 0; cz < dim; cz++)
            for (let cx = 0; cx < dim; cx++) {
                let m = NO_HEIGHT;
                if (k === 1) {
                    for (let dz = 0; dz < 3; dz++)
                        for (let dx = 0; dx < 3; dx++) {
                            const x = 2 * cx + dx;
                            const z = 2 * cz + dz;
                            if (x < nx && z < nz) m = Math.max(m, heights[x + nx * z]!);
                        }
                } else {
                    const sd = side >> (k - 1);
                    const a = start(k - 1) + 2 * cx + sd * 2 * cz;
                    m = Math.max(
                        pyramid[a]!,
                        pyramid[a + 1]!,
                        pyramid[a + sd]!,
                        pyramid[a + sd + 1]!,
                    );
                }
                pyramid[start(k) + cx + dim * cz] = m;
            }
    }
    return { nx, nz, lo: [box[0], box[2]], hi: [box[1], box[3]], heights, side, levels, pyramid };
}

/** Altura bilinear do campo amostrado no ponto `g` da grade (nós). */
export function sampledHeight(f: SampledSurfaceField, gx: number, gz: number): number {
    const ix = Math.min(Math.floor(Math.max(gx, 0)), f.nx - 2);
    const iz = Math.min(Math.floor(Math.max(gz, 0)), f.nz - 2);
    const fx = Math.min(1, Math.max(0, gx - ix));
    const fz = Math.min(1, Math.max(0, gz - iz));
    const b = ix + f.nx * iz;
    const h = f.heights;
    return (
        (h[b]! * (1 - fx) + h[b + 1]! * fx) * (1 - fz)
        + (h[b + f.nx]! * (1 - fx) + h[b + f.nx + 1]! * fx) * fz
    );
}

/** Passos da marcha da GPU (`SURFACE_SHADOW_STEPS`). */
export const SURFACE_SHADOW_STEPS = 256;

/**
 * Espelho f64 da marcha da GPU (`surface_shadow_visibility`): a visibilidade do disco e os passos usados (com o
 * orçamento esgotado, a visibilidade do horizonte achado até ali).
 */
export function marchSurfaceVisibility(
    f: SampledSurfaceField,
    p: readonly [number, number, number],
    l: readonly [number, number, number],
    r: number,
    budget = SURFACE_SHADOW_STEPS,
): { visibility: number; steps: number } {
    const dir = elevationOf(l);
    if (dir === undefined) return { visibility: 1, steps: 0 };
    const { e } = dir;
    const sLo = Math.tan(Math.min(1.5, Math.max(-1.5, e - r)));
    const sHi = Math.tan(Math.min(1.5, Math.max(-1.5, e + r)));
    const n = [f.nx - 1, f.nz - 1] as const;
    const cell = [(f.hi[0] - f.lo[0]) / n[0], (f.hi[1] - f.lo[1]) / n[1]] as const;
    const g0 = [(p[0] - f.lo[0]) / cell[0], (p[2] - f.lo[1]) / cell[1]] as const;
    const ug = [dir.ux / cell[0], dir.uz / cell[1]] as const;
    const inv = ug.map((u) => (Math.abs(u) > 1e-12 ? 1 / u : 1e30)) as [number, number];
    const ta = [(0 - g0[0]) * inv[0], (0 - g0[1]) * inv[1]];
    const tb = [(n[0] - g0[0]) * inv[0], (n[1] - g0[1]) * inv[1]];
    const tIn = Math.max(Math.min(ta[0]!, tb[0]!), Math.min(ta[1]!, tb[1]!), 0);
    const tOut = Math.min(Math.max(ta[0]!, tb[0]!), Math.max(ta[1]!, tb[1]!));
    if (tOut <= tIn) return { visibility: 1, steps: 0 };
    let y0 = p[1];
    if (g0[0] >= 0 && g0[1] >= 0 && g0[0] <= n[0] && g0[1] <= n[1]) {
        const hc = sampledHeight(f, g0[0], g0[1]);
        if (p[1] >= hc - 0.5 * Math.max(cell[0], cell[1])) y0 = Math.max(p[1], hc);
    }
    const eps = 2e-3 / Math.max(Math.abs(ug[0]), Math.abs(ug[1]));
    let t = Math.max(tIn, eps);
    let s = sLo;
    let level = f.levels;
    const start = (k: number): number => (f.side * f.side - (f.side >> (k - 1)) ** 2) / 3;
    let steps = 0;
    for (; steps < budget; steps++) {
        if (t >= tOut) break;
        const gx = g0[0] + ug[0] * t;
        const gz = g0[1] + ug[1] * t;
        const size = 2 ** level;
        const dims = level === 0 ? [f.nx - 1, f.nz - 1] : [f.side >> level, f.side >> level];
        const cx = Math.min(Math.floor(Math.max(gx / size, 0)), dims[0]! - 1);
        const cz = Math.min(Math.floor(Math.max(gz / size, 0)), dims[1]! - 1);
        const b0 = [cx * size, cz * size];
        const tx =
            Math.abs(ug[0]) > 1e-12
                ? ((ug[0] > 0 ? b0[0]! + size : b0[0]!) - g0[0]) * inv[0]
                : 1e30;
        const tz =
            Math.abs(ug[1]) > 1e-12
                ? ((ug[1] > 0 ? b0[1]! + size : b0[1]!) - g0[1]) * inv[1]
                : 1e30;
        const tExit = Math.max(Math.min(tx, tz), t);
        // Saindo da célula: um nível acima só quando a seguinte está noutra célula do pai.
        const next = tExit + eps;
        const parent = 2 * size;
        const crossed =
            Math.floor(gx / parent) !== Math.floor((g0[0] + ug[0] * next) / parent)
            || Math.floor(gz / parent) !== Math.floor((g0[1] + ug[1] * next) / parent);
        let top: number;
        if (level === 0) {
            const b = cx + f.nx * cz;
            top = Math.max(
                f.heights[b]!,
                f.heights[b + 1]!,
                f.heights[b + f.nx]!,
                f.heights[b + f.nx + 1]!,
            );
        } else top = f.pyramid[start(level) + cx + (f.side >> level) * cz]!;
        if (top - y0 <= s * t) {
            t = next;
            if (crossed) level = Math.min(level + 1, f.levels);
            continue;
        }
        if (level > 0) {
            level--;
            continue;
        }
        const te = Math.min(tExit, tOut);
        const tm = 0.5 * (t + te);
        s = Math.max(
            s,
            (sampledHeight(f, g0[0] + ug[0] * tm, g0[1] + ug[1] * tm) - y0) / tm,
            (sampledHeight(f, g0[0] + ug[0] * te, g0[1] + ug[1] * te) - y0) / te,
        );
        if (s >= sHi) return { visibility: 0, steps: steps + 1 };
        t = next;
        if (crossed) level = 1;
    }
    return { visibility: diskFraction(Math.atan(s), e, r), steps };
}
