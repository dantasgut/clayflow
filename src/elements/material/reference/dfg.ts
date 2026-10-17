// Referência em CPU da tabela DFG (spec 011, R3): a mesma integração determinística do kernel `pbr_dfg_build`, para os
// testes e o smoke `lighting`. Eixos da tabela: μ = n·v e a rugosidade perceptual r (α = r²), ambos em [0, 1] pelos
// centros dos texels.

import { MIN_ROUGHNESS, dCharlie, vNeubelt, vSmithCorrelated } from './bsdf';

/** Lado da tabela (texels por eixo). */
export const DFG_SIZE = 32;
/** Amostras por texel da integração (a mesma no kernel). */
export const DFG_SAMPLES = 512;

/** Sequência de Hammersley: (i/N, inverso de bits de i). */
export function hammersley(i: number, n: number): [number, number] {
    let b = i >>> 0;
    b = ((b << 16) | (b >>> 16)) >>> 0;
    b = (((b & 0x55555555) << 1) | ((b & 0xaaaaaaaa) >>> 1)) >>> 0;
    b = (((b & 0x33333333) << 2) | ((b & 0xcccccccc) >>> 2)) >>> 0;
    b = (((b & 0x0f0f0f0f) << 4) | ((b & 0xf0f0f0f0) >>> 4)) >>> 0;
    b = (((b & 0x00ff00ff) << 8) | ((b & 0xff00ff00) >>> 8)) >>> 0;
    return [i / n, b * 2.3283064365386963e-10];
}

/** Valores de um texel: o especular E = F0·A + B (A, B) e o albedo direcional do sheen. */
export interface DfgTexel {
    readonly a: number;
    readonly b: number;
    readonly sheen: number;
}

/** Integra um texel em (μ, r): GGX por amostragem por importância; sheen por amostragem uniforme do hemisfério. */
export function dfgTexel(mu: number, roughness: number, samples = DFG_SAMPLES): DfgTexel {
    const nv = Math.max(mu, 1e-4);
    const v = [Math.sqrt(1 - nv * nv), 0, nv] as const;
    const r = Math.max(roughness, MIN_ROUGHNESS);
    const alpha = r * r;
    const a2 = alpha * alpha;
    let a = 0;
    let b = 0;
    let sheen = 0;
    for (let i = 0; i < samples; i++) {
        const [u1, u2] = hammersley(i, samples);
        // GGX: h amostrado pela distribuição (pdf = D·n·h / (4·v·h)).
        const phi = 2 * Math.PI * u1;
        const cosTh = Math.sqrt((1 - u2) / (1 + (a2 - 1) * u2));
        const sinTh = Math.sqrt(1 - cosTh * cosTh);
        const h = [sinTh * Math.cos(phi), sinTh * Math.sin(phi), cosTh] as const;
        const vh = v[0] * h[0] + v[1] * h[1] + v[2] * h[2];
        const lz = 2 * vh * h[2] - v[2];
        if (lz > 0 && vh > 0) {
            const gVis = (vSmithCorrelated(nv, lz, a2) * 4 * lz * vh) / h[2];
            const fc = Math.pow(1 - vh, 5);
            a += (1 - fc) * gVis;
            b += fc * gVis;
        }
        // Sheen: l uniforme no hemisfério (pdf = 1 / 2π).
        const cl = u2;
        const sl = Math.sqrt(1 - cl * cl);
        const l = [sl * Math.cos(phi), sl * Math.sin(phi), cl] as const;
        const hx = v[0] + l[0];
        const hy = v[1] + l[1];
        const hz = v[2] + l[2];
        const len = Math.hypot(hx, hy, hz);
        if (len > 1e-6 && cl > 0) {
            const nh = hz / len;
            sheen += dCharlie(nh, roughness) * vNeubelt(nv, cl) * cl * 2 * Math.PI;
        }
    }
    return { a: a / samples, b: b / samples, sheen: Math.min(sheen / samples, 1) };
}

/** Coordenada do centro do texel `i` de um eixo da tabela. */
export const dfgAxis = (i: number): number => (i + 0.5) / DFG_SIZE;
