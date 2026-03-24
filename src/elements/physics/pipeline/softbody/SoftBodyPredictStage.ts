import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { SoftBody }            from '../../SoftBody';
import { BasePredictStage }         from '../shared/BasePredictStage';

/**
 * Estágio 2 do pipeline XPBD SoftBody — Predição de posição das partículas.
 *
 * Especialização de {@link BasePredictStage} para corpos moles (SoftBody).
 * Para cada partícula de cada SoftBody acordado, calcula a posição prevista
 * usando integração de Euler explícita:
 *
 * ```
 * p_pred = (x, y, z) + (vx, vy, vz) · dt
 * ```
 *
 * A posição prevista `(px, py, pz)` é o ponto de partida do solve de constraints
 * em {@link DistanceConstraintStage}. A posição atual `(x, y, z)` é preservada
 * para que {@link SoftBodyVelocityUpdateStage} possa derivar a velocidade após o solve:
 * `vel = (p_pred − p_old) / dt`.
 *
 * Guarda: `dt <= 0` aborta a predição para evitar divisão por zero no estágio posterior.
 */
export class SoftBodyPredictStage extends BasePredictStage implements PhysicsStage {
    /**
     * Itera todos os SoftBodies do contexto e calcula as posições previstas.
     * Corpos de outros tipos físicos são ignorados.
     *
     * @param context - Contexto do passo de física com corpos e contatos.
     * @param dt      - Passo de tempo do substep (segundos).
     */
    protected predictBodies(context: PhysicsStageContext, dt: number): void {
        if (dt <= 0) return;
        for (const { body } of context.bodies.values()) {
            if (body.physicType !== 'SoftBody') continue;
            const sb = body as unknown as SoftBody;
            for (const p of sb.particles) {
                p.px = p.x + p.vx * dt;
                p.py = p.y + p.vy * dt;
                p.pz = p.z + p.vz * dt;
            }
        }
    }
}
