import type { World } from '../../../../scene/world/World';
import type { Entity } from '../../../../scene/contracts/Entity';
import { FluidBody } from '../../bodies/FluidBody';
import { RigidBody } from '../../bodies/RigidBody';
import { SoftBody } from '../../bodies/SoftBody';
import { GravityField } from '../../forcefields/GravityField';

/** Gravidade da cena (consumida pelos solvers). */
export function insertGravity(world: World): void {
    world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
}

/**
 * Insere um corpo de cada solver padrão — LCP (chão estático + esfera), XPBD (corrente de 4 partículas com 3 arestas), FEM, MPM sólido, MPM fluido, SPH e PBF — deslocados em `x`. Devolve as entidades inseridas.
 */
export function insertSolverBodies(world: World, x = 0): Entity<object>[] {
    const bodies: Entity<object>[] = [
        new RigidBody({ shape: 'box', mass: 0, halfExtents: [4, 0.5, 4], position: [x, -0.5, 0] }),
        new RigidBody({ shape: 'sphere', radius: 0.3, mass: 1, position: [x, 1, 0] }),
    ];
    bodies.push(
        new SoftBody({
            algorithm: 'XPBD',
            position: [0, 1, 2, 3].flatMap((i) => [x + i * 0.1, 2, 0]),
            mass: [0, 0.1, 0.1, 0.1],
            edges: { a: [0, 1, 2], b: [1, 2, 3], restLength: [0.1, 0.1, 0.1], compliance: 1e-6 },
        }),
    );
    bodies.push(new SoftBody({ algorithm: 'FEM', position: [x, 3, 0], mass: 0.05 }));
    bodies.push(new SoftBody({ algorithm: 'MPM', position: [x + 1, 3, 0] }));
    for (const algorithm of ['MPM', 'SPH', 'PBF'] as const) {
        bodies.push(new FluidBody({ algorithm, position: [x + 2, 3, 0] }));
    }
    for (const body of bodies) world.insert(body);
    return bodies;
}
