// Referência f64 do descarte do desenho conduzido pela GPU (spec 034, T060d) — as mesmas contas de
// `presentation/flows/draw_cull.wgsl`: a caixa da instância em mundo, o teste contra o tronco da vista, a hierarquia de
// profundidade (Hi-Z) da cena, o teste de oclusão por ela e a lista densa de cada grupo na ordem das instâncias.
// Matrizes em colunas, como no WGSL (`m[4·c + r]`); profundidade do WebGPU em [0, 1] (0 perto, limpa em 1).
import { mat4Apply, type Mat4, type Vec3 } from '../../math/reference/xform';
import {
    HZB_WIDTH,
    HZB_HEIGHT,
    HZB_SPAN_MAX,
    HZB_TILE_LEVELS,
    CULL_NEAR_W,
    CULL_DEPTH_BIAS,
    hzbLevels,
    hzbLevelSize,
    hzbLevelOffset,
    hzbWords,
    CULL_PROBE_PERIOD,
    CULL_USEFUL_DIVISOR,
} from '../cullLayout';

// O arranjo da hierarquia e os parâmetros do descarte são os de produção (`../cullLayout`), reexportados para os testes.
export {
    HZB_WIDTH,
    HZB_HEIGHT,
    HZB_SPAN_MAX,
    HZB_TILE_LEVELS,
    CULL_NEAR_W,
    CULL_DEPTH_BIAS,
    hzbLevels,
    hzbLevelSize,
    hzbLevelOffset,
    hzbWords,
    CULL_PROBE_PERIOD,
    CULL_USEFUL_DIVISOR,
};

/**
 * A hierarquia de profundidade de um alvo `width × height` (profundidade por pixel, linhas de cima para baixo): no nível
 * 0, o máximo dos pixels que tocam cada texel (conservador: a área do texel em uv contra a área de cada pixel); nos
 * outros, o máximo de 2 × 2 do nível de baixo. Texel que cobre mais de `HZB_SPAN_MAX` pixels num eixo fica longe (1).
 */
export function buildHzb(
    depth: ArrayLike<number>,
    width: number,
    height: number,
    hzbWidth = HZB_WIDTH,
    hzbHeight = HZB_HEIGHT,
): Float64Array {
    const out = new Float64Array(hzbWords(hzbWidth, hzbHeight));
    for (let y = 0; y < hzbHeight; y++)
        for (let x = 0; x < hzbWidth; x++) {
            const [x0, x1] = hzbPixelRange(x, hzbWidth, width);
            const [y0, y1] = hzbPixelRange(y, hzbHeight, height);
            let far = 0;
            if (x1 - x0 > HZB_SPAN_MAX || y1 - y0 > HZB_SPAN_MAX) far = 1;
            else
                for (let j = y0; j < y1; j++)
                    for (let i = x0; i < x1; i++) far = Math.max(far, depth[j * width + i]!);
            out[y * hzbWidth + x] = far;
        }
    const levels = hzbLevels(hzbWidth, hzbHeight);
    for (let k = 1; k < levels; k++) {
        const [w, h] = hzbLevelSize(k, hzbWidth, hzbHeight);
        const [bw, bh] = hzbLevelSize(k - 1, hzbWidth, hzbHeight);
        const base = hzbLevelOffset(k - 1, hzbWidth, hzbHeight);
        const offset = hzbLevelOffset(k, hzbWidth, hzbHeight);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                let far = 0;
                for (let dy = 0; dy < 2; dy++)
                    for (let dx = 0; dx < 2; dx++) {
                        const sx = Math.min(bw - 1, 2 * x + dx);
                        const sy = Math.min(bh - 1, 2 * y + dy);
                        far = Math.max(far, out[base + sy * bw + sx]!);
                    }
                out[offset + y * w + x] = far;
            }
    }
    return out;
}

