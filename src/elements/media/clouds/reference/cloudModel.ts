// Referência f64 das nuvens volumétricas (spec 041, R5–R8, R11, R16): o espelho do que os módulos `gpu/wgsl/clouds/*`
// calculam — o perfil de altura por tipo, a fase de Mie aproximada de Jendersie & d'Eon (2023), a densidade (cobertura,
// forma e erosão a partir dos volumes de ruído, que aqui são montados pela mesma função de forma em u32), a
// transmitância por marcha, o mapa de transmitância visto do sol e a aproximação do espalhamento múltiplo por oitavas
// (Wrenninge 2013; Hillaire 2016). Só para testes e smokes: a produção não importa daqui.
// Unidades: metros na cena, +y para cima; o planeta centrado em (0, −R, 0), R = raio do chão da cena (y = 0).

import { noiseCellular3, noiseFbm3, noiseGradient2 } from '../../../nodes/reference/noiseNodes';

export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** `smoothstep` do WGSL. */
export function smoothstep(a: number, b: number, x: number): number {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
}
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** `remap(v, l0, h0, l1, h1)`: o intervalo [l0, h0] levado a [l1, h1] (sem saturar). */
export function remap(v: number, l0: number, h0: number, l1: number, h1: number): number {
    return l1 + ((v - l0) * (h1 - l1)) / (h0 - l0);
}

// ---------------------------------------------------------------------------------------------------------------------
// Fase de Mie aproximada (Jendersie & d'Eon 2023, Eq. 2–7)

/** Os quatro parâmetros da fase pelo diâmetro médio das gotículas (µm, ajuste do artigo para 5–50 µm). */
export interface JdeParams {
    readonly gHG: number;
    readonly gD: number;
    readonly alpha: number;
    readonly wD: number;
}

/** Eq. 4–7 do artigo (5 µm ≤ d ≤ 50 µm). */
export function jdeParams(d: number): JdeParams {
    return {
        gHG: Math.exp(-0.0990567 / (d - 1.67154)),
        gD: Math.exp(-2.20679 / (d + 3.91029) - 0.428934),
        alpha: Math.exp(3.62489 - 8.29288 / (d + 5.52825)),
        wD: Math.exp(-0.599085 / (d - 0.641583) - 0.665888),
    };
}

/** Henyey-Greenstein normalizada (1 em 4π). */
export function hgPhase(c: number, g: number): number {
    const d = 1 + g * g - 2 * g * c;
    return (1 - g * g) / (4 * Math.PI * d * Math.sqrt(d));
}

/** Draine (2003, Eq. 2 do artigo): HG × (1 + α cos²) / (1 + α (1 + 2g²) / 3). */
export function drainePhase(c: number, g: number, alpha: number): number {
    return (hgPhase(c, g) * (1 + alpha * c * c)) / (1 + (alpha * (1 + 2 * g * g)) / 3);
}

/** A fase da nuvem (Eq. 3): `(1 − w_D)·HG(g_HG) + w_D·Draine(g_D, α)`, com as anisotropias × `gScale` (oitavas). */
export function jdePhase(c: number, p: JdeParams, gScale = 1): number {
    return (1 - p.wD) * hgPhase(c, p.gHG * gScale) + p.wD * drainePhase(c, p.gD * gScale, p.alpha);
}

// ---------------------------------------------------------------------------------------------------------------------
// Perfil de altura por tipo (R5)

/** Limites [subida0, subida1, descida0, descida1] da fração de altura de estrato, cúmulo e cúmulo-nimbo. */
export const CLOUD_PROFILES = {
    stratus: [0.0, 0.1, 0.2, 0.3],
    cumulus: [0.0, 0.25, 0.6, 0.95],
    cumulonimbus: [0.0, 0.1, 0.8, 1.0],
} as const;

/** Limites do perfil no tipo `t` ∈ [0, 1] (0 estrato → 0,5 cúmulo → 1 cúmulo-nimbo), lineares por trecho. */
export function profileLimits(t: number): [number, number, number, number] {
    const tt = clamp01(t);
    const [a, b, k] =
        tt <= 0.5
            ? [CLOUD_PROFILES.stratus, CLOUD_PROFILES.cumulus, tt * 2]
            : [CLOUD_PROFILES.cumulus, CLOUD_PROFILES.cumulonimbus, tt * 2 - 1];
    return [0, 1, 2, 3].map((i) => mix(a[i]!, b[i]!, k)) as [number, number, number, number];
}

