import type { CollisionAlgorithm } from '../../../scene/systems/collision/CollisionAlgorithm';
import type { Collider } from '../../../scene/components/physics/Collider';
import type { CollisionManifold } from '../../../scene/systems/collision/CollisionManifold';
import type { vec3, mat4 } from 'gl-matrix';

/**
 * AABB vs AABB — sobreposição por eixo separado.
 * Opera apenas via Collider.getAABB() e Collider.getWorldVertices?() — sem imports concretos.
 *
 * Manifold multi-ponto: se A implementa getWorldVertices, usa os vértices de A
 * que penetram a face de B no eixo de contato. Isso produz pontos de contato
 * fora do CM → torque angular não-nulo → corpos tombam corretamente.
 * Fallback: contato único no centro do overlap AABB (sem torque → apenas para
 * colliders sem getWorldVertices).
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
        let axis: 0 | 1 | 2;

        // A→B: normal aponta do primeiro arg (A) para o segundo (B).
        if (depth === overlapX) {
            axis = 0;
            normal[0] = aabbA.min[0]! < aabbB.min[0]! ? 1 : -1;
        } else if (depth === overlapY) {
            axis = 1;
            normal[1] = aabbA.min[1]! < aabbB.min[1]! ? 1 : -1;
        } else {
            axis = 2;
            normal[2] = aabbA.min[2]! < aabbB.min[2]! ? 1 : -1;
        }

        // Multi-ponto: vértices de A que penetram a face de contato de B.
        // Produz contactPoints com offset do CM → (rA × n) ≠ 0 → torque angular correto.
        // Se normal[axis] > 0: A está no lado baixo de B → face de contato = B.min[axis].
        // Se normal[axis] < 0: A está no lado alto de B → face de contato = B.max[axis].
        const verticesA = a.getWorldVertices?.(aWorldMatrix);
        if (verticesA && verticesA.length > 0) {
            const contactPoints: vec3[] = [];
            let maxDepth = 0;

            const contactFace = normal[axis]! > 0 ? aabbB.min[axis]! : aabbB.max[axis]!;
            const axis2 = axis === 0 ? 1 : 0;
            const axis3 = axis === 2 ? 1 : 2;

            for (const v of verticesA) {
                const d = normal[axis]! > 0 ? v[axis]! - contactFace : contactFace - v[axis]!;
                if (d <= 0) continue;
                if (v[axis2]! < aabbB.min[axis2]! || v[axis2]! > aabbB.max[axis2]!) continue;
                if (v[axis3]! < aabbB.min[axis3]! || v[axis3]! > aabbB.max[axis3]!) continue;

                contactPoints.push(new Float32Array(v) as unknown as vec3);
                if (d > maxDepth) maxDepth = d;
            }

            if (contactPoints.length > 0) {
                return {
                    contactPoints,
                    normal: normal as unknown as vec3,
                    depth:  maxDepth,
                };
            }
        }

        // Fallback: contato único no centro do overlap AABB
        const contactPoint = new Float32Array([
            (Math.max(aabbA.min[0]!, aabbB.min[0]!) + Math.min(aabbA.max[0]!, aabbB.max[0]!)) * 0.5,
            (Math.max(aabbA.min[1]!, aabbB.min[1]!) + Math.min(aabbA.max[1]!, aabbB.max[1]!)) * 0.5,
            (Math.max(aabbA.min[2]!, aabbB.min[2]!) + Math.min(aabbA.max[2]!, aabbB.max[2]!)) * 0.5,
        ]);

        return {
            contactPoints: [contactPoint as unknown as vec3],
            normal:        normal as unknown as vec3,
            depth,
        };
    }
}
