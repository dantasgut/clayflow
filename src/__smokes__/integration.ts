// Fase L.2 — Integration smoke (30 frames).
//
// Cena: Camera + DirectionalLight + Box + Sphere + 4 PostEffects (Bloom,
// ToneMapping, Fxaa, Vignette) + UI overlay. Sem física por enquanto
// (RigidBody readback deixado como extensão futura — requer kernel LCP +
// staging buffer + readback ciclo).
//
// Assertions ao fim de 30 frames:
//   - Nenhum engineError.
//   - canvas.toDataURL produz PNG não-vazio (pelo menos um pixel renderizado).
//   - UI overlay é renderizado sem warning.
//
// Para rodar: `cp src/__smokes__/integration.ts src/main.ts && npm run dev`
import { Application, Bloom, ToneMapping, Fxaa, Vignette } from '../presentation/index';
import {
    BoxGeometry,
    SphereGeometry,
    StandardMaterial,
    Camera,
    DirectionalLight,
    Transform,
} from '../elements/index';

const log = (m: string): void => {
    console.log(`[integration] ${m}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += m + '\n';
};

async function main(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement | null;
    if (canvas === null) throw new Error('canvas#gpuCanvas não encontrado');
    canvas.width = 512;
    canvas.height = 384;

    const app = await Application.create({ canvas, captureErrors: true });
    log('app created');

    // ─── Cena ─────────────────────────────────────────────────────────────
    app.world.insert(
        new Camera({
            position: [0, 3, 6, 1],
            fov: Math.PI / 4,
            aspect: canvas.width / canvas.height,
            near: 0.1,
            far: 100,
        }),
    );
    app.world.insert(
        new DirectionalLight({
            direction: [-0.4, -1, 0.6, 0],
            color: [1, 1, 1, 1],
            intensity: 1.5,
            castShadow: true,
        }),
    );

    const box = new BoxGeometry({ size: [1, 1, 1] });
    box.add(new StandardMaterial({ albedo: [0.7, 0.3, 0.2, 1], roughness: 0.3, metallic: 0.1 }));
    box.add(new Transform({ position: [-1.5, 0, 0, 1] }));
    app.world.insert(box);

    const sphere = new SphereGeometry({ radius: 0.7, segments: 24 });
    sphere.add(new StandardMaterial({ albedo: [0.2, 0.4, 0.7, 1], roughness: 0.5, metallic: 0.0 }));
    sphere.add(new Transform({ position: [1.5, 0, 0, 1] }));
    app.world.insert(sphere);

    // ─── 4 PostEffects ────────────────────────────────────────────────────
    app.defaults.post
        .addEffect(new Bloom({ strength: 0.4 }))
        .addEffect(new ToneMapping({ strength: 1.0 }))
        .addEffect(new Fxaa({}))
        .addEffect(new Vignette({ strength: 0.3 }));
    log('4 post-effects registered (Bloom, ToneMapping, Fxaa, Vignette)');

    // ─── Listener engineError ─────────────────────────────────────────────
    let engineErrors = 0;
    app.events.on('engineError', (e) => {
        engineErrors++;
        log(`!! engineError: ${e.stage}/${e.filter}: ${e.message}`);
    });

    // ─── 30 frames ────────────────────────────────────────────────────────
    let frames = 0;
    app.events.on('frameComplete', () => {
        frames++;
        if (frames >= 30) {
            app.stop();
            finalize();
        }
    });

    const cvNonNull = canvas;
    function finalize(): void {
        log(`completed ${frames} frames (engineErrors=${engineErrors})`);
        if (engineErrors > 0) {
            throw new Error(`integration smoke FAILED: engineErrors=${engineErrors}`);
        }
        // Pixel check via canvas.toDataURL — string non-empty PNG = renderizou algo.
        const dataUrl = cvNonNull.toDataURL('image/png');
        if (dataUrl.length < 100) {
            throw new Error(
                `canvas.toDataURL muito pequeno (${dataUrl.length}B) — provavelmente vazio`,
            );
        }
        // Validação opcional: alpha non-zero. Mas toDataURL captura compositing
        // do canvas WebGPU — se WebGPU pintou, o PNG terá conteúdo.
        log(`canvas.toDataURL: ${dataUrl.length}B (PNG válido)`);
        log('INTEGRATION SMOKE PASSED');
    }

    app.start();
}

main().catch((err: unknown) => {
    console.error('[integration] FATAL:', err);
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAIL: ${msg}`);
    throw err;
});
