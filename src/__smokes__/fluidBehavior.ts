// Spec 030 — Smoke de comportamento de fluido: coesão (tensão superficial de Akinci), adesão às fronteiras, XSPH e
// viscosidade do MPM fluido, controlados pelo `ParticlePhysics`.
//
// Cada caso simula uma cena pequena por passos fixos de 1/60 s e lê o pool de volta (só aqui, para medir):
//   - gota alongada sem gravidade (SPH e PBF): com a coesão da água, razão de semieixos ≤ 1,15 em 3 s; sem, não (SC-001);
//   - jato esticado sem gravidade: com coesão, parte-se em ≥ 2 gotas (Rayleigh-Plateau); sem, vira um fio só (SC-002);
//   - barragem: com coesão, menos partículas isoladas na borda e energia que não cresce depois de assentar;
//   - menisco: com adesão, a superfície junto à parede fica ≥ meio espaçamento acima do centro; sem, não (SC-003);
//   - placa inclinada: com adesão, a gota leva ≥ 30% mais para descer e deixa partículas aderidas; sem, nenhuma
//     (SC-004);
//   - gota pousada: área de contato crescente com a adesão (0; 0,5; 1 × água) (SC-005);
//   - MPM fluido: viscosidade alta espalha ≥ 20% menos em 2 s (SC-006); XSPH alto dissipa mais;
//   - troca em execução: coesão ligada no passo N muda o estado a partir de N + 1 (idêntico até N);
//   - 30/60/144 Hz: mesma trajetória com coesão e adesão, no SPH e no PBF (SC-008);
//   - nenhum valor não finito em nenhum caso (SC-010).
// O estado final de cada caso é comparado bit a bit (hash) com a fixture `fluidBehavior-<perfil>.json`; `--record`
// roda cada caso duas vezes (exige determinismo) e grava.
//
// Para rodar: `npm run smoke -- fluidBehavior [--record]`. Resultado: `FLUIDBEHAVIOR SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    createScene,
    MPMFluidSchema,
    ParticlePhysics,
    PBFSchema,
    SPHSchema,
} from 'clayflow';
import type { StagingBufferSpec, StructSchema } from 'clayflow';
import { gpuProfile, readJsonFixture, recording, writeJsonFixture } from './support/fixtures';
import {
    axisRatio,
    center,
    components,
    contactArea,
    front,
    hashBytes,
    hasNaN,
    kinetic,
    sparse,
    surfaceHeight,
    type Particles,
} from './support/fluidMeasures';
import {
    buildBehavior,
    dam,
    drop,
    filament,
    meniscus,
    plateCoordinate,
    plateDistance,
    puddle,
    S,
    slope,
    TANK,
    type Algorithm,
    type BehaviorScene,
} from './support/fluidBehaviorScenes';

const QUERY = new URLSearchParams(location.search);
/** Coesão e adesão de referência (para calibrar, `--query wc=…&wa=…` as sobrepõe; a fixture vale só com as de referência). */
const WATER_C = Number(QUERY.get('wc') ?? ParticlePhysics.WATER_COHESION);
const WATER_A = Number(QUERY.get('wa') ?? ParticlePhysics.WATER_ADHESION);
/** Viscosidade alta do MPM (Pa·s): na escala de 0,4 m, o tempo viscoso L²ρ/μ fica abaixo de 1 s. */
const MPM_HIGH_VISCOSITY = Number(QUERY.get('mv') ?? 5000);
/** Alcance da vizinhança do SPH no espaçamento das cenas (2h = 2,6 s). */
const H_SPH = 2.6 * S;

