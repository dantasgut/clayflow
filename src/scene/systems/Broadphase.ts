import type { Entity } from '../core/Entity';
import type { Collider } from '../components/physics/Collider';

/**
 * Entrada de um collider no pipeline de simulação.
 * Agnóstica ao espaço — não carrega AABB, vec3 ou qualquer primitiva euclidiana.
 */
export interface ColliderEntry {
    readonly entity: Entity;
    readonly collider: Collider;
}

/**
 * Interface do algoritmo de broadphase (Strategy — GoF).
 *
 * Responsabilidade: identificar pares de colliders que são CANDIDATOS
 * a colisão, com o menor custo possível (falsos positivos são aceitáveis;
 * falsos negativos não são).
 *
 * Implementações possíveis:
 *  - AABBBroadphase   → O(n²) pairs, espaço euclidiano (factories/physics/)
 *  - BVHBroadphase    → O(n log n), hierarquia de volumes
 *  - SpatialHash      → O(1) lookup, grade uniforme
 *  - CustomBroadphase → qualquer métrica de proximidade abstrata
 *
 * @example
 * class ManhattanBroadphase implements Broadphase {
 *     findCandidatePairs(entries) { ... } // usa distância de Manhattan
 * }
 */
export interface Broadphase {
    /**
     * Retorna todos os pares de entradas que podem estar em colisão.
     * Chamado uma vez por step, antes do narrowphase.
     */
    findCandidatePairs(entries: readonly ColliderEntry[]): Array<[ColliderEntry, ColliderEntry]>;
}
