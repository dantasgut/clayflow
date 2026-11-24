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

/** `surface.relief`: (altura, ∂/∂u, ∂/∂v) em milímetros a partir do padrão e da escala dele no uv. */
export function surfaceRelief(
    value: number,
    gradient: V,
    wrap: V,
    height: number,
    level: number,
): number[] {
    const w = wrap.map((c) => (c > 1e-9 ? c : 1));
    return [(value - level) * height, height * gradient[0]! * w[0]!, height * gradient[1]! * w[1]!];
}

/** `surface.solidSpace`: a posição no objeto no referencial do bloco (p, largura do pixel, ∂p/∂u, ∂p/∂v). */
export function surfaceSolidSpace(
    position: V,
    dodu: V,
    dodv: V,
    duvdx: V,
    duvdy: V,
    footprint: number,
    scale: number,
    offset: V,
    axis: V,
): { p: number[]; width: number; du: number[]; dv: number[] } {
    const y = dot(axis, axis) > 1e-12 ? norm(axis) : [0, 1, 0];
    const pick = Math.abs(y[0]!) > 0.9 ? [0, 0, 1] : [1, 0, 0];
    const z = norm(cross(pick, y));
    const x = cross(y, z);
    const k = Math.abs(scale) > 1e-9 ? scale : 1;
    const turn = (a: V): number[] => [dot(a, x) * k, dot(a, y) * k, dot(a, z) * k];
    const du = turn(dodu);
    const dv = turn(dodv);
    const step = (d: V): number => Math.hypot(...du.map((c, n) => c * d[0]! + dv[n]! * d[1]!));
    const w = Math.max(step(duvdx), step(duvdy));
    return {
        p: turn(position).map((c, n) => c + offset[n]!),
        width: w > 0 ? w : footprint * Math.abs(k),
        du,
        dv,
    };
}

/** `surface.solidRelief`: o relevo (mm) de um padrão maciço e as derivadas dele no uv. */
export function surfaceSolidRelief(
    value: number,
    gradient: V,
    du: V,
    dv: V,
    height: number,
    level: number,
): number[] {
    return [(value - level) * height, height * dot(gradient, du), height * dot(gradient, dv)];
}

/** `surface.reliefNormal`: a normal da superfície deslocada pelo relevo (mm), `scale` unidades por metro. */
export function surfaceReliefNormal(
    normal: V,
    dpdu: V,
    dpdv: V,
    relief: V,
    scale: number,
): number[] {
    const n = dot(normal, normal) > 0 ? norm(normal) : [0, 0, 1];
    const det = dot(n, cross(dpdu, dpdv));
    if (Math.abs(det) < 1e-24) return n;
    const a = cross(dpdv, n);
    const b = cross(n, dpdu);
    const k = (0.001 * scale) / det;
    const g = n.map((_, i) => k * (relief[1]! * a[i]! + relief[2]! * b[i]!));
    const slope = Math.hypot(g[0]!, g[1]!, g[2]!);
    const limit = slope > 4 ? 4 / slope : 1;
    return norm(n.map((c, i) => c - g[i]! * limit));
}

/** `surface.displacement`: a altura do relevo (mm) nas unidades do mundo. */
export function surfaceDisplacement(relief: V, scale: number): number {
    return relief[0]! * 0.001 * scale;
}

