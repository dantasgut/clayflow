import type { CollisionAlgorithm } from '../../../scene/systems/collision/CollisionAlgorithm';
import type { Collider } from '../../../scene/components/physics/Collider';
import type { CollisionManifold } from '../../../scene/systems/collision/CollisionManifold';
import type { mat4 } from 'gl-matrix';

/**
 * AABB vs AABB — sobreposição por eixo separado.
 * Opera apenas via Collider.getAABB() — sem imports concretos.
 */
export class BoxBoxCollision implements CollisionAlgorithm {
    public detect(
        a: Collider, aWorldMatrix: mat4,
        b: Collider, bWorldMatrix: mat4,
    ): CollisionManifold | null {
        const aabbA = a.getAABB(aWorldMatrix);
        const aabbB = b.getAABB(bWorldMatrix);

        const overlapX = Math.min(aabbA.max[0]!, aabbB.max[0]!) - Math.max(aabbA.min[0]!, aabbB.min[0]!);
        const overlapY = Math.min(aabbA.max[1]!, aabbB.max[1]!) - Math.max(aabbA.min[1]!, aabbB.min[1]!);
        const overlapZ = Math.min(aabbA.max[2]!, aabbB.max[2]!) - Math.max(aabbA.min[2]!, aabbB.min[2]!);

        if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return null;

        const depth = Math.min(overlapX, overlapY, overlapZ);
        const normal = new Float32Array(3);

        // A→B: normal aponta do primeiro arg (A) para o segundo (B).
        if (depth === overlapX) {
            normal[0] = aabbA.min[0]! < aabbB.min[0]! ? 1 : -1;
        } else if (depth === overlapY) {
            normal[1] = aabbA.min[1]! < aabbB.min[1]! ? 1 : -1;
        } else {
            normal[2] = aabbA.min[2]! < aabbB.min[2]! ? 1 : -1;
        }

        const contactPoint = new Float32Array([
            (Math.max(aabbA.min[0]!, aabbB.min[0]!) + Math.min(aabbA.max[0]!, aabbB.max[0]!)) * 0.5,
            (Math.max(aabbA.min[1]!, aabbB.min[1]!) + Math.min(aabbA.max[1]!, aabbB.max[1]!)) * 0.5,
            (Math.max(aabbA.min[2]!, aabbB.min[2]!) + Math.min(aabbA.max[2]!, aabbB.max[2]!)) * 0.5,
        ]);

        return { contactPoint, normal, depth };
    }
}
