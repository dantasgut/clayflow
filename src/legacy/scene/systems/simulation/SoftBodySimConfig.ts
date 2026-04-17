/**
 * Config mínima de resolução para o pipeline SoftBody.
 * Campo reservado para futuros algoritmos (spring-mass, FEM, MPM).
 */
export interface SoftBodyResolutionConfig {
    /** Algoritmo de resolução. Apenas 'XPBD' é suportado atualmente. */
    type?: 'XPBD';
}

/**
 * Configuração da simulação de corpos deformáveis (XPBD SoftBody GPU).
 *
 * Todos os campos são opcionais — `softBody: {}` usa os defaults.
 * Forças globais (gravidade, vento) são registradas via `world.addForce()`.
 *
 * @example
 * const world = new PhysicsWorld();
 * world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));
 */
export interface SoftBodySimConfig {
    /**
     * Seleção explícita de algoritmo de resolução.
     * Default: XPBD (único suportado atualmente).
     */
    resolution?: SoftBodyResolutionConfig;
    /**
     * Número de iterações do solver XPBD por substep.
     * Valores maiores convergem melhor em malhas densas, com custo proporcional.
     * Default: 15.
     */
    iterations?: number;
    /**
     * Coeficiente de restituição na colisão partícula-colissor (0–1).
     * Default: 0.05.
     */
    restitution?: number;
    /**
     * Ativa Shape Matching.
     * Cada partícula é puxada em direção à posição-meta R·r_i + cm,
     * onde R é extraída da decomposição polar do gradiente de deformação.
     * Default: false.
     */
    useShapeMatching?: boolean;
    /**
     * Coeficiente de rigidez do Shape Matching [0..1].
     * 0 = sem restauração, 1 = corpo rígido aproximado.
     * Só tem efeito se useShapeMatching=true. Default: 0.5.
     */
    shapeStiffness?: number;
    /**
     * Ativa o solver Jacobi XPBD em vez do graph coloring.
     *
     * Jacobi: todas as constraints resolvem em paralelo via acúmulo em atomic<i32>.
     * Prós: máximo paralelismo, sem graph-coloring.
     * Contras: pode precisar de ~10–20% mais iterações; sem warm-starting de λ.
     * Default: false.
     */
    useJacobiSolve?: boolean;
    /**
     * Intervalo de frames entre leituras do profiler GPU.
     * Default: 60 (≈1 log/s a 60fps).
     */
    profilerLogInterval?: number;
}
