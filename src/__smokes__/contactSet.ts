// Spec 007 — Conjunto de contatos da narrowphase (FR-015, SC-006).
//
// Roda a pilha do `rigidContacts` (1 000 e 10 000 corpos) por 60 passos e, a cada passo, lê a lista compactada de
// contatos do último substep. O conjunto é reduzido a uma forma canônica — os registros (96 B) ordenados pelos seus
// bytes — e a um hash (FNV-1a, duas sementes). Com `--record`, grava a referência
// (`contacts-<perfil>.json`, da narrowphase exaustiva); sem, compara passo a passo: a broadphase deve produzir o
// mesmo conjunto de contatos (o solve independe da ordem — spec 004, R19), logo o mesmo hash. Mede também os pares
// testados pela narrowphase contra N·M (SC-006: ≤ 1% em 10 000 corpos).
//
// Para rodar: `npm run smoke -- contactSet [--record]`. Resultado: `CONTACTSET SMOKE PASSED` ou `FAIL`.
import { Application, createScene, LCPFlow } from 'clayflow/web';
import type { StagingBufferSpec, StorageBufferSpec } from 'clayflow/web';
import { buildRigidPile } from './support/rigidPile';
import { gpuProfile, readJsonFixture, recording, writeJsonFixture } from './support/fixtures';

const STEPS = 60;

interface StepDigest {
    readonly count: number;
    readonly hash: string;
}

/** Pares testados pela narrowphase no último substep (caixas + esferas da broadphase) e o total N·M exaustivo. */
interface PairStats {
    tested: number;
    exhaustive: number;
}
type Reference = Record<string, readonly StepDigest[]>;

function log(msg: string): void {
    console.log(`[contactSet] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

async function read(
    app: Application,
    source: StorageBufferSpec,
    byteSize: number,
): Promise<ArrayBuffer> {
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `contact_set_staging_${byteSize}`,
        byteSize,
    });
    app.core.record('contact-set-readback', (frame) => {
        frame.copy(source, staging, byteSize);
    });
    app.core.submit();
    return app.core.readback(staging);
}

function fnv1a(words: Uint32Array, seed: number): number {
    let h = seed >>> 0;
    for (let i = 0; i < words.length; i++) {
        h = Math.imul(h ^ words[i]!, 0x01000193) >>> 0;
    }
    return h;
}

/** Registros ordenados pelos bytes (forma canônica do conjunto) e o hash deles. */
function digest(contacts: ArrayBuffer, count: number, recordBytes: number): StepDigest {
    const words = recordBytes / 4;
    const all = new Uint32Array(contacts, 0, count * words);
    const order = Array.from({ length: count }, (_, i) => i);
    order.sort((a, b) => {
        for (let k = 0; k < words; k++) {
            const d = all[a * words + k]! - all[b * words + k]!;
            if (d !== 0) return d;
        }
        return 0;
    });
    const sorted = new Uint32Array(count * words);
    order.forEach((src, dst) => {
        sorted.set(all.subarray(src * words, (src + 1) * words), dst * words);
    });
    const hash = `${fnv1a(sorted, 0x811c9dc5).toString(16)}${fnv1a(sorted, 0x01234567).toString(16)}`;
    return { count, hash };
}

async function scenario(
    count: number,
): Promise<{ digests: StepDigest[]; profile: string; pairs: PairStats }> {
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
    });
    buildRigidPile(app, count);
    const flow = app.flows.resolve('LCPSchema')?.flow;
    if (!(flow instanceof LCPFlow)) throw new Error('LCPFlow não registrado para LCPSchema');
    const digests: StepDigest[] = [];
    const pairs: PairStats = { tested: 0, exhaustive: 0 };
    for (let step = 0; step < STEPS; step++) {
        app.step(1 / 60);
        const { contacts, counter, recordBytes, capacity, pairCounts } = flow.contactBuffers();
        const pc = new Uint32Array(await read(app, pairCounts, pairCounts.byteSize));
        const bodies = app.resources.poolCount('LCPSchema');
        const colliders =
            app.resources.poolCount('BoxCollider') + app.resources.poolCount('SphereCollider');
        pairs.tested += (pc[0] ?? 0) + (pc[1] ?? 0);
        pairs.exhaustive += bodies * colliders;
        if (contacts === null) {
            digests.push({ count: 0, hash: '' });
            continue;
        }
        const header = new Uint32Array(await read(app, counter, counter.byteSize));
        const n = Math.min(header[0] ?? 0, capacity);
        const body = n === 0 ? new ArrayBuffer(0) : await read(app, contacts, n * recordBytes);
        digests.push(digest(body, n, recordBytes));
    }
    const profile = gpuProfile(app);
    app.dispose();
    return { digests, profile, pairs };
}

const pairFailures: string[] = [];

async function main(): Promise<void> {
    const results: Record<string, StepDigest[]> = {};
    let profile = 'unknown';
    for (const count of [1000, 10_000]) {
        const r = await scenario(count);
        results[String(count)] = r.digests;
        profile = r.profile;
        const total = r.digests.reduce((a, d) => a + d.count, 0);
        const share = r.pairs.exhaustive === 0 ? 0 : r.pairs.tested / r.pairs.exhaustive;
        log(
            `${count} corpos: ${STEPS} passos, ${total} contatos no último substep somados; pares testados `
                + `${(share * 100).toFixed(3)}% de N·M`,
        );
        if (count === 10_000 && share > 0.01)
            pairFailures.push(`${count}: pares testados ${share} > 1% de N·M`);
    }
    const name = `contacts-${profile}.json`;
    if (recording()) {
        await writeJsonFixture(name, results);
        log(`referência gravada: ${name}`);
        log('CONTACTSET SMOKE PASSED');
        return;
    }
    const reference = await readJsonFixture<Reference>(name);
    if (reference === null) throw new Error(`sem referência ${name} — rode com --record`);
    const failures: string[] = [...pairFailures];
    for (const [count, digests] of Object.entries(results)) {
        const ref = reference[count] ?? [];
        const firstDiff = digests.findIndex(
            (d, i) => d.count !== ref[i]?.count || d.hash !== ref[i]?.hash,
        );
        if (firstDiff >= 0) {
            const got = digests[firstDiff]!;
            const want = ref[firstDiff];
            failures.push(
                `${count} corpos: conjunto diferente no passo ${firstDiff + 1} — ${got.count} contatos `
                    + `(referência ${want?.count ?? '—'})`,
            );
        } else log(`  ${count} corpos: conjunto igual à referência nos ${STEPS} passos`);
    }
    if (failures.length > 0) {
        for (const f of failures) log(`  ✗ ${f}`);
        throw new Error(`${failures.length} verificações falharam`);
    }
    log('CONTACTSET SMOKE PASSED');
}

main().catch((err: unknown) => {
    console.error('[contactSet] FATAL:', err);
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAIL: ${msg}`);
});
