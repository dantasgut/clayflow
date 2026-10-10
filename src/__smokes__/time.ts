// Spec 004 — Smoke do tempo governando a simulação.
//
// Valida na GPU real:
//   (1) SC-003: 5 s simulados com passo fixo 1/60 terminam com as mesmas poses com quadros de 1/30, 1/60 e
//       1/144 s (diferença ≤ 1e-5 m entre quaisquer duas execuções);
//   (2) SC-005: `app.step` e o laço (`app.start`) com o mesmo tempo simulado produzem o mesmo estado;
//   (3) SC-004: com `time.scale = 0.25`, a simulação avança 25% (±1%) do tempo real do laço;
//   (4) `pausePhysics` congela as poses enquanto os quadros continuam (`frameComplete`).
//
// As poses são lidas direto do pool de corpos na GPU (`LCPSchema`), sem depender do readback assíncrono.
// Para rodar: `npm run smoke -- time` (servidor do bench). Resultado: `TIME SMOKE PASSED` ou `FAIL: …`.
import { Application, createScene, GravityField, RigidBody } from 'clayflow';
import type { StagingBufferSpec } from 'clayflow';

const BODY_STRIDE_F32 = 40;
const TOLERANCE_M = 1e-5;

function log(msg: string): void {
    console.log(`[time] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

/** Cena determinística: chão estático + pilha de esferas e caixas que colidem entre si e com o chão. */
async function createApp(): Promise<Application> {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
    });
    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    app.world.insert(
        new RigidBody({
            shape: 'box',
            mass: 0,
            halfExtents: [10, 0.5, 10],
            position: [0, -0.5, 0],
        }),
    );
    for (let i = 0; i < 12; i++) {
        const x = (i % 3) * 0.9 - 0.9;
        const z = Math.floor(i / 3) * 0.9 - 1.35;
        const y = 1 + (i % 4) * 0.7;
        app.world.insert(
            i % 2 === 0
                ? new RigidBody({ shape: 'sphere', radius: 0.3, mass: 1, position: [x, y, z] })
                : new RigidBody({
                      shape: 'box',
                      halfExtents: [0.25, 0.25, 0.25],
                      mass: 1,
                      position: [x, y, z],
                  }),
        );
    }
    return app;
}

/** Lê as posições de todos os corpos do pool de GPU. */
async function readPositions(app: Application): Promise<Float32Array> {
    const pool = app.resources.poolBufferSpec('LCPSchema');
    if (pool === undefined) throw new Error('pool LCPSchema inexistente');
    const count = app.resources.poolCount('LCPSchema');
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `time_smoke_staging_${app.time.frame}`,
        byteSize: pool.byteSize,
    });
    app.core.record('time-smoke-readback', (frame) => {
        frame.copy(pool, staging, pool.byteSize);
    });
    app.core.submit();
    const all = new Float32Array(await app.core.readback(staging));
    app.core.destroy(staging);
    const out = new Float32Array(count * 3);
    for (let slot = 0; slot < count; slot++) {
        out[slot * 3] = all[slot * BODY_STRIDE_F32]!;
        out[slot * 3 + 1] = all[slot * BODY_STRIDE_F32 + 1]!;
        out[slot * 3 + 2] = all[slot * BODY_STRIDE_F32 + 2]!;
    }
    return out;
}

function maxDiff(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return Infinity;
    let m = 0;
    for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
    return m;
}

/** Roda `seconds` simulados por `app.step` com quadros de `frameDt` e devolve as poses finais. */
async function simulateBySteps(frameDt: number, seconds: number): Promise<Float32Array> {
    const app = await createApp();
    app.step(frameDt, Math.round(seconds / frameDt));
    const poses = await readPositions(app);
    app.dispose();
    return poses;
}

/** Espera `ms` reais com o laço rodando. */
function waitReal(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
    const failures: string[] = [];

    // (1) SC-003 — mesma trajetória a 30, 60 e 144 Hz.
    const runs: [string, Float32Array][] = [];
    for (const [label, dt] of [
        ['30 Hz', 1 / 30],
        ['60 Hz', 1 / 60],
        ['144 Hz', 1 / 144],
    ] as const) {
        runs.push([label, await simulateBySteps(dt, 5)]);
    }
    const reference = runs[1]![1];
    const fallen = Array.from({ length: reference.length / 3 }, (_, i) => reference[i * 3 + 1]!);
    if (!fallen.slice(1).every((y) => y < 1)) {
        failures.push(
            `(1) os corpos não caíram: alturas ${fallen.map((y) => y.toFixed(2)).join(', ')}`,
        );
    }
    for (let i = 0; i < runs.length; i++) {
        for (let j = i + 1; j < runs.length; j++) {
            const d = maxDiff(runs[i]![1], runs[j]![1]);
            log(`(1) ${runs[i]![0]} × ${runs[j]![0]}: diferença máxima ${d.toExponential(2)} m`);
            if (!(d <= TOLERANCE_M)) failures.push(`(1) ${runs[i]![0]} × ${runs[j]![0]}: ${d} m`);
        }
    }

    // (2) SC-005 — laço × step com o mesmo número de passos de física.
    {
        const app = await createApp();
        let physicsSteps = 0;
        const target = 300;
        const reached = new Promise<void>((resolve) => {
            app.events.on('frameTick', () => {
                physicsSteps += app.time.steps;
                if (physicsSteps >= target && app.isRunning()) {
                    app.stop();
                    resolve();
                }
            });
        });
        app.start();
        await reached;
        const loopPoses = await readPositions(app);
        app.dispose();
        const stepPoses = await simulateBySteps(1 / 60, physicsSteps / 60);
        const d = maxDiff(loopPoses, stepPoses);
        log(
            `(2) laço (${physicsSteps} passos) × step(1/60, ${physicsSteps}): diferença ${d.toExponential(2)} m`,
        );
        if (!(d <= TOLERANCE_M)) failures.push(`(2) laço × step: ${d} m`);
    }

    // (3) SC-004 — escala 0,25 com laço por 2 s reais.
    {
        const app = await createApp();
        app.time.scale = 0.25;
        let real = 0;
        let simulated = 0;
        app.events.on('frameTick', (e) => {
            real += e.realDt;
            simulated += app.time.steps * app.time.stepDt;
        });
        app.start();
        await waitReal(2000);
        app.stop();
        simulated += app.time.accumulator;
        const ratio = simulated / real;
        log(
            `(3) escala 0,25: simulado ${simulated.toFixed(4)} s / real ${real.toFixed(4)} s = ${ratio.toFixed(4)}`,
        );
        if (!(Math.abs(ratio - 0.25) <= 0.0025))
            failures.push(`(3) razão ${ratio}, esperada 0,25 ± 1%`);
        app.dispose();
    }

    // (4) pausePhysics — poses congeladas, quadros continuam.
    {
        const app = await createApp();
        app.step(1 / 60, 30);
        const before = await readPositions(app);
        let frames = 0;
        app.events.on('frameComplete', () => {
            frames++;
        });
        app.time.pausePhysics();
        app.step(1 / 60, 60);
        const after = await readPositions(app);
        const d = maxDiff(before, after);
        log(`(4) física pausada: ${frames} quadros, deslocamento máximo ${d.toExponential(2)} m`);
        if (frames !== 60) failures.push(`(4) ${frames} quadros completos, esperados 60`);
        if (d !== 0) failures.push(`(4) corpos moveram ${d} m com a física pausada`);
        app.time.resumePhysics();
        app.step(1 / 60, 30);
        const resumed = await readPositions(app);
        if (!(maxDiff(after, resumed) > 0))
            failures.push('(4) a física não retomou após resumePhysics');
        app.dispose();
    }

    if (failures.length > 0) {
        for (const f of failures) log(`  ✗ ${f}`);
        throw new Error(`${failures.length} verificações falharam`);
    }
    log('TIME SMOKE PASSED');
}

main().catch((err: unknown) => {
    console.error('[time] FATAL:', err);
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAIL: ${msg}`);
});
