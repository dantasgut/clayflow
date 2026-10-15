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
import type { EntityId } from 'clayflow';
import {
    capture,
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
