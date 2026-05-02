/**
 * Payload do evento `frameTick` — emitido pelo `GameLoop` no início de cada frame.
 * Subscribers (ExecutionSystem, controllers, etc.) usam para drive simulation
 * e dispatch frame-rate-independent.
 */
export interface FrameTickEvent {
    /** Delta time em segundos (clamped em 1/30 para evitar saltos enormes). */
    readonly dt: number;
    /** Tempo total acumulado desde início do GameLoop (segundos). */
    readonly elapsed: number;
}
