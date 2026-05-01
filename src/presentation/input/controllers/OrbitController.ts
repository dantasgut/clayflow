import type { Camera } from '../../../elements/scene/Camera';
import { InputDrivenController } from '../InputDrivenController';
import type { ControllerContext } from '../InputDrivenController';

export interface OrbitControllerOptions {
    readonly target?: readonly [number, number, number];
    readonly distance?: number;
    readonly autoRotate?: boolean;
    readonly autoRotateSpeed?: number;
    /** Coeficiente de damping em [0, 1]: 0 = sem damping (parada brusca),
     * 1 = sem amortecimento (gira eternamente). Default 0.85. */
    readonly damping?: number;
    /** Sensibilidade do pinch (touch) em distance units por pixel. */
    readonly pinchSensitivity?: number;
}

/**
 * OrbitController com damping (inércia) por canal: theta, phi, distance.
 * Cada canal acumula `velocity_X = lerp(velocity_X, raw_input, damping)` por
 * frame, decaindo gradualmente após o usuário soltar. Suporta pinch-zoom
 * (touch) consumindo `input.state.pinchDelta`.
 */
export class OrbitController extends InputDrivenController {
    private theta = 0;
    private phi = Math.PI / 4;
    private distance: number;
    private vTheta = 0;
    private vPhi = 0;
    private vDistance = 0;
    private readonly target: [number, number, number];
    private readonly autoRotate: boolean;
    private readonly autoRotateSpeed: number;
    private readonly damping: number;
    private readonly pinchSensitivity: number;

    constructor(
        private readonly camera: Camera,
        options: OrbitControllerOptions = {},
    ) {
        super();
        this.target = [...(options.target ?? [0, 0, 0])] as [number, number, number];
        this.distance = options.distance ?? 5;
        this.autoRotate = options.autoRotate ?? false;
        this.autoRotateSpeed = options.autoRotateSpeed ?? 0.5;
        this.damping = Math.max(0, Math.min(1, options.damping ?? 0.85));
        this.pinchSensitivity = options.pinchSensitivity ?? 0.01;
    }

    update(ctx: ControllerContext): void {
        const { input, dt } = ctx;
        const dragging = (input.state.pointerButtons & 1) !== 0;

        // Inputs raw → injetam velocidade nos canais.
        if (dragging) {
            this.vTheta = -input.state.pointerDeltaX * 0.005;
            this.vPhi = -input.state.pointerDeltaY * 0.005;
        } else {
            // Sem drag: damping decai velocidade exponencialmente.
            this.vTheta *= this.damping;
            this.vPhi *= this.damping;
        }
        if (input.state.wheel !== 0) {
            this.vDistance = input.state.wheel * 0.001;
        } else if (input.state.pinchDelta !== 0) {
            // pinch positivo (afasta dedos) deve diminuir distance (zoom-in).
            this.vDistance = -input.state.pinchDelta * this.pinchSensitivity;
        } else {
            this.vDistance *= this.damping;
        }

        // Apply velocity → state.
        this.theta += this.vTheta;
        this.phi += this.vPhi;
        this.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.phi));
        if (this.vDistance !== 0) {
            this.distance *= Math.exp(this.vDistance);
            this.distance = Math.max(0.5, Math.min(100, this.distance));
        }
        if (this.autoRotate) this.theta += this.autoRotateSpeed * dt;

        const sinP = Math.sin(this.phi),
            cosP = Math.cos(this.phi);
        const sinT = Math.sin(this.theta),
            cosT = Math.cos(this.theta);
        const tx = this.target[0],
            ty = this.target[1],
            tz = this.target[2];
        const eyeX = tx + this.distance * sinP * cosT;
        const eyeY = ty + this.distance * cosP;
        const eyeZ = tz + this.distance * sinP * sinT;

        const view = lookAtMatrix([eyeX, eyeY, eyeZ], this.target, [0, 1, 0]);
        const aspect = (this.camera.data.aspect as number) || 1;
        const fov = (this.camera.data.fov as number) || Math.PI / 4;
        const near = (this.camera.data.near as number) || 0.1;
        const far = (this.camera.data.far as number) || 1000;
        const proj = perspectiveMatrix(fov, aspect, near, far);
        const vp = multiplyMatrices(proj, view);

        this.camera.data.view = view;
        this.camera.data.projection = proj;
        this.camera.data.viewProjection = vp;
        this.camera.data.position = [eyeX, eyeY, eyeZ, 1];
    }
}

function lookAtMatrix(
    eye: readonly number[],
    target: readonly number[],
    up: readonly number[],
): number[] {
    const ex = eye[0] ?? 0,
        ey = eye[1] ?? 0,
        ez = eye[2] ?? 0;
    const tx = target[0] ?? 0,
        ty = target[1] ?? 0,
        tz = target[2] ?? 0;
    const ux = up[0] ?? 0,
        uy = up[1] ?? 1,
        uz = up[2] ?? 0;
    let zx = ex - tx,
        zy = ey - ty,
        zz = ez - tz;
    const zlen = Math.hypot(zx, zy, zz) || 1;
    zx /= zlen;
    zy /= zlen;
    zz /= zlen;
    let xx = uy * zz - uz * zy;
    let xy = uz * zx - ux * zz;
    let xz = ux * zy - uy * zx;
    const xlen = Math.hypot(xx, xy, xz) || 1;
    xx /= xlen;
    xy /= xlen;
    xz /= xlen;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
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
        -(xx * ex + xy * ey + xz * ez),
        -(yx * ex + yy * ey + yz * ez),
        -(zx * ex + zy * ey + zz * ez),
        1,
    ];
}

function perspectiveMatrix(fovY: number, aspect: number, near: number, far: number): number[] {
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
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
    const out: number[] = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += (a[k * 4 + j] ?? 0) * (b[i * 4 + k] ?? 0);
            out[i * 4 + j] = s;
        }
    }
    return out;
}
