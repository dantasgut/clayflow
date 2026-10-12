// Spec 005 — Smoke de trajetórias (R14, FR-036).
//
// Cada algoritmo de física (LCP, XPBD, FEM, MPM sólido e fluido, SPH, PBF) roda uma cena determinística por 240 passos
// com `app.step(1/60)`; o pool de cada algoritmo é lido de volta da GPU.
//   - `--record`: roda cada cena duas vezes, mede o desvio entre execuções (determinismo) e grava
//     `fixtures/trajectories-<perfil>.bin` (pools concatenados) + `.json` (cenas, strides, tolerâncias).
//   - padrão: compara com a fixture — bit a bit nas cenas determinísticas; nas demais, `pos`/`vel` dentro da
//     tolerância gravada (2 × desvio máximo entre execuções).
//
// Para rodar: `npm run smoke -- trajectories [--record]`. Resultado: `TRAJECTORIES SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    createScene,
    DistanceConstraint,
    FluidBody,
    FEMSchema,
    GravityField,
    LCPSchema,
    MPMFluidSchema,
    MPMSoftSchema,
    PBFSchema,
    RigidBody,
    SoftBody,
    SPHSchema,
    XPBDSoftSchema,
} from 'clayflow';
import type { StagingBufferSpec, StructSchema } from 'clayflow';
import {
    gpuProfile,
    readFixture,
    readJsonFixture,
    recording,
    writeFixture,
    writeJsonFixture,
} from './support/fixtures';

const STEPS = 240;