/** Pixels `[início, fim)` de um eixo de `pixels` que tocam o texel `t` de um eixo de `texels` (pelo menos um). */
export function hzbPixelRange(t: number, texels: number, pixels: number): [number, number] {
    const start = Math.min(pixels - 1, Math.floor((t * pixels) / texels));
    const end = Math.max(start + 1, Math.min(pixels, Math.ceil(((t + 1) * pixels) / texels)));
    return [start, end];
}

/** Os seis planos do tronco de `viewProjection` (Gribb–Hartmann, profundidade em [0, 1]): `n·p + d ≥ 0` dentro. */
export function frustumPlanes(vp: Mat4): number[][] {
    const row = (r: number): number[] => [vp[r]!, vp[4 + r]!, vp[8 + r]!, vp[12 + r]!];
    const [r0, r1, r2, r3] = [row(0), row(1), row(2), row(3)];
    const add = (a: number[], b: number[], s: number): number[] => a.map((v, i) => v + s * b[i]!);
    return [add(r3, r0, 1), add(r3, r0, -1), add(r3, r1, 1), add(r3, r1, -1), r2, add(r3, r2, -1)];
}

/** A caixa do objeto (`lo`, `hi`) em mundo pela matriz `m`: centro e meia-extensão (Arvo). */
export function worldBox(m: Mat4, lo: Vec3, hi: Vec3): { center: Vec3; extent: Vec3 } {
    const c: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const e: Vec3 = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
    const p = mat4Apply(m, [c[0], c[1], c[2], 1]);
    const axis = (r: number): number =>
        Math.abs(m[r]!) * e[0] + Math.abs(m[4 + r]!) * e[1] + Math.abs(m[8 + r]!) * e[2];
    return { center: [p[0]!, p[1]!, p[2]!], extent: [axis(0), axis(1), axis(2)] };
}

/** A caixa está toda fora de algum plano do tronco. */
export function outsideFrustum(planes: readonly number[][], center: Vec3, extent: Vec3): boolean {
    for (const n of planes) {
        const d = n[0]! * center[0] + n[1]! * center[1] + n[2]! * center[2] + n[3]!;
        const r =
            Math.abs(n[0]!) * extent[0] + Math.abs(n[1]!) * extent[1] + Math.abs(n[2]!) * extent[2];
        if (d + r < 0) return true;
    }
    return false;
}

/**
 * A caixa está escondida pela hierarquia: o retângulo dela na tela (os 8 cantos por `vp`), aumentado de um texel do
 * nível 0 de cada lado (o deslocamento da amostra do antisserrilhado temporal), lido no nível em que cabe em 2 × 2
 * texels; escondida se o ponto mais perto dela está atrás do mais longe da hierarquia ali (com a folga
 * `CULL_DEPTH_BIAS`). Canto no plano da câmera ou
 * atrás: visível.
 */
