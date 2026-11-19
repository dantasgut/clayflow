// Spec 041 — Smoke das nuvens volumétricas (US1–US4), pelo caminho de autoria (`Sky` + `CloudLayer`).
//
// A referência é a f64 de `elements/media/clouds/reference/cloudModel.ts` sobre os volumes de ruído lidos da própria GPU
// (a mesma representação dos dois lados: memória "referência da CPU distorce"); a atmosfera é a de
// `scene/reference/atmosphere.ts`. Casos (`--query case=<nome>`):
//   - noise-volumes: os volumes de forma e de detalhe contra o grafo padrão avaliado pela referência u32 (2/255);
//   - ambient: as irradiâncias do céu e do chão contra a integral da radiância do céu da referência (≤ 5 %);
//   - noon: a nuvem vista do chão (luz espalhada e transmitância por região) contra a marcha de referência (SC-001), com
//     a luz das sondas do cache de espalhamento lida da GPU (`?settle=` quadros antes; `?dump=W` grava blocos da imagem);
//   - scatter-cache: as sondas do cache de espalhamento (T023) contra caminhos f64 nas mesmas sondas (viés ≤ 5 %);
//   - timing: o custo por passe das nuvens a 1280 × 720 no perfil alto (SC-005);
//   - pressure-wind: o vento das nuvens, a subida e a frente do quadrado do tempo contra a referência f64
//     (`reference/cloudWeather.ts`) numa baixa gaussiana a 45° N, 45° S e no equador, e o mapa de cobertura pelo tempo
//     contra o mapeamento da referência (SC-010, R19);
//   - storm: a tempestade numa baixa — a torre do cúmulo-nimbo até a tropopausa e a bigorna (SC-011), e a vista dela
//     contra a marcha de referência;
//   - storm-ground: a luz do sol no chão da câmera sob o tempo acelerado (a `tempestade` da rodada 7), quadro a quadro,
//     contra a referência no mesmo quadro, e o deslocamento da sombra numa linha no rumo do vento;
//   - front: a faixa de nuvens entre uma baixa e uma alta (Okubo–Weiss) e o céu limpo na subsidência da alta;
//   - weather-timing: o custo do tempo (o estado e o mapa de cobertura por ele) a 1280 × 720 no perfil alto (SC-012);
//   - interior-timing: o custo da camada com a câmera numa sala fechada (SC-005);
//   - sky-timing: o custo novo do céu sem a camada (SC-009).
// Para rodar: `npm run smoke -- clouds --headless --timeout 400`. Resultado: `CLOUDS SMOKE PASSED` ou `FAIL: …`.
import {
    CLOUD_OCTAVES,
    CLOUD_SCATTER_EXTENT,
    CLOUD_SCATTER_NEAR,
    CLOUD_SCATTER_PRIOR,
    CLOUD_SCATTER_SNAP,
    type Application,
    type CloudLayer,
    CloudLayer as CloudLayerClass,
    Sky as SkyClass,
    type Sky,
} from 'clayflow/web';
import { nextGpuFrame, settleFrames } from './support/extensionScenes';
import {
    cloudScene,
    sunTravel,
    disposeCloudScene,
    readCloudVolume,
    readScatterCache,
    readShadowMap,
    readTexture,
    type CloudScene,
} from './support/cloudScenes';
import { readHdrTexture } from './support/imageMeasures';
import {
    BoxGeometry,
    FogVolume,
    graphArgument,
    NodeGraph,
    nodes,
    StandardMaterial,
    Transform,
} from 'clayflow/web';
import { materialGraph } from './support/materialScenes';
import { noiseCellular3 } from '../elements/nodes/reference/noiseNodes';
import {
    altitude as altitudeOf,
    coneSunDepth,
    opticalDepth,
    shellSegments,
    sphereSpan,
    coverageField,
    typeField,
    cloudDensity,
    defaultShape,
    jdeParams,
    marchCloud,
    type CloudModel,
    type Vec3,
} from '../elements/media/clouds/reference/cloudModel';
import {
    phaseTruncation,
    scatterProbePosition,
    scatterWalk,
    type ScatterGrid,
} from '../elements/media/clouds/reference/cloudScatter';
import { deltaRng } from '../elements/lighting/reference/pathTracer';
import {
    shadowColumnSun,
    shadowFrameOf,
    shadowKnotAt,
    type ShadowAtlas,
} from '../elements/media/clouds/reference/cloudShadowPages';
import {
    coriolis,
    FREE_DRAG,
    pressureStencil,
    weatherAt,
    anvilSource,
    weatherClouds,
    type WeatherParams,
} from '../elements/media/clouds/reference/cloudWeather';
import { luminance } from '../elements/math/reference/color';
import {
    aerialPerspective,
    earthAtmosphere,
    multipleScattering,
    skyRadiance,
    sunTransmittance,
    transmittanceToTop,
} from '../elements/scene/reference/atmosphere';

