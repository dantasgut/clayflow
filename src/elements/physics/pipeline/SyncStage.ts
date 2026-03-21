import type { PhysicsStage }        from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { Transform }           from '../../../scene/math/Transform';
import type { vec3, quat }          from 'gl-matrix';

/**
 * Estágio 6: sincroniza estado físico → Transform visual.
 *
 * Único ponto de escrita no Transform por frame.
 * Executado uma única vez após todos os substeps — câmera e renderização
 * leem o Transform apenas após esta fase.
 */
export class SyncStage implements PhysicsStage {
    public execute(context: PhysicsStageContext, _dt: number): void {
        for (const { body, entity } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic') || body.get<boolean>('isSleeping')) continue;
            const position  = body.get<vec3>('position');
            const transform = entity.getComponent<Transform>('Transform');
            if (position && transform) {
                transform.position[0] = position[0] ?? 0;
                transform.position[1] = position[1] ?? 0;
                transform.position[2] = position[2] ?? 0;
            }
            const rotation = body.get<quat>('rotation');
            if (rotation && transform) {
                transform.rotation[0] = rotation[0] ?? 0;
                transform.rotation[1] = rotation[1] ?? 0;
                transform.rotation[2] = rotation[2] ?? 0;
                transform.rotation[3] = rotation[3] ?? 1;
            }
            if ((position || rotation) && transform) {
                transform.updateWorldMatrix(false, true);
            }
            if (body.physicType === 'SoftBody') {
                entity.dispatchEvent({ type: 'deformation', body, energy: 0 });
            }
        }
    }
}
