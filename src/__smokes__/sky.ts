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
} from 'clayflow';
import { settle } from './support/extensionScenes';
import { hdrAt, readHdrTexture, type HdrImage } from './support/imageMeasures';
import {
    earthAtmosphere,
    multipleScattering,
    skyRadiance,
    type Vec3,
} from '../elements/scene/reference/atmosphere';

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
            const lum = (c: readonly number[]): number =>
                0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
            // Erro por canal relativo à luminância (os canais fracos não dominam).
            const err = Math.max(...[0, 1, 2].map((k) => Math.abs(got[k]! - ref[k]!))) / lum(ref);
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
    app.world.insert(new Sky({ sun, sunDisk: false }));
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
        const img = await renderHdr(app, 300);
        const c = hdrAt(img, SIZE / 2, SIZE / 2);
        ratios.push(c[0] / c[2]);
        levels.push(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
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
    // A limpeza padrão em radiância linear: o azul-marinho de tela (0,05; 0,07; 0,12) convertido de sRGB.
    const clear = [0.05, 0.07, 0.12].map((c) =>
        c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    const clearErr = Math.max(...clear.map((c, k) => Math.abs(corner[k]! - c)));
    log(
        `no-sky: fundo ${corner.map((x) => x.toFixed(3)).join(',')} (limpeza ${clear.map((x) => x.toFixed(4)).join('/')}), plano pelo hemisfério ${center.map((x) => x.toFixed(3)).join(',')}`,
    );
    check(clearErr < 2e-3, `no-sky: fundo ${corner.join(',')} não é a cor da limpeza`);
    check(center[1] > 0.02, `no-sky: o hemisfério não ilumina o plano (${center.join(',')})`);
    dispose(app, canvas);
}

const CASES: Record<string, () => Promise<void>> = {
    reference: caseReference,
    sunset: caseSunset,
    update: caseUpdate,
    'no-sky': caseNoSky,
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
