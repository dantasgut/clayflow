// Spec 010 — Smoke das superfícies paramétricas completas: colisor derivado da superfície (altura e distância com
// sinal, construído na GPU por passo), geometria diferencial no material, malha adaptativa com desenho indireto e
// normais da geometria paramétrica de CPU.
//
// Cada caso monta uma cena pequena, avança por passos fixos e lê de volta (só aqui, para medir) o que precisa:
//   - campo: o campo de alturas do vale contra a fórmula (erro de construção);
//   - corpos: 50 corpos rígidos sobre o vale — nenhum centro abaixo da superfície, ≥ 95 % em repouso (SC-001);
//   - terreno com fluidos: SPH, PBF e MPM sobre o vale — nenhuma partícula abaixo da superfície, centróide no vale
//     (SC-002);
//   - solvers: XPBD, FEM e emissor (que antes não colidiam) sobre o vale;
//   - terreno animado: corpos e fluido acompanham; mesmo estado a 30/60/144 Hz (SC-008);
//   - lago: água da 017 forma um lago no vale, nível estável, superfície e cáusticas na imagem (SC-002a).
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
import type { EntityId } from 'clayflow';
import { capture, readBuffer, readPool, settle } from './support/extensionScenes';
import {
    gpuProfile,
    readJsonFixture,
    recording,
    writeFixture,
    writeJsonFixture,
} from './support/fixtures';
import { lumaSrgb, toPng } from './support/images';
import { hashBytes } from './support/fluidMeasures';
import { block, rng } from './support/particleScenes';
import {
    insertValley,
    LAKE_VALLEY,
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

/** Perfil da GPU (nome das fixtures). */
let profileName = 'unknown';

/** Erros capturados dos estágios: qualquer um reprova o smoke. */
const engineErrors: string[] = [];

async function createApp(size = 64): Promise<Application> {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
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

/** Domínio aberto dos fluidos sobre superfícies (spec 010): sem paredes; quem sai da caixa é retirado. */
const OPEN_DOMAIN = {
    bounds: 'open',
    domainMin: [-2.5, -2, -2.5],
    domainMax: [2.5, 2, 2.5],
} as const;

/** Partícula retirada do domínio aberto: parada muito abaixo da cena. */
const RETIRED_BELOW = -1e6;

/** Partículas secundárias vivas por tipo e as abaixo do vale do lago (lidas de volta, só no smoke). */
async function countDiffuse(
    app: Application,
    diffuse: clayflow.DiffuseParticles,
): Promise<{ alive: number; spray: number; foam: number; bubble: number; below: number }> {
    const spec = app.resources.bufferOf(diffuse, 'particles');
    if (spec === undefined) throw new Error('partículas secundárias sem buffer');
    const f = await readBuffer(app, spec, 'diffuse');
    const out = { alive: 0, spray: 0, foam: 0, bubble: 0, below: 0 };
    for (let i = 0; i < f.length / 8; i++) {
        if (!(f[i * 8 + 7]! > 0)) continue;
        out.alive++;
        const kind = f[i * 8 + 3]!;
        if (kind < 0.5) out.spray++;
        else if (kind < 1.5) out.foam++;
        else out.bubble++;
        const [x, y, z] = [f[i * 8]!, f[i * 8 + 1]!, f[i * 8 + 2]!];
        if (y < valleyHeight(x, z, 0, LAKE_VALLEY) - LAKE_SPACING) out.below++;
    }
    return out;
}

/** Espaçamento da água do lago (o da 017). */
const LAKE_SPACING = 0.025;
const LAKE_W = 320;
const LAKE_H = 200;

/**
 * Cena do lago: o vale colidível (areia), luz com sombra, câmera de cima em ângulo e uma barragem de água (PBF com
 * `FluidSurfaceMaterial`: refração, absorção e cáusticas) solta na encosta. `water: 'none'` monta o vale seco.
 */
async function lakeScene(water: 'caustics' | 'plain' | 'none', steps: number) {
    let diffuse: clayflow.DiffuseParticles | undefined;
    const canvas = document.createElement('canvas');
    canvas.width = LAKE_W;
    canvas.height = LAKE_H;
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
    app.events.on('engineError', (e) => {
        engineErrors.push(`${e.stage}/${e.filter}: ${e.message}`);
    });
    const eye: [number, number, number] = [0, 0.95, 1.25];
    const target: [number, number, number] = [0, -0.2, 0];
    app.world.insert(
        new Camera({
            fov: Math.PI / 4,
            aspect: LAKE_W / LAKE_H,
            aspectMode: 'fixed',
            near: 0.05,
            far: 20,
        }).add(
            new Transform({ position: [...eye, 1], rotation: Transform.lookRotation(eye, target) }),
        ),
    );
    app.world.insert(
        new DirectionalLight({
            direction: [-0.25, -1, -0.35, 0],
            color: [1, 1, 1, 1],
            intensity: 1.2,
            castShadow: true,
        }),
    );
    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    app.world.insert(
        new clayflow.ParticlePhysics({
            // Água física (spec 010): tensão superficial, ângulo de contato e viscosidade reais na escala do espaçamento.
            ...clayflow.ParticlePhysics.WATER,
            particleSpacing: LAKE_SPACING,
            // Domínio aberto (spec 010): sem paredes; a caixa só limita o cálculo, e o que sai do terreno é retirado.
            bounds: 'open',
            domainMin: [-1.5, -0.8, -1.5],
            domainMax: [1.5, 1.5, 1.5],
        }),
    );
    insertValley(app, clayflow, { shape: LAKE_VALLEY, albedo: [0.86, 0.8, 0.66] });
    if (water !== 'none') {
        const position: number[] = [];
        const r = rng(29);
        for (let y = 0; y < 24; y++)
            for (let z = 0; z < 16; z++)
                for (let x = 0; x < 16; x++)
                    position.push(
                        -0.45 + LAKE_SPACING * (x + 0.5) + (r() - 0.5) * LAKE_SPACING * 0.1,
                        0.02 + LAKE_SPACING * (y + 0.5),
                        -0.2 + LAKE_SPACING * (z + 0.5) + (r() - 0.5) * LAKE_SPACING * 0.1,
                    );
        const body = new clayflow.FluidBody({ algorithm: 'PBF', position }).add(
            new clayflow.FluidSurfaceMaterial({ caustics: water === 'caustics' }),
        );
        app.world.insert(body);
        // Spray, espuma e bolhas do respingo (spec 010).
        diffuse = new clayflow.DiffuseParticles({ source: body, maxParticles: 32_768 });
        app.world.insert(diffuse);
    }
    // Tempo para os pipelines compilarem antes do respingo (com o passe de profundidade do desenho, spec 033, a fila é
    // maior; o estágio das partículas secundárias pronto tarde perderia o respingo).
    await settle(app, 3000);
    const levels: number[] = [];
    const sprayPeak = { alive: 0, spray: 0, foam: 0, bubble: 0 };
    let image: ImageData | undefined;
    for (let i = 0; i < steps; i++) {
        app.step(1 / 60);
        // Captura antes de qualquer leitura de volta (a espera apresenta e limpa o canvas).
        if (i === steps - 1) image = capture(canvas);
        // Pico de cada tipo de partícula secundária nos 2 primeiros segundos (o respingo).
        if (diffuse !== undefined && i < 120 && i % 10 === 9) {
            const now = await countDiffuse(app, diffuse);
            sprayPeak.alive = Math.max(sprayPeak.alive, now.alive);
            sprayPeak.spray = Math.max(sprayPeak.spray, now.spray);
            sprayPeak.foam = Math.max(sprayPeak.foam, now.foam);
            sprayPeak.bubble = Math.max(sprayPeak.bubble, now.bubble);
        }
        // Nível do lago no último segundo, a cada 0,25 s: média das 10 % mais altas perto do centro.
        if (water !== 'none' && i >= steps - 60 && (steps - 1 - i) % 15 === 0) {
            const pts = await readPositions(app, clayflow.PBFSchema);
            const ys = pts
                .filter((p) => Math.hypot(p[0], p[2]) < 0.3)
                .map((p) => p[1])
                .sort((a, b) => b - a);
            const top = ys.slice(0, Math.max(1, Math.floor(ys.length / 10)));
            levels.push(top.reduce((a, b) => a + b, 0) / top.length);
        }
    }
    const particles = water === 'none' ? [] : await readPositions(app, clayflow.PBFSchema);
    const sprayEnd = diffuse === undefined ? undefined : await countDiffuse(app, diffuse);
    app.dispose();
    canvas.remove();
    return { image: image!, particles, levels, sprayPeak, sprayEnd };
}

/** Toro de teste (raios do anel e do tubo) e a distância com sinal analítica. */
const TORUS = { R: 0.6, r: 0.25 } as const;

function torusDistance(p: readonly number[]): number {
    const q = Math.hypot(p[0]!, p[2]!) - TORUS.R;
    return Math.hypot(q, p[1]!) - TORUS.r;
}

/** Transformação do toro dos corpos (FR-005): translação, rotação de 15° em x e escala 1,2. */
const TORUS_POSE = {
    t: [0.2, 0.1, -0.1] as const,
    angle: (15 * Math.PI) / 180,
    s: 1.2,
};

/** Mundo ← local do toro posado. */
function torusToWorld(p: readonly number[]): [number, number, number] {
    const { t, angle, s } = TORUS_POSE;
    const [x, y, z] = [p[0]! * s, p[1]! * s, p[2]! * s];
    const c = Math.cos(angle);
    const n = Math.sin(angle);
    return [x + t[0], c * y - n * z + t[1], n * y + c * z + t[2]];
}

/** Distância com sinal (mundo) ao toro posado. */
function posedTorusDistance(p: readonly number[]): number {
    const { t, angle, s } = TORUS_POSE;
    const [x, y, z] = [p[0]! - t[0], p[1]! - t[1], p[2]! - t[2]];
    const c = Math.cos(angle);
    const n = Math.sin(angle);
    return torusDistance([x / s, (c * y + n * z) / s, (-n * y + c * z) / s]) * s;
}

/** Superfície pronta colidível pela distância (malha e campo). */
function insertDistanceSurface(
    app: Application,
    preset: 'torus' | 'sphere',
    params: number[],
    resolution = 48,
    transform: clayflow.Transform = new Transform(),
): { id: EntityId; collider: clayflow.SurfaceCollider } {
    const collider = new clayflow.SurfaceCollider({ mode: 'distance', resolution });
    const surface = new clayflow.ParametricSurface({
        preset,
        params,
        resolution: preset === 'torus' ? [96, 48] : [64, 32],
    })
        .add(collider)
        .add(new clayflow.StandardMaterial({ albedo: [0.7, 0.45, 0.3, 1] }))
        .add(transform);
    return { id: app.world.insert(surface), collider };
}

/** Esfera do usuário sem derivadas (jato numérico). */
const SPHERE_PLAIN_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return data.r * vec3f(sin(v) * cos(u), cos(v), sin(v) * sin(u));
}`;

/** Toro do usuário sem derivadas (jato numérico; a mesma parametrização da pronta). */
const TORUS_PLAIN_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    let ring = data.big + data.small * cos(v);
    return vec3f(ring * cos(u), -data.small * sin(v), ring * sin(u));
}`;

/** Cor pela curvatura gaussiana: vermelho onde K > 0 (por fora do toro), azul onde K < 0 (por dentro). */
const CURVATURE_COLOR_CODE = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams {
    let k = clamp(s.curvature.x * data.gain, -1.0, 1.0);
    let color = mix(vec3f(0.85, 0.85, 0.85), select(vec3f(0.15, 0.3, 0.95), vec3f(0.95, 0.2, 0.15), k > 0.0), abs(k));
    return SurfaceParams(vec4f(color, 1.0), m.roughness, m.metallic, vec3f(0.0));
}`;

/** Onda que se move (malha adaptativa animada): altura amp · sen(4u + 3t) · cos(3v). */
const WAVE_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return vec3f(v, data.amp * sin(4.0 * u + 3.0 * time) * cos(3.0 * v), u);
}`;

/** Geometria diferencial (16 floats por vértice) de uma superfície `differential`, lida do pool. */
async function readDiff(app: Application, id: EntityId, count: number): Promise<Float32Array> {
    const bytes = await readPool(app, 'SurfaceDiff');
    const f = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const first = app.resources.poolSlotOf('SurfaceDiff', id);
    if (first === undefined) throw new Error('superfície sem geometria diferencial');
    return f.slice(first * 16, (first + count) * 16);
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

    /** XPBD, FEM e emissor — que antes não colidiam com nada — sobre o vale: nada abaixo da superfície (FR-004). */
    async solvers() {
        const c = collector();
        const app = await createApp();
        view(app);
        app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
        insertValley(app, clayflow);
        // Corrente XPBD de 16 nós solta na horizontal; bloco FEM de 27 nós; emissor em cone para cima.
        const n = 16;
        const links = Array.from({ length: n - 1 }, (_, i) => i);
        app.world.insert(
            new clayflow.SoftBody({
                algorithm: 'XPBD',
                position: Array.from({ length: n }, (_, i) => [-0.75 + i * 0.1, 0.2, 0.3]).flat(),
                mass: 0.1,
                edges: {
                    a: links,
                    b: links.map((i) => i + 1),
                    restLength: links.map(() => 0.1),
                    compliance: 1e-6,
                },
            }),
        );
        app.world.insert(
            new clayflow.SoftBody({
                algorithm: 'FEM',
                position: block(27, 0.1, [-0.1, 0.1, -0.4], 3).flat(),
                mass: 0.05,
            }),
        );
        const emitter = new clayflow.ComputeParticleEmitter({
            maxParticles: 512,
            rate: 200,
            lifetime: 10,
            shape: new clayflow.ConeEmitterShape([0.4, 0.3, -0.2], [0, 1, 0], 0.4, 1.5),
        });
        app.world.insert(
            emitter
                .add(new clayflow.PointCloudGeometry({ maxPoints: 512 }))
                .add(new clayflow.PointSpriteMaterial())
                .add(new Transform()),
        );
        await settle(app);
        run(app, 240);
        const xpbd = await readPositions(app, clayflow.XPBDSoftSchema);
        const fem = await readPositions(app, clayflow.FEMSchema);
        const spec = app.resources.bufferOf(emitter, 'particles');
        if (spec === undefined) throw new Error('emissor sem partículas');
        const raw = await readBuffer(app, spec, 'emitter');
        app.dispose();
        const emitted: [number, number, number][] = [];
        for (let i = 0; i < raw.length / 16; i++)
            if (raw[i * 16 + 9]! > 0)
                emitted.push([raw[i * 16]!, raw[i * 16 + 1]!, raw[i * 16 + 2]!]);
        for (const [name, pts, radius] of [
            ['XPBD', xpbd, 0.05],
            ['FEM', fem, 0.05],
            ['emissor', emitted, 0],
        ] as const) {
            let below = 0;
            for (const p of pts)
                if (p[1] - valleyHeight(p[0], p[2]) < radius - CONTACT_SLOP) below++;
            c.measure(`${name}: elementos`, pts.length);
            c.measure(`${name}: abaixo da superfície`, below);
            c.check(pts.length > 0, `${name}: nenhum elemento`);
            c.check(below === 0, `${name}: ${below} abaixo da superfície`);
            c.check(
                pts.every((p) => p.every(Number.isFinite)),
                `${name}: valores não finitos`,
            );
            c.hash(name, bytesOf(pts));
        }
        return c.result();
    },

    /**
     * Terreno animado (o fundo sobe e desce): corpos e fluido acompanham sem atravessar nem flutuar, e o estado é o mesmo
     * a 30, 60 e 144 Hz — o colisor tem uma cópia por passo (SC-008, FR-015).
     */
    async animated() {
        const c = collector();
        const amp = 0.2;
        const omega = 3;
        const steps = 180;
        const states: Record<number, { bodies: Uint8Array; fluid: Uint8Array; built: number }> = {};
        // Corpos e fluido em cenas separadas: o fluido colide com os colliders dos corpos, e cada solver roda todos os
        // passos do quadro antes do seguinte (sem acoplamento por passo entre solvers — P7), o que difere entre taxas.
        const scene = async (rate: number, kind: 'bodies' | 'fluid') => {
            const app = await createApp();
            view(app);
            app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
            const { id, collider } = insertValley(app, clayflow, { animated: { amp, omega } });
            if (kind === 'bodies')
                for (let i = 0; i < 6; i++) {
                    const x = ((i % 3) - 1) * 0.3;
                    const z = (Math.floor(i / 3) - 0.5) * 0.4;
                    const position: [number, number, number] = [x, valleyHeight(x, z) + 0.25, z];
                    app.world.insert(
                        i % 2 === 0
                            ? new clayflow.RigidBody({
                                  shape: 'sphere',
                                  radius: 0.1,
                                  mass: 1,
                                  position,
                              })
                            : new clayflow.RigidBody({
                                  shape: 'box',
                                  halfExtents: [0.08, 0.08, 0.08],
                                  mass: 1,
                                  position,
                              }),
                    );
                }
            else {
                app.world.insert(new clayflow.ParticlePhysics(OPEN_DOMAIN));
                app.world.insert(
                    new clayflow.FluidBody({
                        algorithm: 'PBF',
                        position: block(216, spacing, [0.4, -0.2, 0.3], 11).flat(),
                    }).add(new clayflow.PointSpriteMaterial({ radius: spacing / 2 })),
                );
            }
            await settle(app);
            const frames = Math.round((steps * rate) / 60);
            let done = 0;
            for (let f = 0; f < frames; f++) {
                app.step(1 / rate);
                done += app.time.steps;
            }
            c.check(done === steps, `${rate} Hz: ${done} passos (esperado ${steps})`);
            const points = await readPositions(
                app,
                kind === 'bodies' ? clayflow.LCPSchema : clayflow.PBFSchema,
            );
            const field = await readField(app, clayflow, id, collider);
            const lift = amp * Math.sin(omega * app.time.simulated);
            app.dispose();
            return { points, built: field.built, lift };
        };
        const spacing = clayflow.ParticlePhysics.defaults.particleSpacing;
        for (const rate of [30, 60, 144]) {
            const b = await scene(rate, 'bodies');
            const f = await scene(rate, 'fluid');
            const bodies = b.points;
            const fluid = f.points;
            const lift = b.lift;
            states[rate] = { bodies: bytesOf(bodies), fluid: bytesOf(fluid), built: b.built };
            if (rate !== 60) continue;
            let floating = 0;
            let sunk = 0;
            bodies.forEach((p, i) => {
                const gap = p[1] - valleyHeight(p[0], p[2], lift);
                // Esfera: centro a ≥ r (mais na encosta); caixa: entre a meia aresta e a meia diagonal.
                const lo = i % 2 === 0 ? 0.1 : 0.08;
                const hi = i % 2 === 0 ? 0.13 : 0.15;
                if (gap < lo - CONTACT_SLOP) sunk++;
                if (gap > hi + 0.05) floating++;
            });
            let below = 0;
            for (const p of fluid)
                if (p[1] >= RETIRED_BELOW && valleyHeight(p[0], p[2], f.lift) - p[1] > spacing / 2)
                    below++;
            c.measure('60 Hz: corpos afundados', sunk);
            c.measure('60 Hz: corpos flutuando', floating);
            c.measure('60 Hz: partículas abaixo', below);
            c.check(sunk === 0, `${sunk} corpos atravessaram o terreno animado`);
            c.check(floating === 0, `${floating} corpos não acompanharam o terreno (flutuando)`);
            c.check(below === 0, `${below} partículas abaixo do terreno animado`);
            c.hash('bodies', states[rate].bodies);
            c.hash('fluid', states[rate].fluid);
        }
        for (const rate of [30, 144]) {
            const same = (a: Uint8Array, b: Uint8Array) => hashBytes(a) === hashBytes(b);
            c.measure(`${rate} Hz: cópias no último quadro`, states[rate]!.built);
            c.check(
                same(states[rate]!.bodies, states[60]!.bodies),
                `${rate} Hz: corpos diferem de 60 Hz`,
            );
            c.check(
                same(states[rate]!.fluid, states[60]!.fluid),
                `${rate} Hz: fluido difere de 60 Hz`,
            );
        }
        c.check(
            states[30]!.built === 2,
            `30 Hz: ${states[30]!.built} cópias por quadro (esperado 2)`,
        );
        return c.result();
    },

    /**
     * Água no terreno (SC-002a): a barragem escorre pela encosta e forma um lago no vale em 10 s (água física) — nenhuma partícula
     * abaixo da superfície nem escapando por baixo do terreno, nível estável no último segundo (≤ 1 espaçamento), e a
     * imagem com a superfície da água e as cáusticas no fundo do vale (fixture).
     */
    async lake() {
        const c = collector();
        const steps = 600;
        const wet = await lakeScene('caustics', steps);
        const plain = await lakeScene('plain', steps);
        const dry = await lakeScene('none', 1);
        let below = 0;
        let escaped = 0;
        let retired = 0;
        for (const p of wet.particles) {
            if (p[1] < RETIRED_BELOW) {
                retired++;
                continue;
            }
            const h = valleyHeight(p[0], p[2], 0, LAKE_VALLEY);
            if (h - p[1] > LAKE_SPACING / 2) below++;
            if (p[1] < -LAKE_VALLEY.depth - LAKE_SPACING) escaped++;
        }
        c.measure('retiradas (saíram do terreno)', retired);
        // Partículas secundárias: o respingo gera spray, espuma e bolhas; com a água parada, quase nenhuma sobra viva;
        // nenhuma abaixo do terreno (o spray que bate no chão se desfaz).
        const peak = wet.sprayPeak;
        const end = wet.sprayEnd!;
        c.measure('secundárias no respingo (vivas)', peak.alive);
        c.measure('spray no respingo', peak.spray);
        c.measure('espuma no respingo', peak.foam);
        c.measure('bolhas no respingo', peak.bubble);
        c.measure('secundárias vivas no fim', end.alive);
        c.measure('secundárias abaixo do terreno', end.below);
        c.check(peak.spray > 0 && peak.foam > 0, 'o respingo não gerou spray e espuma');
        c.check(
            end.alive <= 0.1 * Math.max(1, peak.alive),
            `${end.alive} secundárias vivas com a água parada`,
        );
        c.check(end.below === 0, `${end.below} secundárias abaixo do terreno`);
        const variation = Math.max(...wet.levels) - Math.min(...wet.levels);
        c.measure('partículas', wet.particles.length);
        c.measure('abaixo da superfície', below);
        c.measure('escapando por baixo', escaped);
        c.measure('nível do lago (m)', wet.levels.at(-1)!);
        c.measure('variação do nível no último segundo (m)', variation);
        c.check(below === 0, `${below} partículas abaixo da superfície`);
        c.check(escaped === 0, `${escaped} partículas escaparam por baixo do terreno`);
        c.check(variation <= LAKE_SPACING, `nível variou ${variation} m no último segundo`);
        c.check(
            wet.levels.at(-1)! < 0 && wet.levels.at(-1)! > -LAKE_VALLEY.depth,
            `nível ${wet.levels.at(-1)} fora do vale`,
        );
        // Água na imagem: pixels diferentes do vale seco; cáusticas: na água, regiões mais claras e mais escuras que a
        // mesma água sem cáusticas (o mesmo estado: a física não depende do desenho).
        let water = 0;
        let brighter = 0;
        let darker = 0;
        for (let y = 0; y < LAKE_H; y++)
            for (let x = 0; x < LAKE_W; x++) {
                const i = (y * LAKE_W + x) * 4;
                let differs = false;
                for (let k = 0; k < 3; k++)
                    if (Math.abs(wet.image.data[i + k]! - dry.image.data[i + k]!) > 6)
                        differs = true;
                if (!differs) continue;
                water++;
                const a = lumaSrgb(wet.image, x, y);
                const b = lumaSrgb(plain.image, x, y);
                if (a > b * 1.15 + 0.01) brighter++;
                if (a < b * 0.9 - 0.01) darker++;
            }
        const total = LAKE_W * LAKE_H;
        c.measure('água na imagem (%)', (100 * water) / total);
        c.measure('cáusticas mais claras (% da água)', (100 * brighter) / Math.max(1, water));
        c.measure('cáusticas mais escuras (% da água)', (100 * darker) / Math.max(1, water));
        c.check(water > 0.03 * total, `água em só ${water} px`);
        c.check(brighter > 0.02 * water, `cáusticas: só ${brighter} px mais claros na água`);
        c.check(darker > 0.02 * water, `cáusticas: só ${darker} px mais escuros na água`);
        c.hash('particles', bytesOf(wet.particles));
        // A imagem entra no manifesto pelo hash (pixel a pixel); a PNG gravada é para ver.
        c.hash('image', new Uint8Array(wet.image.data.buffer));
        if (recording())
            await writeFixture(
                `parametricSurfaces-lake-${profileName}.png`,
                await toPng(wet.image),
            );
        return c.result();
    },

    /** Campo de distância do toro contra a analítica: erro perto da superfície e sinal em todos os nós (US2). */
    async distanceField() {
        const c = collector();
        const app = await createApp();
        const { id, collider } = insertDistanceSurface(app, 'torus', [TORUS.R, TORUS.r]);
        await settle(app);
        run(app, 1);
        const field = await readField(app, clayflow, id, collider);
        app.dispose();
        const n = collider.data.nx;
        const cell = (field.hi[0]! - field.lo[0]!) / (n - 1);
        let worstNear = 0;
        let wrongSign = 0;
        for (let iz = 0; iz < n; iz++)
            for (let iy = 0; iy < n; iy++)
                for (let ix = 0; ix < n; ix++) {
                    const p = [ix, iy, iz].map(
                        (k, a) => field.lo[a]! + (k * (field.hi[a]! - field.lo[a]!)) / (n - 1),
                    );
                    const d = field.values[ix + n * (iy + n * iz)]!;
                    const t = torusDistance(p);
                    if (Math.abs(t) < 3 * cell) worstNear = Math.max(worstNear, Math.abs(d - t));
                    if (Math.abs(t) > cell && Math.sign(d) !== Math.sign(t)) wrongSign++;
                }
        c.measure('célula (m)', cell);
        c.measure('erro perto da superfície (m)', worstNear);
        c.measure('nós com sinal errado', wrongSign);
        c.check(field.built === 1, `cópias ${field.built} (esperado 1)`);
        c.check(
            worstNear < 0.25 * cell,
            `erro ${worstNear} m perto da superfície (célula ${cell})`,
        );
        c.check(wrongSign === 0, `${wrongSign} nós com o sinal errado`);
        c.hash('field', new Uint8Array(field.values.buffer));
        return c.result();
    },

    /** Corpos caindo sobre um toro colidível: nenhum centro dentro; os soltos no tubo escorregam (desviados), os do furo passam. */
    async torusBodies() {
        const c = collector();
        const app = await createApp();
        view(app);
        app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
        const half15 = TORUS_POSE.angle / 2;
        insertDistanceSurface(
            app,
            'torus',
            [TORUS.R, TORUS.r],
            48,
            new Transform({
                position: [...TORUS_POSE.t, 1],
                rotation: [Math.sin(half15), 0, 0, Math.cos(half15)],
                scale: [TORUS_POSE.s, TORUS_POSE.s, TORUS_POSE.s, 1],
            }),
        );
        const radius = 0.08;
        const half = 0.06;
        for (let i = 0; i < 24; i++) {
            const a = (i / 24) * 2 * Math.PI;
            const rr = i % 3 === 0 ? 0.1 : TORUS.R + ((i % 3) - 1.5) * 0.08;
            const position = torusToWorld([
                rr * Math.cos(a),
                0.5 + 0.08 * (i % 4),
                rr * Math.sin(a),
            ]);
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
        await settle(app);
        run(app, 240);
        const pos = await readPositions(app, clayflow.LCPSchema);
        app.dispose();
        let inside = 0;
        let deflected = 0;
        let overTube = 0;
        let throughHole = 0;
        pos.forEach((p, i) => {
            const d = posedTorusDistance(p);
            if (d < (i % 2 === 0 ? radius : half) - CONTACT_SLOP) inside++;
            const start = i % 3 === 0 ? 0.1 : TORUS.R + ((i % 3) - 1.5) * 0.08;
            const { t, angle, s: k } = TORUS_POSE;
            const local = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
            const cz = -Math.sin(angle) * local[1]! + Math.cos(angle) * local[2]!;
            const end = Math.hypot(local[0]!, cz) / k;
            if (i % 3 === 0) {
                // Solto sobre o furo: passa abaixo do toro.
                if (p[1] < TORUS_POSE.t[1] - TORUS.r * TORUS_POSE.s - 0.2) throughHole++;
                return;
            }
            // Solto sobre o tubo: escorrega para dentro (furo) ou para fora — desviado pelo tubo.
            overTube++;
            if (Math.abs(end - start) > 0.1) deflected++;
        });
        c.measure('corpos dentro do toro', inside);
        c.measure('soltos sobre o tubo e desviados', deflected);
        c.measure('soltos sobre o tubo', overTube);
        c.measure('soltos no furo que passaram por ele', throughHole);
        c.check(inside === 0, `${inside} corpos dentro do toro`);
        c.check(
            deflected === overTube,
            `${overTube - deflected} corpos soltos sobre o tubo não foram desviados`,
        );
        c.check(throughHole === 8, `só ${throughHole} de 8 corpos passaram pelo furo`);
        c.hash('bodies', bytesOf(pos));
        return c.result();
    },

    /** Fluido caindo numa esfera colidível: nenhuma partícula com distância < −½ espaçamento; escorre pela esfera. */
    async sphereFluid() {
        const c = collector();
        const results: Record<string, number> = {};
        for (const adhesion of [0, clayflow.ParticlePhysics.WATER_ADHESION]) {
            const app = await createApp();
            view(app);
            app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
            const spacing = clayflow.ParticlePhysics.defaults.particleSpacing;
            app.world.insert(new clayflow.ParticlePhysics({ ...OPEN_DOMAIN, adhesion }));
            const R = 0.45;
            insertDistanceSurface(app, 'sphere', [R]);
            app.world.insert(
                new clayflow.FluidBody({
                    algorithm: 'PBF',
                    position: block(512, spacing, [-0.15, 0.55, -0.15], 5).flat(),
                }).add(new clayflow.PointSpriteMaterial({ radius: spacing / 2 })),
            );
            await settle(app);
            run(app, 150);
            const pos = await readPositions(app, clayflow.PBFSchema);
            app.dispose();
            let inside = 0;
            let clinging = 0;
            for (const p of pos) {
                if (p[1] < RETIRED_BELOW) continue;
                const d = Math.hypot(...p) - R;
                if (d < -spacing / 2) inside++;
                if (d < 2 * spacing) clinging++;
            }
            const tag = adhesion === 0 ? 'sem adesão' : 'com adesão';
            c.measure(`${tag}: partículas dentro da esfera`, inside);
            c.measure(`${tag}: partículas presas à esfera`, clinging);
            c.check(inside === 0, `${tag}: ${inside} partículas dentro da esfera`);
            results[tag] = clinging;
            c.hash(tag, bytesOf(pos));
        }
        // A adesão (030) age na superfície como nos outros colliders: mais água presa à esfera.
        c.check(
            results['com adesão']! > results['sem adesão']!,
            `adesão sem efeito na superfície (${results['com adesão']} ≤ ${results['sem adesão']})`,
        );
        return c.result();
    },

    /**
     * Curvaturas contra as analíticas (SC-004): esfera K = 1/r², H = 1/r (erro ≤ 1 %); toro K = cos v / (r (R + r cos v)),
     * H = (R + 2r cos v) / (2r (R + r cos v)) (erro ≤ 2 % do máximo); jato analítico (prontas) e numérico (função do
     * usuário sem derivadas); nenhum valor não finito.
     */
    async curvature() {
        const c = collector();
        const r = 0.8;
        const [R, t] = [1, 0.35];
        const cases = [
            { name: 'esfera (analítica)', kind: 'sphere', fn: undefined },
            { name: 'esfera (numérica)', kind: 'sphere', fn: SPHERE_PLAIN_CODE },
            { name: 'toro (analítica)', kind: 'torus', fn: undefined },
            { name: 'toro (numérica)', kind: 'torus', fn: TORUS_PLAIN_CODE },
        ] as const;
        for (const k of cases) {
            const app = await createApp();
            const [nu, nv] = k.kind === 'sphere' ? [64, 33] : [96, 48];
            const surface = new clayflow.ParametricSurface({
                preset: k.kind,
                params: k.kind === 'sphere' ? [r] : [R, t],
                resolution: [nu, nv],
                differential: true,
            });
            const entity = surface.add(new clayflow.StandardMaterial()).add(new Transform());
            if (k.fn !== undefined)
                entity.add(
                    new clayflow.SurfaceFunction(
                        k.kind === 'sphere'
                            ? { code: k.fn, params: { r: 'f32' }, values: { r } }
                            : {
                                  code: k.fn,
                                  params: { big: 'f32', small: 'f32' },
                                  values: { big: R, small: t },
                              },
                    ),
                );
            const id = app.world.insert(entity);
            await settle(app);
            run(app, 1);
            const d = await readDiff(app, id, nu * nv);
            app.dispose();
            const [v0, v1] = surface.data.domain.slice(2) as [number, number];
            let errK = 0;
            let errH = 0;
            let maxK = 0;
            let maxH = 0;
            let nonFinite = 0;
            for (let i = 0; i < nu * nv * 16; i++) if (!Number.isFinite(d[i]!)) nonFinite++;
            for (let iv = 0; iv < nv; iv++) {
                // Esfera: os polos (primeira e última linha) ficam de fora da medida (valem os do recuo).
                if (k.kind === 'sphere' && (iv === 0 || iv === nv - 1)) continue;
                const v = v0 + ((v1 - v0) * iv) / (nv - 1);
                for (let iu = 0; iu < nu; iu++) {
                    const o = (iv * nu + iu) * 16;
                    const K = d[o + 8]!;
                    const H = d[o + 9]!;
                    const ring = R + t * Math.cos(v);
                    const Kt = k.kind === 'sphere' ? 1 / (r * r) : Math.cos(v) / (t * ring);
                    const Ht =
                        k.kind === 'sphere' ? 1 / r : (R + 2 * t * Math.cos(v)) / (2 * t * ring);
                    errK = Math.max(errK, Math.abs(K - Kt));
                    errH = Math.max(errH, Math.abs(H - Ht));
                    maxK = Math.max(maxK, Math.abs(Kt));
                    maxH = Math.max(maxH, Math.abs(Ht));
                }
            }
            const tol = k.kind === 'sphere' ? 0.01 : 0.02;
            const relK = c.measure(`${k.name}: erro de K (relativo)`, errK / maxK);
            const relH = c.measure(`${k.name}: erro de H (relativo)`, errH / maxH);
            c.measure(`${k.name}: não finitos`, nonFinite);
            c.check(relK <= tol, `${k.name}: K com erro ${relK}`);
            c.check(relH <= tol, `${k.name}: H com erro ${relH}`);
            c.check(nonFinite === 0, `${k.name}: ${nonFinite} valores não finitos`);
            c.hash(k.name, new Uint8Array(d.buffer));
        }
        return c.result();
    },

    /**
     * Material por curvatura (US3-3): um toro com a cor pela curvatura gaussiana — a parte externa (K > 0) e a interna
     * (K < 0) com cores diferentes na imagem; fixture.
     */
    async curvatureMaterial() {
        const c = collector();
        const W = 160;
        const H = 120;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
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
        app.events.on('engineError', (e) => {
            engineErrors.push(`${e.stage}/${e.filter}: ${e.message}`);
        });
        const eye: [number, number, number] = [0, 1.6, 2.2];
        app.world.insert(
            new Camera({
                fov: Math.PI / 4,
                aspect: W / H,
                aspectMode: 'fixed',
                near: 0.05,
                far: 20,
            }).add(
                new Transform({
                    position: [...eye, 1],
                    rotation: Transform.lookRotation(eye, [0, 0, 0]),
                }),
            ),
        );
        app.world.insert(new DirectionalLight({ direction: [-0.3, -1, -0.5, 0], intensity: 1.1 }));
        const surface = new clayflow.ParametricSurface({
            preset: 'torus',
            params: [0.7, 0.3],
            resolution: [96, 48],
            differential: true,
        });
        app.world.insert(
            surface
                .add(new clayflow.StandardMaterial())
                .add(new Transform())
                .add(
                    new clayflow.MaterialFunction({
                        code: CURVATURE_COLOR_CODE,
                        params: { gain: 'f32' },
                        values: { gain: 1.5 },
                    }),
                ),
        );
        await settle(app);
        app.step(1 / 60);
        const image = capture(canvas);
        app.dispose();
        canvas.remove();
        let red = 0;
        let blue = 0;
        for (let i = 0; i < image.data.length; i += 4) {
            const [r, g, b] = [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!];
            if (r > 60 && r > 1.6 * g && r > 1.6 * b) red++;
            if (b > 60 && b > 1.4 * r && b > 1.2 * g) blue++;
        }
        c.measure('pixels vermelhos (K > 0)', red);
        c.measure('pixels azuis (K < 0)', blue);
        c.check(red > 200, `só ${red} pixels da parte externa (K > 0)`);
        c.check(blue > 100, `só ${blue} pixels da parte interna (K < 0)`);
        c.hash('image', new Uint8Array(image.data.buffer));
        if (recording())
            await writeFixture(
                `parametricSurfaces-curvature-${profileName}.png`,
                await toPng(image),
            );
        return c.result();
    },

    /**
     * Malha adaptativa (SC-005): terreno visto de perto num canto — ≥ 2× triângulos por área perto do que longe, total
     * ≤ 50 % da uniforme de mesma precisão máxima; esfera fechada adaptativa sem frestas (nenhum pixel do fundo dentro da
     * silhueta da uniforme); superfície animada refeita a cada quadro sem leitura de volta; arame desenhado.
     */
    async adaptive() {
        const c = collector();
        // 1. Terreno: câmera baixa sobre o canto (−x, −z).
        {
            const app = await createApp(128);
            const eye: [number, number, number] = [-1.4, 0.35, -1.4];
            app.world.insert(
                new Camera({ fov: Math.PI / 3, near: 0.02, far: 50 }).add(
                    new Transform({
                        position: [...eye, 1],
                        rotation: Transform.lookRotation(eye, [1, -0.3, 1]),
                    }),
                ),
            );
            app.world.insert(new DirectionalLight({ direction: [-0.3, -1, -0.4, 0] }));
            const surface = new clayflow.ParametricSurface({
                preset: 'terrain',
                domain: [-1.6, 1.6, -1.6, 1.6],
                params: [0.25, 1.2, 4],
                adaptive: { patches: [16, 16], maxLevel: 4, tolerance: 0.004, screen: 0.02 },
            });
            app.world.insert(surface.add(new clayflow.StandardMaterial()).add(new Transform()));
            await settle(app);
            app.step(1 / 60);
            const draw = await readBuffer(
                app,
                app.resources.bufferOf(surface, 'indirect')!,
                'adapt_draw',
            );
            const indexCount = new Uint32Array(draw.buffer)[0]!;
            const vertices = await readBuffer(
                app,
                app.resources.bufferOf(surface, 'vertices')!,
                'adapt_v',
            );
            const indices = new Uint32Array(
                (await readBuffer(app, app.resources.bufferOf(surface, 'indices')!, 'adapt_i'))
                    .buffer,
            );
            app.dispose();
            const a = surface.adaptive!;
            const capacity = a.indexCapacity;
            // Triângulos não degenerados por área (em xz) perto (|x|,|z| no canto da câmera) e longe (canto oposto).
            let near = 0;
            let far = 0;
            for (let t = 0; t + 2 < indexCount; t += 3) {
                const p = [indices[t]!, indices[t + 1]!, indices[t + 2]!].map((v) => [
                    vertices[v * 8]!,
                    vertices[v * 8 + 2]!,
                ]);
                const area =
                    Math.abs(
                        (p[1]![0]! - p[0]![0]!) * (p[2]![1]! - p[0]![1]!)
                            - (p[2]![0]! - p[0]![0]!) * (p[1]![1]! - p[0]![1]!),
                    ) / 2;
                if (area < 1e-10) continue;
                const cx = (p[0]![0]! + p[1]![0]! + p[2]![0]!) / 3;
                const cz = (p[0]![1]! + p[1]![1]! + p[2]![1]!) / 3;
                if (cx < -0.8 && cz < -0.8) near++;
                if (cx > 0.8 && cz > 0.8) far++;
            }
            c.measure('terreno: índices', indexCount);
            const fraction = c.measure('terreno: fração da uniforme', indexCount / capacity);
            const ratio = c.measure('terreno: densidade perto / longe', near / Math.max(1, far));
            c.check(indexCount > 0, 'malha adaptativa vazia');
            c.check(
                fraction <= 0.5,
                `malha adaptativa com ${(fraction * 100).toFixed(1)} % da uniforme`,
            );
            c.check(ratio >= 2, `densidade perto/longe ${ratio}`);
            c.hash('terrain', new Uint8Array(indices.buffer, 0, indexCount * 4));
        }
        // 2. Esfera fechada: frestas contra a uniforme de mesma precisão máxima.
        {
            const shot = async (adaptive: boolean): Promise<ImageData> => {
                const W = 160;
                const H = 120;
                const canvas = document.createElement('canvas');
                canvas.width = W;
                canvas.height = H;
                document.body.appendChild(canvas);
                const app = await Application.create({
                    canvas,
                    scene: createScene(),
                    autoResize: false,
                    captureErrors: true,
                    antialias: false,
                });
                app.events.on('engineError', (e) => {
                    engineErrors.push(`${e.stage}/${e.filter}: ${e.message}`);
                });
                const eye: [number, number, number] = [0.25, 0.3, 1.45];
                app.world.insert(
                    new Camera({
                        fov: Math.PI / 3,
                        aspect: W / H,
                        aspectMode: 'fixed',
                        near: 0.02,
                        far: 20,
                    }).add(
                        new Transform({
                            position: [...eye, 1],
                            rotation: Transform.lookRotation(eye, [0, 0, 0]),
                        }),
                    ),
                );
                app.world.insert(new DirectionalLight({ direction: [-0.3, -1, -0.4, 0] }));
                const surface = new clayflow.ParametricSurface({
                    preset: 'sphere',
                    params: [1],
                    ...(adaptive
                        ? { adaptive: { patches: [16, 8] as const, maxLevel: 4, screen: 0.03 } }
                        : { resolution: [16 * 16 + 1, 8 * 16 + 1] as const }),
                });
                app.world.insert(
                    surface
                        .add(new clayflow.StandardMaterial({ albedo: [1, 1, 1, 1] }))
                        .add(new Transform()),
                );
                await settle(app);
                app.step(1 / 60);
                const img = capture(canvas);
                app.dispose();
                canvas.remove();
                return img;
            };
            const uniform = await shot(false);
            const adaptive = await shot(true);
            const W = uniform.width;
            const H = uniform.height;
            const bg = (img: ImageData, x: number, y: number): boolean => {
                const i = (y * W + x) * 4;
                return img.data[i]! + img.data[i + 1]! + img.data[i + 2]! < 30;
            };
            let cracks = 0;
            let inside = 0;
            for (let y = 1; y < H - 1; y++)
                for (let x = 1; x < W - 1; x++) {
                    // Dentro da silhueta da uniforme, longe da borda (vizinhos também cobertos).
                    let covered = true;
                    for (let dy = -1; dy <= 1 && covered; dy++)
                        for (let dx = -1; dx <= 1; dx++)
                            if (bg(uniform, x + dx, y + dy)) {
                                covered = false;
                                break;
                            }
                    if (!covered) continue;
                    inside++;
                    if (bg(adaptive, x, y)) cracks++;
                }
            c.measure('esfera: pixels dentro da silhueta', inside);
            c.measure('esfera: frestas (pixels do fundo)', cracks);
            c.check(inside > 1000, `silhueta pequena (${inside} px)`);
            c.check(cracks === 0, `${cracks} pixels do fundo dentro da esfera adaptativa`);
            c.hash('sphere', new Uint8Array(adaptive.data.buffer));
        }
        // 3. Superfície animada adaptativa com arame: refeita a cada quadro, sem erro.
        {
            const app = await createApp(96);
            view(app);
            const surface = new clayflow.ParametricSurface({
                domain: [-1, 1, -1, 1],
                animated: true,
                adaptive: { patches: [8, 8], maxLevel: 4 },
            });
            app.world.insert(
                surface
                    .add(
                        new clayflow.SurfaceFunction({
                            code: WAVE_CODE,
                            params: { amp: 'f32' },
                            values: { amp: 0.15 },
                        }),
                    )
                    .add(new clayflow.WireframeMaterial())
                    .add(new Transform()),
            );
            await settle(app);
            const counts: number[] = [];
            for (let f = 0; f < 3; f++) {
                run(app, 20);
                const draw = await readBuffer(
                    app,
                    app.resources.bufferOf(surface, 'indirect')!,
                    `wave_${f}`,
                );
                counts.push(new Uint32Array(draw.buffer)[0]!);
            }
            app.dispose();
            counts.forEach((n, f) => c.measure(`onda: índices no quadro ${20 * (f + 1)}`, n));
            c.check(
                counts.every((n) => n > 0),
                'onda adaptativa sem triângulos',
            );
        }
        return c.result();
    },

    /** Normais da geometria paramétrica de CPU a ≤ 1° da analítica na esfera (SC-006). */
    async cpuNormals() {
        const c = collector();
        const sphere = (u: number, v: number): [number, number, number] => {
            const a = 2 * Math.PI * u;
            const b = Math.PI * v;
            return [Math.sin(b) * Math.cos(a), Math.cos(b), -Math.sin(b) * Math.sin(a)];
        };
        const g = new clayflow.ParametricGeometry({ fn: sphere, uSteps: 64, vSteps: 32 });
        const v = g.data.vertices!;
        let worst = 0;
        for (let i = 0; i < g.vertexCount; i++) {
            const p = [v[i * 8]!, v[i * 8 + 1]!, v[i * 8 + 2]!];
            const n = [v[i * 8 + 3]!, v[i * 8 + 4]!, v[i * 8 + 5]!];
            const dot = (p[0]! * n[0]! + p[1]! * n[1]! + p[2]! * n[2]!) / Math.hypot(...p);
            worst = Math.max(worst, (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI);
        }
        const deg = c.measure('maior desvio da radial (graus)', worst);
        c.check(deg <= 1, `normais a ${deg}° da radial`);
        c.hash('normals', new Uint8Array(v.buffer));
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
            app.world.insert(new clayflow.ParticlePhysics(OPEN_DOMAIN));
            const spacing = clayflow.ParticlePhysics.defaults.particleSpacing;
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
            const all = await readPositions(app, FLUID_SCHEMA[algorithm]);
            const vel = await readPositions(app, FLUID_SCHEMA[algorithm], 'vel');
            app.dispose();
            // Retiradas (saíram do terreno e da caixa) ficam fora das medidas; paradas fora do terreno: presas no ar.
            const pos = all.filter((p) => p[1] >= RETIRED_BELOW);
            const stuck = all.filter(
                (p, k) =>
                    p[1] >= RETIRED_BELOW
                    && Math.max(Math.abs(p[0]), Math.abs(p[2])) > VALLEY.half
                    && Math.hypot(...vel[k]!) < 0.05,
            ).length;
            c.measure(`${algorithm}: retiradas`, all.length - pos.length);
            c.measure(`${algorithm}: paradas fora do terreno`, stuck);
            c.check(
                stuck === 0,
                `${algorithm}: ${stuck} partículas paradas fora do terreno (presas no ar)`,
            );
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
        profileName = profile;
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
