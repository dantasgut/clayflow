import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { Transform }           from '../../../../scene/math/Transform';
import { CollisionDispatcher }      from '../../collision/CollisionDispatcher';
import { NULL_TRANSFORM }           from '../../../../scene/math/NullTransform';

/**
 * Estágio 3 do pipeline de física — Detecção de colisão exata (narrowphase).
 *
 * Recebe os pares candidatos do BroadphaseStage e executa o algoritmo de colisão
 * preciso para cada par via `CollisionDispatcher`, que seleciona o algoritmo
 * correto para cada combinação de formas (Box+Plane, Sphere+Sphere, etc.).
 *
 * **Manifolds multi-ponto:**
 *   Alguns algoritmos (PlaneBoxCollision, SATAlgorithm) retornam N pontos de
 *   contato em vez de um único. Isso é essencial para dissipar rotações corretamente:
 *   com apenas um ponto central, `ω × r = 0` para rotação de yaw → atrito zero nesse
 *   eixo → o corpo gira indefinidamente. Com N cantos, cada um tem velocidade
 *   tangencial não-nula → o atrito dissipa todos os eixos de rotação.
 *
 *   Para cada manifold com N pontos, este estágio gera N `CollisionContact`s com:
 *   - `weight = 1/N` — distribui o impulso total entre os pontos, evitando N×
 *     super-correção da mesma penetração.
 *   - `depth = manifold.depth * weight` — cada contato corrige 1/N da penetração total.
 *
 * **Convenção de normal:**
 *   O dispatcher normaliza a ordem dos argumentos (canônica: shape A ≤ shape B
 *   alfabeticamente) antes de invocar o algoritmo. A normal do manifold é sempre
 *   no sentido canônico(A) → canônico(B). Como `entityIdA/B` seguem a ordem
 *   do broadphase (não necessariamente canônica), `signA` compensa a possível
 *   inversão, garantindo que a normal armazenada aponte de entityB → entityA
 *   (direção de separação de A). Quando `a` é o shape canônico, o manifold já
 *   aponta de B para A após negação (signA=-1). Quando `a` é não-canônico, o
 *   dispatcher trocou os argumentos internamente, então a normal já está invertida
 *   em relação a entityIdA/B e não precisa ser negada (signA=+1).
 *
 * **Evento de colisão:**
 *   Disparado uma única vez por par (no primeiro ponto de contato), independente
 *   de N — o evento é semântico ("estes dois objetos colidiram"), não geométrico.
 */
export class NarrowphaseStage implements PhysicsStage {
    constructor(private readonly dispatcher: CollisionDispatcher) {}

    public execute(context: PhysicsStageContext, _dt: number): void {
        context.contacts = [];

        for (const [a, b] of context.candidatePairs) {
            const wma = this.worldMatrix(a.entity);
            const wmb = this.worldMatrix(b.entity);
            const manifold = this.dispatcher.dispatch(a.collider, wma, b.collider, wmb);
            if (!manifold) continue;

            // O dispatcher reordena canonicamente antes de detect(), mas entityIdA/B
            // seguem a ordem do broadphase (não necessariamente canônica).
            // signA garante que a normal armazenada aponte de entityB → entityA
            // (direção de separação de A), compensando a possível inversão.
            const aIsCanonical = a.collider.colliderShape <= b.collider.colliderShape;
            const signA = aIsCanonical ? -1 : 1;

            const nx = manifold.normal[0]! * signA;
            const ny = manifold.normal[1]! * signA;
            const nz = manifold.normal[2]! * signA;

            const n = manifold.contactPoints.length;
            const weight = 1 / n;
            // Distribui a profundidade de penetração entre os N contatos.
            // A soma das correções de posição (depth/N × N) é igual à profundidade máxima.
            const depthPerContact = manifold.depth * weight;

            // Dispara evento de colisão uma única vez por par
            const cp0 = manifold.contactPoints[0]!;
            a.entity.dispatchEvent({ type: 'collision', other: b.entity, contactPoint: cp0, normal: manifold.normal, impulse: manifold.depth });
            b.entity.dispatchEvent({ type: 'collision', other: a.entity, contactPoint: cp0, normal: manifold.normal, impulse: manifold.depth });

            for (let pi = 0; pi < manifold.contactPoints.length; pi++) {
                const cp  = manifold.contactPoints[pi]!;
                const fid = manifold.contactFeatureIds?.[pi];
                context.contacts.push({
                    entityIdA: a.entity.id,
                    entityIdB: b.entity.id,
                    nx, ny, nz,
                    depth: depthPerContact,
                    cpx: cp[0]!,
                    cpy: cp[1]!,
                    cpz: cp[2]!,
                    weight,
                    ...(fid !== undefined && { featureId: fid }),
                });
            }
        }
    }

    private worldMatrix(entity: import('../../../../scene/core/Entity').Entity) {
        const t = entity.getComponent<Transform>('Transform') ?? NULL_TRANSFORM;
        return t.worldMatrix;
    }
}
