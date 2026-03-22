import type { CollisionAlgorithm } from '../../../scene/systems/collision/CollisionAlgorithm';
import type { Collider } from '../../../scene/components/physics/Collider';
import type { CollisionManifold } from '../../../scene/systems/collision/CollisionManifold';
import { vec3 } from 'gl-matrix';
import type { mat4 } from 'gl-matrix';

/**
 * Sphere vs Sphere — distância entre centros vs soma dos raios.
 */
export class SphereSphereCollision implements CollisionAlgorithm {
    public detect(
        a: Collider, aWorldMatrix: mat4,
        b: Collider, bWorldMatrix: mat4,
    ): CollisionManifold | null {
        const centerA = a.getWorldCenter(aWorldMatrix);
        const centerB = b.getWorldCenter(bWorldMatrix);

        const dist        = vec3.distance(centerA, centerB);
        const totalRadius = a.getBoundingRadius(aWorldMatrix) + b.getBoundingRadius(bWorldMatrix);

        if (dist >= totalRadius) return null;

        const depth  = totalRadius - dist;
        const normal = vec3.sub(vec3.create(), centerB, centerA); // A→B: de centerA para centerB
        if (dist > 1e-6) {
            vec3.scale(normal, normal, 1 / dist);
        } else {
            vec3.set(normal, 0, 1, 0);
        }

        const contactPoint = vec3.scaleAndAdd(vec3.create(), centerA, normal, -a.getBoundingRadius(aWorldMatrix));

        return {
            contactPoints: [new Float32Array(contactPoint) as unknown as import('gl-matrix').vec3],
            normal:        new Float32Array(normal) as unknown as import('gl-matrix').vec3,
            depth,
        };
    }
}
