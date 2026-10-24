// Spec 034 — Smoke das manchas da luz global e da névoa (US3; SC-006).
//
// As medidas leem a radiância linear do alvo HDR da cena, com a câmera parada, contra o traçador de caminhos da CPU:
//   - A luz indireta do motor (com a GI menos sem ela) é comparada pixel a pixel com a referência (só a indireta), no
//     interior das faces, relativa ao nível de cada face. O erro se separa em:
//       * viés por face: a média do erro na face inteira (≤ 5 %);
//       * manchas: o erro lento dentro da face (média em janela de 13 px, sem o viés da face), na média de 32 quadros —
//         o que sobra de estrutura que não some com o tempo (≤ 2 %). O ruído lento da própria referência é medido pela
//         diferença entre duas metades independentes dela e descontado em quadratura;
//       * cintilação: o desvio temporal de cada pixel ao longo dos 32 quadros (≤ 1 %).
//     Cenas: a caixa de Cornell e o cômodo com janela, nas qualidades `medium` e `high`.
//   - fogWalk: a câmera andando pela névoa (paredes pretas, só o feixe do sol): a luz da névoa sozinha (com névoa menos
//     sem, no mesmo percurso) — a cintilação (diferença de cada quadro para a média dos vizinhos) ≤ 1 % no p99, e a
//     periodicidade na escala do froxel (perfil de fase do resíduo) no máximo 3× a de um ruído sem estrutura.
// Para rodar: `npm run smoke -- giNoise [--query case=cornell-medium]`. Resultado: `GINOISE SMOKE PASSED` ou `FAIL: …`.
import { FogVolume, GlobalIllumination, Transform, type Application } from 'clayflow';
import type { PtImage } from '../elements/lighting/reference/pathTracer';
import { settle } from './support/extensionScenes';
import {
    buildGiScene,
    cornellBox,
    giApp,
    pathTracedScene,
    windowRoom,
    type BuiltGiScene,
    type GiScene,
    type Vec3,
} from './support/giScenes';
import { hdrAt, hdrLuminance, readHdrTexture, type HdrImage } from './support/imageMeasures';
import { renderPathTracedParallel } from './support/pathTraceParallel';
import { luminanceLinear } from './support/images';

