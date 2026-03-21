import type { PhysicsStage }                  from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext }            from '../../../scene/systems/PhysicsStageContext';
import type { Broadphase, ColliderEntry }      from '../../../scene/systems/Broadphase';
import type { Transform }                      from '../../../scene/math/Transform';
import type { vec3, quat }                      from 'gl-matrix';

/**
 * Estágio 2: detecta pares de colisores com AABB sobrepostas.
 * Escreve candidatePairs no contexto para o NarrowphaseStage.
 *
 * Antes de delegar ao Broadphase, sincroniza o worldMatrix de cada corpo
 * dinâmico com body.position — garantindo que todos os substeps usem a
 * posição física atual, não a posição visual do frame anterior.
 */
export class BroadphaseStage implements PhysicsStage {
    constructor(private readonly broadphase: Broadphase) {}

    public execute(context: PhysicsStageContext, _dt: number): void {
        for (const { body, entity } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic') || body.get<boolean>('isSleeping')) continue;
            const pos = body.get<vec3>('position');
            const rot = body.get<quat>('rotation');
            const transform = entity.getComponent<Transform>('Transform');
            if (transform && (pos || rot)) {
                if (pos) {
                    transform.position[0] = pos[0] ?? 0;
                    transform.position[1] = pos[1] ?? 0;
                    transform.position[2] = pos[2] ?? 0;
                }
                if (rot) {
                    transform.rotation[0] = rot[0] ?? 0;
                    transform.rotation[1] = rot[1] ?? 0;
                    transform.rotation[2] = rot[2] ?? 0;
                    transform.rotation[3] = rot[3] ?? 1;
                }
                transform.updateWorldMatrix(false, true);
            }
        }

        const entries = Array.from(context.colliders.values()) as ColliderEntry[];
        context.candidatePairs = this.broadphase.findCandidatePairs(entries);
    }
}
