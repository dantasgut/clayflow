// Spec 034 — Smoke do ruído da luz indireta na cena com janela (US1; SC-001).
//
// O cômodo com janela da 033 sob o sol de 100 klx a 50°, câmera parada, qualidade `medium` (o padrão). As medidas leem
// a radiância linear do alvo HDR na parede do fundo:
//   - manchas: o desvio da banda de 2 a 15 px (desfoque de raio 2 menos o de raio 15) relativo à média, contra a mesma
//     cena sem o gather de tela (as sondas do mundo sozinhas são lisas) — ≤ 1,1× a referência;
//   - variação entre quadros: |L(t) − L(t+1)| médio relativo à média, 2 s depois da GI pronta, na média de 10 pares
//     seguidos — ≤ 0,11 % (decisão do usuário, 2026-10-19: `medium` com 16 raios de tela e o guia, medido 0,104 %);
//   - convergência: a média a 2 s contra a média a 10 s, parada — ≤ 2 %.
// Para rodar: `npm run smoke -- giNoise [--query case=window]`. Resultado: `GINOISE SMOKE PASSED` ou `FAIL: …`.
import { GlobalIllumination, type Application } from 'clayflow';
import { settle } from './support/extensionScenes';
import { buildGiScene, giApp, sunFrom, windowRoom } from './support/giScenes';
import { hdrLuminance, readHdrTexture, type HdrImage } from './support/imageMeasures';

