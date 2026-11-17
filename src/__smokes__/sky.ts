// Spec 033 — Smoke do céu físico (US2, SC-003).
//
// As medidas leem a radiância linear do alvo HDR da cena (antes da apresentação):
//   - reference: o céu desenhado (o fundo) com o sol a 60° contra a integração numérica do modelo de Hillaire na CPU, em
//     direções acima de 12° de elevação — erro ≤ 5 %;
//   - sunset: um plano branco iluminado só pelo sol (sem o hemisfério) com o sol descendo de 60° a 3°: a razão
//     vermelho/azul da luz cresce sem voltar e a intensidade cai (a atmosfera filtra o sol pela altura);
//   - update: mudar a direção do sol muda o céu no mesmo quadro, sem criar pipeline nem shader;
//   - no-sky: sem `Sky` o fundo é o da limpeza e o hemisfério da 011 continua iluminando.
// Para rodar: `npm run smoke -- sky [--query case=reference]`. Resultado: `SKY SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    Camera,
    createScene,
    DirectionalLight,
    PlaneGeometry,
    Sky,
    StandardMaterial,
    Transform,
} from 'clayflow/web';
import { settle } from './support/extensionScenes';
import { hdrAt, readHdrTexture, type HdrImage } from './support/imageMeasures';
import {
    aerialPerspective,
    earthAtmosphere,
    multipleScattering,
    skyRadiance,
    type Vec3,
} from '../elements/scene/reference/atmosphere';
import { BoxGeometry, FogVolume, nodes } from 'clayflow/web';
import { readTexture } from './support/cloudScenes';
import { materialGraph } from './support/materialScenes';
import { settleFrames } from './support/extensionScenes';
import { luminanceLinear } from './support/images';

