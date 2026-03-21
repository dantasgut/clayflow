import type { Broadphase, ColliderEntry } from '../../scene/systems/Broadphase';
import type { AABB } from '../../scene/components/physics/Collider';
import type { Transform } from '../../scene/math/Transform';
import { NULL_TRANSFORM } from '../../scene/math/NullTransform';
import { mat4 } from 'gl-matrix';

interface CachedEntry {
    readonly base: ColliderEntry;
    readonly worldMatrix: mat4;
    readonly aabb: AABB;
}

/**
 * Broadphase euclidiano via sobreposição de AABB (O(n²)).
 * Implementação concreta de Broadphase para espaços com métrica euclidiana.
 *
 * Para cenas grandes, substitua por BVHBroadphase ou SpatialHashBroadphase
 * registrando uma nova implementação de Broadphase no PhysicsWorld.
 */
export class AABBBroadphase implements Broadphase {
    public findCandidatePairs(
        entries: readonly ColliderEntry[],
    ): Array<[ColliderEntry, ColliderEntry]> {
        // Snapshot das world matrices + AABBs para este frame
        const cached: CachedEntry[] = entries.map(e => {
            const transform = e.entity.getComponent<Transform>('Transform') ?? NULL_TRANSFORM;
            const wm = mat4.clone(transform.worldMatrix);
            return { base: e, worldMatrix: wm, aabb: e.collider.getAABB(wm) };
        });

        const pairs: Array<[ColliderEntry, ColliderEntry]> = [];

        for (let i = 0; i < cached.length; i++) {
            for (let j = i + 1; j < cached.length; j++) {
                if (this.overlap(cached[i]!.aabb, cached[j]!.aabb)) {
                    pairs.push([cached[i]!.base, cached[j]!.base]);
                }
            }
        }

        return pairs;
    }

    private overlap(a: AABB, b: AABB): boolean {
        return (
            a.max[0]! > b.min[0]! && a.min[0]! < b.max[0]! &&
            a.max[1]! > b.min[1]! && a.min[1]! < b.max[1]! &&
            a.max[2]! > b.min[2]! && a.min[2]! < b.max[2]!
        );
    }
}
