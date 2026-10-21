// Spec 007 — Escala de um milhão de entidades (US7, SC-003).
//
// Monta 1 000 000 de caixas idênticas, cada uma com material e `Transform` próprios (a cena `instances/1m` do
// benchmark), renderiza alguns quadros e mede: tempo de montagem, tempo até o primeiro quadro concluído na GPU, heap
// JS retido (`performance.memory` depois de `gc()`, quando o navegador expõe) e memória de GPU (`core.memoryUsage`). Critérios ao fim da 007:
// completa sem travar; heap ≤ 1,5 GB; memória de GPU = pools do estado de cena + uma cópia da geometria (sem objeto de
// GPU por entidade).
//
// Para rodar: `npm run smoke -- scale1m`. Resultado: `SCALE1M SMOKE PASSED` ou `FAIL`.
import {
    Application,
    BoxGeometry,
    Camera,
    createScene,
    StandardMaterial,
    Transform,
    type StagingBufferSpec,
} from 'clayflow';

/** Entidades (`--query count=N` para diagnóstico em escala menor; o critério vale para 1 milhão). */
const COUNT = Number(new URLSearchParams(location.search).get('count') ?? 1_000_000);
const HEAP_LIMIT_BYTES = 1.5 * 1024 ** 3;
/** Teto da memória de GPU além dos pools: 1 cópia da geometria, alvos de render e buffers dos estágios. */
const GPU_OVERHEAD_LIMIT_BYTES = 64 * 1024 ** 2;

function log(msg: string): void {
    console.log(`[scale1m] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const mib = (bytes: number): string => `${(bytes / 1048576).toFixed(1)} MiB`;

/** Heap JS retido: coleta o lixo antes (`gc()`, exposto pelo runner dos smokes) e lê o heap usado. */
function heapBytes(): number | undefined {
    const gc = (globalThis as { gc?: () => void }).gc;
    gc?.();
    gc?.();
    return (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize;
}

/** Espera a GPU concluir o que foi submetido (leitura de volta de 4 bytes). */
async function settle(app: Application): Promise<void> {
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: 'scale1m_settle',
        byteSize: 4,
    });
    await app.core.readback(staging);
}

async function main(): Promise<void> {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    document.body.appendChild(canvas);
    const app = await Application.create({
        // Antisserrilhado com que as medidas deste smoke foram calibradas (MSAA, o padrão antes da 034; o
        // temporal, padrão agora, tem o smoke `antialiasing`).
        antialias: 'msaa',
        canvas,
        scene: createScene(),
        autoResize: false,
    });
    app.world.insert(
        new Camera({ far: 1000 }).add(
            new Transform({
                position: [-20, 150, 250, 1],
                rotation: Transform.lookRotation([-20, 150, 250], [50, 50, 50]),
            }),
        ),
    );
    const side = Math.ceil(Math.cbrt(COUNT));
    const t0 = performance.now();
    for (let i = 0; i < COUNT; i++) {
        const box = new BoxGeometry({ size: [1, 1, 1] });
        box.add(new StandardMaterial({ albedo: [(i % side) / side, 0.5, 0.5, 1] }));
        box.add(
            new Transform({
                position: [i % side, Math.floor(i / side) % side, Math.floor(i / (side * side)), 1],
            }),
        );
        app.world.insert(box);
    }
    const assembled = performance.now() - t0;
    log(`montagem de ${COUNT} entidades: ${(assembled / 1000).toFixed(1)} s`);
    const assembledHeap = heapBytes();
    if (assembledHeap !== undefined) log(`heap JS após a montagem: ${mib(assembledHeap)}`);
    const t1 = performance.now();
    app.step(1 / 60);
    await settle(app);
    log(`primeiro quadro: ${((performance.now() - t1) / 1000).toFixed(2)} s`);
    const frames: number[] = [];
    for (let i = 0; i < 5; i++) {
        const t = performance.now();
        app.step(1 / 60);
        await settle(app);
        frames.push(performance.now() - t);
    }
    log(`quadros seguintes: ${frames.map((f) => f.toFixed(1)).join(', ')} ms`);
    const heap = heapBytes();
    const memory = app.core.memoryUsage(8);
    // Pools do estado de cena (com o das matrizes do quadro anterior, spec 034 — decisão do usuário, 2026-10-21).
    const pools = [
        'Transform',
        'WorldTransform',
        'PreviousWorldTransform',
        'StandardMaterial',
        'Renderable',
    ].reduce((sum, key) => sum + (app.resources.poolInfo(key)?.buffer.byteSize ?? 0), 0);
    log(`heap JS: ${heap === undefined ? 'n/d' : mib(heap)}`);
    log(
        `GPU: total ${mib(memory.totalBytes)}, pools de cena ${mib(pools)}, além dos pools ${mib(memory.totalBytes - pools)}`,
    );
    for (const t of memory.top) log(`  ${t.label ?? t.hash}: ${mib(t.bytes)}`);
    const failures: string[] = [];
    if (heap !== undefined && heap > HEAP_LIMIT_BYTES)
        failures.push(`heap JS ${mib(heap)} > 1,5 GB`);
    if (memory.totalBytes - pools > GPU_OVERHEAD_LIMIT_BYTES)
        failures.push(`memória de GPU além dos pools ${mib(memory.totalBytes - pools)} > 64 MiB`);
    app.dispose();
    if (failures.length > 0) {
        for (const f of failures) log(`  ✗ ${f}`);
        throw new Error(`${failures.length} verificações falharam`);
    }
    log('SCALE1M SMOKE PASSED');
}

main().catch((err: unknown) => {
    console.error('[scale1m] FATAL:', err);
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAIL: ${msg}`);
});
