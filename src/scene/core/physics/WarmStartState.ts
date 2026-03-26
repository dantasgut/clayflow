export enum WarmStartState {
    Invalid, // sem histórico
    Valid,   // impulsos do frame anterior disponíveis
    Scaled,  // impulsos aplicados com warm_start_factor < 1.0
}
