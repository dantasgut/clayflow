// Spec 033 — Smoke da névoa volumétrica (US8; SC-014).
//
// As medidas leem a radiância linear do alvo HDR da cena (e, para a luz espalhada pela névoa sozinha, os froxels
// integrados lidos de volta só no teste):
//   - beer: névoa só absorvente (albedo 0) entre a câmera e uma parede acesa — a parede vista através dela é a sem
//     névoa × e^(−σ·L) (L o trecho do raio dentro do volume), a ≤ 3 %, em três densidades.
//   - glass: uma placa de vidro atrás da névoa e dentro dela — a razão com/sem névoa através dela igual à do lado (a
//     névoa atenua uma vez, sem contar de novo no vidro), a ≤ 3 %.
//   - beam: cômodo de paredes pretas com névoa homogênea e o sol entrando pela janela — a luz espalhada (o feixe) por
//     região a ≤ 10 % do traçador de caminhos da CPU com meio participante (espalhamento simples); fora do feixe mais
//     escuro.
//   - gi: o cômodo com o céu físico e paredes claras — com a iluminação global a névoa recebe a luz rebatida (mais clara
//     que sem ela, e mais perto das paredes acesas).
//   - noise: densidade por função de ruído — a névoa segue a densidade sem degraus nem blocos entre pixels vizinhos.
//   - walk: a câmera andando pela névoa com o feixe — sem cintilação acima do limiar.
//   - opaque: névoa densa num corredor — a transmitância cai suave com a distância, sem bandas.
//   - timing: o custo dos froxels a 1280×720 (≤ 1 ms, A/B dos totais do quadro).
// Para rodar: `npm run smoke -- fog [--query case=beer]`. Resultado: `FOG SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    BoxGeometry,
    createScene,
    StandardMaterial,
    FogVolume,
    FroxelFlow,
    Froxels,
    FROXEL_AMBIENT_GRID,
    FROXEL_GRID,
    GlobalIllumination,
    Transform,
    type StagingBufferSpec,
} from 'clayflow';
import type { PtMedium } from '../elements/lighting/reference/pathTracer';
import { halfToFloat } from './support/imageMeasures';
import { settle } from './support/extensionScenes';
import {
    buildGiScene,
    giApp,
    pathTracedScene,
    projectPoint,
    windowRoom,
    type BuiltGiScene,
    type GiScene,
    type Vec3,
} from './support/giScenes';
import { hdrLuminance, readHdrTexture, type HdrImage } from './support/imageMeasures';
import { renderPathTracedParallel } from './support/pathTraceParallel';
import { closureFn } from './support/materialScenes';
import { luminanceLinear } from './support/images';

