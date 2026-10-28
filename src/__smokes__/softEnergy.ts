// Spec 037 — Smoke da série temporal da energia dos corpos moles (o canal temporal da C2 aplicado à física; FR-022).
//
// Com um `EnergyMeter` na cena, o `SoftEnergyFlow` grava a cada passo de física, no canal `SoftBodyEnergy` (8 fatias, um
// registro por corpo), a energia cinética, a potencial e a elástica de cada corpo mole, a potência dissipada no passo e
// a energia dissipada na janela.
//   - xpbd: um pano preso pela borda de cima e uma corda presa numa ponta, com as arestas esticadas (repouso 90 % da
//     distância inicial, complacência α > 0) sob a gravidade padrão: os três termos de cada corpo contra a referência f64
//     (`physics/reference/energy.ts`) do estado lido da GPU no mesmo quadro; as fatias do canal contra a potência e a
//     janela que a GPU tirou delas;
//   - fem: um bloco de nós caindo (o FEM do motor ainda não tem modelo elástico: a elástica vale 0), idem;
//   - mpm: um bloco elástico que cai e deforma no chão: a cinética, a potencial e a Neo-Hookean V₀·ψ(F) contra a f64,
//     idem;
//   - mixed: os três algoritmos na mesma cena (cada despacho toma só os registros do seu), idem;
//   - xpbd-damping / fem-damping: um corpo de partículas soltas (sem arestas, sem gravidade) em translação uniforme: o
//     solver multiplica a velocidade a cada substep (XPBD: 1 − c·dt; FEM: 1 − c; c = 0,05), então a potência e a janela,
//     que a GPU tira das fatias anteriores do canal, valem E·(f^(−2·substeps) − 1)/dt e E·(f^(−14·substeps) − 1) — a
//     solução analítica da lei discreta; antes de a série ter as fatias, zero; quadros sem passo de física não giram o
//     anel. No XPBD sem restrições na cena roda a fonte sem arestas;
//   - cost: com profiling por passe, a mediana de 80 quadros do tempo de GPU das duas passadas com 65 536 partículas
//     XPBD num corpo só e em 1024 corpos de 64, e com 32 768 partículas MPM num corpo. Limite: 1 % do quadro de 60 Hz
//     no M4 (0,167 ms) — a energia é um canal de diagnóstico e não pode pesar no orçamento de nenhum quadro.
//
// Limiares (FR-021/FR-022, do arredondamento f32), u = 2⁻²⁴, ε da divisão e da raiz do WGSL (2,5 e 4,5 ULP = 5u e 9u):
//   - cinética de um nó ½·(1/w)·|v|²: divisão 5u + produto escalar 5u + produto u ⇒ 12u (com folga) do termo; no MPM a
//     massa vem do uniforme (sem divisão), idem por baixo;
//   - potencial −m·g·x: o produto escalar de sinais mistos erra 5u de Σ|gᵢxᵢ|, mais a massa e o produto: 12u·m·Σ|gᵢxᵢ|;
//   - aresta ½·C²/α: a diferença das posições erra u por componente, o comprimento (raiz do produto escalar) 13u·d, a
//     subtração do repouso u·|C|: δC = 13u·d + u·|C|, e ½·C²/α erra |C|·δC/α + δC²/(2α) + 7u·U;
//   - Neo-Hookean: tr FᵀF erra 7u·tr; det F (expansão pela 1ª linha) 5u·perm(|F|); ln J o erro de J sobre J mais o do
//     `log` do WGSL (2⁻²¹ absoluto em [0,5; 2], senão 3 ULP); os produtos e as somas de ψ, 2u a 3u de cada parcela;
//   - a soma do corpo, em duas passadas: no bloco (1024 elementos) cada invocação soma até 16 termos em sequência e o
//     grupo reduz em 6 níveis; no corpo, cada invocação soma ⌈blocos/64⌉ blocos e o grupo reduz em mais 6:
//     (⌈min(n, 1024)/64⌉ + 6 + ⌈blocos/64⌉ + 6)·u·Σ|termos|;
//   - fatias: a potência e a janela de agora contra as energias guardadas nas fatias 1 e 7, em f64: as somas e a
//     subtração do kernel, 3u da soma dos módulos dos seis termos, e a divisão pelo passo 5u + u do passo em f32;
//   - amortecimento: a velocidade sai de (pred − pos)/dt, com pred = pos + v·dt: o erro por componente é
//     u·(|pos|/dt + 3|v|) da soma e da subtração, mais 9u (XPBD: 1/dt, os dois produtos e o fator) ou 7u (FEM: a
//     divisão, o produto e o fator) de |v|; a razão E_anterior/E acumula 2·Σ|vᵢ||δvᵢ|/|v|² por substep do passo (da
//     janela), mais o erro das duas energias; dividida pela própria diferença: ·(1 + r)/r.
//
// Para rodar: `npm run smoke -- softEnergy`. Resultado: `SOFTENERGY SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    createScene,
    EnergyMeter,
    GravityField,
    ParticlePhysics,
    SoftBody,
} from 'clayflow/web';
import type { AnyBufferSpec, GpuFrameTimedPayload, StagingBufferSpec } from 'clayflow/web';
import {
    det3,
    edgeElasticEnergy,
    femDampingFactor,
    neoHookeanEnergy,
    particleEnergy,
    substepEnergyRatio,
    xpbdDampingFactor,
} from '../elements/physics/reference/energy';
import { block, ground, SPACING } from './support/particleScenes';

