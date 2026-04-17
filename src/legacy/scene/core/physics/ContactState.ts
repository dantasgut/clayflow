export enum ContactState {
    Inactive,    // slot vazio
    Speculative, // previsto, não penetrando ainda
    Active,      // penetrando, solver aplicando impulso
    Persistent,  // ativo por múltiplos frames, warm-start válido
    Separating,  // foi ativo, corpos se afastando
}
