import { Transform } from '../../../elements/scene/Transform';
import type { Input } from '../Input';
import { InputDrivenController } from '../InputDrivenController';
import { startPosition } from './FlyController';
import { forwardOf, rightOf } from './lookAngles';

/** Opções do FpsController. */
export interface FpsControllerOptions {
    /** Posição inicial (olhos). Default: a do `Transform` da câmera no primeiro quadro. */
    readonly position?: readonly [number, number, number];
    /** Unidades por segundo. Default 4. */
    readonly speed?: number;
    /** Radianos por pixel. Default 0.003. */
    readonly mouseSensitivity?: number;
    /** Canvas para pedir pointer lock no clique (olhar sem segurar o botão). */
    readonly canvas?: HTMLCanvasElement;
}

/**
 * Primeira pessoa: WASD anda no plano horizontal (altura dos olhos fixa); o olhar segue o ponteiro com o botão
 * esquerdo ou, com `canvas`, em pointer lock. Componente da entidade da câmera — muta só o `Transform`.
 */
export class FpsController extends InputDrivenController {
    private pos: [number, number, number] | null;
    private readonly speed: number;
    private readonly mouseSensitivity: number;
    private readonly canvas: HTMLCanvasElement | null;
    private clickListener: (() => void) | null = null;
    private yaw = 0;
    private pitch = 0;

    constructor(options: FpsControllerOptions = {}) {
        super();
        const p = options.position;
        this.pos = p === undefined ? null : [p[0], p[1], p[2]];
        this.speed = options.speed ?? 4;
        this.mouseSensitivity = options.mouseSensitivity ?? 0.003;
        this.canvas = options.canvas ?? null;
        if (this.canvas !== null) this.attachLock(this.canvas);
    }

    /** Remove o ouvinte de clique (pointer lock) do canvas. */
    override dispose(): void {
        if (this.canvas !== null && this.clickListener !== null) {
            this.canvas.removeEventListener('click', this.clickListener);
        }
        this.clickListener = null;
    }

    /** Olha pelo ponteiro, anda pelas teclas e escreve posição e rotação no `Transform`. */
    tick(input: Input, dt: number, transform: Transform): void {
        const pos = (this.pos ??= startPosition(transform));
        const locked =
            this.canvas !== null
            && typeof document !== 'undefined'
            && document.pointerLockElement === this.canvas;
        if (locked || input.isButtonDown('left')) {
            const delta = input.pointerDelta();
            this.yaw -= delta.dx * this.mouseSensitivity;
            this.pitch -= delta.dy * this.mouseSensitivity;
            this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
        }
        const forward = forwardOf(this.yaw, this.pitch);
        const right = rightOf(this.yaw);
        let mx = 0;
        let mz = 0;
        if (input.isKeyDown('KeyW')) mz += 1;
        if (input.isKeyDown('KeyS')) mz -= 1;
        if (input.isKeyDown('KeyA')) mx -= 1;
        if (input.isKeyDown('KeyD')) mx += 1;
        if (mx !== 0 || mz !== 0) {
            const v = (this.speed * dt) / Math.hypot(mx, mz);
            pos[0] += (forward[0] * mz + right[0] * mx) * v;
            pos[2] += (forward[2] * mz + right[2] * mx) * v;
        }
        transform.data.position = [...pos, 1];
        transform.data.rotation = Transform.lookRotation(pos, [
            pos[0] + forward[0],
            pos[1] + forward[1],
            pos[2] + forward[2],
        ]);
    }

    private attachLock(canvas: HTMLCanvasElement): void {
        this.clickListener = () => {
            const c = canvas as HTMLCanvasElement & {
                requestPointerLock?: () => Promise<void> | void;
            };
            if (c.requestPointerLock !== undefined && document.pointerLockElement !== canvas) {
                try {
                    void c.requestPointerLock();
                } catch {
                    /* unsupported */
                }
            }
        };
        canvas.addEventListener('click', this.clickListener);
    }
}
