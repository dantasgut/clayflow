import type { CollisionAlgorithm } from '../../../scene/systems/collision/CollisionAlgorithm';
import type { Collider } from '../../../scene/components/physics/Collider';
import type { CollisionManifold } from '../../../scene/systems/collision/CollisionManifold';
import { vec3, mat4 } from 'gl-matrix';

/**
 * Narrowphase exato para Caixa vs Plano.
 * O dispatcher chama sempre detect(Box, Plane) — ordem canônica alfabética (Box < Plane).
 * Retorna normal A→B: do primeiro arg (Box) em direção ao segundo (Plane),
 * ou seja, a negação da normal de saída do plano.
 */
export class PlaneBoxCollision implements CollisionAlgorithm {
    private static readonly GRAD_EPS = 1e-3;

    public detect(
        box:   Collider, boxMat:   mat4,
        plane: Collider, planeMat: mat4,
    ): CollisionManifold | null {
        if (!plane.sdf) return null;

        const e = PlaneBoxCollision.GRAD_EPS;
        const gx = plane.sdf(vec3.fromValues( e, 0, 0)) - plane.sdf(vec3.fromValues(-e, 0, 0));
        const gy = plane.sdf(vec3.fromValues(0,  e, 0)) - plane.sdf(vec3.fromValues(0, -e, 0));
        const gz = plane.sdf(vec3.fromValues(0, 0,  e)) - plane.sdf(vec3.fromValues(0, 0, -e));
        const localN = vec3.normalize(vec3.create(), vec3.fromValues(gx, gy, gz));

        const rotMat = mat4.clone(planeMat);
        rotMat[12] = rotMat[13] = rotMat[14] = 0;
        const worldN = vec3.normalize(vec3.create(), vec3.transformMat4(vec3.create(), localN, rotMat));

        const planeOriginWorld = vec3.transformMat4(vec3.create(), vec3.create(), planeMat);
        const planeOffset = vec3.dot(worldN, planeOriginWorld);

        const aabb      = box.getAABB(boxMat);
        const boxCenter = box.getWorldCenter(boxMat);
        const hx = (aabb.max[0]! - aabb.min[0]!) * 0.5;
        const hy = (aabb.max[1]! - aabb.min[1]!) * 0.5;
        const hz = (aabb.max[2]! - aabb.min[2]!) * 0.5;

        const centerProj = vec3.dot(worldN, boxCenter);
        const extent     = Math.abs(worldN[0]!) * hx + Math.abs(worldN[1]!) * hy + Math.abs(worldN[2]!) * hz;
        const minProj    = centerProj - extent;

        const depth = planeOffset - minProj;
        if (depth <= 0) return null;

        const contactPoint = vec3.scaleAndAdd(vec3.create(), boxCenter, worldN, -extent);

        // A→B: de Box (primeiro arg) em direção ao Plane (segundo arg) = negação da normal do plano.
        return {
            contactPoint: new Float32Array(contactPoint),
            normal:       new Float32Array(vec3.negate(vec3.create(), worldN)),
            depth,
        };
    }
}
