import type { PhysicsBody } from '../../components/physics/PhysicsBody';

/**
 * Abstração de backend de simulação física (Bridge — GoF).
 *
 * Separa a definição do corpo (PhysicsBody = abstração)
 * do algoritmo de simulação (PhysicsSolver = implementação).
 * Novas estratégias de integração (PBD, Verlet, XPBD, CPU fallback)
 * podem ser introduzidas sem modificar nenhum corpo físico.
 *
 * @example
 * world.setSolver('RigidBody', new CPURigidBodySolver());
 * world.setSolver('SoftBody', new GPUSpringMassSolver(compute));
 */
export interface PhysicsSolver {
    /** Identificador único do solver para logging e profiling. */
    readonly id: string;

    /**
     * Avança a simulação do corpo por um passo de tempo.
     * @param body   Corpo a simular
     * @param dt     Delta-time em segundos
     */
    solve(body: PhysicsBody, dt: number): void;
}
