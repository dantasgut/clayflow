/**
 * Geradores determinísticos compartilhados pelas duas engines (FR-003): mesma semente ⇒
 * mesmas posições, cores, escalas e movimento.
 */

/** PRNG mulberry32 — sequência em [0, 1) a partir de uma semente inteira. */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export type Vec3 = readonly [number, number, number];
/** Quaternion `[x, y, z, w]` — formato do `Transform` do clayflow e do `Quaternion` do Three. */
export type Quat = readonly [number, number, number, number];

/** Pose de um objeto do layout. */
export interface Placement {
    readonly position: Vec3;
    readonly rotation: Quat;
    readonly scale: number;
    readonly color: Vec3;
}

/**
 * Espalha `count` objetos numa grade quadrada de lado `extent` (centrada na origem, plano XZ)
 * com jitter, rotação em Y, escala e cor vindas do `rng`.
 */
export function gridScatter(rng: () => number, count: number, extent: number): Placement[] {
    const side = Math.max(1, Math.ceil(Math.sqrt(count)));
    const cell = extent / side;
    const out: Placement[] = [];
    for (let i = 0; i < count; i++) {
        const gx = i % side;
        const gz = Math.floor(i / side);
        const x = -extent / 2 + (gx + 0.5) * cell + (rng() - 0.5) * cell * 0.5;
        const z = -extent / 2 + (gz + 0.5) * cell + (rng() - 0.5) * cell * 0.5;
        const y = heightJitter(rng, cell * 0.5);
        const angle = rng() * Math.PI * 2;
        out.push({
            position: [x, y, z],
            rotation: axisAngle([0, 1, 0], angle),
            scale: cell * (0.3 + rng() * 0.3),
            color: [0.2 + rng() * 0.8, 0.2 + rng() * 0.8, 0.2 + rng() * 0.8],
        });
    }
    return out;
}

/** Altura aleatória em [0, amplitude). */
export function heightJitter(rng: () => number, amplitude: number): number {
    return rng() * amplitude;
}

/** Quaternion unitário de uma rotação de `angle` radianos em torno de `axis` (normalizado). */
export function axisAngle(axis: Vec3, angle: number): Quat {
    const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    const s = Math.sin(angle / 2) / len;
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** Produto de quaternions `a ⊗ b` (aplica `b` e depois `a`). */
export function quatMul(a: Quat, b: Quat): Quat {
    return [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
}

/**
 * Pose de um objeto em movimento no instante `t` (s): órbita pequena em torno da posição
 * base (raio proporcional à escala) e giro em Y, com fase e velocidade derivadas do índice.
 * Em `t = 0` devolve exatamente a pose base. Função pura — as duas engines chamam com o mesmo
 * `t` acumulado.
 */
export function motionAt(
    base: Placement,
    index: number,
    t: number,
): { position: Vec3; rotation: Quat } {
    if (t === 0) return { position: base.position, rotation: base.rotation };
    const speed = 0.5 + ((index * 7919) % 100) / 100;
    const phase = ((index * 104729) % 360) * (Math.PI / 180);
    const radius = base.scale * 0.75;
    const a = phase + t * speed;
    const position: Vec3 = [
        base.position[0] + radius * (Math.cos(a) - Math.cos(phase)),
        base.position[1] + radius * 0.5 * (Math.sin(a * 2) - Math.sin(phase * 2)),
        base.position[2] + radius * (Math.sin(a) - Math.sin(phase)),
    ];
    const spin = axisAngle([0, 1, 0], t * speed * 2);
    return { position, rotation: quatMul(spin, base.rotation) };
}
