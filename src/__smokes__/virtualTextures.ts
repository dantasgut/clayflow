// Spec 034 (T060c) — Smoke das texturas virtuais dos materiais: uma `VirtualImage` de 3000 × 2400 (maior que o atlas de
// 5 × 5 páginas, 600² texels de conteúdo) num quadro de 2 × 2 m, emissão pelo nó `nodes.image.virtual` (montado pelo
// grafo de material, o caminho de autoria), visto de frente por uma câmera ortográfica que se aproxima e anda. O smoke
// faz o papel da aplicação: a fonte da imagem (`PictureSource`) guarda a original e os níveis que a GPU prepara e só
// copia bytes para os pedidos do motor — o motor não guarda a original nem processa texels fora da GPU.
//
//   (0) preparação: a pirâmide feita na GPU (blocos de 1024², a média 2 × 2 em luz linear) e entregue à fonte é a da
//       referência f64 (`vtPyramid`) a menos de um degrau de 8 bits por canal (f32 contra f64 no arredondamento);
//
//   (a) leitura direta (a imagem em sRGB, filtrada em luz linear pelo nó, e a mesma imagem como dado linear, filtrada
//       pelo hardware): em cada vista, quando as páginas que os pixels pedem estão residentes (a tabela lida de volta),
//       o alvo HDR é a leitura direta da referência f64 (`vtSample`: o nível pelas derivadas, o bilinear em luz linear e
//       a mistura de dois níveis) a menos de uma escala e um fundo (a exposição e o especular do material preto,
//       ajustados por mínimos quadrados) — erro máximo e RMS relativos à média medidos;
//   (b) páginas pedidas: o número de páginas residentes nunca passa do atlas, as vistas pedem mais páginas do que cabem
//       (o despejo das não pedidas) e cada vista converge em poucos quadros;
//   (c) custo: o tempo de GPU do `VirtualTextureFlow` por perfil do `Renderer` (alto, médio, baixo), parado e andando.
//
// Para rodar: `npm run smoke -- virtualTextures`. Resultado: `VIRTUALTEXTURES SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    Camera,
    createScene,
    MaterialFunction,
    NodeGraph,
    nodes,
    PlaneGeometry,
    StandardMaterial,
    Transform,
    VirtualImage,
    VirtualTextures,
} from 'clayflow/web';
import type { RenderProfile } from 'clayflow/web';
import type { VirtualTextureLevelPayload, VirtualTextureRequestPayload } from 'clayflow/web';
import {
    vtLevelBases,
    vtLevelPages,
    vtLevelSize,
    vtLevels,
    vtLod,
    vtPageOf,
    vtPyramid,
    vtSample,
    type VirtualPyramid,
} from '../elements/material/virtual/reference/virtualTexture';
import { hash2 } from '../elements/math/reference/random';
import { nextGpuFrame } from './support/extensionScenes';
import { readHdrTexture } from './support/imageMeasures';

const SIZE = 256;
const IMAGE_W = 3000;
const IMAGE_H = 2400;
const ATLAS_PAGES = 5;
/** A tabela: o início dela e a marca de residente (ver `VirtualTextures.ts`). */
const RESIDENT = 1 << 16;
/**
 * Quadros no máximo até uma vista convergir: com a cena parada, a lista é lida um quadro em 8; a leitura de volta, a
 * carga e o carimbo levam outros poucos (medido: 4 a 20).
 */
const CONVERGE_FRAMES = 32;
/**
 * Erro máximo e RMS relativos à média do sinal (medidos: até 0,47 % e 0,076 % em sRGB, 0,30 % e 0,048 % linear — os 8 bits
 * do atlas e do filtro do hardware).
 */
const MAX_ERROR = 0.01;
const RMS_ERROR = 0.0015;
/**
 * Tempo de GPU do `VirtualTextureFlow` (fração do quadro de 60 Hz, 16,7 ms): parado (a lista lida um quadro em 8) ≤ 0,05
 * ms (medido 0,009), andando (a tabela e a alocação a cada quadro) ≤ 0,5 ms, 3 % do quadro (medido 0,29).
 */
