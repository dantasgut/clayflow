// Spec 034 — Smoke do antisserrilhado temporal (US2; SC-004, SC-005).
//
// Mede a imagem apresentada (lida direto da GPU, `readCanvas`) contra a referência do próprio motor: o modo
// `accumulate` com 64 posições da amostra dentro do pixel, câmera parada — a integral do pixel sem rejeição.
//   - still: a cena de teste (arestas de alto contraste, xadrez procedural fino, esfera lisa com realce, sombra, vidro)
//     depois de 16 quadros do modo temporal: erro médio ≤ 1 % e erro nas bordas ≤ 3 % (relativos ao brilho médio da
//     imagem; bordas = os 5 % de pixels de maior gradiente da referência).
//   - trail: uma bola clara atravessa a cena; nos pixels por onde ela passou há 4 quadros ou mais (e não está agora), o
//     excesso sobre a imagem sem a bola fica ≤ 1 % do brilho da bola (sem rastro).
//   - orbit: a câmera gira a 30°/s em volta do vidro; em três poses o quadro do modo temporal contra a referência
//     parada na mesma pose: a energia de gradiente da referência / a do temporal ≤ 1,5 (o borrão do movimento) e erro
//     médio ≤ 3 %.
//   - sprites: partículas em sprites caindo; a cobertura delas no modo temporal ≥ 90 % da do modo sem antisserrilhado
//     (o histórico não as apaga).
// Para rodar: `npm run smoke -- antialiasing [--query case=still]`. Resultado: `ANTIALIASING SMOKE PASSED` ou `FAIL: …`.
import * as clayflow from 'clayflow';
import {
    Application,
    BoxGeometry,
    createScene,
    SphereGeometry,
    StandardMaterial,
    Transform,
    type AntialiasingMode,
    type CanvasPixels,
} from 'clayflow';
import { closureFn } from './support/materialScenes';
import { writeFixture } from './support/fixtures';