function log(msg: string): void {
    console.log(`[clouds] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

function finish(s: CloudScene): void {
    engineErrors.push(...s.errors);
    disposeCloudScene(s);
}

const atmosphere = earthAtmosphere();
const msCache = new Map<string, Vec3>();
/** Ψms memorizado numa grade de (raio, cosseno do sol). */
function ms(r: number, muS: number): Vec3 {
    const key = `${r.toFixed(2)}:${muS.toFixed(2)}`;
    let v = msCache.get(key);
    if (v === undefined) {
        v = multipleScattering(atmosphere, r, muS, 24, 16);
        msCache.set(key, v);
    }
    return v;
}

const quantize = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255;

/** O modelo da referência com os volumes lidos da GPU e os valores da camada (a cobertura quantizada como no mapa). */
async function referenceModel(s: CloudScene, layer: CloudLayer, time = 0): Promise<CloudModel> {
    const shape = await readCloudVolume(s.app, layer, 'shape');
    const detail = await readCloudVolume(s.app, layer, 'detail');
    // Com o tempo (R19), o mapa de cobertura é o da GPU (a mesma representação dos dois lados; o mapa em si é conferido
    // contra a referência do tempo no caso `pressure-wind`).
    if (layer.weather !== undefined) return weatherReferenceModel(s, layer, shape, detail, time);
    const radii = s.sky.data.radii;
    const half = layer.quality.coverageExtent / 2;
    const MAP = layer.quality.coverageSize;
    // O centro do mapa: a câmera encaixada no texel (o empacotamento do `CloudNoiseFlow`).
    const texel = (2 * half) / MAP;
    const eye = s.camera.data.position;
    const center = [
        Math.round((eye[0] ?? 0) / texel) * texel,
        Math.round((eye[2] ?? 0) / texel) * texel,
    ];
    const cache = new Map<number, [number, number]>();
    const mapTexel = (x: number, z: number): [number, number] => {
        const key = Math.round(x) * 1e7 + Math.round(z);
        let v = cache.get(key);
        if (v === undefined) {
            v = [quantize(coverageField(x, z, c, t)), quantize(typeField(x, z, t))];
            cache.set(key, v);
        }
        return v;
    };
    const c = layer.coverage;
    const t = layer.type;
    const wind = layer.wind;
    const speed = Math.hypot(wind[0], wind[1]);
    return {
        groundRadius: ((radii[0] ?? 6360) + (radii[3] ?? 0.2)) * 1000,
        base: layer.base,
        top: layer.top,
        // O campo da cobertura global como a GPU o lê: no mapa (512², centrado na câmera encaixada no texel), os
        // centros de texel quantizados a 8 bits com filtro bilinear; fora dele, o campo no ponto.
        coverage: (x, z) => {
            if (Math.abs(x - center[0]!) > half || Math.abs(z - center[1]!) > half)
                return [coverageField(x, z, c, t), typeField(x, z, t), 1];
            const fx = ((x - center[0]!) / (2 * half) + 0.5) * MAP - 0.5;
            const fz = ((z - center[1]!) / (2 * half) + 0.5) * MAP - 0.5;
            const x0 = Math.floor(fx);
            const z0 = Math.floor(fz);
            const at = (i: number, j: number): [number, number] => {
                const ci = Math.min(MAP - 1, Math.max(0, i));
                const cj = Math.min(MAP - 1, Math.max(0, j));
                return mapTexel(
                    center[0]! + ((ci + 0.5) / MAP - 0.5) * 2 * half,
                    center[1]! + ((cj + 0.5) / MAP - 0.5) * 2 * half,
                );
            };
            const ax = fx - x0;
            const az = fz - z0;
            const lerp = (k: 0 | 1): number =>
                (at(x0, z0)[k] * (1 - ax) + at(x0 + 1, z0)[k] * ax) * (1 - az)
                + (at(x0, z0 + 1)[k] * (1 - ax) + at(x0 + 1, z0 + 1)[k] * ax) * az;
            return [lerp(0), lerp(1), 1];
        },
        density: layer.density,
        albedo: layer.albedo,
        shape,
        detail,
        shapeScale: layer.shapeScale,
        detailScale: layer.detailScale,
        shapeOffset: [0, 0, 0],
        detailOffset: [0, 0, 0],
        windDir: speed > 0 ? [wind[0] / speed, wind[1] / speed] : [1, 0],
    };
}

/** O modelo da referência com o tempo: o mapa de cobertura lido da GPU (4 canais, bilinear) e, fora dele, o tempo bom. */
async function weatherReferenceModel(
    s: CloudScene,
    layer: CloudLayer,
    shape: CloudModel['shape'],
    detail: CloudModel['detail'],
    time: number,
): Promise<CloudModel> {
    const radii = s.sky.data.radii;
    // Os deslocamentos do vento no tempo simulado (os casos de relógio parado: 0).
    const offsets = layer.windOffsets(time);
    const half = layer.quality.coverageExtent / 2;
    const tex = s.app.resources.textureOf(layer, 'coverage');
    if (tex === undefined) throw new Error('mapa de cobertura não alocado');
    const map = await readTexture(s.app, tex, 'rgba8unorm');
    const MAP = map.width;
    const texel = (2 * half) / MAP;
    const eye = s.camera.data.position;
    const center = [
        Math.round((eye[0] ?? 0) / texel) * texel,
        Math.round((eye[2] ?? 0) / texel) * texel,
    ];
    const c = layer.coverage;
    const t = layer.type;
    const fairTop = Math.min(1, (layer.top - layer.base) / (layer.shellTop - layer.base));
    const wind = layer.wind;
    const speed = Math.hypot(wind[0], wind[1]);
    return {
        groundRadius: ((radii[0] ?? 6360) + (radii[3] ?? 0.2)) * 1000,
        base: layer.base,
        top: layer.shellTop,
        coverage: (x, z) => {
            if (Math.abs(x - center[0]!) > half || Math.abs(z - center[1]!) > half)
                return [coverageField(x, z, c, t), typeField(x, z, t), 0, fairTop];
            const fx = ((x - center[0]!) / (2 * half) + 0.5) * MAP - 0.5;
            const fz = ((z - center[1]!) / (2 * half) + 0.5) * MAP - 0.5;
            const x0 = Math.floor(fx);
            const z0 = Math.floor(fz);
            const ax = fx - x0;
            const az = fz - z0;
            const at = (i: number, j: number, k: number): number =>
                map.data[
                    (Math.min(MAP - 1, Math.max(0, j)) * MAP + Math.min(MAP - 1, Math.max(0, i)))
                        * 4
                        + k
                ]!;
            const lerp = (k: number): number =>
                (at(x0, z0, k) * (1 - ax) + at(x0 + 1, z0, k) * ax) * (1 - az)
                + (at(x0, z0 + 1, k) * (1 - ax) + at(x0 + 1, z0 + 1, k) * ax) * az;
            return [lerp(0), lerp(1), lerp(2), lerp(3)];
        },
        density: layer.density,
        albedo: layer.albedo,
        shape,
        detail,
        shapeScale: layer.shapeScale,
        detailScale: layer.detailScale,
        shapeOffset: offsets.shape,
        detailOffset: offsets.detail,
        windDir: speed > 0 ? [wind[0] / speed, wind[1] / speed] : [1, 0],
        weather: { fairTop, anvilOffset: offsets.anvil },
    };
}

/** Direção de mundo do centro do pixel (px, py) da câmera em `eye` que olha para `target`. */
function pixelDir(
    px: number,
    py: number,
    w: number,
    h: number,
    eye: Vec3,
    target: Vec3,
    fov: number,
): Vec3 {
    const f = 1 / Math.tan(fov / 2);
    const x = (((px + 0.5) / w) * 2 - 1) * (w / h);
    const y = 1 - ((py + 0.5) / h) * 2;
    const fwd = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    const fl = Math.hypot(fwd[0]!, fwd[1]!, fwd[2]!);
    const z: Vec3 = [-fwd[0]! / fl, -fwd[1]! / fl, -fwd[2]! / fl];
    const xr: Vec3 = [z[2], 0, -z[0]];
    const xl = Math.hypot(...xr);
    const xa: Vec3 = [xr[0] / xl, xr[1] / xl, xr[2] / xl];
    const ya: Vec3 = [
        z[1] * xa[2] - z[2] * xa[1],
        z[2] * xa[0] - z[0] * xa[2],
        z[0] * xa[1] - z[1] * xa[0],
    ];
    const v: Vec3 = [x / f, y / f, -1];
    const d: Vec3 = [
        xa[0] * v[0] + ya[0] * v[1] + z[0] * v[2],
        xa[1] * v[0] + ya[1] * v[1] + z[1] * v[2],
        xa[2] * v[0] + ya[2] * v[1] + z[2] * v[2],
    ];
    const l = Math.hypot(...d);
    return [d[0] / l, d[1] / l, d[2] / l];
}

const sunToward = (elevation: number, azimuth = 0): Vec3 => {
    const e = (elevation * Math.PI) / 180;
    const a = (azimuth * Math.PI) / 180;
    return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
};

// ── noise-volumes ──────────────────────────────────────────────────────────────────────────────────────────────────

async function caseNoiseVolumes(): Promise<void> {
    const s = await cloudScene({ width: 256, height: 144 });
    await settleFrames(s.app, 12);
    const layer = s.layer!;
    let worst = 0;
    for (const id of ['shape', 'detail'] as const) {
        const v = await readCloudVolume(s.app, layer, id);
        const n = v.size;
        for (let k = 0; k < 400; k++) {
            const x = (k * 37) % n;
            const y = (k * 61 + 7) % n;
            const z = (k * 89 + 13) % n;
            const ref = defaultShape([(x + 0.5) / n, (y + 0.5) / n, (z + 0.5) / n]);
            const o = ((z * n + y) * n + x) * 4;
            for (let c = 0; c < 4; c++)
                worst = Math.max(worst, Math.abs(v.data[o + c]! - quantize(ref[c]!)));
        }
    }
    log(
        `noise-volumes: pior diferença ${(worst * 255).toFixed(2)}/255 em 800 texels (forma 128³, detalhe 32³)`,
    );
    check(
        worst <= 2 / 255 + 1e-6,
        `noise-volumes: texel difere ${(worst * 255).toFixed(2)}/255 do grafo`,
    );
    finish(s);
}

// ── ambient ────────────────────────────────────────────────────────────────────────────────────────────────────────

async function caseAmbient(): Promise<void> {
    const s = await cloudScene({ width: 256, height: 144, sunElevation: 35 });
    await settleFrames(s.app, 12);
    const t = s.app.resources.textureOf(s.layer!, 'ambient');
    if (t === undefined) throw new Error('ambient não alocado');
    const gpu = await readTexture(s.app, t, 'rgba16float');
    const sun = sunToward(35);
    // A média da radiância do céu no hemisfério de cima (cos θ uniforme), × a iluminância do sol.
    const n = 256;
    const sum = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        const z = 1 - (i + 0.5) / n;
        const phi = i * Math.PI * (3 - Math.sqrt(5));
        const r = Math.sqrt(1 - z * z);
        const L = skyRadiance(
            atmosphere,
            0.2,
            [r * Math.cos(phi), z, r * Math.sin(phi)],
            sun,
            48,
            ms,
        );
        for (let c = 0; c < 3; c++) sum[c]! += (L[c]! * 1000) / n;
    }
    let worst = 0;
    for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(gpu.data[c]! / sum[c]! - 1));
    log(
        `ambient: céu GPU ${[0, 1, 2].map((c) => gpu.data[c]!.toFixed(3)).join('/')} contra ${sum.map((v) => v.toFixed(3)).join('/')} (pior ${(worst * 100).toFixed(2)} %); chão ${[4, 5, 6].map((c) => gpu.data[c]!.toFixed(3)).join('/')}`,
    );
    check(worst <= 0.05, `ambient: irradiância do céu a ${(worst * 100).toFixed(1)} % da integral`);
    finish(s);
}

/**
 * A luz das sondas do cache de espalhamento como a marcha da GPU a lê (T023): a fatia do quadro lida da GPU (a mesma
 * representação dos dois lados; as sondas são conferidas contra os caminhos da referência no caso `scatter-cache`),
 * interpolada como o amostrador (trilinear, borda presa) na soma pré-multiplicada, misturada à estimativa local pelo
 * peso `CLOUD_SCATTER_PRIOR`. Fora da grade, a estimativa local.
 */
async function scatterLookupOf(
    s: CloudScene,
    layer: CloudLayer,
    model: CloudModel,
): Promise<{ kT: number; light: (x: Vec3, prior: Vec3) => Vec3 } | undefined> {
    // O cache que a marcha lê: a fatia do quadro filtrada no espaço (binomial 3 × 3 × 3).
    const tex = s.app.resources.textureOf(layer, 'scatterFiltered');
    if (tex === undefined) return undefined;
    const grid = await readTexture(s.app, tex, 'rgba16float');
    const E = s.sky.data.sunIlluminance[1] ?? 1;
    const eye = s.camera.data.position;
    const snap = (v: number): number =>
        Math.floor(v / CLOUD_SCATTER_SNAP + 0.5) * CLOUD_SCATTER_SNAP;
    const cx = snap(eye[0] ?? 0);
    const cz = snap(eye[2] ?? 0);
    const reach = Math.asinh(CLOUD_SCATTER_EXTENT / CLOUD_SCATTER_NEAR);
    const size = [grid.width, grid.height, grid.depth];
    const trunc = phaseTruncation(jdeParams(layer.dropletDiameter));
    const at = (i: number, j: number, k: number, c: number): number =>
        grid.data[((k * size[1]! + j) * size[0]! + i) * 4 + c]!;
    return {
        kT: 1 - model.albedo * trunc.fc,
        light: (x, prior) => {
            const u = (Math.asinh((x[0] - cx) / CLOUD_SCATTER_NEAR) / reach + 1) / 2;
            const w = (Math.asinh((x[2] - cz) / CLOUD_SCATTER_NEAR) / reach + 1) / 2;
            if (u < 0 || u > 1 || w < 0 || w > 1) return prior;
            const h = Math.min(
                1,
                Math.max(0, (altitudeOf(model, x) - model.base) / (model.top - model.base)),
            );
            const f = [u * size[0]! - 0.5, h * size[1]! - 0.5, w * size[2]! - 0.5];
            const b = f.map(Math.floor);
            const q = [0, 0, 0, 0];
            for (let dz = 0; dz < 2; dz++)
                for (let dy = 0; dy < 2; dy++)
                    for (let dx = 0; dx < 2; dx++) {
                        const wt =
                            (dx ? f[0]! - b[0]! : 1 - f[0]! + b[0]!)
                            * (dy ? f[1]! - b[1]! : 1 - f[1]! + b[1]!)
                            * (dz ? f[2]! - b[2]! : 1 - f[2]! + b[2]!);
                        const i = Math.min(size[0]! - 1, Math.max(0, b[0]! + dx));
                        const j = Math.min(size[1]! - 1, Math.max(0, b[1]! + dy));
                        const k = Math.min(size[2]! - 1, Math.max(0, b[2]! + dz));
                        for (let c = 0; c < 4; c++) q[c]! += wt * at(i, j, k, c);
                    }
            const n0 = CLOUD_SCATTER_PRIOR;
            return [0, 1, 2].map(
                (c) => (q[c]! * E + n0 * prior[c]!) / (Math.max(q[3]!, 0) + n0),
            ) as unknown as Vec3;
        },
    };
}

// ── noon ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Compara a nuvem aumentada (`view`) com a marcha de referência num conjunto de regiões. */
async function compareView(
    s: CloudScene,
    label: string,
    eye: Vec3,
    target: Vec3,
    fov: number,
    sunElevation: number,
    cone = false,
    sunAzimuth = 0,
    frames = 48,
): Promise<{ worstT: number; worstL: number; edgeRatio: number }> {
    const layer = s.layer!;
    const w = s.canvas.width;
    const h = s.canvas.height;
    const marchScale = layer.quality.marchScale;
    const t = s.app.resources.textureOf(layer, 'view');
    const amb = s.app.resources.textureOf(layer, 'ambient');
    if (t === undefined || amb === undefined)
        throw new Error(`${label}: alvos das nuvens não alocados`);
    // A imagem convergida: a média de 48 quadros seguidos da nuvem apresentada (o ruído do deslocamento inicial da
    // marcha, que a média temporal integra, é medido à parte como cintilação no smoke `antialiasing`). Num quadro só,
    // a faixa de nuvens de 2–4 px rente ao horizonte variava a região até 12 % (`sunset`); com 48, ≤ 5 %.
    const FRAMES = Number(new URLSearchParams(location.search).get('frames') ?? frames);
    const first = await readTexture(s.app, t, 'rgba16float');
    const acc = new Float32Array(first.data.length);
    for (let k = 0; k < acc.length; k++) acc[k] = first.data[k]! / FRAMES;
    for (let f = 1; f < FRAMES; f++) {
        await settleFrames(s.app, 1);
        const v = await readTexture(s.app, t, 'rgba16float');
        for (let k = 0; k < acc.length; k++) acc[k]! += v.data[k]! / FRAMES;
    }
    const view = { ...first, data: acc };
    // Diagnóstico (`?dump=W`): a luz apresentada (rgb, nits) em blocos de W × W·h/w, para comparar fora da página com o
    // traçador.
    const dump = Number(new URLSearchParams(location.search).get('dump') ?? 0);
    if (dump > 0) {
        const dh = Math.round((dump * h) / w);
        const out: number[][] = [];
        for (let by = 0; by < dh; by++)
            for (let bx = 0; bx < dump; bx++) {
                const c = [0, 0, 0, 0];
                let n = 0;
                for (let py = Math.floor((by * h) / dh); py < Math.floor(((by + 1) * h) / dh); py++)
                    for (
                        let px = Math.floor((bx * w) / dump);
                        px < Math.floor(((bx + 1) * w) / dump);
                        px++
                    ) {
                        const o = (py * w + px) * 4;
                        for (let k = 0; k < 4; k++) c[k]! += view.data[o + k]!;
                        n++;
                    }
                out.push(c.map((v) => +(v / n).toFixed(3)));
            }
        log(`${label}: blocos ${JSON.stringify(out)}`);
    }
    const ambient = await readTexture(s.app, amb, 'rgba16float');
    const model = await referenceModel(s, layer);
    const scatter = await scatterLookupOf(s, layer, model);
    const sun = sunToward(sunElevation, sunAzimuth);
    const lux = s.sun.data.intensity;
    const sunT = sunTransmittance(atmosphere, 0.2 + (layer.base + layer.top) / 2000, sun);
    // A transmitância da atmosfera até cada ponto (pela altitude e o zênite local, como a GPU), memorizada a cada 25 m.
    const sunCache = new Map<number, Vec3>();
    const R = model.groundRadius;
    const sunAt = (x: Vec3): Vec3 => {
        const r = Math.hypot(x[0], x[1] + R, x[2]);
        const up: Vec3 = [x[0] / r, (x[1] + R) / r, x[2] / r];
        const mu = up[0] * sun[0] + up[1] * sun[1] + up[2] * sun[2];
        const key = Math.round((r - R) / 25) * 1000 + Math.round(mu * 500);
        let v = sunCache.get(key);
        if (v === undefined) {
            const t = transmittanceToTop(
                atmosphere,
                atmosphere.bottomRadius + 0.2 + (r - R) / 1000,
                mu,
            );
            v = [t[0] * lux, t[1] * lux, t[2] * lux];
            sunCache.set(key, v);
        }
        return v;
    };
    // Diagnóstico (`?vis=n`): passos da visibilidade do sol no ar da referência (0: sem a sombra das nuvens no ar).
    const visSteps = Number(new URLSearchParams(location.search).get('vis') ?? 32);
    // Diagnóstico (`?amb=k`): o ambiente da referência × k.
    const ambK = Number(new URLSearchParams(location.search).get('amb') ?? 1);
    const light = {
        sunDir: sun,
        sunAt,
        sun: [sunT[0] * lux, sunT[1] * lux, sunT[2] * lux] as Vec3,
        ambientUp: [0, 1, 2].map((c) => ambient.data[c]! * ambK) as unknown as Vec3,
        ambientDown: [4, 5, 6].map((c) => ambient.data[c]! * ambK) as unknown as Vec3,
        ...(scatter === undefined ? {} : { scatter }),
    };
    const phase = jdeParams(layer.dropletDiameter);
    const octaves = { count: layer.quality.octaves, ...CLOUD_OCTAVES };
    // Regiões de 60 × 68 px a 480 × 270: a média por região da SC-001 (o aumento de ¼ borra a borda em ~4 px).
    const cols = 8;
    const rows = 4;
    let worstT = 0;
    let worstL = 0;
    let peak = 0;
    const samples: {
        gT: number;
        rT: number;
        gL: number;
        rL: number;
        depth: number;
        raw: number;
        air: number;
    }[] = [];
    for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
            // A região (o bloco da grade): a média de todos os pixels da GPU e a de 32 × 32 raios da referência nele.
            const x0 = Math.floor((i / cols) * w);
            const x1 = Math.floor(((i + 1) / cols) * w);
            const y0 = Math.floor((j / rows) * h);
            const y1 = Math.floor(((j + 1) / rows) * h);
            let rgbSum = [0, 0, 0];
            let rTSum = 0;
            let depthSum = 0;
            let rawSum = 0;
            let airSum = 0;
            let gL = 0;
            let gT = 0;
            for (let py = y0; py < y1; py++)
                for (let px = x0; px < x1; px++) {
                    const o = (py * w + px) * 4;
                    gL += (view.data[o]! + view.data[o + 1]! + view.data[o + 2]!) / 3;
                    gT += view.data[o + 3]!;
                }
            gL /= (x1 - x0) * (y1 - y0);
            gT /= (x1 - x0) * (y1 - y0);
            // 32 × 32 raios por região: com 16 × 16, a média da referência numa região com borda de nuvem ou com a faixa
            // fina do horizonte errava ela mesma (`far-cloud`, a mesma imagem da GPU: pior transmitância 0,027 → 0,007,
            // pior luz 5,1 → 2,9 % com 32 × 32).
            // Na região que contém o horizonte (rente a ele, a 0–3° de elevação), a faixa das nuvens a 100 km tem 2–4 px de
            // altura: 2 raios por linha de pixel (com 32 linhas, a área da faixa na referência errava até a metade).
            const n = 32;
            const elev = (py: number): number =>
                pixelDir((x0 + x1) / 2, py, w, h, eye, target, fov)[1];
            const horizon = elev(y1) < Math.sin((3 * Math.PI) / 180) && elev(y0) > -0.02;
            const ny = horizon ? 2 * (y1 - y0) : n;
            const nn = n * ny;
            // A referência de uma região leva segundos: o laço cede ao navegador (o executor lê o registro da página).
            await new Promise((r) => setTimeout(r, 0));
            for (let sy = 0; sy < ny; sy++)
                for (let sx = 0; sx < n; sx++) {
                    const px = x0 + ((sx + 0.5) / n) * (x1 - x0) - 0.5;
                    const py = y0 + ((sy + 0.5) / ny) * (y1 - y0) - 0.5;
                    const d = pixelDir(px, py, w, h, eye, target, fov);
                    // O ângulo do pixel da marcha da GPU (S pixels da tela): a pegada do detalhe na amostra da vista.
                    const side = pixelDir(px + marchScale, py, w, h, eye, target, fov);
                    const pixel = Math.hypot(side[0] - d[0], side[1] - d[1], side[2] - d[2]);
                    const r = marchCloud(
                        model,
                        eye,
                        d,
                        Infinity,
                        cone ? { ...light, sunDepth: (x) => coneSunDepth(model, x, sun) } : light,
                        phase,
                        octaves,
                        256,
                        64,
                        pixel,
                    );
                    let c: Vec3 = r.scattered;
                    if (r.transmittance < 1) {
                        // A atmosfera na frente da nuvem com a sombra das nuvens no ar (R18, os raios crepusculares): o
                        // ponto do caminho (km do centro do planeta, a câmera em (0, R + altitude, 0)) volta ao da cena
                        // pela distância percorrida, e a luz simples ali × a transmitância das nuvens até o sol.
                        const alt = 0.2 + eye[1] / 1000;
                        const visibility = (x: Vec3): number => {
                            const t =
                                Math.hypot(x[0], x[1] - (atmosphere.bottomRadius + alt), x[2])
                                * 1000;
                            const p: Vec3 = [
                                eye[0] + d[0] * t,
                                eye[1] + d[1] * t,
                                eye[2] + d[2] * t,
                            ];
                            return visSteps === 0
                                ? 1
                                : Math.exp(-opticalDepth(model, p, sun, visSteps));
                        };
                        const a = aerialPerspective(
                            atmosphere,
                            alt,
                            d,
                            sun,
                            r.depth / 1000,
                            48,
                            ms,
                            visibility,
                        );
                        airSum +=
                            ((1 - r.transmittance)
                                * lux
                                * (a.scattered[0] + a.scattered[1] + a.scattered[2]))
                            / (3 * nn);
                        c = [0, 1, 2].map(
                            (k) =>
                                c[k]! * a.transmittance[k]!
                                + (1 - r.transmittance) * a.scattered[k]! * lux,
                        ) as unknown as Vec3;
                    }
                    rgbSum = rgbSum.map((v, k) => v + c[k]! / nn);
                    rTSum += r.transmittance / nn;
                    depthSum += (Number.isFinite(r.depth) ? r.depth : 0) / nn;
                    rawSum += (r.scattered[0] + r.scattered[1] + r.scattered[2]) / (3 * nn);
                }
            const rgb = rgbSum as unknown as Vec3;
            const r = {
                transmittance: rTSum,
                depth: depthSum,
                scattered: [rawSum, rawSum, rawSum] as Vec3,
            };
            const rL = (rgb[0] + rgb[1] + rgb[2]) / 3;
            peak = Math.max(peak, rL);
            samples.push({
                gT,
                rT: r.transmittance,
                gL,
                rL,
                depth: r.depth,
                raw: (r.scattered[0] + r.scattered[1] + r.scattered[2]) / 3,
                air: airSum,
            });
        }
    for (const x of samples) {
        worstT = Math.max(worstT, Math.abs(x.gT - x.rT));
        worstL = Math.max(worstL, Math.abs(x.gL - x.rL) / Math.max(x.rL, 0.1 * peak));
    }
    const cloudy = samples.filter((x) => x.rT < 0.95).length;
    // A razão da região mais clara pela mediana das regiões de nuvem espessa (o brilho da borda contra o sol), da
    // GPU sobre a da referência.
    const thick = samples.filter((x) => x.rT < 0.2);
    const ratioOf = (key: 'gL' | 'rL'): number => {
        const v = thick.map((x) => x[key]).sort((a, b) => a - b);
        const all = samples.map((x) => x[key]);
        return v.length === 0 ? 1 : Math.max(...all) / Math.max(v[Math.floor(v.length / 2)]!, 1e-6);
    };
    const edgeRatio = ratioOf('gL') / ratioOf('rL');
    const ratios = samples.map((x) => x.gL / Math.max(x.rL, 1e-6)).sort((a, b) => a - b);
    const med = (v: number[]): string => {
        const a = [...v].sort((x, y) => x - y);
        return a.length === 0 ? '—' : a[Math.floor(a.length / 2)]!.toFixed(3);
    };
    log(
        `${label}: razão mediana com a nuvem a < 32 km ${med(samples.filter((x) => x.depth > 0 && x.depth < 32_000).map((x) => x.gL / x.rL))}, além ${med(samples.filter((x) => x.depth >= 32_000).map((x) => x.gL / x.rL))}`,
    );
    log(
        `${label}: razão GPU/referência da luz — mín ${ratios[0]!.toFixed(3)}, mediana ${ratios[Math.floor(ratios.length / 2)]!.toFixed(3)}, máx ${ratios.at(-1)!.toFixed(3)}`,
    );
    for (const x of [...samples]
        .sort((a, b) => Math.abs(b.gL / b.rL - 1) - Math.abs(a.gL / a.rL - 1))
        .slice(0, 4))
        log(
            `${label}:   GPU ${x.gL.toFixed(2)} ref ${x.rL.toFixed(2)} (sem a atmosfera ${x.raw.toFixed(2)}, ar ${x.air.toFixed(2)}), T ${x.gT.toFixed(3)}/${x.rT.toFixed(3)}, nuvem a ${(x.depth / 1000).toFixed(1)} km`,
        );
    log(
        `${label}: ${samples.length} regiões (${cloudy} com nuvem): pior transmitância ${worstT.toFixed(3)}, pior luz ${(worstL * 100).toFixed(1)} % (pico de referência ${peak.toFixed(1)} nits)`,
    );
    log(`${label}: razão borda/centro GPU sobre a referência ${edgeRatio.toFixed(3)}`);
    return { worstT, worstL, edgeRatio };
}

async function caseNoon(): Promise<void> {
    const eye: Vec3 = [0, 2, 0];
    const target: Vec3 = [1000, 700, 300];
    const fov = Math.PI / 3;
    const s = await cloudScene({
        width: 480,
        height: 270,
        sunElevation: 60,
        clouds: { coverage: 0.5, type: 0.5, wind: [0, 0] },
        eye,
        target,
        fov,
    });
    // O cache de espalhamento converge com os caminhos (`?settle=` para os diagnósticos).
    await settleFrames(s.app, Number(new URLSearchParams(location.search).get('settle') ?? 600));
    const r = await compareView(s, 'noon', eye, target, fov, 60);
    if (new URLSearchParams(location.search).get('cone') === '1')
        await compareView(s, 'noon (cone)', eye, target, fov, 60, true);
    check(
        r.worstT <= 0.05,
        `noon: transmitância a ${r.worstT.toFixed(3)} da referência (SC-001: 0,05)`,
    );
    check(
        r.worstL <= 0.05,
        `noon: luz a ${(r.worstL * 100).toFixed(1)} % da referência (SC-001: 5 %)`,
    );
    finish(s);
}

// ── scatter-cache ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * O cache de espalhamento (T023): as sondas da GPU (a média dos caminhos de cada uma, depois de convergir com a câmera
 * parada) contra a média de caminhos da referência f64 nas mesmas sondas (`scatterWalk` sobre os volumes lidos da GPU,
 * a profundidade ótica exata até o sol, o céu e o sol da atmosfera f64, o chão com a sombra das nuvens). Mede a razão
 * das somas (o viés) e a dispersão por sonda contra a esperada do ruído das duas médias.
 */
async function caseScatterCache(): Promise<void> {
    const q = new URLSearchParams(location.search);
    const eye: Vec3 = [0, 2, 0];
    const target: Vec3 = [1000, 700, 300];
    const s = await cloudScene({
        width: 480,
        height: 270,
        sunElevation: 60,
        clouds: { coverage: 0.5, type: 0.5, wind: [0, 0] },
        eye,
        target,
        fov: Math.PI / 3,
    });
    await settleFrames(s.app, Number(q.get('settle') ?? 900));
    const layer = s.layer!;
    const amb = s.app.resources.textureOf(layer, 'ambient');
    if (amb === undefined) throw new Error('scatter-cache: cache não alocado');
    const grid = await readScatterCache(s.app, layer);
    const ambient = await readTexture(s.app, amb, 'rgba16float');
    const model = await referenceModel(s, layer);
    const sun = sunToward(60);
    const lux = s.sun.data.intensity;
    const R = model.groundRadius;
    const sunAt = (x: Vec3): Vec3 => {
        const r = Math.hypot(x[0], x[1] + R, x[2]);
        const mu = (x[0] * sun[0] + (x[1] + R) * sun[1] + x[2] * sun[2]) / r;
        const t = transmittanceToTop(
            atmosphere,
            atmosphere.bottomRadius + 0.2 + (r - R) / 1000,
            mu,
        );
        return [t[0] * lux, t[1] * lux, t[2] * lux];
    };
    // O céu da GPU é a vista do céu na altitude da câmera.
    const skyCache = new Map<number, Vec3>();
    const sky = (d: Vec3): Vec3 => {
        const key =
            Math.round((d[1] + 1) * 32) * 4096
            + Math.round((Math.atan2(d[2], d[0]) + Math.PI) * 32);
        let v = skyCache.get(key);
        if (v === undefined) {
            const L = skyRadiance(atmosphere, 0.2 + eye[1] / 1000, d, sun, 48, ms);
            v = [L[0] * lux, L[1] * lux, L[2] * lux];
            skyCache.set(key, v);
        }
        return v;
    };
    const phase = jdeParams(layer.dropletDiameter);
    const trunc = phaseTruncation(phase);
    const kT = 1 - model.albedo * trunc.fc;
    const ground = s.sky.data.ground;
    const up = [0, 1, 2].map((c) => ambient.data[c]!);
    const sunDepth = (x: Vec3): number => opticalDepth(model, x, sun, 48);
    const light = {
        sunDir: sun,
        sunAt,
        sunDepth,
        sky,
        ground: (pg: Vec3): Vec3 => {
            const e = sunAt([pg[0], 0, pg[2]]);
            const t = Math.exp(-sunDepth(pg) * kT) * Math.max(sun[1], 0);
            return [0, 1, 2].map(
                (c) => (ground[c] ?? 0.3) * ((e[c]! * t) / Math.PI + up[c]!),
            ) as unknown as Vec3;
        },
    };
    const size = [grid.width, grid.height, grid.depth] as const;
    const g: ScatterGrid = { size, center: [0, 0], x0: 2000, reach: Math.asinh(32) };
    const E = s.sky.data.sunIlluminance[1] ?? lux;
    // As sondas convergidas (≥ 48 caminhos) no campo de visão, espalhadas.
    const fwd = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    const fl = Math.hypot(...fwd);
    const picks: { x: Vec3; n: number; v: number }[] = [];
    const total = size[0] * size[1] * size[2];
    for (let i = 0; i < total && picks.length < Number(q.get('probes') ?? 120); i += 397) {
        const n = grid.data[i * 4 + 3]!;
        if (n < 48) continue;
        const gi = i % size[0];
        const gj = Math.floor(i / size[0]) % size[1];
        const gk = Math.floor(i / (size[0] * size[1]));
        const x = scatterProbePosition(model, g, gi, gj, gk);
        const rel = [x[0] - eye[0], x[1] - eye[1], x[2] - eye[2]];
        const dist = Math.hypot(...rel);
        if (
            dist > 15_000
            || (rel[0] * fwd[0]! + rel[1] * fwd[1]! + rel[2] * fwd[2]!) / (dist * fl) < 0.5
        )
            continue;
        const sum = luminance([grid.data[i * 4]!, grid.data[i * 4 + 1]!, grid.data[i * 4 + 2]!]);
        picks.push({ x, n, v: (sum / n) * E });
    }
    const walks = Number(q.get('walks') ?? 1000);
    let sumG = 0;
    let sumR = 0;
    const ratios: number[] = [];
    for (const [k, p] of picks.entries()) {
        await new Promise((r) => setTimeout(r, 0));
        const rel = [p.x[0] - eye[0], p.x[1] - eye[1], p.x[2] - eye[2]];
        const l = Math.hypot(...rel);
        const dcam: Vec3 = [rel[0]! / l, rel[1]! / l, rel[2]! / l];
        let acc = 0;
        for (let w = 0; w < walks; w++) {
            const L = scatterWalk(
                model,
                p.x,
                dcam,
                light,
                phase,
                trunc,
                deltaRng(k * 100_003 + 17, w),
                48,
                256,
            );
            acc += luminance(L);
        }
        const ref = acc / walks;
        sumG += p.v;
        sumR += ref;
        ratios.push(p.v / ref);
    }
    ratios.sort((a, b) => a - b);
    const bias = sumG / Math.max(sumR, 1e-12);
    log(
        `scatter-cache: ${picks.length} sondas (≥ 48 caminhos na GPU, ${walks} na referência): razão das somas GPU/referência ${bias.toFixed(3)}; por sonda mín ${ratios[0]?.toFixed(3)} mediana ${ratios[Math.floor(ratios.length / 2)]?.toFixed(3)} máx ${ratios.at(-1)?.toFixed(3)}`,
    );
    check(picks.length >= 60, `scatter-cache: só ${picks.length} sondas convergidas`);
    check(
        Math.abs(bias - 1) <= 0.05,
        `scatter-cache: viés das sondas ${((bias - 1) * 100).toFixed(1)} % (≤ 5 %)`,
    );
    finish(s);
}

// ── timing ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Mediana dos tempos por passe das nuvens em `frames` quadros. */
async function passTimes(
    app: Application,
    frames: number,
    pattern = /Cloud|Sky/,
): Promise<{ total: number; span: number; passes: Record<string, number> }> {
    const samples: Record<string, number>[] = [];
    const spans: number[] = [];
    const off = app.events.on('gpuFrameTimed', (e) => {
        samples.push({ ...e.passesMs });
        spans.push(e.spanMs);
    });
    await busyFrames(app, frames);
    // Os quadros gravados chegam ao perfilador 1–3 quadros depois.
    await busyFrames(app, 4);
    off();
    const keys = new Set(samples.flatMap((x) => Object.keys(x)));
    const passes: Record<string, number> = {};
    for (const k of keys) if (pattern.test(k)) passes[k] = median(samples.map((x) => x[k] ?? 0));
    const total = Object.values(passes).reduce((a, b) => a + b, 0);
    return { total, span: median(spans), passes };
}

const median = (v: readonly number[]): number => {
    const a = [...v].sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)] ?? 0;
};

/**
 * Quadros com a GPU ocupada: o seguinte é gravado assim que a GPU aceita (`readyForFrame`), sem esperar o quadro da
 * tela. No ritmo de 60 Hz, um quadro de 4–5 ms deixa a GPU ociosa a maior parte do tempo e o M4 baixa o relógio dela: as
 * passagens das nuvens mediam até 1,5 × mais (o perfil baixo sozinho, ou os primeiros ~15 s de um app), e as da tela,
 * limitadas pela banda, quase não mudavam — a diferença com e sem a camada saía do estado do relógio, não do custo.
 */
async function busyFrames(app: Application, frames: number): Promise<void> {
    await app.whenReady({ timeoutMs: 60_000 });
    for (let i = 0; i < frames; i++) {
        app.step(0);
        do await new Promise((r) => setTimeout(r, 0));
        while (!app.readyForFrame());
    }
}

/**
 * O custo das nuvens pelo método do bench: um app só, aquecido com a GPU ocupada (`TIMING_WARMUP` quadros), as
 * medidas com e sem a camada intercaladas (a camada entra e sai pelo mundo) e a mediana das repetições. Devolve as
 * diferenças por repetição (ms) e os passes medianos com a camada.
 */
const TIMING_WARMUP = 600;
const TIMING_REPS = 5;
async function cloudCost(
    profile: 'high' | 'medium' | 'low',
    interior = false,
): Promise<{
    diffs: number[];
    withSpan: number[];
    passes: Record<string, number>;
    quality: unknown;
}> {
    const s = await cloudScene({
        width: 1280,
        height: 720,
        profile,
        profiling: true,
        clouds: false,
        ...(interior ? { eye: [0, 1.6, 0] as const, target: [4, 1.4, 1] as const } : {}),
        target: interior ? [4, 1.4, 1] : [1000, 400, 300],
    });
    // O interior (SC-005): uma sala fechada de 10 × 3 × 10 m (seis placas) em volta da câmera — nenhum pixel do céu.
    if (interior)
        for (const [size, at] of [
            [
                [10, 0.2, 10],
                [0, -0.1, 0],
            ],
            [
                [10, 0.2, 10],
                [0, 3.1, 0],
            ],
            [
                [0.2, 3.4, 10],
                [-5.1, 1.5, 0],
            ],
            [
                [0.2, 3.4, 10],
                [5.1, 1.5, 0],
            ],
            [
                [10.4, 3.4, 0.2],
                [0, 1.5, -5.1],
            ],
            [
                [10.4, 3.4, 0.2],
                [0, 1.5, 5.1],
            ],
        ] as const)
            s.app.world.insert(
                new BoxGeometry({ size: [...size] })
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [at[0], at[1], at[2], 1] })),
            );
    const values = { coverage: 0.5, wind: [10, 0] };
    let layer: CloudLayer | undefined;
    await settleFrames(s.app, 30);
    const insert = (): void => {
        layer = new CloudLayerClass(values);
        s.app.world.insert(layer);
    };
    insert();
    await busyFrames(s.app, TIMING_WARMUP);
    const quality = layer?.quality;
    const diffs: number[] = [];
    const withSpan: number[] = [];
    const perPass: Record<string, number>[] = [];
    for (let r = 0; r < TIMING_REPS; r++) {
        const order = r % 2 === 0 ? [true, false] : [false, true];
        const span: Record<string, number> = {};
        for (const has of order) {
            if (has && layer === undefined) insert();
            if (!has && layer !== undefined) {
                s.app.world.remove(layer);
                layer = undefined;
            }
            await busyFrames(s.app, 60);
            const t = await passTimes(s.app, 90);
            span[has ? 'with' : 'without'] = t.span;
            if (has) perPass.push(t.passes);
        }
        diffs.push(span.with! - span.without!);
        withSpan.push(span.with!);
    }
    finish(s);
    const passes: Record<string, number> = {};
    for (const k of new Set(perPass.flatMap((x) => Object.keys(x))))
        passes[k] = median(perPass.map((x) => x[k] ?? 0));
    return { diffs, withSpan, passes, quality };
}

async function caseInteriorTiming(): Promise<void> {
    // A camada numa cena sem céu visível (SC-005): a câmera numa sala fechada; o custo com − sem a camada, pelo método
    // do bench, no perfil alto.
    const c = await cloudCost('high', true);
    const d = median(c.diffs);
    log(
        `interior-timing: nuvens ${d.toFixed(3)} ms (com − sem a camada, mediana de ${c.diffs.length}; ${Math.min(...c.diffs).toFixed(3)}–${Math.max(...c.diffs).toFixed(3)}); quadro com nuvens ${median(c.withSpan).toFixed(3)} ms; por passe: ${Object.entries(
            c.passes,
        )
            .map(([k, v]) => `${k.replace(/^.*\//, '')} ${v.toFixed(3)}`)
            .join(', ')}`,
    );
    check(d <= 0.3, `interior-timing: nuvens ${d.toFixed(3)} ms > 0,3 ms (SC-005)`);
}

async function caseSkyTiming(): Promise<void> {
    // Só o céu (SC-009, T011): a cena sem a camada, com e sem o `Sky` intercalados pelo método do bench; o custo novo da
    // 041 é o da tabela aérea e da perspectiva aérea no desenho (o que fica além da vista do céu e do ambiente do céu, de
    // antes da 041, medidos por passe).
    const s = await cloudScene({
        width: 1280,
        height: 720,
        profile: 'high',
        profiling: true,
        clouds: false,
        target: [1000, 400, 300],
    });
    await settleFrames(s.app, 30);
    let sky: Sky | undefined = s.sky;
    await busyFrames(s.app, TIMING_WARMUP);
    const diffs: number[] = [];
    const perPass: Record<string, number>[] = [];
    // O desenho do fundo (o céu pela vista do céu, spec 033) com e sem o `Sky`: de antes da 041.
    const background: number[] = [];
    for (let r = 0; r < TIMING_REPS; r++) {
        const order = r % 2 === 0 ? [true, false] : [false, true];
        const span: Record<string, number> = {};
        const forward: Record<string, number> = {};
        for (const has of order) {
            if (has && sky === undefined) {
                sky = new SkyClass({ sun: s.sun });
                s.app.world.insert(sky);
            }
            if (!has && sky !== undefined) {
                s.app.world.remove(sky);
                sky = undefined;
            }
            await busyFrames(s.app, 60);
            const t = await passTimes(s.app, 90, /Cloud|Sky|^forward\/ForwardFlow\/ForwardFlow$/);
            span[has ? 'with' : 'without'] = t.span;
            forward[has ? 'with' : 'without'] = t.passes['forward/ForwardFlow/ForwardFlow'] ?? 0;
            if (has) perPass.push(t.passes);
        }
        diffs.push(span.with! - span.without!);
        background.push(forward.with! - forward.without!);
    }
    finish(s);
    const passes: Record<string, number> = {};
    for (const k of new Set(perPass.flatMap((x) => Object.keys(x))))
        passes[k] = median(perPass.map((x) => x[k] ?? 0));
    // O custo novo da 041 só com o céu: os passes dela (a tabela aérea, a máscara reativa do disco, o excesso do disco).
    // A diferença do quadro com e sem o `Sky` (`d`) é quase toda o fundo desenhado no forward — a vista do céu por pixel,
    // spec 033, de antes da 041 (o forward com − sem ≈ `d`) —, e os passes do céu se sobrepõem a ele no perfilador: a
    // conta "d − os passes de antes" punha o fundo de antes na conta da 041 (0,43 ms) e, somando o fundo, dava negativo.
    // Sem nada que tape o sol no ar o fundo da 041 é o de antes (o déficit da sombra só entra com a camada, medido no
    // `timing` das nuvens), e a perspectiva aérea por pixel só existe sobre geometria.
    const fresh = Object.entries(passes)
        .filter(([k]) => /SkyAerialFlow|SkyReactiveFlow|SkyOverflowFlow/.test(k))
        .reduce((a, [, v]) => a + v, 0);
    const d = median(diffs);
    log(
        `sky-timing: só o céu ${d.toFixed(3)} ms (com − sem o Sky, mediana de ${diffs.length}; ${Math.min(...diffs).toFixed(3)}–${Math.max(...diffs).toFixed(3)}), dos quais o fundo (forward com − sem) ${median(background).toFixed(3)}; o novo da 041 ${fresh.toFixed(3)} ms; por passe: ${Object.entries(
            passes,
        )
            .map(([k, v]) => `${k.replace(/^.*\//, '')} ${v.toFixed(3)}`)
            .join(', ')}`,
    );
    check(
        fresh <= 0.25,
        `sky-timing: o custo novo do céu ${fresh.toFixed(3)} ms > 0,25 ms (SC-009)`,
    );
}

async function caseTiming(): Promise<void> {
    const limits = { high: 3, medium: 2, low: 1.2 } as const;
    const only = new URLSearchParams(location.search).get('profiles');
    for (const profile of ['high', 'medium', 'low'] as const) {
        if (only !== null && !only.split('_').includes(profile)) continue;
        const c = await cloudCost(profile);
        const d = median(c.diffs);
        log(`timing ${profile}: qualidade ${JSON.stringify(c.quality)}`);
        log(
            `timing ${profile}: nuvens ${d.toFixed(3)} ms (com − sem a camada, mediana de ${c.diffs.length}; ${Math.min(...c.diffs).toFixed(3)}–${Math.max(...c.diffs).toFixed(3)}); quadro com nuvens ${median(c.withSpan).toFixed(3)} ms; por passe (conta sobreposição): ${Object.entries(
                c.passes,
            )
                .map(([k, v]) => `${k.replace(/^.*\//, '')} ${v.toFixed(3)}`)
                .join(', ')}`,
        );
        check(
            d <= limits[profile],
            `timing ${profile}: nuvens ${d.toFixed(3)} ms > ${limits[profile]} ms (SC-005)`,
        );
    }
}

// ── céu limpo, encoberto, máscara ────────────────────────────────────────────────────────────────────────────────────

/** A cor HDR da cena (antes da apresentação). */
async function sceneColor(s: CloudScene): Promise<Float32Array> {
    const t = s.app.resources.textureOf(s.app.defaults.targets, 'color');
    if (t === undefined) throw new Error('cor da cena não alocada');
    return (await readHdrTexture(s.app, t)).data;
}

/** A nuvem aumentada (luz e transmitância por pixel). */
async function cloudView(
    s: CloudScene,
): Promise<{ width: number; height: number; data: Float32Array }> {
    const t = s.app.resources.textureOf(s.layer!, 'view');
    if (t === undefined) throw new Error('view não alocado');
    return readTexture(s.app, t, 'rgba16float');
}

async function caseClearSky(): Promise<void> {
    // Cobertura 0 com a camada contra o céu sem a camada: a mesma imagem (FR-017, US2 cenário 1).
    const view = { width: 320, height: 180, target: [1000, 300, 200] as const };
    const a = await cloudScene({ ...view, clouds: false });
    await settleFrames(a.app, 30);
    const ca = await sceneColor(a);
    finish(a);
    const b = await cloudScene({ ...view, clouds: { coverage: 0, wind: [5, 0] } });
    await settleFrames(b.app, 30);
    const cb = await sceneColor(b);
    finish(b);
    let worst = 0;
    for (let k = 0; k < ca.length; k++)
        if (k % 4 !== 3)
            worst = Math.max(worst, Math.abs(cb[k]! - ca[k]!) / Math.max(ca[k]!, 1e-3));
    log(
        `clear-sky: cobertura 0 contra o céu sem camada — pior diferença relativa ${worst.toExponential(2)}`,
    );
    check(
        worst <= 1e-3,
        `clear-sky: céu com cobertura 0 difere ${worst.toExponential(2)} do céu sem camada`,
    );
}

async function caseOvercastStratus(): Promise<void> {
    // Cobertura 1 de estratos vista de baixo: sem buracos (US2 cenário 2).
    const s = await cloudScene({
        width: 320,
        height: 180,
        clouds: { coverage: 1, type: 0, base: 600, top: 1400, wind: [0, 0] },
        target: [1000, 900, 100],
        fov: Math.PI / 2.5,
    });
    await settleFrames(s.app, 30);
    const v = await cloudView(s);
    let worst = 0;
    for (let k = 0; k < v.width * v.height; k++) worst = Math.max(worst, v.data[k * 4 + 3]!);
    log(`overcast-stratus: maior transmitância na vista para o alto ${worst.toFixed(4)}`);
    check(
        worst < 0.05,
        `overcast-stratus: buraco no encoberto (transmitância ${worst.toFixed(3)})`,
    );
    finish(s);
}

async function caseCoverageMask(): Promise<void> {
    // Um mapa de cobertura (função WGSL do usuário) com a metade x > 0 vazia: nenhuma nuvem ali (US2 cenário 3).
    const code = /* wgsl */ `fn coverage_fn(xz: vec2f, time: f32, data: CoverageFnParams) -> vec3f {
    return vec3f(select(0.9, 0.0, xz.x > 0.0), 0.5, 1.0);
}`;
    for (const [label, target, want] of [
        ['vazia', [2000, 900, 0], 'none'],
        ['cheia', [-2000, 900, 0], 'some'],
    ] as const) {
        const s = await cloudScene({
            width: 256,
            height: 144,
            clouds: { coverage: { code }, wind: [0, 0] },
            target,
            fov: Math.PI / 6,
        });
        await settleFrames(s.app, 30);
        const v = await cloudView(s);
        let minT = 1;
        for (let k = 0; k < v.width * v.height; k++) minT = Math.min(minT, v.data[k * 4 + 3]!);
        log(`coverage-mask: região ${label}: menor transmitância ${minT.toFixed(4)}`);
        if (want === 'none')
            check(
                minT > 0.999,
                `coverage-mask: nuvem na região vazia (transmitância ${minT.toFixed(4)})`,
            );
        else
            check(
                minT < 0.2,
                `coverage-mask: sem nuvem na região cheia (transmitância ${minT.toFixed(4)})`,
            );
        finish(s);
    }
}

// ── vento ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Deslocamento (pixels, 2D) que minimiza a soma das diferenças absolutas entre duas imagens de transmitância. */
function shift2d(a: Float32Array, b: Float32Array, w: number, h: number, range: number): number {
    let best = 0;
    let bestScore = -Infinity;
    for (let dy = -range; dy <= range; dy++)
        for (let dx = -range; dx <= range; dx++) {
            let score = 0;
            for (let y = range; y < h - range; y += 2)
                for (let x = range; x < w - range; x += 2)
                    score -= Math.abs(
                        a[(y * w + x) * 4 + 3]! - b[((y + dy) * w + x + dx) * 4 + 3]!,
                    );
            if (score > bestScore) {
                bestScore = score;
                best = Math.hypot(dx, dy);
            }
        }
    return best;
}

async function caseWind(): Promise<void> {
    // Vento de 10 m/s para +x por 10 s: as nuvens andam 100 m (US2 cenário 4), medido pela correlação da
    // transmitância na vista de cima (pixel ≈ 10 m na camada).
    const altitude = 20_000;
    const fov = 2 * Math.atan(1600 / (altitude - 2750));
    const s = await cloudScene({
        width: 320,
        height: 320,
        clouds: { coverage: 0.5, wind: [10, 0] },
        eye: [0, altitude, 0],
        target: [0, 0, 1],
        fov,
    });
    await settleFrames(s.app, 30);
    const a = await cloudView(s);
    // O tempo simulado de cada leitura, pelo uniforme da camada (o laço de quadros também anda nas esperas).
    const t0 = s.layer!.data.params[0]!.coverageMap![3]!;
    for (let k = 0; k < 600; k++) s.app.step(1 / 60);
    await settleFrames(s.app, 12);
    const b = await cloudView(s);
    const t1 = s.layer!.data.params[0]!.coverageMap![3]!;
    const px = (2 * (altitude - 2750) * Math.tan(fov / 2)) / 320;
    const d = shift2d(a.data, b.data, 320, 320, 24);
    // Na tela, +x do mundo pode ir para a esquerda: o módulo do deslocamento.
    const meters = Math.abs(d) * px;
    const want = 10 * (t1 - t0);
    log(
        `wind: deslocamento ${meters.toFixed(1)} m em ${(t1 - t0).toFixed(2)} s simulados (${Math.abs(d)} px de ${px.toFixed(2)} m; esperado ${want.toFixed(1)} m)`,
    );
    check(
        Math.abs(meters - want) <= 2 * px,
        `wind: ${meters.toFixed(1)} m (esperado ${want.toFixed(1)} ± ${(2 * px).toFixed(0)} m)`,
    );
    finish(s);
}

async function caseWindWrap(): Promise<void> {
    // A volta do período do volume (vento × tempo cruza 12 km): sem salto entre quadros (FR-007).
    const s = await cloudScene({
        width: 256,
        height: 144,
        clouds: { coverage: 0.5, wind: [600, 0] },
    });
    await settleFrames(s.app, 20);
    s.app.step(19.9);
    await settleFrames(s.app, 6);
    const diffs: number[] = [];
    let prev = await cloudView(s);
    for (let k = 0; k < 12; k++) {
        s.app.step(1 / 60);
        await settleFrames(s.app, 1);
        const cur = await cloudView(s);
        let d = 0;
        for (let i = 0; i < cur.data.length; i += 4)
            d += Math.abs(cur.data[i + 3]! - prev.data[i + 3]!);
        diffs.push(d / (cur.data.length / 4));
        prev = cur;
    }
    const sorted = [...diffs].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const max = sorted.at(-1)!;
    log(
        `wind-wrap: diferença média por quadro na volta do período — mediana ${median.toFixed(4)}, máxima ${max.toFixed(4)}`,
    );
    check(
        max <= 3 * median + 0.01,
        `wind-wrap: salto na volta do período (${max.toFixed(4)} contra mediana ${median.toFixed(4)})`,
    );
    finish(s);
}

// ── forma do usuário ─────────────────────────────────────────────────────────────────────────────────────────────────

async function caseUserGraph(): Promise<void> {
    // Um grafo de forma do usuário (Worley periódico de 8 células nos quatro canais): o volume segue o grafo (US2
    // cenário 5).
    const graph = new NodeGraph({
        nodes: {
            p: graphArgument('p'),
            c: nodes.noise.cellular3.with({ scale: 8, period: 8, jitter: 1 }),
            out: nodes.math.combine4,
        },
        links: [
            ['p.value', 'c.p'],
            ['c.f1', 'out.x'],
            ['c.f1', 'out.y'],
            ['c.f2', 'out.z'],
            ['c.cell', 'out.w'],
        ],
        output: 'out.value',
    });
    const s = await cloudScene({ width: 128, height: 72, clouds: { shape: { graph } } });
    await settleFrames(s.app, 12);
    const v = await readCloudVolume(s.app, s.layer!, 'shape');
    let worst = 0;
    const n = v.size;
    for (let k = 0; k < 300; k++) {
        const x = (k * 37) % n;
        const y = (k * 61 + 7) % n;
        const z = (k * 89 + 13) % n;
        const ref = noiseCellular3(
            [(x + 0.5) / n, (y + 0.5) / n, (z + 0.5) / n],
            8,
            [0, 0, 0],
            0,
            1,
            8,
        );
        const o = ((z * n + y) * n + x) * 4;
        const want = [ref.f1, ref.f1, ref.f2, ref.cell];
        for (let c = 0; c < 4; c++)
            worst = Math.max(worst, Math.abs(v.data[o + c]! - quantize(want[c]!)));
    }
    log(
        `user-graph: volume do grafo do usuário contra a referência — pior ${(worst * 255).toFixed(2)}/255`,
    );
    check(worst <= 2 / 255 + 1e-6, `user-graph: texel difere ${(worst * 255).toFixed(2)}/255`);
    finish(s);
}

// ── vistas contra a referência ───────────────────────────────────────────────────────────────────────────────────────

async function viewCase(
    label: string,
    sunElevation: number,
    sunAzimuth: number,
    clouds: Parameters<typeof cloudScene>[0] extends infer O
        ? O extends { clouds?: infer C }
            ? C
            : never
        : never,
    eye: Vec3,
    target: Vec3,
    frames = 48,
): Promise<{ worstT: number; worstL: number; edgeRatio: number; s: CloudScene }> {
    const fov = Math.PI / 3;
    const s = await cloudScene({
        width: 480,
        height: 270,
        sunElevation,
        sunAzimuth,
        clouds,
        eye,
        target,
        fov,
    });
    // O cache de espalhamento converge com os caminhos (um por sonda a cada 8 quadros, janela de 64).
    await settleFrames(s.app, Number(new URLSearchParams(location.search).get('settle') ?? 600));
    const r = await compareView(
        s,
        label,
        eye,
        target,
        fov,
        sunElevation,
        false,
        sunAzimuth,
        frames,
    );
    if (new URLSearchParams(location.search).get('cone') === '1')
        await compareView(s, `${label} (cone)`, eye, target, fov, sunElevation, true, sunAzimuth);
    return { ...r, s };
}

async function caseSunset(): Promise<void> {
    const q = new URLSearchParams(location.search);
    const r = await viewCase(
        'sunset',
        Number(q.get('el') ?? 4),
        Number(q.get('az') ?? 0),
        { coverage: 0.5, wind: [0, 0] },
        [0, 2, 0],
        [1000, 350, 200],
    );
    check(r.worstT <= 0.05, `sunset: transmitância a ${r.worstT.toFixed(3)} da referência`);
    check(r.worstL <= 0.05, `sunset: luz a ${(r.worstL * 100).toFixed(1)} % da referência`);
    finish(r.s);
}

async function caseTypes(): Promise<void> {
    for (const type of [0, 0.25, 1]) {
        const r = await viewCase(
            `types ${type}`,
            50,
            0,
            { coverage: 0.6, type, wind: [0, 0] },
            [0, 2, 0],
            [1000, 600, 300],
        );
        check(
            r.worstT <= 0.05,
            `types ${type}: transmitância a ${r.worstT.toFixed(3)} da referência`,
        );
        finish(r.s);
    }
}

async function caseFarCloud(): Promise<void> {
    // Nuvens a dezenas de km, rente ao horizonte: a perspectiva aérea até a nuvem (US1 cenário 4).
    const r = await viewCase(
        'far-cloud',
        30,
        90,
        { coverage: 0.5, wind: [0, 0] },
        [0, 2, 0],
        [1000, 40, 0],
    );
    check(r.worstL <= 0.05, `far-cloud: luz a ${(r.worstL * 100).toFixed(1)} % da referência`);
    finish(r.s);
}

async function caseBacklit(): Promise<void> {
    // Contra o sol (a 12°, à frente da câmera): a borda brilha mais que o centro (SC-002: a razão a ±10 % da
    // referência). A razão é a da região mais clara pela mediana das regiões com nuvem espessa.
    const r = await viewCase(
        'backlit',
        12,
        0,
        { coverage: 0.5, wind: [0, 0] },
        [0, 2, 0],
        [1000, 250, 0],
    );
    check(
        Math.abs(r.edgeRatio - 1) <= 0.1,
        `backlit: razão borda/centro a ${((r.edgeRatio - 1) * 100).toFixed(1)} % da referência (SC-002: 10 %)`,
    );
    finish(r.s);
}

async function caseFlyThrough(): Promise<void> {
    // Do chão até acima da camada: sem salto entre quadros (US1 cenário 3).
    const s = await cloudScene({
        width: 256,
        height: 144,
        clouds: { coverage: 0.6, base: 1500, top: 3500, wind: [6, 0] },
    });
    await settleFrames(s.app, 30);
    const means: number[] = [];
    const frames = 240;
    for (let k = 0; k <= frames; k++) {
        const t = k / frames;
        const y = 2 + 5500 * t * t;
        s.camera.data.position = [400 * t, y, 0, 1];
        s.camera.data.rotation = Transform.lookRotation(
            [400 * t, y, 0],
            [400 * t + 1000, y + 300 - 600 * t, 100],
        );
        await settleFrames(s.app, 1);
        if (k % 2 === 0) {
            const c = await sceneColor(s);
            let m = 0;
            for (let i = 0; i < c.length; i += 4) m += (c[i]! + c[i + 1]! + c[i + 2]!) / 3;
            means.push(m / (c.length / 4));
        }
    }
    const steps = means
        .slice(1)
        .map((m, k) => Math.abs(Math.log(Math.max(m, 1e-6) / Math.max(means[k]!, 1e-6))));
    const sorted = [...steps].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)]!;
    const max = sorted.at(-1)!;
    log(
        `fly-through: variação do brilho médio entre amostras — mediana ${(med * 100).toFixed(1)} %, máxima ${(max * 100).toFixed(1)} %`,
    );
    check(
        max <= Math.max(0.35, 4 * med),
        `fly-through: salto de ${(max * 100).toFixed(1)} % no brilho (mediana ${(med * 100).toFixed(1)} %)`,
    );
    finish(s);
}

// ── sombra e panorama ────────────────────────────────────────────────────────────────────────────────────────────────

async function caseShadowMap(): Promise<void> {
    // O mapa visto do sol lido como a GPU o lê, em pontos do chão, contra a transmitância exata da referência até o
    // sol (SC-004: a luz direta sob a nuvem a ≤ 5 % — absoluto em T, que é o fator da luz direta).
    const s = await cloudScene({
        width: 256,
        height: 144,
        sunElevation: Number(new URLSearchParams(location.search).get('el') ?? 55),
        clouds: { coverage: 0.5, wind: [0, 0] },
    });
    await settleFrames(s.app, 30);
    const layer = s.layer!;
    const map = await readShadowMap(s.app, layer);
    const model = await referenceModel(s, layer);
    const p = layer.data.params[0]!;
    const sun = p.sunDir! as unknown as Vec3;
    let worst = 0;
    let shaded = 0;
    let meanShade = 0;
    for (let k = 0; k < 200; k++) {
        const x = (((k * 0.618034) % 1) - 0.5) * 12_000;
        const z = (((k * 0.754878) % 1) - 0.5) * 12_000;
        const q: Vec3 = [x, 0, z];
        const exact = Math.exp(-opticalDepth(model, q, [sun[0], sun[1], sun[2]], 512));
        // O receptor no chão está abaixo da casca: o τ é o último nó.
        const gpu = groundMapT(map, p, q);
        if (exact < 0.9) {
            shaded++;
            meanShade += Math.abs(gpu - exact);
        }
        worst = Math.max(worst, Math.abs(gpu - exact));
    }
    meanShade /= Math.max(shaded, 1);
    log(
        `shadow-map: 200 pontos do chão (${shaded} sob nuvem) — diferença média sob a nuvem ${meanShade.toFixed(3)}, pior ponto ${worst.toFixed(3)} (texel perto da câmera ${p.sunMap![0]!.toFixed(0)} m)`,
    );
    check(
        meanShade <= 0.05,
        `shadow-map: transmitância média sob a nuvem a ${meanShade.toFixed(3)} da referência (SC-004)`,
    );
    finish(s);
    void shellSegments;
}

/** A transmitância do mapa visto do sol no ponto do chão `q`, lida como a GPU a lê (o último nó, bilinear, os níveis). */
function groundMapT(map: ShadowAtlas, p: CloudLayer['data']['params'][number], q: Vec3): number {
    const f = shadowFrameOf(p);
    return Math.exp(-shadowKnotAt(map, f, q, 16));
}

/**
 * τ das nuvens até o sol num ponto `q` como a GPU o lê do mapa (`cloud_shadow_column` e os nós, bilinear): a coluna pelo
 * ponto do plano do mapa de `q`, com a origem na saída do topo da casca do lado do sol (`cloud_sun_entry`).
 */
function mapDepthAt(
    map: ShadowAtlas,
    p: CloudLayer['data']['params'][number],
    model: CloudModel,
    q: Vec3,
): number {
    const f = shadowFrameOf(p);
    const sun = shadowColumnSun(map, f, q);
    const rel = [q[0] - f.pivot[0], q[1] - f.pivot[1], q[2] - f.pivot[2]];
    const sigma = rel[0]! * sun[0] + rel[1]! * sun[1] + rel[2]! * sun[2];
    const q0: Vec3 = [q[0] - sun[0] * sigma, q[1] - sun[1] * sigma, q[2] - sun[2] * sigma];
    const span = sphereSpan(model, q0, sun, model.groundRadius + model.top);
    const entry = span === undefined ? 0 : Math.max(span[1], 0) + 1;
    const o: Vec3 = [q0[0] + sun[0] * entry, q0[1] + sun[1] * entry, q0[2] + sun[2] * entry];
    const segs = shellSegments(model, o, [-sun[0], -sun[1], -sun[2]], Infinity);
    if (segs.length === 0) return 0;
    const [a, b] = segs[0]!;
    const s = Math.min(1, Math.max(0, (entry - sigma - a) / (b - a))) * 16;
    const k = Math.min(Math.floor(s), 15);
    const lo = shadowKnotAt(map, f, q, k);
    return lo + (shadowKnotAt(map, f, q, k + 1) - lo) * (s - k);
}

async function caseSunLow(): Promise<void> {
    // O sol baixo descendo devagar (o `solposto`, de 6° a 3° a 0,02° por passo): a luz direta no chão pelo mapa, quadro a
    // quadro, contra a integral da referência. As amostras do mapa em frações do trecho escorregavam pela nuvem quando
    // o comprimento do trecho mudava com o sol (um passo inteiro a cada ~0,06°), e τ oscilava nesse período — no vídeo
    // acelerado, o chão piscava quadro a quadro. Medida: a variação total da série perto da da referência e a diferença
    // média.
    const az = (Math.atan2(0.6, 0.8) * 180) / Math.PI;
    const s = await cloudScene({
        width: 256,
        height: 144,
        sunElevation: 6,
        sunAzimuth: az,
        clouds: { coverage: 0.4, type: 0.5, wind: [0, 0] },
    });
    await settleFrames(s.app, 20);
    const layer = s.layer!;
    const model = await referenceModel(s, layer);
    const gpu: number[] = [];
    const ref: number[] = [];
    for (let k = 0; k <= 150; k++) {
        const el = 6 - k * 0.02;
        s.sun.data.direction = sunTravel(el, az);
        await settleFrames(s.app, 1);
        const map = await readShadowMap(s.app, layer);
        gpu.push(groundMapT(map, layer.data.params[0]!, [8, 0, 6]));
        ref.push(Math.exp(-opticalDepth(model, [8, 0, 6], sunToward(el, az), 1024)));
    }
    const variation = (v: number[]): number =>
        v.slice(1).reduce((a, x, i) => a + Math.abs(x - v[i]!), 0);
    const turns = (v: number[]): number =>
        v
            .slice(2)
            .filter(
                (x, i) =>
                    (x - v[i + 1]!) * (v[i + 1]! - v[i]!) < 0 && Math.abs(x - v[i + 1]!) > 0.02,
            ).length;
    const mean = gpu.reduce((a, g, i) => a + Math.abs(g - ref[i]!), 0) / gpu.length;
    log(
        `sun-low: T do chão de 6° a 3° (a cada 0,02°) — variação total GPU ${variation(gpu).toFixed(3)}, ref ${variation(ref).toFixed(3)}; voltas GPU ${turns(gpu)}, ref ${turns(ref)}; diferença média ${mean.toFixed(3)}`,
    );
    check(
        variation(gpu) <= 1.25 * variation(ref) + 0.05,
        `sun-low: variação total da luz no chão ${variation(gpu).toFixed(3)} contra ${variation(ref).toFixed(3)} da referência (oscila)`,
    );
    check(
        turns(gpu) <= turns(ref) + 2,
        `sun-low: ${turns(gpu)} voltas na luz do chão contra ${turns(ref)} da referência`,
    );
    check(
        mean <= 0.05,
        `sun-low: a luz direta no chão a ${mean.toFixed(3)} da referência na média`,
    );
    finish(s);
}

async function caseSunBelow(): Promise<void> {
    // O sol abaixo do horizonte (−0,3° e −0,8°): as nuvens altas ainda o veem por cima do chão. O mapa visto do sol ficava
    // vazio com o sol abaixo do horizonte (τ = 0: as nuvens e o chão que as vê acendiam num quadro, no `solposto` a
    // −0,03°). τ de pontos na camada pelo mapa contra a integral da referência.
    const az = (Math.atan2(0.6, 0.8) * 180) / Math.PI;
    const s = await cloudScene({
        width: 256,
        height: 144,
        sunElevation: 1,
        sunAzimuth: az,
        clouds: { coverage: 0.4, type: 0.5, wind: [0, 0] },
    });
    await settleFrames(s.app, 20);
    const layer = s.layer!;
    const model = await referenceModel(s, layer);
    for (const el of [-0.3, -0.8]) {
        s.sun.data.direction = sunTravel(el, az);
        await settleFrames(s.app, 2);
        const map = await readShadowMap(s.app, layer);
        const p = layer.data.params[0]!;
        let diff = 0;
        let empty = 0;
        let n = 0;
        for (let k = 0; k < 60; k++) {
            const x = (((k * 0.618034) % 1) - 0.5) * 8000;
            const z = (((k * 0.754878) % 1) - 0.5) * 8000;
            const y = model.base + (((k * 0.414214) % 1) * 0.9 + 0.05) * (model.top - model.base);
            const q: Vec3 = [x, y, z];
            const exact = Math.exp(-opticalDepth(model, q, sunToward(el, az), 4096));
            const gpu = Math.exp(-mapDepthAt(map, p, model, q));
            diff += Math.abs(gpu - exact);
            if (gpu > 0.99 && exact < 0.5) empty++;
            n++;
        }
        diff /= n;
        log(
            `sun-below: sol a ${el}° — T na camada pelo mapa a ${diff.toFixed(3)} da referência na média; ${empty} de ${n} pontos sem a sombra que a referência tem`,
        );
        check(
            diff <= 0.05,
            `sun-below: sol a ${el}°, T na camada a ${diff.toFixed(3)} da referência`,
        );
    }
    finish(s);
}

async function caseSunSweep(): Promise<void> {
    // O pôr do sol do `pordosol` (claflow-web): o sol descendo de 12° a 1° no azimute (0,8; 0,6) e a luz direta no chão
    // da câmera — a transmitância das nuvens até o sol pelo mapa, quadro a quadro, contra a integral da referência. Os
    // degraus da luz no chão são as nuvens passando na frente do sol (o sol desce 11° em 8 s): a curva da GPU segue a da
    // referência, sem salto próprio.
    const az = (Math.atan2(0.6, 0.8) * 180) / Math.PI;
    const s = await cloudScene({
        width: 256,
        height: 144,
        sunElevation: 12,
        sunAzimuth: az,
        clouds: { coverage: 0.45, type: 0.55, wind: [0, 0] },
    });
    await settleFrames(s.app, 20);
    const layer = s.layer!;
    const model = await referenceModel(s, layer);
    const gpu: number[] = [];
    const ref: number[] = [];
    let worst = 0;
    for (let k = 0; k <= 110; k++) {
        const el = 12 - k * 0.1;
        s.sun.data.direction = sunTravel(el, az);
        await settleFrames(s.app, 2);
        const map = await readShadowMap(s.app, layer);
        const g = groundMapT(map, layer.data.params[0]!, [0, 0, 0]);
        const r = Math.exp(-opticalDepth(model, [0, 0, 0], sunToward(el, az), 512));
        gpu.push(g);
        ref.push(r);
        worst = Math.max(worst, Math.abs(g - r));
    }
    const jump = (v: number[]): number =>
        Math.max(...v.slice(1).map((x, i) => Math.abs(x - v[i]!)));
    log(
        `sun-sweep: T do chão de 12° a 1° (a cada 1°) GPU ${gpu
            .filter((_, i) => i % 10 === 0)
            .map((x) => x.toFixed(2))
            .join(' ')} | ref ${ref
            .filter((_, i) => i % 10 === 0)
            .map((x) => x.toFixed(2))
            .join(
                ' ',
            )}; pior diferença ${worst.toFixed(3)}; maior degrau por 0,1° GPU ${jump(gpu).toFixed(3)}, ref ${jump(ref).toFixed(3)}`,
    );
    const lit = (v: number[]): string =>
        v
            .map((x, i) => [x, i] as const)
            .filter(([x], i) => x > 0.02 || (ref[i] ?? 0) > 0.02)
            .map(([x, i]) => `${(12 - i * 0.1).toFixed(1)}°:${x.toFixed(2)}`)
            .join(' ');
    log(`sun-sweep: onde o sol passa — GPU ${lit(gpu)}`);
    log(`sun-sweep: onde o sol passa — ref ${lit(ref)}`);
    // Na passagem rápida (o sol desce 0,1° em 4 quadros do vídeo), um fiapo fino na frente do sol muda T de um passo para
    // o outro: a medida é a média da diferença na varredura e a luz somada.
    const mean = gpu.reduce((a, g, i) => a + Math.abs(g - ref[i]!), 0) / gpu.length;
    // A luz direta somada na varredura (a energia que chega ao chão enquanto o sol desce).
    const sum = (v: number[]): number => v.reduce((a, x) => a + x, 0);
    log(
        `sun-sweep: diferença média ${mean.toFixed(3)}; luz direta somada GPU ${sum(gpu).toFixed(2)}, ref ${sum(ref).toFixed(2)}`,
    );
    check(
        mean <= 0.05,
        `sun-sweep: a luz direta no chão a ${mean.toFixed(3)} da referência na média`,
    );
    check(
        Math.abs(sum(gpu) / Math.max(sum(ref), 1e-6) - 1) <= 0.1,
        `sun-sweep: luz direta somada ${sum(gpu).toFixed(2)} contra ${sum(ref).toFixed(2)} da referência`,
    );
    finish(s);
}

async function casePanorama(): Promise<void> {
    // O panorama (o céu coberto dos raios que escapam) contra a marcha de referência na direção do texel: a
    // transmitância por direção acima do horizonte.
    const s = await cloudScene({
        width: 256,
        height: 144,
        clouds: { coverage: 0.5, wind: [0, 0] },
    });
    await settleFrames(s.app, 30);
    const layer = s.layer!;
    const t = s.app.resources.textureOf(layer, 'panorama');
    if (t === undefined) throw new Error('panorama não alocado');
    const pano = await readTexture(s.app, t, 'rgba16float');
    const model = await referenceModel(s, layer);
    const light = {
        sunDir: sunToward(60),
        sun: [1, 1, 1] as Vec3,
        ambientUp: [0, 0, 0] as Vec3,
        ambientDown: [0, 0, 0] as Vec3,
    };
    const phase = jdeParams(layer.dropletDiameter);
    const octaves = { count: 3, ...CLOUD_OCTAVES };
    let worst = 0;
    let sum = 0;
    let n = 0;
    for (let y = 4; y < pano.height / 2 - 2; y += 4)
        for (let x = 0; x < pano.width; x += 16) {
            const theta = ((y + 0.5) / pano.height) * Math.PI;
            const phi = ((x + 0.5) / pano.width) * 2 * Math.PI;
            const d: Vec3 = [
                Math.sin(theta) * Math.cos(phi),
                Math.cos(theta),
                Math.sin(theta) * Math.sin(phi),
            ];
            const r = marchCloud(model, [0, 2, 0], d, Infinity, light, phase, octaves, 256, 16);
            const err = Math.abs(pano.data[(y * pano.width + x) * 4 + 3]! - r.transmittance);
            worst = Math.max(worst, err);
            sum += err;
            n++;
        }
    log(
        `panorama: ${n} direções — erro médio da transmitância ${(sum / n).toFixed(3)}, pior ${worst.toFixed(3)}`,
    );
    check(sum / n <= 0.05, `panorama: erro médio de transmitância ${(sum / n).toFixed(3)}`);
    finish(s);
}

// ── mapa de cobertura, ambiente encoberto, névoa na frente, reflexo ──────────────────────────────────────────────────

async function caseCoverageMap(): Promise<void> {
    // O mapa de cobertura da GPU (o campo da cobertura global) contra a referência nos centros de texel (T025).
    const s = await cloudScene({
        width: 128,
        height: 72,
        clouds: { coverage: 0.5, type: 0.4, wind: [0, 0] },
    });
    await settleFrames(s.app, 12);
    const t = s.app.resources.textureOf(s.layer!, 'coverage');
    if (t === undefined) throw new Error('mapa de cobertura não alocado');
    const map = await readTexture(s.app, t, 'rgba8unorm');
    const extent = s.layer!.quality.coverageExtent;
    let worst = 0;
    for (let k = 0; k < 400; k++) {
        const i = (k * 97) % map.width;
        const j = (k * 53 + 11) % map.height;
        const x = ((i + 0.5) / map.width - 0.5) * extent;
        const z = ((j + 0.5) / map.height - 0.5) * extent;
        const ref = coverageField(x, z, 0.5, 0.4);
        const o = (j * map.width + i) * 4;
        worst = Math.max(worst, Math.abs(map.data[o]! - quantize(ref)));
        // O canal G: o campo do tipo em volta do tipo pedido.
        worst = Math.max(worst, Math.abs(map.data[o + 1]! - quantize(typeField(x, z, 0.4))));
    }
    log(
        `coverage-map: 400 texels (cobertura e tipo) contra os campos da referência — pior ${(worst * 255).toFixed(2)}/255`,
    );
    check(worst <= 2 / 255 + 1e-6, `coverage-map: texel difere ${(worst * 255).toFixed(2)}/255`);
    finish(s);
}

async function caseOvercastAmbient(): Promise<void> {
    // Céu encoberto contra limpo (US3 cenário 2): a luz ambiente do céu (a média no hemisfério de cima do céu tapado
    // pelo panorama, o que as sondas e a refração leem) cai na proporção da referência e o sol direto quase some.
    const s = await cloudScene({
        width: 128,
        height: 72,
        clouds: { coverage: 1, type: 0, base: 800, top: 1600, wind: [0, 0] },
    });
    await settleFrames(s.app, 30);
    const layer = s.layer!;
    const t = s.app.resources.textureOf(layer, 'panorama');
    if (t === undefined) throw new Error('alvos das nuvens não alocados');
    const pano = await readTexture(s.app, t, 'rgba16float');
    const shadow = await readShadowMap(s.app, layer);
    const model = await referenceModel(s, layer);
    // A luz múltipla da referência é a do panorama da GPU: o cache de espalhamento lido da GPU (a mesma representação;
    // as sondas contra os caminhos f64 no `scatter-cache`) sobre a estimativa das oitavas, como nos casos de vista. Só
    // com as oitavas a referência ficava 18,9 % abaixo do cache convergido (as oitavas erram até 50 % do transporte, R8):
    // a diferença medida era a do modelo, não a do panorama.
    const scatter = await scatterLookupOf(s, layer, model);
    const sun = sunToward(60);
    const lux = s.sun.data.intensity;
    const amb = s.app.resources.textureOf(layer, 'ambient');
    const ambient = await readTexture(s.app, amb!, 'rgba16float');
    const light = {
        sunDir: sun,
        sun: sunTransmittance(atmosphere, 1.4, sun).map((v) => v * lux) as unknown as Vec3,
        ambientUp: [ambient.data[0]!, ambient.data[1]!, ambient.data[2]!] as Vec3,
        ambientDown: [ambient.data[4]!, ambient.data[5]!, ambient.data[6]!] as Vec3,
        ...(scatter === undefined ? {} : { scatter }),
    };
    let clear = 0;
    let gpu = 0;
    let ref = 0;
    for (let y = 2; y < pano.height / 2; y += 4)
        for (let x = 0; x < pano.width; x += 16) {
            const theta = ((y + 0.5) / pano.height) * Math.PI;
            const phi = ((x + 0.5) / pano.width) * 2 * Math.PI;
            const d: Vec3 = [
                Math.sin(theta) * Math.cos(phi),
                Math.cos(theta),
                Math.sin(theta) * Math.sin(phi),
            ];
            const w = Math.sin(theta) * Math.cos(theta);
            const sky = skyRadiance(atmosphere, 0.2, d, sun, 32, ms).map((v) => v * lux);
            const lsky = (sky[0]! + sky[1]! + sky[2]!) / 3;
            const o = (y * pano.width + x) * 4;
            const g =
                lsky * pano.data[o + 3]!
                + (pano.data[o]! + pano.data[o + 1]! + pano.data[o + 2]!) / 3;
            const r = marchCloud(
                model,
                [0, 2, 0],
                d,
                Infinity,
                light,
                jdeParams(20),
                { count: 3, ...CLOUD_OCTAVES },
                128,
                24,
            );
            const rl =
                lsky * r.transmittance + (r.scattered[0] + r.scattered[1] + r.scattered[2]) / 3;
            clear += w * lsky;
            gpu += w * g;
            ref += w * rl;
        }
    // O sol direto no chão: a transmitância do mapa (o último nó) no chão da câmera.
    const sunT = groundMapT(shadow, layer.data.params[0]!, [0, 0, 0]);
    log(
        `overcast-ambient: luz do céu encoberto/limpo — GPU ${(gpu / clear).toFixed(3)}, referência ${(ref / clear).toFixed(3)}; sol direto no chão × ${sunT.toExponential(2)}`,
    );
    check(
        Math.abs(gpu / ref - 1) <= 0.1,
        `overcast-ambient: luz ambiente a ${((gpu / ref - 1) * 100).toFixed(1)} % da referência`,
    );
    check(
        sunT < 0.05,
        `overcast-ambient: o sol direto passa ${(sunT * 100).toFixed(1)} % pelo encoberto`,
    );
    finish(s);
}

async function caseFogInFront(): Promise<void> {
    // Névoa perto da câmera (uma esfera em volta dela: o mesmo trecho em toda direção) e nuvens longe (US3 cenário 4):
    // com a névoa na frente, cada pixel é `a + b·(o mesmo pixel
    // sem névoa)` — a mesma fração e a mesma luz da névoa sobre a nuvem e sobre o céu (sem halo nem borda dupla).
    const view = {
        width: 320,
        height: 180,
        clouds: { coverage: 0.5, wind: [0, 0] as [number, number] },
        target: [1000, 450, 200] as const,
    };
    const a = await cloudScene(view);
    await settleFrames(a.app, 60);
    const ca = await sceneColor(a);
    finish(a);
    const b = await cloudScene(view);
    b.app.world.insert(new FogVolume({ shape: { sphere: 30 }, center: [0, 2, 0], density: 0.004 }));
    await settleFrames(b.app, 60);
    const cb = await sceneColor(b);
    finish(b);
    // Médias de blocos de 8 × 8 px no verde (a escala de um halo; tira o ruído do deslocamento da amostra do AA), e o
    // ajuste linear por mínimos quadrados.
    const block = (img: Float32Array): number[] => {
        const out: number[] = [];
        for (let by = 0; by + 8 <= 180; by += 8)
            for (let bx = 0; bx + 8 <= 320; bx += 8) {
                let m = 0;
                for (let y = by; y < by + 8; y++)
                    for (let x = bx; x < bx + 8; x++) m += img[(y * 320 + x) * 4 + 1]!;
                out.push(m / 64);
            }
        return out;
    };
    const xa = block(ca);
    const xb = block(cb);
    const n = xa.length;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let k = 0; k < n; k++) {
        sx += xa[k]!;
        sy += xb[k]!;
        sxx += xa[k]! * xa[k]!;
        sxy += xa[k]! * xb[k]!;
    }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const icpt = (sy - slope * sx) / n;
    let worst = 0;
    const mean = sy / n;
    for (let k = 0; k < n; k++)
        worst = Math.max(worst, Math.abs(xb[k]! - (icpt + slope * xa[k]!)) / mean);
    log(
        `fog-in-front: com névoa = ${icpt.toFixed(3)} + ${slope.toFixed(4)} × sem névoa; pior resíduo por bloco de 8 × 8 px ${(worst * 100).toFixed(2)} % da média`,
    );
    check(slope < 0.999, 'fog-in-front: a névoa não atenuou as nuvens');
    check(
        worst <= 0.03,
        `fog-in-front: resíduo de ${(worst * 100).toFixed(1)} % (halo ou borda dupla)`,
    );
}

async function caseWaterReflection(): Promise<void> {
    // O reflexo numa placa de vidro lisa (o raio da refração que sai para o céu, como o reflexo na água) mostra as
    // nuvens (US3 cenário 3): a imagem refletida muda com a camada e tem o céu tapado onde há nuvem.
    const shot = async (clouds: boolean): Promise<Float32Array> => {
        const s = await cloudScene({
            width: 256,
            height: 144,
            clouds: clouds ? { coverage: 0.6, wind: [0, 0] } : false,
            eye: [0, 3, 0],
            target: [10, -1.2, 0],
            fov: Math.PI / 4,
        });
        s.app.world.insert(
            new BoxGeometry({ size: [40, 0.2, 40] })
                .add(new StandardMaterial())
                .add(new Transform({ position: [20, -0.1, 0, 1] }))
                .add(
                    materialGraph(
                        {
                            r: nodes.bsdf.dielectric.with({ ior: 1.333, roughness: 0 }),
                            t: nodes.bsdf.transmission.with({
                                ior: 1.333,
                                color: [0.05, 0.1, 0.1],
                                depth: 1,
                            }),
                            c: nodes.closure.add,
                        },
                        [
                            ['r.value', 'c.a'],
                            ['t.value', 'c.b'],
                        ],
                        'c.value',
                    ),
                ),
        );
        await settleFrames(s.app, 90);
        const c = await sceneColor(s);
        finish(s);
        return c;
    };
    const clear = await shot(false);
    const cloudy = await shot(true);
    let changed = 0;
    let n = 0;
    // A metade de baixo da imagem: a placa.
    for (let y = 80; y < 144; y++)
        for (let x = 0; x < 256; x++) {
            const k = (y * 256 + x) * 4 + 1;
            n++;
            if (Math.abs(cloudy[k]! - clear[k]!) > 0.05 * Math.max(clear[k]!, 1e-3)) changed++;
        }
    log(
        `water-reflection: ${((changed / n) * 100).toFixed(1)} % dos pixels do reflexo mudam com as nuvens`,
    );
    check(
        changed / n > 0.1,
        `water-reflection: o reflexo não mostra as nuvens (${((changed / n) * 100).toFixed(1)} %)`,
    );
}

// ── coverage ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Fração dos pixels da nuvem aumentada com transmitância < 0,5 (a vista de cima: a área coberta). */
async function coveredImage(s: CloudScene): Promise<number> {
    const t = s.app.resources.textureOf(s.layer!, 'view');
    if (t === undefined) throw new Error('view não alocado');
    const v = await readTexture(s.app, t, 'rgba16float');
    let covered = 0;
    for (let k = 0; k < v.width * v.height; k++) if (v.data[k * 4 + 3]! < 0.5) covered++;
    return covered / (v.width * v.height);
}

async function caseCoverage(): Promise<void> {
    // A vista de cima, a 60 km, 60° de campo (até 30° do nadir: as laterais das nuvens pouco contam), ~69 km de lado,
    // em duas posições: ~150 células do campo de cobertura.
    for (const coverage of [0, 0.2, 0.5, 0.8, 1]) {
        let f = 0;
        for (const x of [0, 150_000]) {
            const s = await cloudScene({
                width: 320,
                height: 320,
                clouds: { coverage, wind: [0, 0] },
                eye: [x, 60_000, 0],
                target: [x + 1, 0, 0.5],
                fov: Math.PI / 3,
            });
            await settleFrames(s.app, 24);
            f += (await coveredImage(s)) / 2;
            finish(s);
        }
        log(`coverage ${coverage}: área coberta ${(f * 100).toFixed(1)} % na vista de cima`);
        check(
            Math.abs(f - coverage) <= 0.05,
            `coverage ${coverage}: medida ${(f * 100).toFixed(1)} % (SC-003: ±5 pontos)`,
        );
    }
}

async function caseSunTransmittance(): Promise<void> {
    // A tabela de transmitância do céu (a luz do sol que chega a cada ponto da nuvem) contra a integral f64, com o sol
    // perto do horizonte e nas altitudes da camada (o termo que muda com o sol baixo).
    const s = await cloudScene({ width: 64, height: 36, sunElevation: 4 });
    await settleFrames(s.app, 8);
    const t = s.app.resources.textureOf(s.sky, 'transmittance');
    if (t === undefined) throw new Error('tabela de transmitância não alocada');
    const lut = await readTexture(s.app, t, 'rgba16float');
    const bottom = 6360;
    const top = 6460;
    const H = Math.sqrt(top * top - bottom * bottom);
    let worst = 0;
    const rows: string[] = [];
    for (const alt of [0.2, 1.7, 3.0, 4.2])
        for (const deg of [1, 4, 8, 20]) {
            const r = bottom + alt;
            const mu = Math.sin((deg * Math.PI) / 180);
            const rho = Math.sqrt(r * r - bottom * bottom);
            const d = -r * mu + Math.sqrt(r * r * (mu * mu - 1) + top * top);
            const dMin = top - r;
            const dMax = rho + H;
            const u = (d - dMin) / (dMax - dMin);
            const v = rho / H;
            const fx = u * lut.width - 0.5;
            const fy = v * lut.height - 0.5;
            const x0 = Math.max(0, Math.min(lut.width - 2, Math.floor(fx)));
            const y0 = Math.max(0, Math.min(lut.height - 2, Math.floor(fy)));
            const ax = Math.min(1, Math.max(0, fx - x0));
            const ay = Math.min(1, Math.max(0, fy - y0));
            const at = (i: number, j: number, c: number): number =>
                lut.data[(j * lut.width + i) * 4 + c]!;
            const gpu = [0, 1, 2].map(
                (c) =>
                    (at(x0, y0, c) * (1 - ax) + at(x0 + 1, y0, c) * ax) * (1 - ay)
                    + (at(x0, y0 + 1, c) * (1 - ax) + at(x0 + 1, y0 + 1, c) * ax) * ay,
            );
            const ref = transmittanceToTop(atmosphere, r, mu, 1024);
            const err = Math.max(...[0, 1, 2].map((c) => Math.abs(gpu[c]! / ref[c]! - 1)));
            worst = Math.max(worst, err);
            rows.push(`${alt} km ${deg}°: ${(err * 100).toFixed(1)} %`);
        }
    log(`sun-transmittance: ${rows.join(', ')}`);
    check(worst <= 0.02, `sun-transmittance: tabela a ${(worst * 100).toFixed(1)} % da integral`);
    finish(s);
}

// ── o tempo: pressão, vento e tempestades (R19) ──────────────────────────────────────────────────────────────────────

/** Uma soma de vórtices gaussianos `A·e^(−|x − c|²/2σ²)` (Pa), em WGSL (o ponto `cloud_pressure`) e na referência. */
interface Vortex {
    readonly amplitude: number;
    readonly sigma: number;
    readonly x: number;
    readonly z: number;
}

function vortexPressure(vortices: readonly Vortex[]): {
    code: string;
    fn: (x: number, z: number) => number;
} {
    const f = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);
    const terms = vortices.map(
        (v) =>
            `${f(v.amplitude)} * exp(-dot(xz - vec2f(${f(v.x)}, ${f(v.z)}), xz - vec2f(${f(v.x)}, ${f(v.z)})) / ${(2 * v.sigma * v.sigma).toExponential(6)})`,
    );
    return {
        code: `fn pressure_fn(xz: vec2f, time: f32, data: PressureFnParams) -> f32 {\n    return ${terms.join(' + ')};\n}`,
        fn: (x, z) =>
            vortices.reduce(
                (sum, v) =>
                    sum
                    + v.amplitude
                        * Math.exp(-((x - v.x) ** 2 + (z - v.z) ** 2) / (2 * v.sigma * v.sigma)),
                0,
            ),
    };
}

