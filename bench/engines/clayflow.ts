import { Application, Camera, type FrameCompleteEvent } from 'clayflow';
import type { CameraSpec, EngineAdapter, FrameSample, SceneImplementation } from '../core/types';

/** Handle do clayflow entregue às cenas. */
export interface ClayflowHandle {
    readonly app: Application;
    readonly camera: Camera;
    /** Último `frameComplete` observado (preenchido de forma síncrona pelo `frameTick`). */
    last: FrameCompleteEvent | null;
    elapsed: number;
}

/**
 * Matrizes da câmera no mesmo padrão dos controllers do motor (o motor ainda não calcula a
 * câmera — kernel de câmera é da F2). Código de usuário, não do motor.
 */
export function cameraMatrices(
    spec: CameraSpec,
    aspect: number,
    near = 0.1,
    far = 1000,
): { view: number[]; projection: number[]; viewProjection: number[] } {
    const [ex, ey, ez] = spec.position;
    const [tx, ty, tz] = spec.target;
    let zx = ex - tx;
    let zy = ey - ty;
    let zz = ez - tz;
    const zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl;
    zy /= zl;
    zz /= zl;
    // up = Y
    let xx = zz;
    let xy = 0;
    let xz = -zx;
    const xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl;
    xy /= xl;
    xz /= xl;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    const view = [
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
    const f = 1 / Math.tan((spec.fovDeg * Math.PI) / 360);
    const nf = 1 / (near - far);
    const projection = [
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
    const viewProjection = new Array<number>(16).fill(0);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += (projection[k * 4 + j] ?? 0) * (view[i * 4 + k] ?? 0);
            viewProjection[i * 4 + j] = s;
        }
    }
    return { view, projection, viewProjection };
}

/**
 * Adaptador clayflow — só pela API pública (FR-016). Não chama `app.start()`: cada quadro é
 * disparado com `emit('frameTick')`, síncrono (o motor não tem `step()` até a F1); `update` da
 * cena roda antes, para as mutações entrarem na fila e serem enviadas no mesmo quadro (spec 003).
 */
export function createClayflowAdapter(options: {
    profiling: boolean;
}): EngineAdapter<ClayflowHandle> {
    return {
        id: 'clayflow',
        version: 'clayflow',
        limitations: [
            'forward fora da arquitetura de Flows: aloca buffers e bind groups por entidade e regrava a câmera em cada uma a cada quadro, em vez de consumir pelos slots o que a C2 já aloca (até F1, spec 006)',
            'hash de spec (UUIDv5/SHA-1) recalculado a cada bind, sem cache — multiplicado pelos binds por entidade (até F1, spec 004)',
        ],
        async init(canvas, resolution, cameraSpec) {
            canvas.width = resolution.width;
            canvas.height = resolution.height;
            const app = await Application.create({
                canvas,
                autoResize: false,
                profiling: options.profiling,
            });
            const aspect = resolution.width / resolution.height;
            const fov = (cameraSpec.fovDeg * Math.PI) / 180;
            const camera = new Camera({
                ...cameraMatrices(cameraSpec, aspect),
                position: [...cameraSpec.position, 1],
                fov,
                aspect,
                near: 0.1,
                far: 1000,
            });
            app.world.insert(camera);
            const handle: ClayflowHandle = { app, camera, last: null, elapsed: 0 };
            app.events.on('frameComplete', (e) => {
                handle.last = e;
            });
            return handle;
        },
        capabilities(handle) {
            return {
                gpuTiming: handle.last?.stats.gpuTimeMs !== undefined,
                memory: 'exact',
            };
        },
        frame(handle, scene: SceneImplementation<ClayflowHandle>, dtSeconds): FrameSample {
            const t0 = performance.now();
            scene.update?.(dtSeconds);
            const updateMs = performance.now() - t0;
            handle.elapsed += dtSeconds;
            handle.last = null;
            handle.app.events.emit('frameTick', { dt: dtSeconds, elapsed: handle.elapsed });
            const e = handle.last as FrameCompleteEvent | null;
            if (e === null) throw new Error('clayflow: frameComplete não foi emitido no quadro.');
            return {
                cpuMs: updateMs + e.dt,
                drawCalls: e.stats.drawCalls,
                ...(e.stats.gpuTimeMs !== undefined
                    ? { gpuMs: e.stats.gpuTimeMs, gpuSampleId: e.stats.gpuFrame ?? -1 }
                    : {}),
            };
        },
        memoryBytes(handle) {
            return handle.app.core.memoryUsage().totalBytes;
        },
        gpuReading(handle) {
            const s = handle.app.core.lastFrameStats();
            return s.gpuTimeMs !== undefined
                ? { gpuMs: s.gpuTimeMs, id: s.gpuFrame ?? -1 }
                : undefined;
        },
        dispose(handle) {
            handle.app.dispose();
        },
    };
}
