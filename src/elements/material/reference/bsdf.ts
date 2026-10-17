// Referência em CPU das funções físicas de espalhamento (spec 011, R3): a mesma aritmética do módulo WGSL `bsdf`, para
// os testes e os smokes `lighting` e `materials` compararem com a GPU. Vetores como tuplas `[x, y, z]`.

export type Vec3 = readonly [number, number, number];

const PI = Math.PI;
const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const normalize = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
const map3 = (a: Vec3, f: (x: number) => number): Vec3 => [f(a[0]), f(a[1]), f(a[2])];

/** Rugosidade mínima efetiva: abaixo dela o realce de uma luz pontual vira um pixel (spec 011, casos-limite). */
export const MIN_ROUGHNESS = 0.03;

/** α² do GGX a partir da rugosidade perceptual (α = r²), com o piso de `MIN_ROUGHNESS`. */
export function alpha2Of(roughness: number): number {
    const r = Math.max(roughness, MIN_ROUGHNESS);
    const a = r * r;
    return a * a;
}

/** Distribuição GGX (Trowbridge-Reitz) isotrópica. */
export function dGgx(nh: number, a2: number): number {
    const d = nh * nh * (a2 - 1) + 1;
    return a2 / (PI * d * d);
}

/** Distribuição GGX anisotrópica (Burley 2012): `ht`, `hb` são as projeções de h na tangente e na bitangente. */
export function dGgxAniso(ht: number, hb: number, nh: number, at: number, ab: number): number {
    const x = ht / at;
    const y = hb / ab;
    const d = x * x + y * y + nh * nh;
    return 1 / (PI * at * ab * d * d);
}

/** Visibilidade de Smith correlacionada em altura (Heitz 2014): G₂ / (4·n·v·n·l). */
export function vSmithCorrelated(nv: number, nl: number, a2: number): number {
    const gv = nl * Math.sqrt(nv * nv * (1 - a2) + a2);
    const gl = nv * Math.sqrt(nl * nl * (1 - a2) + a2);
    return 0.5 / Math.max(gv + gl, 1e-7);
}

/** Visibilidade de Smith correlacionada anisotrópica (Heitz 2014). */
export function vSmithCorrelatedAniso(
    at: number,
    ab: number,
    tv: number,
    bv: number,
    tl: number,
    bl: number,
    nv: number,
    nl: number,
): number {
    const lv = nl * Math.hypot(at * tv, ab * bv, nv);
    const ll = nv * Math.hypot(at * tl, ab * bl, nl);
    return 0.5 / Math.max(lv + ll, 1e-7);
}

/** Fresnel de Schlick. */
export function fSchlick(f0: Vec3, f90: Vec3, cosT: number): Vec3 {
    const k = Math.pow(1 - clamp01(cosT), 5);
    return [
        f0[0] + (f90[0] - f0[0]) * k,
        f0[1] + (f90[1] - f0[1]) * k,
        f0[2] + (f90[2] - f0[2]) * k,
    ];
}

/**
 * Fresnel F82-tint do OpenPBR (Kutz et al. 2021): Schlick com o desvio em μ̄ = 1/7 que leva a refletância a
 * `tint · F_schlick(μ̄)`; tinta branca = Schlick.
 */
export function f82(f0: Vec3, tint: Vec3, cosT: number): Vec3 {
    const mu = clamp01(cosT);
    const muBar = 1 / 7;
    const denom = muBar * Math.pow(1 - muBar, 6);
    const fBar = fSchlick(f0, [1, 1, 1], muBar);
    const fs = fSchlick(f0, [1, 1, 1], mu);
    const k = mu * Math.pow(1 - mu, 6);
    return [
        clamp01(fs[0] - (k * fBar[0] * (1 - tint[0])) / denom),
        clamp01(fs[1] - (k * fBar[1] * (1 - tint[1])) / denom),
        clamp01(fs[2] - (k * fBar[2] * (1 - tint[2])) / denom),
    ];
}

/** Refletância na normal de uma interface com razão de IOR `ior`. */
export function f0FromIor(ior: number): number {
    const r = (ior - 1) / (ior + 1);
    return r * r;
}