function log(msg: string): void {
    console.log(`[fog] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null)
        el.textContent += `${msg}
`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, message: string): void {
    if (!ok) failures.push(message);
}

interface Size {
    readonly width: number;
    readonly height: number;
}

/** Uma aplicação com a cena montada: avança quadros e lê o alvo HDR e os froxels. */
interface Session {
    readonly app: Application;
    readonly built: BuiltGiScene;
    step(frames: number): Promise<void>;
    read(): Promise<HdrImage>;
    /** Os froxels integrados (rgba: luz espalhada até o fim da fatia e a transmitância), x mais rápido. */
    froxels(): Promise<Float32Array>;
    /** A grade da luz ambiente dos froxels (rgba, x mais rápido). */
    ambient(): Promise<Float32Array>;
    close(): void;
}

/** Abre a cena (sem o hemisfério: só o sol, salvo `ambient`), com os volumes dados e, opcionalmente, a GI. */
async function open(
    scene: GiScene,
    size: Size,
    fogs: readonly FogVolume[],
    options: { readonly gi?: boolean; readonly ambient?: number } = {},
    extra?: (app: Application) => void,
): Promise<Session> {
    const { app, canvas } = await giApp(size.width, size.height, engineErrors);
    app.events.on('deviceLost', (e) => engineErrors.push(`deviceLost: ${JSON.stringify(e)}`));
    if (options.ambient === undefined) app.world.remove(app.defaults.ambient);
    else app.defaults.ambient.data.intensity = options.ambient;
    const built = buildGiScene(app, scene, size.width / size.height);
    for (const f of fogs) app.world.insert(f);
    extra?.(app);
    const ready = { revision: -1, at: 0 };
    app.events.on('globalIlluminationReady', (e) => {
        ready.revision = e.revision;
        ready.at = performance.now();
    });
    if (options.gi !== undefined) {
        app.world.insert(
            new GlobalIllumination({
                quality: 'high',
                bounces: 2,
                probeSpacing: scene.probeSpacing ?? 0.3,
                cascades: 1,
                center: scene.probeCenter,
                enabled: options.gi,
            }),
        );
    }
    await settle(app, 3000);
    // Com a iluminação global, os kernels dela prontos (e nenhuma revisão nova por 1 s).
    if (options.gi !== undefined) {
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
        froxels: () => read3d(app, 'scatter', FROXEL_GRID),
        ambient: () => read3d(app, 'ambient', FROXEL_AMBIENT_GRID),
        close() {
            app.dispose();
            canvas.remove();
        },
    };
}

/** Uma textura 3D rgba16float dos `Froxels` lida de volta (rgba por texel, x mais rápido). */
async function read3d(
    app: Application,
    id: string,
    grid: readonly [number, number, number],
): Promise<Float32Array> {
    {
        {
            const froxels = app.world.findResource(Froxels.schema, Froxels)!;
            const texture = app.resources.textureOf(froxels, id)!;
            const [w, h, d] = grid;
            const bytesPerRow = Math.ceil((w * 8) / 256) * 256;
            const staging = app.core.create<StagingBufferSpec>({
                kind: 'buffer',
                subkind: 'staging',
                discriminator: `fog_${id}_readback`,
                byteSize: bytesPerRow * h * d,
            });
            app.core.record(`fog-${id}-readback`, (frame) => {
                frame.copyTextureToBuffer(texture, staging, { bytesPerRow, rowsPerImage: h }, [
                    w,
                    h,
                    d,
                ]);
            });
            app.core.submit();
            const raw = new Uint16Array(await app.core.readback(staging));
            app.core.destroy(staging);
            const out = new Float32Array(w * h * d * 4);
            const stride = bytesPerRow / 2;
            for (let z = 0; z < d; z++)
                for (let y = 0; y < h; y++)
                    for (let x = 0; x < w * 4; x++)
                        out[(z * h + y) * w * 4 + x] = halfToFloat(raw[(z * h + y) * stride + x]!);
            return out;
        }
    }
}

/** Luminância de um rgb. */
const lum = (r: number, g: number, b: number): number => luminanceLinear([r, g, b]);

/**
 * Beer-Lambert: uma parede branca acesa de lado pelo sol, a câmera de frente, e entre elas uma caixa de névoa só
 * absorvente (albedo 0: nada espalhado) que o sol não atravessa até a parede. Por pixel do centro, a razão com e sem
 * névoa contra e^(−σ·L), L = o trecho do raio da câmera dentro da caixa.
 */
async function beer(): Promise<void> {
    const size = { width: 640, height: 400 };
    const scene: GiScene = {
        slabs: [{ id: 1, min: [-4, -1, -2.2], max: [4, 3, -2], color: [0.8, 0.8, 0.8] }],
        sun: { direction: [-0.97, -0.2, -0.15], illuminance: 100 },
        camera: { position: [0, 1, 4], target: [0, 1, -2], fovY: Math.PI / 5 },
        probeCenter: [0, 1, 0],
        regions: new Map([[1, 'parede']]),
    };
    const box = { center: [0, 1, 1] as const, size: [8, 5, 2] as const };
    const shots: HdrImage[] = [];
    for (const sigma of [0, 0.2, 0.5, 1.0]) {
        const fogs =
            sigma === 0
                ? []
                : [
                      new FogVolume({
                          shape: { box: box.size },
                          center: box.center,
                          density: sigma,
                          albedo: [0, 0, 0],
                      }),
                  ];
        const s = await open(scene, size, fogs);
        await s.step(30);
        shots.push(await s.read());
        s.close();
    }
    const c = scene.camera;
    const forward = normalize(sub(c.target, c.position));
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    const tanY = Math.tan(c.fovY / 2);
    const aspect = size.width / size.height;
    [0.2, 0.5, 1.0].forEach((sigma, k) => {
        let worst = 0;
        let mean = 0;
        let n = 0;
        for (let y = 140; y < 260; y += 4)
            for (let x = 240; x < 400; x += 4) {
                const sx = ((x + 0.5) / size.width) * 2 - 1;
                const sy = 1 - ((y + 0.5) / size.height) * 2;
                const d = normalize(
                    add(forward, add(scale(right, sx * tanY * aspect), scale(up, sy * tanY))),
                );
                const L = 2 / Math.abs(d[2]);
                const expected = Math.exp(-sigma * L);
                const ratio = hdrLuminance(shots[k + 1]!, x, y) / hdrLuminance(shots[0]!, x, y);
                const err = Math.abs(ratio / expected - 1);
                worst = Math.max(worst, err);
                mean += ratio / expected;
                n++;
            }
        log(
            `beer: σ = ${sigma}/m (e^(−σL) ≈ ${Math.exp(-2 * sigma).toFixed(3)}) — razão/esperado média ${(mean / n).toFixed(4)}, pior ${(worst * 100).toFixed(2)} %`,
        );
        check(worst <= 0.03, `beer: σ = ${sigma}: erro ${(worst * 100).toFixed(2)} % (≤ 3 %)`);
    });
}

/**
 * Vidro na névoa: a parede acesa de `beer` com névoa só absorvente (σ = 0,5/m) e uma placa de vidro (IOR 1,5) cobrindo a
 * metade esquerda da vista, atrás da névoa e dentro dela. A razão com/sem névoa através do vidro é a mesma que ao lado
 * dele (a névoa atenua uma vez o caminho todo; contada também no vidro, a razão seria a do quadrado) — a ≤ 3 %.
 */
async function glass(): Promise<void> {
    const size = { width: 640, height: 400 };
    const scene: GiScene = {
        slabs: [{ id: 1, min: [-4, -1, -2.2], max: [4, 3, -2], color: [0.8, 0.8, 0.8] }],
        sun: { direction: [-0.97, -0.2, -0.15], illuminance: 100 },
        camera: { position: [0, 1, 4], target: [0, 1, -2], fovY: Math.PI / 5 },
        probeCenter: [0, 1, 0],
        regions: new Map([[1, 'parede']]),
    };
    const pane = (app: Application, z: number): void => {
        app.world.insert(
            new BoxGeometry({ size: [2, 3, 0.02] })
                .add(new StandardMaterial())
                .add(new Transform({ position: [-1, 1, z, 1] }))
                .add(
                    closureFn(
                        'return closure_add(closure_dielectric(1.5, vec3f(1.0), 0.0, 0.0, vec3f(0.0)), closure_transmission(1.5, vec3f(1.0), 0.0, 0.0, 0.0));',
                        ['specular', 'transmission'],
                    ),
                ),
        );
    };
    for (const z of [-1, 1]) {
        const shots: HdrImage[] = [];
        for (const sigma of [0, 0.5]) {
            const fogs =
                sigma === 0
                    ? []
                    : [
                          new FogVolume({
                              shape: { box: [8, 5, 2] },
                              center: [0, 1, 1],
                              density: sigma,
                              albedo: [0, 0, 0],
                          }),
                      ];
            const s = await open(scene, size, fogs, {}, (app) => {
                pane(app, z);
            });
            await s.step(30);
            shots.push(await s.read());
            s.close();
        }
        const ratio = (x0: number, x1: number): number => {
            let a = 0;
            let b = 0;
            for (let y = 170; y < 230; y++)
                for (let x = x0; x < x1; x++) {
                    a += hdrLuminance(shots[1]!, x, y);
                    b += hdrLuminance(shots[0]!, x, y);
                }
            return a / b;
        };
        const through = ratio(250, 300);
        const beside = ratio(340, 390);
        const err = Math.abs(through / beside - 1);
        log(
            `glass: vidro ${z < 0 ? 'atrás da' : 'dentro da'} névoa — razão com/sem névoa através dele ${through.toFixed(4)}, ao lado ${beside.toFixed(4)} (${(err * 100).toFixed(2)} %)`,
        );
        check(
            err <= 0.03,
            `glass: vidro ${z < 0 ? 'atrás' : 'dentro'}: ${(err * 100).toFixed(2)} % (≤ 3 %)`,
        );
    }
}

/** Cômodo da janela com as paredes pretas (só a névoa espalha) e uma caixa de névoa homogênea enchendo o interior. */
function blackRoom(): GiScene {
    const room = windowRoom();
    return {
        ...room,
        sky: false,
        slabs: room.slabs.map((s) => ({ ...s, color: [0, 0, 0] as Vec3 })),
    };
}

const ROOM_FOG = {
    center: [0, 1.25, 0] as const,
    size: [4, 2.5, 4] as const,
    sigma: 0.15,
    albedo: 0.9,
    g: 0.3,
};

const roomFog = (): FogVolume =>
    new FogVolume({
        shape: { box: ROOM_FOG.size },
        center: ROOM_FOG.center,
        density: ROOM_FOG.sigma,
        albedo: [ROOM_FOG.albedo, ROOM_FOG.albedo, ROOM_FOG.albedo],
        anisotropy: ROOM_FOG.g,
    });

/** Média da luminância numa janela (frações da imagem). */
function windowMean(
    img: { width: number; height: number; at: (x: number, y: number) => number },
    wx: number,
    wy: number,
    cols: number,
    rows: number,
): number {
    const x0 = Math.floor((wx / cols) * img.width);
    const x1 = Math.floor(((wx + 1) / cols) * img.width);
    const y0 = Math.floor((wy / rows) * img.height);
    const y1 = Math.floor(((wy + 1) / rows) * img.height);
    let sum = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += img.at(x, y);
    return sum / ((x1 - x0) * (y1 - y0));
}

/**
 * O feixe: o cômodo de paredes pretas, névoa homogênea e o sol pela janela — a luz espalhada por região (grade 8 × 5 da
 * imagem) contra o traçador com o mesmo meio (espalhamento simples, o sol com a sombra e a névoa até ele).
 */
async function beam(): Promise<void> {
    const size = { width: 640, height: 400 };
    const scene = blackRoom();
    const s = await open(scene, size, [roomFog()]);
    await s.step(60);
    const img = await s.read();
    s.close();
    const t0 = performance.now();
    const pt = pathTracedScene(scene);
    const medium: PtMedium = {
        min: ROOM_FOG.center.map((c, k) => c - ROOM_FOG.size[k]! / 2) as unknown as Vec3,
        max: ROOM_FOG.center.map((c, k) => c + ROOM_FOG.size[k]! / 2) as unknown as Vec3,
        scattering: [1, 1, 1].map(() => ROOM_FOG.sigma * ROOM_FOG.albedo) as unknown as Vec3,
        absorption: [1, 1, 1].map(() => ROOM_FOG.sigma * (1 - ROOM_FOG.albedo)) as unknown as Vec3,
        g: ROOM_FOG.g,
    };
    const ref = await renderPathTracedParallel({ ...pt.scene, media: [medium] }, pt.camera, {
        width: 320,
        height: 200,
        samples: 1,
        bounces: 0,
        media: 'single',
        marchSteps: 192,
    });
    log(
        `beam: referência (320×200, espalhamento simples) em ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
    const engine = {
        width: img.width,
        height: img.height,
        at: (x: number, y: number) => hdrLuminance(img, x, y),
    };
    const reference = {
        width: ref.width,
        height: ref.height,
        at: (x: number, y: number) => {
            const i = (y * ref.width + x) * 3;
            return lum(ref.rgb[i]!, ref.rgb[i + 1]!, ref.rgb[i + 2]!);
        },
    };
    const cols = 8;
    const rows = 5;
    const cells: { e: number; r: number; wx: number; wy: number }[] = [];
    for (let wy = 0; wy < rows; wy++)
        for (let wx = 0; wx < cols; wx++)
            cells.push({
                e: windowMean(engine, wx, wy, cols, rows),
                r: windowMean(reference, wx, wy, cols, rows),
                wx,
                wy,
            });
    const peak = Math.max(...cells.map((c) => c.r));
    const lit = cells.filter((c) => c.r >= 0.25 * peak);
    const dark = cells.filter((c) => c.r <= 0.05 * peak);
    const errors = lit.map((c) => Math.abs(c.e / c.r - 1));
    const worst = Math.max(...errors);
    const mean = errors.reduce((a, b) => a + b, 0) / Math.max(1, errors.length);
    log(
        `beam: ${lit.length} regiões do feixe — motor/referência erro médio ${(mean * 100).toFixed(1)} %, pior ${(worst * 100).toFixed(1)} %; ${lit.map((c) => `(${c.wx},${c.wy}) ${c.e.toFixed(1)}/${c.r.toFixed(1)}`).join(' ')}`,
    );
    check(
        lit.length >= 3 && worst <= 0.1,
        `beam: feixe a ${(worst * 100).toFixed(1)} % da referência (≤ 10 %)`,
    );
    const litMean = lit.reduce((a, c) => a + c.e, 0) / Math.max(1, lit.length);
    const darkMean = dark.reduce((a, c) => a + c.e, 0) / Math.max(1, dark.length);
    log(
        `beam: fora do feixe ${darkMean.toFixed(2)} contra ${litMean.toFixed(2)} no feixe (${dark.length} regiões)`,
    );
    check(dark.length > 0 && darkMean < 0.25 * litMean, 'beam: fora do feixe mais escuro');
}

/** Posição contínua de um ponto de mundo na grade dos froxels (x, y em froxels; z em fatias), pela câmera da cena. */
function froxelOf(scene: GiScene, size: Size, depth: readonly number[], p: Vec3): Vec3 {
    const [px, py] = projectPoint(scene, size.width, size.height, p);
    const c = scene.camera;
    const z = dot(sub(p, c.position), normalize(sub(c.target, c.position)));
    const [near, far] = depth as [number, number];
    return [
        (px / size.width) * FROXEL_GRID[0],
        (py / size.height) * FROXEL_GRID[1],
        (Math.log(z / near) / Math.log(far / near)) * FROXEL_GRID[2],
    ];
}

/**
 * A luz rebatida na névoa: o cômodo da janela com o céu físico e paredes claras, névoa homogênea; a luz espalhada lida
 * nos froxels com a iluminação global ligada e desligada (desligada, a névoa só tem o sol: o hemisfério sai com ela). Com
 * ela, a névoa inteira clareia, e mais ao lado da mancha de sol no chão que no canto escuro do teto.
 */
async function gi(): Promise<void> {
    const size = { width: 640, height: 400 };
    const scene = windowRoom();
    const reads: { scatter: Float32Array; ambient: Float32Array; depth: readonly number[] }[] = [];
    for (const on of [true, false]) {
        const s = await open(scene, size, [roomFog()], { gi: on });
        await s.step(120);
        const froxels = s.app.world.findResource(Froxels.schema, Froxels)!;
        // A grade ambiente guarda, por quadro, um ponto sorteado dentro de cada célula (perto de uma parede, às vezes do
        // outro lado dela); a névoa a integra no tempo (histórico dos froxels). A medida é a média de 16 quadros.
        const ambient = await s.ambient();
        for (let k = 1; k < 16; k++) {
            await s.step(1);
            const next = await s.ambient();
            for (let i = 0; i < ambient.length; i++) ambient[i]! += next[i]!;
        }
        for (let i = 0; i < ambient.length; i++) ambient[i]! /= 16;
        reads.push({
            scatter: await s.froxels(),
            ambient,
            depth: froxels.data.params[0].depth!,
        });
        s.close();
    }
    const [on, off] = reads as [(typeof reads)[0], (typeof reads)[0]];
    // A névoa toda: a luz espalhada até o fim de cada coluna.
    const [w, h, d] = FROXEL_GRID;
    let sumOn = 0;
    let sumOff = 0;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = (((d - 1) * h + y) * w + x) * 4;
            sumOn += lum(on.scatter[i]!, on.scatter[i + 1]!, on.scatter[i + 2]!);
            sumOff += lum(off.scatter[i]!, off.scatter[i + 1]!, off.scatter[i + 2]!);
        }
    const gain = sumOn / sumOff;
    // A luz que a névoa recebe da luz rebatida (a grade ambiente) ao lado da mancha de sol (fora do feixe) e no canto
    // do teto do lado oposto à janela.
    const near: Vec3 = [0.2, 0.25, 1.1];
    const corner: Vec3 = [-1.2, 2.0, -1.7];
    const ambientAt = (read: (typeof reads)[0], p: Vec3): number => {
        const f = froxelOf(scene, size, read.depth, p);
        const [aw, ah, ad] = FROXEL_AMBIENT_GRID;
        const x = Math.min(aw - 1, Math.max(0, Math.floor((f[0] / FROXEL_GRID[0]) * aw)));
        const y = Math.min(ah - 1, Math.max(0, Math.floor((f[1] / FROXEL_GRID[1]) * ah)));
        const z = Math.min(ad - 1, Math.max(0, Math.floor((f[2] / FROXEL_GRID[2]) * ad)));
        const i = ((z * ah + y) * aw + x) * 4;
        return lum(read.ambient[i]!, read.ambient[i + 1]!, read.ambient[i + 2]!);
    };
    const a = ambientAt(on, near);
    const b = ambientAt(on, corner);
    log(
        `gi: luz espalhada pela névoa com/sem a iluminação global ${gain.toFixed(2)}×; radiância ambiente que a névoa recebe ao lado da mancha de sol ${a.toFixed(2)}, no canto do teto longe da janela ${b.toFixed(2)} (sem a GI: ${ambientAt(off, near).toFixed(2)}, ${ambientAt(off, corner).toFixed(2)})`,
    );
    check(gain >= 1.05, `gi: a névoa com a luz rebatida ${gain.toFixed(2)}× (≥ 1,05)`);
    check(a > b, 'gi: a névoa recebe mais luz rebatida perto da superfície acesa');
}

