import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';

/**
 * Classe base abstrata para estágios de derivação de velocidade pós-solve.
 *
 * Fornece:
 *   - Guarda comum: if (dt <= 0) return — evita divisão por zero
 *   - computeDampingFactor(): cálculo compartilhado do fator de amortecimento
 *   - Template Method execute() que delega a deriveVelocities()
 *
 * Subclasses concretas:
 *   - PBDVelocityRecoveryStage  — RigidBody: vel = (pos_new − pos_old) / dt × dampFactor
 *   - SoftBodyVelocityUpdateStage — SoftBody: vel = (p_pred - p) / dt × dampFactor
 */
export abstract class BaseVelocityDerivationStage implements PhysicsStage {
    /**
     * Template principal. Aplica guarda de dt antes de delegar.
     */
    public execute(context: PhysicsStageContext, dt: number): void {
        if (dt <= 0) return;
        this.deriveVelocities(context, dt);
    }

    /**
     * Subclasses implementam a derivação de velocidade específica para seus tipos de corpo.
     */
    protected abstract deriveVelocities(context: PhysicsStageContext, dt: number): void;

    /**
     * Calcula o fator de amortecimento para um passo de tempo dt.
     *   factor = max(0, 1 - damping * dt)
     *
     * Compartilhado entre PBDVelocityRecoveryStage e SoftBodyVelocityUpdateStage.
     */
    protected computeDampingFactor(damping: number, dt: number): number {
        return Math.max(0, 1 - damping * dt);
    }
}