/**
 * A água da torre (spec 041, R19): o fator da extinção na altitude `alt` (m) com o topo do tempo bom `fair` (m). Acima do
 * topo do tempo bom a água adiabática cresce com a altura (~1–3 g/m³ no núcleo do cúmulo-nimbo contra ~0,3–0,5 no cúmulo
 * raso): o fator vai de 1 a 1 + `gain` em `depth` metros; da glaciação em diante (`glaciation`, m: −20 °C a −38 °C na
 * atmosfera padrão) os cristais de gelo maiores o trazem de volta a 1. Sem o tempo (o topo do tempo bom é o da casca), 1.
 */
export const CLOUD_WATER = { gain: 2, depth: 3000, glaciation: [5500, 8500] } as const;

export function towerWater(alt: number, fair: number): number {
    const liquid = 1 + CLOUD_WATER.gain * clamp01((alt - fair) / CLOUD_WATER.depth);
    return mix(liquid, 1, smoothstep(CLOUD_WATER.glaciation[0], CLOUD_WATER.glaciation[1], alt));
}

/**
 * A bigorna do cúmulo-nimbo (spec 041, R19): a lâmina de gelo no nível de equilíbrio — `depth` metros com o topo
 * `ceiling` metros abaixo da tropopausa (as torres mais fortes passam acima: o topo saliente) —, extinção `water` × a da
 * camada (IWC ~0,1 g/m³, raio efetivo ~30 µm), levada pelo vento da alta troposfera.
 */
export const CLOUD_ANVIL = { depth: 2000, ceiling: 800, water: 0.25 } as const;

/** O perfil vertical da bigorna na altitude `alt` (m) com a tropopausa `top` (m): base plana, topo arredondado. */
export function anvilProfile(alt: number, top: number): number {
    const x = (alt - (top - CLOUD_ANVIL.ceiling - CLOUD_ANVIL.depth)) / CLOUD_ANVIL.depth;
    if (x <= 0 || x >= 1) return 0;
    return smoothstep(0, 0.25, x) * (1 - smoothstep(0.7, 1, x));
}

/**
 * A fração do caminho entre o topo do tempo bom e o do estado a que sobe a torre de tipo local `t`: as células mais
 * fortes (≥ 0,95) vão à tropopausa, as de 0,55 ficam no topo do tempo bom.
 */
export function towerReach(t: number): number {
    return smoothstep(0.55, 0.95, t);
}

/** O perfil de altura: a rampa de subida na base × a de descida no topo, em [0, 1]. */
export function heightProfile(h: number, t: number): number {
    if (h < 0 || h > 1) return 0;
    const [r0, r1, f0, f1] = profileLimits(t);
    return smoothstep(r0, r1, h) * (1 - smoothstep(f0, f1, h));
}

// ---------------------------------------------------------------------------------------------------------------------
// Volumes de ruído (R3)

/** Volume periódico rgba (a mesma representação do `rgba8unorm` da GPU). */
export interface CloudVolume {
    readonly size: number;
    /** `size³ × 4`, x mais rápido, depois y, depois z. */
    readonly data: Float32Array;
}

/**
 * A forma padrão (o grafo de `defaultShape.ts`) em u32: R = Perlin-Worley — o fBm de gradiente com período 4 (±0,5 → [0, 1])
 * remapeado para cima pelo fBm de Worley invertido (Schneider 2015) —, G/B/A = fBm de Worley em 4, 8 e 16 células por
 * período. `p` em [0, 1)³.
 */
export function defaultShape(p: Vec3): Vec4 {
    const worley = (f: number): number => clamp01(1 - noiseCellular3(p, f, [0, 0, 0], 0, 1, f).f1);
    const wfbm = (f: number): number =>
        worley(f) * 0.625 + worley(2 * f) * 0.25 + worley(4 * f) * 0.125;
    const perlin = clamp01(noiseFbm3(p, 4, [0, 0, 0], 0, 4, 2, 0.5, 0, 4) + 0.5);
    const w4 = wfbm(4);
    return [clamp01(remap(perlin, 0, 1, w4, 1)), w4, wfbm(8), wfbm(16)];
}

/** Constrói o volume `size³` avaliando `shape` no centro de cada texel, quantizado a 8 bits como o `rgba8unorm`. */
export function buildVolume(shape: (p: Vec3) => Vec4, size: number, quantize = true): CloudVolume {
    const data = new Float32Array(size * size * size * 4);
    for (let z = 0; z < size; z++)
        for (let y = 0; y < size; y++)
            for (let x = 0; x < size; x++) {
                const v = shape([(x + 0.5) / size, (y + 0.5) / size, (z + 0.5) / size]);
                const o = ((z * size + y) * size + x) * 4;
                for (let c = 0; c < 4; c++) {
                    const s = clamp01(Number.isFinite(v[c]!) ? v[c]! : 0);
                    data[o + c] = quantize ? Math.round(s * 255) / 255 : s;
                }
            }
    return { size, data };
}

