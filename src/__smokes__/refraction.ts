// Spec 034 — Smoke da refração pela estrutura de raios (US1, SC-001–SC-004).
//
// Um painel xadrez emissivo atrás de objetos de vidro, sem outras luzes nem o hemisfério (`refractionScenes.ts`): a
// radiância de cada pixel é a do painel visto pelo vidro, que a referência analítica da CPU (`refractionReference.ts`)
// recalcula. Lida no alvo HDR da cena (linear, antes da apresentação).
//   - sharp (SC-001): a esfera maciça (IOR 1,5) com a câmera encostada — ampliação local ≥ 8× (pela referência) — e as
//     bordas das casas vistas por ela sem degraus: o percentil 99 da diferença ao longo das bordas ≤ 1,2× o da mesma
//     borda vista sem vidro;
//   - reference (SC-002): esfera, bloco com absorção e o copo d'água (vidro com água dentro): cor média de cada bloco
//     de 8×8 px coberto pelo objeto a ≤ 5 % da referência;
//   - hidden (SC-003): uma esfera vermelha escondida atrás da lente (encoberta na vista direta) e outra fora do quadro
//     vista por um prisma: aparecem na refração com a cor delas (região a ≤ 5 % da referência);
//   - chain: dois vidros em fila e a reflexão interna total num bloco girado — sem pixel preto dentro dos vidros onde a
//     referência tem luz, regiões a ≤ 5 %;
//   - thin: parede fina diante do painel — as bordas no mesmo lugar da vista sem vidro (sem desvio);
//   - dispersion: a esfera com número de Abbe 20 — franjas coloridas (vermelho ≠ azul) e cada canal a ≤ 5 % da referência;
//   - rough: a esfera com rugosidade 0,3 — as bordas vistas por ela mais largas que as da lisa;
//   - cost (SC-004): o vidro num quarto da tela a 1280×720 — o desenho repetido 11 vezes com o vidro contra o mesmo
//     objeto opaco, (T_vidro − T_opaco)/11 ≤ 1,5 ms; sem transmissivo, nenhum alvo da refração alocado nem traçado;
//   - todas: nenhuma leitura de volta da GPU durante os quadros.
// Para rodar: `npm run smoke -- refraction [--query case=sharp]`. Resultado: `REFRACTION SMOKE PASSED` ou `FAIL: …`.
import * as clayflow from 'clayflow';
import { Application, createScene } from 'clayflow';
import { settle } from './support/extensionScenes';
import { writeFixture } from './support/fixtures';
import { toPng } from './support/images';
import { readHdrTexture, type HdrImage } from './support/imageMeasures';
import { repeatDispatch, wallPerFrame, warmUp } from './support/gpuTiming';
import {
    CELL,
    PANEL_BRIGHT,
    PANEL_DARK,
    PANEL_SIZE,
    PANEL_Z,
    frontCamera,
    glassFunction,
    panelScene,
    thinWallFunction,
    type Glass,
} from './support/refractionScenes';
import {
    edgeSteps,
    luminance,
    pixelRay,
    renderReference,
    traceRgb,
    type PinholeCamera,
    type RefractionScene,
    type RefractiveObject,
    type Vec3,
} from './support/refractionReference';

