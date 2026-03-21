import type { Entity }        from '../core/Entity';
import type { PhysicsBody }   from '../components/physics/PhysicsBody';
import type { Collider }      from '../components/physics/Collider';
import type { ColliderEntry } from './Broadphase';

/** Entrada de corpo físico — compartilhada entre estágios do pipeline. */
export interface BodyEntry   { entity: Entity; body: PhysicsBody; }
/** Entrada de colisor — compartilhada entre estágios do pipeline. */
export interface ColliderReg { entity: Entity; collider: Collider; }

/** Resultado do narrowphase para um par de entidades. */
export interface CollisionContact {
    entityIdA: number;
    entityIdB: number;
    /** Normal apontando de B para A (direção de separação de A). */
    nx: number; ny: number; nz: number;
    depth: number;
    /** Ponto de contato no espaço de mundo. */
    cpx: number; cpy: number; cpz: number;
}

/**
 * Contexto compartilhado entre os estágios do pipeline de física.
 * Contém o estado de simulação do frame atual.
 * Estágios leem e escrevem neste contexto em sequência.
 */
export interface PhysicsStageContext {
    readonly bodies:       ReadonlyMap<string, BodyEntry>;
    readonly entityBodies: ReadonlyMap<number, BodyEntry>;
    readonly colliders:    ReadonlyMap<number, ColliderReg>;
    /** Preenchido pelo BroadphaseStage, consumido pelo NarrowphaseStage. */
    candidatePairs: Array<[ColliderEntry, ColliderEntry]>;
    /** Preenchido pelo NarrowphaseStage, consumido pelo CollisionResolutionStage. */
    contacts: CollisionContact[];
}
