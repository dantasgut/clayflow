import type { Entity }      from '../core/Entity';
import type { PhysicsBody } from '../components/physics/PhysicsBody';
import type { Collider }    from '../components/physics/Collider';

/** Entrada de corpo físico no contexto GPU. */
export interface BodyEntry   { entity: Entity; body: PhysicsBody; }

/** Entrada de colisor no contexto GPU. */
export interface ColliderReg { entity: Entity; collider: Collider; }

/**
 * Contexto de simulação GPU-only.
 *
 * Substitui `PhysicsStageContext` — remove `candidatePairs` e `contacts`
 * (broadphase/narrowphase CPU eliminados). O narrowphase é inteiramente
 * gerenciado pelos compute shaders.
 */
export interface GpuSimContext {
    readonly bodies:       ReadonlyMap<string, BodyEntry>;
    readonly entityBodies: ReadonlyMap<number, BodyEntry>;
    readonly colliders:    ReadonlyMap<number, ColliderReg>;
}
