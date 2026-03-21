import type { Entity } from '../core/Entity';
import type { PhysicsBody } from '../components/physics/PhysicsBody';
import type { Collider } from '../components/physics/Collider';
import type { PhysicsSolver } from './solvers/PhysicsSolver';
import type { Force } from './forces/Force';

/**
 * Contrato abstrato de um mundo de simulação física.
 *
 * Não faz suposições sobre:
 *  - O espaço (euclidiano, hiperbólico, abstrato)
 *  - O algoritmo de broadphase
 *  - A ordem do pipeline de simulação
 *  - A natureza das forças ou colisores
 *
 * Registro de corpos é event-driven via connectScene/disconnectScene —
 * não há registro manual por frame. O step avança a simulação e nada mais.
 *
 * @example
 * const world = new PhysicsWorld();
 * world.connectScene(scene);          // observa child_added / child_removed
 * // No loop de render:
 * world.step(encoder, dt);
 */
export abstract class SimulationWorld {
    // ------------------------------------------------------------------
    // Vínculo com a cena — registro event-driven
    // ------------------------------------------------------------------

    /**
     * Conecta o mundo a uma cena: observa child_added e child_removed
     * para registrar/remover corpos e colliders automaticamente.
     * Também registra todos os physics components já presentes na cena.
     */
    public abstract connectScene(scene: Entity): void;

    /** Remove a observação da cena e limpa todos os registros. */
    public abstract disconnectScene(scene: Entity): void;

    // ------------------------------------------------------------------
    // Configuração de simulação
    // ------------------------------------------------------------------

    /** Associa um solver ao tipo de corpo (Bridge). */
    public abstract setSolver(physicType: string, solver: PhysicsSolver): void;
    public abstract removeSolver(physicType: string): void;

    /** Registra uma força global aplicada a todos os corpos a cada step. */
    public abstract addForce(force: Force): void;
    public abstract removeForce(id: string): void;

    // ------------------------------------------------------------------
    // Passo de simulação
    // ------------------------------------------------------------------

    /**
     * Avança a simulação por `dt` segundos.
     * A implementação decide o pipeline interno (broadphase, narrowphase, integração).
     */
    public abstract step(scene: Entity, dt: number): void;
}
