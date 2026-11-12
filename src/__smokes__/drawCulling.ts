// Spec 034 (T060d) — Smoke do desenho conduzido pela GPU: o descarte das instâncias do desenho principal pelo tronco da
// câmera e pela oclusão em duas fases (a hierarquia de profundidade do quadro anterior, pela série, e a deste quadro).
// Uma parede de frente para a câmera, caixas atrás dela (escondidas), na frente (visíveis), fora dos lados do tronco e
// atrás da câmera, todas do mesmo grupo de desenho (a mesma geometria e o mesmo material).
//
//   (a) contagem: as instâncias desenhadas do grupo das caixas (os argumentos indiretos lidos de volta) são as da
//       referência f64 (`elements/render/reference/drawCull.ts`: o tronco e a oclusão pela hierarquia montada de uma
//       profundidade traçada na CPU), as escondidas e as de fora descartadas;
//   (b) nada visível some: a imagem com o descarte é a imagem sem ele (`FrameTargets.culling`), parada e no primeiro
//       quadro depois de um salto da câmera que revela o que estava escondido (a fase 2 desenha o que a hierarquia do
//       quadro anterior escondia);
//   (c) custo: com 20 mil caixas atrás da parede, o tempo de GPU do desenho com o descarte contra sem ele, por perfil.
//
// Para rodar: `npm run smoke -- drawCulling`. Resultado: `DRAWCULLING SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    BoxGeometry,
    Camera,
    createScene,
    StandardMaterial,
    Transform,
} from 'clayflow/web';
import type { RenderProfile, StagingBufferSpec } from 'clayflow/web';
import {
    buildHzb,
    frustumPlanes,
    occluded,
    outsideFrustum,
    worldBox,
} from '../elements/render/reference/drawCull';
import { mat4Multiply, type Vec3 } from '../elements/math/reference/xform';
import { nextGpuFrame } from './support/extensionScenes';
import { readHdrTexture } from './support/imageMeasures';

const WIDTH = 640;
const HEIGHT = 360;
const FOV = Math.PI / 3;
const NEAR = 0.1;
const FAR = 100;
const BOX = 0.3;
/** A parede: 8 × 5 × 0,2 m no plano z = 0. */
const WALL: Vec3 = [8, 5, 0.2];
/** Quadros até a hierarquia do quadro anterior valer e as listas firmarem. */
const SETTLE = 6;
/** Diferença máxima (por canal, relativa ao máximo da imagem) entre o desenho com e sem o descarte. */
const IMAGE_TOLERANCE = 1e-6;

const failures: string[] = [];
const errors: string[] = [];

