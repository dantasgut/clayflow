import { findScene } from '../core/catalog';
import { mulberry32 } from '../core/rng';
import {
    isUnsupported,
    type EngineAdapter,
    type EngineId,
    type PageEnvironment,
    type PageResult,
} from '../core/types';
import { FrameSampler } from './sampler';

declare global {
    interface Window {
        __benchResult?: PageResult;
    }
}

/** Passo de simulação fixo: o mesmo conteúdo por quadro nas duas engines (FR-003). */
const DT = 1 / 60;
const RESOLUTION = { width: 1280, height: 720 } as const;
/** Espera máxima, após a janela, pela leitura de GPU ainda em trânsito. */
const LATE_GPU_WAIT_MS = 1500;

function publish(result: PageResult): void {
    console.log(
        `[bench] ${result.status}${result.reason !== undefined ? ` — ${result.reason}` : ''}`,
    );
    window.__benchResult = result;
}

function param(q: URLSearchParams, name: string, fallback?: string): string {
    const v = q.get(name) ?? fallback;
    if (v === undefined) throw new Error(`parâmetro ausente: ${name}`);
    return v;
}

async function environment(): Promise<PageEnvironment> {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error('WebGPU indisponível neste navegador');
    const info = adapter.info as GPUAdapterInfo & { isFallbackAdapter?: boolean };
    return {
        gpu: {
            vendor: info.vendor,
            architecture: info.architecture,
            device: info.device,
            description: info.description,
        },
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        timestampQuery: adapter.features.has('timestamp-query'),
        isFallbackAdapter: info.isFallbackAdapter || /swiftshader/i.test(info.description),
    };
}

async function loadAdapter(engine: EngineId, profiling: boolean): Promise<EngineAdapter<unknown>> {
    if (engine === 'clayflow') {
        const { createClayflowAdapter } = await import('../engines/clayflow');
        return createClayflowAdapter({ profiling });
    }
    const { createThreeAdapter } = await import('../engines/three');
    return createThreeAdapter();
}

function nextFrame(): Promise<void> {
    return new Promise((resolve) =>
        requestAnimationFrame(() => {
            resolve();
        }),
    );
}

async function run(): Promise<void> {
    const startedAt = performance.now();
    const q = new URLSearchParams(location.search);
    const sceneId = param(q, 'scene');
    const variantId = param(q, 'variant');
    const engine = param(q, 'engine') as EngineId;
    const warmupMs = Number(param(q, 'warmup', '3000'));
    const windowMs = Number(param(q, 'window', '10000'));
    const timeoutMs = Number(param(q, 'timeout', '60000'));
    const profiling = param(q, 'profiling', '1') !== '0';

    if (!('gpu' in navigator)) {
        publish({ status: 'failed', reason: 'WebGPU indisponível neste navegador' });
        return;
    }
    const env = await environment();
    const scene = findScene(sceneId);
    const variant = scene?.variants.find((v) => v.id === variantId);
    if (scene === undefined || variant === undefined) {
        publish({
            status: 'failed',
            reason: `cena/variante desconhecida: ${sceneId}/${variantId}`,
            environment: env,
        });
        return;
    }
    const loader = scene.implementations[engine];
    if (isUnsupported(loader)) {
        publish({
            status: 'failed',
            reason: `não suportado: ${loader.unsupported}`,
            environment: env,
        });
        return;
    }
    const seed = Number(param(q, 'seed', String(scene.seed)));
    const canvas = document.getElementById('bench-canvas') as HTMLCanvasElement;
    const adapter = await loadAdapter(engine, profiling);
    const impl = await loader();
    const handle = await adapter.init(canvas, RESOLUTION, scene.camera);
    await impl.setup({ engine: handle, variant, rng: mulberry32(seed), camera: scene.camera });

    const sampler = new FrameSampler({
        warmupMs,
        windowMs,
        timeoutMs: Math.max(0, timeoutMs - (performance.now() - startedAt)),
        now: () => performance.now(),
    });
    sampler.start();
    for (;;) {
        await nextFrame();
        const phase = sampler.record(adapter.frame(handle, impl, DT));
        if (phase === 'timeout') {
            publish({
                status: 'timeout',
                reason: `excedeu ${timeoutMs} ms`,
                environment: env,
                limitations: [...(adapter.limitations ?? []), ...(impl.limitations ?? [])],
            });
            return;
        }
        if (phase === 'done') break;
    }
    // A leitura de GPU dos últimos quadros chega depois deles: espera um pouco por ela.
    if (adapter.gpuReading !== undefined) {
        const until = performance.now() + LATE_GPU_WAIT_MS;
        while (performance.now() < until && !sampler.lateGpuReading(adapter.gpuReading(handle))) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }
    const limitations = [...(adapter.limitations ?? []), ...(impl.limitations ?? [])];
    const w = sampler.result();
    publish({
        status: 'ok',
        environment: env,
        engineVersion: adapter.version,
        ...(limitations.length > 0 ? { limitations } : {}),
        samples: {
            ...w,
            memoryBytes: adapter.memoryBytes(handle),
            memoryKind: adapter.capabilities(handle).memory,
        },
    });
}

window.addEventListener('unhandledrejection', (e) => {
    if (window.__benchResult === undefined) publish({ status: 'failed', reason: String(e.reason) });
});
window.addEventListener('error', (e) => {
    if (window.__benchResult === undefined) publish({ status: 'failed', reason: e.message });
});

run().catch((e: unknown) => {
    const reason = e instanceof Error ? e.message : String(e);
    if (window.__benchResult === undefined) publish({ status: 'failed', reason });
});