/** A baixa das tempestades dos casos: 1800 Pa, σ = 350 km, centrada na origem. */
const STORM_LOW: Vortex = { amplitude: -1800, sigma: 350_000, x: 0, z: 0 };

/** Os parâmetros do kernel do tempo como a camada os empacota (o vento de condução nulo, o tempo parado). */
function weatherParamsOf(layer: CloudLayer): WeatherParams {
    const w = layer.weather!;
    return {
        f: coriolis(w.latitude),
        freeDrag: FREE_DRAG,
        friction: w.friction,
        step: w.scale / 64,
        steering: [0, 0],
        time: 0,
    };
}

/** O quadrado do tempo: o texel (i, j) → (x, z) do mundo, com a câmera na origem (o centro encaixado é 0). */
function weatherTexelXZ(layer: CloudLayer, i: number, j: number, size: number): [number, number] {
    const extent = layer.quality.coverageExtent;
    return [((i + 0.5) / size - 0.5) * extent, ((j + 0.5) / size - 0.5) * extent];
}

async function casePressureWind(): Promise<void> {
    // O vento das nuvens, a subida e a frente da GPU (o quadrado do tempo, `weatherWind`) contra a referência f64 numa
    // baixa gaussiana, no norte, no sul e no equador; o sentido do giro; o mapa de cobertura contra o mapeamento.
    const pressure = vortexPressure([STORM_LOW]);
    for (const latitude of [45, -45, 0]) {
        const s = await cloudScene({
            width: 128,
            height: 72,
            clouds: {
                coverage: 0.4,
                type: 0.5,
                top: 3000,
                wind: [0, 0],
                weather: { latitude, pressure: { code: pressure.code } },
            },
        });
        await settleFrames(s.app, 12);
        const layer = s.layer!;
        const tex = s.app.resources.textureOf(layer, 'weatherWind');
        if (tex === undefined) throw new Error('pressure-wind: vento do tempo não alocado');
        const wind = await readTexture(s.app, tex, 'rgba16float');
        const q = weatherParamsOf(layer);
        const N = wind.width;
        let maxSpeed = 0;
        let maxW = 0;
        let worstWind = 0;
        let worstW = 0;
        let worstFront = 0;
        const refs: {
            i: number;
            j: number;
            x: number;
            z: number;
            r: ReturnType<typeof weatherAt>;
        }[] = [];
        for (let j = 2; j < N; j += 5)
            for (let i = 3; i < N; i += 5) {
                const [x, z] = weatherTexelXZ(layer, i, j, N);
                const r = weatherAt((a, b) => pressure.fn(a, b), x, z, q);
                refs.push({ i, j, x, z, r });
                maxSpeed = Math.max(maxSpeed, Math.hypot(r.windX, r.windZ));
                maxW = Math.max(maxW, Math.abs(r.w));
            }
        for (const { i, j, x, z, r } of refs) {
            const o = (j * N + i) * 4;
            const ex = wind.data[o]! - r.windX;
            const ez = wind.data[o + 1]! - r.windZ;
            worstWind = Math.max(worstWind, Math.hypot(ex, ez) / maxSpeed);
            worstW = Math.max(worstW, Math.abs(wind.data[o + 2]! - r.w) / maxW);
            // A frente é `smoothstep(0,45; 0,75; √W⁺/f_e)` (inclinação até 5) de diferenças de segundas derivadas
            // (`p_EE − p_NN`, quase iguais perto de um centro): o erro relativo do f32 no estêncil, η ~ 10⁻⁴, vira no
            // argumento Δ = η·(|p_EE| + |p_NN| + 2|p_EN|)·(r + |f|)/(ρ(r² + f²)·f_e) — a 45°, ~10⁻⁴; no equador
            // (f_e = r), ~0,02. A tolerância é 0,02 mais 5·Δ: acompanha a sensibilidade da conta.
            const d = pressureStencil((a, b) => pressure.fn(a, b), x, z, q.step);
            const fe = Math.hypot(q.f, q.freeDrag);
            const delta =
                (1e-4
                    * (Math.abs(d.pEE) + Math.abs(d.pNN) + 2 * Math.abs(d.pEN))
                    * (q.freeDrag + Math.abs(q.f)))
                / (1.2 * fe * fe * fe);
            worstFront = Math.max(worstFront, Math.abs(wind.data[o + 3]! - r.front) - 5 * delta);
        }
        // O sentido: a leste do centro (x = +100 km, dentro do quadrado), o vento vai para o norte (−z) no hemisfério norte, para o sul no
        // sul; no equador, para o centro (oeste), sem giro.
        const east = Math.round((100_000 / layer.quality.coverageExtent + 0.5) * N - 0.5);
        const mid = N / 2;
        const o = (mid * N + east) * 4;
        const [vx, vz] = [wind.data[o]!, wind.data[o + 1]!];
        log(
            `pressure-wind ${latitude}°: ${refs.length} texels — vento ${(worstWind * 100).toFixed(2)} % do máximo (${maxSpeed.toFixed(1)} m/s), w ${(worstW * 100).toFixed(2)} % (máx ${(maxW * 100).toFixed(2)} cm/s), frente ±${worstFront.toFixed(3)} além da sensibilidade; a leste do centro (${vx.toFixed(2)}, ${vz.toFixed(2)}) m/s`,
        );
        check(
            worstWind <= 0.01,
            `pressure-wind ${latitude}°: vento a ${(worstWind * 100).toFixed(2)} % (SC-010)`,
        );
        check(
            worstW <= 0.01,
            `pressure-wind ${latitude}°: subida a ${(worstW * 100).toFixed(2)} % (SC-010)`,
        );
        check(worstFront <= 0.02, `pressure-wind ${latitude}°: frente a ${worstFront.toFixed(3)}`);
        if (latitude > 0)
            check(vz < -1, `pressure-wind 45° N: giro não anti-horário (vz ${vz.toFixed(2)})`);
        if (latitude < 0)
            check(vz > 1, `pressure-wind 45° S: giro não horário (vz ${vz.toFixed(2)})`);
        if (latitude === 0)
            check(
                vx < 0 && Math.abs(vz) < 0.05 * Math.abs(vx),
                `pressure-wind equador: o vento não desce o gradiente (${vx.toFixed(2)}, ${vz.toFixed(2)})`,
            );
        // O mapa de cobertura: o estado (parado: o alvo) em cada texel do tempo, bilinear, e as células por cima.
        if (latitude === 45) await coverageAgainstWeather(s, pressure.fn, q);
        finish(s);
    }
}

