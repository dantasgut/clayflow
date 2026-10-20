// Spec 008 — Smoke de partículas na tela (US1, SC-001/SC-002).
//
// Cada algoritmo de partícula (SPH, PBF, MPM fluido, MPM sólido) simula um bloco num tanque, desenhado como sprites
// (`PointSpriteMaterial`) pelo `ParticleFlow`, que lê a posição direto do pool do corpo. Verifica, por cena:
//   - há sprites na imagem (pixels da cor do material) nos quadros 30 e 90, e a imagem muda entre eles (movimento);
//   - nenhuma leitura de volta da GPU durante os quadros (`core.readback` não é chamado);
//   - a imagem do quadro 90 é a da fixture `particles-<cena>-<perfil>.png` (`--record` grava; duas execuções idênticas
//     antes de gravar).
// E a oclusão: uma caixa na frente do fluido cobre o centro da imagem — o pixel central é o mesmo da cena só com a caixa.
//
// Para rodar: `npm run smoke -- particles [--record]`. Resultado: `PARTICLES SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    BoxGeometry,
    Camera,
    createScene,
    DirectionalLight,
    FluidBody,
    PlaneGeometry,
    PointSpriteMaterial,
    SoftBody,
    StandardMaterial,
    Transform,
} from 'clayflow';
import { gpuProfile, readFixture, recording, writeFixture } from './support/fixtures';
import { block, SPACING, tank } from './support/particleScenes';

const WIDTH = 256;
const HEIGHT = 192;
/** Cor dos sprites (vermelho puro iluminado: o canal R domina). */
const SPRITE: readonly [number, number, number, number] = [1, 0.1, 0.05, 1];

