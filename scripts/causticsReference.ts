/**
 * Referência das cáusticas (spec 034, T067a), gerada offline na CPU e gravada como fixture sem perfil de GPU:
 *   npm run caustics:reference [-- --strata N]
 * Cada cena de `causticScenes.ts` pelo traçado a partir da luz (`lightTrace`) em duas metades independentes de N estratos
 * (três fótons por estrato, um por canal): a irradiância é a média delas e a diferença dá o ruído da própria referência
 * (o erro relativo RMS por célula da média, nas células acima de 20 % do chão aceso). Saída:
 * `src/__smokes__/fixtures/caustics-reference.json` (os casos, o receptor, o ruído) e `.bin` (as irradiâncias, f32 rgb
 * por célula, na ordem dos casos).
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lightTrace } from '../src/elements/lighting/reference/pathTracer';
import { CAUSTIC_CASES } from '../src/__smokes__/support/causticScenes';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.indexOf('--strata');
const strata = arg >= 0 ? Number(process.argv[arg + 1]) : 4_000_000;

interface Entry {
    name: string;
    nx: number;
    ny: number;
    open: number;
    strata: number;
    /** Erro relativo RMS por célula da média das duas metades (por canal), nas células acima de 20 % do aberto. */
    noise: [number, number, number];
    /** Deslocamento da primeira célula do caso no binário (em floats). */
    offset: number;
}

async function main(): Promise<void> {
    const entries: Entry[] = [];
    const chunks: Float32Array[] = [];
    let offset = 0;
    for (const c of CAUSTIC_CASES) {
        const t0 = performance.now();
        const opts = { ...c.window, photons: strata };
        const a = lightTrace(c.scene, c.light, c.receiver, opts);
        const b = lightTrace(c.scene, c.light, c.receiver, { ...opts, firstPhoton: strata });
        const mean = new Float32Array(a.rgb.length);
        const noise: [number, number, number] = [0, 0, 0];
        const count = [0, 0, 0];
        for (let i = 0; i < mean.length; i++) {
            const m = 0.5 * (a.rgb[i]! + b.rgb[i]!);
            mean[i] = m;
            if (m <= 0.2 * c.open) continue;
            // Erro da média de duas metades independentes: |a − b| / 2 estima o desvio dela.
            const e = (0.5 * (a.rgb[i]! - b.rgb[i]!)) / m;
            noise[i % 3]! += e * e;
            count[i % 3]!++;
        }
        for (let k = 0; k < 3; k++) noise[k] = Math.sqrt(noise[k]! / Math.max(1, count[k]!));
        entries.push({
            name: c.name,
            nx: a.nx,
            ny: a.ny,
            open: c.open,
            strata: 2 * strata,
            noise,
            offset,
        });
        chunks.push(mean);
        offset += mean.length;
        console.log(
            `${c.name}: ${((performance.now() - t0) / 1000).toFixed(1)} s, ruído por célula ${noise.map((x) => (100 * x).toFixed(2)).join('/')} %`,
        );
    }
    const all = new Float32Array(offset);
    let at = 0;
    for (const ch of chunks) {
        all.set(ch, at);
        at += ch.length;
    }
    const base = join(root, 'src/__smokes__/fixtures/caustics-reference');
    await writeFile(`${base}.bin`, new Uint8Array(all.buffer));
    await writeFile(`${base}.json`, `${JSON.stringify({ cases: entries }, null, 4)}\n`);
    console.log(`gravado: ${base}.{json,bin}`);
}

main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