/** Leitura trilinear com repetição (`textureSampleLevel` com `repeat` e filtro linear). */
export function sampleVolume(v: CloudVolume, u: Vec3): Vec4 {
    const n = v.size;
    const out = [0, 0, 0, 0];
    const base: number[] = [];
    const frac: number[] = [];
    for (let k = 0; k < 3; k++) {
        const x = u[k]! * n - 0.5;
        const f = Math.floor(x);
        base.push(f);
        frac.push(x - f);
    }
    const wrap = (i: number): number => ((i % n) + n) % n;
    for (let dz = 0; dz < 2; dz++)
        for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) {
                const w =
                    (dx ? frac[0]! : 1 - frac[0]!)
                    * (dy ? frac[1]! : 1 - frac[1]!)
                    * (dz ? frac[2]! : 1 - frac[2]!);
                const o =
                    ((wrap(base[2]! + dz) * n + wrap(base[1]! + dy)) * n + wrap(base[0]! + dx)) * 4;
                for (let c = 0; c < 4; c++) out[c]! += w * v.data[o + c]!;
            }
    return out as unknown as Vec4;
}

// ---------------------------------------------------------------------------------------------------------------------
// Campo da cobertura global (R4)

/** Células do campo (1/m), desvio padrão do fBm de 3 oitavas (medido) e a amplitude da variação da cobertura local. */
export const CLOUD_COVERAGE_SCALE = 1 / 8000;
export const CLOUD_COVERAGE_SIGMA = 0.2014;
export const CLOUD_COVERAGE_SPREAD = 0.4;
/** Área coberta medida em g = 0, 0,1, …, 0,7 (cúmulo e estrato), com os volumes completos (research.md, R4). */
export const CLOUD_AREA_CUMULUS = [0, 0.016, 0.142, 0.37, 0.604, 0.834, 0.975, 0.999] as const;
export const CLOUD_AREA_STRATUS = [0, 0.004, 0.063, 0.242, 0.476, 0.72, 0.914, 0.989] as const;

/** A inversa da área coberta (`cloud_coverage_inverse`). */
export function coverageInverse(c: number, stratus: boolean): number {
    if (c <= 0) return -1;
    if (c >= 1) return 1.2;
    const t = stratus ? CLOUD_AREA_STRATUS : CLOUD_AREA_CUMULUS;
    for (let k = 1; k < 8; k++)
        if (c <= t[k]!) return (k - 1 + (c - t[k - 1]!) / Math.max(t[k]! - t[k - 1]!, 1e-6)) * 0.1;
    return 0.7 + ((c - 0.999) / 0.001) * 0.5;
}

/** O campo uniforme de grande escala `u` em `(x, z)` (m). */
export function coverageUniform(x: number, z: number): number {
    const f32 = Math.fround;
    const q = [f32(x * CLOUD_COVERAGE_SCALE), f32(z * CLOUD_COVERAGE_SCALE)];
    let s = 0;
    let a = 1;
    let n = 0;
    let f = 1;
    for (let k = 0; k < 3; k++) {
        s += a * noiseGradient2([f32(q[0]! * f), f32(q[1]! * f)], 1, [0, 0], k);
        n += a;
        a *= 0.5;
        f *= 2;
    }
    return 1 / (1 + Math.exp((-1.702 * (s / n)) / CLOUD_COVERAGE_SIGMA));
}

/** Células (1/m) e amplitude do campo do tipo (o desenvolvimento vertical) em volta do tipo pedido. */
export const CLOUD_TYPE_SCALE = 1 / 3000;
export const CLOUD_TYPE_SPREAD = 0.8;

/**
 * O tipo local padrão em `(x, z)` para o tipo pedido `t` (`cloud_type_field`): `t + 0,8·(u₂ − 0,5)`, `u₂` o campo uniforme
 * de 2 oitavas de gradiente com células de 3 km e sementes próprias. Num campo de cúmulos uma nuvem sobe mais que a
 * outra (a convecção de cada célula): com o tipo igual em todo ponto, o topo de todas as nuvens ficava na mesma altura
 * — a curva de nível do perfil (topo mediano 3106 m, p90 3219 m numa camada de 1500 a 4000 m).
 */
export function typeField(x: number, z: number, t: number): number {
    const f32 = Math.fround;
    const q = [f32(x * CLOUD_TYPE_SCALE), f32(z * CLOUD_TYPE_SCALE)];
    let s = 0;
    let a = 1;
    let n = 0;
    let f = 1;
    for (let k = 0; k < 2; k++) {
        s += a * noiseGradient2([f32(q[0]! * f), f32(q[1]! * f)], 1, [0, 0], k + 3);
        n += a;
        a *= 0.5;
        f *= 2;
    }
    const u = 1 / (1 + Math.exp((-1.702 * (s / n)) / CLOUD_COVERAGE_SIGMA));
    return clamp01(t + CLOUD_TYPE_SPREAD * (u - 0.5));
}