function log(msg: string): void {
    console.log(`[refraction] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];
let readbacksDuringFrames = 0;

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

const SIZE = 192;
const FOV = Math.PI / 3;
const PANEL = {
    z: PANEL_Z,
    cell: CELL,
    half: PANEL_SIZE / 2,
    bright: PANEL_BRIGHT,
    dark: PANEL_DARK,
};

interface SceneApp {
    readonly app: Application;
    readonly canvas: HTMLCanvasElement;
}

async function openApp(width = SIZE, height = SIZE): Promise<SceneApp> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
    });
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    return { app, canvas };
}

function close(s: SceneApp): void {
    s.app.dispose();
    s.canvas.remove();
}

/** Uma forma da referência como entidade do motor (esfera bem tesselada, caixa). */
function insertShape(
    s: SceneApp,
    shape: RefractiveObject['shape'],
    fn: clayflow.MaterialFunction,
): void {
    const lib = clayflow;
    if (shape.kind === 'sphere') {
        s.app.world.insert(
            new lib.SphereGeometry({ radius: shape.radius, latSegments: 128, lonSegments: 256 })
                .add(new lib.StandardMaterial())
                .add(fn)
                .add(new lib.Transform({ position: [...shape.center, 1] })),
        );
    } else if (shape.kind === 'box') {
        const size = [0, 1, 2].map((k) => shape.max[k]! - shape.min[k]!);
        const center = [0, 1, 2].map((k) => (shape.max[k]! + shape.min[k]!) / 2);
        s.app.world.insert(
            new lib.BoxGeometry({ size })
                .add(new lib.StandardMaterial())
                .add(fn)
                .add(new lib.Transform({ position: [...center, 1] })),
        );
    } else {
        throw new Error('cilindro não usado nas cenas do motor');
    }
}

const EMITTER_CODE = `return closure_emission(data.color, 1.0);`;

function emitterFunction(color: Vec3): clayflow.MaterialFunction {
    return new clayflow.MaterialFunction({
        code: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n${EMITTER_CODE}\n}`,
        params: { color: 'vec3f' },
        values: { color: [...color] },
        lobes: ['emission'],
    });
}

/** Monta a cena da referência no motor: painel, câmera, objetos de vidro e emissores. */
async function buildScene(scene: RefractionScene, cam: PinholeCamera): Promise<SceneApp> {
    const s = await openApp(cam.width, cam.height);
    panelScene(clayflow, s.app);
    frontCamera(clayflow, s.app, cam.eye[2], cam.fov);
    for (const obj of scene.objects) {
        const g: Glass = {
            ior: obj.medium.ior,
            ...(obj.medium.color !== undefined ? { color: obj.medium.color } : {}),
            ...(obj.medium.depth !== undefined ? { depth: obj.medium.depth } : {}),
            ...(obj.medium.abbe !== undefined ? { abbe: obj.medium.abbe } : {}),
        };
        insertShape(s, obj.shape, glassFunction(clayflow, g));
    }
    for (const e of scene.emitters ?? []) insertShape(s, e.shape, emitterFunction(e.radiance));
    return s;
}