/** Fresnel dielétrico exato (não polarizado) para razão de IOR `eta` = n₂/n₁; reflexão total → 1. */
export function fDielectric(cosI: number, eta: number): number {
    const c = clamp01(Math.abs(cosI));
    const g2 = eta * eta - 1 + c * c;
    if (g2 < 0) return 1;
    const g = Math.sqrt(g2);
    const a = (g - c) / (g + c);
    const b = (c * (g + c) - 1) / (c * (g - c) + 1);
    return 0.5 * a * a * (1 + b * b);
}

/** Distribuição "Charlie" do sheen (Estevez-Kulla 2017). */
export function dCharlie(nh: number, roughness: number): number {
    const a = Math.max(roughness * roughness, 1e-3);
    const inv = 1 / a;
    const sin2 = Math.max(1 - nh * nh, 0);
    return ((2 + inv) * Math.pow(sin2, inv * 0.5)) / (2 * PI);
}

/** Visibilidade do sheen (Neubelt-Pettineo 2013). */
export function vNeubelt(nv: number, nl: number): number {
    return 1 / (4 * Math.max(nl + nv - nl * nv, 1e-4));
}

const FON_C1 = 0.5 - 2 / (3 * PI);
const FON_C2 = 2 / 3 - 28 / (15 * PI);

/** Albedo direcional do Oren-Nayar de Fujii (exato), parte da forma energética (EON, Portsmouth et al. 2024). */
function eFon(mu: number, r: number): number {
    const af = 1 / (1 + FON_C1 * r);
    const bf = r * af;
    const si = Math.sqrt(Math.max(1 - mu * mu, 0));
    const g =
        si * (Math.acos(clamp01(mu)) - si * mu)
        + (2 / 3) * ((si / Math.max(mu, 1e-7)) * (1 - si * si * si) - si);
    return af + (bf / PI) * g;
}

/**
 * Difuso de Oren-Nayar energético (EON, Portsmouth et al. 2024, o difuso do OpenPBR): o termo de Fujii mais o
 * múltiplo espalhamento que devolve a energia perdida; rugosidade 0 = Lambert. Devolve f·cos (pronto para multiplicar
 * pela radiância).
 */
export function orenNayarEnergy(
    rho: Vec3,
    roughness: number,
    nl: number,
    nv: number,
    lv: number,
): Vec3 {
    const r = clamp01(roughness);
    const af = 1 / (1 + FON_C1 * r);
    const bf = r * af;
    const s = lv - nl * nv;
    const t = s > 0 ? Math.max(nl, nv) : 1;
    const single = (af + (bf * s) / t) / PI;
    const eAvg = af * (1 + FON_C2 * r);
    const el = eFon(nl, r);
    const ev = eFon(nv, r);
    const ms = ((1 - el) * (1 - ev)) / Math.max(PI * (1 - eAvg), 1e-7);
    return map3(rho, (p) => {
        const rhoMs = (p * p * eAvg) / Math.max(1 - p * (1 - eAvg), 1e-7);
        return (p * single + rhoMs * ms) * nl;
    });
}

/**
 * Difuso com "wrap" por canal (subsuperfície no modelo, spec 011 R3): o terminador avança `w` em cada canal pelo raio
 * de espalhamento, normalizado para conservar a energia sob luz frontal. Devolve f·cos.
 */
export function burleyWrap(color: Vec3, radius: Vec3, nl: number): Vec3 {
    return [0, 1, 2].map((k) => {
        const w = clamp01(radius[k]!);
        return (color[k]! / PI) * (Math.max(nl + w, 0) / ((1 + w) * (1 + w)));
    }) as unknown as Vec3;
}

/** Sensibilidade espectral (ajuste gaussiano XYZ, Belcour-Barla 2017) da diferença de fase `opd` para a fase `shift`. */
function evalSensitivity(opd: number, shift: Vec3): Vec3 {
    const phase = 2 * PI * opd * 1e-9;
    const val: Vec3 = [5.4856e-13, 4.4201e-13, 5.2481e-13];
    const pos: Vec3 = [1.681e6, 1.7953e6, 2.2084e6];
    const vr: Vec3 = [4.3278e9, 9.3046e9, 6.6121e9];
    const xyz = [0, 1, 2].map(
        (k) =>
            val[k]!
            * Math.sqrt(2 * PI * vr[k]!)
            * Math.cos(pos[k]! * phase + shift[k]!)
            * Math.exp(-phase * phase * vr[k]!),
    );
    xyz[0] =
        xyz[0]!
        + 9.747e-14
            * Math.sqrt(2 * PI * 4.5282e9)
            * Math.cos(2.2399e6 * phase + shift[0])
            * Math.exp(-4.5282e9 * phase * phase);
    const x = xyz[0] / 1.0685e-7;
    const y = xyz[1]! / 1.0685e-7;
    const z = xyz[2]! / 1.0685e-7;
    return [
        3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
        -0.969266 * x + 1.8760108 * y + 0.041556 * z,
        0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    ];
}

