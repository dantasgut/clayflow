// Fase I.1 — Stress smoke 60s combinando flows.
//
// Cenário: Application com defaults (Forward + Shadow + Post + UI + Debug)
// + 8 PostEffects + cubo + luz direcional. Ativa captureErrors e memoryBudgetMB.
// Loop a 60 fps real-time por 60s; cada 600 frames captura memoryUsage().
// Assertion: total alocado em frame 3600 ≤ 1.1× total em frame 600.
//
// Para rodar: `cp src/__smokes__/stress60s.ts src/main.ts && npm run dev`
// Aguarde 60s; o relatório final aparece no console + DOM #log.
import {
    Application,
    Bloom,
    Blur,
    ToneMapping,
    Fxaa,
    Ssao,
    Vignette,
    ChromaticAberration,
    ColorGrading,
} from '../presentation/index';
import {
    BoxGeometry,
    StandardMaterial,
    Camera,
    DirectionalLight,
    Transform,
} from '../elements/index';

const log = (m: string): void => {
    console.log(`[stress] ${m}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += m + '\n';
};
const fail = (m: string): never => {
    console.error(`[stress] FAIL: ${m}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `FAIL: ${m}\n`;
    throw new Error(m);
};

async function main(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement | null;
    if (canvas === null) throw new Error('canvas#gpuCanvas não encontrado');
    canvas.width = 800;
    canvas.height = 600;
    const app = await Application.create({
        canvas,
        captureErrors: true,
        memoryBudgetMB: 256,
    });
    log('app created (captureErrors=on, budget=256MB)');

    // ─── Cena: camera + luz + cubo ─────────────────────────────────────────
    const camera = new Camera({
        position: [0, 4, 8, 1],
        fov: Math.PI / 4,
        aspect: 800 / 600,
        near: 0.1,
        far: 100,
    });
    app.world.insert(camera);

    const light = new DirectionalLight({
        direction: [-0.4, -1, 0.6, 0],
        color: [1, 1, 1, 1],
        intensity: 1.5,
        castShadow: true,
    });
    app.world.insert(light);

    const box = new BoxGeometry({ size: [2, 2, 2] });
    box.add(
        new StandardMaterial({
            albedo: [0.6, 0.4, 0.2, 1],
            roughness: 0.4,
            metallic: 0.1,
        }),
    );
    box.add(
        new Transform({
            position: [0, 0, 0, 1],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1, 1],
        }),
    );
    app.world.insert(box);

    log('scene: camera + directional light + box+material+transform');

    // ─── 8 PostEffects ─────────────────────────────────────────────────────
    app.defaults.post
        .addEffect(new Ssao({ strength: 0.6 }))
        .addEffect(new Bloom({ strength: 0.5 }))
        .addEffect(new Blur({ strength: 0.2 }))
        .addEffect(new ChromaticAberration({ strength: 0.003 }))
        .addEffect(new ColorGrading({ strength: 1.05 }))
        .addEffect(new ToneMapping({ strength: 1.0 }))
        .addEffect(new Fxaa({}))
        .addEffect(new Vignette({ strength: 0.4 }));
    log('post: 8 effects registered');

    // ─── Engine error / device-lost / memory listeners ─────────────────────
    let engineErrors = 0;
    let memoryWarnings = 0;
    app.events.on('engineError', (e) => {
        engineErrors++;
        log(`!! engineError [${e.stage}/${e.filter}]: ${e.message}`);
    });
    app.events.on('memoryWarning', (e) => {
        memoryWarnings++;
        log(
            `!! memoryWarning total=${(e.totalBytes / 1024 / 1024).toFixed(1)}MB`
                + ` budget=${(e.budgetBytes / 1024 / 1024).toFixed(1)}MB`,
        );
    });

    // ─── Loop 3600 frames @ 60fps ──────────────────────────────────────────
    const TARGET_FRAMES = 3600;
    const SAMPLE_EVERY = 600;
    const samples: { frame: number; bytes: number }[] = [];
    let frameCount = 0;
    const startWall = performance.now();

    app.events.on('frameComplete', () => {
        frameCount++;
        if (frameCount % SAMPLE_EVERY === 0) {
            const u = app.core.memoryUsage();
            samples.push({ frame: frameCount, bytes: u.totalBytes });
            log(`frame ${frameCount}: ${(u.totalBytes / 1024 / 1024).toFixed(2)}MB`);
        }
        if (frameCount >= TARGET_FRAMES) {
            app.stop();
            finalize();
        }
    });

    function finalize(): void {
        const elapsed = (performance.now() - startWall) / 1000;
        log(`elapsed: ${elapsed.toFixed(1)}s for ${frameCount} frames`);
        log(`engineErrors: ${engineErrors}, memoryWarnings: ${memoryWarnings}`);
        if (samples.length < 2) {
            throw new Error(`amostras insuficientes (${samples.length})`);
        }
        const first = samples[0];
        const last = samples[samples.length - 1];
        if (first === undefined || last === undefined) {
            throw new Error('sample first/last undefined');
        }
        const ratio = last.bytes / Math.max(first.bytes, 1);
        log(
            `memory growth: ${(first.bytes / 1024 / 1024).toFixed(2)}MB →`
                + ` ${(last.bytes / 1024 / 1024).toFixed(2)}MB (${ratio.toFixed(2)}×)`,
        );
        if (ratio > 1.1) {
            throw new Error(`memory growth ${ratio.toFixed(2)}× excede 1.1× threshold`);
        }
        if (engineErrors > 0) {
            throw new Error(`engineErrors=${engineErrors} (esperado 0 em cena estável)`);
        }
        log('STRESS SMOKE PASSED');
    }

    app.start();
}

main().catch((err: unknown) => {
    fail(err instanceof Error ? err.message : String(err));
});