/** A imagem HDR depois de compilar tudo e estabilizar. */
async function render(s: SceneApp): Promise<HdrImage> {
    await warmUp(s.app, { frames: 4 });
    await settle(s.app, 300);
    const before = readbacksDuringFrames;
    const readback = s.app.core.readback.bind(s.app.core);
    s.app.core.readback = (spec: Parameters<typeof readback>[0]) => {
        readbacksDuringFrames++;
        return readback(spec);
    };
    for (let i = 0; i < 4; i++) s.app.step(1 / 60);
    s.app.core.readback = readback;
    if (readbacksDuringFrames !== before) failures.push('leituras de volta durante os quadros');
    const texture = s.app.resources.textureOf(s.app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    return readHdrTexture(s.app, texture);
}

/** O objeto da cena que o raio do pixel atinge primeiro (−1: nenhum) — a máscara dos blocos. */
function firstObject(scene: RefractionScene, cam: PinholeCamera, x: number, y: number): number {
    const { o, d } = pixelRay(cam, x, y);
    let best = Infinity;
    let hit = -1;
    scene.objects.forEach((obj, i) => {
        const t = hitDistance(obj.shape, o, d);
        if (t < best) {
            best = t;
            hit = i;
        }
    });
    return hit;
}

/** O raio reto cruza a forma (em qualquer ponto à frente). */
function crosses(shape: RefractiveObject['shape'], o: Vec3, d: Vec3): boolean {
    if (shape.kind === 'sphere') {
        const oc = [o[0] - shape.center[0], o[1] - shape.center[1], o[2] - shape.center[2]];
        const b = oc[0]! * d[0] + oc[1]! * d[1] + oc[2]! * d[2];
        const c = oc[0]! ** 2 + oc[1]! ** 2 + oc[2]! ** 2 - shape.radius ** 2;
        return b * b - c >= 0 && -b + Math.sqrt(Math.max(b * b - c, 0)) > 0;
    }
    if (shape.kind === 'box') {
        let t0 = -Infinity;
        let t1 = Infinity;
        for (let a = 0; a < 3; a++) {
            const inv = 1 / d[a]!;
            let ta = (shape.min[a]! - o[a]!) * inv;
            let tb = (shape.max[a]! - o[a]!) * inv;
            if (ta > tb) [ta, tb] = [tb, ta];
            t0 = Math.max(t0, ta);
            t1 = Math.min(t1, tb);
        }
        return t0 <= t1 && t1 > 0;
    }
    return false;
}

function hitDistance(shape: RefractiveObject['shape'], o: Vec3, d: Vec3): number {
    if (shape.kind === 'sphere') {
        const oc = [o[0] - shape.center[0], o[1] - shape.center[1], o[2] - shape.center[2]];
        const b = oc[0]! * d[0] + oc[1]! * d[1] + oc[2]! * d[2];
        const c = oc[0]! ** 2 + oc[1]! ** 2 + oc[2]! ** 2 - shape.radius ** 2;
        const disc = b * b - c;
        if (disc < 0) return Infinity;
        const t = -b - Math.sqrt(disc);
        return t > 0 ? t : Infinity;
    }
    if (shape.kind === 'box') {
        let t0 = -Infinity;
        let t1 = Infinity;
        for (let a = 0; a < 3; a++) {
            const inv = 1 / d[a]!;
            let ta = (shape.min[a]! - o[a]!) * inv;
            let tb = (shape.max[a]! - o[a]!) * inv;
            if (ta > tb) [ta, tb] = [tb, ta];
            t0 = Math.max(t0, ta);
            t1 = Math.min(t1, tb);
        }
        return t0 <= t1 && t0 > 0 ? t0 : Infinity;
    }
    return Infinity;
}

/**
 * Compara blocos de 8×8 px no interior dos objetos entre a imagem do motor e a da referência: o bloco e a vizinhança de
 * um bloco em volta com a mesma assinatura (os objetos que o raio direto do pixel atravessa) — longe das silhuetas e das
 * paredes, onde um pixel de diferença na borda pesa no bloco inteiro. O maior erro relativo da média por canal (dos
 * blocos com luz), e quantos blocos.
 */
function compareBlocks(
    img: HdrImage,
    ref: Float32Array,
    scene: RefractionScene,
    cam: PinholeCamera,
    channel?: number,
): { worst: number; blocks: number; where: string } {
    let worst = 0;
    let blocks = 0;
    let where = '';
    const B = 8;
    const signature = new Int32Array(cam.width * cam.height);
    for (let y = 0; y < cam.height; y++)
        for (let x = 0; x < cam.width; x++) {
            const { o, d } = pixelRay(cam, x, y);
            let sig = 0;
            scene.objects.forEach((obj, i) => {
                if (crosses(obj.shape, o, d)) sig |= 1 << i;
            });
            signature[y * cam.width + x] = sig;
        }
    for (let by = B; by + 2 * B <= cam.height; by += B)
        for (let bx = B; bx + 2 * B <= cam.width; bx += B) {
            const sig = signature[by * cam.width + bx]!;
            if (sig === 0) continue;
            let same = true;
            for (let y = by - B; y < by + 2 * B && same; y++)
                for (let x = bx - B; x < bx + 2 * B && same; x++)
                    if (signature[y * cam.width + x] !== sig) same = false;
            if (!same) continue;
            const channels = channel === undefined ? [0, 1, 2] : [channel];
            for (const k of channels) {
                let a = 0;
                let r = 0;
                for (let y = by; y < by + B; y++)
                    for (let x = bx; x < bx + B; x++) {
                        a += img.data[(y * img.width + x) * 4 + k]!;
                        r += ref[(y * cam.width + x) * 3 + k]!;
                    }
                if (r < 0.05 * B * B) continue;
                const e = Math.abs(a - r) / r;
                if (e > worst) {
                    worst = e;
                    where = `bloco (${bx}, ${by}) canal ${k}: motor ${(a / (B * B)).toFixed(3)}, referência ${(r / (B * B)).toFixed(3)}`;
                }
            }
            blocks++;
        }
    return { worst, blocks, where };
}

const LENS: RefractiveObject = {
    shape: { kind: 'sphere', center: [0, 0, 0], radius: 0.5 },
    medium: { ior: 1.5 },
};

/**
 * Ampliação local da imagem do painel pela lente (esfera de raio 0,5 em z = `lensZ`) no centro da imagem (referência):
 * o painel percorrido por pixel na vista direta ÷ pela lente.
 */
function magnification(
    camera: PinholeCamera,
    lensZ: number,
    px = camera.width / 2,
    py = camera.height / 2,
): number {
    // Coordenadas com a lente na origem.
    const cam: PinholeCamera = {
        ...camera,
        eye: [camera.eye[0], camera.eye[1], camera.eye[2] - lensZ],
    };
    const panelZ = PANEL_Z - lensZ;
    // A posição no painel aonde chega o raio do pixel, pela lente; a direta é a do raio sem a lente.
    const exit = (x: number, y: number, lens: boolean): number => {
        const { o, d } = pixelRay(cam, x, y);
        if (!lens) return o[0] + (d[0] * (panelZ - o[2])) / d[2];
        // Segue o raio pela esfera com Snell (canal verde) até o painel.
        let p: Vec3 = o;
        let dir: Vec3 = d;
        for (let k = 0; k < 2; k++) {
            const t = k === 0 ? hitDistance(LENS.shape, p, dir) : exitDistance(p, dir);
            if (!Number.isFinite(t)) break;
            const q: Vec3 = [p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t];
            const r = Math.hypot(...q);
            const nOut: Vec3 = [q[0] / r, q[1] / r, q[2] / r];
            const n: Vec3 = k === 0 ? nOut : [-nOut[0], -nOut[1], -nOut[2]];
            const eta = k === 0 ? 1 / 1.5 : 1.5;
            const cosi = -(n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2]);
            const sin2 = eta * eta * (1 - cosi * cosi);
            if (sin2 > 1) break;
            const cost = Math.sqrt(1 - sin2);
            dir = [
                eta * dir[0] + (eta * cosi - cost) * n[0],
                eta * dir[1] + (eta * cosi - cost) * n[1],
                eta * dir[2] + (eta * cosi - cost) * n[2],
            ];
            p = [q[0] + dir[0] * 1e-5, q[1] + dir[1] * 1e-5, q[2] + dir[2] * 1e-5];
        }
        return p[0] + (dir[0] * (panelZ - p[2])) / dir[2];
    };
    const direct = Math.abs(exit(px + 1, py, false) - exit(px - 1, py, false));
    const lens = Math.abs(exit(px + 1, py, true) - exit(px - 1, py, true));
    return direct / Math.max(lens, 1e-9);
}

