// Medição de tempo nos smokes (spec 034, H1, T009): o tempo de GPU por quadro contado uma vez por quadro medido
// (`gpuFrame`), depois do aquecimento, e o tempo por quadro por repetição no relógio de parede com cerca — o mesmo
// em todo backend (Metal, D3D12, Vulkan); sem `timestamp-query`, só o relógio de parede mede.
import type { Application, StagingBufferSpec } from 'clayflow';
import { settle } from './extensionScenes';
import { GpuFrameSamples } from './gpuSamples';

export { GpuFrameSamples, median } from './gpuSamples';

/** Coletor ligado ao `frameComplete` do app; `off()` desliga. */
export function collectGpuFrames(app: Application): GpuFrameSamples & { off: () => void } {
    const samples = new GpuFrameSamples();
    const off = app.events.on('frameComplete', (e) => {
        samples.add(e.stats);
    });
    return Object.assign(samples, { off });
}

/** Quadros já gravados pelo app (o índice do próximo `gpuFrame` medido é maior). */
function recordedFrames(app: Application): number {
    return (app.core as unknown as { frameIndex: number }).frameIndex;
}

/**
 * Aquecimento: espera nenhuma compilação pendente por `quietMs` (fila interna do núcleo, só no teste) e roda
 * `frames` quadros, para medir com os pipelines prontos e a GPU em regime (o clock sobe com a carga em qualquer GPU).
 */
export async function warmUp(
    app: Application,
    options: {
        readonly quietMs?: number;
        readonly limitMs?: number;
        readonly frames?: number;
    } = {},
): Promise<void> {
    const quietMs = options.quietMs ?? 2000;
    const pending = (): number =>
        (app.core as unknown as { pendingPipelines: Map<string, unknown> }).pendingPipelines.size;
    let quiet = performance.now();
    for (
        const limit = performance.now() + (options.limitMs ?? 60000);
        performance.now() < limit;
    ) {
        await settle(app, 100);
        if (pending() > 0) quiet = performance.now();
        else if (performance.now() - quiet > quietMs) break;
    }
    for (let i = 0; i < (options.frames ?? 30); i++) {
        await untilReady(app);
        app.step(1 / 60);
        await new Promise((r) => requestAnimationFrame(r));
    }
}

/**
 * Espera a GPU ter espaço para mais um quadro (o limite de quadros em voo, como o laço e o bench): `app.step` não
 * espera, e gravar a cada quadro de tela com a GPU mais lenta acumula trabalho sem fim — as leituras de tempo chegam
 * cada vez mais tarde e o anel de leitura fica sempre ocupado.
 */
export async function untilReady(app: Application): Promise<void> {
    if (app.readyForFrame()) return;
    await new Promise<void>((resolve) => {
        const off = app.events.on('frameRetired', () => {
            if (!app.readyForFrame()) return;
            off();
            resolve();
        });
    });
}

/**
 * Tempo de GPU por quadro: aquece, roda `frames` quadros — cada um quando a GPU tem espaço para ele, no ritmo da tela —
 * e devolve as leituras distintas desses quadros (vazio sem `timestamp-query`).
 */
export async function gpuFrameTimes(
    app: Application,
    frames: number,
    step: () => void = () => {
        app.step(1 / 60);
    },
): Promise<GpuFrameSamples> {
    await warmUp(app);
    const samples = collectGpuFrames(app);
    samples.restartAfter(recordedFrames(app));
    for (let i = 0; i < frames; i++) {
        await untilReady(app);
        step();
        await new Promise((r) => requestAnimationFrame(r));
    }
    // As leituras dos últimos quadros chegam depois: alguns quadros a mais só para recebê-las.
    for (let i = 0; i < 8; i++) {
        app.step(0);
        await new Promise((r) => requestAnimationFrame(r));
    }
    samples.off();
    return samples;
}

/** Espera o trabalho já enviado à GPU terminar: uma cópia de 16 bytes da cor do quadro e a leitura dela. */
export async function fence(app: Application): Promise<void> {
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: 'timing_fence',
        byteSize: 16,
    });
    const texture = app.resources.textureOf(app.defaults.targets, 'color')!;
    app.core.record('timing-fence', (frame) => {
        frame.copyTextureToBuffer(texture, staging, { bytesPerRow: 256, rowsPerImage: 1 }, [1, 1]);
    });
    app.core.submit();
    await app.core.readback(staging);
    app.core.destroy(staging);
}

/** Tempo de parede por quadro (ms) de `n` quadros seguidos, entre duas cercas, depois de `warm` quadros. */
export async function wallPerFrame(app: Application, n: number, warm = 10): Promise<number> {
    for (let i = 0; i < warm; i++) app.step(1 / 60);
    await fence(app);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) app.step(1 / 60);
    await fence(app);
    return (performance.now() - t0) / n;
}

/** Repete o `dispatch` de um estágio `times()` vezes por quadro (só no teste); devolve a função que restaura. */
export function repeatDispatch(flow: { prototype: unknown }, times: () => number): () => void {
    const proto = flow.prototype as { dispatch: (...args: unknown[]) => void };
    const original = proto.dispatch;
    proto.dispatch = function (this: unknown, ...args: unknown[]): void {
        for (let k = 0; k < times(); k++) original.apply(this, args);
    };
    return () => {
        proto.dispatch = original;
    };
}