/** A cobertura local padrão em `(x, z)` para a cobertura pedida `c` e o tipo `t` (`cloud_coverage_field`). */
export function coverageField(x: number, z: number, c: number, t: number): number {
    const k = clamp01(t * 2);
    const g = coverageInverse(c, true) * (1 - k) + coverageInverse(c, false) * k;
    return clamp01(g + CLOUD_COVERAGE_SPREAD * (coverageUniform(x, z) - 0.5));
}

// ---------------------------------------------------------------------------------------------------------------------
// Camada e densidade (R4–R6)

/** Fração de erosão do detalhe (Schneider 2017). */
export const CLOUD_EROSION = 0.35;
/** Inclinação do vento pela altura: o topo adiantado de `CLOUD_SKEW × espessura` na direção do vento. */
export const CLOUD_SKEW = 0.5;

/** A camada como a marcha a vê (os valores empacotados do `CloudLayer` e do `Sky`). */
export interface CloudModel {
    /** Distância do centro do planeta ao chão da cena (m). */
    readonly groundRadius: number;
    readonly base: number;
    readonly top: number;
    /**
     * Cobertura, tipo, densidade relativa e (opcional) a fração de altura do topo das nuvens na casca no ponto horizontal
     * (m) — o mapa de cobertura (ou os valores globais). Sem o quarto valor, o topo é o da casca (1).
     */
    readonly coverage: (x: number, z: number) => Vec3 | Vec4;
    /** Extinção (1/m) na densidade 1. */
    readonly density: number;
    readonly albedo: number;
    readonly shape: CloudVolume;
    readonly detail: CloudVolume;
    readonly shapeScale: number;
    readonly detailScale: number;
    /** Deslocamentos (m) da forma e do detalhe: `vento · tempo` (no detalhe, mais a deriva vertical). */
    readonly shapeOffset: Vec3;
    readonly detailOffset: Vec3;
    /** Direção unitária do vento no plano (x, z) — a inclinação do topo. */
    readonly windDir: readonly [number, number];
    /**
     * O tempo (R19): o topo do tempo bom como fração da casca e o deslocamento (m, x e z) da bigorna. Com ele, o terceiro
     * valor da cobertura é a cobertura da bigorna (a densidade relativa é 1) e o quarto, o topo do estado.
     */
    readonly weather?: {
        readonly fairTop: number;
        readonly anvilOffset: readonly [number, number];
    };
}

/** Altitude (m acima do chão da cena) de um ponto. */
export function altitude(m: CloudModel, x: Vec3): number {
    const R = m.groundRadius;
    return Math.hypot(x[0], x[1] + R, x[2]) - R;
}

/** Fração de altura na camada (pode sair de [0, 1]). */
export function heightFraction(m: CloudModel, x: Vec3): number {
    return (altitude(m, x) - m.base) / (m.top - m.base);
}

/** A forma sem erosão da cobertura `c` no ponto `ps` do volume com o perfil `profile`. */
function shapeCover(m: CloudModel, ps: Vec3, c: number, profile: number): number {
    const s = sampleVolume(m.shape, ps);
    const lowFbm = s[1] * 0.625 + s[2] * 0.25 + s[3] * 0.125;
    const base = remap(s[0], lowFbm - 1, 1, 0, 1) * profile;
    return c >= 1 ? base : remap(base, 1 - c, 1, 0, 1) * c;
}

/**
 * O peso de um canal do detalhe cuja oitava mais fina tem células de `cell` metros na pegada `fp` do pixel da marcha: 1
 * com a célula de duas pegadas ou mais, 0 com uma ou menos (0 sem pegada: o detalhe inteiro).
 */
export function detailWeight(cell: number, fp: number): number {
    return fp > 0 ? clamp01(cell / fp - 1) : 1;
}

/**
 * A erosão das bordas pelo volume de detalhe na fração de altura local `hl`, com os canais B e A cedendo ao mais grosso
 * quando a oitava mais fina deles (o período/32 e /64) fica abaixo da pegada `fp` (m).
 */
function erode(m: CloudModel, x: Vec3, c: number, hl: number, fp: number): number {
    const pd: Vec3 = [
        (x[0] - m.detailOffset[0]) / m.detailScale,
        (x[1] - m.detailOffset[1]) / m.detailScale,
        (x[2] - m.detailOffset[2]) / m.detailScale,
    ];
    const d = sampleVolume(m.detail, pd);
    const b = mix(d[1], d[2], detailWeight(m.detailScale / 32, fp));
    const a = mix(b, d[3], detailWeight(m.detailScale / 64, fp));
    const hf = d[1] * 0.625 + b * 0.25 + a * 0.125;
    const hfm = mix(hf, 1 - hf, clamp01(hl * 10));
    return Math.max(0, remap(c, hfm * CLOUD_EROSION, 1, 0, 1));
}

