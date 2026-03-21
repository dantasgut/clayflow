import type { CollisionAlgorithm } from '../../../scene/systems/collision/CollisionAlgorithm';
import type { Collider } from '../../../scene/components/physics/Collider';
import type { CollisionManifold } from '../../../scene/systems/collision/CollisionManifold';
import { vec3, mat4 } from 'gl-matrix';

/**
 * Narrowphase exato para Plano vs Esfera.
 * Argumento `a` = Plane, argumento `b` = Sphere.
 */
export class PlaneSphereCollision implements CollisionAlgorithm {
    private static readonly GRAD_EPS = 1e-3;

    public detect(
        plane:  Collider, planeMat:  mat4,
        sphere: Collider, sphereMat: mat4,
    ): CollisionManifold | null {
        if (!plane.sdf) return null;

        const radius      = sphere.getBoundingRadius(sphereMat);
        const centerWorld = sphere.getWorldCenter(sphereMat);

        const invPlane    = mat4.invert(mat4.create(), planeMat) ?? mat4.create();
        const localCenter = vec3.transformMat4(vec3.create(), centerWorld, invPlane);
        const dist = plane.sdf(localCenter);

        const depth = radius - dist;
        if (depth <= 0) return null;

        const e = PlaneSphereCollision.GRAD_EPS;
        const gx = plane.sdf(vec3.fromValues( e, 0, 0)) - plane.sdf(vec3.fromValues(-e, 0, 0));
        const gy = plane.sdf(vec3.fromValues(0,  e, 0)) - plane.sdf(vec3.fromValues(0, -e, 0));
        const gz = plane.sdf(vec3.fromValues(0, 0,  e)) - plane.sdf(vec3.fromValues(0, 0, -e));
        const localN  = vec3.normalize(vec3.create(), vec3.fromValues(gx, gy, gz));
        const rotMat  = mat4.clone(planeMat);
        rotMat[12] = rotMat[13] = rotMat[14] = 0;
        const worldN  = vec3.normalize(vec3.create(), vec3.transformMat4(vec3.create(), localN, rotMat));

        const contactPoint = vec3.scaleAndAdd(vec3.create(), centerWorld, worldN, -radius);

        return {
            contactPoint: new Float32Array(contactPoint),
            normal:       new Float32Array(worldN),
            depth,
        };
    }
}
