/**
 * Payload de `simulationHeld` e `simulationResumed` — emitidos pela cena quando o relógio para porque um estágio da
 * física ainda confere ou compila o pipeline (ex.: o campo de um colisor com função do usuário), e quando volta a andar.
 * Parado, o quadro desenha com o tempo do anterior: a física nunca avança sem um estágio que ela usa.
 */
export interface SimulationHeldEvent {
    /** Os estágios da fase `physics` com pipeline em conferência ou compilação (vazio em `simulationResumed`). */
    readonly flows: readonly string[];
}
