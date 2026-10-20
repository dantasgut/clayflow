// Spec 008 — Smoke de corpo mole desenhado como malha (US3, SC-001).
//
// Um tecido XPBD 32 × 32 (arestas estruturais e de cisalhamento, preso pelos dois cantos de trás) com `surface`: a
// `SurfaceGeometry` dele é escrita na GPU a cada quadro (`SoftSurfaceFlow`: normais de face e vértices) e desenhada
// pelo forward com `StandardMaterial`, sob uma luz direcional com sombra. E um bloco FEM de 64 nós como sprites.
// Verifica, por cena: a malha (ou os sprites) aparece nos dois quadros capturados (tecido: 30 e 120; FEM, em queda
// livre: 10 e 25) e a imagem muda entre eles; 0 leituras de volta; o último quadro igual à fixture `softSurface-<cena>-<perfil>.png`. No tecido, a sombra
// dele escurece o chão (pixels cinza mais escuros que na mesma cena sem o tecido).
//
// Para rodar: `npm run smoke -- softSurface [--record]`. Resultado: `SOFT SURFACE SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    Camera,
    createScene,
    DirectionalLight,
    GravityField,
    PlaneGeometry,
    PointSpriteMaterial,
    SoftBody,
    StandardMaterial,
    Transform,
} from 'clayflow';
import { gpuProfile, readFixture, recording, writeFixture } from './support/fixtures';
import { block } from './support/particleScenes';

const WIDTH = 256;
const HEIGHT = 192;
const SIDE = 32;
const SPACING = 0.05;

