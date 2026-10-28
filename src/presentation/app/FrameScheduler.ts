/**
 * Quem agenda o próximo quadro do laço (spec 038): o `requestAnimationFrame` no navegador (`clayflow/web`), o laço do
 * Deno (`clayflow/deno`). O núcleo não conhece nenhum dos dois: o `GameLoop` recebe o agendador do ponto de entrada.
 */
export interface FrameScheduler {
    /** Agenda `callback` para o próximo quadro; devolve o identificador para `cancel`. */
    request(callback: () => void): unknown;
    /** Cancela um agendamento ainda não executado. */
    cancel(handle: unknown): void;
}
