// Spec 004 — Smoke de churn (sessões longas sem acúmulo).
//
// Valida na GPU real (SC-006): 100 ciclos de inserir 1 000 objetos desenhados (geometria + material + transform,
// com câmera e luz com sombra), desenhar, remover e avançar. A memória de GPU informada pelo motor
// (`core.memoryUsage().totalBytes`) volta ao valor de referência (±1%) e a contagem de ouvintes do EventBus fica
// estável.
//
// Referência de memória: medida depois do primeiro ciclo — os pools da C2 mantêm a capacidade que atingiram (não
// encolhem por projeto), então o regime estável é o do primeiro ciclo completo.
//
// Para rodar: `npm run smoke -- churn` (servidor do bench). Resultado: `CHURN SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    BoxGeometry,
    Camera,
    DirectionalLight,
    SphereGeometry,
    StandardMaterial,
    Transform,
} from 'clayflow';
import type { Entity } from 'clayflow';

const CYCLES = 100;
const OBJECTS = 1000;

const log = (m: string): void => {
    console.log(`[churn] ${m}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += m + '\n';
};

async function main(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement | null;
    if (canvas === null) throw new Error('canvas#gpuCanvas não encontrado');
    canvas.width = 320;
    canvas.height = 180;
    const app = await Application.create({ canvas, captureErrors: true, autoResize: false });
    let engineErrors = 0;
    app.events.on('engineError', (e) => {
        engineErrors++;
        if (engineErrors <= 3) log(`!! engineError: ${e.stage}/${e.filter}: ${e.message}`);
    });
    app.world.insert(new Camera().add(new Transform()));
    app.world.insert(new DirectionalLight({ direction: [-0.3, -1, -0.5, 0], castShadow: true }));

    const cycle = (c: number): void => {
        const roots: Entity<object>[] = [];
        for (let i = 0; i < OBJECTS; i++) {
            const geometry =
                i % 2 === 0
                    ? new BoxGeometry({ size: [0.2, 0.2, 0.2] })
                    : new SphereGeometry({ radius: 0.1 });
            const root = geometry
                .add(new StandardMaterial({ albedo: [(i % 7) / 7, (c % 5) / 5, 0.5, 1] }))
                .add(new Transform({ position: [(i % 40) - 20, Math.floor(i / 40) - 12, -30, 1] }));
            app.world.insert(root);
            roots.push(root);
        }
        app.step(1 / 60, 2); // desenha: estágios criam objetos por entidade
        for (const root of roots) app.world.remove(root);
        app.step(1 / 60); // quadro sem os objetos
    };

    cycle(0);
    const referenceBytes = app.core.memoryUsage().totalBytes;
    const referenceListeners = app.events.listenerCount();
    log(
        `referência após o 1º ciclo: ${(referenceBytes / 1048576).toFixed(2)} MiB, ${referenceListeners} ouvintes`,
    );

    const started = performance.now();
    for (let c = 1; c < CYCLES; c++) {
        cycle(c);
        if (c % 25 === 0) {
            log(
                `ciclo ${c}: ${(app.core.memoryUsage().totalBytes / 1048576).toFixed(2)} MiB, `
                    + `${app.events.listenerCount()} ouvintes`,
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    const finalBytes = app.core.memoryUsage().totalBytes;
    const finalListeners = app.events.listenerCount();
    const drift = Math.abs(finalBytes - referenceBytes) / Math.max(1, referenceBytes);
    log(
        `final após ${CYCLES} ciclos × ${OBJECTS} objetos (${((performance.now() - started) / 1000).toFixed(1)} s): `
            + `${(finalBytes / 1048576).toFixed(2)} MiB (variação ${(drift * 100).toFixed(3)}%), `
            + `${finalListeners} ouvintes`,
    );

    const failures: string[] = [];
    if (drift > 0.01) failures.push(`memória variou ${(drift * 100).toFixed(2)}% (> 1%)`);
    if (finalListeners !== referenceListeners) {
        failures.push(`ouvintes ${referenceListeners} → ${finalListeners}`);
    }
    if (engineErrors > 0) failures.push(`engineErrors=${engineErrors}`);
    app.dispose();
    if (failures.length > 0) {
        for (const f of failures) log(`  ✗ ${f}`);
        throw new Error(`${failures.length} verificações falharam`);
    }
    log('CHURN SMOKE PASSED');
}

main().catch((err: unknown) => {
    console.error('[churn] FATAL:', err);
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAIL: ${msg}`);
});
