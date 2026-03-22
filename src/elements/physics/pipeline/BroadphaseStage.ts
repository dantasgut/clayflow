import type { PhysicsStage }                  from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext }            from '../../../scene/systems/PhysicsStageContext';
import type { Broadphase, ColliderEntry }      from '../../../scene/systems/Broadphase';
import type { Transform }                      from '../../../scene/math/Transform';
import type { vec3, quat }                      from 'gl-matrix';

/**
 * Estágio 2 do pipeline de física — Detecção de pares candidatos (broadphase).
 *
 * Responsabilidade: produzir uma lista de pares de colisores que *podem* estar
 * em contato, para que o NarrowphaseStage realize o teste exato apenas nesses pares.
 *
 * Duas fases internas:
 *
 * **Sincronização de worldMatrix (pré-broadphase):**
 *   Antes de testar AABBs, atualiza o Transform de cada corpo dinâmico acordado
 *   com a posição e rotação físicas correntes (`body.position`, `body.rotation`).
 *   Isso é necessário porque o IntegrationStage modificou body.position no substep
 *   anterior, mas o Transform visual ainda não foi atualizado (SyncStage roda só
 *   uma vez por frame). Sem essa etapa, os colisores usariam posições defasadas.
 *   Corpos cinemáticos e adormecidos são ignorados — suas worldMatrices não mudam
 *   durante os substeps.
 *
 * **Broadphase (detecção de pares):**
 *   Delega ao Broadphase concreto (padrão: AABBBroadphase) que testa sobreposição
 *   de AABBs para todos os pares de colisores. A saída é `context.candidatePairs`,
 *   consumida pelo NarrowphaseStage.
 *
 * A separação broadphase / narrowphase é clássica em motores de física: o teste
 * AABB é O(n²) mas extremamente barato; o narrowphase exato (GJK, SAT, SDF) só
 * roda para os pares que passaram no filtro grosseiro.
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