function exitDistance(o: Vec3, d: Vec3): number {
    const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
    const c = o[0] ** 2 + o[1] ** 2 + o[2] ** 2 - 0.25;
    const disc = b * b - c;
    return disc < 0 ? Infinity : -b + Math.sqrt(disc);
}

const contrast = PANEL_BRIGHT - PANEL_DARK;

/** Com `?dump=1`, grava a imagem (tons por Reinhard) em `zz-refraction-<nome>.png` para inspeção — fora das fixtures. */
async function dump(name: string, img: HdrImage): Promise<void> {
    if (new URLSearchParams(location.search).get('dump') !== '1') return;
    const out = new ImageData(img.width, img.height);
    for (let i = 0; i < img.width * img.height; i++)
        for (let k = 0; k < 3; k++) {
            const v = img.data[i * 4 + k]!;
            out.data[i * 4 + k] = Math.round(255 * Math.pow(v / (1 + v), 1 / 2.2));
        }
    for (let i = 0; i < img.width * img.height; i++) out.data[i * 4 + 3] = 255;
    await writeFixture(`zz-refraction-${name}.png`, await toPng(out));
}

async function caseSharp(): Promise<void> {
    // Lupa: o painel um pouco dentro do foco da esfera (0,75 do centro) e a câmera longe, com o campo estreito — a lente
    // cobre o quadro e a imagem virtual do painel chega ampliada; casas pequenas para haver bordas na imagem ampliada.
    const lensZ = PANEL_Z + 0.73;
    const eye = 7;
    const fov = 2 * Math.atan(0.55 / eye);
    const cell = 0.02;
    const cam: PinholeCamera = { eye: [0, 0, lensZ + eye], fov, width: SIZE, height: SIZE };
    const m = magnification(cam, lensZ);
    log(`sharp: ampliação local da lente no centro ${m.toFixed(1)}× (referência)`);
    check(m >= 8, `sharp: a cena não amplia o bastante (${m.toFixed(1)}× < 8×)`);
    const s = await openApp();
    panelScene(clayflow, s.app, cell);
    frontCamera(clayflow, s.app, cam.eye[2], fov);
    insertShape(
        s,
        { kind: 'sphere', center: [0, 0, lensZ], radius: 0.5 },
        glassFunction(clayflow, { ior: 1.5 }),
    );
    const img = await render(s);
    close(s);
    await dump('sharp', img);
    // As bordas onde a lente amplia ≥ 8× (pela referência, pixel a pixel): o que a cópia da tela mostrava em blocos.
    const magnified = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++)
            magnified[y * SIZE + x] = magnification(cam, lensZ, x, y) >= 8 ? 1 : 0;
    const inside = (x: number, y: number): boolean => magnified[y * SIZE + x] === 1;
    const glass = edgeSteps(
        luminance(img.data, SIZE, SIZE, 4),
        SIZE,
        SIZE,
        contrast * 0.85,
        inside,
    );
    // A mesma borda sem vidro: o painel direto, com a câmera recuada para as casas terem o tamanho das ampliadas.
    const d = await openApp();
    panelScene(clayflow, d.app, cell);
    frontCamera(clayflow, d.app, PANEL_Z + (cam.eye[2] - PANEL_Z) / m, fov);
    const direct = await render(d);
    close(d);
    await dump('sharp-direct', direct);
    const plain = edgeSteps(luminance(direct.data, SIZE, SIZE, 4), SIZE, SIZE, contrast, inside);
    const ratio = glass.p99 / Math.max(plain.p99, 1e-3);
    log(
        `sharp: degraus ao longo das bordas (p99/contraste) — pela lente ${glass.p99.toFixed(3)} (${glass.count} px de borda), direta ${plain.p99.toFixed(3)} (${plain.count} px) → ${ratio.toFixed(2)}×`,
    );
    check(glass.count >= 50, `sharp: poucas bordas pela lente (${glass.count} px)`);
    check(
        ratio <= 1.2,
        `sharp: degraus pela lente ${ratio.toFixed(2)}× os da borda direta (≤ 1,2×)`,
    );
}