/**
 * Densidade relativa (≥ 0) da nuvem em `x` (a extinção é ela × `density`): a torre (o perfil até o topo local, a forma,
 * a erosão e a água) e, com o tempo, a bigorna; a maior das duas. `footprint` (m): a pegada do pixel da marcha (o detalhe
 * abaixo dela cede ao mais grosso; 0: o detalhe inteiro).
 */
export function cloudDensity(m: CloudModel, x: Vec3, footprint = 0): number {
    const h = heightFraction(m, x);
    if (h <= 0 || h >= 1) return 0;
    const cv = m.coverage(x[0], x[2]);
    const [c0, t, dr] = cv;
    const w = m.weather;
    const alt = m.base + h * (m.top - m.base);
    let result = 0;
    if (c0 > 0) {
        const fair = w?.fairTop ?? 1;
        let top = cv.length > 3 ? (cv as Vec4)[3] : 1;
        if (w !== undefined && top > fair) top = fair + (top - fair) * towerReach(t);
        // A fração de altura local: o perfil vai da base ao topo das nuvens no ponto (o tempo, R19), não ao da casca.
        const hl = top >= 1 ? h : h / Math.max(top, 1e-3);
        const H = hl < 1 ? heightProfile(hl, t) : 0;
        if (H > 0) {
            const skew = CLOUD_SKEW * (m.top - m.base) * h;
            const ps: Vec3 = [
                (x[0] - m.shapeOffset[0] - m.windDir[0] * skew) / m.shapeScale,
                (x[1] - m.shapeOffset[1]) / m.shapeScale,
                (x[2] - m.shapeOffset[2] - m.windDir[1] * skew) / m.shapeScale,
            ];
            const c = shapeCover(m, ps, c0, H);
            const k =
                towerWater(alt, m.base + fair * (m.top - m.base))
                * (w === undefined ? Math.max(0, dr) : 1);
            if (c > 0) result = erode(m, x, c, hl, footprint) * k;
        }
    }
    if (w !== undefined && dr > 0) {
        const H = anvilProfile(alt, m.top);
        if (H > 0) {
            const pa: Vec3 = [
                (x[0] - w.anvilOffset[0]) / m.shapeScale,
                x[1] / m.shapeScale,
                (x[2] - w.anvilOffset[1]) / m.shapeScale,
            ];
            const c = shapeCover(m, pa, dr, H);
            if (c > 0) result = Math.max(result, erode(m, x, c, 1, footprint) * CLOUD_ANVIL.water);
        }
    }
    return result;
}

/** Interseção do raio com a esfera de raio `r` centrada em (0, −R, 0): [t0, t1] ou nada. */
export function sphereSpan(
    m: CloudModel,
    o: Vec3,
    d: Vec3,
    radius: number,
): [number, number] | undefined {
    const oc: Vec3 = [o[0], o[1] + m.groundRadius, o[2]];
    const b = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2];
    const c = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return undefined;
    const s = Math.sqrt(disc);
    return [-b - s, -b + s];
}

/**
 * Trechos do raio dentro da casca (entre a base e o topo), até `tMax` e até o chão do planeta: 0, 1 ou 2 trechos (o
 * raio de baixo que corta a casca, ou o de dentro/de cima que pode entrar e sair duas vezes perto do horizonte).
 */
export function shellSegments(m: CloudModel, o: Vec3, d: Vec3, tMax: number): [number, number][] {
    const outer = sphereSpan(m, o, d, m.groundRadius + m.top);
    if (outer === undefined) return [];
    const inner = sphereSpan(m, o, d, m.groundRadius + m.base);
    // O chão do planeta tapa o que está além dele.
    const ground = sphereSpan(m, o, d, m.groundRadius);
    const end = ground !== undefined && ground[0] > 0 ? Math.min(tMax, ground[0]) : tMax;
    const a = Math.max(0, outer[0]);
    const b = Math.min(end, outer[1]);
    if (b <= a) return [];
    if (inner === undefined || inner[1] <= a || inner[0] >= b) return [[a, b]];
    const out: [number, number][] = [];
    if (inner[0] > a) out.push([a, Math.min(inner[0], b)]);
    if (inner[1] < b) out.push([Math.max(inner[1], a), b]);
    return out;
}

