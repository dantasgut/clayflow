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
import { Application, createScene } from 'clayflow';
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

// Casos registrados por fase da spec (US1–US4).
const CASES: Record<string, Case> = {};
void collector;

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
