import type { PhysicsSolver } from '../../../scene/systems/solvers/PhysicsSolver';
import type { PhysicsBody } from '../../../scene/components/physics/PhysicsBody';
import { vec3 } from 'gl-matrix';

/**
 * Solver CPU para corpos rígidos (integrador de Euler semi-implícito).
 * Lê propriedades via Property Bag — não depende de RigidBody concretamente.
 * Qualquer PhysicsBody com 'mass' e 'velocity' pode ser simulado por este solver.
 *
 * Forças acumuladas pelo PhysicsWorld em 'netForce' são integradas aqui.
 */
export class CPURigidBodySolver implements PhysicsSolver {
    public readonly id = 'cpu_rigid_body';

    public solve(body: PhysicsBody, dt: number): void {
        if (body.get<boolean>('isKinematic')) return;

        const mass     = body.get<number>('mass') ?? 1.0;
        const velocity = body.get<vec3>('velocity');
        if (!velocity) return;

        const netForce = body.get<vec3>('netForce');
        if (netForce) {
            velocity[0] = (velocity[0] ?? 0) + (netForce[0]! / mass) * dt;
            velocity[1] = (velocity[1] ?? 0) + (netForce[1]! / mass) * dt;
            velocity[2] = (velocity[2] ?? 0) + (netForce[2]! / mass) * dt;
        }

        // Amortecimento linear — decaimento exponencial da velocidade.
        // 'linearDamping' é uma taxa por segundo (default 0.05).
        // Aplicado por substep com dt correto para evitar over-damping.
        const damping = body.get<number>('linearDamping') ?? 0.05;
        const decay = Math.max(0, 1 - damping * dt);
        velocity[0] = (velocity[0] ?? 0) * decay;
        velocity[1] = (velocity[1] ?? 0) * decay;
        velocity[2] = (velocity[2] ?? 0) * decay;

        // Angular damping
        const angularDamping = body.get<number>('angularDamping') ?? 0.1;
        const angDecay = Math.max(0, 1 - angularDamping * dt);
        const omega = body.get<vec3>('angularVelocity');
        if (omega) {
            omega[0] = (omega[0] ?? 0) * angDecay;
            omega[1] = (omega[1] ?? 0) * angDecay;
            omega[2] = (omega[2] ?? 0) * angDecay;
        }
    }
}
