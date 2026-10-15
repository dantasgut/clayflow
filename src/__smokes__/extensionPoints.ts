// Spec 009 — Smoke dos pontos de extensão matemáticos: funções WGSL do usuário em `transform`, `camera`, `field`,
// `emit`, `surface`, `space` e `material`, compostas e validadas pelo núcleo.
//
// Cada caso monta uma cena pequena, avança por passos fixos e lê de volta (só aqui, para medir) o que precisa:
//   - órbita: 100 objetos com `transform` do usuário seguem a equação (≤ 1e-4 × raio), os parados ficam no TRS, a
//     30/60/144 Hz (SC-002);
//   - olho de peixe: `camera` com projeção de ponto (SC-003);
//   - campos: vento, vórtice, arrasto, empuxo e um campo do usuário em todos os solvers (SC-004);
//   - emissores: contagem viva em taxa × vida, nascimento dentro da forma, emissor do usuário (SC-005);
//   - superfícies: esfera analítica × numérica, homotopia, terreno, torção `space`, xadrez por `material` (SC-006);
//   - troca e erros: troca em execução no quadro seguinte; assinatura, símbolo e compilação rejeitados sem parar a
//     cena (SC-007).
// O estado de cada caso é comparado bit a bit (hash) com a fixture `extensionPoints-<perfil>.json`; `--record` roda
// cada caso duas vezes (exige determinismo) e grava.
//
// Para rodar: `npm run smoke -- extensionPoints [--record] [--query case=orbit.fields]`. Resultado:
// `EXTENSIONPOINTS SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    BoxGeometry,
    Camera,
    CameraFunction,
    createScene,
    DirectionalLight,
    StandardMaterial,
    Transform,
    TransformFunction,
} from 'clayflow';
import * as clayflow from 'clayflow';
import type { EntityId } from 'clayflow';
import {
    capture,
    CHECKER_CODE,
    HOMOTOPY_CODE,
    readBuffer,
    SPHERE_ANALYTIC_CODE,
    TWIST_CODE,
    TWIST_JACOBIAN_CODE,
    SPIRAL_EMIT_CODE,
    readPool,
    meanOf,
    PUSH_CODE,
    RING_CODE,
    solverBodies,
    type FieldSolver,
    FISHEYE_CODE,
    ORBIT_CODE,
    readWorlds,
    settle,
    SPIRAL_CODE,
} from './support/extensionScenes';
import { gpuProfile, readJsonFixture, recording, writeJsonFixture } from './support/fixtures';
import { hashBytes } from './support/fluidMeasures';