function log(msg: string): void {
    console.log(`[giNoise] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

const SIZE = { width: 1280, height: 720 } as const;
/** A parede do fundo na tela (frações da imagem), à esquerda da janela, longe das quinas e da mancha de sol. */
const WALL = { x0: 0.08, x1: 0.48, y0: 0.1, y1: 0.62 } as const;

/** Uma aplicação com o cômodo e a iluminação global pronta: avança quadros de 1/60 s e lê o alvo HDR. */
interface Session {
    step(frames: number): Promise<void>;
    read(): Promise<HdrImage>;
    close(): void;
}

async function open(screenGather: boolean): Promise<Session> {
    const { app, canvas } = await giApp(SIZE.width, SIZE.height, engineErrors);
    app.events.on('deviceLost', (e) => engineErrors.push(`deviceLost: ${JSON.stringify(e)}`));
    const scene = windowRoom();
    const sun = scene.sun === undefined ? undefined : { ...scene.sun, direction: sunFrom(50, 0) };
    buildGiScene(
        app,
        { ...scene, ...(sun === undefined ? {} : { sun }) },
        SIZE.width / SIZE.height,
    );
    const ready = { revision: -1, at: 0 };
    app.events.on('globalIlluminationReady', (e) => {
        ready.revision = e.revision;
        ready.at = performance.now();
    });
    app.world.insert(
        new GlobalIllumination({
            quality: 'medium',
            bounces: 3,
            probeSpacing: scene.probeSpacing ?? 0.3,
            cascades: 1,
            center: scene.probeCenter,
            screenGather,
        }),
    );
    await settle(app, 2500);
    const limit = performance.now() + 120000;
    while (ready.revision < 0 || performance.now() - ready.at < 1000) {
        if (performance.now() > limit)
            throw new Error('a iluminação global não ficou pronta em 120 s');
        await settle(app, 100);
    }
    return {
        async step(frames) {
            for (let i = 0; i < frames; i++) {
                app.step(1 / 60);
                if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
            }
        },
        read: () => readTarget(app),
        close() {
            app.dispose();
            canvas.remove();
        },
    };
}

async function readTarget(app: Application): Promise<HdrImage> {
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    return readHdrTexture(app, texture);
}

/** A luminância da parede: largura, altura e os valores (linha a linha). */
function wall(img: HdrImage): { w: number; h: number; v: Float64Array } {
    const x0 = Math.round(WALL.x0 * img.width);
    const y0 = Math.round(WALL.y0 * img.height);
    const w = Math.round(WALL.x1 * img.width) - x0;
    const h = Math.round(WALL.y1 * img.height) - y0;
    const v = new Float64Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) v[y * w + x] = hdrLuminance(img, x0 + x, y0 + y);
    return { w, h, v };
}

/** Desfoque de caixa separável de raio `r` (bordas pela média da janela que cabe). */
function boxBlur(v: Float64Array, w: number, h: number, r: number): Float64Array {
    const pass = (src: Float64Array, horizontal: boolean): Float64Array => {
        const out = new Float64Array(src.length);
        const [n, m] = horizontal ? [h, w] : [w, h];
        for (let i = 0; i < n; i++)
            for (let j = 0; j < m; j++) {
                let s = 0;
                let c = 0;
                for (let k = Math.max(0, j - r); k <= Math.min(m - 1, j + r); k++) {
                    s += src[horizontal ? i * w + k : k * w + i]!;
                    c++;
                }
                out[horizontal ? i * w + j : j * w + i] = s / c;
            }
        return out;
    };
    return pass(pass(v, true), false);
}

const mean = (v: Float64Array): number => v.reduce((s, x) => s + x, 0) / v.length;

/** As manchas: desvio da banda de 2 a 15 px relativo à média, sem a margem de 15 px. */
function blotch(img: HdrImage): number {
    const { w, h, v } = wall(img);
    const fine = boxBlur(v, w, h, 2);
    const coarse = boxBlur(v, w, h, 15);
    let s = 0;
    let s2 = 0;
    let n = 0;
    for (let y = 15; y < h - 15; y++)
        for (let x = 15; x < w - 15; x++) {
            const d = fine[y * w + x]! - coarse[y * w + x]!;
            s += d;
            s2 += d * d;
            n++;
        }
    const m = s / n;
    return Math.sqrt(Math.max(0, s2 / n - m * m)) / mean(v);
}

/** Variação média entre dois quadros relativa à média. */
function flicker(a: HdrImage, b: HdrImage): number {
    const [wa, wb] = [wall(a).v, wall(b).v];
    let d = 0;
    for (let i = 0; i < wa.length; i++) d += Math.abs(wa[i]! - wb[i]!);
    return d / wa.length / mean(wa);
}

async function windowScene(): Promise<void> {
    const reference = await open(false);
    await reference.step(120);
    const r2 = await reference.read();
    await reference.step(1);
    const r2b = await reference.read();
    const smooth = blotch(r2);
    await reference.step(479);
    const r10 = await reference.read();
    reference.close();
    log(
        `window: sem gather de tela, variação entre quadros ${(flicker(r2, r2b) * 100).toFixed(3)} %; em 2 s a ${((Math.abs(mean(wall(r2).v) - mean(wall(r10).v)) / mean(wall(r10).v)) * 100).toFixed(2)} % do valor a 10 s (média ${mean(wall(r2).v).toPrecision(4)} → ${mean(wall(r10).v).toPrecision(4)})`,
    );

    const session = await open(true);
    await session.step(120);
    const a = await session.read();
    // A variação entre quadros pela média de 10 pares seguidos (um par sozinho oscila mais que o critério).
    const pairs: number[] = [];
    let previous = a;
    for (let k = 0; k < 10; k++) {
        await session.step(1);
        const next = await session.read();
        pairs.push(flicker(previous, next));
        previous = next;
    }
    await session.step(470);
    const c = await session.read();
    session.close();

    const spots = blotch(a);
    const flick = pairs.reduce((sum, v) => sum + v, 0) / pairs.length;
    const worst = Math.max(...pairs);
    const conv = Math.abs(mean(wall(a).v) - mean(wall(c).v)) / mean(wall(c).v);
    const spots10 = blotch(c);
    log(
        `window: manchas ${(spots * 100).toFixed(2)} % (${(spots / smooth).toFixed(2)}× a referência sem gather de tela, ${(smooth * 100).toFixed(2)} %); a 10 s ${(spots10 * 100).toFixed(2)} %`,
    );
    log(
        `window: variação entre quadros ${(flick * 100).toFixed(3)} % (média de 10 pares; pior ${(worst * 100).toFixed(3)} %); em 2 s a ${(conv * 100).toFixed(2)} % do valor a 10 s (média ${mean(wall(a).v).toPrecision(4)} → ${mean(wall(c).v).toPrecision(4)})`,
    );
    check(
        spots <= 1.1 * smooth,
        `window: manchas ${(spots / smooth).toFixed(2)}× a referência (≤ 1,1×)`,
    );
    check(
        flick <= 0.0011,
        `window: variação entre quadros ${(flick * 100).toFixed(3)} % (≤ 0,11 %)`,
    );
    check(conv <= 0.02, `window: em 2 s a ${(conv * 100).toFixed(2)} % do valor a 10 s (≤ 2 %)`);
}

const CASES: Record<string, () => Promise<void>> = { window: windowScene };

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('GINOISE SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