/** Profundidade ótica da nuvem de `x` ao longo de `dir` até sair da casca (`steps` passos por trecho, meio ponto). */
export function opticalDepth(m: CloudModel, x: Vec3, dir: Vec3, steps = 256): number {
    let tau = 0;
    for (const [a, b] of shellSegments(m, x, dir, Infinity)) {
        const dt = (b - a) / steps;
        for (let i = 0; i < steps; i++) {
            const t = a + (i + 0.5) * dt;
            tau += cloudDensity(m, [x[0] + dir[0] * t, x[1] + dir[1] * t, x[2] + dir[2] * t]) * dt;
        }
    }
    return tau * m.density;
}

// ---------------------------------------------------------------------------------------------------------------------
// Espalhamento por oitavas (R8)

/** Os coeficientes das oitavas (`a` atenua a profundidade ótica, `b` a energia, `c` a anisotropia) e quantas. */
export interface CloudOctaves {
    readonly count: number;
    readonly a: number;
    readonly b: number;
    readonly c: number;
}

/**
 * Luz espalhada para a câmera por unidade de comprimento e de iluminância do sol num ponto com extinção `sigmaT`
 * (1/m), profundidade ótica até o sol `tauSun` e cosseno `cosTheta` entre a vista e o sol: `Σ bⁱ σs e^(−aⁱ τ) p(cⁱ g)`.
 */
export function octaveScattering(
    sigmaT: number,
    albedo: number,
    tauSun: number,
    cosTheta: number,
    phase: JdeParams,
    o: CloudOctaves,
): number {
    let sum = 0;
    for (let i = 0; i < o.count; i++)
        sum += o.b ** i * Math.exp(-(o.a ** i) * tauSun) * jdePhase(cosTheta, phase, o.c ** i);
    return sum * sigmaT * albedo;
}

/** Luz que chega a um ponto: a do sol (direção para ele e iluminância já atenuada pela atmosfera) e a do ambiente. */
export interface CloudLighting {
    readonly sunDir: Vec3;
    readonly sun: Vec3;
    /** Radiância média do céu (hemisfério de cima) e do chão (hemisfério de baixo). */
    readonly ambientUp: Vec3;
    readonly ambientDown: Vec3;
    /** A luz do sol num ponto (a iluminância × a transmitância da atmosfera até ele); sem: `sun` em todo ponto. */
    readonly sunAt?: (x: Vec3) => Vec3;
    /** A profundidade ótica até o sol num ponto; sem: a integral até a saída da casca. */
    readonly sunDepth?: (x: Vec3) => number;
    /**
     * O cache de espalhamento (T023, R8): o feixe do sol com o pico de frente transmitido (`e^(−kT·τ)`, δ-M) espalhado pela
     * fase completa, e no lugar das oitavas ≥ 1 e do ambiente local a luz das sondas, que recebe essa estimativa local
     * (`prior`, na mesma unidade: radiância) para a mistura pela contagem de caminhos.
     */
    readonly scatter?: { readonly kT: number; readonly light: (x: Vec3, prior: Vec3) => Vec3 };
}

/**
 * A profundidade ótica até o sol pelo cone curto do shader (`cloud_sun_depth`): `steps` trechos de comprimento
 * `espessura/48 · 0,5 · 1,5^i` (a espessura do tempo bom), a densidade no meio de cada um, e o resto até a saída da casca integrado.
 */
export function coneSunDepth(m: CloudModel, x: Vec3, sun: Vec3, steps = 6): number {
    const base = ((m.top - m.base) * (m.weather?.fairTop ?? 1)) / 48;
    let tau = 0;
    let t = 0;
    for (let i = 0; i < steps; i++) {
        const len = base * 0.5 * 1.5 ** i;
        const p: Vec3 = [
            x[0] + sun[0] * (t + 0.5 * len),
            x[1] + sun[1] * (t + 0.5 * len),
            x[2] + sun[2] * (t + 0.5 * len),
        ];
        tau += cloudDensity(m, p) * len;
        t += len;
    }
    const end: Vec3 = [x[0] + sun[0] * t, x[1] + sun[1] * t, x[2] + sun[2] * t];
    return tau * m.density + opticalDepth(m, end, sun, 128);
}

/** Resultado de uma marcha: luz espalhada (rgb), transmitância e profundidade média ponderada pela opacidade (m). */
export interface CloudMarch {
    readonly scattered: Vec3;
    readonly transmittance: number;
    readonly depth: number;
}

/**
 * Marcha de referência da camada pelo modelo de oitavas (o que o shader aproxima com passos grossos e a autossombra
 * curta): `steps` passos por trecho da casca até `tMax`, a profundidade ótica até o sol integrada até a saída da casca
 * com `sunSteps` passos, o ambiente pela fração de altura (céu em cima, chão embaixo), a integral analítica por passo
 * (Hillaire 2016: `S·(1 − e^(−σt·dt))/σt`). `pixel` (rad): o ângulo do pixel da marcha da GPU — a pegada do detalhe na
 * amostra da vista (`cloudDensity`); 0, o detalhe inteiro.
 */