/** `surface.direction`: a direção do padrão sobre as tangentes, normalizada (zero sem tangentes). */
export function surfaceDirection(du: V, dv: V, direction: V): number[] {
    const t = du.map((c, i) => c * direction[0]! + dv[i]! * direction[1]!);
    const l = Math.hypot(t[0]!, t[1]!, t[2]!);
    return l < 1e-12 ? [0, 0, 0] : t.map((c) => c / l);
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
        node: 'surface.solidSpace',
        tolerance: 1e-5,
        sample: (r, k) => ({
            position: vector(r, 3, -2, 2),
            dodu: k % 5 === 4 ? [0, 0, 0] : vector(r, 3, -2, 2),
            dodv: k % 5 === 4 ? [0, 0, 0] : vector(r, 3, -2, 2),
            duvdx: vector(r, 2, -0.01, 0.01),
            duvdy: vector(r, 2, -0.01, 0.01),
            footprint: uniform(r, 0.001, 0.02),
            scale: k % 7 === 6 ? 0 : uniform(r, 0.5, 8),
            offset: vector(r, 3, -1, 1),
            axis: [
                [0, 1, 0],
                [1, 0, 0],
                [0.3, 0.2, -0.9],
            ][k % 3]!,
        }),
        reference: (x) =>
            surfaceSolidSpace(
                vec(x.position),
                vec(x.dodu),
                vec(x.dodv),
                vec(x.duvdx),
                vec(x.duvdy),
                x.footprint as number,
                x.scale as number,
                vec(x.offset),
                vec(x.axis),
            ),
    },
    {
        node: 'surface.solidRelief',
        tolerance: 1e-5,
        sample: (r) => ({
            value: uniform(r, 0, 1),
            gradient: vector(r, 3, -4, 4),
            du: vector(r, 3, -2, 2),
            dv: vector(r, 3, -2, 2),
            height: uniform(r, 0.1, 3),
            level: uniform(r, 0, 1),
        }),
        reference: (x) => ({
            value: surfaceSolidRelief(
                x.value as number,
                vec(x.gradient),
                vec(x.du),
                vec(x.dv),
                x.height as number,
                x.level as number,
            ),
        }),
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
    {
        node: 'surface.relief',
        tolerance: 1e-5,
        sample: (r, k) => ({
            value: uniform(r, -1, 1),
            gradient: vector(r, 2, -30, 30),
            wrap: k % 7 === 6 ? [0, 3] : vector(r, 2, 0.5, 40),
            height: uniform(r, 0, 3),
            level: uniform(r, 0, 1),
        }),
        reference: (x) => ({
            value: surfaceRelief(
                x.value as number,
                vec(x.gradient),
                vec(x.wrap),
                x.height as number,
                x.level as number,
            ),
        }),
    },
    {
        node: 'surface.reliefNormal',
        tolerance: 1e-4,
        sample: (r, k) => {
            // Tangentes quase ortogonais à normal; um oitavo sem tangentes (os acertos dos raios).
            const n = vector(r, 3, -1, 1);
            const normal = dot(n, n) < 0.01 ? [0, 1, 0] : n;
            const a = cross(normal, Math.abs(normal[0]!) < 0.6 ? [1, 0, 0] : [0, 1, 0]);
            const b = cross(normal, a);
            const size = uniform(r, 0.2, 3);
            const jitter = vector(r, 3, -0.1, 0.1);
            return {
                normal,
                dpdu: k % 8 === 7 ? [0, 0, 0] : a.map((c, i) => (c + jitter[i]!) * size),
                dpdv: k % 8 === 7 ? [0, 0, 0] : b.map((c) => c * size * uniform(r, 0.5, 1.5)),
                relief: [uniform(r, -2, 2), ...vector(r, 2, -400, 400)],
                scale: uniform(r, 0.5, 6),
            };
        },
        reference: (x) => ({
            value: surfaceReliefNormal(
                vec(x.normal),
                vec(x.dpdu),
                vec(x.dpdv),
                vec(x.relief),
                x.scale as number,
            ),
        }),
    },
    {
        node: 'surface.displacement',
        tolerance: 1e-6,
        sample: (r) => ({
            relief: [uniform(r, -5, 5), ...vector(r, 2, -100, 100)],
            scale: uniform(r, 0.5, 100),
        }),
        reference: (x) => ({ value: surfaceDisplacement(vec(x.relief), x.scale as number) }),
    },
    {
        node: 'surface.direction',
        tolerance: 1e-4,
        sample: (r, k) => {
            const du = k % 8 === 7 ? [0, 0, 0] : vector(r, 3, -2, 2);
            return {
                du,
                dv: k % 8 === 7 ? [0, 0, 0] : cross(du, vector(r, 3, -1, 1)),
                direction: [uniform(r, 0.2, 1), uniform(r, 0.2, 1)],
            };
        },
        reference: (x) => ({
            value: surfaceDirection(vec(x.du), vec(x.dv), vec(x.direction)),
        }),
    },
];
