import type { PhysicsStage }        from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { Transform }           from '../../../scene/math/Transform';
import { CollisionDispatcher }      from '../collision/CollisionDispatcher';
import { NULL_TRANSFORM }           from '../../../scene/math/NullTransform';

/**
 * Estágio 3: testa pares candidatos, gera contacts e despacha eventos de colisão.
 * Escreve contacts no contexto para o CollisionResolutionStage.
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

            a.entity.dispatchEvent({ type: 'collision', other: b.entity, contactPoint: manifold.contactPoint, normal: manifold.normal, impulse: manifold.depth });
            b.entity.dispatchEvent({ type: 'collision', other: a.entity, contactPoint: manifold.contactPoint, normal: manifold.normal, impulse: manifold.depth });

            // signA garante que a normal armazenada aponte de entityB → entityA.
            // Todos os algoritmos usam convenção A→B (do primeiro arg para o segundo).
            // Quando aIsCanonical=true, dispatch chama detect(a,b) → normal A→B → negar.
            // Quando aIsCanonical=false, dispatch chama detect(b,a) → normal B→A (invertido) → manter.
            const aIsCanonical = a.collider.colliderShape <= b.collider.colliderShape;
            const signA = aIsCanonical ? -1 : 1;

            context.contacts.push({
                entityIdA: a.entity.id,
                entityIdB: b.entity.id,
                nx: manifold.normal[0]! * signA,
                ny: manifold.normal[1]! * signA,
                nz: manifold.normal[2]! * signA,
                depth: manifold.depth,
                cpx: manifold.contactPoint[0]!,
                cpy: manifold.contactPoint[1]!,
                cpz: manifold.contactPoint[2]!,
            });
        }
    }

    private worldMatrix(entity: import('../../../scene/core/Entity').Entity) {
        const t = entity.getComponent<Transform>('Transform') ?? NULL_TRANSFORM;
        return t.worldMatrix;
    }
}
