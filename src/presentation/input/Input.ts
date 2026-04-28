export interface InputState {
    keys: Set<string>;
    pointerX: number;
    pointerY: number;
    pointerDeltaX: number;
    pointerDeltaY: number;
    pointerButtons: number;
    wheel: number;
}

export class Input {
    readonly state: InputState = {
        keys: new Set(),
        pointerX: 0,
        pointerY: 0,
        pointerDeltaX: 0,
        pointerDeltaY: 0,
        pointerButtons: 0,
        wheel: 0,
    };

    isKeyDown(code: string): boolean {
        return this.state.keys.has(code);
    }

    consumeFrameDeltas(): void {
        this.state.pointerDeltaX = 0;
        this.state.pointerDeltaY = 0;
        this.state.wheel = 0;
    }
}