function log(msg: string): void {
    console.log(`[sky] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

const SIZE = 256;
/** Intensidade do sol (lux fora da atmosfera) dos casos: a radiância do céu fica em dezenas de nits. */
const SUN_LUX = 1000;

async function skyApp(): Promise<{ app: Application; canvas: HTMLCanvasElement }> {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
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
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    return { app, canvas };
}

function dispose(app: Application, canvas: HTMLCanvasElement): void {
    app.dispose();
    canvas.remove();
}

async function renderHdr(app: Application, ms = 600): Promise<HdrImage> {
    await settle(app, ms);
    app.step(1 / 60);
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    return readHdrTexture(app, texture);
}

/** Direção de propagação da luz do sol a `elevation` graus de altura (azimute em +x). */
function sunTravel(elevation: number): number[] {
    const e = (elevation * Math.PI) / 180;
    return [-Math.cos(e), -Math.sin(e), 0, 0];
}

const sunToward = (elevation: number): Vec3 => {
    const e = (elevation * Math.PI) / 180;
    return [Math.cos(e), Math.sin(e), 0];
};

/** Câmera em perspectiva na origem olhando para `target` (campo de visão `fov`, quadrada). */
function perspectiveCamera(app: Application, target: Vec3, fov: number): void {
    app.world.insert(
        new Camera({ fov, aspect: 1, aspectMode: 'fixed', near: 0.1, far: 100 }).add(
            new Transform({
                position: [0, 0, 0, 1],
                rotation: Transform.lookRotation([0, 0, 0], target),
            }),
        ),
    );
}

/** Direção de mundo do centro do pixel (px, py) na câmera da origem que olha para `target`. */
function pixelDir(px: number, py: number, target: Vec3, fov: number): Vec3 {
    const f = 1 / Math.tan(fov / 2);
    const x = ((px + 0.5) / SIZE) * 2 - 1;
    const y = 1 - ((py + 0.5) / SIZE) * 2;
    const v: Vec3 = [x / f, y / f, -1];
    // Eixos da câmera em mundo (como `Transform.lookRotation`): z = de `target` para a câmera, x = up × z, y = z × x.
    const zl = Math.hypot(...target);
    const z: Vec3 = [-target[0] / zl, -target[1] / zl, -target[2] / zl];
    const xr: Vec3 = [z[2], 0, -z[0]];
    const xl = Math.hypot(...xr);
    const xa: Vec3 = [xr[0] / xl, xr[1] / xl, xr[2] / xl];
    const ya: Vec3 = [
        z[1] * xa[2] - z[2] * xa[1],
        z[2] * xa[0] - z[0] * xa[2],
        z[0] * xa[1] - z[1] * xa[0],
    ];
    const d: Vec3 = [
        xa[0] * v[0] + ya[0] * v[1] + z[0] * v[2],
        xa[1] * v[0] + ya[1] * v[1] + z[1] * v[2],
        xa[2] * v[0] + ya[2] * v[1] + z[2] * v[2],
    ];
    const l = Math.hypot(...d);
    return [d[0] / l, d[1] / l, d[2] / l];
}

async function caseReference(): Promise<void> {
    const { app, canvas } = await skyApp();
    const sun = new DirectionalLight({ direction: sunTravel(60), intensity: SUN_LUX });
    app.world.insert(sun);
    app.world.insert(new Sky({ sun, sunDisk: false, night: [0, 0, 0] }));
    const target: Vec3 = [0.3, 0.8, 0.5];
    const fov = Math.PI / 2;
    perspectiveCamera(app, target, fov);
    const img = await renderHdr(app);
    const atm = earthAtmosphere();
    // Ψms é suave: memorizado numa grade fina de (raio, cosseno do sol), com 64 direções e 32 passos.
    const msCache = new Map<string, Vec3>();
    const ms = (r: number, muS: number): Vec3 => {
        const key = `${Math.round(r * 2)}:${Math.round(muS * 200)}`;
        let v = msCache.get(key);
        if (v === undefined)
            msCache.set(
                key,
                (v = multipleScattering(
                    atm,
                    Math.round(r * 2) / 2,
                    Math.round(muS * 200) / 200,
                    64,
                    32,
                )),
            );
        return v;
    };
    let maxErr = 0;
    let sumErr = 0;
    let n = 0;
    const worst: string[] = [];
    for (let gy = 1; gy < 8; gy++) {
        for (let gx = 1; gx < 8; gx++) {
            const px = Math.floor((gx / 8) * SIZE);
            const py = Math.floor((gy / 8) * SIZE);
            const dir = pixelDir(px, py, target, fov);
            if (dir[1] < Math.sin((12 * Math.PI) / 180)) continue;
            const ref = skyRadiance(atm, 0.2, dir, sunToward(60), 200, ms).map((c) => c * SUN_LUX);
            const got = hdrAt(img, px, py);
            // Erro por canal relativo à luminância (os canais fracos não dominam).
            const err =
                Math.max(...[0, 1, 2].map((k) => Math.abs(got[k]! - ref[k]!)))
                / luminanceLinear(ref);
            maxErr = Math.max(maxErr, err);
            sumErr += err;
            n++;
            if (err > 0.05)
                worst.push(
                    `(${dir.map((x) => x.toFixed(2)).join(',')}): ${got.map((x) => x.toFixed(2)).join(',')} × ${ref.map((x) => x.toFixed(2)).join(',')}`,
                );
        }
    }
    log(
        `reference: ${n} direções, erro máx ${(maxErr * 100).toFixed(2)} %, médio ${((sumErr / n) * 100).toFixed(2)} %${worst.length > 0 ? ` — ${worst.slice(0, 3).join(' | ')}` : ''}`,
    );
    check(n >= 20, `reference: só ${n} direções acima de 12°`);
    check(maxErr <= 0.05, `reference: erro do céu ${(maxErr * 100).toFixed(2)} % > 5 %`);
    dispose(app, canvas);
}

async function caseSunset(): Promise<void> {
    const { app, canvas } = await skyApp();
    app.world.remove(app.defaults.ambient);
    const sun = new DirectionalLight({ direction: sunTravel(60), intensity: SUN_LUX });
    app.world.insert(sun);
    const skyOnly = new Sky({ sun, sunDisk: false });
    app.world.insert(skyOnly);
    app.world.insert(
        new PlaneGeometry({ size: [4, 4] })
            .add(new StandardMaterial({ albedo: [0.8, 0.8, 0.8, 1], roughness: 1 }))
            .add(new Transform()),
    );
    app.world.insert(
        new Camera({ projection: 'orthographic', orthoHeight: 2, near: 0.1, far: 20 }).add(
            new Transform({
                position: [0, 5, 0, 1],
                rotation: Transform.lookRotation([0, 5, 0], [0, 0, 0], [0, 0, -1]),
            }),
        ),
    );
    const ratios: number[] = [];
    const levels: number[] = [];
    for (const e of [60, 30, 10, 3]) {
        sun.data.direction = sunTravel(e);
        // Só o sol ilumina o plano (a medida é a cor dele): a luz do céu nas superfícies (spec 041) desligada.
        skyOnly.setAmbient(false);
        const img = await renderHdr(app, 300);
        const c = hdrAt(img, SIZE / 2, SIZE / 2);
        ratios.push(c[0] / c[2]);
        levels.push(luminanceLinear(c));
    }
    log(
        `sunset: vermelho/azul ${ratios.map((r) => r.toFixed(3)).join(' → ')}; luminância ${levels.map((l) => l.toFixed(2)).join(' → ')}`,
    );
    for (let k = 1; k < ratios.length; k++) {
        check(
            ratios[k]! > ratios[k - 1]!,
            `sunset: vermelho/azul não cresce (${ratios.join(', ')})`,
        );
        check(levels[k]! < levels[k - 1]!, `sunset: a luz não cai (${levels.join(', ')})`);
    }
    dispose(app, canvas);
}

async function caseUpdate(): Promise<void> {
    const { app, canvas } = await skyApp();
    const sun = new DirectionalLight({ direction: sunTravel(60), intensity: SUN_LUX });
    app.world.insert(sun);
    app.world.insert(new Sky({ sun, sunDisk: false }));
    const target: Vec3 = [0, 1, 0.001];
    perspectiveCamera(app, target, Math.PI / 3);
    const before = hdrAt(await renderHdr(app), SIZE / 2, SIZE / 2);
    const core = app.core as unknown as { create: (spec: { kind?: string }) => unknown };
    const create = core.create.bind(core);
    let compiled = 0;
    core.create = (spec) => {
        if (spec.kind === 'pipeline' || spec.kind === 'shader') compiled++;
        return create(spec);
    };
    sun.data.direction = sunTravel(5);
    app.step(1 / 60);
    const texture = app.resources.textureOf(app.defaults.targets, 'color')!;
    const after = hdrAt(await readHdrTexture(app, texture), SIZE / 2, SIZE / 2);
    core.create = create;
    const changed = Math.abs(after[2] - before[2]) / before[2];
    log(
        `update: zênite azul ${before[2].toFixed(3)} → ${after[2].toFixed(3)} no quadro seguinte (Δ ${(changed * 100).toFixed(1)} %), ${compiled} pipelines/shaders criados`,
    );
    check(changed > 0.2, `update: o céu não mudou no quadro seguinte (Δ ${changed})`);
    check(compiled === 0, `update: ${compiled} pipelines/shaders criados ao mover o sol`);
    dispose(app, canvas);
}

async function caseNoSky(): Promise<void> {
    const { app, canvas } = await skyApp();
    app.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], intensity: 0 }));
    app.world.insert(
        new PlaneGeometry({ size: [1, 1] })
            .add(new StandardMaterial({ albedo: [0.8, 0.8, 0.8, 1], roughness: 1 }))
            .add(new Transform()),
    );
    app.world.insert(
        new Camera({ projection: 'orthographic', orthoHeight: 2, near: 0.1, far: 20 }).add(
            new Transform({
                position: [0, 5, 0, 1],
                rotation: Transform.lookRotation([0, 5, 0], [0, 0, 0], [0, 0, -1]),
            }),
        ),
    );
    const img = await renderHdr(app);
    const corner = hdrAt(img, 2, 2);
    const center = hdrAt(img, SIZE / 2, SIZE / 2);
    const clear = [0.05, 0.07, 0.12];
    const clearErr = Math.max(...clear.map((c, k) => Math.abs(corner[k]! - c)));
    log(
        `no-sky: fundo ${corner.map((x) => x.toFixed(3)).join(',')} (limpeza 0,05/0,07/0,12), plano pelo hemisfério ${center.map((x) => x.toFixed(3)).join(',')}`,
    );
    check(clearErr < 2e-3, `no-sky: fundo ${corner.join(',')} não é a cor da limpeza`);
    check(center[1] > 0.02, `no-sky: o hemisfério não ilumina o plano (${center.join(',')})`);
    dispose(app, canvas);
}

// ── perspectiva aérea (spec 041) ─────────────────────────────────────────────────────────────────────────────────────

const aerialAtm = earthAtmosphere();
const aerialMsCache = new Map<string, Vec3>();
function aerialMs(r: number, muS: number): Vec3 {
    const key = `${Math.round(r * 2)}:${Math.round(muS * 100)}`;
    let v = aerialMsCache.get(key);
    if (v === undefined) {
        v = multipleScattering(
            aerialAtm,
            Math.round(r * 2) / 2,
            Math.round(muS * 100) / 100,
            32,
            24,
        );
        aerialMsCache.set(key, v);
    }
    return v;
}

async function caseAerialTable(): Promise<void> {
    // A tabela 32³ da perspectiva aérea contra a referência f64 até a distância de cada fatia (T009).
    const { app, canvas } = await skyApp();
    const sun = new DirectionalLight({ direction: sunTravel(35), intensity: SUN_LUX });
    app.world.insert(sun);
    app.world.insert(new Sky({ sun, sunDisk: false, night: [0, 0, 0] }));
    const target: Vec3 = [1, 0.15, 0.3];
    const fov = Math.PI / 2;
    perspectiveCamera(app, target, fov);
    await renderHdr(app);
    const sky = app.world.queryBySchemaName(Sky.schema.name)[0];
    const skyRes =
        sky === undefined
            ? undefined
            : (app.world.resourcesOf(sky).find((r) => r instanceof Sky) as Sky | undefined);
    if (skyRes === undefined) throw new Error('aerial-table: céu não achado');
    const ts = app.resources.textureOf(skyRes, 'aerial');
    const tt = app.resources.textureOf(skyRes, 'aerialTransmittance');
    if (ts === undefined || tt === undefined) throw new Error('aerial-table: tabelas não alocadas');
    const S = await readTexture(app, ts, 'rgba16float');
    const T = await readTexture(app, tt, 'rgba16float');
    let worstT = 0;
    let worstS = 0;
    let n = 0;
    for (const [i, j] of [
        [4, 4],
        [16, 16],
        [28, 6],
        [8, 26],
        [24, 24],
    ] as const)
        for (const k of [3, 9, 15, 21, 27, 31]) {
            const dir = pixelDir(
                ((i + 0.5) / 32) * SIZE - 0.5,
                ((j + 0.5) / 32) * SIZE - 0.5,
                target,
                fov,
            );
            const d = 32 * ((k + 1) / 32) ** 2;
            const ref = aerialPerspective(aerialAtm, 0.2, dir, sunToward(35), d, 96, aerialMs);
            const o = ((k * 32 + j) * 32 + i) * 4;
            for (let c = 0; c < 3; c++) {
                worstT = Math.max(
                    worstT,
                    Math.abs(T.data[o + c]! - ref.transmittance[c]!) / ref.transmittance[c]!,
                );
                const lum = (ref.scattered[0] + ref.scattered[1] + ref.scattered[2]) / 3;
                worstS = Math.max(
                    worstS,
                    Math.abs(S.data[o + c]! - ref.scattered[c]!) / Math.max(lum, 1e-9),
                );
            }
            n++;
        }
    log(
        `aerial-table: ${n} texels — pior transmitância ${(worstT * 100).toFixed(2)} %, pior luz espalhada ${(worstS * 100).toFixed(2)} %`,
    );
    check(
        worstT <= 0.05 && worstS <= 0.05,
        `aerial-table: tabela a ${(worstT * 100).toFixed(1)} % / ${(worstS * 100).toFixed(1)} % da referência`,
    );
    dispose(app, canvas);
}

/** Uma placa emissiva (só emissão, sem reflexo) de `size` m centrada em `center`, de frente para a origem. */
function emissivePanel(app: Application, center: Vec3, size: number, luminance: number): void {
    app.world.insert(
        new BoxGeometry({ size: [size * 0.02, size, size] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [...center, 1] }))
            .add(
                materialGraph(
                    { e: nodes.bsdf.emission.with({ color: [1, 1, 1], luminance }) },
                    [],
                    'e.value',
                ),
            ),
    );
}

async function caseAerialGeometry(): Promise<void> {
    // Superfícies a 2, 10 e 30 km: duas placas emissivas por distância (100 e 300 nits) dão a transmitância e a luz
    // espalhada da atmosfera até elas (C = E·T + S), contra a referência f64 (SC-009, ≤ 5 %); com névoa perto da
    // câmera, as três distâncias perdem a mesma fração (a névoa na frente da atmosfera, R13).
    for (const fog of [false, true]) {
        const { app, canvas } = await skyApp();
        app.world.remove(app.defaults.ambient);
        const sun = new DirectionalLight({ direction: sunTravel(35), intensity: SUN_LUX });
        app.world.insert(sun);
        app.world.insert(new Sky({ sun, sunDisk: false, night: [0, 0, 0] }));
        const fov = Math.PI / 6;
        const target: Vec3 = [1, 0.03, 0];
        app.world.insert(
            new Camera({ fov, aspect: 1, aspectMode: 'fixed', near: 1, far: 100_000 }).add(
                new Transform({
                    position: [0, 0, 0, 1],
                    rotation: Transform.lookRotation([0, 0, 0], target),
                }),
            ),
        );
        if (fog) app.world.insert(new FogVolume({ shape: { box: [40, 40, 40] }, density: 0.01 }));
        const distances = [2000, 10_000, 30_000];
        const rows = [0.06, 0.0, -0.06];
        distances.forEach((d, k) => {
            for (const [side, lum] of [
                [-0.05, 100],
                [0.05, 300],
            ] as const)
                emissivePanel(app, [d, d * (0.03 + rows[k]!), d * side], d * 0.04, lum);
        });
        await settleFrames(app, 40);
        const img = await renderHdr(app, 200);
        const results: string[] = [];
        let worst = 0;
        const fogT: number[] = [];
        distances.forEach((d, k) => {
            const at = (side: number): [number, number, number] => {
                const p: Vec3 = [d, d * (0.03 + rows[k]!), d * side];
                const dir = [p[0], p[1], p[2]];
                const l = Math.hypot(...dir);
                const v: Vec3 = [dir[0]! / l, dir[1]! / l, dir[2]! / l];
                // Pixel do ponto: projeção pela câmera que olha `target`.
                const f = 1 / Math.tan(fov / 2);
                const zl = Math.hypot(...target);
                const z: Vec3 = [-target[0] / zl, -target[1] / zl, -target[2] / zl];
                const xr: Vec3 = [z[2], 0, -z[0]];
                const xl = Math.hypot(...xr);
                const xa: Vec3 = [xr[0] / xl, xr[1] / xl, xr[2] / xl];
                const ya: Vec3 = [
                    z[1] * xa[2] - z[2] * xa[1],
                    z[2] * xa[0] - z[0] * xa[2],
                    z[0] * xa[1] - z[1] * xa[0],
                ];
                const cx = v[0] * xa[0] + v[1] * xa[1] + v[2] * xa[2];
                const cy = v[0] * ya[0] + v[1] * ya[1] + v[2] * ya[2];
                const cz = -(v[0] * z[0] + v[1] * z[1] + v[2] * z[2]);
                const px = Math.round(((cx / cz) * f * 0.5 + 0.5) * SIZE - 0.5);
                const py = Math.round((0.5 - (cy / cz) * f * 0.5) * SIZE - 0.5);
                return hdrAt(img, px, py) as [number, number, number];
            };
            const c1 = at(-0.05);
            const c2 = at(0.05);
            const dir: Vec3 = (() => {
                const l = Math.hypot(d, d * (0.03 + rows[k]!));
                return [d / l, (d * (0.03 + rows[k]!)) / l, 0];
            })();
            const ref = aerialPerspective(
                aerialAtm,
                0.2,
                dir,
                sunToward(35),
                d / 1000,
                96,
                aerialMs,
            );
            const T = [0, 1, 2].map((c) => (c2[c]! - c1[c]!) / 200);
            const S = [0, 1, 2].map((c) => c1[c]! - 100 * T[c]!);
            const sRef = ref.scattered.map((v) => v * SUN_LUX);
            const sLum = (sRef[0]! + sRef[1]! + sRef[2]!) / 3;
            if (!fog)
                for (let c = 0; c < 3; c++) {
                    worst = Math.max(
                        worst,
                        Math.abs(T[c]! - ref.transmittance[c]!) / ref.transmittance[c]!,
                    );
                    worst = Math.max(worst, Math.abs(S[c]! - sRef[c]!) / Math.max(sLum, 1e-6));
                }
            fogT.push(T[1]! / ref.transmittance[1]!);
            results.push(
                `${d / 1000} km: T ${T.map((v) => v.toFixed(3)).join('/')} (ref ${ref.transmittance.map((v) => v.toFixed(3)).join('/')}), S ${S.map((v) => v.toFixed(2)).join('/')} (ref ${sRef.map((v) => v.toFixed(2)).join('/')})`,
            );
        });
        log(`aerial-geometry${fog ? ' com névoa' : ''}: ${results.join(' | ')}`);
        if (!fog)
            check(
                worst <= 0.05,
                `aerial-geometry: a ${(worst * 100).toFixed(1)} % da referência (SC-009)`,
            );
        else {
            const spread = Math.max(...fogT) / Math.min(...fogT) - 1;
            log(
                `aerial-geometry com névoa: fração que a névoa deixa passar por distância ${fogT.map((v) => v.toFixed(3)).join('/')} (diferença ${(spread * 100).toFixed(1)} %)`,
            );
            check(
                spread <= 0.05,
                `aerial-geometry: a névoa na frente atenua as distâncias de forma diferente (${(spread * 100).toFixed(1)} %)`,
            );
        }
        dispose(app, canvas);
    }
}

const CASES: Record<string, () => Promise<void>> = {
    reference: caseReference,
    sunset: caseSunset,
    update: caseUpdate,
    'no-sky': caseNoSky,
    'aerial-table': caseAerialTable,
    'aerial-geometry': caseAerialGeometry,
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('SKY SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