/** O mapa de cobertura da GPU contra o mapeamento da referência (o estado parado é o alvo; R19). */
async function coverageAgainstWeather(
    s: CloudScene,
    fn: (x: number, z: number) => number,
    q: WeatherParams,
): Promise<void> {
    const layer = s.layer!;
    const tex = s.app.resources.textureOf(layer, 'coverage');
    if (tex === undefined) throw new Error('mapa de cobertura não alocado');
    const map = await readTexture(s.app, tex, 'rgba8unorm');
    const extent = layer.quality.coverageExtent;
    const W = 128;
    const fair = {
        coverage: layer.coverage,
        type: layer.type,
        top: (layer.top - layer.base) / (layer.shellTop - layer.base),
    };
    const cache = new Map<number, ReturnType<typeof weatherClouds>>();
    const stateAt = (i: number, j: number): ReturnType<typeof weatherClouds> => {
        const ci = Math.min(W - 1, Math.max(0, i));
        const cj = Math.min(W - 1, Math.max(0, j));
        const key = cj * W + ci;
        let v = cache.get(key);
        if (v === undefined) {
            const [x, z] = weatherTexelXZ(layer, ci, cj, W);
            const r = weatherAt((a, b) => fn(a, b), x, z, q);
            v = weatherClouds(r.w, r.front, fair);
            cache.set(key, v);
        }
        return v;
    };
    let worst = 0;
    let storm = 0;
    for (let k = 0; k < 400; k++) {
        const i = Math.floor(map.width * 0.07) + ((k * 97) % Math.floor(map.width * 0.86));
        const j = Math.floor(map.height * 0.07) + ((k * 53 + 11) % Math.floor(map.height * 0.86));
        const x = ((i + 0.5) / map.width - 0.5) * extent;
        const z = ((j + 0.5) / map.height - 0.5) * extent;
        const fx = (x / extent + 0.5) * W - 0.5;
        const fz = (z / extent + 0.5) * W - 0.5;
        const x0 = Math.floor(fx);
        const z0 = Math.floor(fz);
        const ax = fx - x0;
        const az = fz - z0;
        const value = (i: number, j: number, key: 'coverage' | 'type' | 'top' | 'anvil'): number =>
            key === 'anvil' ? anvilSource(stateAt(i, j)) : stateAt(i, j)[key];
        const lerp = (key: 'coverage' | 'type' | 'top' | 'anvil'): number =>
            (value(x0, z0, key) * (1 - ax) + value(x0 + 1, z0, key) * ax) * (1 - az)
            + (value(x0, z0 + 1, key) * (1 - ax) + value(x0 + 1, z0 + 1, key) * ax) * az;
        const sc = lerp('coverage');
        const st = lerp('type');
        const ref = [
            quantize(coverageField(x, z, sc, st)),
            quantize(typeField(x, z, st)),
            quantize(lerp('anvil')),
            quantize(lerp('top')),
        ];
        const o = (j * map.width + i) * 4;
        for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(map.data[o + c]! - ref[c]!));
        if (map.data[o + 3]! > 0.95) storm++;
    }
    log(
        `pressure-wind: mapa de cobertura pelo tempo — 400 texels, pior ${(worst * 255).toFixed(2)}/255; ${storm} com a torre até a tropopausa`,
    );
    check(
        worst <= 3 / 255 + 1e-6,
        `pressure-wind: mapa de cobertura a ${(worst * 255).toFixed(2)}/255 do mapeamento`,
    );
    check(storm > 0, 'pressure-wind: nenhum texel com a torre até a tropopausa na baixa');
}