function log(msg: string): void {
    console.log(`[softSurface] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

/** Câmera, luz com sombra, chão e gravidade. */
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
                position: [0, 1.2, 3.2, 1],
                rotation: Transform.lookRotation([0, 1.2, 3.2], [0, 0.6, 0]),
            }),
        ),
    );
    app.world.insert(
        new DirectionalLight({
            direction: [-0.2, -1, -0.4, 0],
            color: [1, 1, 1, 1],
            intensity: 1.3,
            castShadow: true,
        }),
    );
    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    const floor = new PlaneGeometry({ size: [4, 4] });
    floor.add(new StandardMaterial({ albedo: [0.5, 0.5, 0.5, 1], roughness: 0.9, metallic: 0 }));
    floor.add(new Transform({ position: [0, 0, 0, 1] }));
    app.world.insert(floor);
}

/** Tecido horizontal a 1,4 m, preso pelos dois cantos de trás; arestas estruturais e de cisalhamento; malha de triângulos. */
function cloth(app: Application): void {
    const position: number[] = [];
    const mass: number[] = [];
    const uvs: number[] = [];
    for (let j = 0; j < SIDE; j++) {
        for (let i = 0; i < SIDE; i++) {
            position.push((i - (SIDE - 1) / 2) * SPACING, 1.4, (j - (SIDE - 1) / 2) * SPACING);
            mass.push(j === 0 && (i === 0 || i === SIDE - 1) ? 0 : 0.01);
            uvs.push(i / (SIDE - 1), j / (SIDE - 1));
        }
    }
    const at = (i: number, j: number): number => j * SIDE + i;
    const a: number[] = [];
    const b: number[] = [];
    const triangles: number[] = [];
    for (let j = 0; j < SIDE; j++) {
        for (let i = 0; i < SIDE; i++) {
            if (i + 1 < SIDE) {
                a.push(at(i, j));
                b.push(at(i + 1, j));
            }
            if (j + 1 < SIDE) {
                a.push(at(i, j));
                b.push(at(i, j + 1));
            }
            if (i + 1 < SIDE && j + 1 < SIDE) {
                a.push(at(i, j), at(i + 1, j));
                b.push(at(i + 1, j + 1), at(i, j + 1));
                // Anti-horário visto de cima (+y).
                triangles.push(
                    at(i, j),
                    at(i, j + 1),
                    at(i + 1, j),
                    at(i + 1, j),
                    at(i, j + 1),
                    at(i + 1, j + 1),
                );
            }
        }
    }
    app.world.insert(
        new SoftBody({
            algorithm: 'XPBD',
            position,
            mass,
            edges: { a, b },
            surface: { triangles, uvs },
        })
            .add(new StandardMaterial({ albedo: [0.8, 0.25, 0.2, 1], roughness: 0.7, metallic: 0 }))
            .add(new Transform()),
    );
}

interface Scene {
    readonly name: string;
    readonly build: (app: Application) => void;
    /** Pixels do corpo na imagem (pela cor). */
    readonly pixels: (img: ImageData) => number;
    /** Quadros capturados (o primeiro e o comparado com a fixture). */
    readonly frames: readonly [number, number];
}

/** Pixels avermelhados (o tecido e os sprites são vermelhos; o resto é cinza ou azulado). */
function reddish(img: ImageData): number {
    let n = 0;
    for (let i = 0; i < img.data.length; i += 4) {
        const r = img.data[i]!;
        if (r > 40 && r > 1.8 * img.data[i + 1]! && r > 1.8 * img.data[i + 2]!) n++;
    }
    return n;
}

const SCENES: readonly Scene[] = [
    {
        name: 'xpbd-cloth',
        build: (app) => {
            stage(app);
            cloth(app);
        },
        pixels: reddish,
        frames: [30, 120],
    },
    {
        name: 'fem-sprites',
        build: (app) => {
            stage(app);
            // O FEM só integra a gravidade (sem colisão, F5): o bloco cai livre — capturado no começo da queda.
            const position = block(64, 0.1, [-0.15, 1.6, -0.15], 2).flat();
            app.world.insert(
                new SoftBody({ algorithm: 'FEM', position, mass: 0.05 }).add(
                    new PointSpriteMaterial({ color: [1, 0.15, 0.1, 1], radius: 0.04 }),
                ),
            );
        },
        pixels: reddish,
        frames: [10, 25],
    },
];

const engineErrors: string[] = [];

interface Capture {
    readonly early: ImageData;
    readonly late: ImageData;
    readonly readbacks: number;
    readonly profile: string;
}

async function run(
    build: (app: Application) => void,
    name: string,
    frames: readonly [number, number] = [30, 120],
): Promise<Capture> {
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
    for (let i = 0; i < frames[0]; i++) app.step(1 / 60);
    const early = grab();
    for (let i = frames[0]; i < frames[1]; i++) app.step(1 / 60);
    const late = grab();
    const profile = gpuProfile(app);
    app.dispose();
    canvas.remove();
    return { early, late, readbacks, profile };
}

function diff(a: ImageData, b: ImageData): { pixels: number; max: number } {
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

/** Pixels cinza (chão) mais escuros que os da referência na mesma posição: a sombra do corpo. */
function shadowed(img: ImageData, ref: ImageData): number {
    let n = 0;
    for (let i = 0; i < img.data.length; i += 4) {
        const r = img.data[i]!;
        const g = img.data[i + 1]!;
        const b = img.data[i + 2]!;
        const gray = Math.abs(r - g) < 8 && Math.abs(g - b) < 8;
        if (gray && r + 12 < ref.data[i]!) n++;
    }
    return n;
}

async function toPng(pixels: ImageData): Promise<Uint8Array> {
    const off = new OffscreenCanvas(pixels.width, pixels.height);
    off.getContext('2d')!.putImageData(pixels, 0, 0);
    return new Uint8Array(await (await off.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

async function fromPng(bytes: Uint8Array): Promise<ImageData> {
    const bitmap = await createImageBitmap(new Blob([bytes.slice().buffer], { type: 'image/png' }));
    const off = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = off.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

async function main(): Promise<void> {
    const failures: string[] = [];
    const empty = await run(stage, 'empty');
    const emptyAt = new Map<number, ImageData>([[120, empty.late]]);
    for (const scene of SCENES) {
        const first = await run(scene.build, scene.name, scene.frames);
        const early = scene.pixels(first.early);
        const late = scene.pixels(first.late);
        const moved = diff(first.early, first.late).pixels;
        const ref = emptyAt.get(scene.frames[1]);
        const shadow = ref === undefined ? 0 : shadowed(first.late, ref);
        log(
            `${scene.name}: corpo ${early} → ${late} px, ${moved} px mudaram, sombra ${shadow} px, ${first.readbacks} leituras`,
        );
        if (early < 100 || late < 100)
            failures.push(`${scene.name}: o corpo não aparece (${early}/${late} px)`);
        if (moved === 0)
            failures.push(
                `${scene.name}: a imagem não mudou entre os quadros ${scene.frames[0]} e ${scene.frames[1]}`,
            );
        if (first.readbacks > 0)
            failures.push(`${scene.name}: ${first.readbacks} leituras de volta da GPU`);
        if (scene.name === 'xpbd-cloth' && shadow < 100)
            failures.push(`${scene.name}: sem sombra no chão (${shadow} px)`);
        const file = `softSurface-${scene.name}-${first.profile}.png`;
        if (recording()) {
            const second = await run(scene.build, scene.name, scene.frames);
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
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('SOFT SURFACE SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