const COST_STILL_MS = 0.05;
const COST_MOVING_MS = 0.5;
/** Quadros no máximo da preparação (12 blocos do nível 0 e 1 do nível 10, um por leitura de volta). */
const PREPARE_FRAMES = 600;
/** Tempo de GPU do `VirtualTextureFlow` no quadro de um bloco da preparação: ≤ 2 ms, 12 % do quadro de 60 Hz (medido 0,40). */
const PREPARE_MS = 2;
/** Diferença máxima por canal entre a pirâmide da GPU e a da referência (degraus de 8 bits). */
const PYRAMID_STEPS = 1;

const failures: string[] = [];
const errors: string[] = [];

function log(msg: string): void {
    console.log(`[virtualTextures] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

/** A imagem de teste: detalhe em todas as escalas (xadrez fino, faixas, um gradiente e ruído determinístico). */
function picture(): Uint8Array {
    const p = new Uint8Array(IMAGE_W * IMAGE_H * 4);
    for (let y = 0; y < IMAGE_H; y++)
        for (let x = 0; x < IMAGE_W; x++) {
            const o = (y * IMAGE_W + x) * 4;
            const checker = ((x >> 3) + (y >> 3)) & 1;
            const band = (Math.floor(x / 37) * 7 + Math.floor(y / 53) * 13) % 11;
            const n = hash2(x, y) >>> 27;
            p[o] = Math.min(255, 40 + checker * 120 + n);
            p[o + 1] = Math.min(255, Math.floor((x / IMAGE_W) * 200) + band * 5);
            p[o + 2] = Math.min(255, Math.floor((y / IMAGE_H) * 180) + (checker ? 0 : 60));
            p[o + 3] = 255;
        }
    return p;
}

/**
 * A fonte da imagem — o papel da aplicação (o arquivo, a rede ou a memória dela): a original e os níveis que a GPU
 * prepara e entrega. Responde aos pedidos do motor só com cópia dos bytes do retângulo (linhas inteiras ou trechos delas;
 * fora do nível, a volta ou a borda pelo endereçamento).
 */
class PictureSource {
    readonly levels: (Uint8Array | undefined)[];
    private readonly received: number[];
    private readonly stop: (() => void)[] = [];

    constructor(
        private readonly app: Application,
        private readonly textures: VirtualTextures,
        private readonly index: number,
        private readonly width: number,
        private readonly height: number,
        original: Uint8Array,
    ) {
        const count = vtLevels(width, height);
        this.levels = Array.from({ length: count }, (_, l) => (l === 0 ? original : undefined));
        this.received = Array.from({ length: count }, () => 0);
        this.stop.push(
            app.events.on('virtualTextureRequest', (e) => {
                this.answer(e);
            }),
            app.events.on('virtualTextureLevel', (e) => {
                this.keep(e);
            }),
        );
    }

    /** A pirâmide inteira está guardada? */
    get complete(): boolean {
        return this.received.every((n, l) => {
            if (l === 0) return true;
            const [w, h] = vtLevelSize(this.width, this.height, l);
            return n >= w * h;
        });
    }

    dispose(): void {
        for (const off of this.stop) off();
    }

    /** Copia o retângulo pedido e responde. */
    private answer(e: VirtualTextureRequestPayload): void {
        if (e.textures !== this.textures || e.image !== this.index) return;
        const src = this.levels[e.level];
        if (src === undefined) return;
        const [lw, lh] = vtLevelSize(this.width, this.height, e.level);
        const out = new Uint8Array(e.width * e.height * 4);
        const wrap = (i: number, n: number): number =>
            e.wrap === 'repeat' ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1);
        for (let j = 0; j < e.height; j++) {
            const row = wrap(e.y + j, lh) * lw;
            let i = 0;
            while (i < e.width) {
                const x = e.x + i;
                const sx = wrap(x, lw);
                // Fora do nível com a borda presa: o texel da borda; senão, o trecho contíguo da linha.
                const n =
                    e.wrap === 'clamp' && (x < 0 || x >= lw) ? 1 : Math.min(e.width - i, lw - sx);
                out.set(src.subarray((row + sx) * 4, (row + sx + n) * 4), (j * e.width + i) * 4);
                i += n;
            }
        }
        this.app.events.emit('virtualTextureDelivery', {
            textures: this.textures,
            request: e.request,
            texels: out,
        });
    }

    /** Guarda um retângulo de um nível preparado pela GPU. */
    private keep(e: VirtualTextureLevelPayload): void {
        if (e.textures !== this.textures || e.image !== this.index) return;
        const [lw, lh] = vtLevelSize(this.width, this.height, e.level);
        const level = (this.levels[e.level] ??= new Uint8Array(lw * lh * 4));
        for (let j = 0; j < e.height; j++)
            level.set(
                e.texels.subarray(j * e.width * 4, (j + 1) * e.width * 4),
                ((e.y + j) * lw + e.x) * 4,
            );
        this.received[e.level]! += e.width * e.height;
    }
}

interface Scene {
    readonly app: Application;
    readonly canvas: HTMLCanvasElement;
    readonly image: VirtualImage;
    /** A pirâmide da referência (o oráculo das comparações). */
    readonly reference: VirtualPyramid;
    readonly source: PictureSource;
    readonly cache: VirtualTextures;
    readonly camera: Camera;
    readonly eye: Transform;
}

async function build(colorSpace: 'srgb' | 'linear'): Promise<Scene> {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
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
    app.events.on('extensionRejected', (e) =>
        errors.push(`extensionRejected ${e.point}:${e.line}: ${e.message}`),
    );
    const original = picture();
    const image = new VirtualImage({ width: IMAGE_W, height: IMAGE_H, colorSpace });
    const cache = new VirtualTextures({ images: [image], atlasPages: ATLAS_PAGES });
    const source = new PictureSource(app, cache, 0, IMAGE_W, IMAGE_H, original);
    app.world.insert(cache);
    // A emissão é a imagem; a base preta e fosca (o especular que sobra entra no ajuste do fundo).
    const graph = new NodeGraph({
        nodes: {
            img: nodes.image.virtual.with({ image: 0 }),
            out: nodes.output.surfaceParams,
        },
        links: [['img.color', 'out.emissive']],
        output: 'out.value',
    });
    app.world.insert(
        new PlaneGeometry({ size: [2, 2] })
            .add(new StandardMaterial({ albedo: [0, 0, 0, 1], roughness: 1 }))
            .add(
                new Transform({
                    // De pé, de frente para +z: o uv (x + 1) / 2 e (1 − y) / 2.
                    rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
                }),
            )
            .add(new MaterialFunction({ graph })),
    );
    const camera = new Camera({ projection: 'orthographic', orthoHeight: 2, near: 0.1, far: 30 });
    const eye = new Transform({
        position: [0, 0, 6, 1],
        rotation: Transform.lookRotation([0, 0, 6], [0, 0, 0]),
    });
    app.world.insert(camera.add(eye));
    await app.whenReady({ timeoutMs: 60_000 });
    const reference = vtPyramid(IMAGE_W, IMAGE_H, original, colorSpace);
    const s: Scene = { app, canvas, image, reference, source, cache, camera, eye };
    await preparation(s, colorSpace);
    return s;
}

/** (0) A preparação na GPU: os quadros até a fonte guardar a pirâmide e a pirâmide contra a da referência. */
async function preparation(s: Scene, colorSpace: string): Promise<void> {
    let frames = 0;
    let cost = 0;
    while (!s.source.complete && frames < PREPARE_FRAMES) {
        s.app.step(1 / 60);
        await nextGpuFrame(s.app);
        frames++;
        const ns = s.app.core.lastFrameStats().stagesNs?.VirtualTextureFlow;
        if (ns !== undefined) cost = Math.max(cost, ns / 1e6);
    }
    if (!s.source.complete) {
        failures.push(`${colorSpace}: a pirâmide não chegou à fonte em ${PREPARE_FRAMES} quadros`);
        return;
    }
    let worst = 0;
    let off = 0;
    let total = 0;
    for (let l = 1; l < s.image.levels; l++) {
        const gpu = s.source.levels[l]!;
        const ref = s.reference.levels[l]!;
        for (let i = 0; i < ref.length; i++) {
            const d = Math.abs(gpu[i]! - ref[i]!);
            if (d > 0) off++;
            worst = Math.max(worst, d);
        }
        total += ref.length;
    }
    log(
        `${colorSpace}: pirâmide de ${s.image.levels} níveis na GPU em ${frames} quadros (o quadro mais caro do `
            + `VirtualTextureFlow: ${cost.toFixed(3)} ms); contra a referência, `
            + `${off} de ${total} canais diferem, no máximo ${worst} degrau(s)`,
    );
    if (!(cost <= PREPARE_MS))
        failures.push(
            `${colorSpace}: a preparação custa ${cost.toFixed(3)} ms num quadro (≤ ${PREPARE_MS})`,
        );
    if (worst > PYRAMID_STEPS)
        failures.push(
            `${colorSpace}: a pirâmide da GPU difere da referência em ${worst} degraus (≤ ${PYRAMID_STEPS})`,
        );
}

/** Uma vista: o centro (m) e a altura (m) da câmera. */
interface View {
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly height: number;
}

function aim(s: Scene, v: View): void {
    s.eye.data.position = [v.x, v.y, 6, 1];
    s.camera.data.orthoHeight = v.height;
}

/** O uv e as derivadas do pixel (i, j) do alvo `w × h` na vista. */
function pixelUv(v: View, i: number, j: number, w: number, h: number): [number, number, number] {
    const x = v.x + ((i + 0.5) / w - 0.5) * v.height * (w / h);
    const y = v.y + (0.5 - (j + 0.5) / h) * v.height;
    return [(x + 1) / 2, (1 - y) / 2, v.height / (2 * h)];
}

/** As páginas globais que a vista pede (os dois níveis em volta do nível de cada pixel dentro do quadro). */
function wanted(v: View, w: number, h: number): Set<number> {
    const out = new Set<number>();
    for (let j = 0; j < h; j += 2)
        for (let i = 0; i < w; i += 2) {
            const [u, vv, d] = pixelUv(v, i, j, w, h);
            if (u < 0 || u >= 1 || vv < 0 || vv >= 1) continue;
            const lod = vtLod(IMAGE_W, IMAGE_H, [d, 0], [0, d]);
            const l0 = Math.floor(lod);
            out.add(vtPageOf(IMAGE_W, IMAGE_H, l0, u, vv));
            if (lod > l0) out.add(vtPageOf(IMAGE_W, IMAGE_H, l0 + 1, u, vv));
        }
    return out;
}

/** As páginas residentes (a tabela lida de volta). */
async function residents(s: Scene): Promise<Set<number>> {
    const record = await s.app.resources.read(s.cache, 'words');
    const w = record?.w as number[] | undefined;
    const out = new Set<number>();
    if (w === undefined) return out;
    const start = w[1]!;
    const total = w[2]!;
    for (let g = 0; g < total; g++) if ((w[start + g]! & RESIDENT) !== 0) out.add(g);
    return out;
}

/** Quadros até as páginas pedidas pela vista estarem residentes (ou o teto). */
async function converge(
    s: Scene,
    v: View,
): Promise<{ frames: number; resident: number; ok: boolean }> {
    const target = s.app.resources.textureOf(s.app.defaults.targets, 'color');
    const w = target?.width ?? SIZE;
    const h = target?.height ?? SIZE;
    const need = wanted(v, w, h);
    for (let f = 1; f <= CONVERGE_FRAMES; f++) {
        s.app.step(1 / 60);
        await nextGpuFrame(s.app);
        if (f % 4 !== 0) continue;
        const have = await residents(s);
        if (have.size > ATLAS_PAGES * ATLAS_PAGES)
            failures.push(
                `${v.name}: ${have.size} páginas residentes num atlas de ${ATLAS_PAGES ** 2}`,
            );
        if ([...need].every((g) => have.has(g)))
            return { frames: f, resident: have.size, ok: true };
    }
    return { frames: CONVERGE_FRAMES, resident: (await residents(s)).size, ok: false };
}

/** O alvo HDR contra a leitura direta: escala e fundo por mínimos quadrados, erro máximo e RMS relativos à média. */
async function compare(
    s: Scene,
    v: View,
): Promise<{ scale: number; offset: number; max: number; rms: number }> {
    for (let k = 0; k < 2; k++) {
        s.app.step(1 / 60);
        await nextGpuFrame(s.app);
    }
    s.app.step(1 / 60);
    const texture = s.app.resources.textureOf(s.app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    const img = await readHdrTexture(s.app, texture);
    const pairs: [number, number][] = [];
    for (let j = 1; j < img.height - 1; j++)
        for (let i = 1; i < img.width - 1; i++) {
            const [u, vv, d] = pixelUv(v, i, j, img.width, img.height);
            // Longe da borda do quadro (o pixel vizinho fora dele muda as derivadas da GPU).
            const margin = 2 * d;
            if (u < margin || u > 1 - margin || vv < margin || vv > 1 - margin) continue;
            const ref = vtSample(s.reference, [u, vv], [d, 0], [0, d], 'repeat');
            const o = (j * img.width + i) * 4;
            for (let c = 0; c < 3; c++) pairs.push([ref[c]!, img.data[o + c]!]);
        }
    if (pairs.length === 0) throw new Error(`${v.name}: nenhum pixel no quadro`);
    // Mínimos quadrados: medido = escala · referência + fundo.
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (const [x, y] of pairs) {
        sx += x;
        sy += y;
        sxx += x * x;
        sxy += x * y;
    }
    const n = pairs.length;
    const scale = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const offset = (sy - scale * sx) / n;
    let max = 0;
    let sq = 0;
    for (const [x, y] of pairs) {
        const e = Math.abs((y - offset) / scale - x);
        max = Math.max(max, e);
        sq += e * e;
    }
    const mean = sx / n;
    return { scale, offset, max: max / mean, rms: Math.sqrt(sq / n) / mean };
}

const VIEWS: readonly View[] = [
    { name: 'inteiro', x: 0, y: 0, height: 2.2 },
    { name: 'perto-4x', x: 0.2, y: -0.1, height: 0.5 },
    { name: 'perto-16x', x: -0.55, y: 0.6, height: 0.125 },
    { name: 'perto-16x-b', x: 0.6, y: -0.55, height: 0.125 },
    { name: 'perto-32x', x: 0.1, y: 0.3, height: 0.0625 },
    { name: 'inteiro-de-novo', x: 0, y: 0, height: 2.2 },
];

async function partAB(s: Scene, views: readonly View[], evict: boolean): Promise<void> {
    const scales: number[] = [];
    const visited = new Set<number>();
    for (const v of views) {
        aim(s, v);
        const c = await converge(s, v);
        const target = s.app.resources.textureOf(s.app.defaults.targets, 'color');
        for (const g of wanted(v, target?.width ?? SIZE, target?.height ?? SIZE)) visited.add(g);
        if (!c.ok) {
            failures.push(
                `${v.name}: as páginas pedidas não ficaram residentes em ${CONVERGE_FRAMES} quadros`,
            );
            continue;
        }
        const r = await compare(s, v);
        scales.push(r.scale);
        log(
            `${v.name}: ${c.frames} quadros até as páginas, ${c.resident} residentes; escala ${r.scale.toFixed(5)}, `
                + `fundo ${r.offset.toExponential(2)}, erro máx ${(100 * r.max).toFixed(3)} %, RMS ${(100 * r.rms).toFixed(4)} %`,
        );
        if (r.max > MAX_ERROR || r.rms > RMS_ERROR)
            failures.push(
                `${v.name}: erro máx ${(100 * r.max).toFixed(3)} % (≤ ${100 * MAX_ERROR}), RMS ${(100 * r.rms).toFixed(4)} % (≤ ${100 * RMS_ERROR})`,
            );
    }
    const spread = Math.max(...scales) / Math.min(...scales) - 1;
    log(
        `escala entre as vistas: ${(100 * spread).toFixed(4)} %; páginas pedidas no total ${visited.size} (atlas ${ATLAS_PAGES ** 2})`,
    );
    if (scales.length > 1 && spread > 1e-3)
        failures.push(`a escala muda entre as vistas (${(100 * spread).toFixed(3)} %)`);
    if (evict && visited.size <= ATLAS_PAGES * ATLAS_PAGES)
        failures.push(
            `as vistas pedem ${visited.size} páginas: cabem no atlas (o despejo não foi exercitado)`,
        );
    const levels = vtLevelBases(IMAGE_W, IMAGE_H);
    log(`nível 0: ${vtLevelPages(IMAGE_W, IMAGE_H, 0).join(' × ')} páginas; total ${levels.total}`);
}

/** Mediana do tempo de GPU do `VirtualTextureFlow` em `frames` quadros (andando: a câmera percorre o quadro de perto). */
async function flowCost(s: Scene, frames: number, moving: boolean): Promise<number> {
    const samples: number[] = [];
    for (let f = 0; f < frames; f++) {
        if (moving)
            aim(s, {
                name: 'pan',
                x: -0.8 + (1.6 * f) / frames,
                y: 0.4 * Math.sin(f / 9),
                height: 0.125,
            });
        s.app.step(1 / 60);
        await nextGpuFrame(s.app);
        const stats = s.app.core.lastFrameStats();
        const ns = stats.stagesNs?.VirtualTextureFlow;
        if (ns !== undefined) samples.push(ns / 1e6);
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] ?? NaN;
}

async function partC(s: Scene): Promise<void> {
    for (const profile of ['high', 'medium', 'low'] as const satisfies readonly RenderProfile[]) {
        s.app.defaults.renderer.profile = profile;
        aim(s, VIEWS[0]!);
        await converge(s, VIEWS[0]!);
        const still = await flowCost(s, 60, false);
        const moving = await flowCost(s, 90, true);
        log(
            `custo ${profile}: VirtualTextureFlow ${still.toFixed(3)} ms parado, ${moving.toFixed(3)} ms andando`,
        );
        if (!(still <= COST_STILL_MS && moving <= COST_MOVING_MS))
            failures.push(
                `custo ${profile}: ${still.toFixed(3)} ms parado (≤ ${COST_STILL_MS}), ${moving.toFixed(3)} andando (≤ ${COST_MOVING_MS})`,
            );
    }
}

async function main(): Promise<void> {
    const s = await build('srgb');
    try {
        await partAB(s, VIEWS, true);
        await partC(s);
    } finally {
        s.source.dispose();
        s.app.dispose();
        s.canvas.remove();
    }
    // A imagem linear (dados: rugosidade, normais): a filtragem do hardware, sem a curva.
    const linear = await build('linear');
    try {
        await partAB(linear, VIEWS.slice(0, 3), false);
    } finally {
        linear.source.dispose();
        linear.app.dispose();
        linear.canvas.remove();
    }
    failures.push(...new Set(errors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('VIRTUALTEXTURES SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
