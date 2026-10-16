// Referência da CPU dos nós de geometria diferencial (spec 031, R12). Tolerâncias (`|gpu − ref| ≤ tol · max(1, |ref|)`):
// métrica e curvaturas 1e-5 (raiz e produtos em f32), salvo o índice de forma, 5e-4 (`atan2` do WGSL, 4096 ULP); as
// direções principais 1e-5 (normalizações em f32).
import { uniform, vec, vector, type NodeCase } from './cases';

type V = readonly number[];

const dot = (a: V, b: V): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const scale = (a: V, s: number): number[] => a.map((c) => c * s);
const norm = (a: V): number[] => scale(a, 1 / Math.sqrt(dot(a, a)));

/** `surface.metric`: E, F, G e o elemento de área √max(EG − F², 0). */
export function surfaceMetric(metric: V): { e: number; f: number; g: number; area: number } {
    const [e, f, g] = metric as [number, number, number];
    return { e, f, g, area: Math.sqrt(Math.max(e * g - f * f, 0)) };
}

/** `surface.curvature`: K, H, k₁, k₂, a curvatura total e o índice de forma. */
export function surfaceCurvature(c: V): Record<string, number> {
    const [gaussian, mean, k1, k2] = c as [number, number, number, number];
    return {
        gaussian,
        mean,
        k1,
        k2,
        curvedness: Math.sqrt(0.5 * (k1 * k1 + k2 * k2)),
        shape_index: (2 / Math.PI) * Math.atan2(k1 + k2, k1 - k2),
    };
}

/** `surface.principal`: d₁ = a direção de k₁ no plano tangente, normalizada; d₂ = n × d₁ (zeros se degenerado). */
export function surfacePrincipal(principal: V, normal: V): { d1: number[]; d2: number[] } {
    const n = dot(normal, normal) > 0 ? norm(normal) : [0, 0, 0];
    const t = principal.map((c, k) => c - n[k]! * dot(n, principal));
    if (dot(t, t) <= 1e-12) return { d1: [0, 0, 0], d2: [0, 0, 0] };
    const d1 = norm(t);
    return {
        d1,
        d2: [
            n[1]! * d1[2]! - n[2]! * d1[1]!,
            n[2]! * d1[0]! - n[0]! * d1[2]!,
            n[0]! * d1[1]! - n[1]! * d1[0]!,
        ],
    };
}

/** Casos dos nós `surface.*`. */
export const surfaceCases: readonly NodeCase[] = [
    {
        node: 'surface.metric',
        tolerance: 1e-5,
        sample: (r) => {
            // Primeira forma de vetores tangentes aleatórios (EG − F² ≥ 0).
            const tu = vector(r, 3, -2, 2);
            const tv = vector(r, 3, -2, 2);
            return { metric: [dot(tu, tu), dot(tu, tv), dot(tv, tv)] };
        },
        reference: (x) => surfaceMetric(vec(x.metric)),
    },
    {
        node: 'surface.curvature',
        tolerance: 5e-4,
        sample: (r) => {
            const a = uniform(r, -3, 3);
            const b = uniform(r, -3, 3);
            const k1 = Math.max(a, b);
            const k2 = Math.min(a, b);
            return { curvature: [k1 * k2, 0.5 * (k1 + k2), k1, k2] };
        },
        reference: (x) => surfaceCurvature(vec(x.curvature)),
    },
    {
        node: 'surface.principal',
        tolerance: 1e-5,
        sample: (r) => {
            const n = vector(r, 3, -1, 1);
            return { principal: vector(r, 3, -1, 1), normal: dot(n, n) < 0.01 ? [0, 1, 0] : n };
        },
        reference: (x) => surfacePrincipal(vec(x.principal), vec(x.normal)),
    },
];
