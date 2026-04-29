// Fase E smoke — Profiler + createAsync + DebugFlow.
// E.1 valida que GpuProfilerSystem.isSupported reflete a feature do device,
//     que aloca buffers quando suportado, e que readRange retorna BigInt64Array.
// E.2 valida que core.createAsync devolve uma compute pipeline funcional
//     que pode ser dispatched ao igual a uma pipeline sync.
// E.3 valida que DebugFlow emite `profilerStats` ao receber frameTicks.
import { Application } from './presentation/index';
import type {
    BindGroupSpec, ComputePipelineSpec, LayoutSpec, ShaderModuleSpec,
    StorageBufferSpec, StagingBufferSpec,
} from './core/contracts/index';

const log = (m: string) => {
    console.log(`[fase-e] ${m}`);
    const el = document.getElementById('log');
    if (el) el.textContent += m + '\n';
};
const fail = (m: string) => {
    console.error(`[fase-e] FAIL: ${m}`);
    const el = document.getElementById('log');
    if (el) el.textContent += `FAIL: ${m}\n`;
    throw new Error(m);
};

async function main(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
    canvas.width = 800; canvas.height = 600;
    const app = await Application.create({ canvas });
    log('app created');

    // ─── E.1: GpuProfilerSystem real ────────────────────────────────────────
    const profiler = app.core.profiler;
    log(`profiler.isSupported = ${profiler.isSupported}`);
    // Mesmo sem suporte, readRange deve retornar BigInt64Array (zeros).
    const noSupportRead = await profiler.readRange(0, 4);
    if (!(noSupportRead instanceof BigInt64Array)) fail('readRange não retornou BigInt64Array');
    if (profiler.isSupported) {
        const tw = profiler.timestampWritesFor(0, 1);
        if (tw === undefined) {
            fail('timestampWritesFor retornou undefined com suporte ativo');
            return;
        }
        if (tw.beginningOfPassWriteIndex !== 0 || tw.endOfPassWriteIndex !== 1) {
            fail(`tw indices incorretos: ${tw.beginningOfPassWriteIndex}/${tw.endOfPassWriteIndex}`);
        }
        log('profiler API OK (timestamp-query suportado, writes config válida)');
    } else {
        if (profiler.timestampWritesFor(0, 1) !== undefined) {
            fail('timestampWritesFor deveria ser undefined sem suporte');
        }
        log('profiler API OK (sem suporte → returns undefined, readRange retorna zeros)');
    }

    // ─── E.2: createAsync end-to-end ────────────────────────────────────────
    // Cria layout + buffer, compila pipeline async, dispatcha, faz readback.
    const N = 64;
    const buf = app.core.create<StorageBufferSpec>({
        kind: 'buffer', subkind: 'storage',
        discriminator: 'fase_e_async_buf',
        byteSize: N * 4,
    });
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer', subkind: 'staging',
        discriminator: 'fase_e_async_staging',
        byteSize: N * 4,
    });
    const layout = app.core.create<LayoutSpec>({
        kind: 'layout', discriminator: 'fase_e_async_layout',
        entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'storage' }],
    });
    const shader = app.core.create<ShaderModuleSpec>({
        kind: 'shader', discriminator: 'fase_e_async_shader',
        source: `
@group(0) @binding(0) var<storage, read_write> data: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    if (gid.x >= ${N}u) { return; }
    data[gid.x] = gid.x * 2u;
}`,
    });
    // createAsync: pipeline retorna apenas após shader linkado.
    const pipeline = await app.core.createAsync<ComputePipelineSpec>({
        kind: 'pipeline', subkind: 'compute',
        discriminator: 'fase_e_async_pipeline',
        layouts: [layout], shader, entryPoint: 'main',
    });
    log('createAsync OK (compute pipeline compiled async)');

    const bg = app.core.create<BindGroupSpec>({
        kind: 'bindgroup', discriminator: 'fase_e_async_bg',
        layout, bindings: [{ binding: 0, kind: 'buffer', buffer: buf }],
    });
    let validationErr: string | null = null;
    await app.core.withErrorScope('validation', async () => {
        app.core.record(frame => {
            frame.compute('FaseE.dispatch', pass => {
                pass.bind.setPipeline(pipeline).setBindGroup(0, bg);
                pass.dispatch.workgroups(1);
            });
            frame.copy(buf, staging, N * 4);
        });
        app.core.submit();
    }).catch(e => { validationErr = String(e?.message ?? e); });
    if (validationErr !== null) fail(`createAsync dispatch: ${validationErr}`);

    const result = new Uint32Array(await app.core.readback(staging));
    for (let i = 0; i < N; i++) {
        if (result[i] !== i * 2) fail(`pipeline async output[${i}]=${result[i]} esperado=${i*2}`);
    }
    log('createAsync pipeline produces expected output (data[i] = i*2)');

    // ─── E.3: DebugFlow profilerStats ───────────────────────────────────────
    let statsCount = 0;
    let lastStats: { fps: number, frameTimeMs: number, avgFrameTimeMs: number } | null = null;
    app.events.on('profilerStats', e => {
        statsCount++;
        lastStats = e;
    });
    app.defaults.debug.setEnabled(true);
    // Dispara ticks com elapsed crescente para destravar throttle (250ms).
    for (let i = 0; i < 30; i++) {
        app.events.emit('frameTick', { dt: 1/60, elapsed: i * 0.05 });
    }
    if (statsCount === 0) fail('DebugFlow não emitiu profilerStats em 30 ticks com debug enabled');
    if (lastStats === null) fail('lastStats vazio');
    if (lastStats!.fps <= 0) fail(`fps inválido: ${lastStats!.fps}`);
    if (lastStats!.frameTimeMs <= 0) fail(`frameTimeMs inválido: ${lastStats!.frameTimeMs}`);
    log(`profilerStats OK (${statsCount} eventos, último fps=${lastStats!.fps.toFixed(1)}, ` +
        `frame=${lastStats!.frameTimeMs.toFixed(2)}ms, avg=${lastStats!.avgFrameTimeMs.toFixed(2)}ms)`);

    // Verifica que disable freia emissão.
    app.defaults.debug.setEnabled(false);
    const before = statsCount;
    for (let i = 30; i < 60; i++) {
        app.events.emit('frameTick', { dt: 1/60, elapsed: i * 0.05 });
    }
    if (statsCount !== before) fail(`stats continuou sendo emitido após disable (count: ${before} → ${statsCount})`);
    log('DebugFlow.setEnabled(false) silencia emissão');

    log('FASE E SMOKE PASSED');
}

main().catch(err => fail(String(err?.message ?? err)));
