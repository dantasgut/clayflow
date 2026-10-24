// Spec 034 — Smoke do piso de limites do dispositivo (T003; FR-034, SC-003).
//
// Abre as cenas que mais ligam recursos com o teto nos limites portáteis do motor (`limitsCeiling` =
// `ENGINE_PORTABLE_LIMITS`, o mínimo comum dos perfis de referência, spec 037: buffers e texturas de storage por
// estágio, anexos de cor e bytes por amostra) — numa GPU maior o resultado é o do piso, então o que não cabe falha em
// todas:
//   - giGlassFog: cômodo com janela, iluminação global `medium`, uma placa de vidro (dielétrico + transmissão) e névoa;
//   - giWater: o tanque de água por campo de distância com a iluminação global `medium`.
// Falha com qualquer erro de limite (`limit-exceeded`), `globalIlluminationUnsupported`, `extensionRejected`, erro do
// motor ou erro de página, ou se a GI não ficar pronta.
// Para rodar: `npm run smoke -- deviceFloor [--query case=giWater]`. Resultado: `DEVICEFLOOR SMOKE PASSED` ou `FAIL: …`.
import {
    BoxGeometry,
    FogVolume,
    GlobalIllumination,
    StandardMaterial,
    Transform,
    type Application,
} from 'clayflow';
import { ENGINE_PORTABLE_LIMITS } from '../core/gpu/GpuContext';
import { settle } from './support/extensionScenes';
import { buildGiScene, giApp, windowRoom } from './support/giScenes';
import { closureFn } from './support/materialScenes';
import { waterScene } from './support/waterScene';

function log(msg: string): void {
    console.log(`[deviceFloor] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null)
        el.textContent += `${msg}
`;
}

/** O piso validado: os limites portáteis do motor. */
const FLOOR = ENGINE_PORTABLE_LIMITS;

const failures: string[] = [];

window.addEventListener('error', (e) => {
    failures.push(`pageerror: ${e.message}`);
});
window.addEventListener('unhandledrejection', (e) => {
    failures.push(`pageerror: ${String(e.reason)}`);
});

/** Avança até a GI anunciar os kernels prontos e mais 60 quadros; devolve os erros da cena. */
async function exercise(name: string, app: Application, errors: string[]): Promise<void> {
    const ready = { revision: -1, at: 0 };
    app.events.on('globalIlluminationReady', (e) => {
        ready.revision = e.revision;
        ready.at = performance.now();
    });
    const limit = performance.now() + 120000;
    await settle(app, 2500);
    while (errors.length === 0 && (ready.revision < 0 || performance.now() - ready.at < 1000)) {
        if (performance.now() > limit) {
            errors.push('a iluminação global não ficou pronta em 120 s');
            break;
        }
        await settle(app, 100);
    }
    for (let i = 0; i < 60; i++) app.step(1 / 60);
    await settle(app, 200);
    const limits = app.capabilities.limits.maxStorageBuffersPerShaderStage;
    log(`${name}: storage por estágio no device ${limits}; ${errors.length} erro(s)`);
    for (const e of new Set(errors)) failures.push(`${name}: ${e}`);
}

async function giGlassFog(): Promise<void> {
    const errors: string[] = [];
    const { app, canvas } = await giApp(480, 300, errors, { limitsCeiling: FLOOR });
    const scene = windowRoom();
    buildGiScene(app, scene, 480 / 300);
    app.world.insert(
        new BoxGeometry({ size: [1, 1.5, 0.02] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, 1, 0.3, 1] }))
            .add(
                closureFn(
                    'return closure_add(closure_dielectric(1.5, vec3f(1.0), 0.0, 0.0, vec3f(0.0)), closure_transmission(1.5, vec3f(1.0), 0.0, 0.0, 0.0));',
                    ['specular', 'transmission'],
                ),
            ),
    );
    app.world.insert(
        new FogVolume({
            shape: { box: [4, 2.5, 4] },
            center: [0, 1.25, 0],
            density: 0.15,
            albedo: [0.9, 0.9, 0.9],
            anisotropy: 0.3,
        }),
    );
    app.world.insert(
        new GlobalIllumination({
            quality: 'medium',
            probeSpacing: scene.probeSpacing ?? 0.3,
            center: scene.probeCenter,
        }),
    );
    await exercise('giGlassFog', app, errors);
    app.dispose();
    canvas.remove();
}

async function giWater(): Promise<void> {
    const errors: string[] = [];
    const { app, canvas } = await giApp(480, 300, errors, { limitsCeiling: FLOOR });
    waterScene(app, { width: 480, height: 300 });
    app.world.insert(new GlobalIllumination({ quality: 'medium', center: [0, 0.3, 0] }));
    await exercise('giWater', app, errors);
    app.dispose();
    canvas.remove();
}

const CASES: Record<string, () => Promise<void>> = { giGlassFog, giWater };

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('DEVICEFLOOR SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
