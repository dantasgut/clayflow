import type { Input } from './Input';

export class KeyboardDevice {
    constructor(
        private readonly target: HTMLElement | Window,
        private readonly input: Input,
    ) {}

    attach(): void {
        const t = this.target as Window;
        t.addEventListener?.('keydown', this.onKeyDown);
        t.addEventListener?.('keyup', this.onKeyUp);
    }

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
