// Spec 034 — Smoke da prontidão do motor (US4; SC-008).
//
//   - lateFog: o cômodo de paredes pretas com o sol pela janela; a névoa entra com a cena já rodando. A luz do feixe
//     (média por região numa grade 8 × 5) lida logo depois de `whenReady` e mais 60 quadros é igual (≤ 0,5 %) à lida com
//     3 s a mais de espera antes — quem espera a prontidão mede a cena completa.
//   - slowCompile: a barragem de água com partículas secundárias, duas vezes: normal e com cada compilação atrasada
//     1,5 s à força. Depois de `whenReady`, 150 passos de 1/60 s: as posições da água e das partículas secundárias são
//     idênticas bit a bit — a simulação depende só dos passos dados, nunca da velocidade de compilação.
//   - timeout: um pipeline que nunca compila (a compilação presa à força): `whenReady({ timeoutMs })` rejeita no
//     prazo, nomeando o Flow, o pipeline e o motivo, sem travar a página.
// Para rodar: `npm run smoke -- readiness [--query case=lateFog]`. Resultado: `READINESS SMOKE PASSED` ou `FAIL: …`.
import * as clayflow from 'clayflow';
import { FogVolume, type Application } from 'clayflow';
import { readBuffer } from './support/extensionScenes';
import { buildGiScene, giApp, windowRoom, type GiScene, type Vec3 } from './support/giScenes';
import { hdrLuminance, readHdrTexture, type HdrImage } from './support/imageMeasures';
import { insertValley, LAKE_VALLEY, readPositions } from './support/surfaceScenes';