function log(msg: string): void {
    console.log(`[extensionPoints] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

/** Erros capturados dos estágios: qualquer um reprova o smoke. */
const engineErrors: string[] = [];
/** Um caso de erro esperado está rodando (rejeições não reprovam). */
let expectRejections = false;

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
    // Rejeições inesperadas reprovam (os casos de erro esperado tiram o ouvinte).
    app.events.on('extensionRejected', (e) => {
        if (!expectRejections)
            engineErrors.push(`extensionRejected ${e.point}:${e.line}: ${e.message}`);
    });
    return app;
}

/** Resultado de um caso: estados finais (hash por rótulo), medidas e falhas. */
interface CaseResult {
    readonly hashes: Record<string, string>;
    readonly measures: Record<string, number>;
    readonly failures: string[];
}

type Case = () => Promise<CaseResult>;

/** Junta hashes, medidas e falhas de um caso. */
function collector() {
    const hashes: Record<string, string> = {};
    const measures: Record<string, number> = {};
    const failures: string[] = [];
    return {
        hash(label: string, bytes: Uint8Array): void {
            hashes[label] = hashBytes(bytes);
        },
        /** Registra um hash já calculado. */
        hashValue(label: string, value: string): void {
            hashes[label] = value;
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

/** Órbita: 100 objetos com a função (raio 2, período 4 s, fase por objeto) e 10 parados no TRS. */
async function orbitScene(rate: number, steps: number) {
    const app = await createApp();
    const moving: { id: EntityId; fn: TransformFunction; phase: number; y: number }[] = [];
    for (let i = 0; i < 100; i++) {
        const phase = (i * Math.PI * 2) / 100;
        const y = (i % 10) * 0.1;
        const fn = new TransformFunction({
            code: ORBIT_CODE,
            params: { radius: 'f32', period: 'f32', phase: 'f32' },
            values: { radius: 2, period: 4, phase },
        });
        const box = new BoxGeometry({ size: [0.1, 0.1, 0.1] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, y, 0, 1] }))
            .add(fn);
        moving.push({ id: app.world.insert(box), fn, phase, y });
    }
    const still: { id: EntityId; x: number }[] = [];
    for (let i = 0; i < 10; i++) {
        const x = i - 4.5;
        const box = new BoxGeometry({ size: [0.1, 0.1, 0.1] })
            .add(new StandardMaterial())
            .add(new Transform({ position: [x, -1, 0, 1] }));
        still.push({ id: app.world.insert(box), x });
    }
    await settle(app);
    const frames = Math.round((steps * rate) / 60);
    for (let k = 0; k < frames; k++) app.step(1 / rate);
    return { app, moving, still };
}

/** Dois nós XPBD ligados (1 cm), a partir de `p` em x. */
function xpbdPair(p: readonly [number, number, number]) {
    return new clayflow.SoftBody({
        algorithm: 'XPBD',
        position: [p[0], p[1], p[2], p[0] + 0.01, p[1], p[2]],
        mass: [0.1, 0.1],
        edges: { a: [0], b: [1], restLength: [0.01], compliance: 1e-6 },
    });
}

const CASES: Record<string, Case> = {
    /** SC-002: posição pela equação (≤ 1e-4 × raio), parados no TRS, mesma matriz a 30/60/144 Hz; valores em execução. */
    async orbit() {
        const c = collector();
        const R = 2;
        let reference: Uint8Array | undefined;
        for (const rate of [60, 30, 144]) {
            const { app, moving, still } = await orbitScene(rate, 120);
            const t = app.time.simulated;
            c.check(Math.abs(t - 2) < 1e-9, `${rate} Hz: tempo simulado ${t} (esperado 2)`);
            const { bytes, worlds } = await readWorlds(app, [
                ...moving.map((m) => m.id),
                ...still.map((s) => s.id),
            ]);
            let worst = 0;
            moving.forEach((m, i) => {
                const a = (2 * Math.PI * t) / 4 + m.phase;
                const w = worlds[i]!;
                worst = Math.max(
                    worst,
                    Math.hypot(w[12]! - R * Math.cos(a), w[13]! - m.y, w[14]! - R * Math.sin(a)),
                );
            });
            c.measure(`${rate} Hz erro máximo / raio`, worst / R);
            c.check(worst / R <= 1e-4, `${rate} Hz: órbita fora da equação (${worst / R})`);
            still.forEach((s, i) => {
                const w = worlds[moving.length + i]!;
                if (w[12] !== s.x || w[13] !== -1 || w[14] !== 0)
                    c.check(
                        false,
                        `${rate} Hz: objeto parado fora do TRS (${w[12]}, ${w[13]}, ${w[14]})`,
                    );
            });
            if (reference === undefined) {
                reference = bytes;
                c.hash('worlds', bytes);
            } else if (hashBytes(bytes) !== hashBytes(reference)) {
                c.check(false, `${rate} Hz: matrizes diferentes das de 60 Hz`);
            }
            if (rate === 60) {
                // Parâmetro em execução: raio 3 no primeiro objeto, quadro seguinte, sem recompilar.
                moving[0]!.fn.values.radius = 3;
                app.step(1 / 60);
                const t2 = app.time.simulated;
                const w = (await readWorlds(app, [moving[0]!.id])).worlds[0]!;
                const a = (2 * Math.PI * t2) / 4 + moving[0]!.phase;
                const err = Math.hypot(w[12]! - 3 * Math.cos(a), w[14]! - 3 * Math.sin(a));
                c.measure('raio novo: erro', err);
                c.check(err <= 3e-4, `valor em execução não aplicado no quadro seguinte (${err})`);
            }
            app.dispose();
        }
        return c.result();
    },

    /** SC-007: troca do código em execução (órbita → espiral): vale ao compilar, sem realocar os dados. */
    async swap() {
        const c = collector();
        const { app, moving } = await orbitScene(60, 60);
        const worldsBefore = app.resources.poolBufferSpec('WorldTransform');
        for (const m of moving) m.fn.setCode(SPIRAL_CODE);
        // O código novo compila em segundo plano; até lá, a órbita continua.
        await settle(app);
        app.step(1 / 60);
        const t = app.time.simulated;
        const { worlds } = await readWorlds(
            app,
            moving.map((m) => m.id),
        );
        let worst = 0;
        moving.forEach((m, i) => {
            const a = (2 * Math.PI * t) / 4 + m.phase;
            const r = 2 * (1 + 0.25 * t);
            const w = worlds[i]!;
            worst = Math.max(
                worst,
                Math.hypot(
                    w[12]! - r * Math.cos(a),
                    w[13]! - (m.y + 0.1 * t),
                    w[14]! - r * Math.sin(a),
                ),
            );
        });
        c.measure('espiral: erro máximo / raio', worst / 2);
        c.check(worst / 2 <= 1e-4, `a troca não passou a valer (${worst / 2})`);
        c.check(
            app.resources.poolBufferSpec('WorldTransform') === worldsBefore,
            'a troca realocou o pool de matrizes',
        );
        app.dispose();
        return c.result();
    },

    /**
     * SC-004: o mesmo campo dá a mesma aceleração (≤ 1 %) em todos os solvers — vento pronto e uma função do usuário
     * (aceleração constante em z), sem gravidade; velocidade média depois de 0,1 s = a · t.
     */
    async fields() {
        const c = collector();
        const solvers: FieldSolver[] = [
            'lcp',
            'xpbd',
            'fem',
            'mpm-soft',
            'mpm-fluid',
            'sph',
            'pbf',
        ];
        const T = 6;
        for (const solver of solvers) {
            const app = await createApp();
            app.world.insert(new clayflow.GravityField({ acceleration: [0, 0, 0, 0] }));
            app.world.insert(new clayflow.WindField({ direction: [1, 0, 0, 0], magnitude: 2 }));
            app.world.insert(
                new clayflow.FieldFunction({
                    code: PUSH_CODE,
                    params: { a: 'f32' },
                    values: { a: 1.5 },
                }),
            );
            const schema = solverBodies(app, solver, clayflow);
            await settle(app);
            for (let k = 0; k < T; k++) app.step(1 / 60);
            const v = await meanOf(app, schema, 'vel');
            // O FEM multiplica a velocidade por 0,95 a cada passo (amortecimento do solver): v = a·dt·Σ 0,95^k.
            const t =
                solver === 'fem'
                    ? Array.from({ length: T }, (_, k) => 0.95 ** (k + 1) / 60).reduce(
                          (a, b) => a + b,
                          0,
                      )
                    : T / 60;
            const ex = c.measure(`${solver}: vento / esperado`, v[0] / (2 * t));
            const ez = c.measure(`${solver}: função / esperado`, v[2] / (1.5 * t));
            c.check(Math.abs(ex - 1) <= 0.01, `${solver}: vento fora de 1 % (${ex})`);
            c.check(Math.abs(ez - 1) <= 0.01, `${solver}: função do usuário fora de 1 % (${ez})`);
            app.dispose();
        }
        return c.result();
    },

    /** Vórtice (giro em torno do eixo), arrasto (velocidade terminal), empuxo (o mais leve sobe). */
    async builtinFields() {
        const c = collector();
        {
            // Vórtice em y, sem gravidade: corpo a 1 m do eixo ganha velocidade tangencial a·t, a = m·e^(−f·d).
            const app = await createApp();
            app.world.insert(new clayflow.GravityField({ acceleration: [0, 0, 0, 0] }));
            app.world.insert(
                new clayflow.VortexField({
                    axis: [0, 1, 0, 0],
                    center: [0, 0, 0, 1],
                    magnitude: 3,
                    falloff: 0.5,
                }),
            );
            app.world.insert(xpbdPair([1, 1, 0]));
            await settle(app);
            for (let k = 0; k < 6; k++) app.step(1 / 60);
            const v = await meanOf(app, clayflow.XPBDSoftSchema, 'vel');
            const expected = 3 * Math.exp(-0.5 * 1.005) * 0.1;
            // Tangente de y × (1, 0, 0) = (0, 0, −1).
            const ratio = c.measure('vórtice: −vz / esperado', -v[2] / expected);
            c.check(Math.abs(ratio - 1) <= 0.02, `vórtice fora (${ratio})`);
            app.dispose();
        }
        {
            // Arrasto linear com vento: v → a/c (1 − e^(−c·t)).
            const app = await createApp();
            app.world.insert(new clayflow.GravityField({ acceleration: [0, 0, 0, 0] }));
            app.world.insert(new clayflow.WindField({ direction: [1, 0, 0, 0], magnitude: 2 }));
            app.world.insert(new clayflow.DragField({ linearCoeff: 1, quadraticCoeff: 0 }));
            app.world.insert(xpbdPair([0, 1, 0]));
            await settle(app);
            for (let k = 0; k < 180; k++) app.step(1 / 60);
            const v = await meanOf(app, clayflow.XPBDSoftSchema, 'vel');
            // O XPBD amortece 0,05/s por conta própria: coeficiente efetivo 1,05.
            const expected = (2 / 1.05) * (1 - Math.exp(-1.05 * 3));
            const ratio = c.measure('arrasto: v / esperado', v[0] / expected);
            c.check(Math.abs(ratio - 1) <= 0.02, `arrasto fora (${ratio})`);
            app.dispose();
        }
        {
            // Empuxo: meio com o dobro da densidade do fluido SPH — sobe com g · (2 − 1) contra a gravidade.
            const app = await createApp();
            app.world.insert(new clayflow.GravityField({ acceleration: [0, -9.81, 0, 0] }));
            app.world.insert(
                new clayflow.BuoyancyField({ fluidDensity: 2000, fluidLevel: 5, gravity: 9.81 }),
            );
            solverBodies(app, 'fem', clayflow);
            const sph = solverBodies(app, 'sph', clayflow);
            await settle(app);
            for (let k = 0; k < 6; k++) app.step(1 / 60);
            const fluid = await meanOf(app, sph, 'vel');
            const node = await meanOf(app, clayflow.FEMSchema, 'vel');
            const up = c.measure('empuxo: vy do fluido / g·t', fluid[1] / (9.81 * 0.1));
            c.check(Math.abs(up - 1) <= 0.03, `empuxo no fluido fora (${up})`);
            // FEM sem densidade: o empuxo não age (cai com a gravidade).
            c.check(node[1] < 0, `nó sem densidade subiu (${node[1]})`);
            app.dispose();
        }
        return c.result();
    },

    /** Campo do usuário: atração para um anel com arrasto — ≥ 90 % dos nós a menos de 0,1 m do anel em 5 s. */
    async ring() {
        const c = collector();
        const app = await createApp();
        app.world.insert(new clayflow.GravityField({ acceleration: [0, 0, 0, 0] }));
        app.world.insert(new clayflow.DragField({ linearCoeff: 2, quadraticCoeff: 0 }));
        app.world.insert(
            new clayflow.FieldFunction({
                code: RING_CODE,
                params: { radius: 'f32', y: 'f32', k: 'f32' },
                values: { radius: 1, y: 1, k: 6 },
            }),
        );
        const r = (i: number): number => ((i * 9301 + 49297) % 233280) / 233280;
        const position: number[] = [];
        for (let i = 0; i < 64; i++)
            position.push(r(3 * i) * 4 - 2, r(3 * i + 1) * 2, r(3 * i + 2) * 4 - 2);
        app.world.insert(new clayflow.SoftBody({ algorithm: 'FEM', position, mass: 0.05 }));
        await settle(app);
        for (let k = 0; k < 300; k++) app.step(1 / 60);
        const bytes = await readPool(app, clayflow.FEMSchema.name);
        const f = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
        const stride = clayflow.FEMSchema.stride / 4;
        const at = clayflow.FEMSchema.offsetOf('pos') / 4;
        let near = 0;
        for (let e = 0; e < 64; e++) {
            const x = f[e * stride + at]!;
            const y = f[e * stride + at + 1]!;
            const z = f[e * stride + at + 2]!;
            if (Math.hypot(Math.hypot(x, z) - 1, y - 1) < 0.1) near++;
        }
        const share = c.measure('anel: fração a < 0,1 m', near / 64);
        c.check(share >= 0.9, `só ${(share * 100).toFixed(0)} % no anel`);
        c.hash('ring', bytes);
        app.dispose();
        return c.result();
    },

    /**
     * SC-005: emissor em cone (1 000/s, vida 2 s) — vivas em regime = taxa × vida ± 1 %; toda partícula nasce dentro
     * do cone (sem gravidade, a velocidade não muda). Emissor do usuário (espiral pelo índice): posições pela função.
     */
    async emitters() {
        const c = collector();
        const read = async (app: Application, emitter: clayflow.ComputeParticleEmitter) => {
            const spec = app.resources.bufferOf(emitter, 'particles');
            if (spec === undefined) throw new Error('emissor sem buffer de partículas');
            const staging = app.core.create<clayflow.StagingBufferSpec>({
                kind: 'buffer',
                subkind: 'staging',
                discriminator: `emitter_readback_${spec.byteSize}`,
                byteSize: spec.byteSize,
            });
            app.core.record('emitter-readback', (frame) => {
                frame.copy(spec, staging, spec.byteSize);
            });
            app.core.submit();
            const bytes = new Uint8Array(await app.core.readback(staging));
            app.core.destroy(staging);
            return bytes;
        };
        {
            const app = await createApp();
            app.world.insert(new clayflow.GravityField({ acceleration: [0, 0, 0, 0] }));
            const half = Math.PI / 8;
            const emitter = new clayflow.ComputeParticleEmitter({
                maxParticles: 4096,
                rate: 1000,
                lifetime: 2,
                shape: new clayflow.ConeEmitterShape([0, 0, 0], [0, 1, 0], half, 2),
            });
            app.world.insert(
                emitter
                    .add(new clayflow.PointCloudGeometry({ maxPoints: 4096 }))
                    .add(new clayflow.PointSpriteMaterial())
                    .add(new Transform()),
            );
            await settle(app);
            for (let k = 0; k < 300; k++) app.step(1 / 60);
            const bytes = await read(app, emitter);
            const f = new Float32Array(bytes.buffer);
            let alive = 0;
            let outside = 0;
            for (let i = 0; i < 4096; i++) {
                const o = i * 16;
                if (!(f[o + 9]! > 0)) continue;
                alive++;
                const v = [f[o + 4]!, f[o + 5]!, f[o + 6]!];
                const cos = v[1]! / Math.hypot(...v);
                if (cos < Math.cos(half) - 1e-5) outside++;
            }
            c.measure('cone: vivas', alive);
            c.check(
                Math.abs(alive / 2000 - 1) <= 0.01,
                `cone: ${alive} vivas (esperado 2000 ± 1 %)`,
            );
            c.check(outside === 0, `cone: ${outside} partículas fora do cone`);
            app.dispose();
        }
        {
            const app = await createApp();
            app.world.insert(new clayflow.GravityField({ acceleration: [0, 0, 0, 0] }));
            const emitter = new clayflow.ComputeParticleEmitter({
                maxParticles: 512,
                rate: 60,
                lifetime: 100,
            });
            app.world.insert(
                emitter
                    .add(new clayflow.PointCloudGeometry({ maxPoints: 512 }))
                    .add(new clayflow.PointSpriteMaterial())
                    .add(new Transform())
                    .add(
                        new clayflow.EmitFunction({
                            code: SPIRAL_EMIT_CODE,
                            params: { radius: 'f32' },
                            values: { radius: 0.5 },
                        }),
                    ),
            );
            await settle(app);
            for (let k = 0; k < 120; k++) app.step(1 / 60);
            const bytes = await read(app, emitter);
            const f = new Float32Array(bytes.buffer);
            let worst = 0;
            let alive = 0;
            for (let i = 0; i < 512; i++) {
                const o = i * 16;
                if (!(f[o + 9]! > 0)) continue;
                alive++;
                const a = i * 0.1;
                worst = Math.max(
                    worst,
                    Math.hypot(
                        f[o]! - 0.5 * Math.cos(a),
                        f[o + 1]! - i * 0.01,
                        f[o + 2]! - 0.5 * Math.sin(a),
                    ),
                );
            }
            c.measure('espiral: vivas', alive);
            c.measure('espiral: erro máximo (m)', worst);
            c.check(alive === 120, `espiral: ${alive} vivas (esperado 120)`);
            c.check(worst <= 1e-5, `espiral fora da função (${worst})`);
            c.hash('spiral', bytes);
            app.dispose();
        }
        return c.result();
    },

    /**
     * SC-006: esfera de raio 1 em 64 × 32 — raio ≤ 1e-5 e normal radial ≤ 0,5°, pela pronta (diferenças centrais) e pela
     * função com derivadas analíticas; homotopia esfera ↔ toro animada (finita e mudando); terreno por ruído.
     */
    async surfaces() {
        const c = collector();
        const evalSurface = async (
            surface: clayflow.ParametricSurface,
            fn?: clayflow.SurfaceFunction,
            frames = 1,
        ) => {
            const app = await createApp();
            const entity = surface.add(new StandardMaterial()).add(new Transform());
            if (fn !== undefined) entity.add(fn);
            app.world.insert(entity);
            await settle(app);
            const shots: Float32Array[] = [];
            for (let k = 0; k < frames; k++) {
                app.step(1 / 60);
                const spec = app.resources.bufferOf(surface, 'vertices');
                if (spec === undefined) throw new Error('superfície sem vértices');
                shots.push(await readBuffer(app, spec, `surface_${k}`));
                for (let j = 0; j < 20; j++) app.step(1 / 60);
            }
            app.dispose();
            return shots;
        };
        const sphereErrors = (v: Float32Array, n: number) => {
            let radius = 0;
            let angle = 0;
            let worstAt = '';
            for (let i = 0; i < n; i++) {
                const o = i * 8;
                const p = [v[o]!, v[o + 1]!, v[o + 2]!];
                const r = Math.hypot(...p);
                radius = Math.max(radius, Math.abs(r - 1));
                const dot = (p[0]! * v[o + 3]! + p[1]! * v[o + 4]! + p[2]! * v[o + 5]!) / r;
                const deg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
                if (!(deg <= angle)) {
                    angle = deg;
                    worstAt = `${i} p=${p.map((x) => x.toFixed(3)).join(',')} n=${[v[o + 3]!, v[o + 4]!, v[o + 5]!].map((x) => x.toFixed(3)).join(',')}`;
                }
            }
            if (angle > 0.5) log(`pior normal: ${worstAt}`);
            return { radius, angle };
        };
        const numeric = (
            await evalSurface(
                new clayflow.ParametricSurface({ preset: 'sphere', resolution: [64, 32] }),
            )
        )[0]!;
        const analytic = (
            await evalSurface(
                new clayflow.ParametricSurface({
                    resolution: [64, 32],
                    domain: [0, 2 * Math.PI, 0, Math.PI],
                }),
                new clayflow.SurfaceFunction({
                    code: SPHERE_ANALYTIC_CODE,
                    params: { r: 'f32' },
                    values: { r: 1 },
                }),
            )
        )[0]!;
        for (const [label, v] of [
            ['numérica', numeric],
            ['analítica', analytic],
        ] as const) {
            const e = sphereErrors(v, 64 * 32);
            c.measure(`esfera ${label}: erro de raio`, e.radius);
            c.measure(`esfera ${label}: ângulo da normal (°)`, e.angle);
            c.check(e.radius <= 1e-5, `esfera ${label}: raio fora (${e.radius})`);
            c.check(e.angle <= 0.5, `esfera ${label}: normal fora (${e.angle}°)`);
        }
        c.hash('sphere', new Uint8Array(numeric.buffer));
        const homotopy = await evalSurface(
            new clayflow.ParametricSurface({
                resolution: [48, 24],
                domain: [0, 2 * Math.PI, 0, Math.PI],
                animated: true,
            }),
            new clayflow.SurfaceFunction({
                code: HOMOTOPY_CODE,
                params: { speed: 'f32' },
                values: { speed: 3 },
            }),
            2,
        );
        const finite = homotopy.every((v) => v.every(Number.isFinite));
        let moved = 0;
        for (let i = 0; i < homotopy[0]!.length; i++)
            moved = Math.max(moved, Math.abs(homotopy[0]![i]! - homotopy[1]![i]!));
        c.measure('homotopia: maior mudança entre quadros', moved);
        c.check(finite, 'homotopia com valores não finitos');
        c.check(moved > 0.05, `homotopia parada (${moved})`);
        const terrain = (
            await evalSurface(
                new clayflow.ParametricSurface({ preset: 'terrain', resolution: [64, 64] }),
            )
        )[0]!;
        let top = 0;
        let up = Infinity;
        for (let i = 0; i < 64 * 64; i++) {
            top = Math.max(top, Math.abs(terrain[i * 8 + 1]!));
            up = Math.min(up, terrain[i * 8 + 4]!);
        }
        c.measure('terreno: maior altura', top);
        c.check(top > 0.05 && top < 1.5, `terreno com altura ${top}`);
        c.check(up > 0, `terreno com normal para baixo (${up})`);
        c.hash('terrain', new Uint8Array(terrain.buffer));
        return c.result();
    },

    /** Torção `space` sobre um cilindro: pontos torcidos e normais pela Jacobiana — fornecida × numérica ≤ 1°. */
    async space() {
        const c = collector();
        const CYLINDER = `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return vec3f(cos(u), v, sin(u));
}`;
        const run = async (code: string) => {
            const app = await createApp();
            app.world.insert(
                new clayflow.SpaceFunction({ code, params: { k: 'f32' }, values: { k: 1.2 } }),
            );
            const surface = new clayflow.ParametricSurface({
                resolution: [32, 16],
                domain: [0, 2 * Math.PI, -1, 1],
            });
            app.world.insert(
                surface
                    .add(new StandardMaterial())
                    .add(new Transform())
                    .add(new clayflow.SurfaceFunction({ code: CYLINDER })),
            );
            await settle(app);
            app.step(1 / 60);
            const spec = app.resources.bufferOf(surface, 'vertices');
            if (spec === undefined) throw new Error('superfície sem vértices');
            const v = await readBuffer(app, spec, 'space');
            app.dispose();
            return v;
        };
        const provided = await run(TWIST_JACOBIAN_CODE);
        const numeric = await run(TWIST_CODE);
        let worstPos = 0;
        let worstAngle = 0;
        for (let i = 0; i < 32 * 16; i++) {
            const o = i * 8;
            const iu = i % 32;
            const iv = Math.floor(i / 32);
            const u = (iu / 31) * 2 * Math.PI;
            const y = -1 + (iv / 15) * 2;
            const a = 1.2 * y;
            const want = [
                Math.cos(u) * Math.cos(a) - Math.sin(u) * Math.sin(a),
                y,
                Math.cos(u) * Math.sin(a) + Math.sin(u) * Math.cos(a),
            ];
            worstPos = Math.max(
                worstPos,
                Math.hypot(
                    provided[o]! - want[0]!,
                    provided[o + 1]! - want[1]!,
                    provided[o + 2]! - want[2]!,
                ),
            );
            const dot =
                provided[o + 3]! * numeric[o + 3]!
                + provided[o + 4]! * numeric[o + 4]!
                + provided[o + 5]! * numeric[o + 5]!;
            worstAngle = Math.max(worstAngle, (Math.acos(Math.min(1, dot)) * 180) / Math.PI);
        }
        c.measure('torção: erro de posição', worstPos);
        c.measure('torção: Jacobiana fornecida × numérica (°)', worstAngle);
        c.check(worstPos <= 1e-5, `torção fora da equação (${worstPos})`);
        c.check(worstAngle <= 1, `normais divergem (${worstAngle}°)`);
        c.hash('twist', new Uint8Array(provided.buffer));
        return c.result();
    },

    /** Material xadrez por uv: as casas alternam claro e escuro; sem função, a cor uniforme do material. */
    async material() {
        const c = collector();
        const shots: ImageData[] = [];
        for (const checker of [false, true]) {
            const app = await createApp(128);
            app.world.insert(
                new Camera({ fov: Math.PI / 3, near: 0.1, far: 50 }).add(
                    new Transform({
                        position: [0, 3, 0, 1],
                        rotation: Transform.lookRotation([0, 3, 0], [0, 0, 0], [0, 0, -1]),
                    }),
                ),
            );
            app.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], intensity: 1 }));
            const plane = new clayflow.ParametricSurface({
                resolution: [2, 2],
                domain: [-1, 1, -1, 1],
            })
                .add(new StandardMaterial({ albedo: [0.9, 0.2, 0.2, 1] }))
                .add(new Transform());
            if (checker)
                plane.add(
                    new clayflow.MaterialFunction({
                        code: CHECKER_CODE,
                        params: { cells: 'f32' },
                        values: { cells: 8 },
                    }),
                );
            app.world.insert(plane);
            await settle(app);
            app.step(1 / 60);
            shots.push(capture(app.canvas));
            c.hash(checker ? 'checker' : 'plain', shots.at(-1)!.data as unknown as Uint8Array);
            app.dispose();
        }
        // Linha do meio: a cor (canal vermelho) muda de casa em casa com a função (na diagonal de um tabuleiro a casa
        // não muda).
        const lum = (img: ImageData, x: number, y: number): number =>
            img.data[(y * img.width + x) * 4]!;
        const changes = (img: ImageData): number => {
            let n = 0;
            let prev = -1;
            for (let k = 20; k < 108; k++) {
                const bright = lum(img, k, 61) > 60 ? 1 : 0;
                if (prev >= 0 && bright !== prev) n++;
                prev = bright;
            }
            return n;
        };
        const plain = c.measure('sem função: trocas na linha', changes(shots[0]!));
        const checked = c.measure('xadrez: trocas na linha', changes(shots[1]!));
        // Sem função: só as duas bordas do plano com o fundo; com o xadrez, as casas somam trocas.
        c.check(plain <= 2, `sem função a cor varia (${plain})`);
        c.check(checked >= plain + 4, `o xadrez não aparece (${checked} trocas)`);
        return c.result();
    },

    /**
     * SC-007: erros — assinatura errada e símbolo do núcleo redefinido falham na criação (com o ponto e a assinatura);
     * erro de compilação em cada estágio é anunciado (`extensionRejected` com a linha do código do usuário) e a cena
     * continua desenhando sem erro no device; retorno não finito mantém o TRS.
     */
    async errors() {
        const c = collector();
        const wrong = (f: () => unknown): string => {
            try {
                f();
            } catch (e) {
                return e instanceof Error ? e.message : String(e);
            }
            return '';
        };
        const signature = wrong(
            () =>
                new clayflow.TransformFunction({
                    code: 'fn transform_fn(slot: u32) -> mat4x4f { return mat4x4f(); }',
                }),
        );
        c.check(
            signature.includes("ponto 'transform'") && signature.includes('esperada'),
            `assinatura errada sem mensagem útil: ${signature}`,
        );
        const symbol = wrong(
            () =>
                new clayflow.TransformFunction({
                    code: `fn transform_local(t: Transform) -> WorldTransform { var w: WorldTransform; return w; }
fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f { return mat4x4f(); }`,
                }),
        );
        c.check(symbol.includes('transform_local'), `símbolo redefinido sem o nome: ${symbol}`);

        // Código que passa na assinatura e na montagem, mas não compila (tipo errado na 3ª linha do código).
        const BAD = {
            transform: `fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f {
    var m = transform_local(t).world;
    let k: f32 = 1u;
    return m;
}`,
            camera: `fn camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: CameraFnParams, time: f32) -> CameraOut {
    var out: CameraOut;
    let k: f32 = 1u;
    return out;
}`,
            field: `fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f {
    var a = vec3f(0.0);
    let k: f32 = 1u;
    return a;
}`,
            emit: `fn emit_fn(i: u32, time: f32, seed: u32, data: EmitFnParams) -> EmittedParticle {
    var p: EmittedParticle;
    let k: f32 = 1u;
    return p;
}`,
            surface: `fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    var p = vec3f(u, 0.0, v);
    let k: f32 = 1u;
    return p;
}`,
            space: `fn space_fn(x: vec3f, time: f32, data: SpaceFnParams) -> vec3f {
    var y = x;
    let k: f32 = 1u;
    return y;
}`,
            material: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams {
    var p = SurfaceParams(m.albedo, 0.5, 0.0, vec3f(0.0));
    let k: f32 = 1u;
    return p;
}`,
        };
        expectRejections = true;
        const app = await createApp();
        const rejected = new Map<string, number>();
        app.events.on('extensionRejected', (e) => rejected.set(e.point, e.line));
        app.world.insert(new Camera().add(new Transform({ position: [0, 1, 6, 1] })));
        app.world.insert(
            new Camera()
                .add(new Transform())
                .add(new clayflow.CameraFunction({ code: BAD.camera })),
        );
        const box = new Transform({ position: [1, 2, 3, 1] });
        const boxId = app.world.insert(
            new BoxGeometry()
                .add(new StandardMaterial())
                .add(box)
                .add(new clayflow.TransformFunction({ code: BAD.transform }))
                .add(new clayflow.MaterialFunction({ code: BAD.material })),
        );
        app.world.insert(new clayflow.FieldFunction({ code: BAD.field }));
        app.world.insert(new clayflow.SpaceFunction({ code: BAD.space }));
        solverBodies(app, 'sph', clayflow);
        app.world.insert(
            new clayflow.ComputeParticleEmitter({ maxParticles: 64, rate: 10 })
                .add(new clayflow.PointCloudGeometry({ maxPoints: 64 }))
                .add(new clayflow.PointSpriteMaterial())
                .add(new Transform())
                .add(new clayflow.EmitFunction({ code: BAD.emit })),
        );
        app.world.insert(
            new clayflow.ParametricSurface({ preset: 'sphere', resolution: [8, 8] })
                .add(new StandardMaterial())
                .add(new Transform())
                .add(new clayflow.SurfaceFunction({ code: BAD.surface })),
        );
        // Superfície pronta: o pipeline dela só tem o espaço da cena (o compilador para no primeiro erro de cada shader).
        app.world.insert(
            new clayflow.ParametricSurface({ preset: 'torus', resolution: [8, 8] })
                .add(new StandardMaterial())
                .add(new Transform()),
        );
        await settle(app, 800);
        for (let k = 0; k < 10; k++) app.step(1 / 60);
        for (const point of Object.keys(BAD)) {
            c.check(rejected.has(point), `${point}: erro de compilação não anunciado`);
            c.check(
                rejected.get(point) === 3,
                `${point}: linha ${rejected.get(point)} (esperada 3)`,
            );
        }
        c.measure('estágios com rejeição anunciada', rejected.size);
        // A caixa segue no TRS (a função foi rejeitada e não havia anterior).
        const w = (await readWorlds(app, [boxId])).worlds[0]!;
        c.check(
            w[12] === 1 && w[13] === 2 && w[14] === 3,
            `caixa fora do TRS (${w[12]}, ${w[13]}, ${w[14]})`,
        );
        app.dispose();
        expectRejections = false;

        // Retorno não finito: a matriz do TRS fica.
        const nan = await createApp();
        const id = nan.world.insert(
            new BoxGeometry()
                .add(new StandardMaterial())
                .add(new Transform({ position: [4, 5, 6, 1] }))
                .add(
                    new clayflow.TransformFunction({
                        code: `fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f {
    let big = 1e30 + time;
    var m = transform_local(t).world;
    m[3] = vec4f(big * big, 0.0, 0.0, 1.0);
    return m;
}`,
                    }),
                ),
        );
        await settle(nan);
        nan.step(1 / 60);
        const m = (await readWorlds(nan, [id])).worlds[0]!;
        c.check(
            m[12] === 4 && m[13] === 5 && m[14] === 6,
            `matriz não finita (infinita) entrou (${m[12]}, ${m[13]}, ${m[14]})`,
        );
        nan.dispose();
        return c.result();
    },

    /**
     * FR-010: funções dependentes do tempo dão o mesmo estado a 30, 60 e 144 Hz — campo do usuário (nós FEM), emissor
     * do usuário e superfície animada.
     */
    async rates() {
        const c = collector();
        const GUST = `
fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f {
    return vec3f(sin(3.0 * time), 0.0, cos(2.0 * time)) * data.a;
}`;
        const PULSE = `
fn emit_fn(i: u32, time: f32, seed: u32, data: EmitFnParams) -> EmittedParticle {
    var p: EmittedParticle;
    p.position = vec3f(sin(time), 0.0, cos(time));
    p.velocity = vec3f(emit_rand(i, seed, 0u) - 0.5, 1.0, emit_rand(i, seed, 1u) - 0.5);
    p.life = 1.5;
    p.color = vec4f(1.0);
    return p;
}`;
        const states: Record<string, string[]> = { field: [], emit: [], surface: [] };
        for (const rate of [60, 30, 144]) {
            const app = await createApp();
            app.world.insert(
                new clayflow.FieldFunction({ code: GUST, params: { a: 'f32' }, values: { a: 2 } }),
            );
            solverBodies(app, 'fem', clayflow);
            const emitter = new clayflow.ComputeParticleEmitter({
                maxParticles: 256,
                rate: 90,
                lifetime: 1.5,
            });
            app.world.insert(
                emitter
                    .add(new clayflow.PointCloudGeometry({ maxPoints: 256 }))
                    .add(new clayflow.PointSpriteMaterial())
                    .add(new Transform())
                    .add(new clayflow.EmitFunction({ code: PULSE })),
            );
            const surface = new clayflow.ParametricSurface({
                resolution: [24, 12],
                domain: [0, 2 * Math.PI, 0, Math.PI],
                animated: true,
            });
            app.world.insert(
                surface
                    .add(new StandardMaterial())
                    .add(new Transform())
                    .add(
                        new clayflow.SurfaceFunction({
                            code: HOMOTOPY_CODE,
                            params: { speed: 'f32' },
                            values: { speed: 3 },
                        }),
                    ),
            );
            await settle(app);
            for (let k = 0; k < rate; k++) app.step(1 / rate);
            states.field!.push(hashBytes(await readPool(app, clayflow.FEMSchema.name)));
            const particles = app.resources.bufferOf(emitter, 'particles')!;
            states.emit!.push(
                hashBytes(new Uint8Array((await readBuffer(app, particles, 'rates_emit')).buffer)),
            );
            const vertices = app.resources.bufferOf(surface, 'vertices')!;
            states.surface!.push(
                hashBytes(
                    new Uint8Array((await readBuffer(app, vertices, 'rates_surface')).buffer),
                ),
            );
            app.dispose();
        }
        for (const [name, hashes] of Object.entries(states)) {
            c.check(
                new Set(hashes).size === 1,
                `${name}: estado muda com a taxa (${hashes.join(' ')})`,
            );
            c.hashValue(name, hashes[0]!);
        }
        return c.result();
    },

    /** SC-003: câmera olho de peixe — a imagem curva as linhas retas da cena; o centro coincide com a perspectiva. */
    async fisheye() {
        const c = collector();
        const shots: ImageData[] = [];
        for (const fisheye of [false, true]) {
            const app = await createApp(256);
            const camera = new Camera({ fov: Math.PI / 3, near: 0.1, far: 50 }).add(
                new Transform({ position: [0, 0, 6, 1] }),
            );
            if (fisheye)
                camera.add(
                    new CameraFunction({
                        code: FISHEYE_CODE,
                        params: {
                            field: 'f32',
                            fov: 'f32',
                            aspect: 'f32',
                            near: 'f32',
                            far: 'f32',
                        },
                        values: {
                            field: Math.PI / 2,
                            fov: Math.PI / 3,
                            aspect: 1,
                            near: 0.1,
                            far: 50,
                        },
                    }),
                );
            app.world.insert(camera);
            app.world.insert(
                new DirectionalLight({ direction: [-0.3, -1, -0.5, 0], intensity: 1 }),
            );
            // Uma fileira horizontal de cubos finos na altura y = 1,5: reta na perspectiva, curva no olho de peixe.
            for (let i = 0; i < 21; i++) {
                app.world.insert(
                    new BoxGeometry({ size: [0.25, 0.25, 0.25] })
                        .add(new StandardMaterial({ albedo: [1, 0.3, 0.1, 1] }))
                        .add(new Transform({ position: [(i - 10) * 0.5, 1.5, 0, 1] })),
                );
            }
            app.world.insert(
                new BoxGeometry({ size: [0.6, 0.6, 0.6] })
                    .add(new StandardMaterial({ albedo: [0.2, 0.8, 0.3, 1] }))
                    .add(new Transform({ position: [0, 0, 0, 1] })),
            );
            await settle(app);
            app.step(1 / 60);
            shots.push(capture(app.canvas));
            c.hash(
                fisheye ? 'fisheye' : 'perspective',
                shots.at(-1)!.data as unknown as Uint8Array,
            );
            app.dispose();
        }
        // Altura (linha) média dos pixels laranja por coluna, no centro e nas bordas: reta na perspectiva, curva no
        // olho de peixe (o centro mais alto que as pontas, abaulado para fora).
        const rowOf = (img: ImageData, x0: number, x1: number): number => {
            let sum = 0;
            let n = 0;
            for (let y = 0; y < img.height; y++)
                for (let x = x0; x < x1; x++) {
                    const i = (y * img.width + x) * 4;
                    const [r, g, b] = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
                    if (r > 40 && r > g * 1.6 && r > b * 2.5) {
                        sum += y;
                        n++;
                    }
                }
            return n === 0 ? Number.NaN : sum / n;
        };
        const bend = (img: ImageData): number => {
            const w = img.width;
            const center = rowOf(img, Math.floor(w * 0.45), Math.ceil(w * 0.55));
            const edges =
                (rowOf(img, 0, Math.ceil(w * 0.15)) + rowOf(img, Math.floor(w * 0.85), w)) / 2;
            return edges - center;
        };
        const count = (img: ImageData): number => {
            let n = 0;
            for (let i = 0; i < img.data.length; i += 4) if (img.data[i]! > 40) n++;
            return n;
        };
        c.measure('perspectiva: pixels acesos', count(shots[0]!));
        c.measure('olho de peixe: pixels acesos', count(shots[1]!));
        const flat = c.measure('perspectiva: curvatura (px)', bend(shots[0]!));
        const curved = c.measure('olho de peixe: curvatura (px)', bend(shots[1]!));
        c.check(Math.abs(flat) < 1.5, `a perspectiva curvou a fileira (${flat} px)`);
        c.check(curved > 4, `o olho de peixe não curvou a fileira (${curved} px)`);
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
    const fixture = `extensionPoints-${profile}.json`;
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
    else log('EXTENSIONPOINTS SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
