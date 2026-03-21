import type { Collider } from '../../components/physics/Collider';
import type { CollisionManifold } from './CollisionManifold';
import type { mat4 } from 'gl-matrix';

/**
 * Interface do algoritmo de narrowphase (Strategy — GoF).
 *
 * Recebe apenas tipos base Collider + matrizes de mundo.
 * Nunca importa tipos concretos —
 * opera exclusivamente via primitivas geométricas abstratas do Collider.
 * O CollisionDispatcher garante a ordem canônica (alfabética por colliderShape).
 */
export interface CollisionAlgorithm {
    detect(
        a: Collider, aWorldMatrix: mat4,
        b: Collider, bWorldMatrix: mat4,
    ): CollisionManifold | null;
}
