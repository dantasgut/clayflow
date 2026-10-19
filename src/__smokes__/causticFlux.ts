// Spec 034 — Smoke da conservação do fluxo das cáusticas por fótons (US2; SC-003).
//
// Uma placa de vidro (IOR 1,5, lisa, sem absorção) paralela ao receptor, sob o sol: a luz que chega ao receptor embaixo
// dela é toda transmitida pelas duas faces — a fração de Fresnel T = (1 − R(θ))² (θ o ângulo de incidência; a reflexão
// múltipla entre as faces soma < 0,2 %). A radiância do receptor sob a placa contra a dele ao lado, descoberto, é T a
// ≤ 5 %, em três receptores: o chão em y = 0 (múltiplo inteiro da célula das cáusticas), o chão a 1/4 de célula acima
// e uma rampa a 30°.
// Para rodar: `npm run smoke -- causticFlux [--query case=floor]`. Resultado: `CAUSTICFLUX SMOKE PASSED` ou `FAIL: …`.
import {
    BoxGeometry,
    GlobalIllumination,
    StandardMaterial,
    Transform,
    type Application,
} from 'clayflow';
import { settle } from './support/extensionScenes';
import { buildGiScene, giApp, projectPoint, type GiScene, type Vec3 } from './support/giScenes';
import { hdrLuminance, readHdrTexture, type HdrImage } from './support/imageMeasures';
import { closureFn } from './support/materialScenes';

function log(msg: string): void {
    console.log(`[causticFlux] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

const SIZE = { width: 640, height: 400 } as const;
const IOR = 1.5;
/** Espaçamento das sondas; a célula das cáusticas é 1/16 dele. */
const PROBE_SPACING = 0.32;
const CELL = PROBE_SPACING / 16;

const GLASS = `return closure_add(
        closure_dielectric(data.ior, vec3f(1.0), 0.0, 0.0, vec3f(0.0)),
        closure_transmission(data.ior, vec3f(1.0), 0.0, 0.0, 0.0),
    );`;

/** Refletância de Fresnel sem polarização de um dielétrico (do meio 1 para o de índice `n`), cosseno de incidência `c`. */
function fresnel(n: number, c: number): number {
    const s = Math.sqrt(Math.max(0, 1 - c * c)) / n;
    if (s >= 1) return 1;
    const ct = Math.sqrt(1 - s * s);
    const rs = (c - n * ct) / (c + n * ct);
    const rp = (n * c - ct) / (n * c + ct);
    return (rs * rs + rp * rp) / 2;
}

/** Rotação de `angle` (rad) em torno de x, como quaternion. */
const aroundX = (angle: number): number[] => [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];

/** Ponto local (x, 0, z) do receptor girado de `angle` em torno de x, a `height` pela normal. */
function onReceiver(x: number, z: number, angle: number, height: number): Vec3 {
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    return [x, -z * s + height * c, z * c + height * s];
}

/** Média da luminância numa janela de (2r+1)² pixels em volta da projeção de `p`. */
function windowMean(img: HdrImage, scene: GiScene, p: Vec3, r: number): number {
    const [cx, cy] = projectPoint(scene, img.width, img.height, p).map(Math.round) as [
        number,
        number,
    ];
    let s = 0;
    let n = 0;
    for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
            s += hdrLuminance(img, x, y);
            n++;
        }
    return s / n;
}

async function readTarget(app: Application): Promise<HdrImage> {
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    return readHdrTexture(app, texture);
}

/**
 * O receptor (uma placa grossa cujo topo passa pela origem local a `lift` de altura, girada de `angle` em torno de x)
 * com a placa de vidro paralela a 0,35 m e o sol a pino: a razão sob a placa / ao lado contra T.
 */
async function receiver(label: string, lift: number, angle: number): Promise<void> {
    const scene: GiScene = {
        slabs: [],
        sun: { direction: [0, -1, 0], illuminance: 100 },
        camera: { position: [0, 1.6, 1.6], target: [0, 0, 0], fovY: Math.PI / 4 },
        probeCenter: [0, 0.4, 0],
        probeSpacing: PROBE_SPACING,
        regions: new Map(),
    };
    const { app, canvas } = await giApp(SIZE.width, SIZE.height, engineErrors);
    app.events.on('deviceLost', (e) => engineErrors.push(`deviceLost: ${JSON.stringify(e)}`));
    buildGiScene(app, scene, SIZE.width / SIZE.height);
    const rotation = aroundX(angle);
    const center = onReceiver(0, 0, angle, lift - 0.025);
    app.world.insert(
        new BoxGeometry({ size: [3, 0.05, 3] })
            .add(new StandardMaterial({ albedo: [0.8, 0.8, 0.8, 1], roughness: 1 }))
            .add(new Transform({ position: [...center, 1], rotation })),
    );
    const plate = onReceiver(-0.35, 0, angle, lift + 0.35);
    app.world.insert(
        new BoxGeometry({ size: [0.6, 0.02, 0.9] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [...plate, 1], rotation }))
            .add(closureFn(GLASS, ['specular', 'transmission'], { ior: 'f32' }, { ior: IOR })),
    );
    const ready = { revision: -1, at: 0 };
    app.events.on('globalIlluminationReady', (e) => {
        ready.revision = e.revision;
        ready.at = performance.now();
    });
    app.world.insert(
        new GlobalIllumination({
            quality: 'medium',
            bounces: 3,
            probeSpacing: PROBE_SPACING,
            cascades: 1,
            center: scene.probeCenter,
        }),
    );
    await settle(app, 2500);
    const limit = performance.now() + 120000;
    while (ready.revision < 0 || performance.now() - ready.at < 1000) {
        if (performance.now() > limit)
            throw new Error('a iluminação global não ficou pronta em 120 s');
        await settle(app, 100);
    }
    for (let i = 0; i < 300; i++) {
        app.step(1 / 60);
        if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
    }
    const img = await readTarget(app);
    app.dispose();
    canvas.remove();
    // Sob a placa (a sombra dela com o sol a pino) e ao lado, na mesma altura do receptor.
    const under = windowMean(img, scene, onReceiver(-0.35, 0, angle, lift), 4);
    const open = windowMean(img, scene, onReceiver(0.45, 0, angle, lift), 4);
    const c = Math.cos(angle);
    const t = (1 - fresnel(IOR, c)) ** 2;
    const ratio = under / open;
    log(
        `${label}: sob a placa ${ratio.toFixed(3)} do chão descoberto (T = ${t.toFixed(3)}; ${((ratio / t) * 100).toFixed(1)} %)`,
    );
    check(
        Math.abs(ratio / t - 1) <= 0.05,
        `${label}: sob a placa ${(ratio / t).toFixed(3)}× a transmitância de Fresnel (±5 %)`,
    );
}

const CASES: Record<string, () => Promise<void>> = {
    floor: () => receiver('chão em y = 0', 0, 0),
    offset: () => receiver('chão a 1/4 de célula', CELL / 4, 0),
    ramp: () => receiver('rampa a 30°', 0, Math.PI / 6),
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('CAUSTICFLUX SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
