import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { SoftBody }            from '../../SoftBody';
import { BasePredictStage }         from '../shared/BasePredictStage';

/**
 * Estágio 2 do pipeline XPBD SoftBody — Predição de posição.
 *
 * Calcula posição prevista de cada partícula:
 *   p_pred = pos + vel · dt
 *
 * A posição prevista é o ponto de partida para o solve de constraints.
 * A posição atual (x,y,z) é preservada para o cálculo de velocidade posterior.
 */
export class SoftBodyPredictStage extends BasePredictStage implements PhysicsStage {
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
