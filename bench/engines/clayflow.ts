import {
    Application,
    Camera,
    DirectionalLight,
    Transform,
    type FrameCompleteEvent,
} from 'clayflow';
import type { EngineAdapter, FrameSample, SceneImplementation } from '../core/types';

/** Handle do clayflow entregue às cenas. */
export interface ClayflowHandle {
    readonly app: Application;
    readonly camera: Camera;
    /** Último `frameComplete` observado (preenchido de forma síncrona pelo `frameTick`). */
    last: FrameCompleteEvent | null;
}

/** Tempo simulado por quadro do protocolo — o mesmo `timestep` do Rapier no adaptador Three. */
const SIMULATED_DT = 1 / 60;

/**
 * Adaptador clayflow — só pela API pública (FR-016). Não chama `app.start()`: cada quadro é
 * avançado por `app.step(1/60)`, síncrono — 1/60 s simulado por quadro, como o `world.step()` do
 * Rapier (mesmo trabalho de física nas duas engines, qualquer que seja a duração real do quadro).
 * O `dt` real continua alimentando o `update` da cena, que roda antes, para as mutações entrarem na
 * fila e serem enviadas no mesmo quadro (spec 003).
 */
export function createClayflowAdapter(options: {
    profiling: boolean;
}): EngineAdapter<ClayflowHandle> {
    return {
        id: 'clayflow',
        version: 'clayflow',
        limitations: [],
        async init(canvas, resolution, cameraSpec) {
            canvas.width = resolution.width;
            canvas.height = resolution.height;
            const app = await Application.create({
                canvas,
                autoResize: false,
                // Mesma configuração do adaptador do Three (antialias: false): sem MSAA na comparação.
                antialias: false,
                // Só o total do quadro: amostrar cada passe (dezenas na física) pesaria no próprio tempo medido.
                profiling: options.profiling ? 'frame' : false,
            });
            const aspect = resolution.width / resolution.height;
            // Câmera pelo modelo da 007: parâmetros + Transform; as matrizes são do estágio de câmera, na GPU.
            const camera = new Camera({
                fov: (cameraSpec.fovDeg * Math.PI) / 180,
                aspect,
                aspectMode: 'fixed',
                near: 0.1,
                far: 1000,
            });
            camera.add(
                new Transform({
                    position: [...cameraSpec.position, 1],
                    rotation: Transform.lookRotation(cameraSpec.position, cameraSpec.target),
                }),
            );
            app.world.insert(camera);
            // Spec 011: a luz é explícita (sem luz, só o hemisfério ilumina) — a direção que o desenho usava por padrão.
            app.world.insert(
                new DirectionalLight({ direction: [0.4, -1, 0.6, 0], intensity: Math.PI }),
            );
            const handle: ClayflowHandle = { app, camera, last: null };
            app.events.on('frameComplete', (e) => {
                handle.last = e;
            });
            return handle;
        },
        environment(handle) {
            const caps = handle.app.capabilities;
            return {
                gpu: {
                    vendor: caps.adapter.vendor,
                    architecture: caps.adapter.architecture,
                    device: caps.adapter.device,
                    description: caps.adapter.description,
                },
                timestampQuery: caps.features.includes('timestamp-query'),
                isFallbackAdapter:
                    caps.adapter.isFallbackAdapter || /swiftshader/i.test(caps.adapter.description),
                device: {
                    powerPreference: caps.powerPreference,
                    features: caps.features,
                    limits: caps.limits,
                },
            };
        },
        capabilities(handle) {
            return {
                gpuTiming: handle.last?.stats.gpuTimeMs !== undefined,
                memory: 'exact',
            };
        },
        readyForFrame(handle) {
            const app = handle.app;
            if (app.readyForFrame()) return Promise.resolve();
            return new Promise((resolve) => {
                const off = app.events.on('frameRetired', () => {
                    if (!app.readyForFrame()) return;
                    off();
                    resolve();
                });
            });
        },
        frame(handle, scene: SceneImplementation<ClayflowHandle>, dtSeconds): FrameSample | null {
            // Mesmo ritmo do laço: com a GPU sem espaço para mais um quadro, espera o próximo tick.
            if (!handle.app.readyForFrame()) return null;
            const t0 = performance.now();
            scene.update?.(dtSeconds);
            const updateMs = performance.now() - t0;
            handle.last = null;
            handle.app.step(SIMULATED_DT);
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
