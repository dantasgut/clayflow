// Spec 010 — Smoke das superfícies paramétricas completas: colisor derivado da superfície (altura e distância com
// sinal, construído na GPU por passo), geometria diferencial no material, malha adaptativa com desenho indireto e
// normais da geometria paramétrica de CPU.
//
// Cada caso monta uma cena pequena, avança por passos fixos e lê de volta (só aqui, para medir) o que precisa:
//   - campo: o campo de alturas do vale contra a fórmula (erro de construção);
//   - terreno com fluidos: SPH, PBF e MPM sobre o vale — nenhuma partícula abaixo da superfície, centróide no vale
//     (SC-002).
// O estado de cada caso é comparado bit a bit (hash) com a fixture `parametricSurfaces-<perfil>.json`; `--record` roda
// cada caso duas vezes (exige determinismo) e grava.
//
// Para rodar: `npm run smoke -- parametricSurfaces [--record] [--query case=field.fluids]`. Resultado:
// `PARAMETRICSURFACES SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    createScene,
    DirectionalLight,
    GravityField,
    Camera,
    Transform,
} from 'clayflow';
import * as clayflow from 'clayflow';
import { settle } from './support/extensionScenes';
import { gpuProfile, readJsonFixture, recording, writeJsonFixture } from './support/fixtures';
import { hashBytes } from './support/fluidMeasures';
import { block } from './support/particleScenes';
import {
    insertValley,
    readField,
    readPositions,
    VALLEY,
    valleyHeight,
} from './support/surfaceScenes';

