import type { EventBus } from '../../scene/events/EventBus';
import type { Input } from './Input';

/**
 * Device de teclado — captura keydown/keyup no target (window/element), popula `Input.current.keys` (Set de
 * KeyboardEvent.code; consulta por `input.isKeyDown(code)`) e emite `keyDown`/`keyUp` no barramento, quando dado.
 */
export class KeyboardDevice {
    constructor(
        private readonly target: HTMLElement | Window,
        private readonly input: Input,
        private readonly events?: EventBus,
    ) {}

    /** Registra listeners no target. Chamado pelo Application após `start()`. */
    attach(): void {
        const t = this.target as Window;
        t.addEventListener?.('keydown', this.onKeyDown);
        t.addEventListener?.('keyup', this.onKeyUp);
    }

    /** Remove listeners. Chamado em `Application.dispose()`. */
    detach(): void {
        const t = this.target as Window;
        t.removeEventListener?.('keydown', this.onKeyDown);
        t.removeEventListener?.('keyup', this.onKeyUp);
    }

    private readonly onKeyDown = (e: KeyboardEvent): void => {
        this.input.current.keys.add(e.code);
        this.events?.emit('keyDown', { code: e.code });
    };
    private readonly onKeyUp = (e: KeyboardEvent): void => {
        this.input.current.keys.delete(e.code);
        this.events?.emit('keyUp', { code: e.code });
    };
}
