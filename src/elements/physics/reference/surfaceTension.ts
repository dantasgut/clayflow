// Spec 034 (T066e) — referência f64 da tensão superficial contínua dos fluidos de partículas (as contas de
// `sph_kernels.wgsl`: `csf_normal`, `csf_young_normal`, `csf_divergence_pair`, `csf_accel`, e a fronteira sólida
// `cubic_half_space`/`poly6_half_space`): a normal pelo gradiente da cor com o sólido contado como fluido, a normal da
// borda no ângulo de Young junto dele e a curvatura como a divergência da normal na superfície. Para os testes (a
// curvatura de uma esfera de partículas contra 2/R) e para medir cenas lidas da GPU.

export type Vec3 = readonly [number, number, number];

/** Núcleo do solver: a spline cúbica do SPH (suporte 2h) ou o poly6 do PBF (suporte h). */
export type CsfKernel = 'cubic' | 'poly6';

/** |∇c| mínimo da normal, em 1/h. */
export const CSF_NORMAL_MIN = 0.1;
/** Suporte mínimo coberto pelas vizinhas com normal (Σ V |∇W| r). */
export const CSF_SUPPORT_MIN = 0.3;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** Alcance do núcleo. */
export function kernelSupport(kernel: CsfKernel, h: number): number {
    return kernel === 'cubic' ? 2 * h : h;
}

/** ∇ᵢW(xᵢ − xⱼ) do núcleo (`r` = xᵢ − xⱼ). */
export function kernelGradient(kernel: CsfKernel, r: Vec3, h: number): Vec3 {
    const d = length(r);
    if (kernel === 'cubic') {
        if (d < 1e-4 || d >= 2 * h) return [0, 0, 0];
        const q = d / h;
        const sigma = 1 / (Math.PI * h ** 3);
        const dq =
            q < 1 ? (sigma * (-3 * q + 2.25 * q * q)) / h : (sigma * -0.75 * (2 - q) ** 2) / h;
        return scale(r, dq / d);
    }
    if (d >= h) return [0, 0, 0];
    const e = h * h - d * d;
    return scale(r, (-945 / (32 * Math.PI * h ** 9)) * e * e);
}

/**
 * (B, B') do núcleo sobre o sólido além de um plano a distância com sinal `d` (B: o volume do núcleo dentro dele; B' a
 * derivada em d), por quadratura (a GPU usa Gauss-Legendre exato na cúbica e a forma fechada no poly6).
 */
export function halfSpace(kernel: CsfKernel, d: number, h: number): [number, number] {
    const support = kernelSupport(kernel, h);
    const delta = Math.abs(d);
    if (delta >= support) return [d >= 0 ? 0 : 1, 0];
    const w = (r: number): number => {
        if (kernel === 'cubic') {
            const q = r / h;
            const sigma = 1 / (Math.PI * h ** 3);
            return q < 1 ? sigma * (1 - 1.5 * q * q + 0.75 * q ** 3) : sigma * 0.25 * (2 - q) ** 3;
        }
        return (315 / (64 * Math.PI * h ** 9)) * (h * h - r * r) ** 3;
    };
    const n = 4096;
    const step = (support - delta) / n;
    let vol = 0;
    let grad = 0;
    for (let k = 0; k < n; k++) {
        const r = delta + (k + 0.5) * step;
        vol += 2 * Math.PI * w(r) * r * (r - delta) * step;
        grad -= 2 * Math.PI * w(r) * r * step;
    }
    return [d >= 0 ? vol : 1 - vol, grad];
}

/** Um sólido plano: normal unitária para fora dele e o deslocamento (a face em n·x = offset). */
export interface CsfPlane {
    readonly normal: Vec3;
    readonly offset: number;
}

/** Uma cena: as partículas, o núcleo, h, o volume de cada partícula, os sólidos planos e o ângulo de Young. */
export interface CsfScene {
    readonly positions: readonly Vec3[];
    readonly kernel: CsfKernel;
    readonly h: number;
    readonly volume: number;
    readonly planes?: readonly CsfPlane[];
    /** cos θ de Young: a normal da parede na divergência da borda junto do sólido. */
    readonly cosTheta?: number;
}

/** A passagem suave em |n − (n·w) w| da borda que não é linha de contato para a que é (o `CSF_CONTACT_LINE`). */
export const CSF_CONTACT_LINE: readonly [number, number] = [0.3, 0.7];

const smoothstep = (a: number, b: number, x: number): number => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/** A normal da parede no ângulo de Young para a borda de normal `n` junto do sólido de normal `w` (o `csf_young_normal`). */
export function youngNormal(n: Vec3, w: Vec3, cosTheta: number): Vec3 {
    const along = sub(n, scale(w, dot(n, w)));
    const sin = Math.sqrt(Math.max(1 - cosTheta * cosTheta, 0));
    const t = scale(along, 1 / Math.max(length(along), 1e-6));
    return [
        -cosTheta * w[0] + sin * t[0],
        -cosTheta * w[1] + sin * t[1],
        -cosTheta * w[2] + sin * t[2],
    ];
}