function log(msg: string): void {
    console.log(`[parametricSurfaces] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

/** Erros capturados dos estágios: qualquer um reprova o smoke. */
const engineErrors: string[] = [];

async function createApp(size = 64): Promise<Application> {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
    });
    app.events.on('engineError', (e) => {
        engineErrors.push(`${e.stage}/${e.filter}: ${e.message}`);
    });
    app.events.on('extensionRejected', (e) => {
        engineErrors.push(`extensionRejected ${e.point}:${e.line}: ${e.message}`);
    });
    return app;
}

/** Câmera e luz mínimas (o desenho entra nas cenas; as medidas são da física). */
function view(app: Application): void {
    app.world.insert(
        new Camera({ fov: 50, near: 0.05, far: 50 }).add(
            new Transform({ position: [0, 2.5, 4.5, 1] }),
        ),
    );
    app.world.insert(new DirectionalLight({ direction: [-0.3, -1, -0.4, 0], castShadow: true }));
}

/** Resultado de um caso: estados finais (hash por rótulo), medidas e falhas. */
interface CaseResult {
    readonly hashes: Record<string, string>;
    readonly measures: Record<string, number>;
    readonly failures: string[];
}

type Case = () => Promise<CaseResult>;

function collector() {
    const hashes: Record<string, string> = {};
    const measures: Record<string, number> = {};
    const failures: string[] = [];
    return {
        hash(label: string, bytes: Uint8Array): void {
            hashes[label] = hashBytes(bytes);
        },
        measure(name: string, value: number): number {
            measures[name] = value;
            return value;
        },
        check(ok: boolean, message: string): void {
            if (!ok) failures.push(message);
        },
        result(): CaseResult {
            return { hashes, measures, failures };
        },
    };
}

/** Avança `steps` passos fixos de 1/60 s. */
function run(app: Application, steps: number): void {
    for (let i = 0; i < steps; i++) app.step(1 / 60);
}

/** Bytes de uma lista de posições (para o hash). */
function bytesOf(points: readonly (readonly number[])[]): Uint8Array {
    return new Uint8Array(Float32Array.from(points.flat()).buffer);
}

type FluidAlgorithm = 'SPH' | 'PBF' | 'MPM';

const FLUID_SCHEMA: Record<FluidAlgorithm, clayflow.StructSchema> = {
    SPH: clayflow.SPHSchema,
    PBF: clayflow.PBFSchema,
    MPM: clayflow.MPMFluidSchema,
};

/** Penetração tolerada nos contatos de corpos rígidos (a do solver, como no chão das outras cenas). */
const CONTACT_SLOP = 0.005;

/** 50 corpos (esferas e caixas alternadas) numa grade 7 × 7 + 1 sobre o vale, soltos de 0,4 m. */
function dropBodies(app: Application): { radius: number; half: number } {
    const radius = 0.1;
    const half = 0.08;
    for (let i = 0; i < 50; i++) {
        const x = ((i % 7) - 3) * 0.32 + (i >= 49 ? 0.16 : 0);
        const z = ((Math.floor(i / 7) % 7) - 3) * 0.32;
        const position: [number, number, number] = [
            x,
            valleyHeight(x, z) + 0.4 + 0.02 * (i % 3),
            z,
        ];
        app.world.insert(
            i % 2 === 0
                ? new clayflow.RigidBody({ shape: 'sphere', radius, mass: 1, position })
                : new clayflow.RigidBody({
                      shape: 'box',
                      halfExtents: [half, half, half],
                      mass: 1,
                      position,
                  }),
        );
    }
    return { radius, half };
}

const CASES: Record<string, Case> = {
    /** Campo de alturas do vale contra a fórmula: erro nos nós cobertos, caixa e cópias. */
    async field() {
        const c = collector();
        const app = await createApp();
        const { id, collider } = insertValley(app, clayflow);
        await settle(app);
        run(app, 1);
        const field = await readField(app, clayflow, id, collider);
        app.dispose();
        const n = collider.data.nx;
        let worst = 0;
        let uncovered = 0;
        for (let iz = 0; iz < collider.data.nz; iz++)
            for (let ix = 0; ix < n; ix++) {
                const h = field.values[ix + n * iz]!;
                if (h <= -1e38) {
                    uncovered++;
                    continue;
                }
                const x = field.lo[0]! + (ix * (field.hi[0]! - field.lo[0]!)) / (n - 1);
                const z =
                    field.lo[2]! + (iz * (field.hi[2]! - field.lo[2]!)) / (collider.data.nz - 1);
                worst = Math.max(worst, Math.abs(h - valleyHeight(x, z)));
            }
        c.measure('cópias construídas', field.built);
        c.measure('nós sem altura', uncovered);
        const err = c.measure('erro do campo (m)', worst);
        c.check(field.built === 1, `cópias construídas ${field.built} (esperado 1, vale parado)`);
        c.check(uncovered === 0, `${uncovered} nós sem altura dentro do vale`);
        // Cordas da amostragem 128² num vale de curvatura 2·0,8/1,6²: erro de corda ≈ κ·h²/8 ≈ 1e-4 m.
        c.check(err < 2e-3, `campo de alturas a ${err} m da fórmula`);
        c.check(
            Math.abs(field.lo[0]! + VALLEY.half) < 1e-4
                && Math.abs(field.hi[2]! - VALLEY.half) < 1e-4,
            `caixa do campo ${field.lo.join(',')} → ${field.hi.join(',')}`,
        );
        c.hash('field', new Uint8Array(field.values.buffer));
        return c.result();
    },

    /** 50 corpos rígidos sobre o vale por 6 s: nenhum centro abaixo da superfície além da tolerância, ≥ 95 % em repouso (SC-001). */
    async bodies() {
        const c = collector();
        const app = await createApp();
        view(app);
        app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
        insertValley(app, clayflow);
        const { radius } = dropBodies(app);
        await settle(app);
        run(app, 360);
        const pos = await readPositions(app, clayflow.LCPSchema);
        const vel = await readPositions(app, clayflow.LCPSchema, 'vel');
        app.dispose();
        let below = 0;
        let resting = 0;
        let sphereGap = Infinity;
        pos.forEach((p, i) => {
            const clearance = p[1] - valleyHeight(p[0], p[2]);
            if (clearance < -CONTACT_SLOP) below++;
            if (i % 2 === 0) sphereGap = Math.min(sphereGap, clearance - radius);
            if (Math.hypot(...vel[i]!) < 0.05) resting++;
        });
        c.measure('corpos', pos.length);
        c.measure('centros abaixo da superfície', below);
        c.measure('em repouso (%)', (100 * resting) / pos.length);
        c.measure('menor folga vertical das esferas (m)', sphereGap);
        c.check(pos.length === 50, `${pos.length} corpos (esperado 50)`);
        c.check(below === 0, `${below} corpos abaixo da superfície`);
        c.check(resting >= 0.95 * pos.length, `só ${resting} de ${pos.length} em repouso`);
        // Esfera apoiada: o centro fica a ≥ r da superfície na vertical (mais na encosta), menos a tolerância.
        c.check(sphereGap > -CONTACT_SLOP, `esfera afundada ${sphereGap} m na superfície`);
        c.check(
            pos.every((p) => p.every(Number.isFinite)),
            'valores não finitos',
        );
        c.hash('bodies', bytesOf(pos));
        return c.result();
    },

    /** SPH, PBF e MPM sobre o vale: nenhuma partícula abaixo, centróide no vale (SC-002). */
    async fluids() {
        const c = collector();
        for (const algorithm of ['SPH', 'PBF', 'MPM'] as const) {
            const app = await createApp();
            view(app);
            app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
            insertValley(app, clayflow);
            const spacing = clayflow.ParticleMaterial.defaults.particleSpacing;
            const start = block(512, spacing, [0.5, -0.2, -0.2], 7);
            app.world.insert(
                new clayflow.FluidBody({ algorithm, position: start.flat() }).add(
                    new clayflow.PointSpriteMaterial({
                        color: [0.2, 0.5, 1, 1],
                        radius: spacing / 2,
                    }),
                ),
            );
            await settle(app);
            run(app, 240);
            const pos = await readPositions(app, FLUID_SCHEMA[algorithm]);
            app.dispose();
            let below = 0;
            let worst = 0;
            const mean = [0, 0, 0];
            for (const p of pos) {
                const depth = valleyHeight(p[0], p[2]) - p[1];
                worst = Math.max(worst, depth);
                if (depth > spacing / 2) below++;
                for (let k = 0; k < 3; k++) mean[k]! += p[k]! / pos.length;
            }
            // Altura média do vale na área (|x|, |z| < 1,6): ∫ = depth·(2/3)·half²/r² − depth.
            const meanTerrain =
                (VALLEY.depth * (2 / 3) * VALLEY.half ** 2) / VALLEY.r ** 2 - VALLEY.depth;
            c.measure(`${algorithm}: partículas abaixo`, below);
            c.measure(`${algorithm}: maior profundidade sob a superfície (m)`, worst);
            c.measure(`${algorithm}: centróide y`, mean[1]!);
            c.measure(`${algorithm}: centróide xz`, Math.hypot(mean[0]!, mean[2]!));
            c.check(below === 0, `${algorithm}: ${below} partículas abaixo da superfície`);
            c.check(
                mean[1]! < meanTerrain,
                `${algorithm}: centróide y ${mean[1]} não desceu abaixo da altura média ${meanTerrain}`,
            );
            c.check(
                pos.every((p) => p.every(Number.isFinite)),
                `${algorithm}: valores não finitos`,
            );
            c.hash(algorithm, bytesOf(pos));
        }
        return c.result();
    },
};

interface Manifest {
    readonly profile: string;
    readonly cases: Record<string, Record<string, string>>;
}

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    const names = Object.keys(CASES).filter((n) => only === null || only.split('.').includes(n));
    const failures: string[] = [];
    const hashes: Record<string, Record<string, string>> = {};
    let profile = 'unknown';
    {
        const probe = await createApp();
        profile = gpuProfile(probe);
        probe.dispose();
    }
    for (const name of names) {
        const first = await CASES[name]!();
        for (const [k, v] of Object.entries(first.measures))
            log(`${name}: ${k} = ${Number.isInteger(v) ? v : v.toPrecision(4)}`);
        failures.push(...first.failures.map((f) => `${name}: ${f}`));
        if (recording()) {
            const second = await CASES[name]!();
            for (const [k, v] of Object.entries(first.hashes)) {
                if (second.hashes[k] !== v) failures.push(`${name}/${k}: não determinístico`);
            }
        }
        hashes[name] = first.hashes;
    }
    const fixture = `parametricSurfaces-${profile}.json`;
    if (recording()) {
        if (failures.length === 0 && engineErrors.length === 0) {
            const previous = await readJsonFixture<Manifest>(fixture);
            await writeJsonFixture(fixture, {
                profile,
                cases: { ...(previous?.cases ?? {}), ...hashes },
            } satisfies Manifest);
            log(`fixture gravada: ${fixture}`);
        }
    } else {
        const manifest = await readJsonFixture<Manifest>(fixture);
        if (manifest === null && names.length > 0)
            failures.push(`sem fixture para o perfil ${profile} (rode com --record)`);
        else
            for (const [name, hs] of Object.entries(hashes))
                for (const [k, v] of Object.entries(hs)) {
                    const expected = manifest?.cases[name]?.[k];
                    if (expected !== v)
                        failures.push(`${name}/${k}: estado ${v} ≠ fixture ${expected ?? '—'}`);
                    else log(`${name}/${k}: idêntico à fixture`);
                }
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('PARAMETRICSURFACES SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
