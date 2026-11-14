/**
 * Um dispositivo de entrada (spec 038): escreve no `Input` da cena e emite os eventos de entrada no barramento a partir
 * do que o ambiente entrega — o DOM no navegador (`clayflow/web`: teclado, ponteiro, toque), a janela SDL no Deno
 * (`clayflow/deno`). O `InteractionSystem` liga e desliga os dispositivos que o ponto de entrada lhe dá.
 */
export interface InputDevice {
    /** Começa a ouvir o ambiente. */
    attach(): void;
    /** Para de ouvir (o descarte e o `detach` do sistema). */
    detach(): void;
}