/** Gradiente horizontal relativo (p99 de |L(x+1) − L(x)| / média) e a média numa janela de pixels. */
function steps(
    img: HdrImage,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
): { p99: number; mean: number } {
    let mean = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mean += hdrLuminance(img, x, y);
    mean /= (x1 - x0) * (y1 - y0);
    const diffs: number[] = [];
    for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1 - 1; x++)
            diffs.push(Math.abs(hdrLuminance(img, x + 1, y) - hdrLuminance(img, x, y)) / mean);
    diffs.sort((p, q) => p - q);
    return { p99: diffs[Math.floor(diffs.length * 0.99)]!, mean };
}

/**
 * Densidade por função: o cômodo de paredes pretas sem sol, só a luz ambiente uniforme (a névoa clara onde é densa), e
 * uma névoa cuja densidade varia em senoides (período de ~1,6 m) — a imagem segue a densidade sem degraus: o passo
 * entre pixels vizinhos fica abaixo de 3 % da média (a variação da própria densidade é de ~1 % por pixel; um degrau de
 * froxel daria a variação de 4 pixels de uma vez).
 */
async function noise(): Promise<void> {
    const size = { width: 640, height: 400 };
    const room = blackRoom();
    const scene: GiScene = {
        slabs: room.slabs,
        camera: room.camera,
        regions: room.regions,
        probeCenter: room.probeCenter,
    };
    const fog = new FogVolume({
        shape: { box: ROOM_FOG.size },
        center: ROOM_FOG.center,
        density: {
            code: 'fn density_fn(p: vec3f, time: f32, data: DensityFnParams) -> f32 { return 0.6 + 0.4 * sin(p.x * data.k) * sin(p.z * data.k + 0.7) * cos(p.y * data.k); }',
            params: { k: 'f32' },
            values: { k: 4 },
        },
        extinction: ROOM_FOG.sigma,
        albedo: [0.9, 0.9, 0.9],
        anisotropy: 0.3,
    });
    const s = await open(scene, size, [fog], { ambient: 100 });
    await s.step(60);
    const img = await s.read();
    s.close();
    const r = steps(img, 40, 40, 600, 360);
    log(
        `noise: densidade por função — passo p99 entre pixels vizinhos ${(r.p99 * 100).toFixed(2)} % da média (${r.mean.toFixed(1)})`,
    );
    check(r.mean > 1, 'noise: a névoa aparece');
    check(r.p99 <= 0.03, `noise: degraus ${(r.p99 * 100).toFixed(2)} % (≤ 3 %)`);
}

