import type { CollisionAlgorithmType } from './CollisionAlgorithmType';

/**
 * Configuração do sistema de narrowphase.
 *
 * Permite customizar qual algoritmo é usado para cada par de formas,
 * sem precisar instanciar e registrar manualmente as classes de algoritmo.
 *
 * @example
 * const world = new PhysicsWorld({
 *   narrowphase: {
 *     boxBox:    CollisionAlgorithmType.SAT,
 *     boxSphere: CollisionAlgorithmType.SAT,
 *     overrides: {
 *       'Capsule:Capsule': CollisionAlgorithmType.SDF_GRADIENT,
 *     },
 *   },
 * });
 */
export interface NarrowphaseConfig {
    /** Algoritmo para Box vs Box. Default: SAT. */
    boxBox?: CollisionAlgorithmType;
    /** Algoritmo para Sphere vs Sphere. Default: SPHERE_ANALYTIC. */
    sphereSphere?: CollisionAlgorithmType;
    /** Algoritmo para Box vs Sphere. Default: SAT. */
    boxSphere?: CollisionAlgorithmType;
    /**
     * Overrides livres por par de formas.
     * Chave: 'ShapeA:ShapeB' em ordem alfabética (ex: 'Box:Capsule').
     * Sobrescreve os campos acima e os defaults do dispatcher.
     */
    overrides?: Record<string, CollisionAlgorithmType>;
}
