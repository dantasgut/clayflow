import type { PhysicsStage }        from '../../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../../scene/systems/PhysicsStageContext';
import type { XPBDState }           from './XPBDState';
import type { vec3, quat }          from 'gl-matrix';
import { QuaternionUtils }          from '../../../math/QuaternionUtils';
import { BaseVelocityDerivationStage } from '../../shared/BaseVelocityDerivationStage';

/**
 * Estágio 6a do pipeline XPBD — Recuperação de velocidades dos RigidBodies.
 *
 * Especialização de {@link BaseVelocityDerivationStage} para corpos rígidos.
 * Após o {@link SolveStage} ter projetado posições e rotações para satisfazer
 * as constraints, este estágio deriva as velocidades a partir do delta de
 * posição/rotação em relação aos valores pré-solve armazenados em
 * {@link XPBDState.posCache} / {@link XPBDState.rotCache} pelo {@link PredictStage}:
 *
 * ```
 * vel   = (pos_new − pos_old) / dt   × (1 − linDamping · dt)
 * omega = 2 · Δq.xyz / dt           × (1 − angDamping · dt)
 * ```
 *
 * onde `Δq = q_new ⊗ conj(q_old)` e o sinal de `Δq.w` escolhe o caminho mais curto
 * na esfera de quaternions (evita flip de 360°).
 *
 * O fator de amortecimento é calculado via {@link BaseVelocityDerivationStage.computeDampingFactor}.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DAMPING
 * ─────────────────────────────────────────────────────────────────────────────
 * O {@link ForceStage} aplica damping sobre a velocidade de predição, que no XPBD é
 * descartada ao recalcular a velocidade a partir do delta de posição.
 * O fator de amortecimento é reaplicado aqui para que `linearDamping` e
 * `angularDamping` tenham efeito real no pipeline XPBD.
 *
 * Nota: o `ForceStage` já aplica uma vez, resultando em ~2× de dissipação —
 * sobre-dissipação pequena e aceitável para manter a estabilidade.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEPARAÇÃO DE RESPONSABILIDADES
 * ─────────────────────────────────────────────────────────────────────────────
 * Este estágio NÃO resolve contatos. A resposta a colisões (restituição +
 * atrito) é responsabilidade do `ContactResponseStage`, que deve ser
 * posicionado imediatamente após este no pipeline.
 */
export class VelocityRecoveryStage extends BaseVelocityDerivationStage implements PhysicsStage {
    /**
     * @param state - Estado compartilhado do pipeline XPBD com os caches de
     *                posição e rotação pré-solve gerados pelo {@link PredictStage}.
     */
    constructor(private readonly state: XPBDState) {
        super();
    }

    /**
     * Itera todos os RigidBodies dinâmicos e recalcula velocidade linear e angular.
     * Corpos cinemáticos (`isKinematic`) e corpos sem cache no {@link XPBDState} são ignorados.
     *
     * @param context - Contexto do passo de física com corpos e contatos.
     * @param dt      - Passo de tempo do substep (segundos), sempre positivo (garantido pela classe base).
     */
    protected deriveVelocities(context: PhysicsStageContext, dt: number): void {
        for (const { body } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic')) continue;
            if (body.get<boolean>('gpuSimulated')) continue; // pipeline GPU gerencia integração

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
                const [ox, oy, oz, ow] = rotOld;
                const [wx, wy, wz] = QuaternionUtils.deltaOmega(
                    rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0, rot[3] ?? 1,
                    ox!, oy!, oz!, ow!,
                    dt,
                );
                const wxD = wx * angFactor;
                const wyD = wy * angFactor;
                const wzD = wz * angFactor;
                const omega = body.get<vec3>('angularVelocity');
                if (omega) {
                    omega[0] = wxD; omega[1] = wyD; omega[2] = wzD;
                } else {
                    body.set('angularVelocity', new Float32Array([wxD, wyD, wzD]) as unknown as vec3);
                }
            }
        }
    }
}
