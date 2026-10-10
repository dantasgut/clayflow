// Spec 004 — Smoke dos limites de despacho e da busca de vizinhança.
//
// Valida na GPU real:
//   (a) SC-010: um kernel linear despachado por `invocations(70 000 × 256, 256)` — mais de 65 535 grupos —
//       processa cada elemento exatamente uma vez (marca por posição + contador atômico, lidos de volta);
//   (b) SC-011: a busca de vizinhança com grade 64 × 64 × 64 (262 144 células, acima do antigo teto de 65 536)
//       devolve, para cada partícula, o mesmo conjunto de vizinhos de uma busca de referência na CPU.
//
// Para rodar: `npm run smoke -- limits` (servidor do bench). Resultado: `LIMITS SMOKE PASSED` ou `FAIL: …`.
import { Application, createScene, NeighborSearchPipeline } from 'clayflow';
import type {
    StagingBufferSpec,
    StorageBufferSpec,
    UniformBufferSpec,
    Application as App,
} from 'clayflow';

function log(msg: string): void {
    console.log(`[limits] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

async function readBuffer(
    app: App,
    src: StorageBufferSpec,
    byteSize: number,
): Promise<ArrayBuffer> {
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `limits_staging_${src.discriminator}_${byteSize}`,
        byteSize,
    });
    app.core.record('limits-readback', (frame) => {
        frame.copy(src, staging, byteSize);
    });
    app.core.submit();
    const data = await app.core.readback(staging);
    app.core.destroy(staging);
    return data;
}

const MARK_SHADER = /* wgsl */ `
@group(0) @binding(0) var<uniform>             params:  vec4u;
@group(0) @binding(1) var<storage, read_write> marks:   array<u32>;
@group(0) @binding(2) var<storage, read_write> counter: array<atomic<u32>>;

@compute @workgroup_size(256)
fn mark_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * 256u;
    if (i >= params.x) { return; }
    marks[i] = marks[i] + 1u;
    atomicAdd(&counter[0], 1u);
}
`;

/** (a) Despacho acima de 65 535 grupos: cada elemento exatamente uma vez. */
async function checkDispatch(app: App, failures: string[]): Promise<void> {
    const count = 70_000 * 256;
    const params = app.core.create<UniformBufferSpec>({
        kind: 'buffer',
        subkind: 'uniform',
        discriminator: 'limits_params',
        byteSize: 16,
    });
    const marks = app.core.create<StorageBufferSpec>({
        kind: 'buffer',
        subkind: 'storage',
        discriminator: 'limits_marks',
        byteSize: count * 4,
    });
    const counter = app.core.create<StorageBufferSpec>({
        kind: 'buffer',
        subkind: 'storage',
        discriminator: 'limits_counter',
        byteSize: 16,
    });
    app.core.write(params, new Uint32Array([count, 0, 0, 0]));
    const kernel = app.core.compute({
        discriminator: 'limits_mark',
        shaderSource: MARK_SHADER,
        entryPoint: 'mark_main',
        bindings: [
            { binding: 0, type: 'uniform', buffer: params },
            { binding: 1, type: 'storage', buffer: marks },
            { binding: 2, type: 'storage', buffer: counter },
        ],
    });
    app.core.record('limits-mark', (frame) => {
        frame.clear(marks);
        frame.clear(counter);
        frame.compute('limits.mark', (pass) => {
            pass.bind.setPipeline(kernel.pipeline).setBindGroup(0, kernel.bindGroup);
            pass.dispatch.invocations(count, 256);
        });
    });
    app.core.submit();
    const marked = new Uint32Array(await readBuffer(app, marks, count * 4));
    const total = new Uint32Array(await readBuffer(app, counter, 16))[0]!;
    let wrong = 0;
    let firstWrong = -1;
    for (let i = 0; i < marked.length; i++) {
        if (marked[i] !== 1) {
            wrong++;
            if (firstWrong < 0) firstWrong = i;
        }
    }
    log(
        `(a) ${count} elementos (${Math.ceil(count / 256)} grupos > 65 535): `
            + `${count - wrong} marcados uma vez, contador ${total}`,
    );
    if (wrong > 0) failures.push(`(a) ${wrong} posições ≠ 1 (primeira: ${firstWrong})`);
    if (total !== count) failures.push(`(a) contador ${total} ≠ ${count}`);
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

/** (b) Busca de vizinhança em grade de 262 144 células × referência na CPU. */
async function checkNeighbors(app: App, failures: string[]): Promise<void> {
    const dim = 64;
    const h = 0.1;
    const n = 60_000;
    const maxNeighbors = 48;
    const stride = 4;
    const random = rng(2026);
    const data = new Float32Array(n * stride);
    for (let i = 0; i < n; i++) {
        // Concentra metade das partículas nas camadas z altas: células de índice > 65 536.
        data[i * stride] = random() * dim * h;
        data[i * stride + 1] = random() * dim * h;
        data[i * stride + 2] = (i % 2 === 0 ? 0.5 + 0.5 * random() : random()) * dim * h;
    }
    const particles = app.core.create<StorageBufferSpec>({
        kind: 'buffer',
        subkind: 'storage',
        discriminator: 'limits_particles',
        byteSize: data.byteLength,
    });
    app.core.write(particles, data);
    const ns = new NeighborSearchPipeline(app.core, {
        discriminator: 'limits',
        maxParticles: n,
        maxNeighbors,
        particleStrideF32: stride,
        cellSize: h,
        gridDim: [dim, dim, dim],
        origin: [0, 0, 0],
    });
    app.core.record('limits-ns', (frame) => {
        ns.rebuild(frame, particles, n);
    });
    app.core.submit();
    const list = new Uint32Array(await readBuffer(app, ns.neighborList!, n * maxNeighbors * 4));
    const counts = new Uint32Array(await readBuffer(app, ns.neighborCount!, n * 4));

    // Referência: hash espacial na CPU com o mesmo critério (dist² < h², j ≠ i).
    const cellOf = (x: number): number => Math.floor(x / h);
    const buckets = new Map<number, number[]>();
    const key = (x: number, y: number, z: number): number => x + y * dim + z * dim * dim;
    for (let i = 0; i < n; i++) {
        const k = key(
            cellOf(data[i * stride]!),
            cellOf(data[i * stride + 1]!),
            cellOf(data[i * stride + 2]!),
        );
        const b = buckets.get(k);
        if (b === undefined) buckets.set(k, [i]);
        else b.push(i);
    }
    let mismatches = 0;
    let truncated = 0;
    let firstMismatch = '';
    let highCellParticles = 0;
    let totalNeighbors = 0;
    for (let i = 0; i < n; i++) {
        const px = data[i * stride]!;
        const py = data[i * stride + 1]!;
        const pz = data[i * stride + 2]!;
        const cx = cellOf(px);
        const cy = cellOf(py);
        const cz = cellOf(pz);
        if (key(cx, cy, cz) >= 65_536) highCellParticles++;
        const expected: number[] = [];
        for (let dz = -1; dz <= 1; dz++)
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    const nz = cz + dz;
                    if (nx < 0 || ny < 0 || nz < 0 || nx >= dim || ny >= dim || nz >= dim) continue;
                    for (const j of buckets.get(key(nx, ny, nz)) ?? []) {
                        if (j === i) continue;
                        const qx = Math.fround(data[j * stride]! - px);
                        const qy = Math.fround(data[j * stride + 1]! - py);
                        const qz = Math.fround(data[j * stride + 2]! - pz);
                        if (qx * qx + qy * qy + qz * qz < Math.fround(h * h)) expected.push(j);
                    }
                }
        if (expected.length > maxNeighbors) {
            truncated++;
            continue;
        }
        totalNeighbors += expected.length;
        const got = Array.from(list.subarray(i * maxNeighbors, i * maxNeighbors + counts[i]!)).sort(
            (a, b) => a - b,
        );
        expected.sort((a, b) => a - b);
        if (got.length !== expected.length || got.some((v, k) => v !== expected[k])) {
            mismatches++;
            if (firstMismatch === '') {
                firstMismatch = `partícula ${i}: GPU [${got.join(',')}] × CPU [${expected.join(',')}]`;
            }
        }
    }
    log(
        `(b) ${n} partículas, ${dim ** 3} células (${highCellParticles} partículas em células ≥ 65 536), `
            + `${totalNeighbors} vizinhos; divergências: ${mismatches}; acima do teto de vizinhos: ${truncated}`,
    );
    if (mismatches > 0)
        failures.push(`(b) ${mismatches} partículas divergentes — ${firstMismatch}`);
    if (highCellParticles === 0) failures.push('(b) nenhuma partícula em células acima de 65 536');
    if (totalNeighbors === 0) failures.push('(b) nenhum vizinho encontrado — teste sem conteúdo');
    ns.dispose();
}

async function main(): Promise<void> {
    const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement | null;
    if (canvas === null) throw new Error('canvas#gpuCanvas não encontrado');
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
    });
    let engineErrors = 0;
    app.events.on('engineError', (e) => {
        engineErrors++;
        log(`engineError: ${e.message}`);
    });
    const failures: string[] = [];
    await checkDispatch(app, failures);
    await checkNeighbors(app, failures);
    if (engineErrors > 0) failures.push(`engineErrors=${engineErrors}`);
    app.dispose();
    if (failures.length > 0) {
        for (const f of failures) log(`  ✗ ${f}`);
        throw new Error(`${failures.length} verificações falharam`);
    }
    log('LIMITS SMOKE PASSED');
}

main().catch((err: unknown) => {
    console.error('[limits] FATAL:', err);
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAIL: ${msg}`);
});
