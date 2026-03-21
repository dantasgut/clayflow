import type { vec3 } from 'gl-matrix';

/**
 * Value Object com os dados de contato de uma colisão (imutável por convenção).
 * Produzido pelo narrowphase e consumido pelo solver de impulso e pelo Observer.
 */
export interface CollisionManifold {
    /** Ponto de contato no espaço de mundo. */
    readonly contactPoint: vec3;
    /** Normal da colisão apontando de B para A (normalizada). */
    readonly normal: vec3;
    /** Profundidade de penetração (positivo = overlap). */
    readonly depth: number;
}
