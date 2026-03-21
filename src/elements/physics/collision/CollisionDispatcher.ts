import type { Collider } from '../../../scene/components/physics/Collider';
import type { CollisionAlgorithm } from '../../../scene/systems/collision/CollisionAlgorithm';
import type { CollisionManifold } from '../../../scene/systems/collision/CollisionManifold';
import type { mat4 } from 'gl-matrix';
import { BoxBoxCollision }       from './BoxBoxCollision';
import { SphereSphereCollision } from './SphereSphereCollision';
import { BoxSphereCollision }    from './BoxSphereCollision';
import { PlaneBoxCollision }     from './PlaneBoxCollision';
import { PlaneSphereCollision }  from './PlaneSphereCollision';
import { SDFCollision }          from './SDFCollision';

/**
 * Dispatcher de algoritmos de colisão narrowphase (Strategy — GoF).
 *
 * Mapeia pares de formas → CollisionAlgorithm e garante ordem canônica
 * (alfabética por colliderShape) antes de invocar o algoritmo.
 *
 * Fallback: se o par não tiver algoritmo registrado mas ambos os colliders
 * implementarem sdf(), usa SDFCollision genérico.
 *
 * @example
 * world.dispatcher.register('Torus', 'Sphere', new TorusSphereCollision());
 */
export class CollisionDispatcher {
    private readonly algorithms: Map<string, CollisionAlgorithm> = new Map();
    private readonly sdfFallback = new SDFCollision();

    constructor() {
        this.register('Box',    'Box',    new BoxBoxCollision());
        this.register('Sphere', 'Sphere', new SphereSphereCollision());
        this.register('Box',    'Sphere', new BoxSphereCollision());
        this.register('Plane',  'Box',    new PlaneBoxCollision());
        this.register('Plane',  'Sphere', new PlaneSphereCollision());
    }

    public register(shapeA: string, shapeB: string, algorithm: CollisionAlgorithm): void {
        this.algorithms.set(this.key(shapeA, shapeB), algorithm);
    }

    public dispatch(
        a: Collider, aWorldMatrix: mat4,
        b: Collider, bWorldMatrix: mat4,
    ): CollisionManifold | null {
        const algorithm = this.algorithms.get(this.key(a.colliderShape, b.colliderShape))
            ?? (a.sdf && b.sdf ? this.sdfFallback : null);

        if (!algorithm) return null;

        return a.colliderShape <= b.colliderShape
            ? algorithm.detect(a, aWorldMatrix, b, bWorldMatrix)
            : algorithm.detect(b, bWorldMatrix, a, aWorldMatrix);
    }

    private key(shapeA: string, shapeB: string): string {
        return shapeA <= shapeB ? `${shapeA}:${shapeB}` : `${shapeB}:${shapeA}`;
    }
}
