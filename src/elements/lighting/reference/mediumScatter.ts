// Referência em f64 do espalhamento simples na água funda (spec 034, T067e; só para testes e smokes): a radiância que a
// luz de uma fonte direcional espalha uma vez dentro de uma lâmina de água lisa de profundidade H e fundo preto, vista
// de fora pela superfície — a cor da água funda (T065c). A geometria é a exata: a luz e a visão refratadas na
// superfície (Snell), o Fresnel exato (luz não polarizada) na entrada da luz e na saída da visão, o feixe da luz
// alargado na refração (a irradiância por área perpendicular dentro da água, E T cos θ / cos θ'), a extinção pelos dois
// trechos e a radiância dividida por n² ao sair (L/n² se conserva). Pela integral fechada no trecho:
//   L = T_v T_s (cos θs / cos θs') E σs p(cos Θ) (1 − e^(−σt (H/μv')(1 + μv'/μs'))) / (σt (1 + μv'/μs') n²),
// μ' os cossenos dentro da água e Θ o ângulo entre a luz que anda e a que segue para quem vê.

import { henyeyGreenstein, type Vec3 } from './pathTracer';

/** A água: índice, absorção e espalhamento por canal (1/m), a anisotropia de Henyey–Greenstein e a profundidade (m). */
export interface DeepWater {
    readonly ior: number;
    readonly absorption: Vec3;
    readonly scattering: Vec3;
    readonly g: number;
    readonly depth: number;
}

/** Fresnel exato (luz não polarizada) de quem chega do ar com o cosseno `cosI` a um meio de índice `n`. */
export function fresnelFromAir(cosI: number, n: number): number {
    const c = Math.min(Math.max(cosI, 0), 1);
    const sinT = Math.sqrt(1 - c * c) / n;
    if (sinT >= 1) return 1;
    const cosT = Math.sqrt(1 - sinT * sinT);
    const rs = (c - n * cosT) / (c + n * cosT);
    const rp = (n * c - cosT) / (n * c + cosT);
    return 0.5 * (rs * rs + rp * rp);
}

/** A direção `d` (unitária, descendo) refratada do ar para a água de índice `n` pela superfície de normal +y. */
export function refractDown(d: Vec3, n: number): Vec3 {
    const cosI = -d[1];
    const sin2T = (1 - cosI * cosI) / (n * n);
    const cosT = Math.sqrt(1 - sin2T);
    const k = cosI / n - cosT;
    return [d[0] / n, d[1] / n + k, d[2] / n];
}

/**
 * A radiância (rgb) vista do ar pela direção `view` (unitária, de quem vê para a água, descendo) do espalhamento simples
 * na lâmina `water`, com a luz direcional de iluminância `illuminance` (rgb, lux, perpendicular a ela) andando na
 * direção `light` (unitária, descendo).
 */
export function deepWaterSingleScatter(
    water: DeepWater,
    view: Vec3,
    light: Vec3,
    illuminance: Vec3,
): [number, number, number] {
    const n = water.ior;
    const v = refractDown(view, n);
    const s = refractDown(light, n);
    const muV = -v[1];
    const muS = -s[1];
    const tv = 1 - fresnelFromAir(-view[1], n);
    const ts = 1 - fresnelFromAir(-light[1], n);
    const spread = -light[1] / muS;
    const phase = henyeyGreenstein(-(s[0] * v[0] + s[1] * v[1] + s[2] * v[2]), water.g);
    const ratio = 1 + muV / muS;
    const out: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
        const sigmaS = water.scattering[k]!;
        const sigmaT = water.absorption[k]! + sigmaS;
        const span = (water.depth / muV) * ratio;
        const integral =
            sigmaT > 0 ? (1 - Math.exp(-sigmaT * span)) / (sigmaT * ratio) : water.depth / muV;
        out[k] = (tv * ts * spread * illuminance[k]! * sigmaS * phase * integral) / (n * n);
    }
    return out;
}