export function marchCloud(
    m: CloudModel,
    o: Vec3,
    d: Vec3,
    tMax: number,
    light: CloudLighting,
    phase: JdeParams,
    octaves: CloudOctaves,
    steps = 256,
    sunSteps = 64,
    pixel = 0,
): CloudMarch {
    let T = 1;
    const L = [0, 0, 0];
    let depthSum = 0;
    let weight = 0;
    const cosTheta = d[0] * light.sunDir[0] + d[1] * light.sunDir[1] + d[2] * light.sunDir[2];
    for (const [a, b] of shellSegments(m, o, d, tMax)) {
        const dt = (b - a) / steps;
        for (let i = 0; i < steps; i++) {
            const t = a + (i + 0.5) * dt;
            const x: Vec3 = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
            const rho = cloudDensity(m, x, t * pixel);
            if (rho <= 0) continue;
            const sigmaT = rho * m.density;
            const tau = light.sunDepth?.(x) ?? opticalDepth(m, x, light.sunDir, sunSteps);
            const h = clamp01(heightFraction(m, x));
            const sunLight = light.sunAt?.(x) ?? light.sun;
            const stepT = Math.exp(-sigmaT * dt);
            const integ = (1 - stepT) / sigmaT;
            if (light.scatter !== undefined) {
                const single = Math.exp(-light.scatter.kT * tau) * jdePhase(cosTheta, phase);
                const higher =
                    octaveScattering(1, 1, tau, cosTheta, phase, octaves)
                    - Math.exp(-tau) * jdePhase(cosTheta, phase);
                const prior = [0, 1, 2].map(
                    (c) =>
                        higher * sunLight[c]!
                        + light.ambientUp[c]! * h
                        + light.ambientDown[c]! * (1 - h),
                ) as unknown as Vec3;
                const J = light.scatter.light(x, prior);
                for (let c = 0; c < 3; c++)
                    L[c]! += T * sigmaT * m.albedo * (single * sunLight[c]! + J[c]!) * integ;
            } else {
                const sun = octaveScattering(sigmaT, m.albedo, tau, cosTheta, phase, octaves);
                for (let c = 0; c < 3; c++) {
                    const amb =
                        sigmaT
                        * m.albedo
                        * (light.ambientUp[c]! * h + light.ambientDown[c]! * (1 - h));
                    L[c]! += T * (sun * sunLight[c]! + amb) * integ;
                }
            }
            const alpha = T * (1 - stepT);
            depthSum += alpha * t;
            weight += alpha;
            T *= stepT;
            if (T < 1e-6) break;
        }
    }
    return {
        scattered: L as unknown as Vec3,
        transmittance: T,
        depth: weight > 0 ? depthSum / weight : Infinity,
    };
}

// ---------------------------------------------------------------------------------------------------------------------
// Mapa de profundidade ótica visto do sol (R11)

/** Texel do mapa: a profundidade ótica acumulada ao fim de cada um dos `knots` trechos iguais da casca ao longo do sol. */
export type ShadowTexel = readonly number[];

/** Nós por coluna (o volume da GPU: 4 camadas × 4 canais). */
export const SHADOW_KNOTS = 16;

/** O espaçamento (m) do pente do mapa no nível 0 (`CLOUD_SHADOW_SPACING`): os níveis são `2ⁿ` vezes ele. */
export const SHADOW_SPACING = 1;
/** O nível mais fino do pente (`CLOUD_SHADOW_MIN_LEVEL`): `2⁶` vezes o espaçamento do nível 0. */
export const SHADOW_MIN_LEVEL = 6;

/**
 * Texel do mapa ao longo do raio que desce do sol a partir de `o` (do lado do sol, fora da camada) na direção `dir` (do
 * sol para baixo), pelo primeiro trecho da casca: τ ao fim de cada um dos `knots` trechos iguais. Espelho de
 * `cloud_shadow_main`: as amostras são um pente fixo no mundo — nos planos perpendiculares ao sol a `m·Δ` da origem do
 * mundo (`σ = −p·dir`), cada uma no meio da sua célula `[mΔ − Δ/2, mΔ + Δ/2]` recortada ao trecho —, com
 * `Δ = SHADOW_SPACING·2ⁿ` o menor com no máximo `steps` amostras no trecho (nunca abaixo do nível `SHADOW_MIN_LEVEL`); o pente de `2Δ` (as amostras pares) é o do
 * nível seguinte, e o texel mistura os dois pela posição do comprimento na oitava (contínuo no ângulo do sol: o pente
 * em frações do trecho escorregava pela nuvem com o sol baixo).
 */