async function compareScene(
    name: string,
    scene: RefractionScene,
    cam: PinholeCamera,
    channel?: number,
): Promise<HdrImage> {
    const s = await buildScene(scene, cam);
    const img = await render(s);
    close(s);
    await dump(name.replace('/', '-'), img);
    const ref = renderReference(scene, cam);
    const c = compareBlocks(img, ref, scene, cam, channel);
    log(
        `${name}: ${c.blocks} blocos cobertos, maior erro da média ${(100 * c.worst).toFixed(2)} % da referência (${c.where})`,
    );
    check(c.blocks >= 4, `${name}: poucos blocos comparados (${c.blocks})`);
    check(c.worst <= 0.05, `${name}: erro ${(100 * c.worst).toFixed(2)} % da referência (≤ 5 %)`);
    return img;
}

async function caseReference(): Promise<void> {
    const cam: PinholeCamera = { eye: [0, 0, 2.2], fov: FOV, width: SIZE, height: SIZE };
    await compareScene('reference/sphere', { panel: PANEL, objects: [LENS] }, cam);
    await compareScene(
        'reference/absorbing-block',
        {
            panel: PANEL,
            objects: [
                {
                    shape: { kind: 'box', min: [-0.6, -0.6, -0.3], max: [0.6, 0.6, 0.3] },
                    medium: { ior: 1.5, color: [0.4, 0.75, 1], depth: 0.6 },
                },
            ],
        },
        cam,
    );
    // O copo d'água: vidro de paredes de 4 cm com água dentro (os meios aninhados).
    await compareScene(
        'reference/water-glass',
        {
            panel: PANEL,
            objects: [
                {
                    shape: { kind: 'box', min: [-0.4, -0.5, -0.4], max: [0.4, 0.5, 0.4] },
                    medium: { ior: 1.5 },
                },
                {
                    shape: { kind: 'box', min: [-0.36, -0.46, -0.36], max: [0.36, 0.46, 0.36] },
                    medium: { ior: 1.333, color: [0.7, 0.9, 1], depth: 1.5 },
                },
            ],
        },
        cam,
    );
}

