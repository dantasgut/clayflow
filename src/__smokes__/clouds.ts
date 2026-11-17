// Spec 041 — Smoke das nuvens volumétricas (US1–US4), pelo caminho de autoria (`Sky` + `CloudLayer`).
//
// A referência é a f64 de `elements/media/clouds/reference/cloudModel.ts` sobre os volumes de ruído lidos da própria GPU
// (a mesma representação dos dois lados: memória "referência da CPU distorce"); a atmosfera é a de
// `scene/reference/atmosphere.ts`. Casos (`--query case=<nome>`):
//   - noise-volumes: os volumes de forma e de detalhe contra o grafo padrão avaliado pela referência u32 (2/255);
//   - ambient: as irradiâncias do céu e do chão contra a integral da radiância do céu da referência (≤ 5 %);
//   - noon: a nuvem vista do chão (luz espalhada e transmitância por região) contra a marcha de referência (SC-001);
//   - timing: o custo por passe das nuvens a 1280 × 720 no perfil alto (SC-005).
// Para rodar: `npm run smoke -- clouds --headless --timeout 400`. Resultado: `CLOUDS SMOKE PASSED` ou `FAIL: …`.
import { CLOUD_OCTAVES, type Application, type CloudLayer } from 'clayflow/web';
import { settleFrames } from './support/extensionScenes';
import {
    cloudScene,
    sunTravel,
    disposeCloudScene,
    readCloudVolume,
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
    coneSunDepth,
    opticalDepth,
    shellSegments,
    coverageField,
    defaultShape,
    jdeParams,
    marchCloud,
    type CloudModel,
    type Vec3,
} from '../elements/media/clouds/reference/cloudModel';
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
async function referenceModel(s: CloudScene, layer: CloudLayer): Promise<CloudModel> {
    const shape = await readCloudVolume(s.app, layer, 'shape');
    const detail = await readCloudVolume(s.app, layer, 'detail');
    const radii = s.sky.data.radii;
    const half = layer.quality.coverageExtent / 2;
    const MAP = 512;
    // O centro do mapa: a câmera encaixada no texel (o empacotamento do `CloudNoiseFlow`).
    const texel = (2 * half) / MAP;
    const eye = s.camera.data.position;
    const center = [
        Math.round((eye[0] ?? 0) / texel) * texel,
        Math.round((eye[2] ?? 0) / texel) * texel,
    ];
    const cache = new Map<number, number>();
    const mapTexel = (x: number, z: number): number => {
        const key = Math.round(x) * 1e7 + Math.round(z);
        let v = cache.get(key);
        if (v === undefined) {
            v = quantize(coverageField(x, z, c, t));
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
                return [coverageField(x, z, c, t), t, 1];
            const fx = ((x - center[0]!) / (2 * half) + 0.5) * MAP - 0.5;
            const fz = ((z - center[1]!) / (2 * half) + 0.5) * MAP - 0.5;
            const x0 = Math.floor(fx);
            const z0 = Math.floor(fz);
            const at = (i: number, j: number): number => {
                const ci = Math.min(MAP - 1, Math.max(0, i));
                const cj = Math.min(MAP - 1, Math.max(0, j));
                return mapTexel(
                    center[0]! + ((ci + 0.5) / MAP - 0.5) * 2 * half,
                    center[1]! + ((cj + 0.5) / MAP - 0.5) * 2 * half,
                );
            };
            const ax = fx - x0;
            const az = fz - z0;
            const v =
                (at(x0, z0) * (1 - ax) + at(x0 + 1, z0) * ax) * (1 - az)
                + (at(x0, z0 + 1) * (1 - ax) + at(x0 + 1, z0 + 1) * ax) * az;
            return [v, quantize(t), 1];
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
): Promise<{ worstT: number; worstL: number; edgeRatio: number }> {
    const layer = s.layer!;
    const w = s.canvas.width;
    const h = s.canvas.height;
    const t = s.app.resources.textureOf(layer, 'view');
    const amb = s.app.resources.textureOf(layer, 'ambient');
    if (t === undefined || amb === undefined)
        throw new Error(`${label}: alvos das nuvens não alocados`);
    // A imagem convergida: a média de 48 quadros seguidos da nuvem apresentada (o ruído do deslocamento inicial da
    // marcha, que a média temporal integra, é medido à parte como cintilação no smoke `antialiasing`). Num quadro só,
    // a faixa de nuvens de 2–4 px rente ao horizonte variava a região até 12 % (`sunset`); com 48, ≤ 5 %.
    const FRAMES = 48;
    const first = await readTexture(s.app, t, 'rgba16float');
    const acc = new Float32Array(first.data.length);
    for (let k = 0; k < acc.length; k++) acc[k] = first.data[k]! / FRAMES;
    for (let f = 1; f < FRAMES; f++) {
        await settleFrames(s.app, 1);
        const v = await readTexture(s.app, t, 'rgba16float');
        for (let k = 0; k < acc.length; k++) acc[k]! += v.data[k]! / FRAMES;
    }
    const view = { ...first, data: acc };
    const ambient = await readTexture(s.app, amb, 'rgba16float');
    const model = await referenceModel(s, layer);
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
    // Diagnóstico (`?amb=k`): o ambiente da referência × k.
    const ambK = Number(new URLSearchParams(location.search).get('amb') ?? 1);
    const light = {
        sunDir: sun,
        sunAt,
        sun: [sunT[0] * lux, sunT[1] * lux, sunT[2] * lux] as Vec3,
        ambientUp: [0, 1, 2].map((c) => ambient.data[c]! * ambK) as unknown as Vec3,
        ambientDown: [4, 5, 6].map((c) => ambient.data[c]! * ambK) as unknown as Vec3,
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
                    );
                    let c: Vec3 = r.scattered;
                    if (r.transmittance < 1) {
                        const a = aerialPerspective(
                            atmosphere,
                            0.2 + eye[1] / 1000,
                            d,
                            sun,
                            r.depth / 1000,
                            48,
                            ms,
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
    await settleFrames(s.app, 90);
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

// ── timing ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Mediana dos tempos por passe das nuvens em `frames` quadros. */
async function passTimes(
    app: Application,
    frames: number,
): Promise<{ total: number; span: number; passes: Record<string, number> }> {
    const samples: Record<string, number>[] = [];
    const spans: number[] = [];
    const off = app.events.on('gpuFrameTimed', (e) => {
        samples.push({ ...e.passesMs });
        spans.push(e.spanMs);
    });
    await settleFrames(app, frames);
    off();
    const keys = new Set(samples.flatMap((x) => Object.keys(x)));
    const median = (v: number[]): number => {
        const a = [...v].sort((x, y) => x - y);
        return a[Math.floor(a.length / 2)] ?? 0;
    };
    const passes: Record<string, number> = {};
    for (const k of keys)
        if (/Cloud|SkyComposite|sky_aerial/.test(k))
            passes[k] = median(samples.map((x) => x[k] ?? 0));
    const total = Object.values(passes).reduce((a, b) => a + b, 0);
    return { total, span: median(spans), passes };
}

/** Tempo do quadro na GPU (mediana do span) de uma cena de 1280 × 720. */
async function frameSpan(o: Parameters<typeof cloudScene>[0]): Promise<number> {
    const s = await cloudScene({ width: 1280, height: 720, profiling: true, ...o });
    await settleFrames(s.app, 60);
    const t = await passTimes(s.app, 120);
    finish(s);
    return t.span;
}

async function caseTiming(): Promise<void> {
    const limits = { high: 3, medium: 2, low: 1.2 } as const;
    // O custo real pelo tempo do quadro (o perfilador por passe conta a sobreposição de passes seguidos no TBDR).
    const view = { target: [1000, 400, 300] as const };
    for (const profile of ['low', 'high', 'medium', 'low'] as const) {
        const sky = await frameSpan({ ...view, profile, clouds: false });
        const withClouds = await frameSpan({
            ...view,
            profile,
            clouds: { coverage: 0.5, wind: [10, 0] },
        });
        log(
            `timing ${profile}: quadro com nuvens ${withClouds.toFixed(3)} ms, só o céu ${sky.toFixed(3)} ms — nuvens ${(withClouds - sky).toFixed(3)} ms`,
        );
        check(
            withClouds - sky <= limits[profile],
            `timing ${profile}: nuvens ${(withClouds - sky).toFixed(3)} ms > ${limits[profile]} ms (SC-005)`,
        );
    }
    for (const [profile, clouds] of [
        ['high', true],
        ['high', false],
        ['low', true],
    ] as const) {
        const s = await cloudScene({
            width: 1280,
            height: 720,
            profile,
            profiling: true,
            clouds: clouds ? { coverage: 0.5, wind: [10, 0] } : false,
            target: [1000, 400, 300],
        });
        await settleFrames(s.app, 60);
        const t = await passTimes(s.app, 120);
        log(
            `timing ${profile}${clouds ? '' : ' (só o céu)'} por passe (quadro ${t.span.toFixed(3)} ms; soma ${t.total.toFixed(3)} ms, conta sobreposição): ${Object.entries(
                t.passes,
            )
                .map(([k, v]) => `${k.replace(/^.*\//, '')} ${v.toFixed(3)}`)
                .join(', ')}`,
        );
        finish(s);
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
    await settleFrames(s.app, 90);
    const r = await compareView(s, label, eye, target, fov, sunElevation, false, sunAzimuth);
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
    const t = s.app.resources.textureOf(layer, 'shadow');
    if (t === undefined) throw new Error('mapa visto do sol não alocado');
    const map = await readTexture(s.app, t, 'rgba16float');
    const model = await referenceModel(s, layer);
    const p = layer.data.params[0]!;
    const center = p.sunFrame!;
    const right = p.sunRight!;
    const up = p.sunUp!;
    const sun = p.sunDir! as unknown as Vec3;
    let worst = 0;
    let shaded = 0;
    let meanShade = 0;
    for (let k = 0; k < 200; k++) {
        const x = (((k * 0.618034) % 1) - 0.5) * 12_000;
        const z = (((k * 0.754878) % 1) - 0.5) * 12_000;
        const q: Vec3 = [x, 0, z];
        const exact = Math.exp(-opticalDepth(model, q, [sun[0], sun[1], sun[2]], 512));
        const rel = [q[0] - center[0]!, q[1] - center[1]!, q[2] - center[2]!];
        const wp = p.sunWarp!;
        const u =
            (Math.asinh((rel[0]! * right[0]! + rel[1]! * right[1]! + rel[2]! * right[2]!) / wp[0]!)
                / wp[1]!)
                * 0.5
            + 0.5;
        const v =
            (Math.asinh((rel[0]! * up[0]! + rel[1]! * up[1]! + rel[2]! * up[2]!) / wp[2]!) / wp[3]!)
                * 0.5
            + 0.5;
        const fx = u * map.width - 0.5;
        const fy = v * map.height - 0.5;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        // O volume: 4 camadas × 4 nós; o último nó (o trecho inteiro) é o canal a da camada 3.
        const at = (i: number, j: number, c: number): number =>
            map.data[
                ((map.depth - 1) * map.height * map.width
                    + Math.min(map.height - 1, Math.max(0, j)) * map.width
                    + Math.min(map.width - 1, Math.max(0, i)))
                    * 4
                    + c
            ]!;
        const ax = fx - x0;
        const ay = fy - y0;
        const knot = (c: number): number =>
            (at(x0, y0, c) * (1 - ax) + at(x0 + 1, y0, c) * ax) * (1 - ay)
            + (at(x0, y0 + 1, c) * (1 - ax) + at(x0 + 1, y0 + 1, c) * ax) * ay;
        // O receptor no chão está abaixo da casca: o τ é o último nó.
        const gpu = Math.exp(-knot(3));
        if (exact < 0.9) {
            shaded++;
            meanShade += Math.abs(gpu - exact);
        }
        worst = Math.max(worst, Math.abs(gpu - exact));
    }
    meanShade /= Math.max(shaded, 1);
    log(
        `shadow-map: 200 pontos do chão (${shaded} sob nuvem) — diferença média sob a nuvem ${meanShade.toFixed(3)}, pior ponto ${worst.toFixed(3)} (texel perto da câmera ${((2 * p.sunWarp![0]! * p.sunWarp![1]!) / map.width).toFixed(0)} × ${((2 * p.sunWarp![2]! * p.sunWarp![3]!) / map.width).toFixed(0)} m)`,
    );
    check(
        meanShade <= 0.05,
        `shadow-map: transmitância média sob a nuvem a ${meanShade.toFixed(3)} da referência (SC-004)`,
    );
    finish(s);
    void shellSegments;
}

/** A transmitância do mapa visto do sol no ponto do chão `q`, lida como a GPU a lê (o último nó, bilinear). */
function groundMapT(
    map: { width: number; height: number; depth: number; data: Float32Array },
    p: CloudLayer['data']['params'][number],
    q: Vec3,
): number {
    const c0 = p.sunFrame!;
    const right = p.sunRight!;
    const up = p.sunUp!;
    const wp = p.sunWarp!;
    const rel = [q[0] - c0[0]!, q[1] - c0[1]!, q[2] - c0[2]!];
    const u =
        (Math.asinh((rel[0]! * right[0]! + rel[1]! * right[1]! + rel[2]! * right[2]!) / wp[0]!)
            / wp[1]!)
            * 0.5
        + 0.5;
    const v =
        (Math.asinh((rel[0]! * up[0]! + rel[1]! * up[1]! + rel[2]! * up[2]!) / wp[2]!) / wp[3]!)
            * 0.5
        + 0.5;
    const fx = u * map.width - 0.5;
    const fy = v * map.height - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const at = (i: number, j: number): number =>
        map.data[
            ((map.depth - 1) * map.height * map.width
                + Math.min(map.height - 1, Math.max(0, j)) * map.width
                + Math.min(map.width - 1, Math.max(0, i)))
                * 4
                + 3
        ]!;
    const ax = fx - x0;
    const ay = fy - y0;
    const tau =
        (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay)
        + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay;
    return Math.exp(-tau);
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
        const t = s.app.resources.textureOf(layer, 'shadow');
        if (t === undefined) throw new Error('mapa visto do sol não alocado');
        const map = await readTexture(s.app, t, 'rgba16float');
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
    // o outro: a medida é a média da diferença na varredura e o começo e o fim da luz (±0,1°).
    const mean = gpu.reduce((a, g, i) => a + Math.abs(g - ref[i]!), 0) / gpu.length;
    const edges = (v: number[]): number[] =>
        v.flatMap((x, i) => (i > 0 && x > 0.5 !== v[i - 1]! > 0.5 ? [i] : []));
    const ge = edges(gpu);
    const re = edges(ref);
    log(
        `sun-sweep: diferença média ${mean.toFixed(3)}; a luz começa e termina em ${ge.map((i) => (12 - i * 0.1).toFixed(1)).join('/')}° (ref ${re.map((i) => (12 - i * 0.1).toFixed(1)).join('/')}°)`,
    );
    check(
        mean <= 0.05,
        `sun-sweep: a luz direta no chão a ${mean.toFixed(3)} da referência na média`,
    );
    check(
        ge.length === re.length && ge.every((i, k) => Math.abs(i - re[k]!) <= 1),
        `sun-sweep: a luz começa ou termina fora da referência (${ge.join(',')} × ${re.join(',')})`,
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
        worst = Math.max(worst, Math.abs(map.data[(j * map.width + i) * 4]! - quantize(ref)));
    }
    log(
        `coverage-map: 400 texels contra o campo da referência — pior ${(worst * 255).toFixed(2)}/255`,
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
    const sh = s.app.resources.textureOf(layer, 'shadow');
    if (t === undefined || sh === undefined) throw new Error('alvos das nuvens não alocados');
    const pano = await readTexture(s.app, t, 'rgba16float');
    const shadow = await readTexture(s.app, sh, 'rgba16float');
    const model = await referenceModel(s, layer);
    const sun = sunToward(60);
    const lux = s.sun.data.intensity;
    const amb = s.app.resources.textureOf(layer, 'ambient');
    const ambient = await readTexture(s.app, amb!, 'rgba16float');
    const light = {
        sunDir: sun,
        sun: sunTransmittance(atmosphere, 1.4, sun).map((v) => v * lux) as unknown as Vec3,
        ambientUp: [ambient.data[0]!, ambient.data[1]!, ambient.data[2]!] as Vec3,
        ambientDown: [ambient.data[4]!, ambient.data[5]!, ambient.data[6]!] as Vec3,
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
    // O sol direto no chão: a transmitância do mapa (o último nó: o canal a da última camada) no centro.
    const c =
        (((shadow.depth - 1) * shadow.height + Math.floor(shadow.height / 2)) * shadow.width
            + Math.floor(shadow.width / 2))
        * 4;
    const sunT = Math.exp(-shadow.data[c + 3]!);
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
    'fly-through': caseFlyThrough,
    'shadow-map': caseShadowMap,
    panorama: casePanorama,
    'noise-volumes': caseNoiseVolumes,
    ambient: caseAmbient,
    noon: caseNoon,
    timing: caseTiming,
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
