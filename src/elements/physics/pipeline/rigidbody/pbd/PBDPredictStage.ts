import type { PhysicsStage }        from '../../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../../scene/systems/PhysicsStageContext';
import type { PBDState }            from './PBDState';
import type { vec3, quat }          from 'gl-matrix';
import { QuaternionUtils }          from '../../../math/QuaternionUtils';

/**
 * Estágio 2 do pipeline PBD — Predição de posição e rotação.
 *
 * Inversão fundamental em relação ao pipeline SI: a integração acontece
 * ANTES da detecção de colisões, gerando posições "tentativas" (predicted).
 * O BroadphaseStage e NarrowphaseStage subsequentes usam essas posições.
 *
 * Para TODOS os corpos dinâmicos (incluindo adormecidos):
 *   - Salva pos_old, rot_old, vel_old no PBDState
 *     → Permite ao PBDVelocityUpdateStage recuperar vel = (pos_new - pos_old) / dt
 *       mesmo para corpos que eram dormentes e foram acordados pelo PBDSolveStage.
 *
 * Para corpos acordados:
 *   - Prediz posição: pos += vel * dt  (Euler explícito)
 *   - Prediz rotação: q' = normalize(q + 0.5 · Ω ⊗ q · dt)
 *
 * Nota: linearDamping e angularDamping já foram aplicados pelo ForceStage
 * (via CPURigidBodySolver). O PBDPredictStage apenas integra as velocidades
 * resultantes, sem reaplicar damping.
 */
export class PBDPredictStage implements PhysicsStage {
    constructor(private readonly state: PBDState) {}

    public execute(context: PhysicsStageContext, dt: number): void {
        for (const { body } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic')) continue;

            const pos   = body.get<vec3>('position');
            const rot   = body.get<quat>('rotation');
            const vel   = body.get<vec3>('velocity');
            const omega = body.get<vec3>('angularVelocity');
            const uuid  = body.uuid;

            // ── Salva estado pré-predição (inclusive para dormentes) ─────────
            // Permite recuperar velocidade após o PBD solve, mesmo que o corpo
            // tenha sido acordado pelo PBDSolveStage (sem pos_old, vel = 0).
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
