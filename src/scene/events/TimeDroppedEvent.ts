/**
 * Payload do evento `timeDropped` — emitido pelo `Time` quando o teto de passos por quadro
 * (`maxStepsPerFrame`) descarta tempo simulado (quadro muito longo, aba em segundo plano).
 */
export interface TimeDroppedEvent {
    /** Tempo de física descartado neste quadro (segundos). */
    readonly dropped: number;
}