function log(msg: string): void {
    console.log(`[giNoise] ${msg}`);
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

const lum = luminanceLinear;
const pct = (v: number): string => `${(v * 100).toFixed(2)} %`;

const W = 320;
const H = 240;
const FRAMES = 32;
const BOUNCES = 3;
/** Raio da janela da parte lenta do erro (13 × 13 px). */
const SLOW_RADIUS = 6;

type Quality = 'medium' | 'high';

interface Session {
    readonly app: Application;
    readonly built: BuiltGiScene;
    step(frames: number): Promise<void>;
    read(): Promise<HdrImage>;
    close(): void;
}

/** Abre a cena com a GI (ligada ou não) e, se pedida, a névoa; espera os kernels da GI prontos. */
async function open(
    scene: GiScene,
    size: { width: number; height: number },
    opts: { gi?: { quality: Quality; enabled: boolean }; fog?: FogVolume; ambient?: number },
): Promise<Session> {
    const { app, canvas } = await giApp(size.width, size.height, engineErrors);
    if (opts.ambient === undefined) app.world.remove(app.defaults.ambient);
    else app.defaults.ambient.data.intensity = opts.ambient;
    const built = buildGiScene(app, scene, size.width / size.height);
    if (opts.fog !== undefined) app.world.insert(opts.fog);
    const ready = { revision: -1, at: 0 };
    app.events.on('globalIlluminationReady', (e) => {
        ready.revision = e.revision;
        ready.at = performance.now();
    });
    if (opts.gi !== undefined) {
        app.world.insert(
            new GlobalIllumination({
                quality: opts.gi.quality,
                bounces: BOUNCES,
                probeSpacing: scene.probeSpacing ?? 0.3,
                ...(opts.gi.quality === 'high' ? { cascades: 1 } : {}),
                center: scene.probeCenter,
                enabled: opts.gi.enabled,
            }),
        );
    }
    await settle(app, 2500);
    if (opts.gi?.enabled === true) {
        const limit = performance.now() + 120000;
        while (ready.revision < 0 || performance.now() - ready.at < 1000) {
            if (performance.now() > limit)
                throw new Error('a iluminação global não ficou pronta em 120 s');
            await settle(app, 100);
        }
    }
    return {
        app,
        built,
        async step(frames) {
            for (let i = 0; i < frames; i++) {
                app.step(1 / 60);
                if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
            }
        },
        async read() {
            const texture = app.resources.textureOf(app.defaults.targets, 'color');
            if (texture === undefined) throw new Error('alvo HDR não alocado');
            return readHdrTexture(app, texture);
        },
        close() {
            app.dispose();
            canvas.remove();
        },
    };
}

function mean(frames: readonly HdrImage[]): HdrImage {
    const data = new Float32Array(frames[0]!.data.length);
    for (const f of frames)
        for (let k = 0; k < data.length; k++) data[k]! += f.data[k]! / frames.length;
    return { width: frames[0]!.width, height: frames[0]!.height, data };
}

/** Interior das faces: a janela 7 × 7 em volta do pixel inteira na mesma região e face da referência. */
function interiorMask(ref: PtImage): Uint8Array {
    const m = new Uint8Array(W * H);
    for (let y = 3; y < H - 3; y++)
        for (let x = 3; x < W - 3; x++) {
            const k = y * W + x;
            if (ref.ids[k]! < 0) continue;
            let ok = true;
            for (let dy = -3; dy <= 3 && ok; dy++)
                for (let dx = -3; dx <= 3 && ok; dx++) {
                    const j = (y + dy) * W + x + dx;
                    ok = ref.ids[j] === ref.ids[k] && ref.faces[j] === ref.faces[k];
                }
            m[k] = ok ? 1 : 0;
        }
    return m;
}

/** Média em caixa (2r+1)² só sobre os pixels da máscara na mesma região. */
function boxBlur(v: Float32Array, mask: Uint8Array, ids: Int32Array, r: number): Float32Array {
    const out = new Float32Array(v.length);
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            const k = y * W + x;
            if (mask[k] === 0) continue;
            let s = 0;
            let n = 0;
            for (let dy = -r; dy <= r; dy++)
                for (let dx = -r; dx <= r; dx++) {
                    const xx = x + dx;
                    const yy = y + dy;
                    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                    const j = yy * W + xx;
                    if (mask[j] === 0 || ids[j] !== ids[k]) continue;
                    s += v[j]!;
                    n++;
                }
            out[k] = s / n;
        }
    return out;
}

function rms(v: Float32Array, mask: Uint8Array): number {
    let s2 = 0;
    let n = 0;
    for (let k = 0; k < v.length; k++)
        if (mask[k] === 1) {
            s2 += v[k]! * v[k]!;
            n++;
        }
    return Math.sqrt(s2 / Math.max(1, n));
}

/** Média de `f(k)` por região (máscara). */
function byRegion(
    f: (k: number) => number,
    mask: Uint8Array,
    ids: Int32Array,
): Map<number, number> {
    const acc = new Map<number, [number, number]>();
    for (let k = 0; k < W * H; k++) {
        if (mask[k] === 0) continue;
        const a = acc.get(ids[k]!) ?? [0, 0];
        a[0] += f(k);
        a[1]++;
        acc.set(ids[k]!, a);
    }
    return new Map([...acc].map(([id, [s, n]]) => [id, s / n]));
}

const refLum = (ref: PtImage, k: number): number =>
    lum([ref.rgb[k * 3]!, ref.rgb[k * 3 + 1]!, ref.rgb[k * 3 + 2]!]);