/** Cintilação de um percurso: por quadro, a diferença para a média dos vizinhos, relativa (ordenada). */
async function walkFlicker(withFog: boolean): Promise<number[]> {
    const size = { width: 480, height: 300 };
    const scene: GiScene = { ...windowRoom(), sky: false };
    const s = await open(scene, size, withFog ? [roomFog()] : [], { ambient: 0.3 });
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
    const flicker: number[] = [];
    for (let i = 1; i < frames.length - 1; i++) {
        let diff = 0;
        let mean = 0;
        for (let y = 20; y < size.height - 20; y += 2)
            for (let x = 20; x < size.width - 20; x += 2) {
                const v = hdrLuminance(frames[i]!, x, y);
                const avg =
                    (hdrLuminance(frames[i - 1]!, x, y) + hdrLuminance(frames[i + 1]!, x, y)) / 2;
                diff += Math.abs(v - avg);
                mean += v;
            }
        flicker.push(diff / mean);
    }
    return flicker.sort((p, q) => p - q);
}

/**
 * A câmera andando pela névoa (o cômodo da janela com paredes claras, o feixe e o hemisfério): a cintilação (a diferença
 * de cada quadro para a média dos vizinhos, relativa) contra a do mesmo percurso sem névoa — o movimento da imagem já
 * dá uma parte; a névoa não acrescenta mais que 0,5 ponto no p99.
 */