function log(msg: string): void {
    console.log(`[drawCulling] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

/** As posições das caixas: atrás da parede, na frente, fora dos lados e atrás da câmera. */
function boxes(): { readonly position: Vec3; readonly kind: string }[] {
    const out: { position: Vec3; kind: string }[] = [];
    for (let i = 0; i < 7; i++)
        for (let j = 0; j < 5; j++)
            out.push({ position: [-2.4 + 0.8 * i, -1.4 + 0.7 * j, -3], kind: 'escondida' });
    for (let i = 0; i < 5; i++)
        for (let j = 0; j < 4; j++)
            out.push({ position: [-3 + 1.5 * i, -1.5 + 1 * j, 3], kind: 'na frente' });
    for (let i = 0; i < 30; i++)
        out.push({ position: [(i % 2 === 0 ? -1 : 1) * (20 + i), (i % 5) - 2, 0], kind: 'fora' });
    for (let i = 0; i < 10; i++) out.push({ position: [i - 5, 0, 14], kind: 'atrás da câmera' });
    return out;
}

interface Scene {
    readonly app: Application;
    readonly canvas: HTMLCanvasElement;
    readonly eye: Transform;
}

async function build(extra: readonly Vec3[] = []): Promise<Scene> {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    document.body.appendChild(canvas);
    const app = await Application.create({
        antialias: 'off',
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        profiling: 'passes',
    });
    app.events.on('engineError', (e) => errors.push(`${e.stage}: ${e.message}`));
    app.world.insert(
        new BoxGeometry({ size: WALL })
            .add(new StandardMaterial({ albedo: [0.4, 0.45, 0.5, 1], roughness: 0.8 }))
            .add(new Transform({ position: [0, 0, 0, 1] })),
    );
    for (const b of [...boxes().map((b) => b.position), ...extra])
        app.world.insert(
            new BoxGeometry({ size: [BOX, BOX, BOX] })
                .add(new StandardMaterial({ albedo: [0.7, 0.6, 0.5, 1], roughness: 0.6 }))
                .add(new Transform({ position: [...b, 1] })),
        );
    const eye = new Transform({ position: [0, 0, 10, 1] });
    app.world.insert(
        new Camera({ fov: FOV, near: NEAR, far: FAR, aspect: WIDTH / HEIGHT }).add(eye),
    );
    await app.whenReady({ timeoutMs: 60_000 });
    return { app, canvas, eye };
}

async function frames(s: Scene, n: number): Promise<void> {
    for (let f = 0; f < n; f++) {
        s.app.step(1 / 60);
        await nextGpuFrame(s.app);
    }
}

/** O trabalho do desenho principal (a parte do descarte). */
function forwardWork(app: Application): Parameters<Application['resources']['read']>[0] {
    const id = app.world.queryBySchemaName('ForwardWork')[0];
    const work = id === undefined ? undefined : app.world.resourcesOf(id)[0];
    if (work === undefined) throw new Error('ForwardWork fora da cena');
    return work;
}

/** As palavras de um buffer do trabalho, copiadas para um buffer de leitura (os argumentos indiretos também). */
async function words(app: Application, descId: string): Promise<number[]> {
    const source = app.resources.bufferOf(forwardWork(app), descId);
    if (source === undefined) return [];
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `draw_culling_readback_${descId}`,
        byteSize: source.byteSize,
    });
    app.core.record('draw-culling-readback', (frame) => {
        frame.copy(source, staging, source.byteSize);
    });
    app.core.submit();
    const out = [...new Uint32Array(await app.core.readback(staging))];
    app.core.destroy(staging);
    return out;
}

/** Por grupo: a primeira posição, a contagem e as instâncias das listas 1, 2 e das duas. */
async function groupCounts(
    app: Application,
): Promise<{ first: number; count: number; n1: number; n2: number; all: number }[]> {
    const table = await words(app, 'forward_cull_groups');
    const args = await words(app, 'forward_cull_args');
    const out: { first: number; count: number; n1: number; n2: number; all: number }[] = [];
    for (let g = 0; g * 4 < table.length; g++) {
        const count = table[g * 4 + 1]!;
        if (count === 0) continue;
        const r = (k: number): number => args[(g * 3 + k) * 5 + 1] ?? -1;
        out.push({ first: table[g * 4]!, count, n1: r(0), n2: r(1), all: r(2) });
    }
    return out;
}

/** Perspectiva do WebGPU (a da `Camera`: profundidade em [0, 1]), em colunas. */
function perspective(): number[] {
    const f = 1 / Math.tan(FOV / 2);
    const a = FAR / (NEAR - FAR);
    return [f / (WIDTH / HEIGHT), 0, 0, 0, 0, f, 0, 0, 0, 0, a, -1, 0, 0, a * NEAR, 0];
}

/** A câmera em (x, 0, 10) olhando para −z. */
function viewProjection(x: number): number[] {
    return mat4Multiply(perspective(), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, 0, -10, 1]);
}

/**
 * A profundidade da cena traçada na CPU (os raios dos centros dos pixels contra as caixas que desenham: a parede e as
 * visíveis) e, pela referência, as caixas que o descarte deve desenhar.
 */
function referenceVisible(x: number): { visible: number; byKind: Record<string, number> } {
    const vp = viewProjection(x);
    const planes = frustumPlanes(vp);
    const all = boxes();
    const solid: { lo: Vec3; hi: Vec3 }[] = [
        {
            lo: [-WALL[0] / 2, -WALL[1] / 2, -WALL[2] / 2],
            hi: [WALL[0] / 2, WALL[1] / 2, WALL[2] / 2],
        },
        ...all.map((b) => ({
            lo: b.position.map((v) => v - BOX / 2) as unknown as Vec3,
            hi: b.position.map((v) => v + BOX / 2) as unknown as Vec3,
        })),
    ];
    const depth = new Float64Array(WIDTH * HEIGHT).fill(1);
    const f = 1 / Math.tan(FOV / 2);
    const aspect = WIDTH / HEIGHT;
    for (let j = 0; j < HEIGHT; j++)
        for (let i = 0; i < WIDTH; i++) {
            const nx = ((i + 0.5) / WIDTH) * 2 - 1;
            const ny = 1 - ((j + 0.5) / HEIGHT) * 2;
            const d: Vec3 = [(nx * aspect) / f, ny / f, -1];
            const o: Vec3 = [x, 0, 10];
            let tMin = Infinity;
            for (const b of solid) {
                let t0 = 0;
                let t1 = Infinity;
                for (let k = 0; k < 3; k++) {
                    const inv = 1 / d[k]!;
                    let a = (b.lo[k]! - o[k]!) * inv;
                    let c = (b.hi[k]! - o[k]!) * inv;
                    if (a > c) [a, c] = [c, a];
                    t0 = Math.max(t0, a);
                    t1 = Math.min(t1, c);
                }
                if (t0 <= t1 && t0 < tMin) tMin = t0;
            }
            if (tMin === Infinity) continue;
            // A profundidade do WebGPU do ponto na distância de vista `tMin` (d.z = −1: a distância é t).
            const clip = [0, 0, (FAR / (NEAR - FAR)) * -tMin + (FAR * NEAR) / (NEAR - FAR), tMin];
            depth[j * WIDTH + i] = clip[2]! / clip[3]!;
        }
    const hzb = buildHzb(depth, WIDTH, HEIGHT);
    const byKind: Record<string, number> = {};
    let visible = 0;
    for (const b of all) {
        const lo = b.position.map((v) => v - BOX / 2) as unknown as Vec3;
        const hi = b.position.map((v) => v + BOX / 2) as unknown as Vec3;
        const box = worldBox([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], lo, hi);
        const keep =
            !outsideFrustum(planes, box.center, box.extent)
            && !occluded(hzb, vp, box.center, box.extent);
        if (keep) {
            visible++;
            byKind[b.kind] = (byKind[b.kind] ?? 0) + 1;
        }
    }
    return { visible, byKind };
}

async function image(s: Scene): Promise<Float32Array> {
    const texture = s.app.resources.textureOf(s.app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    return (await readHdrTexture(s.app, texture)).data;
}

/** A maior diferença entre duas imagens, relativa ao maior valor (e os pixels diferentes). */
function compare(a: Float32Array, b: Float32Array): { max: number; pixels: number } {
    let peak = 0;
    for (let i = 0; i < a.length; i++) peak = Math.max(peak, Math.abs(a[i]!));
    let max = 0;
    let pixels = 0;
    for (let i = 0; i < a.length; i += 4) {
        let d = 0;
        for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a[i + c]! - b[i + c]!));
        if (d > 0) pixels++;
        max = Math.max(max, d);
    }
    return { max: max / Math.max(peak, 1e-12), pixels };
}

async function partA(s: Scene): Promise<void> {
    s.app.defaults.targets.data.culling = 1;
    s.eye.data.position = [0, 0, 10, 1];
    await frames(s, SETTLE);
    const groups = await groupCounts(s.app);
    const box = groups.find((g) => g.count === boxes().length);
    const wall = groups.find((g) => g.count === 1);
    const ref = referenceVisible(0);
    log(
        `(a) referência: ${ref.visible} de ${boxes().length} caixas desenham (${Object.entries(
            ref.byKind,
        )
            .map(([k, n]) => `${n} ${k}`)
            .join(', ')})`,
    );
    if (box === undefined || wall === undefined) {
        failures.push(`(a) grupos não achados: ${JSON.stringify(groups)}`);
        return;
    }
    log(
        `(a) GPU: caixas ${box.all} desenhadas (fase 1 ${box.n1}, fase 2 ${box.n2}); parede ${wall.all}`,
    );
    if (box.all !== ref.visible)
        failures.push(`(a) ${box.all} caixas desenhadas, a referência desenha ${ref.visible}`);
    if (ref.byKind.escondida !== undefined || ref.byKind.fora !== undefined)
        failures.push(
            `(a) a referência desenha escondidas ou de fora: ${JSON.stringify(ref.byKind)}`,
        );
    if (wall.all !== 1) failures.push(`(a) a parede não desenha (${wall.all})`);
}

async function partB(s: Scene): Promise<void> {
    // Parada: a mesma imagem com e sem o descarte.
    s.app.defaults.targets.data.culling = 1;
    s.eye.data.position = [0, 0, 10, 1];
    await frames(s, SETTLE);
    const on = await image(s);
    s.app.defaults.targets.data.culling = 0;
    await frames(s, SETTLE);
    const off = await image(s);
    const still = compare(on, off);
    log(`(b) parada: diferença ${still.max.toExponential(2)} (${still.pixels} pixels)`);
    if (still.max > IMAGE_TOLERANCE)
        failures.push(`(b) parada: a imagem com o descarte difere (${still.pixels} pixels)`);
    // O salto: a câmera vai para o lado e vê atrás da parede; o primeiro quadro depois dele, com a hierarquia do quadro
    // anterior (que escondia as caixas), contra a imagem sem o descarte na mesma vista.
    let revealed = 0;
    for (const x of [6, 9, -9]) {
        s.app.defaults.targets.data.culling = 1;
        s.eye.data.position = [0, 0, 10, 1];
        await frames(s, SETTLE);
        s.eye.data.position = [x, 0, 10, 1];
        await frames(s, 1);
        const jump = await image(s);
        const counts = await groupCounts(s.app);
        const box = counts.find((g) => g.count === boxes().length);
        s.app.defaults.targets.data.culling = 0;
        await frames(s, SETTLE);
        const reference = await image(s);
        const d = compare(jump, reference);
        log(
            `(b) salto para x = ${x}: diferença ${d.max.toExponential(2)} (${d.pixels} pixels); caixas na fase 1 ${box?.n1}, na fase 2 ${box?.n2}`,
        );
        if (d.max > IMAGE_TOLERANCE)
            failures.push(
                `(b) salto para x = ${x}: a imagem com o descarte difere (${d.pixels} pixels)`,
            );
        revealed += box?.n2 ?? 0;
    }
    // Algum salto revela caixas que a hierarquia do quadro anterior escondia: a fase 2 as desenha.
    if (revealed === 0)
        failures.push(
            '(b) nenhum salto passou pela fase 2 (o caso não exercita a oclusão em duas fases)',
        );
}

/** Mediana do tempo de GPU do desenho principal (o passe e o descarte) em `n` quadros. */
async function forwardCost(s: Scene, n: number): Promise<number> {
    const samples: number[] = [];
    for (let f = 0; f < n; f++) {
        s.app.step(1 / 60);
        await nextGpuFrame(s.app);
        const stages = s.app.core.lastFrameStats().stagesNs;
        if (stages === undefined) continue;
        samples.push(((stages.ForwardFlow ?? 0) + (stages['ForwardFlow.cull'] ?? 0)) / 1e6);
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] ?? NaN;
}

async function partC(): Promise<void> {
    // 20 mil caixas atrás da parede (a grade de 200 × 100 em z = −4, dentro do recorte dela).
    const hidden: Vec3[] = [];
    for (let i = 0; i < 200; i++)
        for (let j = 0; j < 100; j++) hidden.push([-2.6 + 0.026 * i, -1.6 + 0.032 * j, -4]);
    const s = await build(hidden);
    try {
        for (const profile of [
            'high',
            'medium',
            'low',
        ] as const satisfies readonly RenderProfile[]) {
            s.app.defaults.renderer.profile = profile;
            s.app.defaults.targets.data.culling = 1;
            await frames(s, SETTLE);
            const on = await forwardCost(s, 60);
            s.app.defaults.targets.data.culling = 0;
            await frames(s, SETTLE);
            const off = await forwardCost(s, 60);
            log(
                `(c) ${profile}: desenho ${on.toFixed(3)} ms com o descarte, ${off.toFixed(3)} ms sem (20 mil caixas escondidas)`,
            );
            if (!(on < off))
                failures.push(
                    `(c) ${profile}: o descarte não reduziu o desenho (${on.toFixed(3)} contra ${off.toFixed(3)} ms)`,
                );
        }
    } finally {
        s.app.dispose();
        s.canvas.remove();
    }
}

async function main(): Promise<void> {
    const s = await build();
    try {
        await partA(s);
        await partB(s);
    } finally {
        s.app.dispose();
        s.canvas.remove();
    }
    await partC();
    failures.push(...new Set(errors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('DRAWCULLING SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
