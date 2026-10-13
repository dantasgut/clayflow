// Spec 005 — Smoke de imagem (FR-041): a imagem renderizada não muda com a migração dos shaders.
//
// Três cenas determinísticas cobrem todos os shaders de render: (1) `forward` — chão, caixa e esfera com
// `StandardMaterial`, caixa com `WireframeMaterial`, luz direcional com sombra (forward + shadow_depth); (2) `post` — a
// mesma cena com toda a cadeia de pós-processamento (bloom, blur, aberração cromática, color grading, FXAA, SSAO,
// tone mapping, vinheta); (3) `ui` — a cena com painéis de UI por cima. Cada cena desenha um quadro por `app.step`, o
// canvas é lido por um canvas 2D e os pixels comparados com a fixture PNG (igualdade exata).
//   - `--record`: grava `fixtures/render-<cena>-<perfil>.png`.
//
// Para rodar: `npm run smoke -- render [--record]`. Resultado: `RENDER SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    Bloom,
    Blur,
    BoxGeometry,
    Camera,
    ChromaticAberration,
    ColorGrading,
    createScene,
    DirectionalLight,
    Fxaa,
    PlaneGeometry,
    SphereGeometry,
    Ssao,
    StandardMaterial,
    ToneMapping,
    Transform,
    UiPanel,
    Vignette,
    WireframeMaterial,
} from 'clayflow';
import { cameraMatrices } from '../../bench/engines/clayflow';
import { gpuProfile, readFixture, recording, writeFixture } from './support/fixtures';

const WIDTH = 256;
const HEIGHT = 192;

