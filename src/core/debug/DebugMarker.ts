/**
 * Marcadores de depuração para GPU (Camada 1).
 * Mapeia para pushDebugGroup / popDebugGroup / insertDebugMarker do WebGPU,
 * visíveis em ferramentas de captura (Chrome WebGPU Inspector, RenderDoc).
 *
 * Controlado por flag global — zero overhead em produção.
 *
 * @example
 * DebugMarker.push(encoder, 'Frame');
 *   DebugMarker.push(encoder, 'ForwardPass');
 *     // ... render commands
 *   DebugMarker.pop(encoder);
 * DebugMarker.pop(encoder);
 */
export class DebugMarker {
    private static enabled: boolean = true;

    public static enable():  void { DebugMarker.enabled = true;  }
    public static disable(): void { DebugMarker.enabled = false; }
    public static isEnabled(): boolean { return DebugMarker.enabled; }

    /** Abre um grupo de debug hierárquico na fila de comandos GPU. */
    public static push(encoder: GPUCommandEncoder, label: string): void {
        if (!DebugMarker.enabled) return;
        encoder.pushDebugGroup(label);
    }

    /** Fecha o grupo de debug aberto mais recentemente. */
    public static pop(encoder: GPUCommandEncoder): void {
        if (!DebugMarker.enabled) return;
        encoder.popDebugGroup();
    }

    /** Insere um marcador pontual (snapshot) na fila de comandos GPU. */
    public static mark(encoder: GPUCommandEncoder, label: string): void {
        if (!DebugMarker.enabled) return;
        encoder.insertDebugMarker(label);
    }
}
