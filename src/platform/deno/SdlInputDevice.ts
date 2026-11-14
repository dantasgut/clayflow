import type { EventBus } from '../../scene/events/EventBus';
import type { Input } from '../../presentation/input/Input';
import type { InputDevice } from '../../presentation/input/InputDevice';
import type { SdlEvent } from './sdl';

/** Os códigos de tecla do navegador (`KeyboardEvent.code`) pelos scancodes da SDL (USB HID), os mais usados. */
function codeOf(scancode: number): string | undefined {
    if (scancode >= 4 && scancode <= 29) return `Key${String.fromCharCode(65 + scancode - 4)}`;
    if (scancode >= 30 && scancode <= 38) return `Digit${scancode - 29}`;
    if (scancode === 39) return 'Digit0';
    if (scancode >= 58 && scancode <= 69) return `F${scancode - 57}`;
    const named: Record<number, string> = {
        40: 'Enter',
        41: 'Escape',
        42: 'Backspace',
        43: 'Tab',
        44: 'Space',
        79: 'ArrowRight',
        80: 'ArrowLeft',
        81: 'ArrowDown',
        82: 'ArrowUp',
        224: 'ControlLeft',
        225: 'ShiftLeft',
        226: 'AltLeft',
        228: 'ControlRight',
        229: 'ShiftRight',
        230: 'AltRight',
    };
    return named[scancode];
}

/**
 * Entrada da janela SDL (spec 038, `clayflow/deno`): os eventos da janela no `Input` da cena e no barramento, com os
 * mesmos nomes e unidades da entrada do DOM — teclas por `KeyboardEvent.code`, botões 0/1/2 (esquerdo, meio, direito),
 * a roda em `deltaY` (positivo para baixo) — e os controllers (órbita, voo) funcionam igual nos dois ambientes.
 */
export class SdlInputDevice implements InputDevice {
    private attached = false;

    constructor(
        private readonly input: Input,
        private readonly events: EventBus,
    ) {}

    attach(): void {
        this.attached = true;
    }

    detach(): void {
        this.attached = false;
    }

    /** Traduz os eventos de entrada da janela (o laço do Deno os entrega a cada quadro). */
    handle(events: readonly SdlEvent[]): void {
        if (!this.attached) return;
        const cur = this.input.current;
        for (const e of events) {
            if (e.kind === 'key') {
                const code = codeOf(e.scancode);
                if (code === undefined) continue;
                if (e.down) {
                    cur.keys.add(code);
                    if (!e.repeat) this.events.emit('keyDown', { code });
                } else {
                    cur.keys.delete(code);
                    this.events.emit('keyUp', { code });
                }
            } else if (e.kind === 'motion') {
                cur.pointerDeltaX += e.dx;
                cur.pointerDeltaY += e.dy;
                cur.pointerX = e.x;
                cur.pointerY = e.y;
                this.events.emit('pointerMove', { x: e.x, y: e.y, dx: e.dx, dy: e.dy, button: 0 });
            } else if (e.kind === 'button') {
                // SDL: 1 esquerdo, 2 meio, 3 direito → 0, 1, 2 do DOM.
                const button = e.button - 1;
                if (e.down) cur.pointerButtons |= 1 << button;
                else cur.pointerButtons &= ~(1 << button);
                this.events.emit(e.down ? 'pointerDown' : 'pointerUp', {
                    x: e.x,
                    y: e.y,
                    dx: 0,
                    dy: 0,
                    button,
                });
            } else if (e.kind === 'wheel') {
                // SDL: positivo para cima (afastando); DOM: `deltaY` positivo para baixo, ~100 por entalhe.
                const delta = -e.dy * 100;
                cur.wheel += delta;
                this.events.emit('wheel', { delta });
            }
        }
    }
}
