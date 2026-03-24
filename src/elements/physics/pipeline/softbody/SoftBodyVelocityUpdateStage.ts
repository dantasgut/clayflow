import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { SoftBody }            from '../../SoftBody';
import { BaseVelocityDerivationStage } from '../shared/BaseVelocityDerivationStage';

/**
 * Estágio 4 do pipeline XPBD SoftBody — Atualização de velocidade e posição das partículas.
 *
 * Especialização de {@link BaseVelocityDerivationStage} para corpos moles (SoftBody).
 * Executado após {@link DistanceConstraintStage}, deriva a velocidade de cada partícula
 * a partir do deslocamento real sofrido durante o solve de constraints:
 *
 * ```
 * vel = (p_pred − p_old) / dt × dampFactor
 * ```
 *
 * O fator de amortecimento é calculado via {@link BaseVelocityDerivationStage.computeDampingFactor}:
 * ```
 * dampFactor = max(0, 1 − damping × dt)
 * ```
 *
 * Ao final, commita a posição prevista `(px, py, pz)` como posição atual `(x, y, z)`,
 * encerrando o ciclo XPBD para o substep.
 *
 * A guarda `dt <= 0` é fornecida pela classe base {@link BaseVelocityDerivationStage},
 * evitando divisão por zero sem código extra na subclasse.
 */
export class SoftBodyVelocityUpdateStage extends BaseVelocityDerivationStage implements PhysicsStage {
    /**
     * Itera todos os SoftBodies do contexto, deriva as velocidades e commita as posições.
     * Corpos de outros tipos físicos são ignorados.
     *
     * @param context - Contexto do passo de física com corpos e contatos.
     * @param dt      - Passo de tempo do substep (segundos), sempre positivo (garantido pela classe base).
     */
    protected deriveVelocities(context: PhysicsStageContext, dt: number): void {
        const invDt = 1 / dt;

        for (const { body } of context.bodies.values()) {
            if (body.physicType !== 'SoftBody') continue;
            const sb = body as unknown as SoftBody;
            // Damping escalado por dt: independente do número de substeps.
            // damping=0.02 → ~2% de perda por segundo, não por substep.
            const damping = sb.get<number>('damping') ?? 0.01;
            const dampFactor = this.computeDampingFactor(damping, dt);

            for (const p of sb.particles) {
                p.vx = (p.px - p.x) * invDt * dampFactor;
                p.vy = (p.py - p.y) * invDt * dampFactor;
                p.vz = (p.pz - p.z) * invDt * dampFactor;
            }
        }
    }
}