/**
 * Refletância de filme fino (Belcour-Barla 2017, a do `KHR_materials_iridescence`): interferência entre o ar, o filme
 * (`filmIor`, espessura em nm) e a base (F0 da base). Espessura 0 = Fresnel da base.
 */
export function thinFilm(cosT: number, thicknessNm: number, filmIor: number, baseF0: Vec3): Vec3 {
    const cos1 = clamp01(cosT);
    const fresnelBase = fSchlick(baseF0, [1, 1, 1], cos1);
    if (thicknessNm <= 0) return fresnelBase;
    const etaFilm = Math.max(filmIor, 1.0001);
    const sin2 = (1 - cos1 * cos1) / (etaFilm * etaFilm);
    if (sin2 >= 1) return [1, 1, 1];
    const cos2 = Math.sqrt(1 - sin2);
    const r0 = f0FromIor(etaFilm);
    const r12 = fSchlick([r0, r0, r0], [1, 1, 1], cos1)[0];
    const t121 = 1 - r12;
    const phi12 = etaFilm < 1 ? PI : 0;
    const phi21 = PI - phi12;
    const baseIor = map3(baseF0, (f) => {
        const s = Math.sqrt(Math.min(f, 0.9999));
        return (1 + s) / (1 - s);
    });
    const r1 = map3(baseIor, (n) => {
        const r = (n - etaFilm) / (n + etaFilm);
        return r * r;
    });
    const r23 = fSchlick(r1, [1, 1, 1], cos2);
    const phi23: Vec3 = map3(baseIor, (n) => (n < etaFilm ? PI : 0));
    const opd = 2 * etaFilm * thicknessNm * cos2;
    const phi: Vec3 = [phi21 + phi23[0], phi21 + phi23[1], phi21 + phi23[2]];
    const r123 = map3(r23, (r) => Math.min(Math.max(r12 * r, 1e-5), 0.9999));
    const out = [0, 1, 2].map((k) => {
        const r = r123[k]!;
        const rCoh = (t121 * t121 * r23[k]!) / (1 - r);
        let i = r12 + rCoh;
        let cm = rCoh - t121;
        for (let m = 1; m <= 2; m++) {
            cm *= Math.sqrt(r);
            const sm = evalSensitivity(m * opd, [m * phi[0], m * phi[1], m * phi[2]]);
            i += cm * 2 * sm[k]!;
        }
        return Math.max(i, 0);
    });
    return out as unknown as Vec3;
}

/** Parâmetros do especular avaliados na referência (dielétrico ou condutor isotrópico). */
export interface SpecularLobe {
    readonly f0: Vec3;
    readonly f90: Vec3;
    readonly roughness: number;
}

/** Cook-Torrance isotrópico de um lobo, sem a compensação de múltiplo espalhamento: f·cos. */
export function cookTorrance(lobe: SpecularLobe, n: Vec3, v: Vec3, l: Vec3): Vec3 {
    const nl = dot(n, l);
    const nv = dot(n, v);
    if (nl <= 0 || nv <= 0) return [0, 0, 0];
    const h = normalize(add(v, l));
    const nh = Math.max(dot(n, h), 0);
    const vh = Math.max(dot(v, h), 0);
    const a2 = alpha2Of(lobe.roughness);
    const spec = dGgx(nh, a2) * vSmithCorrelated(nv, nl, a2) * nl;
    return scale(fSchlick(lobe.f0, lobe.f90, vh), spec);
}

/** Compensação de múltiplo espalhamento (Turquin 2019 / Fdez-Agüera): `1 + F0·(1/E_ss − 1)`. */
export function multiScatter(f0: Vec3, ess: number): Vec3 {
    const k = 1 / Math.max(ess, 1e-4) - 1;
    return map3(f0, (f) => 1 + f * k);
}

export { add as add3, dot as dot3, mul as mul3, normalize as normalize3, scale as scale3 };
