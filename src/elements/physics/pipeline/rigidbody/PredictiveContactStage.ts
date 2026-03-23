import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { Transform }           from '../../../../scene/math/Transform';
import type { vec3 }                from 'gl-matrix';
import { mat4 }                     from 'gl-matrix';
import { CollisionDispatcher }      from '../../collision/CollisionDispatcher';
import { NULL_TRANSFORM }           from '../../../../scene/math/NullTransform';

/**
 * Estágio pós-narrowphase — Contatos especulativos (anti-tunneling).
 *
 * O narrowphase padrão detecta colisões apenas na posição atual dos corpos.
 * Para corpos com velocidade alta, a penetração pode ultrapassar toda a
 * espessura do objeto em um único substep — o chamado "tunneling".
 *
 * Este estágio complementa o NarrowphaseStage verificando TAMBÉM as posições
 * previstas no próximo substep: `pos_predicted = pos + vel · dt`.
 *
 * Para cada par candidato que NÃO gerou contato no narrowphase mas cujos
 * corpos se aproximam em velocidade suficiente, testa a colisão nas posições
 * previstas e gera contatos especulativos com `depth = 0`. O solver pode então
 * aplicar impulsos preventivos antes da penetração ocorrer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPLEMENTAÇÃO
 * ─────────────────────────────────────────────────────────────────────────────
 * A predição usa apenas translação (pos + vel·dt) — a rotação prevista é
 * ignorada para manter o custo baixo. Isso é suficiente para prevenir
 * tunneling linear; tunneling puramente rotacional é raro em prática.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PARÂMETROS
 * ─────────────────────────────────────────────────────────────────────────────
 * @param speedThreshold — Velocidade relativa mínima (m/s) para ativar a
 *   verificação preditiva. Abaixo deste limiar, o custo não se justifica.
 *   Default: 2.0 m/s.
 */
export class PredictiveContactStage implements PhysicsStage {
    constructor(
        private readonly dispatcher:     CollisionDispatcher,
        private readonly speedThreshold: number = 2.0,
    ) {}

    public execute(context: PhysicsStageContext, dt: number): void {
        if (dt <= 0) return;

        // Índice dos pares já cobertos pelo narrowphase
        const coveredPairs = new Set<string>();
        for (const c of context.contacts) {
            const lo = Math.min(c.entityIdA, c.entityIdB);
            const hi = Math.max(c.entityIdA, c.entityIdB);
            coveredPairs.add(`${lo}:${hi}`);
        }

        for (const [a, b] of context.candidatePairs) {
            const lo  = Math.min(a.entity.id, b.entity.id);
            const hi  = Math.max(a.entity.id, b.entity.id);
            if (coveredPairs.has(`${lo}:${hi}`)) continue;

            const entryA = context.entityBodies.get(a.entity.id);
            const entryB = context.entityBodies.get(b.entity.id);
            if (!entryA && !entryB) continue;

            const velA = entryA?.body.get<vec3>('velocity');
            const velB = entryB?.body.get<vec3>('velocity');

            const rvx = (velA?.[0] ?? 0) - (velB?.[0] ?? 0);
            const rvy = (velA?.[1] ?? 0) - (velB?.[1] ?? 0);
            const rvz = (velA?.[2] ?? 0) - (velB?.[2] ?? 0);
            const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
            if (relSpeed < this.speedThreshold) continue;

            // Matrizes de mundo previstas (translação por vel·dt, rotação mantida)
            const wma = this.predictedMatrix(a.entity, velA, dt);
            const wmb = this.predictedMatrix(b.entity, velB, dt);

            const manifold = this.dispatcher.dispatch(a.collider, wma, b.collider, wmb);
            if (!manifold) continue;

            const aIsCanonical = a.collider.colliderShape <= b.collider.colliderShape;
            const signA = aIsCanonical ? -1 : 1;
            const nx = manifold.normal[0]! * signA;
            const ny = manifold.normal[1]! * signA;
            const nz = manifold.normal[2]! * signA;

            // Verifica se corpos se aproximam na direção normal (evita falso positivo)
            const approachVel = rvx * nx + rvy * ny + rvz * nz;
            if (approachVel >= 0) continue;

            const n      = manifold.contactPoints.length;
            const weight = 1 / n;

            // Dispara evento de colisão iminente
            const cp0 = manifold.contactPoints[0]!;
            a.entity.dispatchEvent({ type: 'collision', other: b.entity, contactPoint: cp0, normal: manifold.normal, impulse: 0 });
            b.entity.dispatchEvent({ type: 'collision', other: a.entity, contactPoint: cp0, normal: manifold.normal, impulse: 0 });

            for (let pi = 0; pi < manifold.contactPoints.length; pi++) {
                const cp  = manifold.contactPoints[pi]!;
                const fid = manifold.contactFeatureIds?.[pi];
                context.contacts.push({
                    entityIdA: a.entity.id,
                    entityIdB: b.entity.id,
                    nx, ny, nz,
                    depth: 0,   // especulativo: contato previsto, ainda sem penetração
                    cpx: cp[0]!, cpy: cp[1]!, cpz: cp[2]!,
                    weight,
                    ...(fid !== undefined && { featureId: fid }),
                });
            }
        }
    }

    private predictedMatrix(
        entity: import('../../../../scene/core/Entity').Entity,
        vel:    vec3 | undefined,
        dt:     number,
    ): mat4 {
        const t   = entity.getComponent<Transform>('Transform') ?? NULL_TRANSFORM;
        const mat = mat4.clone(t.worldMatrix);
        if (vel) {
            mat[12] = (mat[12] ?? 0) + (vel[0] ?? 0) * dt;
            mat[13] = (mat[13] ?? 0) + (vel[1] ?? 0) * dt;
            mat[14] = (mat[14] ?? 0) + (vel[2] ?? 0) * dt;
        }
        return mat;
    }
}
