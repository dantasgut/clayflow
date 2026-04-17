export enum LCPSolverPhase {
    Idle,         // entre frames
    WarmStarting, // aplicando λ do frame anterior
    Iterating,    // loop PGS em execução
    Converged,    // |Δv| < threshold
}
