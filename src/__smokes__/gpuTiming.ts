// Spec 034 — Smoke da medida de GPU por quadro e das marcações por camada (US5; H1, SC-009, SC-009a).
//
//   - distinct: o cômodo com janela e a iluminação global, profiling por passe, 160 quadros com a CPU à frente: cada
//     leitura chega uma única vez (`gpuFrameTimed`, sem quadro repetido) e são ≥ 90 quadros distintos.
//   - scopes: na mesma medida, a soma dos tempos por Flow cobre ≥ 98 % do total do quadro (os passes fora dos grupos da
//     C2 ficam em `outros`), e as fases e os Flows esperados aparecem.
//   - off: sem profiling, nenhuma leitura chega e os passes do quadro são os mesmos (os grupos de depuração não abrem
//     passes).
// Para rodar: `npm run smoke -- gpuTiming`. Resultado: `GPUTIMING SMOKE PASSED` ou `FAIL: …`.
import { Application, createScene, GlobalIllumination, type GpuFrameTimedPayload } from 'clayflow';
import { buildGiScene, windowRoom } from './support/giScenes';

function log(msg: string): void {
    console.log(`[gpuTiming] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null)
        el.textContent += `${msg}
`;
}

const failures: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

const W = 1280;
const H = 720;

async function scene(profiling: boolean): Promise<{ app: Application; canvas: HTMLCanvasElement }> {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        ...(profiling ? { profiling: 'passes' as const } : {}),
    });
    const room = windowRoom();
    buildGiScene(app, room, W / H);
    app.world.insert(
        new GlobalIllumination({
            quality: 'medium',
            probeSpacing: room.probeSpacing ?? 0.3,
            center: room.probeCenter,
        }),
    );
    await app.whenReady({ timeoutMs: 60_000 });
    return { app, canvas };
}

async function run(app: Application, frames: number): Promise<number[]> {
    const passes: number[] = [];
    const off = app.events.on('frameComplete', (e) => passes.push(e.stats.passes));
    for (let i = 0; i < frames; i++) {
        app.step(1 / 60);
        await new Promise((r) => setTimeout(r, 4));
    }
    // As últimas leituras chegam depois do último quadro.
    for (let i = 0; i < 20; i++) {
        app.step(0);
        await new Promise((r) => setTimeout(r, 16));
    }
    off();
    return passes;
}

async function measured(): Promise<number[]> {
    const { app, canvas } = await scene(true);
    const timings: GpuFrameTimedPayload[] = [];
    const off = app.events.on('gpuFrameTimed', (e) => timings.push(e));
    const passes = await run(app, 160);
    off();
    app.dispose();
    canvas.remove();
    const frames = timings.map((t) => t.gpuFrame);
    const distinct = new Set(frames).size;
    log(
        `distinct: ${timings.length} leituras de ${distinct} quadros distintos em 160 (+20 vazios); mediana ${median(timings.map((t) => t.totalMs)).toFixed(3)} ms`,
    );
    check(distinct === timings.length, `distinct: ${timings.length - distinct} leituras repetidas`);
    check(distinct >= 90, `distinct: só ${distinct} quadros medidos (≥ 90)`);
    const coverage = timings.map((t) => {
        const flows = Object.values(t.flowsMs).reduce((a, b) => a + b, 0);
        return t.totalMs > 0 ? flows / t.totalMs : 1;
    });
    const worst = Math.min(...coverage);
    const last = timings.at(-1);
    const flowList = last === undefined ? '' : Object.keys(last.flowsMs).join(', ');
    log(
        `scopes: soma por Flow ≥ ${(worst * 100).toFixed(2)} % do total; fases ${last === undefined ? '-' : Object.keys(last.phasesMs).join(', ')}; Flows ${flowList}`,
    );
    check(
        worst >= 0.98,
        `scopes: os Flows cobrem só ${(worst * 100).toFixed(2)} % do quadro (≥ 98 %)`,
    );
    for (const flow of ['ForwardFlow', 'ProbeFlow', 'PostFlow'])
        check(last?.flowsMs[flow] !== undefined, `scopes: ${flow} sem tempo`);
    return passes;
}

async function unprofiled(): Promise<number[]> {
    const { app, canvas } = await scene(false);
    let readings = 0;
    const off = app.events.on('gpuFrameTimed', () => readings++);
    const passes = await run(app, 60);
    off();
    app.dispose();
    canvas.remove();
    log(`off: ${readings} leituras sem profiling`);
    check(readings === 0, `off: ${readings} leituras sem profiling`);
    return passes;
}

function median(v: readonly number[]): number {
    const s = [...v].sort((a, b) => a - b);
    return s[s.length >> 1] ?? 0;
}

async function main(): Promise<void> {
    const on = await measured();
    const off = await unprofiled();
    const steady = (p: number[]): number => median(p.slice(20, 60));
    log(`off: passes por quadro ${steady(off)} sem profiling, ${steady(on)} com`);
    check(steady(off) === steady(on), 'off: o número de passes mudou com o profiling');
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('GPUTIMING SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
