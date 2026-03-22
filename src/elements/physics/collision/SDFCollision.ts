import type { CollisionAlgorithm } from '../../../scene/systems/collision/CollisionAlgorithm';
import type { Collider } from '../../../scene/components/physics/Collider';
import type { CollisionManifold } from '../../../scene/systems/collision/CollisionManifold';
import { vec3, mat4 } from 'gl-matrix';

/**
 * Algoritmo narrowphase genérico para quaisquer dois Colliders com SDF.
 * Usado como fallback para pares de formas sem algoritmo concreto registrado.
 */
export class SDFCollision implements CollisionAlgorithm {
    public detect(
        a: Collider, aWorldMatrix: mat4,
        b: Collider, bWorldMatrix: mat4,
    ): CollisionManifold | null {
        if (!a.sdf || !b.sdf) return null;

        const centerA = a.getWorldCenter(aWorldMatrix);
        const centerB = b.getWorldCenter(bWorldMatrix);

        const rA = a.getBoundingRadius(aWorldMatrix);
        const rB = b.getBoundingRadius(bWorldMatrix);
        const total = rA + rB;
        const t = total > 1e-6 ? rA / total : 0.5;

        const candidate = vec3.lerp(vec3.create(), centerA, centerB, t);

        const invA = mat4.invert(mat4.create(), aWorldMatrix) ?? mat4.create();
        const invB = mat4.invert(mat4.create(), bWorldMatrix) ?? mat4.create();
        const localA = vec3.transformMat4(vec3.create(), candidate, invA);
        const localB = vec3.transformMat4(vec3.create(), candidate, invB);

        const dA = a.sdf(localA);
        const dB = b.sdf(localB);

        if (dA > 0 && dB > 0) return null;

        const depth = -Math.min(dA, dB);
        if (depth <= 0) return null;

        const normal = vec3.sub(vec3.create(), centerA, centerB);
        const dist   = vec3.length(normal);
        if (dist > 1e-6) vec3.scale(normal, normal, 1 / dist);
        else              vec3.set(normal, 0, 1, 0);

        return {
            contactPoints: [new Float32Array(candidate) as unknown as import('gl-matrix').vec3],
            normal:        new Float32Array(normal) as unknown as import('gl-matrix').vec3,
            depth,
        };
    }
}
