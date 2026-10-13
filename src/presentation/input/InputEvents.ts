/**
 * Eventos de entrada no barramento da cena (API push do `Input`, spec 007): os dispositivos da Camada 4 os emitem; a
 * C2 só os transporta (o mapa de eventos é estendido aqui, sem a C2 conhecer o vocabulário de entrada).
 */

/** Tecla pressionada ou solta (`KeyboardEvent.code`). */
export interface KeyEvent {
    /** Código físico da tecla (`KeyboardEvent.code`, ex.: `'KeyW'`). */
    readonly code: string;
}

/** Ponteiro: posição em coordenadas do canvas, deslocamento desde o último movimento e botão (`PointerEvent.button`). */
export interface PointerInputEvent {
    /** Posição horizontal no canvas, em pixels. */
    readonly x: number;
    /** Posição vertical no canvas, em pixels (para baixo). */
    readonly y: number;
    /** Deslocamento horizontal desde o último movimento. */
    readonly dx: number;
    /** Deslocamento vertical desde o último movimento. */
    readonly dy: number;
    /** Botão (`PointerEvent.button`: 0 esquerdo, 1 meio, 2 direito). */
    readonly button: number;
}

/** Roda do mouse (positivo = rolar para baixo, como `WheelEvent.deltaY`). */
export interface WheelInputEvent {
    /** Rolagem vertical (`WheelEvent.deltaY`). */
    readonly delta: number;
}

declare module '../../scene/events/EventMap' {
    interface EventMap {
        /** Tecla pressionada (`Input`, Camada 4). */
        keyDown: KeyEvent;
        /** Tecla solta. */
        keyUp: KeyEvent;
        /** Botão do ponteiro pressionado. */
        pointerDown: PointerInputEvent;
        /** Botão do ponteiro solto. */
        pointerUp: PointerInputEvent;
        /** Ponteiro movido. */
        pointerMove: PointerInputEvent;
        /** Roda do mouse. */
        wheel: WheelInputEvent;
    }
}
