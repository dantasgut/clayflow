import type { vec3, quat } from 'gl-matrix';

/**
 * Estado de simulação de um RigidBody — muda a cada frame (integrado pelo GPU).
 * Inicializado em registerEntity a partir do Transform e do collider.
 * Atualizado pelo GPU readback após cada frame simulado.
 *
 * Substituiu as chaves de property bag:
 *   'position', 'velocity', 'angularVelocity', 'rotation', 'inertiaTensor'
 */
export interface RigidBodySimState {
    position:        vec3;
    velocity:        vec3;
    angularVelocity: vec3;
    rotation:        quat;
    inertiaTensor:   vec3;
}
