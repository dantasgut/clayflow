import type { ResolutionType } from '../resolution/ResolutionType';

/**
 * Config mínima de resolução para o pipeline SoftBody.
 *
 * Mantida separada de `ResolutionConfig` (que é exclusiva do pipeline RigidBody)
 * para deixar explícita a independência entre os dois pipelines.
 * O único tipo suportado atualmente é `XPBD` — o campo existe para documentação
 * e para tornar a seleção de pipeline simétrica em relação ao RigidBody.
 */
export interface SoftBodyResolutionConfig {
    /**
     * Tipo de pipeline para corpos deformáveis.
     * Atualmente apenas `ResolutionType.XPBD` é implementado (e é o default).
     * Campo reservado para futuros backends (GPU spring-mass, FEM, MPM).
     */
    type?: ResolutionType.XPBD;
}

/**
 * Configuração da simulação de corpos deformáveis (XPBD SoftBody).
 *
 * Presença deste objeto em `PhysicsWorldOptions.softBody` habilita o
 * pipeline XPBD SoftBody no mundo. Todos os campos são opcionais —
 * `softBody: {}` usa os defaults e já ativa o pipeline.
 *
 * Forças globais (gravidade, vento) são registradas via `world.addForce()`
 * e aplicadas pelo XPBDSoftBodySolver — mesmo padrão do RigidBody.
 * Parâmetros por corpo (compliance, damping) são configurados em SoftBodyOptions.
 *
 * @example
 * // Pipeline explícito para cada tipo de corpo:
 * const world = new PhysicsWorld({
 *   rigidBody: { resolution: { type: ResolutionType.SEQUENTIAL_IMPULSE } },
 *   softBody:  { resolution: { type: ResolutionType.XPBD }, iterations: 15 },
 * });
 */
export interface SoftBodySimConfig {
    /**
     * Seleção explícita de pipeline para corpos deformáveis.
     * Permite declarar o tipo de resolução SoftBody independentemente do RigidBody.
     * Default implícito: `ResolutionType.XPBD`.
     */
    resolution?: SoftBodyResolutionConfig;
    /**
     * Número de iterações do solver XPBD por substep (backend='gpu').
     * Valores maiores convergem melhor em malhas densas, com custo proporcional.
     * Default: 15. (Otimização 3c — compensa substeps=4 vs. substeps=8 anteriores)
     */
    iterations?: number;
    /**
     * Coeficiente de restituição na colisão partícula-colissor (0–1).
     * Default: 0.05.
     */
    restitution?: number;
    /**
     * Backend de simulação SoftBody.
     * 'cpu' — pipeline XPBD em JavaScript (padrão, estável).
     * 'gpu' — pipeline XPBD em compute shaders WGSL (Fase 2).
     * Default: 'cpu'.
     */
    backend?: 'cpu' | 'gpu';
    /**
     * Ativa Shape Matching (apenas para backend='gpu').
     * Adiciona um estágio de restauração de forma por substep:
     * cada partícula é puxada em direção à posição-meta R·r_i + cm,
     * onde R é extraída da decomposição polar do gradiente de deformação.
     * Default: false.
     */
    useShapeMatching?: boolean;
    /**
     * Coeficiente de rigidez do Shape Matching [0..1].
     * 0 = sem restauração, 1 = corpo rígido aproximado.
     * Só tem efeito se useShapeMatching=true.
     * Default: 0.5.
     */
    shapeStiffness?: number;
    /**
     * Ativa o solver Jacobi XPBD em vez do graph coloring (apenas backend='gpu').
     *
     * Jacobi: todas as constraints resolvem em paralelo por iteração via acúmulo
     * de correções em atomic<i32>. Requer 2 compute passes por iteração (solve + apply),
     * mas elimina a necessidade de graph coloring e reordenação de constraints.
     *
     * Trade-off:
     *   - Prós: máximo paralelismo, sem CPU graph-coloring, ~50% menos dispatches
     *     que graph coloring com 4 cores.
     *   - Contras: pode precisar de ~10–20% mais iterações para convergência igual;
     *     não é compatível com warm-starting de λ nesta versão.
     *
     * Default: false (usa graph coloring quando disponível).
     */
    useJacobiSolve?: boolean;
    /**
     * Intervalo de frames entre leituras do profiler GPU (backend='gpu').
     * Valores menores aumentam a frequência dos logs de tempo de kernel.
     * Default: 60 (≈1 log/s a 60fps).
     */
    profilerLogInterval?: number;
}
