// Spec 005 — Smoke de trajetórias (R14, FR-036).
//
// Cada algoritmo de física (LCP, XPBD, FEM, MPM sólido e fluido, SPH, PBF) roda uma cena determinística por 240 passos
// fixos de 1/60 s; o pool de cada algoritmo é lido de volta da GPU.
// Spec 006 (FR-027): a comparação roda cada cena com quadros de 1/60, 1/30 e 1/144 s — o passo fixo do `Time` deve
// produzir a mesma trajetória em qualquer taxa de quadros (240 passos em 240, 120 ou 576 quadros).
//   - `--record`: roda (a 60 Hz) cada cena duas vezes, mede o desvio entre execuções (determinismo) e grava
//     `fixtures/trajectories-<perfil>.bin` (pools concatenados) + `.json` (cenas, strides, tolerâncias).
//   - padrão: compara com a fixture — bit a bit nas cenas determinísticas; nas demais, `pos`/`vel` dentro da
//     tolerância gravada (2 × desvio máximo entre execuções).
//
// Para rodar: `npm run smoke -- trajectories [--record]`. Resultado: `TRAJECTORIES SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    createScene,
    FluidBody,
    FEMSchema,
    LCPSchema,
    MPMFluidSchema,
    MPMSoftSchema,
    ParticleMaterial,
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
import { block, ground, gravity, rng, SPACING, tank } from './support/particleScenes';

const STEPS = 240;
/** Taxas de quadro comparadas com a mesma fixture (gravada a 60 Hz). */
const RATES = [60, 30, 144] as const;

