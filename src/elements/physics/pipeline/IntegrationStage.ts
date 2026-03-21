import type { PhysicsStage }        from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { vec3, quat } from 'gl-matrix';

/**
 * Estágio 5: integra posição física — body.position += velocity * dt.
 * Também integra rotação física — q' = normalize(q + 0.5 * Ω ⊗ q * dt).
 * Não toca no Transform — isso é responsabilidade do SyncStage.
 */
export class IntegrationStage implements PhysicsStage {
    public execute(context: PhysicsStageContext, dt: number): void {
        for (const { body } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic')) continue;
            const velocity = body.get<vec3>('velocity');
            const position = body.get<vec3>('position');
            if (velocity && position) {
                position[0] = (position[0] ?? 0) + (velocity[0] ?? 0) * dt;
                position[1] = (position[1] ?? 0) + (velocity[1] ?? 0) * dt;
                position[2] = (position[2] ?? 0) + (velocity[2] ?? 0) * dt;
            }

            // Rotation integration: q' = normalize(q + 0.5 * Ω ⊗ q * dt)
            // Ω = [ωx, ωy, ωz, 0] (pure quaternion), using gl-matrix xyzw format
            const omega    = body.get<quat>('angularVelocity'); // treated as vec3
            const rotation = body.get<quat>('rotation');
            if (omega && rotation) {
                const wx = (omega[0] ?? 0) * 0.5 * dt;
                const wy = (omega[1] ?? 0) * 0.5 * dt;
                const wz = (omega[2] ?? 0) * 0.5 * dt;
                const qx = rotation[0] ?? 0;
                const qy = rotation[1] ?? 0;
                const qz = rotation[2] ?? 0;
                const qw = rotation[3] ?? 1;
                // Ω ⊗ q (quaternion product, Ω pure quaternion with real=0)
                rotation[0] = qx + (wx * qw + wy * qz - wz * qy);
                rotation[1] = qy + (wy * qw + wz * qx - wx * qz);
                rotation[2] = qz + (wz * qw + wx * qy - wy * qx);
                rotation[3] = qw + (-wx * qx - wy * qy - wz * qz);
                // Normalize quaternion
                const len = Math.sqrt(
                    (rotation[0] ?? 0) ** 2 + (rotation[1] ?? 0) ** 2 +
                    (rotation[2] ?? 0) ** 2 + (rotation[3] ?? 0) ** 2,
                );
                if (len > 1e-6) {
                    rotation[0] = (rotation[0] ?? 0) / len;
                    rotation[1] = (rotation[1] ?? 0) / len;
                    rotation[2] = (rotation[2] ?? 0) / len;
                    rotation[3] = (rotation[3] ?? 0) / len;
                }
            }
        }
    }
}