async function walk(): Promise<void> {
    const fog = await walkFlicker(true);
    const clear = await walkFlicker(false);
    const p99 = (f: number[]): number => f[Math.floor(f.length * 0.99)]!;
    log(
        `walk: câmera andando — cintilação p99 com névoa ${(p99(fog) * 100).toFixed(2)} %, sem ${(p99(clear) * 100).toFixed(2)} % (medianas ${(fog[fog.length >> 1]! * 100).toFixed(2)} / ${(clear[clear.length >> 1]! * 100).toFixed(2)} %)`,
    );
    check(
        p99(fog) <= p99(clear) + 0.005,
        `walk: a névoa acrescenta ${((p99(fog) - p99(clear)) * 100).toFixed(2)} pontos de cintilação (≤ 0,5)`,
    );
}

/**
 * Névoa opaca: um corredor de 40 m com névoa densa (σ = 0,4/m, o fundo some em ~10 m) sob o sol e o hemisfério — a
 * coluna do centro da imagem, do chão perto até o fundo, cai suave: nenhuma segunda diferença acima de 2 % do valor
 * (uma banda por fatia apareceria como um degrau periódico).
 */
async function opaque(): Promise<void> {
    const size = { width: 480, height: 320 };
    const scene: GiScene = {
        slabs: [
            { id: 1, min: [-2, -0.15, -40], max: [2, 0, 2], color: [0.7, 0.7, 0.7] },
            { id: 2, min: [-2.15, 0, -40], max: [-2, 3, 2], color: [0.7, 0.7, 0.7] },
            { id: 3, min: [2, 0, -40], max: [2.15, 3, 2], color: [0.7, 0.7, 0.7] },
        ],
        sun: { direction: [0.3, -0.9, -0.3], illuminance: 100 },
        camera: { position: [0, 1.2, 1.5], target: [0, 0.6, -10], fovY: Math.PI / 4 },
        probeCenter: [0, 1, -5],
        regions: new Map([[1, 'chão']]),
    };
    const fog = new FogVolume({
        shape: { box: [4, 3, 42] },
        center: [0, 1.5, -19],
        density: 0.4,
        albedo: [0.9, 0.9, 0.9],
        anisotropy: 0.2,
    });
    const s = await open(scene, size, [fog], { ambient: 0.3 });
    await s.step(60);
    const img = await s.read();
    s.close();
    const column: number[] = [];
    for (let y = size.height - 4; y >= size.height / 2 - 20; y--) {
        let v = 0;
        for (let x = size.width / 2 - 8; x < size.width / 2 + 8; x++) v += hdrLuminance(img, x, y);
        column.push(v / 16);
    }
    let worst = 0;
    for (let i = 1; i < column.length - 1; i++)
        worst = Math.max(
            worst,
            Math.abs(column[i + 1]! - 2 * column[i]! + column[i - 1]!) / column[i]!,
        );
    log(
        `opaque: coluna do chão ao fundo (${column[0]!.toFixed(2)} → ${column[column.length - 1]!.toFixed(2)}) — maior segunda diferença ${(worst * 100).toFixed(2)} %`,
    );
    check(worst <= 0.02, `opaque: banda ${(worst * 100).toFixed(2)} % (≤ 2 %)`);
}

