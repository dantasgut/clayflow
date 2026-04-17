export enum XPBDConstraintState {
    Unsolved,  // início do substep
    Active,    // contribuindo para correção de posição
    Clamped,   // Signorini: λ fixado em 0
    Converged, // |Δλ| < threshold
}