async function caseHidden(): Promise<void> {
    const cam: PinholeCamera = { eye: [0, 0, 2.2], fov: FOV, width: SIZE, height: SIZE };
    // Atrás da lente (encoberta na vista direta) e fora do quadro, vista por um prisma inclinado na borda.
    const scene: RefractionScene = {
        panel: PANEL,
        objects: [LENS],
        emitters: [
            {
                shape: { kind: 'sphere', center: [0, 0, -1.2], radius: 0.18 },
                radiance: [3, 0.2, 0.2],
            },
        ],
    };
    // A esfera vermelha fica escondida atrás da lente na vista direta: o raio do centro atinge a lente primeiro.
    check(firstObject(scene, cam, SIZE / 2, SIZE / 2) === 0, 'hidden: a cena não esconde a esfera');
    const img = await compareScene('hidden/behind-lens', scene, cam);
    // A cor vermelha aparece no centro (a lente mostra o que está atrás dela).
    const c = (SIZE / 2) | 0;
    const i = (c * SIZE + c) * 4;
    const ray = pixelRay(cam, c, c);
    const ref = traceRgb(scene, ray.o, ray.d);
    log(
        `hidden: centro da lente — motor (${img.data[i]!.toFixed(2)}, ${img.data[i + 1]!.toFixed(2)}, ${img.data[i + 2]!.toFixed(2)}), referência (${ref.map((v) => v.toFixed(2)).join(', ')})`,
    );
    check(img.data[i]! > 3 * img.data[i + 1]!, 'hidden: a esfera escondida não aparece pela lente');
    // Fora do quadro: um bloco de vidro girado desvia a vista para uma esfera verde à direita, fora do campo.
    const off: RefractionScene = {
        panel: PANEL,
        objects: [
            {
                shape: { kind: 'box', min: [0.35, -0.3, -0.3], max: [0.95, 0.3, 0.3] },
                medium: { ior: 1.5 },
            },
        ],
        emitters: [
            {
                shape: { kind: 'sphere', center: [2.6, 0, -1.5], radius: 0.5 },
                radiance: [0.2, 3, 0.2],
            },
        ],
    };
    await compareScene('hidden/off-frame', off, cam);
}