function log(msg: string): void {
    console.log(`[antialiasing] ${msg}`);
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
const H = 270;
const pct = (v: number): string => `${(v * 100).toFixed(2)} %`;

type Look = (position: readonly [number, number, number]) => void;

interface Scene {
    readonly app: Application;
    readonly canvas: HTMLCanvasElement;
    readonly look: Look;
    /** A câmera (corte: a acumulação e o histórico recomeçam). */
    readonly camera: clayflow.Camera;
    readonly ball?: Transform;
}

const TARGET = [0, 0.4, 0] as const;

/** A cena de teste no modo pedido. */
async function scene(mode: AntialiasingMode, options: { ball?: boolean } = {}): Promise<Scene> {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        antialias: mode,
        canvasOptions: { capture: true },
    });
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    if (mode === 'accumulate') app.defaults.antialiasing.data.sequence = 64;
    const seq = new URLSearchParams(location.search).get('seq');
    if (mode === 'temporal' && seq !== null) app.defaults.antialiasing.data.sequence = Number(seq);
    const dbg = new URLSearchParams(location.search).get('dbg');
    if (dbg !== null) app.defaults.antialiasing.data._pad0 = Number(dbg);
    const view = new Transform({ position: [0, 1, 3, 1] });
    const camera = new clayflow.Camera({
        fov: 0.8,
        aspect: W / H,
        aspectMode: 'fixed',
        near: 0.05,
        far: 50,
    });
    app.world.insert(camera.add(view));
    const look: Look = (p) => {
        view.data.position = [...p, 1];
        view.data.rotation = Transform.lookRotation(p, TARGET);
    };
    look([0, 1, 3]);
    app.world.insert(
        new clayflow.DirectionalLight({
            direction: [-0.4, -1, -0.3, 0],
            intensity: 3,
            castShadow: true,
            shadow: { size: [2048, 2048] },
        }),
    );
    // Chão com xadrez procedural fino (0,1 m), sem filtragem: o serrilhado que o temporal tem de integrar.
    app.world.insert(
        new clayflow.PlaneGeometry({ size: [8, 8] })
            .add(new StandardMaterial({ albedo: [0.7, 0.7, 0.7, 1], roughness: 0.9 }))
            .add(new Transform())
            .add(
                closureFn(
                    'let c = (floor(s.world_position.x * 10.0) + floor(s.world_position.z * 10.0)) % 2.0;\n    return closure_diffuse(mix(vec3f(0.1), vec3f(0.8), abs(c)), 0.0);',
                    ['diffuse'],
                ),
            ),
    );
    // Caixa escura de arestas vivas e esfera lisa (realce fino).
    app.world.insert(
        new BoxGeometry({ size: [0.6, 0.6, 0.6] })
            .add(new StandardMaterial({ albedo: [0.05, 0.05, 0.05, 1], roughness: 0.6 }))
            .add(new Transform({ position: [-0.9, 0.3, -0.4, 1] })),
    );
    app.world.insert(
        new SphereGeometry({ radius: 0.3, latSegments: 64, lonSegments: 128 })
            .add(new StandardMaterial({ albedo: [0.9, 0.3, 0.1, 1], roughness: 0.08, metallic: 0 }))
            .add(new Transform({ position: [0.9, 0.3, -0.3, 1] })),
    );
    // Esfera de vidro no centro.
    app.world.insert(
        new SphereGeometry({ radius: 0.35, latSegments: 96, lonSegments: 192 })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, 0.4, 0, 1] }))
            .add(
                closureFn(
                    'return closure_add(closure_dielectric(1.5, vec3f(1.0), 0.0, 0.0, vec3f(0.0)), closure_transmission(1.5, vec3f(1.0), 0.0, 0.0, 0.0));',
                    ['specular', 'transmission'],
                ),
            ),
    );
    let ball: Transform | undefined;
    if (options.ball === true) {
        ball = new Transform({ position: [-2, 0.4, -0.8, 1] });
        app.world.insert(
            new SphereGeometry({ radius: 0.12, latSegments: 32, lonSegments: 64 })
                .add(new StandardMaterial({ albedo: [0, 0, 0, 1], roughness: 1 }))
                .add(ball)
                .add(
                    closureFn(
                        'return closure_add(closure_diffuse(vec3f(0.0), 0.0), closure_emission(vec3f(6.0, 6.0, 6.0), 1.0));',
                        ['diffuse', 'emission'],
                    ),
                ),
        );
    }
    await app.whenReady({ timeoutMs: 60_000 });
    // Aquecimento: a sombra, as tabelas e o primeiro histórico assentados; o corte recomeça a acumulação e o histórico
    // do zero no quadro seguinte (a medida não depende de quantos quadros a prontidão levou).
    app.step(1 / 60, 8);
    camera.cut();
    return { app, canvas, look, camera, ...(ball !== undefined ? { ball } : {}) };
}

function close(s: Scene): void {
    s.app.dispose();
    s.canvas.remove();
}

