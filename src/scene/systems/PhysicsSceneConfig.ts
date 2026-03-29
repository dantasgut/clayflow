/**
 * Configuração de cena física — dados puros, sem comportamento.
 *
 * Substitui os campos de configuração embutidos em `PhysicsWorldOptions`.
 * Injetado no `GpuPhysicsOrchestrator` no momento da construção.
 *
 * GPU-only: campos `backend`, solvers CPU e pipeline CPU são omitidos.
 */
export interface PhysicsSceneConfig {
    /**
     * Aceleração gravitacional (m/s²) aplicada globalmente.
     * Default: [0, -9.81, 0].
     */
    gravity?: readonly [number, number, number];

    /**
     * Número de substeps internos por frame.
     * Cada `PhysicsComputePass` usa este valor para ampliar K (iterações de solve).
     * Default: 4.
     */
    substeps?: number;

    /**
     * Razão máxima entre o maior e o menor componente do tensor de inércia.
     * Limita instabilidade em corpos finos/longos. Default: 10.
     */
    inertiaTensorMaxRatio?: number;

    /**
     * Parâmetros do pipeline XPBD para RigidBody.
     * Presença habilita o `XPBDRigidBodyComputePass`.
     */
    rigidBody?: RigidBodyGpuConfig;

    /**
     * Parâmetros do pipeline XPBD para SoftBody.
     * Presença habilita o `XPBDSoftBodyComputePass`.
     */
    softBody?: SoftBodyGpuConfig;
}

/** Parâmetros GPU do pipeline de corpo rígido. */
export interface RigidBodyGpuConfig {
    /** Número de iterações do solver por substep. Default: 15. */
    iterations?: number;
    /** Margem especulativa (m) para contatos iminentes. 0 = desativado. Default: 0. */
    predictiveThreshold?: number;
    /** Velocidade (m/s) abaixo da qual o coeficiente de restituição é zerado. Default: 2.0. */
    restitutionThreshold?: number;
    /** Velocidade (m/s) para pseudo-sleep. 0 = desativado. Default: 0.01. */
    sleepLinThreshold?: number;
    /** Fator de Baumgarte [0.1–0.3] para o solver LCP. Default: 0.2. */
    baumgarteBeta?: number;
    /** Fator de warm start [0.8–1.0] para o solver LCP. Default: 0.85. */
    warmStartFactor?: number;
    /** Intervalo de frames entre leituras do profiler GPU. Default: 60. */
    profilerLogInterval?: number;
    /** Ativa solver LCP/PGS em vez de XPBD. Default: false. */
    useLcp?: boolean;
}

/** Parâmetros GPU do pipeline de corpo deformável. */
export interface SoftBodyGpuConfig {
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
