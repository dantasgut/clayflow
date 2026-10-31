// Spec 005 — Smoke dos kernels genéricos (US4, SC-005; contrato compute-kernels.md).
//
// Na GPU real, contra referências em CPU:
//   PrefixSum   — N ∈ {0, 1, 255, 256, 257, 65 537, 70 000 × 256 (> 65 535 grupos), 4 194 304}, exclusiva e inclusiva;
//   RadixSort   — N ∈ {0, 1, 1 000, 4 194 304}; chaves aleatórias, iguais e decrescentes; bits 8 e 32; estabilidade;
//   Compaction  — 50% e 1% aceitos; capacidade excedida (contagem, excedente, nada escrito além); modo estável;
//   Reduce      — sum/min/max × u32/i32/f32, N ∈ {1, 257, 4 194 304};
//   GraphColorer— grade 2D (Δ = 4), malha de tetraedros, grafo aleatório de 1 M arestas;
//   fixed_point — 1 M contribuições somadas em ponto fixo iguais à CPU; saturação detectada.
// Registra os tempos de PrefixSum e RadixSort com 4 M elementos.
//
// Para rodar: `npm run smoke -- computeKernels`. Resultado: `COMPUTEKERNELS SMOKE PASSED` ou `FAIL: …`.
import { Application, createScene } from 'clayflow/web';
import type { StagingBufferSpec, StorageBufferSpec } from 'clayflow/web';
import { createComputeKernel, destroyComputeKernel } from '../scene/flows/createComputeKernel';
import { wgslModule } from '../scene/shaders/WgslModule';
import { wgslResource } from '../scene/shaders/WgslResource';
import { PrefixSum } from '../elements/gpu/compute/PrefixSum';
import { RadixSort } from '../elements/gpu/compute/RadixSort';
import { Compaction } from '../elements/gpu/compute/Compaction';
import { Reduce } from '../elements/gpu/compute/Reduce';
import { GraphColorer, verifyEdgeColoring } from '../elements/gpu/compute/GraphColorer';
import { AtomicAllocCounterSchema } from '../elements/gpu/compute/schemas';
import { fixedPoint } from '../elements/gpu/compute/shaders';
import type { ReduceOpName, ReduceType } from '../elements/gpu/compute/shaders';
import { FIXED_LIMIT, fixedFromF32 } from './support/fixedPointReference';
import { mulberry32 } from './support/random';
import { FlowWork, type WorkContext } from '../scene/flows/FlowWork';
import { StructSchema } from '../scene/descriptors/StructSchema';

/** O Resource de trabalho dos kernels do smoke (spec 039: o espaço deles é da C2). */
class SmokeWork extends FlowWork {
    static readonly schema = new StructSchema('ComputeKernelsWork', {});
}

