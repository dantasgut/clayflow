// Spec 034 — Smoke da medição do tempo de GPU (US2, H1, SC-005).
//
// Uma cena de desenho pesado (20 mil esferas a 1280×720) com o estágio do desenho repetido R, 2R e 3R vezes por quadro
// (o `dispatch` envolvido só no teste):
//   - leituras: cada quadro medido entra uma vez (os `gpuFrame` dos `frameComplete` são distintos e crescentes) e quase
//     todos os quadros medidos têm leitura (o anel de stagings não pula quadros);
//   - linearidade: o tempo de GPU cresce em degraus iguais — (G₃ − G₂) e (G₂ − G₁) a ≤ 15 % um do outro, em vez de
//     patamares;
//   - concordância: o custo de uma repetição pelo tempo de GPU e pelo relógio de parede com cerca a ≤ 15 %.
// Mesmo código em todo backend; sem `timestamp-query`, só o relógio de parede é medido (as checagens de GPU são
// puladas com aviso).
// Para rodar: `npm run smoke -- gpuTiming`. Resultado: `GPUTIMING SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    Camera,
    createScene,
    DirectionalLight,
    ForwardFlow,
    SphereGeometry,
    StandardMaterial,
    Transform,
} from 'clayflow';
import {
    collectGpuFrames,
    median,
    repeatDispatch,
    wallPerFrame,
    warmUp,
} from './support/gpuTiming';

function log(msg: string): void {
    console.log(`[gpuTiming] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

const W = 1280;
const H = 720;
const R = 2;
const FRAMES = 90;

async function main(): Promise<void> {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        profiling: 'frame',
    });
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    app.world.insert(
        new Camera({ fov: Math.PI / 3, near: 0.1, far: 200 }).add(
            new Transform({ position: [0, 0, 60, 1] }),
        ),
    );
    app.world.insert(new DirectionalLight({ direction: [-0.3, -1, -0.5, 0], intensity: 3 }));
    for (let i = 0; i < 20000; i++) {
        app.world.insert(
            new SphereGeometry({ radius: 0.4, latSegments: 24, lonSegments: 48 })
                .add(new StandardMaterial({ albedo: [0.8, 0.6, 0.4, 1], roughness: 0.4 }))
                .add(
                    new Transform({
                        position: [
                            (i % 160) * 0.5 - 40,
                            Math.floor(i / 160) * 0.5 - 30,
                            -(i % 7),
                            1,
                        ],
                    }),
                ),
        );
    }
    let times = R;
    const restore = repeatDispatch(ForwardFlow, () => times);
    await warmUp(app);

    const gpu: number[] = [];
    const wall: number[] = [];
    let readingsOk = true;
    for (const k of [1, 2, 3]) {
        times = R * k;
        await warmUp(app, { quietMs: 0, frames: 20 });
        const samples = collectGpuFrames(app);
        const frames: number[] = [];
        const off = app.events.on('frameComplete', (e) => {
            if (e.stats.gpuFrame !== undefined) frames.push(e.stats.gpuFrame);
        });
        for (let i = 0; i < FRAMES; i++) {
            app.step(1 / 60);
            await new Promise((r) => requestAnimationFrame(r));
        }
        off();
        samples.off();
        const increasing = frames.every((f, i) => i === 0 || f > frames[i - 1]!);
        if (!increasing) readingsOk = false;
        gpu.push(samples.count > 0 ? median(samples.times) : NaN);
        wall.push(await wallPerFrame(app, 40));
        log(
            `desenho ${times}× por quadro: GPU ${gpu.at(-1)!.toFixed(2)} ms (${samples.count} leituras em ${FRAMES} quadros, ${increasing ? 'distintas e crescentes' : 'REPETIDAS'}), parede ${wall.at(-1)!.toFixed(2)} ms`,
        );
        if (samples.count > 0)
            check(
                samples.count >= FRAMES * 0.6,
                `leituras: só ${samples.count} de ${FRAMES} quadros medidos`,
            );
    }
    restore();
    app.dispose();
    canvas.remove();

    check(readingsOk, 'leituras: um gpuFrame repetido ou fora de ordem nos frameComplete');
    const wallStep = (wall[2]! - wall[0]!) / (2 * R);
    if (gpu.every((g) => Number.isFinite(g))) {
        const d1 = gpu[1]! - gpu[0]!;
        const d2 = gpu[2]! - gpu[1]!;
        const gpuStep = (gpu[2]! - gpu[0]!) / (2 * R);
        log(
            `degraus de GPU ${d1.toFixed(2)} e ${d2.toFixed(2)} ms; uma repetição: GPU ${gpuStep.toFixed(3)} ms, parede ${wallStep.toFixed(3)} ms`,
        );
        check(
            d1 > 0 && d2 > 0,
            `linearidade: degraus de GPU ${d1.toFixed(2)} / ${d2.toFixed(2)} ms`,
        );
        check(
            Math.abs(d2 - d1) <= 0.15 * Math.max(d1, d2),
            `linearidade: degraus de GPU diferem ${((100 * Math.abs(d2 - d1)) / Math.max(d1, d2)).toFixed(1)} % (≤ 15 %)`,
        );
        check(
            Math.abs(gpuStep - wallStep) <= 0.15 * Math.max(gpuStep, wallStep),
            `concordância: GPU ${gpuStep.toFixed(3)} ms × parede ${wallStep.toFixed(3)} ms por repetição (≤ 15 %)`,
        );
    } else {
        log(
            `sem timestamp-query neste dispositivo: só o relógio de parede (${wallStep.toFixed(3)} ms por repetição)`,
        );
    }
}

main()
    .then(() => {
        for (const e of engineErrors) failures.push(`engineError: ${e}`);
        if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
        else log('GPUTIMING SMOKE PASSED');
    })
    .catch((err: unknown) => {
        log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    });
