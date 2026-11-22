// Referência da CPU dos nós de geometria diferencial (spec 031, R12). Tolerâncias (`|gpu − ref| ≤ tol · max(1, |ref|)`):
// métrica e curvaturas 1e-5 (raiz e produtos em f32), salvo o índice de forma, 5e-4 (`atan2` do WGSL, 4096 ULP); as
// direções principais 1e-5 (normalizações em f32); as ondulações 1e-3 — o `cos` do WGSL só garante erro absoluto de 2⁻¹¹
// (4,9e-4) em [−π, π], e a inclinação soma oito deles pesados por strength/8 (≤ 1): ≤ 4,9e-4 por componente da
// normal, mais a fase em f32 (até ~10³ rad antes da redução, ~6e-5 rad).
import { uniform, vec, vector, type NodeCase } from './cases';

type V = readonly number[];

const dot = (a: V, b: V): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const scale3 = (a: V, s: number): number[] => a.map((c) => c * s);
const norm = (a: V): number[] => scale3(a, 1 / Math.sqrt(dot(a, a)));
const cross = (a: V, b: V): number[] => [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
];

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

/** Trens de onda de `surface.ripple`. */
const RIPPLE_WAVES = 8;

/** `surface.ripple`: a normal perturbada pelas ondulações (a conta de `node_surface_ripple`, em f64). */
export function surfaceRipple(
    position: V,
    normal: V,
    time: number,
    strength: number,
    size: number,
    speed: number,
    up: V,
): number[] {
    const n = norm(normal);
    const u = norm(up);
    const e = Math.min(1, Math.max(0, (dot(n, u) - 0.3) / 0.5));
    const w = e * e * (3 - 2 * e) * strength;
    if (w <= 0 || size <= 0) return n;
    const a = Math.abs(u[2]!) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    const t1 = norm(cross(u, a));
    const t2 = cross(t1, u);
    const x = dot(position, t1);
    const z = dot(position, t2);
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < RIPPLE_WAVES; i++) {
        const angle = i * 2.3999632 + 0.4;
        const d = [Math.cos(angle), Math.sin(angle)] as const;
        const k = (2 * Math.PI) / (size / (1 + 0.27 * i));
        const omega = Math.sqrt(9.81 * k) * speed;
        const c = Math.cos(k * (d[0] * x + d[1] * z) - omega * time + i * 2.17);
        sx += d[0] * c;
        sz += d[1] * c;
    }
    const g = [0, 1, 2].map((k) => ((t1[k]! * sx + t2[k]! * sz) * w) / RIPPLE_WAVES);
    const gn = dot(g, n);
    return norm(n.map((c, k) => c - (g[k]! - c * gn)));
}

/** `surface.uvSpace`: a coordenada do padrão, a largura do pixel nela, as tangentes e o período. */
export function surfaceUvSpace(
    uv: V,
    duvdx: V,
    duvdy: V,
    dpdu: V,
    dpdv: V,
    scale: V,
    offset: V,
): { p: number[]; width: number; du: number[]; dv: number[]; wrap: number[] } {
    const s = scale.map((c) => (Math.abs(c) > 1e-9 ? c : 1));
    return {
        p: [uv[0]! * s[0]! + offset[0]!, uv[1]! * s[1]! + offset[1]!],
        width: Math.max(
            Math.hypot(duvdx[0]! * s[0]!, duvdx[1]! * s[1]!),
            Math.hypot(duvdy[0]! * s[0]!, duvdy[1]! * s[1]!),
        ),
        du: scale3(dpdu, 1 / s[0]!),
        dv: scale3(dpdv, 1 / s[1]!),
        wrap: s.map(Math.abs),
    };
}

/** `surface.bump`: a normal perturbada pelo gradiente de superfície da altura (Mikkelsen 2020). */
export function surfaceBump(normal: V, du: V, dv: V, gradient: V, strength: number): number[] {
    const n = dot(normal, normal) > 0 ? norm(normal) : [0, 0, 1];
    const det = dot(n, cross(du, dv));
    if (Math.abs(det) < 1e-24) return n;
    const a = cross(dv, n);
    const b = cross(n, du);
    const k = Math.sqrt(Math.abs(det)) / det;
    return norm(n.map((c, i) => c - strength * (gradient[0]! * a[i]! + gradient[1]! * b[i]!) * k));
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
    {
        node: 'surface.ripple',
        tolerance: 1e-3,
        sample: (r, k) => {
            // Normais voltadas para cima (o peso entre 0 e 1 e acima) e de lado (sem ondulação); `up` inclinado em
            // parte das amostras (o plano das ondas geral).
            const up = k % 4 === 3 ? vector(r, 3, -1, 1) : [0, 1, 0];
            const tilt = vector(r, 3, -0.8, 0.8);
            const normal = [tilt[0]!, k % 5 === 4 ? tilt[1]! : 1, tilt[2]!];
            return {
                position: vector(r, 3, -2, 2),
                normal: dot(normal, normal) < 0.01 ? [0, 1, 0] : normal,
                time: uniform(r, 0, 10),
                strength: uniform(r, 0, 1),
                size: uniform(r, 0.02, 0.5),
                speed: uniform(r, 0, 2),
                up: dot(up, up) < 0.01 ? [0, 1, 0] : up,
            };
        },
        reference: (x) => ({
            value: surfaceRipple(
                vec(x.position),
                vec(x.normal),
                x.time as number,
                x.strength as number,
                x.size as number,
                x.speed as number,
                vec(x.up),
            ),
        }),
    },
    {
        node: 'surface.uvSpace',
        tolerance: 1e-5,
        sample: (r, k) => ({
            uv: vector(r, 2, 0, 1),
            duvdx: vector(r, 2, -0.01, 0.01),
            duvdy: vector(r, 2, -0.01, 0.01),
            dpdu: vector(r, 3, -2, 2),
            dpdv: vector(r, 3, -2, 2),
            scale: k % 7 === 6 ? [0, 3] : vector(r, 2, 0.5, 40),
            offset: vector(r, 2, -1, 1),
        }),
        reference: (x) =>
            surfaceUvSpace(
                vec(x.uv),
                vec(x.duvdx),
                vec(x.duvdy),
                vec(x.dpdu),
                vec(x.dpdv),
                vec(x.scale),
                vec(x.offset),
            ),
    },
    {
        node: 'surface.bump',
        tolerance: 1e-4,
        sample: (r, k) => {
            // Tangentes quase ortogonais à normal (um referencial perturbado); um oitavo sem tangentes (os acertos).
            const n = vector(r, 3, -1, 1);
            const normal = dot(n, n) < 0.01 ? [0, 1, 0] : n;
            const a = cross(normal, Math.abs(normal[0]!) < 0.6 ? [1, 0, 0] : [0, 1, 0]);
            const b = cross(normal, a);
            const size = uniform(r, 0.05, 2);
            const jitter = vector(r, 3, -0.1, 0.1);
            return {
                normal,
                du: k % 8 === 7 ? [0, 0, 0] : a.map((c, i) => (c + jitter[i]!) * size),
                dv: k % 8 === 7 ? [0, 0, 0] : b.map((c) => c * size * uniform(r, 0.5, 1.5)),
                gradient: vector(r, 2, -3, 3),
                strength: uniform(r, 0, 0.5),
            };
        },
        reference: (x) => ({
            value: surfaceBump(
                vec(x.normal),
                vec(x.du),
                vec(x.dv),
                vec(x.gradient),
                x.strength as number,
            ),
        }),
    },
];
