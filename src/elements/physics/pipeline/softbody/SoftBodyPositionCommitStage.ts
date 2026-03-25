import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { SoftBody }            from '../../SoftBody';

/**
 * Estágio 5 do pipeline XPBD SoftBody — Commit de posição.
 *
 * Commita a posição predita como posição atual de cada partícula:
 *   p = p_pred
 *
 * Deve ser executado imediatamente após {@link SoftBodyVelocityUpdateStage},
 * pois a derivação de velocidade depende de `p` ainda conter a posição anterior.
 */
export class SoftBodyPositionCommitStage implements PhysicsStage {
    public execute(context: PhysicsStageContext, _dt: number): void {
        for (const { body } of context.bodies.values()) {
            if (body.physicType !== 'SoftBody') continue;
            if (body.get<boolean>('gpuSimulated')) continue; // pipeline GPU ativo — skip CPU
            const sb = body as unknown as SoftBody;

            for (const p of sb.particles) {
                p.x = p.px;
                p.y = p.py;
                p.z = p.pz;
            }
        }
    }
}