/** Luminância por pixel (0–1) da imagem apresentada. */
function lum(px: CanvasPixels): Float32Array {
    const out = new Float32Array(px.width * px.height);
    const bgra = px.format === 'bgra8unorm';
    for (let i = 0; i < out.length; i++) {
        const r = px.data[i * 4 + (bgra ? 2 : 0)]! / 255;
        const g = px.data[i * 4 + 1]! / 255;
        const b = px.data[i * 4 + (bgra ? 0 : 2)]! / 255;
        out[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    return out;
}

/** Avança `frames` quadros e lê o último (na mesma tarefa do quadro). */
async function frameAfter(
    s: Scene,
    frames: number,
    each?: (i: number) => void,
): Promise<Float32Array> {
    let last: Float32Array | undefined;
    for (let i = 0; i < frames; i++) {
        each?.(i);
        s.app.step(1 / 60);
        if (i === frames - 1) last = lum(await s.app.core.readCanvas());
        else if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
    return last!;
}

/** Diagnóstico: grava a luminância como PNG em cinza (fixture `zz-*`, fora do commit). */
async function dump(name: string, img: Float32Array): Promise<void> {
    const data = new ImageData(W, H);
    for (let k = 0; k < img.length; k++) {
        const v = Math.round(Math.min(1, img[k]!) * 255);
        data.data.set([v, v, v, 255], k * 4);
    }
    const c = new OffscreenCanvas(W, H);
    c.getContext('2d')!.putImageData(data, 0, 0);
    await writeFixture(
        name,
        new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()),
    );
}

/** Gradiente por pixel (diferenças centrais). */
function gradient(img: Float32Array): Float32Array {
    const g = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
            const k = y * W + x;
            g[k] = Math.hypot(img[k + 1]! - img[k - 1]!, img[k + W]! - img[k - W]!);
        }
    return g;
}

const mean = (v: Float32Array): number => v.reduce((a, b) => a + b, 0) / v.length;

/** Erros médio e nas bordas (5 % de maior gradiente da referência), relativos ao brilho médio. */
function errors(img: Float32Array, ref: Float32Array): { all: number; edges: number } {
    const g = gradient(ref);
    const sorted = [...g].sort((a, b) => b - a);
    const cut = sorted[Math.floor(sorted.length * 0.05)]!;
    let all = 0;
    let edges = 0;
    let n = 0;
    for (let k = 0; k < img.length; k++) {
        const d = Math.abs(img[k]! - ref[k]!);
        all += d;
        if (g[k]! >= cut) {
            edges += d;
            n++;
        }
    }
    const m = mean(ref);
    return { all: all / img.length / m, edges: edges / Math.max(1, n) / m };
}

async function still(): Promise<void> {
    const ref = await scene('accumulate');
    const reference = await frameAfter(ref, 64);
    close(ref);
    const tmp = await scene('temporal');
    const temporal = await frameAfter(tmp, 16);
    close(tmp);
    const off = await scene('off');
    const aliased = await frameAfter(off, 1);
    close(off);
    if (new URLSearchParams(location.search).get('dump') === '1') {
        for (const [name, img] of [
            ['reference', reference],
            ['temporal', temporal],
            ['off', aliased],
        ] as const)
            await dump(`zz-aa-${name}.png`, img);
        await dump(
            'zz-aa-diff.png',
            temporal.map((v, k) => Math.min(1, Math.abs(v - reference[k]!) * 10)),
        );
    }
    const e = errors(temporal, reference);
    const a = errors(aliased, reference);
    log(
        `still: temporal após 16 quadros contra 64 amostras — erro médio ${pct(e.all)}, bordas ${pct(e.edges)} (sem antisserrilhado: ${pct(a.all)}, ${pct(a.edges)})`,
    );
    check(e.all <= 0.01, `still: erro médio ${pct(e.all)} (≤ 1 %)`);
    check(e.edges <= 0.03, `still: erro nas bordas ${pct(e.edges)} (≤ 3 %)`);
}

/** Posição da bola no quadro `i` (atravessa a cena atrás do vidro em 2 s). */
const ballAt = (i: number): [number, number, number, number] => [-2 + (4 * i) / 120, 0.4, -0.8, 1];

async function trail(): Promise<void> {
    // A imagem sem a bola (fundo) e, a cada quadro, a máscara de onde a bola está (sem antisserrilhado).
    const bg = await scene('temporal');
    const background = await frameAfter(bg, 32);
    close(bg);
    const off = await scene('off', { ball: true });
    const masks: Uint8Array[] = [];
    for (let i = 0; i < 120; i++) {
        off.ball!.data.position = ballAt(i);
        off.app.step(1 / 60);
        const img = lum(await off.app.core.readCanvas());
        const m = new Uint8Array(W * H);
        for (let k = 0; k < m.length; k++) m[k] = img[k]! > 0.97 ? 1 : 0;
        masks.push(m);
    }
    close(off);
    const tmp = await scene('temporal', { ball: true });
    let worst = 0;
    let counted = 0;
    for (let i = 0; i < 120; i++) {
        tmp.ball!.data.position = ballAt(i);
        tmp.app.step(1 / 60);
        const img = lum(await tmp.app.core.readCanvas());
        if (i < 8) continue;
        // Pixels cobertos pela bola há 4 a 8 quadros e livres desde então.
        for (let k = 0; k < img.length; k++) {
            let past = false;
            for (let d = 4; d <= 8; d++) if (masks[i - d]![k] === 1) past = true;
            if (!past) continue;
            let recent = false;
            for (let d = 0; d < 4; d++) if (masks[i - d]![k] === 1) recent = true;
            if (recent) continue;
            worst = Math.max(worst, img[k]! - background[k]!);
            counted++;
        }
    }
    close(tmp);
    log(
        `trail: ${counted} pixels por onde a bola passou há ≥ 4 quadros — maior excesso ${pct(worst)} do brilho da bola`,
    );
    check(counted > 0, 'trail: a bola não foi vista');
    check(worst <= 0.01, `trail: rastro de ${pct(worst)} do brilho da bola após 4 quadros (≤ 1 %)`);
}

/** Pose da órbita (30°/s em volta do alvo, raio 3 m) no tempo `t` (s). */
const orbitAt = (t: number): [number, number, number] => {
    const a = (30 * Math.PI * t) / 180;
    return [3 * Math.sin(a), 1, 3 * Math.cos(a)];
};

async function orbit(): Promise<void> {
    const poses = [1, 2, 3];
    const tmp = await scene('temporal');
    const moving: Float32Array[] = [];
    let i = 0;
    for (const at of poses) {
        while (i < at * 60) {
            tmp.look(orbitAt(i / 60));
            tmp.app.step(1 / 60);
            i++;
            if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
        }
        tmp.look(orbitAt(i / 60));
        tmp.app.step(1 / 60);
        i++;
        moving.push(lum(await tmp.app.core.readCanvas()));
    }
    close(tmp);
    for (let k = 0; k < poses.length; k++) {
        const ref = await scene('accumulate');
        ref.look(orbitAt(poses[k]!));
        const reference = await frameAfter(ref, 64);
        close(ref);
        const off = await scene('off');
        off.look(orbitAt(poses[k]!));
        const aliased = await frameAfter(off, 2);
        close(off);
        const ea = errors(aliased, reference);
        log(
            `orbit: pose ${k + 1} sem antisserrilhado — erro médio ${pct(ea.all)}, bordas ${pct(ea.edges)}`,
        );
        const sharp = mean(gradient(reference)) / Math.max(1e-9, mean(gradient(moving[k]!)));
        const e = errors(moving[k]!, reference);
        log(
            `orbit: pose ${k + 1} (${poses[k]} s a 30°/s) — gradiente da referência / do temporal ${sharp.toFixed(3)}, erro médio ${pct(e.all)}`,
        );
        check(sharp <= 1.5, `orbit: borrão ${sharp.toFixed(2)}× na pose ${k + 1} (≤ 1,5×)`);
        check(e.all <= 0.03, `orbit: erro médio ${pct(e.all)} na pose ${k + 1} (≤ 3 %)`);
    }
}

/** Cobertura (pixels claros) das partículas em sprites caindo, no modo pedido. */
async function spriteCoverage(mode: AntialiasingMode): Promise<number> {
    const s = await scene(mode);
    s.app.world.insert(new clayflow.GravityField({ acceleration: [0, -9.81, 0, 0] }));
    const position: number[] = [];
    for (let k = 0; k < 400; k++)
        position.push(
            -1.2 + 2.4 * ((k * 0.618) % 1),
            1.6 + 0.6 * ((k * 0.381) % 1),
            -0.6 + 1.2 * ((k * 0.271) % 1),
        );
    s.app.world.insert(
        new clayflow.FluidBody({ algorithm: 'SPH', position }).add(
            new clayflow.PointSpriteMaterial({ color: [1, 1, 0.2, 1], radius: 0.015 }),
        ),
    );
    await s.app.whenReady();
    const img = await frameAfter(s, 20);
    close(s);
    let n = 0;
    for (const v of img) if (v > 0.85) n++;
    return n;
}

async function sprites(): Promise<void> {
    const off = await spriteCoverage('off');
    const temporal = await spriteCoverage('temporal');
    const ratio = temporal / Math.max(1, off);
    log(
        `sprites: cobertura em movimento — temporal ${temporal} px, sem antisserrilhado ${off} px (${pct(ratio)})`,
    );
    check(off > 0, 'sprites: as partículas não aparecem');
    check(
        ratio >= 0.9,
        `sprites: o temporal apagou as partículas (${pct(ratio)} da cobertura; ≥ 90 %)`,
    );
}

const CASES: Record<string, () => Promise<void>> = { still, trail, orbit, sprites };

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('ANTIALIASING SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
