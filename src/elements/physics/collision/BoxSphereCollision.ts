import type { CollisionAlgorithm } from '../../../scene/systems/collision/CollisionAlgorithm';
import type { Collider } from '../../../scene/components/physics/Collider';
import type { CollisionManifold } from '../../../scene/systems/collision/CollisionManifold';
import { vec3 } from 'gl-matrix';
import type { mat4 } from 'gl-matrix';

/**
 * Box vs Sphere — ponto mais próximo do box ao centro da esfera.
 * O CollisionDispatcher garante ordem canônica: a = Box, b = Sphere.
 */
export class BoxSphereCollision implements CollisionAlgorithm {
    public detect(
        a: Collider, aWorldMatrix: mat4,
        b: Collider, bWorldMatrix: mat4,
    ): CollisionManifold | null {
        const sphereCenter = b.getWorldCenter(bWorldMatrix);
        const closest      = a.getClosestPoint(aWorldMatrix, sphereCenter);
        const radius       = b.getBoundingRadius(bWorldMatrix);

        const delta = vec3.sub(vec3.create(), sphereCenter, closest);
        const dist  = vec3.length(delta);

        if (dist >= radius) return null;

        const depth  = radius - dist;
        const normal = dist > 1e-6
            ? vec3.scale(vec3.create(), delta, 1 / dist)
            : vec3.fromValues(0, 1, 0);

        return {
            contactPoint: new Float32Array(closest),
            normal:       new Float32Array(normal),
            depth,
        };
    }
}
