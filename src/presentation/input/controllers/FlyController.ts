import type { Camera } from '../../../elements/scene/Camera';
import { InputDrivenController } from '../InputDrivenController';
import type { ControllerContext } from '../InputDrivenController';

export interface FlyControllerKeymap {
    readonly forward?: readonly string[];
    readonly back?: readonly string[];
    readonly left?: readonly string[];
    readonly right?: readonly string[];
    readonly up?: readonly string[];
    readonly down?: readonly string[];
}

export interface FlyControllerOptions {
    readonly position?: readonly [number, number, number];
    readonly speed?: number;
    readonly mouseSensitivity?: number;
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

export class FlyController extends InputDrivenController {
    private readonly pos: [number, number, number];
    private readonly speed: number;
    private readonly mouseSensitivity: number;
    private readonly keymap: Required<FlyControllerKeymap>;
    private yaw = 0;
    private pitch = 0;

    constructor(
        private readonly camera: Camera,
        options: FlyControllerOptions = {},
    ) {
        super();
        const p = options.position ?? [0, 0, 5];
        this.pos = [p[0], p[1], p[2]];
        this.speed = options.speed ?? 6;
        this.mouseSensitivity = options.mouseSensitivity ?? 0.003;
        this.keymap = { ...DEFAULT_KEYMAP, ...(options.keymap ?? {}) };
    }

    private anyKeyDown(input: ControllerContext['input'], codes: readonly string[]): boolean {
        for (const c of codes) if (input.isKeyDown(c)) return true;
        return false;
    }

    update(ctx: ControllerContext): void {
        const { input, dt } = ctx;
        if (input.state.pointerButtons & 1) {
            this.yaw -= input.state.pointerDeltaX * this.mouseSensitivity;
            this.pitch -= input.state.pointerDeltaY * this.mouseSensitivity;
            this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
        }
        const forward: [number, number, number] = [
            Math.sin(this.yaw) * Math.cos(this.pitch),
            -Math.sin(this.pitch),
            -Math.cos(this.yaw) * Math.cos(this.pitch),
        ];
        const right: [number, number, number] = [Math.cos(this.yaw), 0, Math.sin(this.yaw)];
        const upVec: [number, number, number] = [0, 1, 0];

        let mx = 0,
            my = 0,
            mz = 0;
        if (this.anyKeyDown(input, this.keymap.forward)) mz += 1;
        if (this.anyKeyDown(input, this.keymap.back)) mz -= 1;
        if (this.anyKeyDown(input, this.keymap.left)) mx -= 1;
        if (this.anyKeyDown(input, this.keymap.right)) mx += 1;
        if (this.anyKeyDown(input, this.keymap.up)) my += 1;
        if (this.anyKeyDown(input, this.keymap.down)) my -= 1;
        const len = Math.hypot(mx, my, mz);
        if (len > 0) {
            const inv = 1 / len;
            mx *= inv;
            my *= inv;
            mz *= inv;
            const v = this.speed * dt;
            this.pos[0] += (forward[0] * mz + right[0] * mx + upVec[0] * my) * v;
            this.pos[1] += (forward[1] * mz + right[1] * mx + upVec[1] * my) * v;
            this.pos[2] += (forward[2] * mz + right[2] * mx + upVec[2] * my) * v;
        }

        const eye = this.pos;
        const target: [number, number, number] = [
            eye[0] + forward[0],
            eye[1] + forward[1],
            eye[2] + forward[2],
        ];
        const view = lookAtMatrix(eye, target, [0, 1, 0]);
        const aspect = (this.camera.data.aspect as number) || 1;
        const fov = (this.camera.data.fov as number) || Math.PI / 4;
        const near = (this.camera.data.near as number) || 0.1;
        const far = (this.camera.data.far as number) || 1000;
        const proj = perspectiveMatrix(fov, aspect, near, far);
        const vp = multiplyMatrices(proj, view);
        this.camera.data.view = view;
        this.camera.data.projection = proj;
        this.camera.data.viewProjection = vp;
        this.camera.data.position = [eye[0], eye[1], eye[2], 1];
    }
}

function lookAtMatrix(e: readonly number[], t: readonly number[], u: readonly number[]): number[] {
    let zx = (e[0] ?? 0) - (t[0] ?? 0),
        zy = (e[1] ?? 0) - (t[1] ?? 0),
        zz = (e[2] ?? 0) - (t[2] ?? 0);
    const zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl;
    zy /= zl;
    zz /= zl;
    let xx = (u[1] ?? 0) * zz - (u[2] ?? 0) * zy,
        xy = (u[2] ?? 0) * zx - (u[0] ?? 0) * zz,
        xz = (u[0] ?? 0) * zy - (u[1] ?? 1) * zx;
    const xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl;
    xy /= xl;
    xz /= xl;
    const yx = zy * xz - zz * xy,
        yy = zz * xx - zx * xz,
        yz = zx * xy - zy * xx;
    return [
        xx,
        yx,
        zx,
        0,
        xy,
        yy,
        zy,
        0,
        xz,
        yz,
        zz,
        0,
        -(xx * (e[0] ?? 0) + xy * (e[1] ?? 0) + xz * (e[2] ?? 0)),
        -(yx * (e[0] ?? 0) + yy * (e[1] ?? 0) + yz * (e[2] ?? 0)),
        -(zx * (e[0] ?? 0) + zy * (e[1] ?? 0) + zz * (e[2] ?? 0)),
        1,
    ];
}

function perspectiveMatrix(fovY: number, aspect: number, near: number, far: number): number[] {
    const f = 1 / Math.tan(fovY / 2),
        nf = 1 / (near - far);
    return [
        f / aspect,
        0,
        0,
        0,
        0,
        f,
        0,
        0,
        0,
        0,
        (far + near) * nf,
        -1,
        0,
        0,
        2 * far * near * nf,
        0,
    ];
}

function multiplyMatrices(a: readonly number[], b: readonly number[]): number[] {
    const o: number[] = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += (a[k * 4 + j] ?? 0) * (b[i * 4 + k] ?? 0);
            o[i * 4 + j] = s;
        }
    }
    return o;
}