async function caseStorm(): Promise<void> {
    // A tempestade na baixa (SC-011): no núcleo, a torre do cúmulo-nimbo chega a ≥ 85 % da tropopausa e a bigorna
    // fecha a nuvem no alto (nas colunas maduras, os buracos a 80 % da altura local no máximo a metade dos de 50 %),
    // medidas na referência sobre o mapa e os volumes da GPU; a vista da torre de 60 km contra a marcha de referência.
    const pressure = vortexPressure([STORM_LOW]);
    const eye: Vec3 = [60_000, 2, 0];
    const target: Vec3 = [0, 4000, 0];
    const r = await viewCase(
        'storm',
        45,
        0,
        {
            coverage: 0.35,
            type: 0.5,
            top: 3000,
            wind: [0, 0],
            weather: { latitude: 45, pressure: { code: pressure.code } },
        },
        eye,
        target,
        // 128 quadros na média: a faixa fina das nuvens além de 20 km rente ao horizonte, numa casca de 9,5 km (passos
        // mais longos), varia a região mais que com 48 (5,4 % → 4,7 %; a cintilação é medida no `antialiasing`).
        128,
    );
    const layer = r.s.layer!;
    const model = await referenceModel(r.s, layer);
    const shell = layer.shellTop;
    let tallest = 0;
    let at50 = 0;
    let at80 = 0;
    let columns = 0;
    let mature = 0;
    for (let k = 0; k < 900; k++) {
        const x = ((k % 30) / 29 - 0.5) * 120_000;
        const z = (Math.floor(k / 30) / 29 - 0.5) * 120_000;
        const cov = model.coverage(x, z) as readonly number[];
        if ((cov[3] ?? 1) < 0.95) continue;
        columns++;
        for (let h = 0.3; h < 1; h += 0.01) {
            const y = layer.base + h * (shell - layer.base);
            if (cloudDensity(model, [x, y, z]) > 0) tallest = Math.max(tallest, y);
        }
        const yAt = (f: number): number => layer.base + f * (cov[3] ?? 1) * (shell - layer.base);
        // A bigorna é do cúmulo-nimbo maduro (tipo ≥ 0,9; no núcleo, metade das colunas pelo campo do tipo): a extensão
        // da nuvem no alto contra a do meio da torre, nas colunas maduras (tipo local ≥ 0,95, onde o perfil é igual a
        // 50 % e a 80 % da altura: a diferença é só a bigorna).
        if ((cov[1] ?? 0) < 0.95) continue;
        mature++;
        if (cloudDensity(model, [x, yAt(0.5), z]) > 0) at50++;
        if (cloudDensity(model, [x, yAt(0.8), z]) > 0) at80++;
    }
    log(
        `storm: ${columns} colunas no núcleo; topo mais alto ${(tallest / 1000).toFixed(2)} km (tropopausa ${(shell / 1000).toFixed(1)} km); nas ${mature} maduras, nuvem a 50 % ${at50}, a 80 % ${at80}; vista: luz ${(r.worstL * 100).toFixed(1)} %, T ${r.worstT.toFixed(3)}`,
    );
    check(columns > 50, `storm: só ${columns} colunas com a torre no núcleo da baixa`);
    check(
        tallest >= 0.85 * shell,
        `storm: topo ${(tallest / 1000).toFixed(2)} km < 85 % da tropopausa (SC-011)`,
    );
    // A bigorna fecha a nuvem no alto: os buracos entre as torres maduras a 80 % da altura no máximo metade dos de 50 %
    // (a razão das colunas com nuvem satura quando a torre já cobre quase todo o núcleo).
    check(
        mature > 50 && mature - at80 <= 0.5 * (mature - at50),
        `storm: sem bigorna (buracos a 80 % ${mature - at80} contra ${mature - at50} a 50 % nas ${mature} maduras, SC-011)`,
    );
    check(r.worstT <= 0.05, `storm: transmitância a ${r.worstT.toFixed(3)} da referência`);
    check(r.worstL <= 0.05, `storm: luz a ${(r.worstL * 100).toFixed(1)} % da referência`);
    finish(r.s);
}