async function caseChain(): Promise<void> {
    const cam: PinholeCamera = { eye: [0, 0, 2.6], fov: FOV, width: SIZE, height: SIZE };
    const scene: RefractionScene = {
        panel: PANEL,
        objects: [
            { shape: { kind: 'sphere', center: [0, 0, 0.4], radius: 0.35 }, medium: { ior: 1.5 } },
            { shape: { kind: 'sphere', center: [0, 0, -0.6], radius: 0.45 }, medium: { ior: 1.5 } },
        ],
    };
    const img = await compareScene('chain/two-spheres', scene, cam);
    const ref = renderReference(scene, cam);
    let black = 0;
    for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
            if (firstObject(scene, cam, x, y) < 0) continue;
            const k = y * SIZE + x;
            const r = ref[k * 3 + 1]!;
            if (r > 0.05 && img.data[k * 4 + 1]! < 0.02) black++;
        }
    log(`chain: ${black} px pretos dentro dos vidros onde a referência tem luz`);
    check(black <= SIZE * SIZE * 0.002, `chain: ${black} px pretos dentro dos vidros`);
}

async function caseThin(): Promise<void> {
    const s = await openApp();
    panelScene(clayflow, s.app);
    frontCamera(clayflow, s.app, 2, FOV);
    s.app.world.insert(
        new clayflow.PlaneGeometry({ size: [1.4, 1.4] })
            .add(new clayflow.StandardMaterial())
            .add(thinWallFunction(clayflow, 1.5))
            .add(
                new clayflow.Transform({
                    position: [0, 0, 0, 1],
                    rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
                }),
            ),
    );
    const thin = await render(s);
    close(s);
    await dump('thin', thin);
    const d = await openApp();
    panelScene(clayflow, d.app);
    frontCamera(clayflow, d.app, 2, FOV);
    const direct = await render(d);
    close(d);
    // Na linha do meio, as trocas de casa nos mesmos lugares (± 1 px).
    const row = SIZE / 2;
    const transitions = (img: HdrImage): number[] => {
        const out: number[] = [];
        let prev = -1;
        for (let x = Math.round(SIZE * 0.3); x < Math.round(SIZE * 0.7); x++) {
            const l = img.data[(row * SIZE + x) * 4 + 1]!;
            const v = l > 0.45 * (PANEL_BRIGHT + PANEL_DARK) ? 1 : 0;
            if (prev >= 0 && v !== prev) out.push(x);
            prev = v;
        }
        return out;
    };
    const a = transitions(thin);
    const b = transitions(direct);
    const shifted = a.length !== b.length || a.some((x, k) => Math.abs(x - b[k]!) > 1);
    log(`thin: trocas na linha — parede fina ${a.join(',')}; direta ${b.join(',')}`);
    check(a.length >= 2, 'thin: o painel não aparece pela parede fina');
    check(!shifted, 'thin: a parede fina desviou o fundo');
}

async function caseDispersion(): Promise<void> {
    const cam: PinholeCamera = { eye: [0, 0, 2.2], fov: FOV, width: SIZE, height: SIZE };
    const scene: RefractionScene = {
        panel: PANEL,
        objects: [{ shape: LENS.shape, medium: { ior: 1.5, abbe: 20 } }],
    };
    const img = await compareScene('dispersion/red', scene, cam, 0);
    await compareScene('dispersion/blue', scene, cam, 2);
    let fringe = 0;
    for (let k = 0; k < SIZE * SIZE; k++)
        fringe += Math.abs(img.data[k * 4]! - img.data[k * 4 + 2]!);
    log(`dispersion: franja média |R − B| ${(fringe / (SIZE * SIZE)).toFixed(4)}`);
    check(fringe / (SIZE * SIZE) > 0.005, 'dispersion: sem franjas coloridas');
}