type Vec3 = [number, number, number];

const U = 2 ** -24;
const DT = 1 / 60;
const LANES = 64;
const LEVELS = 6;
/** Elementos de um bloco da passada 1. */
const CHUNK = 1024;
/** O amortecimento dos solvers (`XPBDFlow`: damping 0,05 por segundo; `FEMFlow`: 0,05 por substep) e os substeps. */
const DAMPING = 0.05;
const XPBD_SUBSTEPS = 8;
const FEM_SUBSTEPS = 1;
const GRAVITY: Vec3 = [0, -9.81, 0];
const HISTORY = 8;
/** f32 por registro: partícula XPBD/FEM, MPM, faixa (u32), aresta, energia. */
const NODE_F32 = 12;
const MPM_F32 = 32;
const RANGE_U32 = 8;
const EDGE_U32 = 4;
const ENERGY_F32 = 8;
const ALGORITHM = { XPBD: 1, FEM: 2, MPM: 3 } as const;

const failures: string[] = [];

function log(msg: string): void {
    console.log(`[softEnergy] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

async function open(profiling = false): Promise<Application> {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        ...(profiling ? { profiling: 'passes' as const } : {}),
    });
    app.events.on('engineError', (e) => failures.push(`engineError: ${e.message}`));
    return app;
}

/** Cópia dos buffers dados num envio só (o mesmo estado do quadro). */
async function readAll(app: Application, specs: readonly AnyBufferSpec[]): Promise<ArrayBuffer[]> {
    const stagings = specs.map((s, k) =>
        app.core.create<StagingBufferSpec>({
            kind: 'buffer',
            subkind: 'staging',
            discriminator: `soft_energy_${k}_${s.byteSize}_${app.time.frame}`,
            byteSize: s.byteSize,
        }),
    );
    app.core.record('soft-energy-readback', (frame) => {
        specs.forEach((s, k) => {
            frame.copy(s, stagings[k]!, s.byteSize);
        });
    });
    app.core.submit();
    const out = await Promise.all(stagings.map((s) => app.core.readback(s)));
    for (const s of stagings) app.core.destroy(s);
    return out;
}

interface Range {
    readonly slot: number;
    readonly first: number;
    readonly count: number;
    readonly firstEdge: number;
    readonly edgeCount: number;
    readonly algorithm: number;
}

function rangesOf(bytes: ArrayBuffer, count: number): Range[] {
    const u = new Uint32Array(bytes);
    const out: Range[] = [];
    for (let slot = 0; slot < count; slot++) {
        const o = slot * RANGE_U32;
        if (u[o + 4] === 0) continue;
        out.push({
            slot,
            first: u[o]!,
            count: u[o + 1]!,
            firstEdge: u[o + 2]!,
            edgeCount: u[o + 3]!,
            algorithm: u[o + 4]!,
        });
    }
    return out;
}

/** Blocos de um corpo (o maior entre partículas e arestas). */
const chunksOf = (r: Range): number =>
    Math.max(1, Math.ceil(Math.max(r.count, r.edgeCount) / CHUNK));

/** Valor de referência e limite de erro de um campo da energia de um corpo. */
interface Field {
    ref: number;
    termErr: number;
    abs: number;
}

const field = (): Field => ({ ref: 0, termErr: 0, abs: 0 });
const add = (f: Field, value: number, err: number): void => {
    f.ref += value;
    f.termErr += err;
    f.abs += Math.abs(value);
};
/** Adições no caminho de um termo até a soma do corpo: no bloco e entre os blocos (`chunks`), cada uma estriada e em árvore. */
const sumPath = (n: number, chunks: number): number =>
    Math.ceil(Math.min(n, CHUNK) / LANES) + LEVELS + Math.ceil(chunks / LANES) + LEVELS;
/** Limite da soma do corpo: os erros dos termos e os das duas somas. */
const tolOf = (f: Field, n: number, chunks: number): number =>
    f.termErr + sumPath(n, chunks) * U * f.abs;

const absDot = (a: Vec3, b: Vec3): number =>
    Math.abs(a[0] * b[0]) + Math.abs(a[1] * b[1]) + Math.abs(a[2] * b[2]);
const vec = (f: Float32Array, o: number): Vec3 => [f[o]!, f[o + 1]!, f[o + 2]!];

/** Cinética e potencial de uma partícula com os limites de erro. */
function nodeTerms(
    kinetic: Field,
    potential: Field,
    mass: number,
    pos: Vec3,
    vel: Vec3,
    termU: number,
): void {
    const e = particleEnergy(mass, pos, vel, GRAVITY);
    add(kinetic, e.kinetic, termU * U * e.kinetic);
    add(potential, e.potential, termU * U * mass * absDot(GRAVITY, pos));
}

/** Os três campos de um corpo XPBD/FEM, com os limites. */
function nodeBody(
    nodes: Float32Array,
    edges: Uint32Array | undefined,
    r: Range,
): { kinetic: Field; potential: Field; elastic: Field } {
    const kinetic = field();
    const potential = field();
    const elastic = field();
    for (let k = 0; k < r.count; k++) {
        const o = (r.first + k) * NODE_F32;
        const w = nodes[o + 3]!;
        if (!(w > 0)) continue;
        nodeTerms(kinetic, potential, 1 / w, vec(nodes, o), vec(nodes, o + 8), 12);
    }
    if (edges !== undefined) {
        const ef = new Float32Array(edges.buffer, edges.byteOffset, edges.length);
        for (let k = 0; k < r.edgeCount; k++) {
            const o = (r.firstEdge + k) * EDGE_U32;
            const rest = ef[o + 2]!;
            const alpha = ef[o + 3]!;
            if (!(alpha > 0)) continue;
            const a = vec(nodes, edges[o]! * NODE_F32);
            const b = vec(nodes, edges[o + 1]! * NODE_F32);
            const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
            const c = d - rest;
            const e = edgeElasticEnergy(a, b, rest, alpha);
            const dc = 13 * U * d + U * Math.abs(c);
            add(elastic, e, (Math.abs(c) * dc) / alpha + (dc * dc) / (2 * alpha) + 7 * U * e);
        }
    }
    return { kinetic, potential, elastic };
}

/** Os três campos de um corpo MPM, com os limites (massa, volume, μ e λ em f32, como no uniforme). */
function mpmBody(
    particles: Float32Array,
    r: Range,
    material: readonly [number, number, number, number],
): { kinetic: Field; potential: Field; elastic: Field } {
    const [m, volume, mu, lambda] = material;
    const kinetic = field();
    const potential = field();
    const elastic = field();
    for (let k = 0; k < r.count; k++) {
        const o = (r.first + k) * MPM_F32;
        nodeTerms(kinetic, potential, m, vec(particles, o), vec(particles, o + 4), 12);
        const f: [Vec3, Vec3, Vec3] = [
            vec(particles, o + 8),
            vec(particles, o + 12),
            vec(particles, o + 16),
        ];
        const e = neoHookeanEnergy(f, mu, lambda, volume);
        const trace = f.reduce((s, c) => s + c[0] * c[0] + c[1] * c[1] + c[2] * c[2], 0);
        const J = det3(f);
        const [a, b, c] = f;
        const perm =
            Math.abs(a[0]) * (Math.abs(b[1] * c[2]) + Math.abs(c[1] * b[2]))
            + Math.abs(b[0]) * (Math.abs(a[1] * c[2]) + Math.abs(c[1] * a[2]))
            + Math.abs(c[0]) * (Math.abs(a[1] * b[2]) + Math.abs(b[1] * a[2]));
        const L = Math.log(J);
        const dL = (5 * U * perm) / J + (J >= 0.5 && J <= 2 ? 2 ** -21 : 6 * U * Math.abs(L));
        const A = 0.5 * mu * (trace - 3);
        const B = mu * L;
        const C = 0.5 * lambda * L * L;
        const dTr = 7 * U * trace + U * Math.abs(trace - 3);
        const err =
            volume
                * (0.5 * mu * dTr
                    + 2 * U * Math.abs(A)
                    + mu * dL
                    + U * Math.abs(B)
                    + lambda * Math.abs(L) * dL
                    + 3 * U * Math.abs(C)
                    + 2 * U * (Math.abs(A) + Math.abs(B) + Math.abs(C)))
            + U * Math.abs(e);
        add(elastic, e, err);
    }
    return { kinetic, potential, elastic };
}

/**
 * A série: as 8 fatias, da mais recente gravada à mais antiga, lidas com o estado no mesmo envio. A mais recente é a de
 * agora, se gravada no quadro, senão a anterior (o anel gira no começo do quadro seguinte à gravação); nesse caso a mais
 * antiga é a de agora, que ainda guarda o dado de 7 passos antes (só o próximo passo a regrava).
 */
function seriesSpecs(app: Application): AnyBufferSpec[] {
    const channel = app.resources.channelOfPool('SoftBodyEnergy');
    if (channel === undefined) throw new Error('a série SoftBodyEnergy não existe');
    const newest = channel.stamp(0) !== undefined ? 0 : 1;
    const out: AnyBufferSpec[] = [];
    for (let k = 0; k < HISTORY; k++) {
        const b = channel.buffer((newest + k) % HISTORY);
        if (b === undefined) throw new Error('a série SoftBodyEnergy não foi alocada');
        out.push(b);
    }
    return out;
}

/**
 * Confere os campos de cada corpo do algoritmo contra a referência e as fatias contra a potência e a janela. `state`
 * monta a referência de um corpo pelos buffers lidos.
 */
function verify(
    name: string,
    algorithm: number,
    ranges: Range[],
    slices: Float32Array[],
    state: (r: Range) => { kinetic: Field; potential: Field; elastic: Field },
    edgesOf: (r: Range) => number,
): void {
    const mine = ranges.filter((r) => r.algorithm === algorithm);
    check(mine.length > 0, `${name}: nenhum corpo na série`);
    const dt = Math.fround(DT);
    for (const r of mine) {
        const s = state(r);
        const o = r.slot * ENERGY_F32;
        const now = slices[0]!;
        const parts: [string, Field, number, number][] = [
            ['cinética', s.kinetic, now[o]!, r.count],
            ['potencial', s.potential, now[o + 1]!, r.count],
            ['elástica', s.elastic, now[o + 2]!, Math.max(edgesOf(r), r.count)],
        ];
        const report = parts.map(([label, f, gpu, n]) => {
            const err = Math.abs(gpu - f.ref);
            const tol = tolOf(f, n, chunksOf(r));
            check(
                err <= tol,
                `${name} corpo ${r.slot}: ${label} ${gpu} contra ${f.ref} (erro ${err.toExponential(2)} > ${tol.toExponential(2)})`,
            );
            return `${label} ${gpu.toPrecision(7)} (erro ${err.toExponential(2)} ≤ ${tol.toExponential(2)})`;
        });
        // As fatias: a potência e a janela de agora pelas energias guardadas em 1 e 7.
        const e = (slice: Float32Array): [number, number] => {
            const k = slice[o]!;
            const p = slice[o + 1]!;
            const el = slice[o + 2]!;
            return [k + p + el, Math.abs(k) + Math.abs(p) + Math.abs(el)];
        };
        const [eNow, aNow] = e(now);
        const [ePrev, aPrev] = e(slices[1]!);
        const [eOld, aOld] = e(slices[HISTORY - 1]!);
        const power = (ePrev - eNow) / dt;
        const window = eOld - eNow;
        const powerTol = (3 * U * (aPrev + aNow)) / dt + 6 * U * Math.abs(power);
        const windowTol = 3 * U * (aOld + aNow) + U * Math.abs(window);
        const powerErr = Math.abs(now[o + 3]! - power);
        const windowErr = Math.abs(now[o + 4]! - window);
        check(
            powerErr <= powerTol,
            `${name} corpo ${r.slot}: potência ${now[o + 3]} contra as fatias ${power} (erro ${powerErr.toExponential(2)} > ${powerTol.toExponential(2)})`,
        );
        check(
            windowErr <= windowTol,
            `${name} corpo ${r.slot}: janela ${now[o + 4]} contra as fatias ${window} (erro ${windowErr.toExponential(2)} > ${windowTol.toExponential(2)})`,
        );
        log(
            `${name} corpo ${r.slot} (${r.count} partículas, ${edgesOf(r)} arestas, ${chunksOf(r)} blocos): ${report.join('; ')}; potência ${now[o + 3]!.toPrecision(6)} W, janela ${now[o + 4]!.toPrecision(6)} J — pelas fatias, erro ${powerErr.toExponential(2)} ≤ ${powerTol.toExponential(2)} e ${windowErr.toExponential(2)} ≤ ${windowTol.toExponential(2)}`,
        );
    }
}

/** Grade n × n no plano xy, espaçamento h, a partir de `origin`; arestas horizontais, verticais e diagonais. */
function cloth(
    n: number,
    h: number,
    origin: Vec3,
): { position: number[]; a: number[]; b: number[]; rest: number[]; mass: number[] } {
    const position: number[] = [];
    const mass: number[] = [];
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            position.push(origin[0] + x * h, origin[1] - y * h, origin[2]);
            // Borda de cima presa (massa 0).
            mass.push(y === 0 ? 0 : 0.02);
        }
    }
    const a: number[] = [];
    const b: number[] = [];
    const link = (i: number, j: number): void => {
        a.push(i);
        b.push(j);
    };
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const i = y * n + x;
            if (x + 1 < n) link(i, i + 1);
            if (y + 1 < n) link(i, i + n);
            if (x + 1 < n && y + 1 < n) link(i, i + n + 1);
        }
    }
    const rest = a.map((i, k) => {
        const j = b[k]!;
        const d = Math.hypot(
            position[3 * j]! - position[3 * i]!,
            position[3 * j + 1]! - position[3 * i + 1]!,
            position[3 * j + 2]! - position[3 * i + 2]!,
        );
        return 0.9 * d;
    });
    return { position, a, b, rest, mass };
}

async function caseXpbd(): Promise<void> {
    const app = await open();
    app.world.insert(new EnergyMeter());
    // 48 × 48: 2304 partículas e 6721 arestas, 7 blocos (a soma entre blocos da passada 2).
    const sheet = cloth(48, 0.0125, [-0.3, 1.5, 0]);
    app.world.insert(
        new SoftBody({
            algorithm: 'XPBD',
            position: sheet.position,
            mass: sheet.mass,
            edges: { a: sheet.a, b: sheet.b, restLength: sheet.rest, compliance: 2e-4 },
        }),
    );
    // Corda de 40 partículas presa na primeira, arestas esticadas.
    const rope = Array.from({ length: 40 }, (_, i) => [0.5 + i * 0.03, 1.2, 0.1]).flat();
    app.world.insert(
        new SoftBody({
            algorithm: 'XPBD',
            position: rope,
            mass: Array.from({ length: 40 }, (_, i) => (i === 0 ? 0 : 0.01)),
            edges: {
                a: Array.from({ length: 39 }, (_, i) => i),
                b: Array.from({ length: 39 }, (_, i) => i + 1),
                restLength: Array.from({ length: 39 }, () => 0.027),
                compliance: 5e-4,
            },
        }),
    );
    await app.whenReady();
    app.step(DT, 12);
    const specs = [
        app.resources.poolBufferSpec('XPBDSoftSchema')!,
        app.resources.poolBufferSpec('DistanceConstraint')!,
        app.resources.poolBufferSpec('SoftBodyRange')!,
        ...seriesSpecs(app),
    ];
    const [nodes, edges, ranges, ...slices] = await readAll(app, specs);
    const count = app.resources.poolCount('SoftBodyRange');
    const edgeU32 = new Uint32Array(edges!);
    verify(
        'xpbd',
        ALGORITHM.XPBD,
        rangesOf(ranges!, count),
        slices.map((s) => new Float32Array(s)),
        (r) => nodeBody(new Float32Array(nodes!), edgeU32, r),
        (r) => r.edgeCount,
    );
    app.dispose();
}

async function caseFem(): Promise<void> {
    const app = await open();
    app.world.insert(new EnergyMeter());
    const position = block(125, 0.05, [-0.1, 1, -0.1], 7).flat();
    const body = new SoftBody({ algorithm: 'FEM', position, mass: 0.05 });
    app.world.insert(body);
    await app.whenReady();
    app.step(DT, 12);
    // A leitura da CPU (`resources.read`) dá a fatia mais recente do corpo: a mesma que a série guarda.
    const read = (await app.resources.read(body, 'energy')) as Record<string, number> | undefined;
    const specs = [
        app.resources.poolBufferSpec('FEMSchema')!,
        app.resources.poolBufferSpec('SoftBodyRange')!,
        ...seriesSpecs(app),
    ];
    const [nodes, ranges, ...slices] = await readAll(app, specs);
    const count = app.resources.poolCount('SoftBodyRange');
    const views = slices.map((s) => new Float32Array(s));
    const list = rangesOf(ranges!, count);
    verify(
        'fem',
        ALGORITHM.FEM,
        list,
        views,
        (r) => nodeBody(new Float32Array(nodes!), undefined, r),
        () => 0,
    );
    for (const r of list) check(views[0]![r.slot * ENERGY_F32 + 2] === 0, 'fem: elástica ≠ 0');
    const o = (list[0]?.slot ?? 0) * ENERGY_F32;
    const same =
        read !== undefined
        && (['kinetic', 'potential', 'elastic', 'power', 'window'] as const).every(
            (k, i) => read[k] === views[0]![o + i],
        );
    log(
        `fem: resources.read(corpo, 'energy') ${same ? 'igual à' : 'diferente da'} fatia mais recente`,
    );
    check(same, `fem: resources.read devolveu ${JSON.stringify(read)}`);
    app.dispose();
}

async function caseMpm(): Promise<void> {
    const app = await open();
    app.world.insert(new EnergyMeter());
    ground(app);
    const position = block(512, SPACING, [-3.5 * SPACING, 0.15, -3.5 * SPACING], 3).flat();
    app.world.insert(new SoftBody({ algorithm: 'MPM', position }));
    await app.whenReady();
    // Cai (0,15 m: ~10 passos), bate no chão e deforma.
    app.step(DT, 40);
    const material = ParticlePhysics.defaults;
    const { mu, lambda } = material.lame;
    const f32 = [material.particleMass, material.particleVolume, mu, lambda].map(Math.fround) as [
        number,
        number,
        number,
        number,
    ];
    const specs = [
        app.resources.poolBufferSpec('MPMSoftSchema')!,
        app.resources.poolBufferSpec('SoftBodyRange')!,
        ...seriesSpecs(app),
    ];
    const [particles, ranges, ...slices] = await readAll(app, specs);
    const count = app.resources.poolCount('SoftBodyRange');
    const views = slices.map((s) => new Float32Array(s));
    const list = rangesOf(ranges!, count);
    verify(
        'mpm',
        ALGORITHM.MPM,
        list,
        views,
        (r) => mpmBody(new Float32Array(particles!), r, f32),
        () => 0,
    );
    for (const r of list) {
        const elastic = views[0]![r.slot * ENERGY_F32 + 2]!;
        check(elastic > 0, `mpm: o bloco no chão sem energia elástica (${elastic})`);
    }
    app.dispose();
}

/** Os três algoritmos na mesma cena: cada despacho toma só os registros do seu (a região de parâmetros dele). */
async function caseMixed(): Promise<void> {
    const app = await open();
    app.world.insert(new EnergyMeter());
    ground(app);
    const sheet = cloth(8, 0.05, [-0.6, 1.5, 0]);
    app.world.insert(
        new SoftBody({
            algorithm: 'XPBD',
            position: sheet.position,
            mass: sheet.mass,
            edges: { a: sheet.a, b: sheet.b, restLength: sheet.rest, compliance: 2e-4 },
        }),
    );
    app.world.insert(
        new SoftBody({
            algorithm: 'FEM',
            position: block(64, 0.05, [0.4, 1, 0], 9).flat(),
            mass: 0.05,
        }),
    );
    const mpm = block(216, SPACING, [-2.5 * SPACING, 0.15, -2.5 * SPACING], 4).flat();
    app.world.insert(new SoftBody({ algorithm: 'MPM', position: mpm }));
    await app.whenReady();
    app.step(DT, 30);
    const material = ParticlePhysics.defaults;
    const { mu, lambda } = material.lame;
    const f32 = [material.particleMass, material.particleVolume, mu, lambda].map(Math.fround) as [
        number,
        number,
        number,
        number,
    ];
    const specs = [
        app.resources.poolBufferSpec('XPBDSoftSchema')!,
        app.resources.poolBufferSpec('DistanceConstraint')!,
        app.resources.poolBufferSpec('FEMSchema')!,
        app.resources.poolBufferSpec('MPMSoftSchema')!,
        app.resources.poolBufferSpec('SoftBodyRange')!,
        ...seriesSpecs(app),
    ];
    const [xpbd, edges, fem, particles, ranges, ...slices] = await readAll(app, specs);
    const list = rangesOf(ranges!, app.resources.poolCount('SoftBodyRange'));
    const views = slices.map((s) => new Float32Array(s));
    check(list.length === 3, `mixed: ${list.length} registros de faixa (esperado 3)`);
    const edgeU32 = new Uint32Array(edges!);
    verify(
        'mixed/xpbd',
        ALGORITHM.XPBD,
        list,
        views,
        (r) => nodeBody(new Float32Array(xpbd!), edgeU32, r),
        (r) => r.edgeCount,
    );
    verify(
        'mixed/fem',
        ALGORITHM.FEM,
        list,
        views,
        (r) => nodeBody(new Float32Array(fem!), undefined, r),
        () => 0,
    );
    verify(
        'mixed/mpm',
        ALGORITHM.MPM,
        list,
        views,
        (r) => mpmBody(new Float32Array(particles!), r, f32),
        () => 0,
    );
    app.dispose();
}

/**
 * Amortecimento: corpo de partículas soltas (4 × 4 × 4, 1 cm) perto da origem, sem gravidade, em translação uniforme.
 * `factor` é o fator por substep; `extraU` o erro relativo do fator e da conta da velocidade além de (pred − pos).
 */
async function caseDamping(
    name: string,
    algorithm: 'XPBD' | 'FEM',
    substeps: number,
    factor: number,
    extraU: number,
): Promise<void> {
    const app = await open();
    app.world.insert(new EnergyMeter());
    app.world.insert(new GravityField({ acceleration: [0, 0, 0, 0] }));
    const v: Vec3 = [1.5, 0, -0.5];
    const p0 = block(64, 0.01, [-0.015, -0.015, -0.015], 5);
    const body = new SoftBody({ algorithm, position: p0.flat(), mass: 0.1 });
    const data = body.data.body as { vel: number[] };
    data.vel = p0.flatMap(() => [v[0], v[1], v[2], 0]);
    app.world.insert(body);
    const frames = (): number => app.resources.channelOfPool('SoftBodyEnergy')?.frames ?? -1;
    const read = async (): Promise<Float32Array> =>
        new Float32Array((await readAll(app, [seriesSpecs(app)[0]!]))[0]!);
    await app.whenReady();
    app.step(DT);
    const first = await read();
    const slot = 0;
    log(
        `${name}: passo 1 — potência ${first[slot * ENERGY_F32 + 3]}, janela ${first[slot * ENERGY_F32 + 4]}`,
    );
    check(
        first[slot * ENERGY_F32 + 3] === 0 && first[slot * ENERGY_F32 + 4] === 0,
        `${name}: potência ou janela antes de a série ter as fatias`,
    );
    const STEPS = 20;
    app.step(DT, STEPS - 1);
    const energy = await read();
    const o = slot * ENERGY_F32;
    const e = energy[o]! + energy[o + 1]! + energy[o + 2]!;
    const r1 = substepEnergyRatio(factor, substeps, 1) - 1;
    const r7 = substepEnergyRatio(factor, substeps, HISTORY - 1) - 1;
    const m1 = (energy[o + 3]! * DT) / e;
    const m7 = energy[o + 4]! / e;
    // Erro relativo da energia num substep pela velocidade de (pred − pos)/dt; |pos| pela trajetória sem amortecimento
    // (o amortecimento só encurta o deslocamento).
    const dtSub = DT / substeps;
    const maxP0 = [0, 1, 2].map((c) => Math.max(...p0.map((p) => Math.abs(p[c]!))));
    const vv = v[0] ** 2 + v[1] ** 2 + v[2] ** 2;
    const substepErr = (s: number): number => {
        const t = s * dtSub;
        let sum = 0;
        for (let c = 0; c < 3; c++) {
            const pos = maxP0[c]! + Math.abs(v[c]!) * t;
            const dv = U * (pos / dtSub + 3 * Math.abs(v[c]!)) + extraU * U * Math.abs(v[c]!);
            sum += Math.abs(v[c]!) * dv;
        }
        return (2 * sum) / vv;
    };
    const span = (fromStep: number, toStep: number): number => {
        let sum = 0;
        for (let s = fromStep * substeps; s < toStep * substeps; s++) sum += substepErr(s + 1);
        return sum;
    };
    const energyErr = (12 + sumPath(64, 1)) * U;
    const tol1 = ((span(STEPS - 1, STEPS) + 2 * energyErr) * (1 + r1)) / r1 + 7 * U;
    const tol7 = ((span(STEPS - HISTORY + 1, STEPS) + 2 * energyErr) * (1 + r7)) / r7 + 2 * U;
    const e1 = Math.abs(m1 - r1) / r1;
    const e7 = Math.abs(m7 - r7) / r7;
    log(
        `${name}: passo ${STEPS}, E ${e.toFixed(7)} J — potência·dt/E ${m1.toExponential(5)} (analítico ${r1.toExponential(5)}, erro ${e1.toExponential(2)}, limite ${tol1.toExponential(2)}); janela/E ${m7.toExponential(5)} (analítico ${r7.toExponential(5)}, erro ${e7.toExponential(2)}, limite ${tol7.toExponential(2)}); fator ${factor}`,
    );
    check(e1 <= tol1, `${name}: potência com erro relativo ${e1} (limite ${tol1})`);
    check(e7 <= tol7, `${name}: janela com erro relativo ${e7} (limite ${tol7})`);

    // Quadros sem passo de física: o primeiro gira a gravação do último passo; daí em diante o anel para.
    app.step(0);
    const before = frames();
    app.step(0, 3);
    const still = await read();
    log(`${name}: 3 quadros sem passo — série ${before} → ${frames()} passos gravados`);
    check(frames() === before, `${name}: o anel girou sem passo de física`);
    check(
        still[o] === energy[o] && still[o + 3] === energy[o + 3],
        `${name}: a fatia mais recente mudou sem passo de física`,
    );
    app.dispose();
}

/** 1 % do quadro de 60 Hz (ms). */
const COST_LIMIT = 0.01 * (1000 / 60);

const median = (v: readonly number[]): number => [...v].sort((a, b) => a - b)[v.length >> 1] ?? 0;

/** Tempo de GPU das duas passadas da energia (mediana dos quadros estáveis) numa cena sem gravidade. */
async function energyCost(name: string, build: (app: Application) => void): Promise<void> {
    const app = await open(true);
    app.world.insert(new EnergyMeter());
    app.world.insert(new GravityField({ acceleration: [0, 0, 0, 0] }));
    build(app);
    await app.whenReady({ timeoutMs: 60_000 });
    const timings: GpuFrameTimedPayload[] = [];
    const off = app.events.on('gpuFrameTimed', (e) => timings.push(e));
    for (let i = 0; i < 90; i++) {
        app.step(DT);
        await new Promise((r) => setTimeout(r, 8));
    }
    // As últimas leituras chegam depois do último quadro; os quadros vazios daqui não entram na medida.
    for (let i = 0; i < 20; i++) {
        app.step(0);
        await new Promise((r) => setTimeout(r, 16));
    }
    off();
    const steady = timings
        .slice(10)
        .filter((t) => Object.keys(t.passesMs).some((k) => k.includes('SoftEnergyFlow')));
    const keys = [...new Set(steady.flatMap((t) => Object.keys(t.passesMs)))];
    const energy = keys.filter((k) => k.includes('SoftEnergyFlow'));
    const solver = keys.filter((k) => k.includes('XPBDFlow') || k.includes('MPMFlow'));
    const total = (ks: string[]): number =>
        median(steady.map((t) => ks.reduce((s, k) => s + (t.passesMs[k] ?? 0), 0)));
    const ms = total(energy);
    log(
        `cost: ${name} — energia ${ms.toFixed(3)} ms (${energy.map((k) => `${k.split('/').pop()} ${median(steady.map((t) => t.passesMs[k] ?? 0)).toFixed(3)}`).join(', ')}; limite ${COST_LIMIT.toFixed(3)} ms), solver ${total(solver).toFixed(3)} ms, ${steady.length} quadros`,
    );
    check(steady.length >= 40, `cost: ${name} com ${steady.length} quadros medidos`);
    check(
        ms <= COST_LIMIT,
        `cost: ${name} — energia ${ms.toFixed(3)} ms (≤ ${COST_LIMIT.toFixed(3)} ms)`,
    );
    app.dispose();
}

/** Grade de `n` pontos 64 × 64 × ⌈n/4096⌉ com espaçamento `h`, deslocada `ox` em x. */
const grid = (n: number, h: number, ox = 0): number[] => {
    const out: number[] = [];
    for (let i = 0; i < n; i++)
        out.push(ox + (i % 64) * h, Math.floor(i / 4096) * h, (Math.floor(i / 64) % 64) * h);
    return out;
};

async function caseCost(): Promise<void> {
    await energyCost('XPBD, 1 corpo × 65 536 partículas', (app) => {
        app.world.insert(
            new SoftBody({ algorithm: 'XPBD', position: grid(65536, 0.01), mass: 0.01 }),
        );
    });
    await energyCost('XPBD, 1024 corpos × 64 partículas', (app) => {
        for (let b = 0; b < 1024; b++)
            app.world.insert(
                new SoftBody({ algorithm: 'XPBD', position: grid(64, 0.01, b), mass: 0.01 }),
            );
    });
    await energyCost('MPM, 1 corpo × 32 768 partículas', (app) => {
        app.world.insert(new SoftBody({ algorithm: 'MPM', position: grid(32768, 0.02) }));
    });
}

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    const cases: Record<string, () => Promise<void>> = {
        xpbd: caseXpbd,
        fem: caseFem,
        mpm: caseMpm,
        mixed: caseMixed,
        'xpbd-damping': () =>
            caseDamping(
                'xpbd-damping',
                'XPBD',
                XPBD_SUBSTEPS,
                xpbdDampingFactor(DAMPING, DT / XPBD_SUBSTEPS),
                9,
            ),
        'fem-damping': () =>
            caseDamping('fem-damping', 'FEM', FEM_SUBSTEPS, femDampingFactor(DAMPING), 7),
        cost: caseCost,
    };
    for (const [name, run] of Object.entries(cases)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    if (failures.length > 0) {
        log(`FAIL: ${failures.join(' | ')}`);
        return;
    }
    log('SOFTENERGY SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
