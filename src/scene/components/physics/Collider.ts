import type { Physic } from '../../core/Physic';
import { ResourceType } from '../../core/ResourceType';
import type { mat4, vec3 } from 'gl-matrix';

/**
 * AABB no espaço de mundo — usado pelo broadphase.
 */
export interface AABB {
    readonly min: Float32Array; // [x, y, z]
    readonly max: Float32Array; // [x, y, z]
}

/**
 * Base abstrata para todos os volumes de colisão (Template Method — GoF).
 *
 * Expõe primitivas geométricas suficientes para que os NarrowphaseTests
 * operem exclusivamente sobre esta interface — sem importar tipos concretos.
 * O mesmo princípio que PhysicsSolver usa PhysicsBody sem conhecer RigidBody.
 *
 * Não implementa Resource: colliders são descritores de forma CPU-side,
 * sem alocação de buffer GPU própria.
 *
 * Apenas um Collider por Entity (type = 'Collider' → chave única no layer 1).
 *
 * Para criar um collider concreto, implemente esta classe diretamente
 * ou use SDFCollider (factories/physics/) como conveniência para espaços euclidianos.
 */
export abstract class Collider implements Physic {
    /** Chave única no layer 1 — garante um único Collider por Entity. */
    public readonly type = 'Collider';
    public readonly layer = ResourceType.PHYSICS_MECHANIC as const;
    public readonly physicType = 'Collider';

    /** Identificador da forma, usado pelo CollisionDispatcher para selecionar o teste. */
    public abstract readonly colliderShape: string;

    // ------------------------------------------------------------------
    // Primitivas geométricas — implementadas por cada forma concreta.
    // NarrowphaseTests usam apenas estes métodos, sem casts.
    // ------------------------------------------------------------------

    /** AABB conservador no espaço de mundo (para broadphase). */
    public abstract getAABB(worldMatrix: mat4): AABB;

    /** Centro do volume no espaço de mundo. */
    public abstract getWorldCenter(worldMatrix: mat4): vec3;

    /**
     * Raio da esfera circunscrita no espaço de mundo.
     * Esferas: radius * maxScale.
     * Boxes: comprimento da diagonal de halfExtents * maxScale.
     */
    public abstract getBoundingRadius(worldMatrix: mat4): number;

    /**
     * Ponto na superfície (ou interior) da forma mais próximo de um ponto externo.
     * Usado pelo narrowphase sem conhecer a forma concreta.
     * Esferas: ponto na superfície em direção ao queryPoint.
     * Boxes: projeção do queryPoint no AABB orientado.
     */
    public abstract getClosestPoint(worldMatrix: mat4, queryPoint: vec3): vec3;

    /** SDF opcional em espaço local — implementado por SDFCollider e subclasses que suportam testes genéricos. */
    public sdf?(localPoint: vec3): number;

    /** Tensor de inércia diagonal para esta forma, dado uma massa. */
    public abstract computeInertiaTensor(mass: number): [number, number, number];
}