async function caseFront(): Promise<void> {
    // Uma baixa e uma alta vizinhas: a faixa da frente entre elas (Okubo–Weiss) com a cobertura pedida ≥ 0,8, e a alta
    // com o céu mais limpo que o tempo bom (a subsidência).
    const pressure = vortexPressure([
        { amplitude: -1500, sigma: 300_000, x: -350_000, z: 0 },
        { amplitude: 700, sigma: 450_000, x: 350_000, z: 0 },
    ]);
    const s = await cloudScene({
        width: 128,
        height: 72,
        clouds: {
            coverage: 0.4,
            type: 0.5,
            top: 3000,
            wind: [0, 0],
            weather: { latitude: 45, pressure: { code: pressure.code } },
        },
    });
    await settleFrames(s.app, 12);
    const layer = s.layer!;
    const tex = s.app.resources.textureOf(layer, 'weatherWind');
    const cov = s.app.resources.textureOf(layer, 'coverage');
    if (tex === undefined || cov === undefined)
        throw new Error('front: alvos do tempo não alocados');
    const wind = await readTexture(s.app, tex, 'rgba16float');
    const map = await readTexture(s.app, cov, 'rgba8unorm');
    const q = weatherParamsOf(layer);
    const N = wind.width;
    let peak = 0;
    let peakX = 0;
    let worst = 0;
    for (let j = 0; j < N; j += 4)
        for (let i = 0; i < N; i += 2) {
            const o = (j * N + i) * 4;
            const [x, z] = weatherTexelXZ(layer, i, j, N);
            const r = weatherAt((a, b) => pressure.fn(a, b), x, z, q);
            worst = Math.max(worst, Math.abs(wind.data[o + 3]! - r.front));
            if (wind.data[o + 3]! > peak) {
                peak = wind.data[o + 3]!;
                peakX = x;
            }
        }
    // A cobertura pedida média (canal R, a cobertura local) na metade da alta contra a da baixa.
    let high = 0;
    let low = 0;
    let nh = 0;
    let nl = 0;
    for (let j = 0; j < map.height; j += 3)
        for (let i = 0; i < map.width; i += 3) {
            const v = map.data[(j * map.width + i) * 4]!;
            if (i > map.width * 0.75) {
                high += v;
                nh++;
            }
            if (i < map.width * 0.25) {
                low += v;
                nl++;
            }
        }
    high /= nh;
    low /= nl;
    log(
        `front: frente máxima ${peak.toFixed(2)} em x = ${(peakX / 1000).toFixed(0)} km (a referência ±${worst.toFixed(3)}); cobertura local média ${high.toFixed(3)} do lado da alta, ${low.toFixed(3)} do lado da baixa`,
    );
    check(worst <= 0.02, `front: frente a ${worst.toFixed(3)} da referência`);
    check(peak >= 0.5, `front: sem faixa (máximo ${peak.toFixed(2)})`);
    check(
        high < low,
        `front: a alta (${high.toFixed(3)}) não mais limpa que a baixa (${low.toFixed(3)})`,
    );
    finish(s);
}

