// Referência em CPU do fechamento pronto (spec 011, R5/R8): a base do OpenPBR que `closure_from_params` monta —
// difuso + dielétrico de IOR 1,5 + condutor pela metalicidade — avaliada como `closure_eval` e `closure_ambient`, com a
// tabela DFG integrada na hora (`dfgTexel`). Para os smokes `lighting` e `materials` compararem com a radiância do alvo
// HDR.

import {
    add3,
    alpha2Of,
    dGgx,
    dot3,
    f0FromIor,
    f82,
    fSchlick,
    multiScatter,
    normalize3,
    orenNayarEnergy,
    vSmithCorrelated,
    type Vec3,
} from './bsdf';
import { dfgTexel } from './dfg';

/** Parâmetros da 009 (os de um `StandardMaterial`). */
export interface ParamsMaterial {
    readonly albedo: Vec3;
    readonly roughness: number;
    readonly metallic: number;
}

const DFG_SAMPLES_REF = 1024;
const dfgCache = new Map<string, { a: number; b: number }>();

/** A tabela DFG em (n·v, rugosidade), integrada e memorizada. */
function dfg(nv: number, roughness: number): { a: number; b: number } {
    const key = `${nv.toFixed(4)}:${roughness.toFixed(4)}`;
    let t = dfgCache.get(key);
    if (t === undefined) dfgCache.set(key, (t = dfgTexel(nv, roughness, DFG_SAMPLES_REF)));
    return t;
}

const F0_DIELECTRIC = f0FromIor(1.5);

/** Albedo direcional compensado do dielétrico de IOR 1,5 (o que ele tira do difuso). */
function dielectricAlbedo(nv: number, roughness: number): number {
    const { a, b } = dfg(nv, roughness);
    return (F0_DIELECTRIC * a + b) * multiScatter([F0_DIELECTRIC, 0, 0], a + b)[0];
}

/** Radiância refletida para `v` pela base do OpenPBR sob uma luz de direção `l` e irradiância `e` (por canal). */
export function evalParams(m: ParamsMaterial, n: Vec3, v: Vec3, l: Vec3, e: Vec3): Vec3 {
    const nl = Math.max(dot3(n, l), 0);
    const nv = Math.max(dot3(n, v), 1e-4);
    if (nl <= 0) return [0, 0, 0];
    const h = normalize3(add3(v, l));
    const nh = Math.max(dot3(n, h), 0);
    const vh = Math.max(dot3(v, h), 0);
    const r = m.roughness;
    const a2 = alpha2Of(r);
    const dv = dGgx(nh, a2) * vSmithCorrelated(nv, nl, a2);
    const { a, b } = dfg(nv, r);
    const met = m.metallic;
    const fd = fSchlick([F0_DIELECTRIC, F0_DIELECTRIC, F0_DIELECTRIC], [1, 1, 1], vh);
    const fc = f82(m.albedo, [1, 1, 1], vh);
    const f0 = [0, 1, 2].map(
        (k) => (1 - met) * F0_DIELECTRIC + met * m.albedo[k]!,
    ) as unknown as Vec3;
    const ms = multiScatter(f0, a + b);
    const diffuse = orenNayarEnergy(m.albedo, 0, nl, nv, dot3(l, v));
    const under = 1 - dielectricAlbedo(nv, r);
    return [0, 1, 2].map(
        (k) =>
            (((1 - met) * fd[k]! + met * fc[k]!) * dv * nl * ms[k]!
                + (1 - met) * diffuse[k]! * under)
            * e[k]!,
    ) as unknown as Vec3;
}

/**
 * Radiância refletida pela base do OpenPBR num hemisfério céu/chão uniforme (`sky` = `ground`): o difuso pela
 * irradiância e o especular pelo albedo direcional — o teste de forno. Com radiância `l` em todas as direções.
 */
export function ambientParamsUniform(m: ParamsMaterial, nv: number, l: number): Vec3 {
    const { a, b } = dfg(nv, m.roughness);
    const met = m.metallic;
    const ed = (F0_DIELECTRIC * a + b) * multiScatter([F0_DIELECTRIC, 0, 0], a + b)[0];
    return [0, 1, 2].map((k) => {
        const f0c = m.albedo[k]!;
        const ec = (f0c * a + b) * multiScatter([f0c, 0, 0], a + b)[0];
        return ((1 - met) * ed + met * ec + (1 - met) * m.albedo[k]! * (1 - ed)) * l;
    }) as unknown as Vec3;
}

/** Luz indireta nas direções que a base lê (spec 033): a irradiância/π na normal e a radiância especular dominante. */
export interface IndirectParamsLight {
    readonly diffuse: Vec3;
    readonly specular: Vec3;
}

/**
 * Radiância refletida pela base do OpenPBR sob a luz indireta (spec 033, `closure_indirect`): o difuso pela irradiância
 * e o especular pela radiância dominante alargada para a irradiância com a rugosidade (α = r²), × os albedos
 * direcionais. Com as duas iguais, o forno de `ambientParamsUniform`.
 */
export function indirectParams(m: ParamsMaterial, nv: number, light: IndirectParamsLight): Vec3 {
    const { a, b } = dfg(nv, m.roughness);
    const met = m.metallic;
    const alpha = m.roughness * m.roughness;
    const ed = (F0_DIELECTRIC * a + b) * multiScatter([F0_DIELECTRIC, 0, 0], a + b)[0];
    return [0, 1, 2].map((k) => {
        const f0c = m.albedo[k]!;
        const ec = (f0c * a + b) * multiScatter([f0c, 0, 0], a + b)[0];
        const lr = light.specular[k]! * (1 - alpha) + light.diffuse[k]! * alpha;
        return (
            ((1 - met) * ed + met * ec) * lr
            + (1 - met) * m.albedo[k]! * (1 - ed) * light.diffuse[k]!
        );
    }) as unknown as Vec3;
}