function log(msg: string): void {
    console.log(`[render] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

interface RenderScene {
    readonly name: string;
    readonly build: (app: Application) => void;
}

/**
 * Diagnóstico da spec 007 (T005, research R10): `?f32=1` calcula as matrizes da câmera arredondando cada operação a
 * `f32` (`Math.fround`), como um kernel em WGSL faria, em vez de `f64` com um arredondamento só no envio. Mede a
 * sensibilidade da imagem à troca de precisão antes de a câmera passar para a GPU.
 */
const F32_CAMERA = new URLSearchParams(location.search).get('f32') === '1';

/** `cameraMatrices` do bench com cada operação arredondada a `f32`. */
function cameraMatricesF32(
    eye: readonly [number, number, number],
    target: readonly [number, number, number],
    fovDeg: number,
    aspect: number,
    near: number,
    far: number,
): { view: number[]; projection: number[]; viewProjection: number[] } {
    const F = Math.fround;
    const len = (x: number, y: number, z: number): number =>
        F(Math.sqrt(F(F(F(x * x) + F(y * y)) + F(z * z))));
    const [ex, ey, ez] = eye.map(F) as [number, number, number];
    let zx = F(ex - F(target[0]));
    let zy = F(ey - F(target[1]));
    let zz = F(ez - F(target[2]));
    const zl = len(zx, zy, zz);
    zx = F(zx / zl);
    zy = F(zy / zl);
    zz = F(zz / zl);
    let xx = zz;
    let xy = 0;
    let xz = F(-zx);
    const xl = len(xx, xy, xz);
    xx = F(xx / xl);
    xy = F(xy / xl);
    xz = F(xz / xl);
    const yx = F(F(zy * xz) - F(zz * xy));
    const yy = F(F(zz * xx) - F(zx * xz));
    const yz = F(F(zx * xy) - F(zy * xx));
    const dot = (a: number, b: number, c: number): number =>
        F(F(F(a * ex) + F(b * ey)) + F(c * ez));
    // prettier-ignore
    const view = [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        F(-dot(xx, xy, xz)), F(-dot(yx, yy, yz)), F(-dot(zx, zy, zz)), 1];
    const f = F(1 / F(Math.tan(F(F(F(fovDeg) * F(Math.PI)) / 360))));
    const nf = F(1 / F(F(near) - F(far)));
    // prettier-ignore
    const projection = [F(f / F(aspect)), 0, 0, 0, 0, f, 0, 0, 0, 0, F(F(F(far) + F(near)) * nf), -1,
        0, 0, F(F(F(F(2 * F(far)) * F(near))) * nf), 0];
    const viewProjection = new Array<number>(16).fill(0);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            let acc = 0;
            for (let k = 0; k < 4; k++)
                acc = F(acc + F((projection[k * 4 + j] ?? 0) * (view[i * 4 + k] ?? 0)));
            viewProjection[i * 4 + j] = acc;
        }
    }
    return { view, projection, viewProjection };
}

function baseScene(app: Application): void {
    // O motor ainda não compõe a câmera (F2): as matrizes vêm do mesmo cálculo de usuário que o bench usa.
    const aspect = WIDTH / HEIGHT;
    app.world.insert(
        new Camera({
            ...(F32_CAMERA
                ? cameraMatricesF32([0, 3, 6], [0, 0, 0], 45, aspect, 0.1, 100)
                : cameraMatrices(
                      { position: [0, 3, 6], target: [0, 0, 0], fovDeg: 45 },
                      aspect,
                      0.1,
                      100,
                  )),
            position: [0, 3, 6, 1],
            fov: Math.PI / 4,
            aspect,
            near: 0.1,
            far: 100,
        }),
    );
    app.world.insert(
        new DirectionalLight({
            direction: [-0.4, -1, 0.6, 0],
            color: [1, 1, 1, 1],
            intensity: 1.5,
            castShadow: true,
        }),
    );
    const ground = new PlaneGeometry({ size: [8, 8] });
    ground.add(new StandardMaterial({ albedo: [0.6, 0.6, 0.55, 1], roughness: 0.8, metallic: 0 }));
    ground.add(new Transform({ position: [0, -0.5, 0, 1] }));
    app.world.insert(ground);

    const box = new BoxGeometry({ size: [1, 1, 1] });
    box.add(new StandardMaterial({ albedo: [0.7, 0.3, 0.2, 1], roughness: 0.3, metallic: 0.1 }));
    box.add(new Transform({ position: [-1.5, 0, 0, 1] }));
    app.world.insert(box);

    const sphere = new SphereGeometry({ radius: 0.7, segments: 24 });
    sphere.add(new StandardMaterial({ albedo: [0.2, 0.4, 0.7, 1], roughness: 0.5, metallic: 0 }));
    sphere.add(new Transform({ position: [1.5, 0, 0, 1] }));
    app.world.insert(sphere);

    const wire = new BoxGeometry({ size: [0.8, 0.8, 0.8] });
    wire.add(new WireframeMaterial({ color: [0.1, 0.9, 0.3, 1] }));
    wire.add(new Transform({ position: [0, 0.6, -1.2, 1] }));
    app.world.insert(wire);
}

const SCENES: readonly RenderScene[] = [
    { name: 'forward', build: baseScene },
    ...(
        [
            ['bloom', () => new Bloom({ strength: 0.4 })],
            ['blur', () => new Blur({})],
            ['chromatic', () => new ChromaticAberration({})],
            ['color-grading', () => new ColorGrading({})],
            ['fxaa', () => new Fxaa({})],
            ['ssao', () => new Ssao({})],
            ['tone-mapping', () => new ToneMapping({ strength: 1.0 })],
            ['vignette', () => new Vignette({ strength: 0.3 })],
        ] as const
    ).map(
        ([effect, make]): RenderScene => ({
            name: `post-${effect}`,
            build: (app) => {
                baseScene(app);
                app.defaults.post.addEffect(make());
            },
        }),
    ),
    {
        name: 'ui',
        build: (app) => {
            baseScene(app);
            const panel = new UiPanel();
            panel.bounds = { x: 16, y: 16, width: 96, height: 48 };
            panel.background = [0.1, 0.2, 0.6, 0.7];
            const inner = new UiPanel();
            inner.bounds = { x: 24, y: 24, width: 40, height: 24 };
            inner.background = [0.9, 0.8, 0.1, 0.9];
            panel.add(inner);
            app.defaults.ui.ui.add(panel);
        },
    },
];

/** Erros capturados dos estágios: qualquer um reprova o smoke. */
const engineErrors: string[] = [];

/** Renderiza a cena num quadro e devolve os pixels RGBA (lidos por um canvas 2D) e o perfil da GPU. */
async function render(scene: RenderScene): Promise<{ pixels: ImageData; profile: string }> {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
    });
    app.events.on('engineError', (e) =>
        engineErrors.push(`${scene.name}: ${e.stage}: ${e.message}`),
    );
    scene.build(app);
    // Dois quadros: o primeiro aloca e compila; o segundo desenha com tudo pronto. Leitura na mesma tarefa.
    app.step(1 / 60);
    app.step(1 / 60);
    const ctx = new OffscreenCanvas(WIDTH, HEIGHT).getContext('2d');
    if (ctx === null) throw new Error('canvas 2D indisponível');
    ctx.drawImage(canvas, 0, 0);
    const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    const profile = gpuProfile(app);
    app.dispose();
    canvas.remove();
    return { pixels, profile };
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

/** Uma imagem toda de uma cor só indica que nada foi desenhado. */
function blank(img: ImageData): boolean {
    for (let i = 4; i < img.data.length; i++) if (img.data[i] !== img.data[i % 4]) return false;
    return true;
}

async function main(): Promise<void> {
    const failures: string[] = [];
    for (const scene of SCENES) {
        const first = await render(scene);
        if (blank(first.pixels)) {
            failures.push(`${scene.name}: imagem vazia`);
            continue;
        }
        const file = `render-${scene.name}-${first.profile}.png`;
        if (recording()) {
            // Determinismo: duas renderizações seguidas precisam ser idênticas antes de gravar.
            const second = await render(scene);
            const d = diff(first.pixels, second.pixels);
            if (d.pixels > 0) {
                failures.push(
                    `${scene.name}: duas renderizações diferem (${d.pixels} pixels, máx. ${d.max})`,
                );
                continue;
            }
            await writeFixture(file, await toPng(first.pixels));
            log(`${scene.name}: gravada (${file})`);
            continue;
        }
        const bytes = await readFixture(file);
        if (bytes === null) {
            failures.push(`${scene.name}: sem fixture ${file} (rode com --record)`);
            continue;
        }
        const d = diff(await fromPng(bytes), first.pixels);
        log(
            `${scene.name}: ${d.pixels === 0 ? 'idêntica' : `${d.pixels} pixels diferentes (máx. ${d.max})`}`,
        );
        if (d.pixels > 0) failures.push(`${scene.name}: ${d.pixels} pixels diferentes`);
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('RENDER SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