async function caseWeatherTiming(): Promise<void> {
    // O custo do tempo (SC-012): o estado (o estêncil da pressão do padrão, o vento, a série) e o acréscimo do mapa de
    // cobertura por ele sobre o mapa sem o tempo (o de 1024² do alto já custa ~0,16 ms sem o tempo), por passe, a
    // 1280 × 720 no perfil alto com a GPU ocupada.
    const measure = async (weather: boolean): Promise<{ state: number; coverage: number }> => {
        const s = await cloudScene({
            width: 1280,
            height: 720,
            profile: 'high',
            profiling: true,
            clouds: weather
                ? { coverage: 0.4, top: 3000, wind: [10, 0], weather: { latitude: 45 } }
                : { coverage: 0.4, top: 3000, wind: [10, 0] },
            target: [1000, 400, 300],
        });
        await busyFrames(s.app, TIMING_WARMUP);
        const t = await passTimes(s.app, 120);
        const of = (name: string): number =>
            Object.entries(t.passes).find(([k]) => k.endsWith(name))?.[1] ?? 0;
        finish(s);
        return { state: of('CloudLightFlow.weather'), coverage: of('CloudLightFlow.coverage') };
    };
    const plain = await measure(false);
    const weather = await measure(true);
    const extra = weather.coverage - plain.coverage;
    log(
        `weather-timing: estado do tempo ${weather.state.toFixed(3)} ms; mapa de cobertura ${weather.coverage.toFixed(3)} ms com o tempo, ${plain.coverage.toFixed(3)} ms sem (acréscimo ${extra.toFixed(3)} ms)`,
    );
    check(weather.state > 0, 'weather-timing: o passe do estado do tempo não apareceu');
    check(
        weather.state <= 0.15,
        `weather-timing: o estado do tempo ${weather.state.toFixed(3)} ms > 0,15 ms (SC-012)`,
    );
    check(
        extra <= 0.05,
        `weather-timing: o mapa de cobertura pelo tempo custa ${extra.toFixed(3)} ms a mais > 0,05 ms (SC-012)`,
    );
}

