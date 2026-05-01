/**
 * State agregado de input — keyboard + pointer + wheel + pinch — atualizado
 * pelos input devices (KeyboardDevice, PointerDevice, TouchDevice) e
 * consumido por controllers (FlyController, OrbitController, FpsController).
 *
 * Deltas (`pointerDeltaX/Y`, `wheel`, `pinchDelta`) acumulam entre frames
 * e são zerados via `consumeFrameDeltas()` (chamado pelo InteractionSystem
 * no fim de cada tick após controllers terem lido).
 */
export interface InputState {
    /** Conjunto de codes (KeyboardEvent.code) atualmente pressionadas. */
    keys: Set<string>;
    /** Posição X do pointer em coords de canvas (último move). */
    pointerX: number;
    /** Posição Y do pointer em coords de canvas. */
    pointerY: number;
    /** Delta X acumulado desde o último consumeFrameDeltas. */
    pointerDeltaX: number;
    /** Delta Y acumulado. */
    pointerDeltaY: number;
    /** Bitmask de botões pressionados (1=left, 2=right, 4=middle). */
    pointerButtons: number;
    /** Wheel delta acumulado (positive = scroll up). */
    wheel: number;
    /** Variação de pinch (distance delta entre 2 dedos) consumida por frame. */
    pinchDelta: number;
}

/**
 * Input centraliza o estado dos input devices em uma struct compartilhada.
 * Devices escrevem em `state` quando handlers de DOM eventos disparam;
 * controllers lêem em cada tick.
 */
export class Input {
    /** Estado compartilhado mutável — devices escrevem, controllers lêem. */
    readonly state: InputState = {
        keys: new Set(),
        pointerX: 0,
        pointerY: 0,
        pointerDeltaX: 0,
        pointerDeltaY: 0,
        pointerButtons: 0,
        wheel: 0,
        pinchDelta: 0,
    };

    /** Convenience: testa se uma key está pressionada agora. */
    isKeyDown(code: string): boolean {
        return this.state.keys.has(code);
    }

    /**
     * Zera todos os deltas (pointer, wheel, pinch). Chamado pelo
     * InteractionSystem ao fim de cada tick para evitar acúmulo entre
     * frames — controllers devem ter lido os deltas antes.
     */
    consumeFrameDeltas(): void {
        this.state.pointerDeltaX = 0;
        this.state.pointerDeltaY = 0;
        this.state.wheel = 0;
        this.state.pinchDelta = 0;
    }
}
