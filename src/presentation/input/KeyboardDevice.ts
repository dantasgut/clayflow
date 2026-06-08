import type { Input } from './Input';

/**
 * Device de teclado — captura keydown/keyup no target (window/element) e
 * popula `Input.state.keys` (Set de KeyboardEvent.code). Use `input.isDown(code)`
 * para queries no game loop.
 */
export class KeyboardDevice {
    constructor(
        private readonly target: HTMLElement | Window,
        private readonly input: Input,
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
        this.input.state.keys.add(e.code);
    };
    private readonly onKeyUp = (e: KeyboardEvent): void => {
        this.input.state.keys.delete(e.code);
    };
}