async function caseStormGround(): Promise<void> {
    // A luz do sol no chão da câmera sob o tempo acelerado (a `tempestade` da rodada 7 do claflow-web: 1 quadro = 4 s, o
    // sol a 35° no azimute (0,8; 0,6), a baixa de 4 hPa a 55 km): o chão do vídeo subia e descia inteiro em ~0,2 s. Em
    // cada quadro das janelas em que isso acontecia, a transmitância até o sol no chão (0, 0, 0) pelo mapa da GPU contra a
    // integral da referência f64 sobre o mapa de cobertura e os volumes da GPU no mesmo quadro (a mesma representação);
    // e, numa linha de 2 km no rumo do vento, o deslocamento do padrão de sombra de um quadro ao outro (a sombra andando)
    // e o que sobra depois dele (a nuvem nascendo ou sumindo).
    const az = (Math.atan2(0.6, 0.8) * 180) / Math.PI;
    const pressure = `fn pressure_fn(xz: vec2f, time: f32, data: PressureFnParams) -> f32 {
    let d = xz - vec2f(-57600.0, -55000.0);
    return -400.0 * smoothstep(3600.0, 14400.0, time) * exp(-dot(d, d) / 1.8e9);
}`;
    const s = await cloudScene({
        width: 256,
        height: 144,
        sunElevation: 35,
        sunAzimuth: az,
        clouds: {
            coverage: 0.3,
            type: 0.5,
            base: 1200,
            top: 2800,
            wind: [6, 0],
            density: 0.08,
            weather: {
                latitude: 40,
                scale: 192_000,
                formation: 1800,
                tropopause: 11_000,
                pressure: { code: pressure },
            },
        },
        eye: [0, 2, 0],
        target: [0, 200, -1000],
    });
    const layer = s.layer!;
    s.app.time.scale = 240;
    s.app.time.fixedDt = 4;
    await s.app.whenReady({ timeoutMs: 60_000 });
    const q = new URLSearchParams(location.search);
    const windows = (q.get('windows') ?? '160-220,880-940')
        .split(',')
        .map((w) => w.split('-').map(Number) as [number, number]);
    const last = Math.max(...windows.map((w) => w[1]));
    const sun = sunToward(35, az);
    const line = Array.from({ length: 41 }, (_, k) => -1000 + 50 * k);
    let worst = 0;
    let sumG = 0;
    let sumR = 0;
    const rows: number[][] = [];
    const frames: number[] = [];
    for (let frame = -600; frame <= last; frame++) {
        s.app.step(1 / 60);
        await nextGpuFrame(s.app);
        const w = windows.find(([a, b]) => frame >= a && frame <= b);
        if (w === undefined) continue;
        const time = s.app.time.simulated;
        const map = await readShadowMap(s.app, layer);
        const params = layer.data.params[0]!;
        const model = await referenceModel(s, layer, time);
        const g = groundMapT(map, params, [0, 0, 0]);
        const r = Math.exp(-opticalDepth(model, [0, 0, 0], sun, 512));
        const row = line.map((x) => groundMapT(map, params, [x, 0, 0]));
        worst = Math.max(worst, Math.abs(g - r));
        sumG += g;
        sumR += r;
        log(
            `storm-ground ${frame} (${(frame / 60).toFixed(2)} s): T GPU ${g.toFixed(3)} ref ${r.toFixed(3)}; linha x −1..1 km ${row
                .filter((_, k) => k % 4 === 0)
                .map((v) => v.toFixed(2))
                .join(' ')}`,
        );
        rows.push(row);
        frames.push(frame);
    }
    // O deslocamento do padrão entre quadros seguidos (em passos de 50 m) e o que sobra.
    const shifts: string[] = [];
    for (let k = 1; k < rows.length; k++) {
        if (frames[k]! !== frames[k - 1]! + 1) continue;
        const a = rows[k - 1]!;
        const b = rows[k]!;
        let best = 0;
        let bestErr = Infinity;
        for (let sft = -4; sft <= 4; sft++) {
            let e = 0;
            let n = 0;
            for (let i = 4; i < a.length - 4; i++) {
                e += (b[i]! - a[i - sft]!) ** 2;
                n++;
            }
            if (e / n < bestErr) {
                bestErr = e / n;
                best = sft;
            }
        }
        let e0 = 0;
        for (let i = 4; i < a.length - 4; i++) e0 += (b[i]! - a[i]!) ** 2;
        shifts.push(
            `${best * 50}m:${Math.sqrt(e0 / (a.length - 8)).toFixed(3)}→${Math.sqrt(bestErr).toFixed(3)}`,
        );
    }
    log(
        `storm-ground: deslocamento por quadro (m: rms parado → depois do deslocamento) ${shifts.join(' ')}`,
    );
    log(
        `storm-ground: pior diferença GPU−ref ${worst.toFixed(3)}; luz somada GPU ${sumG.toFixed(2)}, ref ${sumR.toFixed(2)}`,
    );
    check(
        Math.abs(sumG / Math.max(sumR, 1e-6) - 1) <= 0.1,
        `storm-ground: luz somada ${sumG.toFixed(2)} contra ${sumR.toFixed(2)} da referência`,
    );
    finish(s);
}

const CASES: Record<string, () => Promise<void>> = {
    coverage: caseCoverage,
    'sun-transmittance': caseSunTransmittance,
    'coverage-map': caseCoverageMap,
    'overcast-ambient': caseOvercastAmbient,
    'fog-in-front': caseFogInFront,
    'water-reflection': caseWaterReflection,
    'clear-sky': caseClearSky,
    'overcast-stratus': caseOvercastStratus,
    'coverage-mask': caseCoverageMask,
    wind: caseWind,
    'wind-wrap': caseWindWrap,
    'user-graph': caseUserGraph,
    sunset: caseSunset,
    types: caseTypes,
    'far-cloud': caseFarCloud,
    backlit: caseBacklit,
    'sun-sweep': caseSunSweep,
    'sun-low': caseSunLow,
    'sun-below': caseSunBelow,
    'fly-through': caseFlyThrough,
    'shadow-map': caseShadowMap,
    panorama: casePanorama,
    'noise-volumes': caseNoiseVolumes,
    ambient: caseAmbient,
    noon: caseNoon,
    'scatter-cache': caseScatterCache,
    timing: caseTiming,
    'interior-timing': caseInteriorTiming,
    'sky-timing': caseSkyTiming,
    'pressure-wind': casePressureWind,
    storm: caseStorm,
    'storm-ground': caseStormGround,
    front: caseFront,
    'weather-timing': caseWeatherTiming,
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('CLOUDS SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