function log(msg: string): void {
    console.log(`[particles] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

interface ParticleScene {
    readonly name: string;
    readonly build: (app: Application) => void;
}

/** Câmera, luz, chão visível e o tanque de colisão (paredes só físicas). */
function stage(app: Application): void {
    app.world.insert(
        new Camera({
            fov: Math.PI / 4,
            aspect: WIDTH / HEIGHT,
            aspectMode: 'fixed',
            near: 0.05,
            far: 20,
        }).add(
            new Transform({
                position: [0, 1.1, 1.9, 1],
                rotation: Transform.lookRotation([0, 1.1, 1.9], [0, 0.15, 0]),
            }),
        ),
    );
    app.world.insert(
        new DirectionalLight({
            direction: [-0.3, -1, -0.5, 0],
            color: [1, 1, 1, 1],
            intensity: 1.2,
        }),
    );
    const floor = new PlaneGeometry({ size: [3, 3] });
    floor.add(new StandardMaterial({ albedo: [0.3, 0.3, 0.32, 1], roughness: 0.9, metallic: 0 }));
    floor.add(new Transform({ position: [0, 0, 0, 1] }));
    app.world.insert(floor);
    tank(app);
}

const sprite = (): PointSpriteMaterial =>
    new PointSpriteMaterial({ color: [...SPRITE], radius: SPACING * 0.5 });
/** Bloco de 1000 partículas no tanque (o mesmo das trajetórias). */
const fluidBlock = (seed: number): number[] =>
    block(1000, SPACING, [-4.5 * SPACING, 0.1, -4.5 * SPACING], seed).flat();

const SCENES: readonly ParticleScene[] = [
    ...(['SPH', 'PBF', 'MPM'] as const).map(
        (algorithm, k): ParticleScene => ({
            name: algorithm === 'MPM' ? 'mpm-fluid' : algorithm.toLowerCase(),
            build: (app) => {
                stage(app);
                app.world.insert(
                    new FluidBody({ algorithm, position: fluidBlock(5 + k) }).add(sprite()),
                );
            },
        }),
    ),
    {
        name: 'mpm-solid',
        build: (app) => {
            stage(app);
            const position = block(512, SPACING, [-3.5 * SPACING, 0.3, -3.5 * SPACING], 3).flat();
            app.world.insert(new SoftBody({ algorithm: 'MPM', position }).add(sprite()));
        },
    },
];

/** Erros capturados dos estágios: qualquer um reprova o smoke. */
const engineErrors: string[] = [];

interface Capture {
    readonly early: ImageData;
    readonly late: ImageData;
    readonly readbacks: number;
    readonly profile: string;
}

/** Simula a cena e captura os quadros 30 e 90, contando as leituras de volta da GPU. */
async function run(build: (app: Application) => void, name: string): Promise<Capture> {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    document.body.appendChild(canvas);
    const app = await Application.create({
        // Antisserrilhado com que as medidas deste smoke foram calibradas (MSAA, o padrão antes da 034; o
        // temporal, padrão agora, tem o smoke `antialiasing`).
        antialias: 'msaa',
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
    });
    app.events.on('engineError', (e) => engineErrors.push(`${name}: ${e.stage}: ${e.message}`));
    let readbacks = 0;
    const readback = app.core.readback.bind(app.core);
    app.core.readback = (spec: Parameters<typeof readback>[0]) => {
        readbacks++;
        return readback(spec);
    };
    build(app);
    const ctx = new OffscreenCanvas(WIDTH, HEIGHT).getContext('2d', { willReadFrequently: true });
    if (ctx === null) throw new Error('canvas 2D indisponível');
    const grab = (): ImageData => {
        ctx.drawImage(canvas, 0, 0);
        return ctx.getImageData(0, 0, WIDTH, HEIGHT);
    };
    for (let i = 0; i < 30; i++) app.step(1 / 60);
    const early = grab();
    for (let i = 0; i < 60; i++) app.step(1 / 60);
    const late = grab();
    const profile = gpuProfile(app);
    app.dispose();
    canvas.remove();
    return { early, late, readbacks, profile };
}

/** Pixels de sprite: o vermelho do material domina (o chão e o fundo são cinzas/azulados). */
function spritePixels(img: ImageData): number {
    let n = 0;
    for (let i = 0; i < img.data.length; i += 4) {
        const r = img.data[i]!;
        const g = img.data[i + 1]!;
        const b = img.data[i + 2]!;
        if (r > 60 && r > 2.5 * g && r > 2.5 * b) n++;
    }
    return n;
}

/** Pixels distintos e maior diferença de canal entre duas imagens. */
function diff(a: ImageData, b: ImageData): { pixels: number; max: number } {
    if (a.width !== b.width || a.height !== b.height) return { pixels: Infinity, max: 255 };
    let pixels = 0;
    let max = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        let d = 0;
        for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a.data[i + k]! - b.data[i + k]!));
        if (d > 0) pixels++;
        max = Math.max(max, d);
    }
    return { pixels, max };
}

async function toPng(pixels: ImageData): Promise<Uint8Array> {
    const off = new OffscreenCanvas(pixels.width, pixels.height);
    off.getContext('2d')!.putImageData(pixels, 0, 0);
    const blob = await off.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
}

async function fromPng(bytes: Uint8Array): Promise<ImageData> {
    const bitmap = await createImageBitmap(new Blob([bytes.slice().buffer], { type: 'image/png' }));
    const off = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = off.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

/** Pixel central (RGBA). */
function center(img: ImageData): number[] {
    const i = ((HEIGHT >> 1) * WIDTH + (WIDTH >> 1)) * 4;
    return [...img.data.subarray(i, i + 4)];
}

/** Caixa na frente do centro da imagem, entre a câmera e o fluido. */
function occluder(app: Application): void {
    const box = new BoxGeometry({ size: [0.25, 0.25, 0.25] });
    box.add(new StandardMaterial({ albedo: [0.1, 0.6, 0.2, 1], roughness: 0.5, metallic: 0 }));
    box.add(new Transform({ position: [0, 0.6, 0.9, 1] }));
    app.world.insert(box);
}

async function main(): Promise<void> {
    const failures: string[] = [];
    for (const scene of SCENES) {
        const first = await run(scene.build, scene.name);
        const early = spritePixels(first.early);
        const late = spritePixels(first.late);
        const moved = diff(first.early, first.late).pixels;
        log(
            `${scene.name}: sprites ${early} → ${late} px, ${moved} px mudaram, ${first.readbacks} leituras`,
        );
        if (early < 200 || late < 200)
            failures.push(`${scene.name}: sem sprites na imagem (${early}/${late} px)`);
        if (moved === 0)
            failures.push(`${scene.name}: a imagem não mudou entre os quadros 30 e 90`);
        if (first.readbacks > 0)
            failures.push(`${scene.name}: ${first.readbacks} leituras de volta da GPU`);
        const file = `particles-${scene.name}-${first.profile}.png`;
        if (recording()) {
            const second = await run(scene.build, scene.name);
            const d = diff(first.late, second.late);
            if (d.pixels > 0) {
                failures.push(
                    `${scene.name}: duas execuções diferem (${d.pixels} pixels, máx. ${d.max})`,
                );
                continue;
            }
            await writeFixture(file, await toPng(first.late));
            log(`${scene.name}: gravada (${file})`);
            continue;
        }
        const bytes = await readFixture(file);
        if (bytes === null) {
            failures.push(`${scene.name}: sem fixture ${file} (rode com --record)`);
            continue;
        }
        const d = diff(await fromPng(bytes), first.late);
        log(
            `${scene.name}: ${d.pixels === 0 ? 'idêntica' : `${d.pixels} pixels diferentes (máx. ${d.max})`}`,
        );
        if (d.pixels > 0) failures.push(`${scene.name}: ${d.pixels} pixels diferentes`);
    }
    // Oclusão: o fluido atrás da caixa não aparece no centro.
    const sph = SCENES[0]!;
    const covered = await run((app) => {
        sph.build(app);
        occluder(app);
    }, 'occlusion');
    const alone = await run((app) => {
        stage(app);
        occluder(app);
    }, 'occlusion-ref');
    if (center(covered.late).join() !== center(alone.late).join()) {
        failures.push(
            `oclusão: centro ${center(covered.late).join(',')} ≠ ${center(alone.late).join(',')} (só a caixa)`,
        );
    } else log('oclusão: a caixa cobre o fluido no centro');
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('PARTICLES SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
