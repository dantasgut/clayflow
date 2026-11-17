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
    disposeCloudScene,
    readCloudVolume,
    readTexture,
    type CloudScene,
} from './support/cloudScenes';
import {
    coneSunDepth,
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
    const c = layer.coverage;
    const t = layer.type;
    const wind = layer.wind;
    const speed = Math.hypot(wind[0], wind[1]);
    return {
        groundRadius: ((radii[0] ?? 6360) + (radii[3] ?? 0.2)) * 1000,
        base: layer.base,
        top: layer.top,
        coverage: (x, z) =>
            Math.abs(x) <= half && Math.abs(z) <= half ? [quantize(c), quantize(t), 1] : [c, t, 1],
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
): Promise<{ worstT: number; worstL: number }> {
    const layer = s.layer!;
    const w = s.canvas.width;
    const h = s.canvas.height;
    const t = s.app.resources.textureOf(layer, 'view');
    const amb = s.app.resources.textureOf(layer, 'ambient');
    if (t === undefined || amb === undefined)
        throw new Error(`${label}: alvos das nuvens não alocados`);
    const view = await readTexture(s.app, t, 'rgba16float');
    const ambient = await readTexture(s.app, amb, 'rgba16float');
    const model = await referenceModel(s, layer);
    const sun = sunToward(sunElevation);
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
    const light = {
        sunDir: sun,
        sunAt,
        sun: [sunT[0] * lux, sunT[1] * lux, sunT[2] * lux] as Vec3,
        ambientUp: [ambient.data[0]!, ambient.data[1]!, ambient.data[2]!] as Vec3,
        ambientDown: [ambient.data[4]!, ambient.data[5]!, ambient.data[6]!] as Vec3,
    };
    const phase = jdeParams(layer.dropletDiameter);
    const octaves = { count: layer.quality.octaves, ...CLOUD_OCTAVES };
    const cols = 12;
    const rows = 6;
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
    }[] = [];
    for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
            const cx = Math.floor(((i + 0.5) / cols) * w);
            const cy = Math.floor(((j + 0.5) / rows) * h);
            // As mesmas 3 × 3 posições de pixel (a 4 px) na GPU e na referência: a média da região dos dois lados.
            let rgbSum = [0, 0, 0];
            let rTSum = 0;
            let depthSum = 0;
            let rawSum = 0;
            let gL = 0;
            let gT = 0;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const px = cx + 4 * dx;
                    const py = cy + 4 * dy;
                    const d = pixelDir(px, py, w, h, eye, target, fov);
                    const r = marchCloud(
                        model,
                        eye,
                        d,
                        Infinity,
                        cone ? { ...light, sunDepth: (x) => coneSunDepth(model, x, sun) } : light,
                        phase,
                        octaves,
                        384,
                        96,
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
                        c = [0, 1, 2].map(
                            (k) =>
                                c[k]! * a.transmittance[k]!
                                + (1 - r.transmittance) * a.scattered[k]! * lux,
                        ) as unknown as Vec3;
                    }
                    rgbSum = rgbSum.map((v, k) => v + c[k]! / 9);
                    rTSum += r.transmittance / 9;
                    depthSum += (Number.isFinite(r.depth) ? r.depth : 0) / 9;
                    rawSum += (r.scattered[0] + r.scattered[1] + r.scattered[2]) / 27;
                    const o = (py * w + px) * 4;
                    gL += (view.data[o]! + view.data[o + 1]! + view.data[o + 2]!) / 27;
                    gT += view.data[o + 3]! / 9;
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
            });
        }
    for (const x of samples) {
        worstT = Math.max(worstT, Math.abs(x.gT - x.rT));
        worstL = Math.max(worstL, Math.abs(x.gL - x.rL) / Math.max(x.rL, 0.1 * peak));
    }
    const cloudy = samples.filter((x) => x.rT < 0.95).length;
    const ratios = samples.map((x) => x.gL / Math.max(x.rL, 1e-6)).sort((a, b) => a - b);
    log(
        `${label}: razão GPU/referência da luz — mín ${ratios[0]!.toFixed(3)}, mediana ${ratios[Math.floor(ratios.length / 2)]!.toFixed(3)}, máx ${ratios.at(-1)!.toFixed(3)}`,
    );
    for (const x of [...samples]
        .sort((a, b) => Math.abs(b.gL / b.rL - 1) - Math.abs(a.gL / a.rL - 1))
        .slice(0, 4))
        log(
            `${label}:   GPU ${x.gL.toFixed(2)} ref ${x.rL.toFixed(2)} (sem a atmosfera ${x.raw.toFixed(2)}), T ${x.gT.toFixed(3)}/${x.rT.toFixed(3)}, nuvem a ${(x.depth / 1000).toFixed(1)} km`,
        );
    log(
        `${label}: ${samples.length} regiões (${cloudy} com nuvem): pior transmitância ${worstT.toFixed(3)}, pior luz ${(worstL * 100).toFixed(1)} % (pico de referência ${peak.toFixed(1)} nits)`,
    );
    return { worstT, worstL };
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

const CASES: Record<string, () => Promise<void>> = {
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