/** Aplicação de medida de tempo: o cômodo da janela com a luz rebatida (e a névoa), pronta (nada compilando). */
async function timingApp(
    width: number,
    height: number,
    withFog: boolean,
): Promise<{
    app: Application;
    canvas: HTMLCanvasElement;
    perFrame: (frames: number) => Promise<number>;
}> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
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
    app.events.on('engineError', (e) => engineErrors.push(`timing: ${e.stage}: ${e.message}`));
    const scene = windowRoom();
    buildGiScene(app, scene, width / height);
    app.world.insert(
        new GlobalIllumination({
            quality: 'medium',
            bounces: 2,
            probeSpacing: scene.probeSpacing ?? 0.3,
            cascades: 1,
            center: scene.probeCenter,
        }),
    );
    if (withFog) app.world.insert(roomFog());
    const ready = { revision: -1, at: 0 };
    app.events.on('globalIlluminationReady', (e) => {
        ready.revision = e.revision;
        ready.at = performance.now();
    });
    // Nenhuma compilação pendente por 2 s. Só no teste: a fila interna do núcleo.
    const pending = (): number =>
        (app.core as unknown as { pendingPipelines: Map<string, unknown> }).pendingPipelines.size;
    await settle(app, 3000);
    const limit = performance.now() + 120000;
    let quietSince = performance.now();
    while (performance.now() < limit) {
        await settle(app, 100);
        if (pending() > 0 || ready.revision < 0) quietSince = performance.now();
        else if (performance.now() - quietSince > 2000) break;
    }
    // Espera todo o trabalho enviado à GPU terminar (uma leitura de volta pequena depois dele).
    const fence = async (): Promise<void> => {
        const staging = app.core.create<StagingBufferSpec>({
            kind: 'buffer',
            subkind: 'staging',
            discriminator: 'fog_timing_fence',
            byteSize: 16,
        });
        const froxels = app.world.findResource(Froxels.schema, Froxels)!;
        const media = app.resources.bufferOf(froxels, 'media')!;
        app.core.record('fog-timing-fence', (frame) => {
            frame.copy(media, staging, 16);
        });
        app.core.submit();
        await app.core.readback(staging);
        app.core.destroy(staging);
    };
    // Tempo de parede por quadro com a GPU como gargalo: quadros seguidos e a espera no fim.
    const perFrame = async (frames: number): Promise<number> => {
        for (let i = 0; i < 10; i++) app.step(1 / 60);
        await fence();
        const t0 = performance.now();
        for (let i = 0; i < frames; i++) app.step(1 / 60);
        await fence();
        return (performance.now() - t0) / frames;
    };
    return { app, canvas, perFrame };
}