export function shadowTexel(
    m: CloudModel,
    o: Vec3,
    dir: Vec3,
    steps = 192,
    knots = SHADOW_KNOTS,
): ShadowTexel {
    const fine = new Array<number>(knots).fill(0);
    const coarse = new Array<number>(knots).fill(0);
    const segs = shellSegments(m, o, dir, Infinity);
    if (segs.length === 0) return fine;
    const [start, end] = segs[0]!;
    // σ do ponto a `t` da origem: a distância ao plano pela origem do mundo perpendicular ao sol.
    const sigmaO = -(o[0] * dir[0] + o[1] * dir[1] + o[2] * dir[2]);
    const hi = sigmaO - start;
    const lo = sigmaO - end;
    const len = hi - lo;
    const x = Math.max(Math.log2(len / (steps * SHADOW_SPACING)), SHADOW_MIN_LEVEL - 1);
    const n = Math.max(Math.ceil(x), SHADOW_MIN_LEVEL);
    const blend = x - (n - 1);
    const dl = SHADOW_SPACING * 2 ** n;
    const knotLen = len / knots;
    const extinction = (s: number): number => {
        const t = sigmaO - s;
        return (
            cloudDensity(m, [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t]) * m.density
        );
    };
    const m0 = Math.floor(hi / dl) + 1;
    let sumF = 0;
    let sumC = 0;
    let kf = 0;
    let kc = 0;
    for (let i = 0; i < steps + 4; i++) {
        const k = m0 - i;
        const s = k * dl;
        if (s + dl <= lo) break;
        let rf = 0;
        const fa = Math.max(s - 0.5 * dl, lo);
        const fb = Math.min(s + 0.5 * dl, hi);
        if (fb > fa) {
            rf = extinction(0.5 * (fa + fb));
            while (kf < knots && hi - (kf + 1) * knotLen >= fa) {
                fine[kf] = sumF + rf * (fb - (hi - (kf + 1) * knotLen));
                kf++;
            }
            sumF += rf * (fb - fa);
        }
        if ((k & 1) === 0) {
            const ca = Math.max(s - dl, lo);
            const cb = Math.min(s + dl, hi);
            if (cb > ca) {
                const rc = ca > s - dl || cb < s + dl ? extinction(0.5 * (ca + cb)) : rf;
                while (kc < knots && hi - (kc + 1) * knotLen >= ca) {
                    coarse[kc] = sumC + rc * (cb - (hi - (kc + 1) * knotLen));
                    kc++;
                }
                sumC += rc * (cb - ca);
            }
        }
    }
    for (let k = kf; k < knots; k++) fine[k] = sumF;
    for (let k = kc; k < knots; k++) coarse[k] = sumC;
    return fine.map((f, k) => f + (coarse[k]! - f) * blend);
}

/** τ acumulado da entrada do lado do sol até o nó `k` (0…n) do texel. */
export function shadowKnot(texel: ShadowTexel, k: number): number {
    return k <= 0 ? 0 : texel[Math.min(k, texel.length) - 1]!;
}

/**
 * `τ(p)` (a superfície) para o receptor a `d` m da origem do raio do texel, com o trecho da casca `[a, b]` da coluna: τ
 * linear entre os nós.
 */
export function shadowDepth(texel: ShadowTexel, d: number, a: number, b: number): number {
    const n = texel.length;
    const s = Math.min(1, Math.max(0, (d - a) / (b - a))) * n;
    const k = Math.min(Math.floor(s), n - 1);
    const lo = shadowKnot(texel, k);
    return lo + (shadowKnot(texel, k + 1) - lo) * (s - k);
}

/** `T(p) = exp(−τ(p))` da superfície. */
export function shadowTransmittance(texel: ShadowTexel, d: number, a: number, b: number): number {
    return Math.exp(-shadowDepth(texel, d, a, b));
}

/**
 * `τ(q)` como a marcha da nuvem o lê (`cloud_sun_depth`): o nó do lado do sol mais o pedaço do trecho de `q` até ele,
 * integrado em `steps` passos ao longo de `sun` (a direção para o sol).
 */
export function shadowDepthMarched(
    m: CloudModel,
    q: Vec3,
    sun: Vec3,
    texel: ShadowTexel,
    d: number,
    a: number,
    b: number,
    steps = 4,
): number {
    const n = texel.length;
    const s = Math.min(1, Math.max(0, (d - a) / (b - a))) * n;
    const k = Math.floor(s);
    const dt = (((s - k) / n) * (b - a)) / steps;
    let tau = 0;
    for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) * dt;
        tau += cloudDensity(m, [q[0] + sun[0] * t, q[1] + sun[1] * t, q[2] + sun[2] * t]) * dt;
    }
    return shadowKnot(texel, k) + tau * m.density;
}