function log(msg: string): void {
    console.log(`[trajectories] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

/** Gerador determinístico (mulberry32). */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface Scene {
    readonly name: string;
    /** Schema do algoritmo: o pool lido de volta é `schema.name`. */
    readonly schema: StructSchema;
    /** Campos `vec4f` comparados com tolerância quando a cena não é determinística. */
    readonly fields: readonly string[];
    readonly build: (app: Application) => void;
}

function ground(app: Application): void {
    app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
    app.world.insert(
        new RigidBody({ shape: 'box', mass: 0, halfExtents: [4, 0.5, 4], position: [0, -0.5, 0] }),
    );
}

function block(
    n: number,
    spacing: number,
    origin: readonly [number, number, number],
    seed: number,
): [number, number, number][] {
    const r = rng(seed);
    const side = Math.ceil(Math.cbrt(n));
    const out: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
        const x = i % side;
        const y = Math.floor(i / (side * side));
        const z = Math.floor(i / side) % side;
        out.push([
            origin[0] + x * spacing + (r() - 0.5) * spacing * 0.1,
            origin[1] + y * spacing + (r() - 0.5) * spacing * 0.1,
            origin[2] + z * spacing + (r() - 0.5) * spacing * 0.1,
        ]);
    }
    return out;
}

const IDENTITY_F = { F_col0: [1, 0, 0, 0], F_col1: [0, 1, 0, 0], F_col2: [0, 0, 1, 0] };

const SCENES: readonly Scene[] = [
    {
        name: 'lcp',
        schema: LCPSchema,
        fields: ['pos', 'rot'],
        build: (app) => {
            ground(app);
            const r = rng(1);
            for (let i = 0; i < 48; i++) {
                const position: [number, number, number] = [
                    (i % 4) * 0.8 - 1.2 + (r() - 0.5) * 0.05,
                    0.6 + Math.floor(i / 16) * 0.8,
                    (Math.floor(i / 4) % 4) * 0.8 - 1.2,
                ];
                app.world.insert(
                    i % 2 === 0
                        ? new RigidBody({ shape: 'sphere', radius: 0.3, mass: 1, position })
                        : new RigidBody({
                              shape: 'box',
                              halfExtents: [0.25, 0.25, 0.25],
                              mass: 1,
                              position,
                          }),
                );
            }
        },
    },
    {
        name: 'xpbd',
        schema: XPBDSoftSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
            const n = 32;
            for (let i = 0; i < n; i++) {
                app.world.insert(
                    new SoftBody({
                        algorithm: 'XPBD',
                        position: [i * 0.1, 2, 0],
                        mass: i === 0 ? 0 : 0.1,
                    }),
                );
            }
            for (let i = 0; i + 1 < n; i++) {
                app.world.insert(
                    new DistanceConstraint({ i, j: i + 1, restLength: 0.1, compliance: 1e-6 }),
                );
            }
        },
    },
    {
        name: 'fem',
        schema: FEMSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
            for (const position of block(64, 0.1, [0, 1, 0], 2)) {
                app.world.insert(new SoftBody({ algorithm: 'FEM', position, mass: 0.05 }));
            }
        },
    },
    {
        name: 'mpm-soft',
        schema: MPMSoftSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            ground(app);
            for (const [x, y, z] of block(512, 0.05, [-0.2, 0.3, -0.2], 3)) {
                app.world.insert(
                    new SoftBody({
                        schema: MPMSoftSchema,
                        data: { pos: [x, y, z, 1], ...IDENTITY_F },
                    }),
                );
            }
        },
    },
    {
        name: 'mpm-fluid',
        schema: MPMFluidSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            ground(app);
            for (const position of block(512, 0.05, [-0.2, 0.3, -0.2], 4)) {
                app.world.insert(new FluidBody({ algorithm: 'MPM', position }));
            }
        },
    },
    {
        name: 'sph',
        schema: SPHSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            ground(app);
            for (const position of block(1000, 0.05, [-0.25, 0.2, -0.25], 5)) {
                app.world.insert(new FluidBody({ algorithm: 'SPH', position }));
            }
        },
    },
    {
        name: 'pbf',
        schema: PBFSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            ground(app);
            for (const position of block(1000, 0.05, [-0.25, 0.2, -0.25], 6)) {
                app.world.insert(new FluidBody({ algorithm: 'PBF', position }));
            }
        },
    },
];

interface SceneRecord {
    readonly name: string;
    readonly pool: string;
    readonly count: number;
    readonly stride: number;
    /** Offset em bytes do pool no `.bin`. */
    readonly offset: number;
    /** Offsets (bytes) dos campos comparados com tolerância. */
    readonly fields: Record<string, number>;
    /** Desvio máximo entre duas execuções na gravação. */
    readonly runToRun: number;
    /** 0 ⇒ bit a bit. */
    readonly tolerance: number;
}

interface Manifest {
    readonly profile: string;
    readonly steps: number;
    readonly scenes: readonly SceneRecord[];
}

/** Erros capturados dos estágios (`captureErrors`): qualquer um reprova o smoke. */
const engineErrors: string[] = [];

async function createApp(): Promise<Application> {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
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
    return app;
}

/** Simula a cena e devolve o pool (bytes) e o schema dele. */
async function run(
    scene: Scene,
): Promise<{ bytes: Uint8Array; count: number; schema: StructSchema; profile: string }> {
    const app = await createApp();
    scene.build(app);
    app.step(1 / 60, STEPS);
    const schema = scene.schema;
    const spec = app.resources.poolBufferSpec(schema.name);
    if (spec === undefined) throw new Error(`pool ${schema.name} inexistente`);
    const count = app.resources.poolCount(schema.name);
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `trajectories_${scene.name}`,
        byteSize: spec.byteSize,
    });
    app.core.record('trajectories-readback', (frame) => {
        frame.copy(spec, staging, spec.byteSize);
    });
    app.core.submit();
    const all = new Uint8Array(await app.core.readback(staging));
    app.core.destroy(staging);
    const profile = gpuProfile(app);
    app.dispose();
    return { bytes: all.slice(0, count * schema.stride), count, schema, profile };
}

/** Desvio máximo absoluto nos campos `vec4f` (xyzw) de todos os elementos. */
function maxDeviation(
    a: Uint8Array,
    b: Uint8Array,
    count: number,
    stride: number,
    fields: Record<string, number>,
): number {
    const fa = new Float32Array(a.buffer, a.byteOffset, a.byteLength / 4);
    const fb = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    let m = 0;
    for (let e = 0; e < count; e++) {
        for (const off of Object.values(fields)) {
            const base = (e * stride + off) / 4;
            for (let k = 0; k < 4; k++) {
                const d = Math.abs(fa[base + k]! - fb[base + k]!);
                m = Math.max(m, Number.isNaN(d) ? Infinity : d);
            }
        }
    }
    return m;
}

function bitwiseEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
    return true;
}

/** Resumo para conferir que a cena simulou: altura média, faixa de altura e se há valores não finitos. */
function summary(bytes: Uint8Array, count: number, schema: StructSchema): string {
    const f = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const pos = schema.offsetOf('pos') / 4;
    const stride = schema.stride / 4;
    let sum = 0;
    let lo = Infinity;
    let hi = -Infinity;
    let finite = true;
    for (let e = 0; e < count; e++) {
        const y = f[e * stride + pos + 1]!;
        if (!Number.isFinite(y)) finite = false;
        sum += y;
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
    }
    return `y médio ${(sum / count).toFixed(3)} [${lo.toFixed(3)}, ${hi.toFixed(3)}]${finite ? '' : ' NÃO FINITO'}`;
}

function fieldOffsets(schema: StructSchema, names: readonly string[]): Record<string, number> {
    return Object.fromEntries(names.map((n) => [n, schema.offsetOf(n)]));
}

async function record(): Promise<void> {
    const records: SceneRecord[] = [];
    const chunks: Uint8Array[] = [];
    let offset = 0;
    let profile = 'unknown';
    for (const scene of SCENES) {
        const first = await run(scene);
        const second = await run(scene);
        profile = first.profile;
        const fields = fieldOffsets(first.schema, scene.fields);
        const same = bitwiseEqual(first.bytes, second.bytes);
        const runToRun = same
            ? 0
            : maxDeviation(first.bytes, second.bytes, first.count, first.schema.stride, fields);
        if (!Number.isFinite(runToRun)) throw new Error(`${scene.name}: NaN entre execuções`);
        records.push({
            name: scene.name,
            pool: scene.schema.name,
            count: first.count,
            stride: first.schema.stride,
            offset,
            fields,
            runToRun,
            tolerance: same ? 0 : 2 * runToRun,
        });
        chunks.push(first.bytes);
        offset += first.bytes.byteLength;
        log(
            `${scene.name}: ${first.count} elementos, ${summary(first.bytes, first.count, first.schema)}, ${same ? 'determinística (bit a bit)' : `desvio entre execuções ${runToRun.toExponential(2)}`}`,
        );
    }
    const bin = new Uint8Array(offset);
    let at = 0;
    for (const c of chunks) {
        bin.set(c, at);
        at += c.byteLength;
    }
    await writeFixture(`trajectories-${profile}.bin`, bin);
    await writeJsonFixture(`trajectories-${profile}.json`, {
        profile,
        steps: STEPS,
        scenes: records,
    } satisfies Manifest);
    log(`fixture gravada: trajectories-${profile}.{bin,json}`);
}

async function compare(): Promise<string[]> {
    const failures: string[] = [];
    let manifest: Manifest | null = null;
    let bin: Uint8Array | null = null;
    for (const scene of SCENES) {
        const current = await run(scene);
        if (manifest === null) {
            manifest = await readJsonFixture<Manifest>(`trajectories-${current.profile}.json`);
            bin = await readFixture(`trajectories-${current.profile}.bin`);
            if (manifest === null || bin === null) {
                return [`sem fixture para o perfil ${current.profile} (rode com --record)`];
            }
        }
        const rec = manifest.scenes.find((s) => s.name === scene.name);
        if (rec === undefined) {
            failures.push(`${scene.name}: ausente da fixture`);
            continue;
        }
        if (rec.count !== current.count || rec.stride !== current.schema.stride) {
            failures.push(
                `${scene.name}: forma mudou (${rec.count}×${rec.stride} → ${current.count}×${current.schema.stride})`,
            );
            continue;
        }
        const expected = bin!.subarray(rec.offset, rec.offset + rec.count * rec.stride);
        if (rec.tolerance === 0) {
            const ok = bitwiseEqual(expected, current.bytes);
            const dev = ok
                ? 0
                : maxDeviation(expected, current.bytes, rec.count, rec.stride, rec.fields);
            log(
                `${scene.name}: ${ok ? 'idêntica bit a bit' : `DIVERGIU (desvio ${dev.toExponential(2)})`}`,
            );
            if (!ok) failures.push(`${scene.name}: não é bit a bit (desvio ${dev})`);
        } else {
            const dev = maxDeviation(expected, current.bytes, rec.count, rec.stride, rec.fields);
            log(
                `${scene.name}: desvio ${dev.toExponential(2)} (tolerância ${rec.tolerance.toExponential(2)})`,
            );
            if (!(dev <= rec.tolerance))
                failures.push(`${scene.name}: desvio ${dev} > ${rec.tolerance}`);
        }
    }
    return failures;
}

async function main(): Promise<void> {
    if (recording()) {
        await record();
        if (engineErrors.length > 0) {
            log(`FAIL: erros nos estágios: ${[...new Set(engineErrors)].join(' | ')}`);
            return;
        }
        log('TRAJECTORIES SMOKE PASSED');
        return;
    }
    const failures = await compare();
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('TRAJECTORIES SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
