/**
 * Enum dos algoritmos de detecção de colisão narrowphase disponíveis.
 *
 * Usado em NarrowphaseConfig para configurar qual algoritmo o CollisionDispatcher
 * instancia para cada par de formas.
 *
 * AABB é intencionalmente excluído: pertence exclusivamente ao broadphase.
 *
 * | Tipo              | Formas alvo         | Características                             |
 * |-------------------|---------------------|---------------------------------------------|
 * | SAT               | OBB vs OBB          | Exato, 15 eixos, manifold multi-ponto        |
 * | GJK_EPA           | Convexas genéricas  | Iterativo, suporte a formas arbitrárias     |
 * | PLANE_ANALYTIC    | Plano vs qualquer   | Gradiente SDF + clipping; sem iteração      |
 * | SPHERE_ANALYTIC   | Esfera vs Esfera    | Distância entre centros; O(1)               |
 * | SDF_GRADIENT      | Qualquer par c/ SDF | Fallback genérico via gradiente numérico    |
 */
export enum CollisionAlgorithmType {
    SAT             = 'SAT',
    GJK_EPA         = 'GJK_EPA',
    PLANE_ANALYTIC  = 'PLANE_ANALYTIC',
    SPHERE_ANALYTIC = 'SPHERE_ANALYTIC',
    SDF_GRADIENT    = 'SDF_GRADIENT',
}