function log(msg: string): void {
    console.log(`[computeKernels] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

let app: Application;
let work: WorkContext;
let serial = 0;

function storage(byteSize: number): StorageBufferSpec {
    return app.core.create<StorageBufferSpec>({
        kind: 'buffer',
        subkind: 'storage',
        discriminator: `ck_buf_${serial++}`,
        byteSize: Math.max(16, byteSize),
    });
}

function upload(data: ArrayBufferView, extraBytes = 0): StorageBufferSpec {
    const buf = storage(data.byteLength + extraBytes);
    if (data.byteLength > 0) app.core.write(buf, data);
    return buf;
}

async function read(src: StorageBufferSpec, byteSize: number): Promise<ArrayBuffer> {
    const size = Math.max(16, byteSize);
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `ck_staging_${serial++}`,
        byteSize: size,
    });
    app.core.record('ck-read', (frame) => {
        frame.copy(src, staging, size);
    });
    app.core.submit();
    const data = await app.core.readback(staging);
    app.core.destroy(staging);
    return data.slice(0, byteSize);
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** Mede (mediana de 5, depois de um aquecimento) o tempo de gravar, enviar e concluir `body`. */
async function timeIt(body: () => void, sync: StorageBufferSpec): Promise<number> {
    const times: number[] = [];
    for (let k = 0; k < 6; k++) {
        const t0 = performance.now();
        body();
        await read(sync, 4);
        if (k > 0) times.push(performance.now() - t0);
    }
    return median(times);
}

// ── PrefixSum ──────────────────────────────────────────────────────────────────────────────────────────────────────

async function prefixSum(): Promise<void> {
    const sizes = [0, 1, 255, 256, 257, 65_537, 70_000 * 256, 4_194_304];
    const scan = new PrefixSum(work, { discriminator: 'ck_scan', capacity: 70_000 * 256 });
    const r = mulberry32(1);
    for (const n of sizes) {
        const input = Uint32Array.from({ length: n }, () => Math.floor(r() * 4));
        for (const mode of ['exclusive', 'inclusive'] as const) {
            const src = upload(input);
            const dst = storage(n * 4);
            scan.prepare(dst);
            app.core.record('ck-scan', (frame) => {
                scan.record(frame, { src, dst, count: n, mode });
            });
            app.core.submit();
            const out = new Uint32Array(await read(dst, n * 4));
            let acc = 0;
            let bad = -1;
            for (let i = 0; i < n; i++) {
                if (mode === 'inclusive') acc += input[i]!;
                if (out[i] !== acc >>> 0) {
                    bad = i;
                    break;
                }
                if (mode === 'exclusive') acc += input[i]!;
            }
            check(bad < 0, `PrefixSum ${mode} N=${n}: diverge em ${bad}`);
            const untouched = new Uint32Array(await read(src, n * 4));
            check(
                untouched.every((v, i) => v === input[i]),
                `PrefixSum ${mode} N=${n}: entrada alterada`,
            );
            app.core.destroy(src);
            app.core.destroy(dst);
        }
    }
    log(`PrefixSum: ${sizes.length} tamanhos × exclusiva/inclusiva conferidos`);

    const n = 4_194_304;
    const buf = upload(new Uint32Array(n).fill(1));
    scan.prepare(buf);
    const ms = await timeIt(() => {
        app.core.record('ck-scan-time', (frame) => {
            scan.record(frame, { src: buf, dst: buf, count: n });
        });
        app.core.submit();
    }, buf);
    log(`PrefixSum 4 194 304 (no lugar): ${ms.toFixed(2)} ms`);
    app.core.destroy(buf);
    scan.destroy();
}

// ── RadixSort ──────────────────────────────────────────────────────────────────────────────────────────────────────

async function radixSort(): Promise<void> {
    const sort = new RadixSort(work, {
        discriminator: 'ck_sort',
        capacity: 4_194_304,
        withValues: true,
    });
    const r = mulberry32(2);
    const kinds: Record<string, (n: number, i: number) => number> = {
        aleatórias: () => Math.floor(r() * 4294967296),
        iguais: () => 77,
        decrescentes: (n, i) => n - i,
    };
    let cases = 0;
    for (const n of [0, 1, 1000, 4_194_304]) {
        for (const [kind, gen] of Object.entries(kinds)) {
            for (const bits of [8, 32]) {
                const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
                const keys = Uint32Array.from({ length: n }, (_, i) => (gen(n, i) & mask) >>> 0);
                const values = Uint32Array.from({ length: n }, (_, i) => i);
                const kb = upload(keys);
                const vb = upload(values);
                sort.prepare(kb, vb);
                app.core.record('ck-sort', (frame) => {
                    sort.record(frame, { keys: kb, values: vb, count: n, bits });
                });
                app.core.submit();
                const outK = new Uint32Array(await read(kb, n * 4));
                const outV = new Uint32Array(await read(vb, n * 4));
                // Estável: ordem esperada = índices ordenados por (chave, índice).
                const order = Uint32Array.from({ length: n }, (_, i) => i).sort(
                    (a, b) => keys[a]! - keys[b]! || a - b,
                );
                let bad = -1;
                for (let i = 0; i < n; i++) {
                    if (outV[i] !== order[i] || outK[i] !== keys[order[i]!]) {
                        bad = i;
                        break;
                    }
                }
                check(bad < 0, `RadixSort N=${n} ${kind} bits=${bits}: diverge em ${bad}`);
                app.core.destroy(kb);
                app.core.destroy(vb);
                cases++;
            }
        }
    }
    log(`RadixSort: ${cases} casos ordenados e estáveis`);

    const n = 4_194_304;
    const keysOnly = new RadixSort(work, { discriminator: 'ck_sort_keys', capacity: n });
    const kb = upload(Uint32Array.from({ length: n }, () => Math.floor(r() * 4294967296)));
    keysOnly.prepare(kb);
    const ms = await timeIt(() => {
        app.core.record('ck-sort-time', (frame) => {
            keysOnly.record(frame, { keys: kb, count: n });
        });
        app.core.submit();
    }, kb);
    log(`RadixSort 4 194 304 chaves de 32 bits: ${ms.toFixed(2)} ms`);
    app.core.destroy(kb);
    keysOnly.destroy();
    sort.destroy();
}

// ── Compaction ─────────────────────────────────────────────────────────────────────────────────────────────────────

const ckValues = wgslResource({
    name: 'ck_values',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'stage',
    provider: 'private',
});
const ckThreshold = wgslResource({
    name: 'ck_threshold',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'stage',
    provider: 'private',
});

const keepPredicate = wgslModule({
    name: 'ck_keep_below',
    requires: [ckValues, ckThreshold],
    source: `
fn compact_keep(i: u32) -> bool { return ck_values[i] % 100u < ck_threshold[0]; }
fn compact_value(i: u32) -> u32 { return i; }`,
});

async function compaction(): Promise<void> {
    const n = 100_000;
    const SENTINEL = 0xdeadbeef;
    const r = mulberry32(3);
    const values = Uint32Array.from({ length: n }, () => Math.floor(r() * 1000));
    const valuesBuf = upload(values);
    const cases = [
        { percent: 50, capacity: n, stable: false },
        { percent: 1, capacity: n, stable: false },
        { percent: 50, capacity: n, stable: true },
        { percent: 50, capacity: 1000, stable: false },
        { percent: 50, capacity: 1000, stable: true },
    ];
    for (const c of cases) {
        const threshold = upload(new Uint32Array([c.percent, 0, 0, 0]));
        const compaction = new Compaction(work, {
            discriminator: `ck_compact_${serial++}`,
            predicate: keepPredicate,
            capacity: c.capacity,
            stable: c.stable,
            inputCapacity: n,
            bindings: new Map([
                [ckValues, valuesBuf],
                [ckThreshold, threshold],
            ]),
        });
        const guard = 64;
        const out = upload(new Uint32Array(c.capacity + guard).fill(SENTINEL));
        const counter = storage(AtomicAllocCounterSchema.stride);
        compaction.prepare(out, counter);
        app.core.record('ck-compact', (frame) => {
            compaction.record(frame, { count: n, out, counter });
        });
        app.core.submit();
        const expected: number[] = [];
        for (let i = 0; i < n; i++) if (values[i]! % 100 < c.percent) expected.push(i);
        const ctr = new Uint32Array(await read(counter, 8));
        const got = new Uint32Array(await read(out, (c.capacity + guard) * 4));
        const label = `Compaction ${c.percent}% cap=${c.capacity}${c.stable ? ' estável' : ''}`;
        const written = Math.min(expected.length, c.capacity);
        check(ctr[0] === expected.length, `${label}: contagem ${ctr[0]} ≠ ${expected.length}`);
        check(
            ctr[1] === expected.length - written,
            `${label}: excedente ${ctr[1]} ≠ ${expected.length - written}`,
        );
        check(
            got.subarray(c.capacity).every((v) => v === SENTINEL),
            `${label}: escreveu além da capacidade`,
        );
        const list = Array.from(got.subarray(0, written));
        if (c.stable) {
            check(
                list.every((v, i) => v === expected[i]),
                `${label}: ordem da entrada não preservada`,
            );
        } else {
            const set = new Set(expected);
            check(
                new Set(list).size === written && list.every((v) => set.has(v)),
                `${label}: saída não é subconjunto exato dos aceitos`,
            );
        }
        compaction.destroy();
        app.core.destroy(out);
        app.core.destroy(counter);
        app.core.destroy(threshold);
    }
    app.core.destroy(valuesBuf);
    log(`Compaction: ${cases.length} casos (atômico, estável, capacidade excedida)`);
}

// ── Reduce ─────────────────────────────────────────────────────────────────────────────────────────────────────────

async function reduce(): Promise<void> {
    const r = mulberry32(4);
    let cases = 0;
    for (const type of ['u32', 'i32', 'f32'] as ReduceType[]) {
        for (const op of ['sum', 'min', 'max'] as ReduceOpName[]) {
            const reducer = new Reduce(work, {
                discriminator: `ck_reduce_${op}_${type}`,
                capacity: 4_194_304,
                op,
                type,
            });
            for (const n of [1, 257, 4_194_304]) {
                const data =
                    type === 'u32'
                        ? Uint32Array.from({ length: n }, () => Math.floor(r() * 512))
                        : type === 'i32'
                          ? Int32Array.from({ length: n }, () => Math.floor(r() * 1001) - 500)
                          : Float32Array.from({ length: n }, () => r() * 2 - 0.5);
                const src = upload(data);
                const out = upload(new Uint32Array(4).fill(0xffffffff));
                reducer.prepare(src, out);
                app.core.record('ck-reduce', (frame) => {
                    reducer.record(frame, { src, count: n, out, outOffset: 2 });
                });
                app.core.submit();
                const bytes = await read(out, 16);
                const view =
                    type === 'u32'
                        ? new Uint32Array(bytes)
                        : type === 'i32'
                          ? new Int32Array(bytes)
                          : new Float32Array(bytes);
                const got = view[2]!;
                const arr = Array.from(data as ArrayLike<number>);
                const expected =
                    op === 'sum'
                        ? arr.reduce((a, b) => a + b, 0)
                        : op === 'min'
                          ? arr.reduce((a, b) => Math.min(a, b), Infinity)
                          : arr.reduce((a, b) => Math.max(a, b), -Infinity);
                const label = `Reduce ${op}/${type} N=${n}`;
                if (type === 'f32' && op === 'sum') {
                    const tol = 1e-5 * Math.max(1, Math.log2(n)) * Math.max(1, Math.abs(expected));
                    check(
                        Math.abs(got - expected) <= tol,
                        `${label}: ${got} ≠ ${expected} (tol ${tol})`,
                    );
                } else {
                    check(
                        got === (type === 'f32' ? Math.fround(expected) : expected),
                        `${label}: ${got} ≠ ${expected}`,
                    );
                }
                check(
                    new Uint32Array(bytes)[0] === 0xffffffff,
                    `${label}: escreveu fora de outOffset`,
                );
                app.core.destroy(src);
                app.core.destroy(out);
                cases++;
            }
            reducer.destroy();
        }
    }
    log(`Reduce: ${cases} casos conferidos`);
}

// ── GraphColorer ───────────────────────────────────────────────────────────────────────────────────────────────────

function gridEdges(w: number, h: number): Uint32Array {
    const out: number[] = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const v = y * w + x;
            if (x + 1 < w) out.push(v, v + 1);
            if (y + 1 < h) out.push(v, v + w);
        }
    }
    return Uint32Array.from(out);
}

/** Arestas da triangulação de Freudenthal de uma grade de cubos (6 tetraedros por cubo). */
function tetraEdges(n: number): Uint32Array {
    const id = (x: number, y: number, z: number) => (z * n + y) * n + x;
    const steps = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [1, 1, 0],
        [1, 0, 1],
        [0, 1, 1],
        [1, 1, 1],
    ];
    const out: number[] = [];
    for (let z = 0; z < n; z++)
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++)
                for (const [dx, dy, dz] of steps) {
                    if (x + dx! < n && y + dy! < n && z + dz! < n) {
                        out.push(id(x, y, z), id(x + dx!, y + dy!, z + dz!));
                    }
                }
    return Uint32Array.from(out);
}

function randomEdges(count: number, vertices: number): Uint32Array {
    const r = mulberry32(5);
    const out = new Uint32Array(count * 2);
    for (let e = 0; e < count; e++) {
        const a = Math.floor(r() * vertices);
        let b = Math.floor(r() * (vertices - 1));
        if (b >= a) b++;
        out[2 * e] = a;
        out[2 * e + 1] = b;
    }
    return out;
}

async function graphColoring(): Promise<void> {
    const graphs: [string, Uint32Array, number][] = [
        ['grade 2D 64×64', gridEdges(64, 64), 64 * 64],
        ['malha de tetraedros 16³', tetraEdges(16), 16 ** 3],
        ['grafo aleatório 1 M arestas', randomEdges(1_000_000, 100_000), 100_000],
    ];
    const colorer = new GraphColorer(work, { discriminator: 'ck_gc', capacity: 1_000_000 });
    for (const [name, edges, vertexCount] of graphs) {
        const edgeCount = edges.length / 2;
        const degree = new Uint32Array(vertexCount);
        for (const v of edges) degree[v]!++;
        const maxDegree = degree.reduce((a, b) => Math.max(a, b), 0);
        const buf = upload(edges);
        const t0 = performance.now();
        const coloring = await colorer.color(buf, edgeCount, vertexCount);
        const ms = performance.now() - t0;
        const colors = new Uint32Array(await read(coloring.edgeColors, edgeCount * 4));
        const byColor = new Uint32Array(await read(coloring.edgesByColor, edgeCount * 4));
        const verdict = verifyEdgeColoring(edges, colors);
        check(
            verdict.valid,
            `GraphColorer ${name}: arestas adjacentes com a mesma cor ${String(verdict.conflict)}`,
        );
        check(
            verdict.colorCount === coloring.colorCount,
            `GraphColorer ${name}: colorCount ${coloring.colorCount} ≠ ${verdict.colorCount}`,
        );
        check(
            coloring.colorCount <= 2 * maxDegree - 1,
            `GraphColorer ${name}: ${coloring.colorCount} cores > 2Δ − 1 = ${2 * maxDegree - 1}`,
        );
        // Intervalos contíguos cobrindo todas as arestas, cada uma na faixa da sua cor, uma vez só.
        let offset = 0;
        const seen = new Uint8Array(edgeCount);
        coloring.rangesCpu.forEach((range, c) => {
            check(
                range.offset === offset,
                `GraphColorer ${name}: cor ${c} começa em ${range.offset} ≠ ${offset}`,
            );
            for (let k = range.offset; k < range.offset + range.count; k++) {
                const e = byColor[k]!;
                if (colors[e] !== c || seen[e] === 1) {
                    check(false, `GraphColorer ${name}: aresta ${e} fora da faixa da cor ${c}`);
                    break;
                }
                seen[e] = 1;
            }
            offset += range.count;
        });
        check(
            offset === edgeCount,
            `GraphColorer ${name}: intervalos cobrem ${offset} de ${edgeCount}`,
        );
        log(
            `GraphColorer ${name}: ${edgeCount} arestas, Δ = ${maxDegree}, ${coloring.colorCount} cores em ${ms.toFixed(0)} ms`,
        );
        app.core.destroy(buf);
    }

    const loop = upload(new Uint32Array([0, 1, 2, 2]));
    let rejected = false;
    try {
        await colorer.color(loop, 2, 3);
    } catch (e) {
        rejected = e instanceof Error && e.message.includes('laço');
    }
    check(rejected, 'GraphColorer: laço não foi rejeitado');
    app.core.destroy(loop);
    colorer.destroy();
}

// ── fixed_point ────────────────────────────────────────────────────────────────────────────────────────────────────

async function fixedPointSum(): Promise<void> {
    const n = 1_000_000;
    const scale = 1048576;
    const r = mulberry32(6);
    const values = Float32Array.from({ length: n }, () => (r() * 2 - 1) * 1e-3);
    // Empates exatos de arredondamento (k + 0,5) / scale e valores fora da faixa.
    values.set([0.5 / scale, 1.5 / scale, -2.5 / scale, 4096, -4096], 0);
    const fpIn = wgslResource({
        name: 'fp_in',
        binding: { storage: 'read' },
        type: { wgsl: 'f32', array: true },
        frequency: 'stage',
        provider: 'private',
    });
    const fpOut = wgslResource({
        name: 'fp_out',
        binding: { storage: 'read_write' },
        type: { wgsl: 'i32', array: true },
        frequency: 'stage',
        provider: 'private',
    });
    const fpSum = wgslResource({
        name: 'fp_sum',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<i32>', array: true },
        frequency: 'stage',
        provider: 'private',
    });
    const module = wgslModule({
        name: 'ck_fixed_sum',
        requires: [fixedPoint, fpIn, fpOut, fpSum],
        source: `
@compute @workgroup_size(256)
fn fp_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * 256u;
    if (i >= ${n}u) { return; }
    let v = fixed_from_f32(fp_in[i], ${scale}.0);
    fp_out[i] = v;
    if (fixed_saturated(fp_in[i], ${scale}.0)) { atomicAdd(&fp_sum[1], 1); return; }
    atomicAdd(&fp_sum[0], v);
}`,
    });
    const input = upload(values);
    const out = storage(n * 4);
    const sum = upload(new Int32Array(4));
    const kernel = createComputeKernel(app.core, {
        discriminator: 'ck_fixed_sum',
        shader: module,
        entryPoint: 'fp_main',
        bindings: new Map([
            [fpIn, input],
            [fpOut, out],
            [fpSum, sum],
        ]),
    });
    app.core.record('ck-fixed', (frame) => {
        frame.compute('ck.fixed', (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind);
            pass.dispatch.invocations(n, 256);
        });
    });
    app.core.submit();
    const each = new Int32Array(await read(out, n * 4));
    const totals = new Int32Array(await read(sum, 16));
    let expectedSum = 0;
    let mismatch = -1;
    for (let i = 0; i < n; i++) {
        const ref = fixedFromF32(values[i]!, scale);
        if (each[i] !== ref && mismatch < 0) mismatch = i;
        if (Math.abs(ref) < FIXED_LIMIT) expectedSum += ref;
    }
    check(mismatch < 0, `fixed_point: conversão diverge da CPU em ${mismatch}`);
    check(totals[0] === expectedSum, `fixed_point: soma ${totals[0]} ≠ ${expectedSum}`);
    check(totals[1] === 2, `fixed_point: ${totals[1]} saturações detectadas (esperado 2)`);
    const real = Array.from(values.subarray(0, n - 0)).reduce(
        (a, v, i) => (i === 3 || i === 4 ? a : a + v),
        0,
    );
    check(
        Math.abs(totals[0]! / scale - real) <= (n * 0.5) / scale,
        `fixed_point: soma ${totals[0]! / scale} longe de ${real} além da resolução`,
    );
    log(`fixed_point: ${n} contribuições somadas iguais à CPU; saturação detectada`);
    destroyComputeKernel(app.core, kernel);
    for (const b of [input, out, sum]) app.core.destroy(b);
}

async function main(): Promise<void> {
    const canvas = document.createElement('canvas');
    app = await Application.create({
        // Antisserrilhado com que as medidas deste smoke foram calibradas (MSAA, o padrão antes da 034; o
        // temporal, padrão agora, tem o smoke `antialiasing`).
        antialias: 'msaa',
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
    });
    const owner = new SmokeWork();
    app.world.insert(owner);
    work = { core: app.core, resources: app.resources, work: owner };
    await prefixSum();
    await radixSort();
    await compaction();
    await reduce();
    await graphColoring();
    await fixedPointSum();
    app.dispose();
    if (failures.length > 0) log(`FAIL: ${failures.slice(0, 12).join(' | ')}`);
    else log('COMPUTEKERNELS SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
