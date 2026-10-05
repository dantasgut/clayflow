/**
 * Contadores inteiros de um quadro (C1). Sempre ligados — custo de um incremento por
 * chamada. Os passes incrementam; `GpuEngineCore` zera ao abrir cada gravação e copia
 * para `lastFrameStats()` no submit.
 */
export class FrameCounters {
    drawCalls = 0;
    dispatches = 0;
    passes = 0;
    /** Draws gravados em cada bundle finalizado — somados quando o bundle é executado. */
    readonly bundleDraws = new WeakMap<object, number>();

    reset(): void {
        this.drawCalls = 0;
        this.dispatches = 0;
        this.passes = 0;
    }
}
