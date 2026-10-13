/**
 * Eventos de entrada no barramento da cena (API push do `Input`, spec 007): os dispositivos da Camada 4 os emitem; a
 * C2 só os transporta (o mapa de eventos é estendido aqui, sem a C2 conhecer o vocabulário de entrada).
 */

/** Tecla pressionada ou solta (`KeyboardEvent.code`). */
export interface KeyEvent {
    readonly code: string;
}

/** Ponteiro: posição em coordenadas do canvas, deslocamento desde o último movimento e botão (`PointerEvent.button`). */
export interface PointerInputEvent {
    readonly x: number;
    readonly y: number;
    readonly dx: number;
    readonly dy: number;
    readonly button: number;
}

/** Roda do mouse (positivo = rolar para baixo, como `WheelEvent.deltaY`). */
export interface WheelInputEvent {
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