/**
 * O custo da névoa a 1280×720 no cômodo da janela com a luz rebatida, em duas partes medidas com o tempo de parede por
 * quadro (a GPU como gargalo; o tempo de GPU do quadro desta máquina repete leituras velhas e oscila em patamares do
 * relógio): (a) os froxels — na mesma aplicação, o estágio despachado 41 vezes por quadro contra 21 (o `dispatch`
 * envolvido só no teste), (T₄₁ − T₂₁)/20; (b) o que é por pixel (a leitura no desenho, a névoa na luz das superfícies e
 * dos raios) — com e sem névoa em 4K, onde ele domina, (T_com − T_sem − froxels)/9 para 1280×720. A soma ≤ 1 ms.
 */
async function timing(): Promise<void> {
    const t = await timingApp(1280, 720, true);
    const proto = FroxelFlow.prototype as unknown as { dispatch: (...args: unknown[]) => void };
    const original = proto.dispatch;
    let repeat = 1;
    proto.dispatch = function (this: unknown, ...args: unknown[]): void {
        for (let k = 0; k < repeat; k++) original.apply(this, args);
    };
    const froxelCosts: number[] = [];
    for (let round = 0; round < 2; round++) {
        repeat = 21;
        const low = await t.perFrame(60);
        repeat = 41;
        const high = await t.perFrame(60);
        froxelCosts.push((high - low) / 20);
        log(
            `timing: froxels a 1280×720 — tempo por quadro com o estágio 21× ${low.toFixed(2)} ms, 41× ${high.toFixed(2)} ms → ${((high - low) / 20).toFixed(2)} ms por despacho`,
        );
    }
    proto.dispatch = original;
    t.app.dispose();
    t.canvas.remove();
    const froxels = Math.max(...froxelCosts);
    // Por pixel: com e sem névoa em 4K, alternando duas vezes.
    const pixelCosts: number[] = [];
    for (let round = 0; round < 2; round++) {
        const times: number[] = [];
        for (const withFog of [true, false]) {
            const a = await timingApp(3840, 2160, withFog);
            times.push(await a.perFrame(40));
            a.app.dispose();
            a.canvas.remove();
        }
        const perPixel = Math.max(0, times[0]! - times[1]! - froxels) / 9;
        pixelCosts.push(perPixel);
        log(
            `timing: 4K — tempo por quadro com névoa ${times[0]!.toFixed(2)} ms, sem ${times[1]!.toFixed(2)} ms → por pixel a 1280×720 ${perPixel.toFixed(2)} ms`,
        );
    }
    const perPixel = Math.max(...pixelCosts);
    const cost = froxels + perPixel;
    log(
        `timing: a névoa a 1280×720 custa ${cost.toFixed(2)} ms (froxels ${froxels.toFixed(2)} + por pixel ${perPixel.toFixed(2)})`,
    );
    check(froxels > 0, 'timing: o trabalho dos froxels aparece na medida');
    check(cost <= 1, `timing: névoa ${cost.toFixed(2)} ms (≤ 1 ms)`);
}

type CaseFn = () => Promise<void>;
const CASES: Record<string, CaseFn> = { beer, glass, beam, gi, noise, walk, opaque, timing };

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('FOG SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
