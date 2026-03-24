import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';

/**
 * Classe base abstrata para estágios de predição de posição (Template Method).
 *
 * Define o template do execute() que pode ser estendido para guarda comum e
 * delega a iteração sobre os corpos a predictBodies() nas subclasses.
 *
 * Subclasses concretas:
 *   - PBDPredictStage    — RigidBody: salva cache e integra Euler + quaternion
 *   - SoftBodyPredictStage — SoftBody: calcula posição prevista das partículas
 */
export abstract class BasePredictStage implements PhysicsStage {
    /**
     * Template principal. Delega para predictBodies().
     */
    public execute(context: PhysicsStageContext, dt: number): void {
        this.predictBodies(context, dt);
    }

    /**
     * Subclasses implementam a lógica de predição específica para seus tipos de corpo.
     */
    protected abstract predictBodies(context: PhysicsStageContext, dt: number): void;
}