function log(msg: string): void {
    console.log(`[trajectories] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

interface Scene {
    readonly name: string;
    /** Schema do algoritmo: o pool lido de volta é `schema.name`. */
    readonly schema: StructSchema;
    /** Campos `vec4f` comparados com tolerância quando a cena não é determinística. */
    readonly fields: readonly string[];
    readonly build: (app: Application) => void;
    /** Critérios físicos do estado final; mensagens de falha (vazio = ok). */
    readonly check: (view: PoolView) => string[];
}

/** Leitura tipada do pool lido de volta: `vec(e, campo)` devolve o `vec4f` do elemento `e`. */
interface PoolView {
    readonly count: number;
    vec(e: number, field: string): [number, number, number, number];
}

function poolView(bytes: Uint8Array, count: number, schema: StructSchema): PoolView {
    const f = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const stride = schema.stride / 4;
    return {
        count,
        vec(e, field) {
            const base = e * stride + schema.offsetOf(field) / 4;
            return [f[base]!, f[base + 1]!, f[base + 2]!, f[base + 3]!];
        },
    };
}

/** Bloco de 10×10×10 partículas centrado no tanque, base a 0,1 m do chão (altura média inicial ≈ 0,325 m). */
const FLUID_BLOCK = (seed: number): [number, number, number][] =>
    block(1000, SPACING, [-4.5 * SPACING, 0.1, -4.5 * SPACING], seed);
const FLUID_START_MEAN_Y = 0.1 + 4.5 * SPACING;

/** Critérios dos fluidos (R18): finitos, no domínio, acima do chão, assentados, abaixo da altura inicial. */
function fluidChecks(v: PoolView): string[] {
    const out: string[] = [];
    const min = ParticleMaterial.defaults.domainMin;
    const max = ParticleMaterial.defaults.domainMax;
    let sumY = 0;
    let sumSpeed = 0;
    let below = 0;
    let outside = 0;
    for (let e = 0; e < v.count; e++) {
        const p = v.vec(e, 'pos');
        const u = v.vec(e, 'vel');
        if (![p[0], p[1], p[2], u[0], u[1], u[2]].every(Number.isFinite))
            return ['valores não finitos'];
        if (p[1] < -SPACING / 2) below++;
        if (p.slice(0, 3).some((c, i) => c < min[i]! || c > max[i]!)) outside++;
        sumY += p[1];
        sumSpeed += Math.hypot(u[0], u[1], u[2]);
    }
    const meanY = sumY / v.count;
    const meanSpeed = sumSpeed / v.count;
    if (below > 0) out.push(`${below} partículas abaixo do chão`);
    if (outside > 0) out.push(`${outside} partículas fora do domínio`);
    if (!(meanSpeed < 0.25)) out.push(`não assentou: velocidade média ${meanSpeed.toFixed(3)} m/s`);
    if (!(meanY < FLUID_START_MEAN_Y)) out.push(`altura média ${meanY.toFixed(3)} não caiu`);
    return out;
}

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
        // Sobre o chão (|x|, |z| < 4): nenhum centro abaixo da superfície; quem rolou para fora do chão cai (registrado).
        check: (v) => {
            let sunk = 0;
            for (let e = 1; e < v.count; e++) {
                const p = v.vec(e, 'pos');
                if (!p.every(Number.isFinite)) return ['valores não finitos'];
                if (Math.abs(p[0]) < 4 && Math.abs(p[2]) < 4 && p[1] < -0.05) sunk++;
            }
            return sunk > 0 ? [`${sunk} corpos atravessaram o chão`] : [];
        },
    },
    {
        name: 'xpbd',
        schema: XPBDSoftSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            gravity(app);
            // Um corpo: 32 nós em corrente (o primeiro fixo) e 31 arestas internas.
            const n = 32;
            const links = Array.from({ length: n - 1 }, (_, i) => i);
            app.world.insert(
                new SoftBody({
                    algorithm: 'XPBD',
                    position: Array.from({ length: n }, (_, i) => [i * 0.1, 2, 0]).flat(),
                    mass: Array.from({ length: n }, (_, i) => (i === 0 ? 0 : 0.1)),
                    edges: {
                        a: links,
                        b: links.map((i) => i + 1),
                        restLength: links.map(() => 0.1),
                        compliance: 1e-6,
                    },
                }),
            );
        },
        // Ponto fixo parado; elos dentro de 5% do repouso (a corrente pendura, não estica).
        check: (v) => {
            const out: string[] = [];
            const p0 = v.vec(0, 'pos');
            if (Math.hypot(p0[0], p0[1] - 2, p0[2]) > 1e-6) out.push('ponto fixo se moveu');
            let worst = 0;
            for (let e = 0; e + 1 < v.count; e++) {
                const a = v.vec(e, 'pos');
                const b = v.vec(e + 1, 'pos');
                worst = Math.max(
                    worst,
                    Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.1 - 1),
                );
            }
            if (!(worst <= 0.05)) out.push(`elo esticado ${(worst * 100).toFixed(1)}%`);
            return out;
        },
    },
    {
        name: 'fem',
        schema: FEMSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            gravity(app);
            const position = block(64, 0.1, [0, 1, 0], 2).flat();
            app.world.insert(new SoftBody({ algorithm: 'FEM', position, mass: 0.05 }));
        },
        // O FEM só integra gravidade (A5): nós independentes com a mesma dinâmica — o bloco cai sem deformar.
        check: (v) => {
            let lo = Infinity;
            let hi = -Infinity;
            for (let e = 0; e < v.count; e++) {
                const y = v.vec(e, 'pos')[1];
                if (!Number.isFinite(y)) return ['valores não finitos'];
                lo = Math.min(lo, y);
                hi = Math.max(hi, y);
            }
            const out: string[] = [];
            if (!(hi < 0)) out.push('o bloco não caiu');
            if (!(Math.abs(hi - lo - 0.3) < 0.03))
                out.push(`o bloco deformou (altura ${(hi - lo).toFixed(3)})`);
            return out;
        },
    },
    {
        name: 'mpm-soft',
        schema: MPMSoftSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            tank(app);
            const position = block(512, SPACING, [-3.5 * SPACING, 0.1, -3.5 * SPACING], 3).flat();
            app.world.insert(new SoftBody({ algorithm: 'MPM', position }));
        },
        // Sólido elástico: assenta inteiro sobre o chão, sem se espalhar além da largura inicial + 50%.
        check: (v) => {
            const out = fluidChecks(v).filter((m) => !m.startsWith('altura'));
            let spread = 0;
            for (let e = 0; e < v.count; e++) {
                const p = v.vec(e, 'pos');
                spread = Math.max(spread, Math.abs(p[0]), Math.abs(p[2]));
            }
            if (!(spread < 1.5 * 4 * SPACING))
                out.push(`o sólido se espalhou (${spread.toFixed(3)} m)`);
            return out;
        },
    },
    {
        name: 'mpm-fluid',
        schema: MPMFluidSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            tank(app);
            app.world.insert(new FluidBody({ algorithm: 'MPM', position: FLUID_BLOCK(4).flat() }));
        },
        check: fluidChecks,
    },
    {
        name: 'sph',
        schema: SPHSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            tank(app);
            app.world.insert(new FluidBody({ algorithm: 'SPH', position: FLUID_BLOCK(5).flat() }));
        },
        // Além dos critérios gerais: densidade mediana (pos.w) em ±15% de ρ₀ — a superfície fica abaixo, o miolo perto.
        check: (v) => {
            const out = fluidChecks(v);
            const rho = Array.from({ length: v.count }, (_, e) => v.vec(e, 'pos')[3]).sort(
                (a, b) => a - b,
            );
            const median = rho[Math.floor(rho.length / 2)]!;
            const rho0 = ParticleMaterial.defaults.restDensity;
            if (!(Math.abs(median / rho0 - 1) <= 0.15))
                out.push(`densidade mediana ${median.toFixed(0)} kg/m³`);
            return out;
        },
    },
    {
        name: 'pbf',
        schema: PBFSchema,
        fields: ['pos', 'vel'],
        build: (app) => {
            tank(app);
            app.world.insert(new FluidBody({ algorithm: 'PBF', position: FLUID_BLOCK(6).flat() }));
        },
        check: fluidChecks,
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
    rate = 60,
): Promise<{ bytes: Uint8Array; count: number; schema: StructSchema; profile: string }> {
    const app = await createApp();
    scene.build(app);
    // Passo fixo de 1/60 s com teto de 4 passos por quadro: STEPS passos em STEPS × rate / 60 quadros.
    const frames = Math.round((STEPS * rate) / 60);
    let steps = 0;
    for (let i = 0; i < frames; i++) {
        app.step(1 / rate);
        steps += app.time.steps;
    }
    if (steps !== STEPS)
        throw new Error(`${scene.name} @${rate} Hz: ${steps} passos (esperado ${STEPS})`);
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

async function record(): Promise<string[]> {
    const failures: string[] = [];
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
        for (const f of scene.check(poolView(first.bytes, first.count, first.schema))) {
            failures.push(`${scene.name}: ${f}`);
        }
        log(
            `${scene.name}: ${first.count} elementos, ${summary(first.bytes, first.count, first.schema)}, ${same ? 'determinística (bit a bit)' : `desvio entre execuções ${runToRun.toExponential(2)}`}`,
        );
    }
    if (failures.length > 0 || engineErrors.length > 0) return failures;
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
    return failures;
}

async function compare(): Promise<string[]> {
    const failures: string[] = [];
    let manifest: Manifest | null = null;
    let bin: Uint8Array | null = null;
    for (const rate of RATES)
        for (const scene of SCENES) {
            const label = `${scene.name}@${rate}Hz`;
            const current = await run(scene, rate);
            if (manifest === null) {
                manifest = await readJsonFixture<Manifest>(`trajectories-${current.profile}.json`);
                bin = await readFixture(`trajectories-${current.profile}.bin`);
                if (manifest === null || bin === null) {
                    return [`sem fixture para o perfil ${current.profile} (rode com --record)`];
                }
            }
            const rec = manifest.scenes.find((s) => s.name === scene.name);
            if (rec === undefined) {
                failures.push(`${label}: ausente da fixture`);
                continue;
            }
            if (rec.count !== current.count || rec.stride !== current.schema.stride) {
                failures.push(
                    `${label}: forma mudou (${rec.count}×${rec.stride} → ${current.count}×${current.schema.stride})`,
                );
                continue;
            }
            for (const f of scene.check(poolView(current.bytes, current.count, current.schema))) {
                failures.push(`${label}: ${f}`);
            }
            const expected = bin!.subarray(rec.offset, rec.offset + rec.count * rec.stride);
            if (rec.tolerance === 0) {
                const ok = bitwiseEqual(expected, current.bytes);
                const dev = ok
                    ? 0
                    : maxDeviation(expected, current.bytes, rec.count, rec.stride, rec.fields);
                log(
                    `${label}: ${ok ? 'idêntica bit a bit' : `DIVERGIU (desvio ${dev.toExponential(2)})`}`,
                );
                if (!ok) failures.push(`${label}: não é bit a bit (desvio ${dev})`);
            } else {
                const dev = maxDeviation(
                    expected,
                    current.bytes,
                    rec.count,
                    rec.stride,
                    rec.fields,
                );
                log(
                    `${label}: desvio ${dev.toExponential(2)} (tolerância ${rec.tolerance.toExponential(2)})`,
                );
                if (!(dev <= rec.tolerance))
                    failures.push(`${label}: desvio ${dev} > ${rec.tolerance}`);
            }
        }
    return failures;
}

async function main(): Promise<void> {
    if (recording()) {
        const failures = await record();
        failures.push(...new Set(engineErrors));
        if (failures.length > 0) log(`FAIL: (fixture não gravada) ${failures.join(' | ')}`);
        else log('TRAJECTORIES SMOKE PASSED');
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