async function caseRough(): Promise<void> {
    const cam: PinholeCamera = { eye: [0, 0, 1.6], fov: FOV, width: SIZE, height: SIZE };
    const stats: { grad: number; mean: number }[] = [];
    for (const rough of [0, 0.15, 0.3]) {
        const s = await openApp();
        panelScene(clayflow, s.app);
        frontCamera(clayflow, s.app, cam.eye[2], FOV);
        insertShape(s, LENS.shape, glassFunction(clayflow, { ior: 1.5, rough }));
        const img = await render(s);
        close(s);
        await dump(`rough-${rough}`, img);
        const lum = luminance(img.data, SIZE, SIZE, 4);
        // Dentro da lente: o gradiente forte (p95 da diferença entre vizinhos) e a média — borrar tira as bordas sem
        // apagar a luz.
        const grads: number[] = [];
        let sum = 0;
        let n = 0;
        for (let y = 1; y < SIZE - 1; y++)
            for (let x = 1; x < SIZE - 1; x++) {
                if ((x - SIZE / 2) ** 2 + (y - SIZE / 2) ** 2 >= (SIZE * 0.22) ** 2) continue;
                const l = lum[y * SIZE + x]!;
                grads.push(
                    Math.max(
                        Math.abs(lum[y * SIZE + x + 1]! - l),
                        Math.abs(lum[(y + 1) * SIZE + x]! - l),
                    ),
                );
                sum += l;
                n++;
            }
        grads.sort((p, q) => p - q);
        stats.push({ grad: grads[Math.floor(grads.length * 0.95)]!, mean: sum / Math.max(n, 1) });
    }
    log(
        `rough: dentro da lente, gradiente p95 — lisa ${stats[0]!.grad.toFixed(3)}, 0,15 ${stats[1]!.grad.toFixed(3)}, 0,3 ${stats[2]!.grad.toFixed(3)}; média ${stats.map((t) => t.mean.toFixed(2)).join(' / ')}`,
    );
    check(
        stats[1]!.grad < stats[0]!.grad && stats[2]!.grad < stats[1]!.grad,
        'rough: o desfoque não cresce com a rugosidade',
    );
    check(stats[2]!.grad < 0.5 * stats[0]!.grad, 'rough: a rugosidade 0,3 não borrou a refração');
    check(
        stats.every((t) => Math.abs(t.mean - stats[0]!.mean) <= 0.15 * stats[0]!.mean),
        'rough: o desfoque mudou a luz média que atravessa',
    );
}

async function caseCost(): Promise<void> {
    const W = 1280;
    const H = 720;
    const measure = async (glass: boolean): Promise<number> => {
        const s = await openApp(W, H);
        panelScene(clayflow, s.app);
        frontCamera(clayflow, s.app, 2.6, FOV);
        // A esfera cobre cerca de um quarto da tela.
        const fn = glass
            ? glassFunction(clayflow, { ior: 1.5 })
            : new clayflow.MaterialFunction({
                  code: 'fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n    return closure_diffuse(vec3f(0.8), 0.0);\n}',
                  lobes: ['diffuse'],
              });
        insertShape(s, { kind: 'sphere', center: [0, 0, 0], radius: 0.62 }, fn);
        await warmUp(s.app);
        let times = 11;
        const restore = repeatDispatch(clayflow.ForwardFlow, () => times);
        const t = await wallPerFrame(s.app, 40);
        times = 1;
        restore();
        if (!glass) {
            const targets = s.app.defaults.targets;
            check(
                s.app.resources.textureOf(targets, 'refractionRadiance') === undefined,
                'cost: sem transmissivo, a radiância da refração foi alocada',
            );
        }
        close(s);
        return t;
    };
    const opaque = await measure(false);
    const glass = await measure(true);
    const cost = Math.max(0, (glass - opaque) / 11);
    log(
        `cost: desenho 11× por quadro a 1280×720 — com o vidro ${glass.toFixed(2)} ms, opaco ${opaque.toFixed(2)} ms → refração ${cost.toFixed(2)} ms/quadro`,
    );
    check(cost <= 1.5, `cost: refração a ${cost.toFixed(2)} ms/quadro (≤ 1,5 ms)`);
}

const CASES: Record<string, () => Promise<void>> = {
    sharp: caseSharp,
    reference: caseReference,
    hidden: caseHidden,
    chain: caseChain,
    thin: caseThin,
    dispersion: caseDispersion,
    rough: caseRough,
    cost: caseCost,
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        log(`▸ ${name}`);
        await run();
    }
}

main()
    .then(() => {
        for (const e of engineErrors) failures.push(`engineError: ${e}`);
        if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
        else log('REFRACTION SMOKE PASSED');
    })
    .catch((err: unknown) => {
        log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    });
