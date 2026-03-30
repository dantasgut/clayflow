/**
 * Configuração de cena física — dados puros, sem comportamento.
 *
 * Substitui os campos de configuração embutidos em `PhysicsWorldOptions`.
 * Injetado no `GpuPhysicsOrchestrator` no momento da construção.
 *
 * GPU-only: campos `backend`, solvers CPU e pipeline CPU são omitidos.
 *
 * ## Substeps por algoritmo
 *
 * `substeps` em `PhysicsSceneConfig` é o valor global de fallback.
 * Cada algoritmo pode sobrescrever com seu próprio `substeps`, permitindo
 * tuning independente:
 *
 *   RigidBody LCP:  2–4   (velocity-space; detecta contatos mais vezes por frame)
 *   SoftBody XPBD:  4–8   (position-space; mais substeps = constraints mais rígidas)
 *   FEM:            4–16  (adaptativo por rigidez e tamanho de elemento)
 *   MPM:            20–160 (CFL de onda em materiais elásticos rígidos)
 *
 * A closure `getSubsteps` de cada pass é reativa: lê do config vivo a cada frame,
 * então mutar `config.rigidBody.substeps` em runtime tem efeito imediato.
 */
export interface PhysicsSceneConfig {
    /**
     * Aceleração gravitacional (m/s²) aplicada globalmente.
     * Default: [0, -9.81, 0].
     */
    gravity?: readonly [number, number, number];

    /**
     * Substeps globais de fallback — usado por qualquer algoritmo que não
     * defina seu próprio `substeps`. Default: 4.
     */
    substeps?: number;

    /**
     * Razão máxima entre o maior e o menor componente do tensor de inércia.
     * Limita instabilidade em corpos finos/longos. Default: 10.
     */
    inertiaTensorMaxRatio?: number;

    /** Parâmetros do pipeline LCP/PGS para RigidBody. */
    rigidBody?: RigidBodyGpuConfig;

    /** Parâmetros do pipeline XPBD para SoftBody/cloth. */
    softBody?: SoftBodyGpuConfig;

    /**
     * Parâmetros do pipeline FEM (Finite Element Method).
     * Presença habilita o `FEMComputePass` quando implementado (Fase 3).
     */
    fem?: FemGpuConfig;

    /**
     * Parâmetros do pipeline MPM (Material Point Method).
     * Presença habilita o `MPMComputePass` quando implementado (Fase 5).
     */
    mpm?: MpmGpuConfig;
}

/** Parâmetros GPU do pipeline de corpo rígido (LCP/PGS). */
export interface RigidBodyGpuConfig {
    /**
     * Substeps por frame para o pipeline de corpo rígido.
     * Sobrescreve `PhysicsSceneConfig.substeps` para este algoritmo.
     * Default: 2 (velocity-space; 2 detecções por frame a 60fps).
     */
    substeps?: number;
    /** Número de iterações PGS por substep. Default: 25. */
    iterations?: number;
    /** Margem especulativa (m) para contatos iminentes. 0 = desativado. Default: 0.05. */
    predictiveThreshold?: number;
    /** Velocidade (m/s) abaixo da qual o coeficiente de restituição é zerado. Default: 2.0. */
    restitutionThreshold?: number;
    /** Velocidade (m/s) para pseudo-sleep. 0 = desativado. Default: 0.01. */
    sleepLinThreshold?: number;
    /** Fator de Baumgarte [0.1–0.4] para correção de penetração. Default: 0.3. */
    baumgarteBeta?: number;
    /** Fator de warm start [0.8–1.0] para o solver LCP. Default: 0.85. */
    warmStartFactor?: number;
    /** Intervalo de frames entre leituras do profiler GPU. Default: 60. */
    profilerLogInterval?: number;
    /** Ativa solver LCP/PGS em vez de XPBD. Default: false. */
    useLcp?: boolean;
}

/** Parâmetros GPU do pipeline de corpo deformável (XPBD). */
export interface SoftBodyGpuConfig {
    /**
     * Substeps por frame para o pipeline de soft body.
     * Sobrescreve `PhysicsSceneConfig.substeps` para este algoritmo.
     * Default: 4 (position-space; mais substeps = constraints mais rígidas).
     */
    substeps?: number;
    /** Número de iterações do solver XPBD por substep. Default: 15. */
    iterations?: number;
    /** Coeficiente de restituição na colisão partícula-colissor [0–1]. Default: 0.05. */
    restitution?: number;
    /** Ativa Shape Matching. Default: false. */
    useShapeMatching?: boolean;
    /** Rigidez do Shape Matching [0–1]. Default: 0.5. */
    shapeStiffness?: number;
    /** Ativa solver Jacobi XPBD em vez de graph coloring. Default: false. */
    useJacobiSolve?: boolean;
    /** Intervalo de frames entre leituras do profiler GPU. Default: 60. */
    profilerLogInterval?: number;
}

/**
 * Parâmetros GPU do pipeline FEM (Finite Element Method).
 * Stub para Fase 3 — campos serão expandidos na implementação.
 */
export interface FemGpuConfig {
    /**
     * Substeps por frame para o pipeline FEM.
     * Sobrescreve `PhysicsSceneConfig.substeps` para este algoritmo.
     * Default: 6 (adaptativo por rigidez e tamanho de elemento).
     */
    substeps?: number;
    /** Número de iterações do solver por substep. Default: 20. */
    iterations?: number;
    /** Intervalo de frames entre leituras do profiler GPU. Default: 60. */
    profilerLogInterval?: number;
}

/**
 * Parâmetros GPU do pipeline MPM (Material Point Method).
 * Stub para Fase 5 — campos serão expandidos na implementação.
 */
export interface MpmGpuConfig {
    /**
     * Substeps por frame para o pipeline MPM.
     * Sobrescreve `PhysicsSceneConfig.substeps` para este algoritmo.
     * Default: 20 (CFL de onda; materiais rígidos podem exigir 160+).
     */
    substeps?: number;
    /** Tamanho da célula do grid (m). Default: 12/32 ≈ 0.375. */
    gridCellSize?: number;
    /** Dimensões da grade [x, y, z]. Default: [32, 32, 32]. */
    gridDims?: [number, number, number];
    /** Canto mínimo da grade em world space [x, y, z]. Default: [-6, -1, -6]. */
    gridOrigin?: [number, number, number];
    /** Intervalo de frames entre leituras do profiler GPU. Default: 60. */
    profilerLogInterval?: number;
}