/** Σ_sólido V |∇W| r sobre o sólido além de um plano a distância `d` (o `csf_wall_support`), por quadratura. */
export function wallSupport(kernel: CsfKernel, d: number, h: number): number {
    const support = kernelSupport(kernel, h);
    const delta = Math.max(d, 0);
    if (delta >= support) return 0;
    const n = 4096;
    const step = (support - delta) / n;
    let sum = 0;
    for (let k = 0; k < n; k++) {
        const r = delta + (k + 0.5) * step;
        const g = length(kernelGradient(kernel, [r, 0, 0], h));
        sum += g * r * 2 * Math.PI * r * (r - delta) * step;
    }
    return sum;
}

/** Por partícula: ∇c, a normal unitária (zero no miolo) e |∇c| (0 no miolo). */
export interface CsfNormal {
    readonly grad: Vec3;
    readonly normal: Vec3;
    readonly magnitude: number;
}

/** O gradiente da cor e a normal de cada partícula (o `sph_normals`/`pbf_vorticity` com o `csf_normal`). */
export function csfNormals(scene: CsfScene): CsfNormal[] {
    const { positions, kernel, h, volume } = scene;
    const support = kernelSupport(kernel, h);
    return positions.map((p) => {
        let g: Vec3 = [0, 0, 0];
        for (const q of positions) {
            const r = sub(p, q);
            if (length(r) >= support) continue;
            const gw = kernelGradient(kernel, r, h);
            g = [g[0] + volume * gw[0], g[1] + volume * gw[1], g[2] + volume * gw[2]];
        }
        for (const plane of scene.planes ?? []) {
            const d = dot(plane.normal, p) - plane.offset;
            if (d >= support) continue;
            // Σ_sólido V ∇W = ∇B = B' n (a fronteira de Akinci como fluido).
            const [, slope] = halfSpace(kernel, d, h);
            g = [
                g[0] + slope * plane.normal[0],
                g[1] + slope * plane.normal[1],
                g[2] + slope * plane.normal[2],
            ];
        }
        const magnitude = length(g);
        if (magnitude < CSF_NORMAL_MIN / h) return { grad: g, normal: [0, 0, 0], magnitude: 0 };
        const normal = scale(g, 1 / magnitude);
        return { grad: g, normal, magnitude };
    });
}

/** Por partícula: a curvatura κ (NaN sem suporte suficiente ou no miolo) e a aceleração para σ/ρ₀ = 1. */
export interface CsfCurvature {
    readonly kappa: number;
    readonly accel: Vec3;
}

/**
 * A curvatura de cada partícula, κ = −2 Σ V (n̂ⱼ − n̂ᵢ)·∇W / Σ V |∇W| r sobre as vizinhas com normal (a divergência na
 * superfície), limitada a ±2/h, e a aceleração κ |∇c| n̂ por unidade de σ/ρ₀ (o `csf_accel`).
 */
export function csfCurvatures(scene: CsfScene, normals = csfNormals(scene)): CsfCurvature[] {
    const { positions, kernel, h, volume } = scene;
    const support = kernelSupport(kernel, h);
    return positions.map((p, i) => {
        const ni = normals[i]!;
        if (ni.magnitude <= 0) return { kappa: NaN, accel: [0, 0, 0] };
        let num = 0;
        let den = 0;
        positions.forEach((q, j) => {
            const nj = normals[j]!;
            if (nj.magnitude <= 0) return;
            const r = sub(p, q);
            const d = length(r);
            if (d >= support) return;
            const gw = kernelGradient(kernel, r, h);
            num += dot(sub(nj.normal, ni.normal), gw);
            den += length(gw) * d;
        });
        // A parede mais próxima como vizinha com a normal de Young, só na linha de contato (o `csf_wall_pair`).
        let nearest: { plane: CsfPlane; dist: number } | undefined;
        for (const plane of scene.planes ?? []) {
            const d = dot(plane.normal, p) - plane.offset;
            if (d < support && (nearest === undefined || d < nearest.dist))
                nearest = { plane, dist: d };
        }
        if (nearest !== undefined) {
            const w = nearest.plane.normal;
            const weight = smoothstep(
                CSF_CONTACT_LINE[0],
                CSF_CONTACT_LINE[1],
                length(sub(ni.normal, scale(w, dot(ni.normal, w)))),
            );
            if (weight > 0) {
                const nw = youngNormal(ni.normal, w, scene.cosTheta ?? 0);
                const [, slope] = halfSpace(kernel, nearest.dist, h);
                num += (weight * dot(sub(nw, ni.normal), scale(w, slope))) / volume;
                den += (weight * wallSupport(kernel, nearest.dist, h)) / volume;
            }
        }
        if (den * volume < CSF_SUPPORT_MIN) return { kappa: NaN, accel: [0, 0, 0] };
        const kappa = Math.max(-2 / h, Math.min(2 / h, (-2 * num) / den));
        return { kappa, accel: scale(ni.normal, kappa * ni.magnitude) };
    });
}