function log(msg: string): void {
    console.log(`[readiness] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null)
        el.textContent += `${msg}
`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

const W = 480;
const H = 300;

async function readColor(app: Application): Promise<HdrImage> {
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    return readHdrTexture(app, texture);
}

/** Médias de luminância numa grade 8 × 5 da imagem. */
function cells(img: HdrImage): number[] {
    const out: number[] = [];
    for (let wy = 0; wy < 5; wy++)
        for (let wx = 0; wx < 8; wx++) {
            let s = 0;
            let n = 0;
            for (let y = Math.floor((wy * H) / 5); y < Math.floor(((wy + 1) * H) / 5); y++)
                for (let x = Math.floor((wx * W) / 8); x < Math.floor(((wx + 1) * W) / 8); x++) {
                    s += hdrLuminance(img, x, y);
                    n++;
                }
            out.push(s / n);
        }
    return out;
}

/** O cômodo da janela com as paredes pretas: só a névoa espalha a luz do sol. */
function blackRoom(): GiScene {
    const room = windowRoom();
    return {
        ...room,
        sky: false,
        slabs: room.slabs.map((s) => ({ ...s, color: [0, 0, 0] as Vec3 })),
    };
}

/** A cena roda, a névoa entra, espera a prontidão (e, se pedido, mais `extraMs`), 60 quadros, lê a imagem. */
async function fogAfterInsert(extraMs: number): Promise<HdrImage> {
    const { app, canvas } = await giApp(W, H, engineErrors);
    app.world.remove(app.defaults.ambient);
    buildGiScene(app, blackRoom(), W / H);
    await app.whenReady();
    app.step(1 / 60, 30);
    app.world.insert(
        new FogVolume({
            shape: { box: [4, 2.5, 4] },
            center: [0, 1.25, 0],
            density: 0.15,
            albedo: [0.9, 0.9, 0.9],
            anisotropy: 0.3,
        }),
    );
    await app.whenReady();
    if (extraMs > 0) {
        const end = performance.now() + extraMs;
        while (performance.now() < end) {
            app.step(0);
            await new Promise((r) => setTimeout(r, 16));
        }
        await app.whenReady();
    }
    app.step(1 / 60, 60);
    const img = await readColor(app);
    app.dispose();
    canvas.remove();
    return img;
}

async function lateFog(): Promise<void> {
    const quick = cells(await fogAfterInsert(0));
    const slow = cells(await fogAfterInsert(3000));
    const peak = Math.max(...slow);
    const lit = slow.map((v, i) => [v, quick[i]!] as const).filter(([v]) => v >= 0.25 * peak);
    const worst = Math.max(...lit.map(([s, q]) => Math.abs(q / s - 1)));
    log(
        `lateFog: ${lit.length} regiões do feixe — logo após whenReady contra 3 s a mais: pior ${(worst * 100).toFixed(2)} %`,
    );
    check(lit.length >= 3, 'lateFog: o feixe não aparece');
    check(
        worst <= 0.005,
        `lateFog: medida logo após a prontidão a ${(worst * 100).toFixed(2)} % (≤ 0,5 %)`,
    );
}

/** Atrasa em `ms` cada compilação e cada conferência de shader feitas em segundo plano (a página continua respondendo). */
function delayCompilation(app: Application, ms: number): void {
    const core = app.core as unknown as Record<
        'createAsync' | 'shaderMessages',
        (spec: unknown) => Promise<unknown>
    >;
    for (const name of ['createAsync', 'shaderMessages'] as const) {
        const original = core[name].bind(core);
        core[name] = (spec: unknown) =>
            new Promise((resolve, reject) => {
                setTimeout(() => {
                    original(spec).then(resolve, reject);
                }, ms);
            });
    }
}

/** Hash FNV-1a dos bytes. */
function fnv(bytes: Uint8Array, h = 0x811c9dc5): number {
    for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    return h;
}

/**
 * A barragem do lago (PBF, 6 144 partículas) sobre o vale colidível por função (`SurfaceCollider`, conferido pelo
 * compilador em segundo plano) com partículas secundárias: o hash das posições da água e das secundárias após 150
 * passos de 1/60 s.
 */
async function damHash(delayMs: number): Promise<{ hash: number; frames: number; alive: number }> {
    const { app, canvas } = await giApp(W, H, engineErrors);
    if (delayMs > 0) delayCompilation(app, delayMs);
    const eye: Vec3 = [0, 1.4, 1.6];
    app.world.insert(
        new clayflow.Camera({ fov: Math.PI / 4, aspect: W / H, aspectMode: 'fixed' }).add(
            new clayflow.Transform({
                position: [...eye, 1],
                rotation: clayflow.Transform.lookRotation(eye, [0, -0.1, 0]),
            }),
        ),
    );
    app.world.insert(new clayflow.GravityField({ acceleration: [0, -9.81, 0, 0] }));
    app.world.insert(
        new clayflow.ParticleMaterial({
            ...clayflow.ParticleMaterial.WATER,
            particleSpacing: 0.025,
            bounds: 'open',
            domainMin: [-1.5, -0.8, -1.5],
            domainMax: [1.5, 1.5, 1.5],
        }),
    );
    insertValley(app, clayflow, { shape: LAKE_VALLEY });
    const position: number[] = [];
    for (let y = 0; y < 24; y++)
        for (let z = 0; z < 16; z++)
            for (let x = 0; x < 16; x++)
                position.push(
                    -0.45 + 0.025 * (x + 0.5),
                    0.02 + 0.025 * (y + 0.5),
                    -0.2 + 0.025 * (z + 0.5),
                );
    const body = new clayflow.FluidBody({ algorithm: 'PBF', position }).add(
        new clayflow.PointSpriteMaterial({ color: [0.2, 0.5, 1, 1], radius: 0.0125 }),
    );
    app.world.insert(body);
    const diffuse = new clayflow.DiffuseParticles({ source: body, maxParticles: 16_384 });
    app.world.insert(diffuse);
    let frames = 0;
    const off = app.events.on('frameComplete', () => frames++);
    await app.whenReady({ timeoutMs: 60_000 });
    off();
    app.step(1 / 60, 150);
    const water = new Float32Array((await readPositions(app, clayflow.PBFSchema)).flat());
    const spec = app.resources.bufferOf(diffuse, 'particles');
    if (spec === undefined) throw new Error('partículas secundárias sem buffer');
    const secondary = await readBuffer(app, spec, 'readiness_diffuse');
    let alive = 0;
    for (let i = 0; i < secondary.length / 8; i++) if (secondary[i * 8 + 7]! > 0) alive++;
    const hash = fnv(new Uint8Array(secondary.buffer), fnv(new Uint8Array(water.buffer)));
    app.dispose();
    canvas.remove();
    return { hash, frames, alive };
}

async function slowCompile(): Promise<void> {
    // A lenta primeiro: a conferência do compilador fica em cache entre aplicações da página, e a segunda execução
    // compila na hora — a diferença de quadros até a prontidão é a maior possível.
    const slow = await damHash(1500);
    const normal = await damHash(0);
    log(
        `slowCompile: quadros até a prontidão ${normal.frames} (normal) contra ${slow.frames} (compilação atrasada); estado ${normal.hash.toString(16)} / ${slow.hash.toString(16)}; secundárias vivas ${normal.alive} / ${slow.alive}`,
    );
    check(
        slow.frames > normal.frames,
        `slowCompile: o atraso da compilação não apareceu (${normal.frames} × ${slow.frames} quadros; hash ${normal.hash === slow.hash ? 'igual' : 'diferente'}; vivas ${normal.alive}/${slow.alive})`,
    );
    check(normal.alive > 0, 'slowCompile: o respingo não gerou partículas secundárias');
    check(
        normal.hash === slow.hash,
        `slowCompile: a simulação mudou com a velocidade de compilação (${normal.hash.toString(16)} ≠ ${slow.hash.toString(16)})`,
    );
}

async function timeout(): Promise<void> {
    const { app, canvas } = await giApp(W, H, engineErrors);
    buildGiScene(app, windowRoom(), W / H);
    await app.whenReady();
    const core = app.core as unknown as Record<
        'createAsync' | 'shaderMessages',
        () => Promise<unknown>
    >;
    core.createAsync = () => new Promise(() => undefined);
    core.shaderMessages = () => new Promise(() => undefined);
    app.world.insert(
        new FogVolume({ shape: { box: [4, 2.5, 4] }, center: [0, 1.25, 0], density: 0.15 }),
    );
    const t0 = performance.now();
    let message = '';
    try {
        await app.whenReady({ timeoutMs: 1500 });
    } catch (e) {
        message = e instanceof Error ? e.message : String(e);
    }
    const elapsed = performance.now() - t0;
    log(`timeout: rejeitou em ${elapsed.toFixed(0)} ms — ${message}`);
    check(message !== '', 'timeout: whenReady não rejeitou');
    check(elapsed < 3000, `timeout: demorou ${elapsed.toFixed(0)} ms (prazo 1500)`);
    check(
        /\((verifying|compiling|swapping)\)/.test(message) && /pendente: \w+\//.test(message),
        `timeout: a mensagem não nomeia o Flow, o pipeline e o motivo (${message})`,
    );
    app.dispose();
    canvas.remove();
}

const CASES: Record<string, () => Promise<void>> = { lateFog, slowCompile, timeout };

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('READINESS SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
