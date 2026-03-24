import type { PhysicsStage }        from '../../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../../scene/systems/PhysicsStageContext';
import type { PBDState }            from './PBDState';
import type { vec3, quat }          from 'gl-matrix';
import { BaseVelocityDerivationStage } from '../../shared/BaseVelocityDerivationStage';

/**
 * Estágio 6a do pipeline PBD — Recuperação de velocidades.
 *
 * Após o `PBDSolveStage` ter projetado posições e rotações para satisfazer
 * as constraints, este estágio deriva as velocidades do delta de
 * posição/rotação em relação aos valores pré-solve armazenados em
 * `PBDState.posCache` / `PBDState.rotCache`:
 *
 *   vel   = (pos_new − pos_old) / dt   × (1 − linDamping · dt)
 *   omega = 2 · Δq.xyz / dt           × (1 − angDamping · dt)
 *
 * onde Δq = q_new ⊗ conj(q_old) e o sinal de Δq.w escolhe o caminho curto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DAMPING
 * ─────────────────────────────────────────────────────────────────────────────
 * O ForceStage aplica damping sobre a velocidade de predição, que no PBD é
 * descartada ao se recalcular a velocidade a partir do delta de posição.
 * O fator de damping é aplicado aqui para que `linearDamping` e
 * `angularDamping` tenham efeito real no pipeline PBD.
 *
 * Nota: o ForceStage já aplica uma vez, resultando em ~2× de dissipação —
 * pequena sobre-dissipação aceitável para manter a estabilidade.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEPARAÇÃO DE RESPONSABILIDADES
 * ─────────────────────────────────────────────────────────────────────────────
 * Este estágio NÃO resolve contatos. A resposta a colisões (restituição +
 * atrito) é responsabilidade do `PBDContactResponseStage`, que deve ser
 * posicionado imediatamente após este no pipeline.
 */
export class PBDVelocityRecoveryStage extends BaseVelocityDerivationStage implements PhysicsStage {
    constructor(private readonly state: PBDState) {
        super();
    }

    protected deriveVelocities(context: PhysicsStageContext, dt: number): void {
        for (const { body } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic')) continue;

            const uuid   = body.uuid;
            const posOld = this.state.posCache.get(uuid);
            const rotOld = this.state.rotCache.get(uuid);
            if (!posOld && !rotOld) continue;

            const pos = body.get<vec3>('position');
            const rot = body.get<quat>('rotation');

            const linDamp   = body.get<number>('linearDamping')  ?? 0;
            const angDamp   = body.get<number>('angularDamping') ?? 0;
            const linFactor = linDamp > 0 ? this.computeDampingFactor(linDamp, dt) : 1;
            const angFactor = angDamp > 0 ? this.computeDampingFactor(angDamp, dt) : 1;

            if (pos && posOld) {
                const vx = ((pos[0] ?? 0) - posOld[0]) / dt * linFactor;
                const vy = ((pos[1] ?? 0) - posOld[1]) / dt * linFactor;
                const vz = ((pos[2] ?? 0) - posOld[2]) / dt * linFactor;
                const vel = body.get<vec3>('velocity');
                if (vel) {
                    vel[0] = vx; vel[1] = vy; vel[2] = vz;
                } else {
                    body.set('velocity', new Float32Array([vx, vy, vz]) as unknown as vec3);
                }
            }

            if (rot && rotOld) {
                const nx_ = rot[0] ?? 0;
                const ny_ = rot[1] ?? 0;
                const nz_ = rot[2] ?? 0;
                const nw  = rot[3] ?? 1;
                const [ox, oy, oz, ow] = rotOld;
                // Δq = q_new ⊗ conj(q_old),  conj([x,y,z,w]) = [−x,−y,−z,w]
                const dqx =  nw * (-ox!) + nx_ * ow! + ny_ * (-oz!) - nz_ * (-oy!);
                const dqy =  nw * (-oy!) - nx_ * (-oz!) + ny_ * ow! + nz_ * (-ox!);
                const dqz =  nw * (-oz!) + nx_ * (-oy!) - ny_ * (-ox!) + nz_ * ow!;
                const dqw =  nw * ow!    + nx_ * ox!    + ny_ * oy!    + nz_ * oz!;
                // omega = 2 · Δq.xyz / dt  (sinal de dqw para o caminho curto)
                const sign = dqw >= 0 ? 1 : -1;
                const wx   = sign * 2 * dqx / dt * angFactor;
                const wy   = sign * 2 * dqy / dt * angFactor;
                const wz   = sign * 2 * dqz / dt * angFactor;
                const omega = body.get<vec3>('angularVelocity');
                if (omega) {
                    omega[0] = wx; omega[1] = wy; omega[2] = wz;
                } else {
                    body.set('angularVelocity', new Float32Array([wx, wy, wz]) as unknown as vec3);
                }
            }
        }
    }
}
