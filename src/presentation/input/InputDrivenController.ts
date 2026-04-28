import type { Input } from './Input';

export interface ControllerContext {
    readonly input: Input;
    readonly dt: number;
}

export abstract class InputDrivenController {
    abstract update(ctx: ControllerContext): void;
}
