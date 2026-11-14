// Cenas de partículas compartilhadas pelos smokes de física (`trajectories`, `particles`): gerador determinístico,
// gravidade, chão, tanque e blocos de partículas com jitter — a mesma disposição gravada nas fixtures.
import { GravityField, ParticlePhysics, RigidBody } from 'clayflow/web';
import type { Application } from 'clayflow/web';
import { mulberry32 } from './random';

/** Gerador determinístico das cenas (mulberry32: a sequência de `trajectories`). */
export const rng = mulberry32;

/** Espaçamento das partículas (material padrão). */
export const SPACING = ParticlePhysics.defaults.particleSpacing;
/** Meia largura interna do tanque dos fluidos (m). */
export const TANK = 0.5;

export function gravity(app: Application): void {
    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
}

export function ground(app: Application): void {
    gravity(app);
    app.world.insert(
        new RigidBody({ shape: 'box', mass: 0, halfExtents: [4, 0.5, 4], position: [0, -0.5, 0] }),
    );
}

/** Chão + 4 paredes estáticas: tanque de 2·TANK × 2·TANK com topo do chão em y = 0. */
export function tank(app: Application): void {
    ground(app);
    const t = 0.1;
    const h = 0.6;
    // Paredes enterradas 0,2 m no chão: a face de baixo não coincide com a superfície do chão.
    const y = h - 0.2;
    for (const [x, z, hx, hz] of [
        [TANK + t, 0, t, TANK + 2 * t],
        [-(TANK + t), 0, t, TANK + 2 * t],
        [0, TANK + t, TANK, t],
        [0, -(TANK + t), TANK, t],
    ] as const) {
        app.world.insert(
            new RigidBody({ shape: 'box', mass: 0, halfExtents: [hx, h, hz], position: [x, y, z] }),
        );
    }
}

export function block(
    n: number,
    spacing: number,
    origin: readonly [number, number, number],
    seed: number,
): [number, number, number][] {
    const r = rng(seed);
    const side = Math.ceil(Math.cbrt(n));
    const out: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
        const x = i % side;
        const y = Math.floor(i / (side * side));
        const z = Math.floor(i / side) % side;
        out.push([
            origin[0] + x * spacing + (r() - 0.5) * spacing * 0.1,
            origin[1] + y * spacing + (r() - 0.5) * spacing * 0.1,
            origin[2] + z * spacing + (r() - 0.5) * spacing * 0.1,
        ]);
    }
    return out;
}
