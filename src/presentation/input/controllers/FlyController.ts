import { Transform } from '../../../elements/scene/Transform';
import type { Input } from '../Input';
import { InputDrivenController } from '../InputDrivenController';
import { forwardOf, rightOf } from './lookAngles';

/** Teclas de cada direção do FlyController (`KeyboardEvent.code`). */
export interface FlyControllerKeymap {
    /** Teclas (`KeyboardEvent.code`) para frente. */
    readonly forward?: readonly string[];
    /** Teclas para trás. */
    readonly back?: readonly string[];
    /** Teclas para a esquerda. */
    readonly left?: readonly string[];
    /** Teclas para a direita. */
    readonly right?: readonly string[];
    /** Teclas para subir. */
    readonly up?: readonly string[];
    /** Teclas para descer. */
    readonly down?: readonly string[];
}

/** Opções do FlyController. */
export interface FlyControllerOptions {
    /** Posição inicial. Default: a do `Transform` da câmera no primeiro quadro. */
    readonly position?: readonly [number, number, number];
    /** Unidades por segundo. Default 6. */
    readonly speed?: number;
    /** Radianos por pixel de arrasto. Default 0.003. */
    readonly mouseSensitivity?: number;
    /** Teclas por direção. */
    readonly keymap?: FlyControllerKeymap;
}

const DEFAULT_KEYMAP: Required<FlyControllerKeymap> = {
    forward: ['KeyW'],
    back: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    up: ['KeyE', 'Space'],
    down: ['KeyQ', 'ShiftLeft'],
};

/**
 * Voo livre: arrasto com o botão esquerdo gira (guinada/arfagem), WASD + E/Q movem em 3D. Componente da entidade da
 * câmera — muta só o `Transform` (posição e rotação).
 */
export class FlyController extends InputDrivenController {
    private pos: [number, number, number] | null;
    private readonly speed: number;
    private readonly mouseSensitivity: number;
    private readonly keymap: Required<FlyControllerKeymap>;
    private yaw = 0;
    private pitch = 0;

    constructor(options: FlyControllerOptions = {}) {
        super();
        const p = options.position;
        this.pos = p === undefined ? null : [p[0], p[1], p[2]];
        this.speed = options.speed ?? 6;
        this.mouseSensitivity = options.mouseSensitivity ?? 0.003;
        this.keymap = { ...DEFAULT_KEYMAP, ...(options.keymap ?? {}) };
    }

    /** Gira pelo arrasto, move pelas teclas e escreve posição e rotação no `Transform`. */
    tick(input: Input, dt: number, transform: Transform): void {
        const pos = (this.pos ??= startPosition(transform));
        if (input.isButtonDown('left')) {
            const delta = input.pointerDelta();
            this.yaw -= delta.dx * this.mouseSensitivity;
            this.pitch -= delta.dy * this.mouseSensitivity;
            this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
        }
        const forward = forwardOf(this.yaw, this.pitch);
        const right = rightOf(this.yaw);
        const pressed = (codes: readonly string[]): boolean =>
            codes.some((c) => input.isKeyDown(c));
        let mx = 0;
        let my = 0;
        let mz = 0;
        if (pressed(this.keymap.forward)) mz += 1;
        if (pressed(this.keymap.back)) mz -= 1;
        if (pressed(this.keymap.left)) mx -= 1;
        if (pressed(this.keymap.right)) mx += 1;
        if (pressed(this.keymap.up)) my += 1;
        if (pressed(this.keymap.down)) my -= 1;
        const len = Math.hypot(mx, my, mz);
        if (len > 0) {
            const v = (this.speed * dt) / len;
            for (let k = 0; k < 3; k++) {
                pos[k]! += (forward[k]! * mz + right[k]! * mx + (k === 1 ? my : 0)) * v;
            }
        }
        transform.data.position = [...pos, 1];
        transform.data.rotation = Transform.lookRotation(pos, [
            pos[0] + forward[0],
            pos[1] + forward[1],
            pos[2] + forward[2],
        ]);
    }
}

/** Posição atual do `Transform` (ponto de partida quando o controller não recebe uma). */
export function startPosition(transform: Transform): [number, number, number] {
    const p = transform.data.position as readonly number[];
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
}
