import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { vec3 }                from 'gl-matrix';

/**
 * Estágio auxiliar — Correção giroscópica (Euler equations).
 *
 * A integração de Euler simples da velocidade angular ignora o acoplamento
 * entre os eixos de rotação — o chamado "efeito raquete de tênis". Para um
 * corpo girando sobre um eixo não-principal, isso introduz drift de energia
 * que pode desestabilizar a simulação ao longo do tempo.
 *
 * Este estágio aplica explicitamente o torque giroscópico à velocidade angular:
 *
 *   Δω = −I⁻¹ · (ω × (I·ω)) · dt
 *
 * Onde `I·ω = [Ix·ωx, Iy·ωy, Iz·ωz]` (tensor diagonal no frame do corpo)
 * e `ω × (I·ω)` é o torque fictício que a integração simples omite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUANDO É RELEVANTE
 * ─────────────────────────────────────────────────────────────────────────────
 * - Corpos com tensor de inércia assimétrico (Ix ≠ Iy ≠ Iz): bastão, placa.
 * - Rotações rápidas (ω >> 1 rad/s) sobre eixos não-principais.
 * - Para caixas com Ix ≈ Iy ≈ Iz (cubo) ou rotação lenta, o efeito é desprezível.
 *
 * Deve ser posicionado APÓS ForceStage (que aplica torques externos) e ANTES
 * do BroadphaseStage / PBDPredictStage para que a correção entre na predição.
 */
export class GyroscopicStage implements PhysicsStage {
    public execute(context: PhysicsStageContext, dt: number): void {
        if (dt <= 0) return;

        for (const { body } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic') || body.get<boolean>('isSleeping')) continue;

            const omega = body.get<vec3>('angularVelocity');
            const IA    = body.get<vec3>('inertiaTensor');
            if (!omega || !IA) continue;

            const wx = omega[0] ?? 0;
            const wy = omega[1] ?? 0;
            const wz = omega[2] ?? 0;
            const Ix = Math.max(IA[0]!, 1e-6);
            const Iy = Math.max(IA[1]!, 1e-6);
            const Iz = Math.max(IA[2]!, 1e-6);

            // I·ω no frame diagonal (corpo alinhado com eixos de inércia)
            const Iωx = Ix * wx;
            const Iωy = Iy * wy;
            const Iωz = Iz * wz;

            // Torque giroscópico: ω × (I·ω)
            const gyroX = wy * Iωz - wz * Iωy;
            const gyroY = wz * Iωx - wx * Iωz;
            const gyroZ = wx * Iωy - wy * Iωx;

            // Δω = −I⁻¹ · (ω × Iω) · dt
            omega[0] = wx - gyroX / Ix * dt;
            omega[1] = wy - gyroY / Iy * dt;
            omega[2] = wz - gyroZ / Iz * dt;
        }
    }
}