function log(msg: string): void {
    console.log(`[fluidBehavior] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const SCHEMAS: Record<Algorithm, StructSchema> = {
    SPH: SPHSchema,
    PBF: PBFSchema,
    MPM: MPMFluidSchema,
};

/** Erros capturados dos estágios: qualquer um reprova o smoke. */
const engineErrors: string[] = [];

async function createApp(): Promise<Application> {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
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
    return app;
}

/** Pool do algoritmo lido de volta: bytes (para o hash) e posições/velocidades. */
async function read(
    app: Application,
    schema: StructSchema,
): Promise<{ bytes: Uint8Array; p: Particles }> {
    const spec = app.resources.poolBufferSpec(schema.name);
    if (spec === undefined) throw new Error(`pool ${schema.name} inexistente`);
    const count = app.resources.poolCount(schema.name);
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `fluid_behavior_${schema.name}`,
        byteSize: spec.byteSize,
    });
    app.core.record('fluid-behavior-readback', (frame) => {
        frame.copy(spec, staging, spec.byteSize);
    });
    app.core.submit();
    const all = new Uint8Array(await app.core.readback(staging));
    app.core.destroy(staging);
    const bytes = all.slice(0, count * schema.stride);
    const f = new Float32Array(bytes.buffer);
    const stride = schema.stride / 4;
    const po = schema.offsetOf('pos') / 4;
    const vo = schema.offsetOf('vel') / 4;
    const pos = new Float32Array(3 * count);
    const vel = new Float32Array(3 * count);
    for (let e = 0; e < count; e++)
        for (let k = 0; k < 3; k++) {
            pos[3 * e + k] = f[e * stride + po + k]!;
            vel[3 * e + k] = f[e * stride + vo + k]!;
        }
    return { bytes, p: { count, pos, vel } };
}

/** Uma simulação: monta a cena e avança `steps` passos fixos a `rate` Hz, com amostras a cada `every` passos. */
async function simulate(
    scene: BehaviorScene,
    steps: number,
    options: {
        rate?: number;
        every?: number;
        onSample?: (step: number, p: Particles) => void;
        onStep?: (step: number, material: ParticlePhysics) => void;
    } = {},
): Promise<{ bytes: Uint8Array; p: Particles; profile: string }> {
    const app = await createApp();
    const { material } = buildBehavior(app, scene);
    const schema = SCHEMAS[scene.algorithm];
    const rate = options.rate ?? 60;
    const frames = Math.round((steps * rate) / 60);
    let done = 0;
    for (let i = 0; i < frames; i++) {
        options.onStep?.(done, material);
        app.step(1 / rate);
        done += app.time.steps;
        if (options.every !== undefined && done % options.every === 0 && options.onSample) {
            options.onSample(done, (await read(app, schema)).p);
        }
    }
    if (done !== steps) throw new Error(`${done} passos (esperado ${steps})`);
    const out = await read(app, schema);
    const profile = gpuProfile(app);
    app.dispose();
    return { ...out, profile };
}

/** Resultado de um caso: estados finais (hash por rótulo), medidas e falhas. */
interface CaseResult {
    readonly hashes: Record<string, string>;
    readonly measures: Record<string, number>;
    readonly failures: string[];
}

type Case = () => Promise<CaseResult>;

/** Executa as simulações e junta hash, NaN e medidas. */
function collector() {
    const hashes: Record<string, string> = {};
    const measures: Record<string, number> = {};
    const failures: string[] = [];
    return {
        hashes,
        measures,
        failures,
        async run(
            label: string,
            scene: BehaviorScene,
            steps: number,
            extra: Parameters<typeof simulate>[2] = {},
        ) {
            const r = await simulate(scene, steps, extra);
            hashes[label] = hashBytes(r.bytes);
            if (hasNaN(r.p)) failures.push(`${label}: valores não finitos`);
            return r;
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

const CASES: Record<string, Case> = {
    async drop() {
        const c = collector();
        for (const algorithm of ['SPH', 'PBF'] as const) {
            const water = await c.run(`${algorithm}-water`, drop(algorithm, WATER_C), 180);
            const none = await c.run(`${algorithm}-zero`, drop(algorithm, 0), 180);
            const rw = c.measure(`${algorithm} razão com coesão`, axisRatio(water.p));
            const rz = c.measure(`${algorithm} razão sem coesão`, axisRatio(none.p));
            const gw = c.measure(`${algorithm} corpos com coesão`, components(water.p, 1.5 * S, 1));
            const gz = c.measure(`${algorithm} corpos sem coesão`, components(none.p, 1.5 * S, 1));
            // Gota = um corpo só e arredondado. Sem coesão o SPH continua alongado e o PBF se dispersa.
            c.check(
                gw === 1 && rw <= 1.15,
                `${algorithm}: sem gota com coesão (razão ${rw.toFixed(3)}, ${gw} corpos)`,
            );
            c.check(
                !(gz === 1 && rz <= 1.15),
                `${algorithm}: gota sem coesão (razão ${rz.toFixed(3)})`,
            );
        }
        return c.result();
    },

    async filament() {
        const c = collector();
        // Jato esticado (v = x · 1/s): o filete parado só se retrai numa gota nessa resolução (research, calibração).
        const water = await c.run('water', filament('SPH', WATER_C, [64, 3, 3], undefined, 1), 120);
        const none = await c.run('zero', filament('SPH', 0, [64, 3, 3], undefined, 1), 120);
        const nw = c.measure('gotas com coesão', components(water.p, 1.5 * S, 20));
        const nz = c.measure('gotas sem coesão', components(none.p, 1.5 * S, 20));
        c.check(nw >= 2, `jato com coesão não se partiu (${nw} componentes)`);
        c.check(nz <= 1, `jato sem coesão formou gotas (${nz} componentes)`);
        return c.result();
    },

    async dam() {
        const c = collector();
        const energy: number[] = [];
        const water = await c.run('water', dam('SPH', { cohesion: WATER_C }), 240, {
            every: 30,
            onSample: (_s, p) => energy.push(kinetic(p)),
        });
        const none = await c.run('zero', dam('SPH', { cohesion: 0 }), 240);
        // Soltas: menos de 4 vizinhas a 1,5 espaçamento (respingos e borda esgarçada).
        const iw = c.measure('soltas com coesão', sparse(water.p, 1.5 * S, 4));
        const iz = c.measure('soltas sem coesão', sparse(none.p, 1.5 * S, 4));
        c.check(iw < iz, `coesão não reduziu as partículas soltas (${iw} × ${iz})`);
        const late = energy.slice(-3);
        c.measure('energia final', late[late.length - 1] ?? 0);
        c.check(
            late.every((e, i) => i === 0 || e <= late[i - 1]! * 1.05 + 1e-4),
            `energia cresceu depois de assentar (${late.map((e) => e.toExponential(2)).join(' → ')})`,
        );
        return c.result();
    },

    async meniscus() {
        const c = collector();
        const rise = (p: Particles): number =>
            surfaceHeight(p, TANK - 2 * S, TANK, S) - surfaceHeight(p, -2 * S, 2 * S, S);
        const water = await c.run('water', meniscus(WATER_A, WATER_C), 240);
        const none = await c.run('zero', meniscus(0), 240);
        const dw = c.measure('subida junto à parede com adesão (m)', rise(water.p));
        const dz = c.measure('subida junto à parede sem adesão (m)', rise(none.p));
        c.check(dw >= 0.5 * S, `sem menisco com adesão (${(dw / S).toFixed(2)} s)`);
        c.check(dz < 0.5 * S, `menisco sem adesão (${(dz / S).toFixed(2)} s)`);
        return c.result();
    },

    async slope() {
        const c = collector();
        const run = async (label: string, adhesion: number) => {
            let arrival = Infinity;
            const r = await c.run(label, slope(adhesion, WATER_C), 240, {
                every: 5,
                onSample: (step, p) => {
                    if (arrival === Infinity && plateCoordinate(center(p)) >= 0.9) arrival = step;
                },
            });
            let stuck = 0;
            for (let i = 0; i < r.p.count; i++) {
                const q: [number, number, number] = [
                    r.p.pos[3 * i]!,
                    r.p.pos[3 * i + 1]!,
                    r.p.pos[3 * i + 2]!,
                ];
                if (plateDistance(q) < H_SPH && Math.abs(plateCoordinate(q)) < 0.9) stuck++;
            }
            return { arrival, stuck };
        };
        const w = await run('water', WATER_A);
        const z = await run('zero', 0);
        c.measure('passos até o fim da placa com adesão', w.arrival);
        c.measure('passos até o fim da placa sem adesão', z.arrival);
        c.measure('aderidas com adesão', w.stuck);
        c.measure('aderidas sem adesão', z.stuck);
        c.check(Number.isFinite(z.arrival), 'a gota sem adesão não desceu a placa');
        c.check(
            w.arrival >= 1.3 * z.arrival,
            `adesão não atrasou a descida (${w.arrival} × ${z.arrival} passos)`,
        );
        c.check(w.stuck > 0, 'nenhuma partícula aderida com adesão');
        c.check(z.stuck === 0, `${z.stuck} partículas aderidas sem adesão`);
        return c.result();
    },

    async puddle() {
        const c = collector();
        const areas: number[] = [];
        for (const k of [0, 0.5, 1]) {
            const r = await c.run(`adesão ${k}`, puddle(k * WATER_A, WATER_C), 180);
            areas.push(c.measure(`área com adesão ${k} × água (m²)`, contactArea(r.p, S, S)));
        }
        c.check(
            areas[0]! < areas[1]! && areas[1]! < areas[2]!,
            `área não cresce com a adesão (${areas.map((a) => a.toFixed(4)).join(', ')})`,
        );
        return c.result();
    },

    async material() {
        const c = collector();
        const spread = (p: Particles): number => front(p, 0) + TANK;
        const low = await c.run(
            'mpm-baixa',
            dam('MPM', { particleSpacing: 0.05, viscosity: 0.01 }, [8, 8, 8]),
            120,
        );
        const high = await c.run(
            'mpm-alta',
            dam('MPM', { particleSpacing: 0.05, viscosity: MPM_HIGH_VISCOSITY }, [8, 8, 8]),
            120,
        );
        const sl = c.measure('MPM frente com viscosidade baixa (m)', spread(low.p));
        const sh = c.measure('MPM frente com viscosidade alta (m)', spread(high.p));
        c.check(
            sh <= 0.8 * sl,
            `viscosidade do MPM não reduziu o espalhamento (${sh.toFixed(3)} × ${sl.toFixed(3)})`,
        );
        const k0 = await c.run('xsph-0', dam('SPH', { xsph: 0 }), 60);
        const k1 = await c.run('xsph-0.3', dam('SPH', { xsph: 0.3 }), 60);
        const e0 = c.measure('energia com XSPH 0', kinetic(k0.p));
        const e1 = c.measure('energia com XSPH 0,3', kinetic(k1.p));
        c.check(
            e1 < e0,
            `XSPH alto não dissipou mais (${e1.toExponential(2)} × ${e0.toExponential(2)})`,
        );
        for (const bad of [{ cohesion: -1 }, { adhesion: Number.NaN }, { xsph: -0.1 }]) {
            let message = '';
            try {
                new ParticlePhysics(bad);
            } catch (e) {
                message = e instanceof Error ? e.message : String(e);
            }
            const field = Object.keys(bad)[0]!;
            c.check(message.includes(field), `material inválido ${field} aceito`);
        }
        return c.result();
    },

    async live() {
        const c = collector();
        const N = 30;
        const enable = (step: number, material: ParticlePhysics): void => {
            if (step === N) material.data.cohesion = WATER_C;
        };
        const reference = await simulate(drop('SPH', 0), N);
        const untilN = await simulate(drop('SPH', 0), N, { onStep: enable });
        const off = await c.run('sempre-zero', drop('SPH', 0), N + 1);
        const on = await c.run('ligada-em-N', drop('SPH', 0), N + 1, { onStep: enable });
        c.check(
            hashBytes(reference.bytes) === hashBytes(untilN.bytes),
            'estado até o passo N mudou com a troca',
        );
        c.check(
            hashBytes(off.bytes) !== hashBytes(on.bytes),
            'coesão ligada em execução sem efeito no passo N + 1',
        );
        return c.result();
    },

    async rates() {
        const c = collector();
        for (const algorithm of ['SPH', 'PBF'] as const) {
            const scene = dam(algorithm, { cohesion: WATER_C, adhesion: WATER_A });
            const hashes: string[] = [];
            for (const rate of [60, 30, 144]) {
                const r = await c.run(`${algorithm}@${rate}Hz`, scene, 120, { rate });
                hashes.push(hashBytes(r.bytes));
            }
            c.check(
                new Set(hashes).size === 1,
                `${algorithm}: trajetória muda com a taxa de quadros (${hashes.join(' ')})`,
            );
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
    const fixture = `fluidBehavior-${profile}.json`;
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
        if (manifest === null)
            failures.push(`sem fixture para o perfil ${profile} (rode com --record)`);
        else
            for (const [name, hs] of Object.entries(hashes))
                for (const [k, v] of Object.entries(hs)) {
                    const expected = manifest.cases[name]?.[k];
                    if (expected !== v)
                        failures.push(`${name}/${k}: estado ${v} ≠ fixture ${expected ?? '—'}`);
                    else log(`${name}/${k}: idêntico à fixture`);
                }
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('FLUIDBEHAVIOR SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