/** Viés por face, manchas e cintilação da luz indireta contra o traçador. */
async function giCase(name: string, scene: GiScene, quality: Quality, spp: number): Promise<void> {
    const pt = pathTracedScene(scene);
    const t0 = performance.now();
    const opts = { width: W, height: H, samples: spp, bounces: BOUNCES, indirectOnly: true };
    const a = await renderPathTracedParallel(pt.scene, pt.camera, opts);
    const b = await renderPathTracedParallel(pt.scene, pt.camera, { ...opts, firstSample: spp });
    log(
        `${name}: referência ${2 * spp} amostras (duas metades) em ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
    const ref: PtImage = {
        ...a,
        rgb: a.rgb.map((v, i) => (v + b.rgb[i]!) / 2),
    };
    const on = await open(scene, { width: W, height: H }, { gi: { quality, enabled: true } });
    await on.step(300);
    const frames: HdrImage[] = [];
    for (let i = 0; i < FRAMES; i++) {
        await on.step(1);
        frames.push(await on.read());
    }
    on.close();
    const off = await open(scene, { width: W, height: H }, { gi: { quality, enabled: false } });
    await off.step(4);
    const direct = await off.read();
    off.close();

    const mask = interiorMask(ref);
    const level = byRegion((k) => refLum(ref, k), mask, ref.ids);
    const indirect = (img: HdrImage, k: number): number =>
        lum(hdrAt(img, k % W, Math.floor(k / W))) - lum(hdrAt(direct, k % W, Math.floor(k / W)));
    const avg = mean(frames);
    const err = new Float32Array(W * H);
    const noise = new Float32Array(W * H);
    for (let k = 0; k < W * H; k++) {
        if (mask[k] === 0) continue;
        const l = Math.max(1e-6, level.get(ref.ids[k]!)!);
        err[k] = (indirect(avg, k) - refLum(ref, k)) / l;
        noise[k] = (refLum(a, k) - refLum(b, k)) / 2 / l;
    }
    const bias = byRegion((k) => err[k]!, mask, ref.ids);
    const slow = boxBlur(err, mask, ref.ids, SLOW_RADIUS);
    for (let k = 0; k < W * H; k++) if (mask[k] === 1) slow[k]! -= bias.get(ref.ids[k]!)!;
    const refSlow = rms(boxBlur(noise, mask, ref.ids, SLOW_RADIUS), mask);
    const blotches = Math.sqrt(Math.max(0, rms(slow, mask) ** 2 - refSlow ** 2));
    let flick = 0;
    let n = 0;
    for (let k = 0; k < W * H; k++) {
        if (mask[k] === 0) continue;
        const x = k % W;
        const y = Math.floor(k / W);
        let s = 0;
        let s2 = 0;
        for (const f of frames) {
            const v = hdrLuminance(f, x, y);
            s += v;
            s2 += v * v;
        }
        const m = s / FRAMES;
        flick += Math.sqrt(Math.max(0, s2 / FRAMES - m * m)) / level.get(ref.ids[k]!)!;
        n++;
    }
    flick /= n;
    const worstBias = Math.max(...[...bias.values()].map(Math.abs));
    log(
        `${name}: viés por face ${[...bias].map(([id, v]) => `${id}:${pct(v)}`).join(' ')}; manchas ${pct(blotches)} (ruído lento da referência ${pct(refSlow)}); cintilação ${pct(flick)}`,
    );
    check(worstBias <= 0.05, `${name}: viés por face ${pct(worstBias)} (≤ 5 %)`);
    check(blotches <= 0.02, `${name}: manchas ${pct(blotches)} (≤ 2 %)`);
    check(flick <= 0.01, `${name}: cintilação ${pct(flick)} (≤ 1 %)`);
}

const ROOM_FOG = {
    center: [0, 1.25, 0] as const,
    size: [4, 2.5, 4] as const,
    sigma: 0.15,
    albedo: 0.9,
    g: 0.3,
};

/** O percurso da câmera pela névoa: os quadros HDR de cada passo. */
async function walkFrames(
    scene: GiScene,
    withFog: boolean,
    size: { width: number; height: number },
) {
    const fog = new FogVolume({
        shape: { box: ROOM_FOG.size },
        center: ROOM_FOG.center,
        density: ROOM_FOG.sigma,
        albedo: [ROOM_FOG.albedo, ROOM_FOG.albedo, ROOM_FOG.albedo],
        anisotropy: ROOM_FOG.g,
    });
    const s = await open(scene, size, withFog ? { fog } : {});
    await s.step(40);
    const c = scene.camera;
    const frames: HdrImage[] = [];
    for (let i = 0; i < 72; i++) {
        const t = i / 71;
        const p: Vec3 = [c.position[0] + 1.2 * t, c.position[1], c.position[2] - 0.8 * t];
        s.built.view.data.position = [...p, 1];
        s.built.view.data.rotation = Transform.lookRotation(p, c.target);
        await s.step(1);
        frames.push(await s.read());
    }
    s.close();
    return frames;
}

/**
 * A névoa com a câmera andando: a luz da névoa sozinha (com menos sem, no mesmo percurso determinístico); cintilação e
 * periodicidade do resíduo na escala do froxel (160 × 90 da tela).
 */
async function fogWalk(): Promise<void> {
    const size = { width: 640, height: 360 };
    const room = windowRoom();
    const scene: GiScene = {
        ...room,
        sky: false,
        slabs: room.slabs.map((s) => ({ ...s, color: [0, 0, 0] as Vec3 })),
    };
    const withFog = await walkFrames(scene, true, size);
    const clear = await walkFrames(scene, false, size);
    const fogOnly = (i: number, x: number, y: number): number =>
        hdrLuminance(withFog[i]!, x, y) - hdrLuminance(clear[i]!, x, y);
    let peak = 0;
    for (let y = 0; y < size.height; y++)
        for (let x = 0; x < size.width; x++) peak = Math.max(peak, fogOnly(36, x, y));
    const flicker: number[] = [];
    const px = size.width / 160;
    const py = size.height / 90;
    let periodicity = 0;
    for (let i = 1; i < withFog.length - 1; i++) {
        let diff = 0;
        let count = 0;
        const phaseX = new Float64Array(px);
        const phaseY = new Float64Array(py);
        const nx = new Float64Array(px);
        const ny = new Float64Array(py);
        let s2 = 0;
        for (let y = 20; y < size.height - 20; y++)
            for (let x = 20; x < size.width - 20; x++) {
                const r = fogOnly(i, x, y) - (fogOnly(i - 1, x, y) + fogOnly(i + 1, x, y)) / 2;
                diff += Math.abs(r);
                count++;
                s2 += r * r;
                phaseX[x % px]! += r;
                nx[x % px]!++;
                phaseY[y % py]! += r;
                ny[y % py]!++;
            }
        flicker.push(diff / count / peak);
        // Perfil de fase: média do resíduo por coluna (linha) módulo o tamanho do froxel. Sem estrutura, a variância do
        // perfil vale σ²/N por fase (índice 1); um degrau por froxel a multiplica.
        const sigma2 = s2 / count;
        let index = 0;
        for (const [phase, n] of [
            [phaseX, nx],
            [phaseY, ny],
        ] as const) {
            let v = 0;
            for (let k = 0; k < phase.length; k++) v += (phase[k]! / n[k]!) ** 2;
            v /= phase.length;
            index = Math.max(index, (v * (count / phase.length)) / Math.max(1e-12, sigma2));
        }
        periodicity = Math.max(periodicity, index);
    }
    flicker.sort((p, q) => p - q);
    const p99 = flicker[Math.floor(flicker.length * 0.99)]!;
    log(
        `fogWalk: cintilação da névoa p99 ${pct(p99)} do pico, mediana ${pct(flicker[flicker.length >> 1]!)}; periodicidade no froxel ${periodicity.toFixed(2)}× a de ruído sem estrutura`,
    );
    check(p99 <= 0.01, `fogWalk: cintilação ${pct(p99)} (≤ 1 %)`);
    check(periodicity <= 3, `fogWalk: periodicidade no froxel ${periodicity.toFixed(2)}× (≤ 3×)`);
}

const CASES: Record<string, () => Promise<void>> = {
    'cornell-high': () => giCase('cornell-high', cornellBox(), 'high', 2048),
    'cornell-medium': () => giCase('cornell-medium', cornellBox(), 'medium', 2048),
    'window-high': () => giCase('window-high', windowRoom(), 'high', 1024),
    'window-medium': () => giCase('window-medium', windowRoom(), 'medium', 1024),
    fogWalk,
};

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
