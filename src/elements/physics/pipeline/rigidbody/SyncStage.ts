import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { Transform }           from '../../../../scene/math/Transform';
import type { vec3, quat }          from 'gl-matrix';
import { PhysicsBodyState }         from '../../../../scene/core/physics/PhysicsBodyState';

/**
 * Estágio de sincronização — Copia estado físico → Transform visual.
 *
 * Este estágio é executado **uma única vez por frame**, fora do loop de substeps,
 * após todas as iterações físicas terem convergido. É o único ponto que escreve
 * no Transform visual das entidades.
 *
 * **Por que fora do loop de substeps?**
 *   O pipeline de substeps (ForceStage → SleepStage) pode rodar N vezes por frame
 *   (padrão: 8). Se SyncStage rodasse dentro do loop, o Transform seria atualizado
 *   8× por frame sem nenhum ganho visual — a câmera e o renderer só leem o Transform
 *   uma vez por frame, na renderização. Manter SyncStage fora elimina essas 7
 *   escritas redundantes e mantém a separação clara entre estado físico e visual.
 *
 * **Estado físico vs. estado visual:**
 *   Durante os substeps, `body.position` e `body.rotation` avançam a cada
 *   IntegrationStage. O BroadphaseStage resincroniza o worldMatrix internamente
 *   para que os testes de colisão usem posições correntes. O Transform visual
 *   permanece na posição do frame anterior durante todo esse processo — somente
 *   este estágio o atualiza, garantindo consistência para o renderer.
 *
 * Também despacha o evento `deformation` para SoftBodies (extensão futura).
 */
export class SyncStage implements PhysicsStage {
    public execute(context: PhysicsStageContext, _dt: number): void {
        for (const { body, entity } of context.bodies.values()) {
            if (body.bodyState === PhysicsBodyState.Kinematic || body.get<boolean>('isSleeping')) continue;
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
