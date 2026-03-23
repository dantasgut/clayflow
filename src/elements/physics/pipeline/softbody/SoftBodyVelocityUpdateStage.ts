import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { SoftBody }            from '../../SoftBody';

/**
 * Estágio 4 do pipeline XPBD SoftBody — Atualização de velocidade e posição.
 *
 * Após o solve de constraints, deriva velocidade a partir do deslocamento:
 *   vel = (p_pred - p_old) / dt
 *
 * Aplica damping linear para dissipar energia residual:
 *   vel *= (1 - damping)
 *
 * Commita a posição prevista como posição atual.
 */
export class SoftBodyVelocityUpdateStage implements PhysicsStage {
    public execute(context: PhysicsStageContext, dt: number): void {
        if (dt <= 0) return;
        const invDt = 1 / dt;

        for (const { body } of context.bodies.values()) {
            if (body.physicType !== 'SoftBody') continue;
            const sb = body as unknown as SoftBody;
            // Damping escalado por dt: independente do número de substeps.
            // damping=0.02 → ~2% de perda por segundo, não por substep.
            const damping = sb.get<number>('damping') ?? 0.01;
            const dampFactor = Math.max(0, 1 - damping * dt);

            for (const p of sb.particles) {
                p.vx = (p.px - p.x) * invDt * dampFactor;
                p.vy = (p.py - p.y) * invDt * dampFactor;
                p.vz = (p.pz - p.z) * invDt * dampFactor;

                p.x = p.px;
                p.y = p.py;
                p.z = p.pz;
            }
        }
    }
}