export function occluded(
    hzb: ArrayLike<number>,
    vp: Mat4,
    center: Vec3,
    extent: Vec3,
    hzbWidth = HZB_WIDTH,
    hzbHeight = HZB_HEIGHT,
): boolean {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
        const p: [number, number, number, number] = [
            center[0] + (i & 1 ? extent[0] : -extent[0]),
            center[1] + (i & 2 ? extent[1] : -extent[1]),
            center[2] + (i & 4 ? extent[2] : -extent[2]),
            1,
        ];
        const clip = mat4Apply(vp, p);
        if (clip[3]! <= CULL_NEAR_W) return false;
        const x = clip[0]! / clip[3]!;
        const y = clip[1]! / clip[3]!;
        const z = clip[2]! / clip[3]!;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
    }
    if (minZ <= 0) return false;
    // uv: x para a direita, y para baixo.
    const u0 = Math.min(1, Math.max(0, minX * 0.5 + 0.5)) * hzbWidth - 1;
    const u1 = Math.min(1, Math.max(0, maxX * 0.5 + 0.5)) * hzbWidth + 1;
    const v0 = Math.min(1, Math.max(0, 0.5 - maxY * 0.5)) * hzbHeight - 1;
    const v1 = Math.min(1, Math.max(0, 0.5 - minY * 0.5)) * hzbHeight + 1;
    const levels = hzbLevels(hzbWidth, hzbHeight);
    const size = Math.max(u1 - u0, v1 - v0, 1);
    const level = Math.min(levels - 1, Math.max(0, Math.ceil(Math.log2(size))));
    const [w, h] = hzbLevelSize(level, hzbWidth, hzbHeight);
    const scale = 2 ** level;
    const x0 = Math.min(w - 1, Math.max(0, Math.floor(u0 / scale)));
    const x1 = Math.min(w - 1, Math.max(0, Math.floor(u1 / scale)));
    const y0 = Math.min(h - 1, Math.max(0, Math.floor(v0 / scale)));
    const y1 = Math.min(h - 1, Math.max(0, Math.floor(v1 / scale)));
    const offset = hzbLevelOffset(level, hzbWidth, hzbHeight);
    const at = (x: number, y: number): number => hzb[offset + y * w + x]!;
    const far = Math.max(at(x0, y0), at(x1, y0), at(x0, y1), at(x1, y1));
    return minZ > far + CULL_DEPTH_BIAS;
}

/** Um grupo de desenho: a primeira posição na lista de instâncias e a contagem. */
export interface CullGroup {
    readonly first: number;
    readonly count: number;
}

/**
 * A lista densa de cada grupo na ordem das instâncias (a soma de prefixos inclusiva das marcas, como na GPU): as
 * instâncias marcadas de cada grupo a partir da primeira posição dele.
 */
export function compactGroups(
    keep: ArrayLike<number>,
    values: ArrayLike<number>,
    groups: readonly CullGroup[],
): { readonly lists: number[][]; readonly counts: number[] } {
    const lists = groups.map((g) => {
        const out: number[] = [];
        for (let s = g.first; s < g.first + g.count; s++) if (keep[s]) out.push(values[s]!);
        return out;
    });
    return { lists, counts: lists.map((l) => l.length) };
}

/** As medidas de um quadro do descarte: as escondidas na fase 2, as candidatas a ela e as desenhadas na fase 1. */
export interface CullStats {
    readonly occluded: number;
    readonly candidates: number;
    readonly drawn: number;
}

/**
 * A política do descarte pela oclusão, decidida na GPU a cada quadro pelo estado e pelas medidas do anterior (a série
 * das medidas): a palavra de estado tem a hierarquia montada neste quadro (bit 0), o teste contra a do anterior (bit 1),
 * o descarte ligado (bit 2) e o contador de quadros (bits 8 em diante). A hierarquia é montada enquanto a oclusão se paga
 * (`CULL_USEFUL_DIVISOR`), no quadro de experimentar (`CULL_PROBE_PERIOD`, e no primeiro com o descarte ligado de novo)
 * e no seguinte a uma montagem sem teste (para testar); o teste vale quando o quadro anterior a montou e a série
 * continua.
 */
export function cullPolicy(
    previousState: number,
    stats: CullStats,
    enabled: boolean,
    continuous: boolean,
): number {
    const built = (previousState & 1) !== 0;
    const tested = (previousState & 2) !== 0;
    const wasEnabled = (previousState & 4) !== 0;
    const counter = previousState >>> 8;
    const useful =
        tested
        && stats.occluded > 0
        && stats.occluded * CULL_USEFUL_DIVISOR >= stats.drawn + stats.candidates;
    const probe = counter % CULL_PROBE_PERIOD === 0 || !wasEnabled;
    const build = enabled && (useful || probe || (built && !tested));
    const test = enabled && continuous && built;
    const bits = (build ? 1 : 0) | (test ? 2 : 0) | (enabled ? 4 : 0);
    return (bits | (((counter + 1) & 0xffffff) << 8)) >>> 0;
}
