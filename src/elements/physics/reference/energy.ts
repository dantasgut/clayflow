// Spec 037 — referência f64 da energia dos corpos rígidos (a conta do kernel `body_energy.wgsl`) e a lei discreta do
// amortecimento do solver LCP (`rb_lcp_commit.wgsl`), para o smoke `energy`; e a dos corpos moles (as contas das fontes
// `soft_energy_*.wgsl`: partícula, aresta do XPBD, Neo-Hookean do MPM) com as leis do amortecimento do XPBD e do FEM,
// para o smoke `softEnergy`.

type Vec3 = readonly [number, number, number];

/** O estado de um corpo rígido que a energia usa (os campos do `RigidBody` lidos da GPU). */
export interface RigidBodyState {
    /** Inverso da massa (0 = cinemático). */
    readonly invMass: number;
    readonly position: Vec3;
    readonly velocity: Vec3;
    /** Velocidade angular no mundo. */
    readonly omega: Vec3;
    /** Orientação (x, y, z, w). */
    readonly rotation: readonly [number, number, number, number];
    /** Diagonal do inverso da inércia no corpo (0 = eixo travado). */
    readonly inertiaInv: Vec3;
}

/** A energia de um corpo: a cinética (translação + rotação) e a potencial no campo uniforme `gravity`. */
export interface BodyEnergyValues {
    readonly kinetic: number;
    readonly potential: number;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

/** `v` pela rotação inversa de `q` (do mundo ao corpo; a conta de `quat_rotate_vec_inv`). */
export function rotateInverse(q: readonly [number, number, number, number], v: Vec3): Vec3 {
    const qv: Vec3 = [q[0], q[1], q[2]];
    const c = cross(qv, v);
    const t: Vec3 = [2 * c[0], 2 * c[1], 2 * c[2]];
    const u = cross(qv, t);
    return [v[0] - q[3] * t[0] + u[0], v[1] - q[3] * t[1] + u[1], v[2] - q[3] * t[2] + u[2]];
}

/**
 * Energia de um corpo rígido em f64: ½·m·|v|² + ½·ω_cᵀ·I·ω_c (ω levado ao corpo; I a diagonal, eixo travado sem
 * rotação) e −m·g·x. Cinemático: zero.
 */
export function bodyEnergy(body: RigidBodyState, gravity: Vec3): BodyEnergyValues {
    if (!(body.invMass > 0)) return { kinetic: 0, potential: 0 };
    const m = 1 / body.invMass;
    const wc = rotateInverse(body.rotation, body.omega);
    // Eixo travado (inverso 0): sem rotação nele, sem energia.
    const term = (w: number, inv: number): number => (inv > 0 ? (w * w) / inv : 0);
    const [ix, iy, iz] = body.inertiaInv;
    const rotational = term(wc[0], ix) + term(wc[1], iy) + term(wc[2], iz);
    return {
        kinetic: 0.5 * m * dot(body.velocity, body.velocity) + 0.5 * rotational,
        potential: -m * dot(gravity, body.position),
    };
}

/**
 * O amortecimento do solver LCP num passo (`rb_lcp_commit.wgsl`): a velocidade (e a angular) multiplicada por
 * max(1 − k·dt, 0). A energia cinética de um corpo livre (sem gravidade nem contato) cai pelo quadrado disso a cada passo.
 */
export function lcpDampingFactor(k: number, dt: number): number {
    return Math.max(1 - k * dt, 0);
}

/** Razão E(n − passos)/E(n) da energia cinética de um corpo livre com o amortecimento do LCP (mesmo k nos dois termos). */
export function dampedEnergyRatio(k: number, dt: number, steps: number): number {
    return lcpDampingFactor(k, dt) ** (-2 * steps);
}

/** A energia de uma partícula de massa `mass`: ½·m·|v|² e −m·g·x no campo uniforme `gravity`. */
export function particleEnergy(
    mass: number,
    position: Vec3,
    velocity: Vec3,
    gravity: Vec3,
): BodyEnergyValues {
    return {
        kinetic: 0.5 * mass * dot(velocity, velocity),
        potential: -mass * dot(gravity, position),
    };
}

/**
 * A energia elástica de uma restrição de distância do XPBD entre `a` e `b`: ½·C²/α, C = |b − a| − repouso — a energia
 * de que o XPBD com complacência α é a minimização (Macklin et al. 2016). α = 0 é restrição rígida: sem energia
 * definida, zero.
 */
export function edgeElasticEnergy(a: Vec3, b: Vec3, rest: number, compliance: number): number {
    if (!(compliance > 0)) return 0;
    const c = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) - rest;
    return (0.5 * c * c) / compliance;
}

/** Determinante de F dada pelas colunas (x, y, z de cada uma). */
export function det3(f: readonly [Vec3, Vec3, Vec3]): number {
    const [a, b, c] = f;
    return dot(a, cross(b, c));
}

/**
 * A energia elástica Neo-Hookean de uma partícula do MPM (o modelo do `mpm_p2g.wgsl`, de que P = μ(F − F⁻ᵀ) + λ·ln J·F⁻ᵀ
 * é a derivada): V₀·ψ(F), ψ = μ/2·(tr FᵀF − 3) − μ·ln J + λ/2·(ln J)², F pelas colunas.
 */
export function neoHookeanEnergy(
    f: readonly [Vec3, Vec3, Vec3],
    mu: number,
    lambda: number,
    volume: number,
): number {
    const trace = dot(f[0], f[0]) + dot(f[1], f[1]) + dot(f[2], f[2]);
    const logJ = Math.log(det3(f));
    return volume * (0.5 * mu * (trace - 3) - mu * logJ + 0.5 * lambda * logJ * logJ);
}

/** O amortecimento do XPBD num substep (`velocity_update.wgsl`): a velocidade multiplicada por max(1 − c·dt, 0). */
export function xpbdDampingFactor(c: number, dtSub: number): number {
    return Math.max(1 - c * dtSub, 0);
}

/** O amortecimento do FEM num substep (`fem_velocity_update.wgsl`): a velocidade multiplicada por max(1 − c, 0). */
export function femDampingFactor(c: number): number {
    return Math.max(1 - c, 0);
}

/**
 * Razão E(n − passos)/E(n) da energia cinética de um corpo livre (sem campo, sem restrição violada) cujo solver
 * multiplica a velocidade por `factor` a cada um dos `substeps` substeps do passo.
 */
export function substepEnergyRatio(factor: number, substeps: number, steps: number): number {
    return factor ** (-2 * substeps * steps);
}
