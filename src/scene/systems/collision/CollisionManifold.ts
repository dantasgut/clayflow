import type { vec3 } from 'gl-matrix';

/**
 * Value Object com os dados de contato de uma colisão (imutável por convenção).
 * Produzido pelo narrowphase e consumido pelo solver de impulso e pelo Observer.
 *
 * contactPoints: lista de pontos de contato em espaço de mundo.
 * Para formas convexas contra plano pode conter até 4 vértices (face-contact),
 * garantindo torque de atrito em todos os eixos de rotação incluindo yaw.
 */
export interface CollisionManifold {
    /** Pontos de contato no espaço de mundo (1 a N). */
    readonly contactPoints: readonly vec3[];
    /** Normal da colisão apontando de B para A (normalizada). */
    readonly normal: vec3;
    /** Profundidade de penetração máxima (positivo = overlap). */
    readonly depth: number;
    /**
     * IDs de feature para cada ponto de contato — índice do vértice, aresta ou face
     * que gerou o contato. Quando presente, habilita Contact Persistence estável:
     * o warm starting usa estes IDs em vez de posições em grade.
     * Opcional — algoritmos sem rastreamento de features omitem este campo.
     */
    readonly contactFeatureIds?: readonly number[];
}
