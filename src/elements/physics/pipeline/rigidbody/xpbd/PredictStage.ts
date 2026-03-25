import type { PhysicsStage }        from '../../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../../scene/systems/PhysicsStageContext';
import type { XPBDState }           from './XPBDState';
import type { vec3, quat }          from 'gl-matrix';
import { QuaternionUtils }          from '../../../math/QuaternionUtils';
import { BasePredictStage }         from '../../shared/BasePredictStage';

/**
 * Estágio 2 do pipeline XPBD — Predição de posição e rotação dos RigidBodies.
 *
 * Especialização de {@link BasePredictStage} para corpos rígidos.
 * A inversão fundamental do XPBD: a integração ocorre ANTES da detecção de colisões,
 * gerando posições "tentativas" que o BroadphaseStage e NarrowphaseStage usam.
 * O {@link SolveStage} posterior corrige essas posições para satisfazer as constraints.
 *
 * Para TODOS os corpos dinâmicos (incluindo adormecidos):
 *   - Salva `pos_old`, `rot_old`, `vel_old` no {@link XPBDState}
 *     → Permite ao {@link VelocityRecoveryStage} recuperar `vel = (pos_new − pos_old) / dt`
 *       mesmo para corpos que estavam dormentes e foram acordados pelo {@link SolveStage}.
 *
 * Para corpos acordados (não `isSleeping`):
 *   - Prediz posição via Euler explícito: `pos += vel × dt`
 *   - Prediz rotação via derivada de quaternion: `q' = normalize(q + 0.5 · Ω ⊗ q · dt)`
 *
 * Nota: `linearDamping` e `angularDamping` já foram aplicados pelo {@link ForceStage}
 * via `CPURigidBodySolver`. Este estágio apenas integra as velocidades resultantes,
 * sem reaplicar amortecimento.
 */
export class PredictStage extends BasePredictStage implements PhysicsStage {
    /**
     * @param state - Estado compartilhado do pipeline XPBD onde pos/rot/vel pré-predição
     *                serão armazenados para uso posterior pelo {@link VelocityRecoveryStage}.
     */
    constructor(private readonly state: XPBDState) {
        super();
    }

    /**
     * Itera todos os RigidBodies dinâmicos, salva estado no cache e aplica a predição.
     * Corpos cinemáticos (`isKinematic`) são ignorados.
     *
     * @param context - Contexto do passo de física com corpos e contatos.
     * @param dt      - Passo de tempo do substep (segundos).
     */
    protected predictBodies(context: PhysicsStageContext, dt: number): void {
        for (const { body } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic')) continue;
            if (body.get<boolean>('gpuSimulated')) continue; // pipeline GPU gerencia integração

            const pos   = body.get<vec3>('position');
            const rot   = body.get<quat>('rotation');
            const vel   = body.get<vec3>('velocity');
            const omega = body.get<vec3>('angularVelocity');
            const uuid  = body.uuid;

            // ── Salva estado pré-predição (inclusive para dormentes) ─────────
            // Permite recuperar velocidade após o XPBD solve, mesmo que o corpo
            // tenha sido acordado pelo SolveStage (sem pos_old, vel = 0).
            if (pos) this.state.posCache.set(uuid, [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0]);
            if (rot) this.state.rotCache.set(uuid, [rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0, rot[3] ?? 1]);
            if (vel) this.state.velCache.set(uuid, [vel[0] ?? 0, vel[1] ?? 0, vel[2] ?? 0]);

            // Corpos adormecidos não são preditos (posição não muda antes do solve)
            if (body.get<boolean>('isSleeping')) continue;

            // ── Prediz posição (Euler) ────────────────────────────────────────
            if (pos && vel) {
                pos[0] = (pos[0] ?? 0) + (vel[0] ?? 0) * dt;
                pos[1] = (pos[1] ?? 0) + (vel[1] ?? 0) * dt;
                pos[2] = (pos[2] ?? 0) + (vel[2] ?? 0) * dt;
            }

            // ── Prediz rotação: q' = normalize(q + 0.5 · Ω ⊗ q · dt) ────────
            // Mesma fórmula do IntegrationStage — Ω = [ωx, ωy, ωz, 0]
            if (rot && omega) {
                QuaternionUtils.integrateOmega(
                    rot,
                    (omega[0] ?? 0) * 0.5 * dt,
                    (omega[1] ?? 0) * 0.5 * dt,
                    (omega[2] ?? 0) * 0.5 * dt,
                );
            }
        }
    }
}
