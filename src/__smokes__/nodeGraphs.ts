// Spec 031 (US2) — Smoke dos grafos de nós de ponto: uma `ParametricSurface` deslocada por ruído e colorida por uma
// rampa com ramificação (o mesmo ruído na cor e na rugosidade), montada por grafo (`SurfaceFunction`/`MaterialFunction`
// com `graph`), contra a mesma regra escrita em WGSL à mão.
//
//   (a) equivalência: vértices da superfície (≤ 1 ULP por componente) e pixels (≤ 1 por canal) iguais aos do WGSL à
//       mão; GPU por quadro igual dentro do ruído (≤ 10% + 0,05 ms);
//   (b) grafo de conjunto (US3): grade → deslocar por ruído (grafo de ponto fundido) → normais → distribuir por densidade
//       (grafo de ponto fundido, contagem da GPU) → esferas → `meshOutput` numa `GraphGeometry`, contra a referência da
//       CPU (`support/nodeGraphReference.ts`): contagens exatas, posições e normais ≤ 1e-5 (leitura de volta só para a
//       medida, depois dos quadros); duas execuções com o mesmo hash; com a cena parada, 0 leituras de volta e 0 passes
//       do grafo em 120 quadros; um valor novo refaz o grafo uma vez;
//   (c) sub-grafos (US4): 1 000 caixas com `MaterialFunction({ graph })`, todas com o mesmo sub-grafo de ponto
//       (`Subgraph.point`) e valores próprios → 1 shader com a função do sub-grafo, as 2 orientações de 1 variante de
//       pipeline (a forma), 1 registro tipado (pool da forma) com os valores de cada entidade (leitura só para medir) e a
//       cor de cada caixa amostrada na imagem igual à do seu valor;
//   (d) 60 s simulados mudando parâmetros a cada quadro → 0 shaders novos; troca de topologia (`setGraph`) compila em
//       transição sem quadro quebrado (a superfície em todos os quadros) e o visual novo aparece;
//   (e) serialização (US4): os grafos de ponto da parte (a) e o de conjunto da parte (b) passam por
//       `toJSON` → texto → `fromJSON` (`defaultNodeRegistry`): mesmo JSON na volta, mesma forma (código gerado, plano do
//       grafo de conjunto) e imagem bit a bit igual à do grafo original;
//   (f) biblioteca base (US5): cada nó de ponto da biblioteca avaliado na GPU (um kernel de compute por nó, chamando a
//       função do nó) contra a referência da CPU (`elements/nodes/reference/library.ts`) com a tolerância do nó.
//
// Para rodar: `npm run smoke -- nodeGraphs [--query part=a.b.c.d.e.f]`. Resultado: `NODEGRAPHS SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    BoxGeometry,
    Camera,
    createComputeKernel,
    createScene,
    compileSetGraph,
    defaultNodeRegistry,
    destroyComputeKernel,
    defineNode,
    DirectionalLight,
    fromJSON,
    GraphGeometry,
    graphArgument,
    MaterialFunction,
    NodeGraph,
    nodes,
    ParametricSurface,
    SetGraph,
    StandardMaterial,
    Subgraph,
    SurfaceFunction,
    toJSON,
    Transform,
    WindField,
    wgslLib,
    wgslModule,
    wgslResource,
} from 'clayflow';
import type {
    EntityId,
    GraphJSON,
    NodeDefinition,
    StorageBufferSpec,
    WgslModule,
    WgslResource,
} from 'clayflow';

/** Spec de recurso do núcleo (o que `create` recebe). */
type ResourceSpec = Parameters<Application['core']['create']>[0];
import { capture, nextGpuFrame, readBuffer, settle } from './support/extensionScenes';
import { setGraphReference, smokeSetGraph } from './support/nodeGraphReference';
import { caseSamples, nodeCases, type NodeCase } from './support/nodeLibraryCases';

function log(msg: string): void {
    console.log(`[nodeGraphs] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

/** Erros dos estágios e rejeições: qualquer um reprova. */
const engineErrors: string[] = [];

const SIZE = 128;

async function createApp(profiling = false, width = SIZE, height = SIZE): Promise<Application> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const app = await Application.create({
        // Antisserrilhado com que as medidas deste smoke foram calibradas (MSAA, o padrão antes da 034; o
        // temporal, padrão agora, tem o smoke `antialiasing`).
        antialias: 'msaa',
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        ...(profiling ? { profiling: 'frame' as const } : {}),
    });
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}/${e.filter}: ${e.message}`));
    app.events.on('extensionRejected', (e) =>
        engineErrors.push(`extensionRejected ${e.point}:${e.line}: ${e.message}`),
    );
    return app;
}

// ---------------------------------------------------------------------------------------------------------------------
// A regra, à mão e por grafo.

const SURFACE_VALUES = { speed: 0.4, scale: 2.5, offset: [0.3, 1.7, 0.2], amp: 0.25 };
const MATERIAL_VALUES = {
    scale: 3,
    offset: [0, 0, 0],
    color_a: [0.08, 0.1, 0.35],
    color_b: [0.95, 0.65, 0.2],
    low: -0.6,
    high: 0.6,
};

const HAND_SURFACE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    let p = vec3f(u, v, time * data.speed);
    let n = gradient_noise3(p * data.scale + data.offset);
    return vec3f(v, data.amp * n, u);
}`;

const HAND_MATERIAL = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams {
    let n = gradient_noise3(s.world_position * data.scale + data.offset);
    let span = select(data.high - data.low, 1e-6, abs(data.high - data.low) < 1e-6);
    let c = mix(data.color_a, data.color_b, clamp((n - data.low) / span, 0.0, 1.0));
    return SurfaceParams(vec4f(c, m.albedo.a), n, m.metallic, vec3f(0.0));
}`;

/** Nós do usuário do smoke: (u, v, t·speed) e o levantamento (v, amp·h, u) — a orientação do plano pronto. */
const smokeNodes = wgslModule({
    name: 'smoke_graph_nodes',
    source: /* wgsl */ `
fn smoke_uvt(u: f32, v: f32, time: f32, speed: f32) -> vec3f {
    return vec3f(u, v, time * speed);
}

fn smoke_lift(u: f32, v: f32, h: f32, amp: f32) -> vec3f {
    return vec3f(v, amp * h, u);
}`,
});
const uvt = defineNode({
    name: 'smoke.uvt',
    inputs: { u: 'f32', v: 'f32', time: 'f32' },
    outputs: { value: 'vec3f' },
    params: { speed: { type: 'f32' } },
    code: smokeNodes,
    fn: 'smoke_uvt',
});
const lift = defineNode({
    name: 'smoke.lift',
    inputs: { u: 'f32', v: 'f32', h: 'f32' },
    outputs: { value: 'vec3f' },
    params: { amp: { type: 'f32' } },
    code: smokeNodes,
    fn: 'smoke_lift',
});

const surfaceGraph = (): NodeGraph =>
    new NodeGraph({
        nodes: {
            u: graphArgument('u'),
            v: graphArgument('v'),
            time: graphArgument('time'),
            uvt: uvt.with({ speed: SURFACE_VALUES.speed }),
            n: nodes.noise.gradient3.with({
                scale: SURFACE_VALUES.scale,
                offset: SURFACE_VALUES.offset,
            }),
            lift: lift.with({ amp: SURFACE_VALUES.amp }),
        },
        links: [
            ['u.value', 'uvt.u'],
            ['v.value', 'uvt.v'],
            ['time.value', 'uvt.time'],
            ['uvt.value', 'n.p'],
            ['u.value', 'lift.u'],
            ['v.value', 'lift.v'],
            ['n.value', 'lift.h'],
        ],
        output: 'lift.value',
    });

/** Ruído da posição → rampa → cor; o mesmo ruído na rugosidade (ramificação: avaliado uma vez). */
const materialGraph = (): NodeGraph =>
    new NodeGraph({
        nodes: {
            s: nodes.input.surfaceSample(),
            n: nodes.noise.gradient3.with({
                scale: MATERIAL_VALUES.scale,
                offset: MATERIAL_VALUES.offset,
            }),
            c: nodes.color.ramp.with({
                color_a: MATERIAL_VALUES.color_a,
                color_b: MATERIAL_VALUES.color_b,
                low: MATERIAL_VALUES.low,
                high: MATERIAL_VALUES.high,
            }),
            out: nodes.output.surfaceParams,
        },
        links: [
            ['s.world_position', 'n.p'],
            ['n.value', 'c.t'],
            ['c.color', 'out.base_color'],
            ['n.value', 'out.roughness'],
        ],
        output: 'out.value',
    });

/** Topologia nova: a rampa vai para a emissão; a cor base volta à do material. */
const glowGraph = (): NodeGraph =>
    new NodeGraph({
        nodes: {
            s: nodes.input.surfaceSample(),
            n: nodes.noise.gradient3.with({ scale: MATERIAL_VALUES.scale }),
            c: nodes.color.ramp.with({
                color_a: [0, 0, 0],
                color_b: [0.2, 0.9, 0.4],
                low: -0.6,
                high: 0.6,
            }),
            out: nodes.output.surfaceParams,
        },
        links: [
            ['s.world_position', 'n.p'],
            ['n.value', 'c.t'],
            ['c.color', 'out.emissive'],
        ],
        output: 'out.value',
    });

/** O grafo por texto: `toJSON` → `JSON.stringify` → `JSON.parse` → `fromJSON` com o registro da C3. */
function roundTrip(graph: NodeGraph): { readonly graph: NodeGraph; readonly same: boolean } {
    const text = JSON.stringify(toJSON(graph, defaultNodeRegistry));
    const back = fromJSON(JSON.parse(text) as GraphJSON, defaultNodeRegistry);
    return { graph: back, same: JSON.stringify(toJSON(back, defaultNodeRegistry)) === text };
}

interface Built {
    readonly app: Application;
    readonly id: EntityId;
    readonly surface: ParametricSurface;
    readonly surfaceFn: SurfaceFunction;
    readonly materialFn: MaterialFunction;
}

/** A cena da parte (a): regra escrita à mão, por grafo, ou pelo grafo serializado e lido (`json`, parte e). */
async function build(variant: 'hand' | 'graph' | 'json', profiling = false): Promise<Built> {
    const app = await createApp(profiling);
    app.world.insert(
        new Camera({ fov: Math.PI / 3, near: 0.1, far: 50 }).add(
            new Transform({
                position: [0, 2.2, 2.2, 1],
                rotation: Transform.lookRotation([0, 2.2, 2.2], [0, 0, 0], [0, 1, 0]),
            }),
        ),
    );
    app.world.insert(new DirectionalLight({ direction: [-0.3, -1, -0.4, 0], intensity: 1 }));
    const surface = new ParametricSurface({ resolution: [64, 64], domain: [-1, 1, -1, 1] });
    const surfaceFn =
        variant === 'hand'
            ? new SurfaceFunction({
                  code: HAND_SURFACE,
                  params: { speed: 'f32', scale: 'f32', offset: 'vec3f', amp: 'f32' },
                  values: SURFACE_VALUES,
                  requires: [wgslLib.noise],
              })
            : new SurfaceFunction({
                  graph: variant === 'json' ? roundTrip(surfaceGraph()).graph : surfaceGraph(),
              });
    const materialFn =
        variant === 'hand'
            ? new MaterialFunction({
                  code: HAND_MATERIAL,
                  params: {
                      scale: 'f32',
                      offset: 'vec3f',
                      color_a: 'vec3f',
                      color_b: 'vec3f',
                      low: 'f32',
                      high: 'f32',
                  },
                  values: MATERIAL_VALUES,
                  requires: [wgslLib.noise],
              })
            : new MaterialFunction({
                  graph: variant === 'json' ? roundTrip(materialGraph()).graph : materialGraph(),
              });
    const id = app.world.insert(
        surface
            .add(new StandardMaterial({ albedo: [0.7, 0.7, 0.7, 1] }))
            .add(new Transform())
            .add(surfaceFn)
            .add(materialFn),
    );
    await settle(app);
    return { app, id, surface, surfaceFn, materialFn };
}

/** Distância em ULPs entre dois f32 (pelos bits; sinais opostos contam pela distância a zero). */
function ulps(a: number, b: number): number {
    const v = new DataView(new ArrayBuffer(8));
    v.setFloat32(0, a, true);
    v.setFloat32(4, b, true);
    const ia = v.getInt32(0, true);
    const ib = v.getInt32(4, true);
    const ord = (i: number): number => (i < 0 ? -(i & 0x7fffffff) : i);
    return Math.abs(ord(ia) - ord(ib));
}

// ---------------------------------------------------------------------------------------------------------------------
// (a) Equivalência e custo.

async function partA(failures: string[]): Promise<void> {
    const shots: Record<string, { image: ImageData; vertices: Float32Array }> = {};
    for (const variant of ['hand', 'graph'] as const) {
        const b = await build(variant);
        for (let k = 0; k < 30; k++) b.app.step(1 / 60);
        // O canvas só vale na mesma tarefa do quadro: captura antes de qualquer espera.
        await settle(b.app, 100);
        const image = capture(b.app.canvas);
        const vertices = await readBuffer(
            b.app,
            b.app.resources.bufferOf(b.surface, 'vertices')!,
            `graph_${variant}_v`,
        );
        shots[variant] = { image, vertices };
        if (variant === 'graph') {
            const code = b.materialFn.code;
            const noiseCalls = code.match(/node_noise_gradient3\(/g)?.length ?? 0;
            log(
                `(a) material por grafo: ${code.match(/let v_/g)?.length ?? 0} lets, ruído chamado ${noiseCalls}×`,
            );
            if (noiseCalls !== 1) failures.push(`(a) ruído avaliado ${noiseCalls}× (esperado 1)`);
        }
        b.app.dispose();
        b.app.canvas.remove();
    }
    const hand = shots.hand!;
    const graph = shots.graph!;
    if (hand.vertices.length !== graph.vertices.length)
        failures.push('(a) tamanhos de vértices diferentes');
    let maxUlp = 0;
    for (let k = 0; k < hand.vertices.length; k++)
        maxUlp = Math.max(maxUlp, ulps(hand.vertices[k]!, graph.vertices[k]!));
    log(`(a) vértices: ${hand.vertices.length / 4} floats×4, diferença máxima ${maxUlp} ULP`);
    if (maxUlp > 1) failures.push(`(a) vértices diferem ${maxUlp} ULP (> 1)`);
    let maxPx = 0;
    let differing = 0;
    for (let k = 0; k < hand.image.data.length; k++) {
        const d = Math.abs(hand.image.data[k]! - graph.image.data[k]!);
        if (d > 0) differing++;
        maxPx = Math.max(maxPx, d);
    }
    log(`(a) pixels: diferença máxima ${maxPx} por canal (${differing} canais diferentes)`);
    if (maxPx > 1) failures.push(`(a) pixels diferem ${maxPx} por canal (> 1)`);
    {
        const d = graph.image.data;
        let lit = 0;
        let sum = 0;
        for (let k = 0; k < d.length; k += 4) {
            const l = d[k]! + d[k + 1]! + d[k + 2]!;
            sum += l;
            if (l > 30) lit++;
        }
        log(
            `(a) imagem: ${lit} pixels acesos, média ${(sum / (d.length / 4)).toFixed(1)}, canto ${[...d.slice(0, 4)].join(',')}, centro ${[...d.slice(((SIZE / 2) * SIZE + SIZE / 2) * 4, ((SIZE / 2) * SIZE + SIZE / 2) * 4 + 4)].join(',')}`,
        );
    }
    // A cena tem conteúdo: a rampa aparece (canal vermelho variando ao longo da linha do meio).
    let lo = 255;
    let hi = 0;
    for (let x = 16; x < SIZE - 16; x++) {
        const r = graph.image.data[((SIZE / 2) * SIZE + x) * 4]!;
        lo = Math.min(lo, r);
        hi = Math.max(hi, r);
    }
    if (hi - lo < 40) failures.push(`(a) a rampa não aparece (vermelho ${lo}–${hi})`);

    // Custo: GPU por quadro, alternando as variantes (duas rodadas cada; vale a menor média de cada uma).
    const gpu: Record<string, number> = { hand: Infinity, graph: Infinity };
    for (const variant of ['hand', 'graph', 'hand', 'graph'] as const) {
        const b = await build(variant, true);
        await b.app.whenReady({ timeoutMs: 60_000 });
        const samples: number[] = [];
        b.app.events.on('gpuFrameTimed', (e) => samples.push(e.totalMs));
        for (let k = 0; k < 150; k++) {
            b.app.step(1 / 60);
            await nextGpuFrame(b.app);
        }
        const window = samples.slice(-90);
        const mean = window.reduce((a, c) => a + c, 0) / Math.max(1, window.length);
        if (window.length >= 90) gpu[variant] = Math.min(gpu[variant]!, mean);
        b.app.dispose();
        b.app.canvas.remove();
    }
    if (!Number.isFinite(gpu.hand!) || !Number.isFinite(gpu.graph!)) {
        log('(a) GPU por quadro: sem timestamps neste dispositivo (custo não medido)');
    } else {
        log(
            `(a) GPU por quadro: à mão ${gpu.hand!.toFixed(3)} ms, grafo ${gpu.graph!.toFixed(3)} ms`,
        );
        if (gpu.graph! > gpu.hand! * 1.1 + 0.05)
            failures.push(
                `(a) grafo mais caro: ${gpu.graph!.toFixed(3)} ms × ${gpu.hand!.toFixed(3)} ms`,
            );
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// (d) Parâmetros sem recompilar; troca de topologia em transição.

/** Conta os shaders criados no núcleo do app a partir de agora. */
function countShaders(app: Application): { readonly count: () => number } {
    let n = 0;
    const core = app.core as {
        create: <S extends ResourceSpec>(s: S) => S;
        createAsync: <S extends ResourceSpec>(s: S) => Promise<S>;
    };
    const create = core.create.bind(core);
    const createAsync = core.createAsync.bind(core);
    core.create = <S extends ResourceSpec>(s: S): S => {
        if (s.kind === 'shader') n++;
        return create(s);
    };
    core.createAsync = <S extends ResourceSpec>(s: S): Promise<S> => {
        if (s.kind === 'shader') n++;
        return createAsync(s);
    };
    return { count: () => n };
}

async function partD(failures: string[]): Promise<void> {
    const b = await build('graph');
    const shaders = countShaders(b.app);
    // 60 s simulados: escala do ruído do material e amplitude do deslocamento mudam a cada quadro.
    for (let k = 0; k < 3600; k++) {
        b.materialFn.values.n_scale = 3 + Math.sin(k * 0.01);
        b.surfaceFn.values.lift_amp = 0.25 + 0.1 * Math.cos(k * 0.02);
        b.app.step(1 / 60);
        if (k % 60 === 59) await new Promise((r) => setTimeout(r, 0));
    }
    await settle(b.app, 100);
    const during = shaders.count();
    log(`(d) 3600 quadros (60 s) mudando parâmetros: ${during} shaders novos`);
    if (during !== 0) failures.push(`(d) ${during} recompilações mudando só parâmetros`);
    if (b.materialFn.revision !== 0 || b.surfaceFn.revision !== 0)
        failures.push('(d) a revisão subiu sem mudança de topologia');

    // Troca de topologia: o quadro segue com o grafo anterior até o novo compilar; a superfície em todos os quadros.
    const before = capture(b.app.canvas);
    const center = (img: ImageData): number[] => {
        const o = ((SIZE / 2) * SIZE + SIZE / 2) * 4;
        return [img.data[o]!, img.data[o + 1]!, img.data[o + 2]!];
    };
    const background = (img: ImageData): number[] => [img.data[0]!, img.data[1]!, img.data[2]!];
    const same = (a: number[], c: number[]): boolean => a.every((x, i) => Math.abs(x - c[i]!) <= 2);
    b.materialFn.setGraph(glowGraph());
    let broken = 0;
    let changedAt = -1;
    for (let k = 0; k < 120 && changedAt < 0; k++) {
        await new Promise((r) => setTimeout(r, 16));
        b.app.step(1 / 60);
        const img = capture(b.app.canvas);
        if (same(center(img), background(img))) broken++;
        let diff = 0;
        for (let i = 0; i < img.data.length; i += 4)
            diff += Math.abs(img.data[i + 1]! - before.data[i + 1]!);
        if (diff / (SIZE * SIZE) > 8) changedAt = k;
    }
    log(
        `(d) troca de topologia: revisão ${b.materialFn.revision}, visual novo no quadro ${changedAt}, ${broken} quadros sem a superfície, ${shaders.count() - during} shaders novos`,
    );
    if (b.materialFn.revision !== 1)
        failures.push(`(d) revisão ${b.materialFn.revision} após setGraph (esperado 1)`);
    if (broken > 0) failures.push(`(d) ${broken} quadros sem a superfície durante a troca`);
    if (changedAt < 0) failures.push('(d) o grafo novo não apareceu em 120 quadros');
    if (shaders.count() - during < 1)
        failures.push('(d) a troca de topologia não compilou shader novo');
    b.app.dispose();
    b.app.canvas.remove();
}

// ---------------------------------------------------------------------------------------------------------------------
// (b) Grafo de conjunto contra a referência da CPU, sem leitura de volta por quadro.

/** Buffers do grafo criados no núcleo (`graph:<entidade>:<revisão>:<chave>`), pela chave. */
type GraphBuffers = Map<string, { readonly byteSize: number }>;

/** Envolve o núcleo: guarda os buffers do grafo, conta leituras de volta e passes `set.*` gravados. */
function instrument(app: Application): {
    readonly buffers: GraphBuffers;
    readonly readbacks: () => number;
    readonly setPasses: () => number;
} {
    const buffers: GraphBuffers = new Map();
    let readbacks = 0;
    let setPasses = 0;
    const core = app.core as unknown as {
        create: <S extends ResourceSpec>(s: S) => S;
        readback: (s: unknown) => Promise<ArrayBuffer>;
        record: (label: unknown, body?: unknown) => void;
    };
    const create = core.create.bind(core);
    const readback = core.readback.bind(core);
    const record = core.record.bind(core);
    core.create = <S extends ResourceSpec>(s: S): S => {
        const out = create(s);
        const d = (s as { discriminator?: string }).discriminator;
        if (s.kind === 'buffer' && d?.startsWith('graph:') === true)
            buffers.set(d.split(':').slice(3).join(':'), out as { byteSize: number });
        return out;
    };
    core.readback = (s: unknown): Promise<ArrayBuffer> => {
        readbacks++;
        return readback(s);
    };
    core.record = (label: unknown, body?: unknown): void => {
        const wrap =
            (fn: (frame: { compute: (...a: unknown[]) => void }) => void) =>
            (frame: { compute: (...a: unknown[]) => void }) => {
                const compute = frame.compute.bind(frame);
                frame.compute = (...a: unknown[]) => {
                    if (typeof a[0] === 'string' && a[0].startsWith('set.')) setPasses++;
                    compute(...a);
                };
                fn(frame);
            };
        if (typeof label === 'function') record(wrap(label as never));
        else record(label, wrap(body as never));
    };
    return { buffers, readbacks: () => readbacks, setPasses: () => setPasses };
}

/** FNV-1a de 32 bits dos bytes. */
function fnvBytes(...arrays: ArrayBufferView[]): string {
    let h = 0x811c9dc5;
    for (const a of arrays) {
        const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

interface SetRun {
    readonly hash: string;
    readonly staticReadbacks: number;
    readonly staticPasses: number;
    readonly firstPasses: number;
    readonly image: ImageData;
}

/** Uma execução do grafo do smoke (ou de `graph`); mede contra a referência e devolve o hash do resultado. */
async function runSetGraph(
    failures: string[],
    label: string,
    graph: NodeGraph = smokeSetGraph(),
): Promise<SetRun> {
    const app = await createApp();
    const probe = instrument(app);
    app.world.insert(
        new Camera({ fov: Math.PI / 3, near: 0.05, far: 50 }).add(
            new Transform({
                position: [0, 2.0, 2.0, 1],
                rotation: Transform.lookRotation([0, 2.0, 2.0], [0, 0, 0], [0, 1, 0]),
            }),
        ),
    );
    app.world.insert(new DirectionalLight({ direction: [-0.3, -1, -0.4, 0], intensity: 1 }));
    const setGraph = new SetGraph({ graph });
    const plan = compileSetGraph(graph, (n) => setGraph.valuesOf(n));
    const cap = (key: string): number => plan.sets.find((s) => s.key === key)!.capacity;
    const slot = (key: string): number => plan.sets.find((s) => s.key === key)!.slot;
    const triangleCapacity = cap('r.mesh.triangles');
    const geometry = new GraphGeometry({
        vertexCapacity: cap('r.mesh.vertices'),
        indexCapacity: triangleCapacity * 3,
        edgeCapacity: triangleCapacity * 3,
    });
    app.world.insert(
        setGraph
            .add(geometry)
            .add(new StandardMaterial({ albedo: [0.85, 0.55, 0.25, 1] }))
            .add(new Transform()),
    );
    await settle(app, 300);
    const firstPasses = probe.setPasses();

    // Cena parada: nada refeito, nada lido de volta.
    const readbacks0 = probe.readbacks();
    const passes0 = probe.setPasses();
    for (let k = 0; k < 120; k++) {
        app.step(1 / 60);
        if (k % 30 === 29) await new Promise((r) => setTimeout(r, 0));
    }
    const staticReadbacks = probe.readbacks() - readbacks0;
    const staticPasses = probe.setPasses() - passes0;
    await settle(app, 100);
    const image = capture(app.canvas);

    // Medida (depois dos quadros): leitura de volta dos conjuntos e do alvo.
    const read = async (key: string): Promise<Float32Array> => {
        const spec = probe.buffers.get(key);
        if (spec === undefined) throw new Error(`(b) buffer do grafo '${key}' não encontrado`);
        return readBuffer(app, spec, `set_${label}_${key.replace(/\W/g, '_')}`);
    };
    const u32 = (f: Float32Array): Uint32Array => new Uint32Array(f.buffer, f.byteOffset, f.length);
    const counts = u32(await read('counts'));
    const countOf = (key: string): number => counts[slot(key) * 12]!;
    const normals = await read('n.mesh.vertices');
    const points = await read('s.points.points');
    const sphereVertices = await read('r.mesh.vertices');
    const sphereTriangles = u32(await read('r.mesh.triangles'));
    const target = (id: string) => app.resources.bufferOf(geometry, id)!;
    const indices = u32(await readBuffer(app, target('indices'), `set_${label}_indices`));
    const edges = u32(await readBuffer(app, target('wireEdges'), `set_${label}_edges`));
    const indirect = u32(await readBuffer(app, target('indirect'), `set_${label}_indirect`));

    const ref = setGraphReference();
    const fail = (msg: string): void => {
        failures.push(`(b:${label}) ${msg}`);
    };
    /** Maior diferença das posições e das normais (`stride` floats por elemento, normal no offset 3). */
    const compare = (
        gpu: Float32Array,
        cpu: Float64Array,
        stride: number,
        n: number,
    ): [number, number] => {
        let dp = 0;
        let dn = 0;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < 3; j++) {
                dp = Math.max(dp, Math.abs(gpu[i * stride + j]! - cpu[i * stride + j]!));
                dn = Math.max(dn, Math.abs(gpu[i * stride + 3 + j]! - cpu[i * stride + 3 + j]!));
            }
        }
        return [dp, dn];
    };
    const nVertices = ref.normals.vertices.length / 8;
    const [np, nn] = compare(normals, ref.normals.vertices, 8, nVertices);
    const pointCount = countOf('s.points.points');
    const refPoints = ref.points.points.length / 6;
    const sphereVertexCount = countOf('r.mesh.vertices');
    const sphereTriangleCount = countOf('r.mesh.triangles');
    log(
        `(b:${label}) malha ${nVertices} vértices: posição ${np.toExponential(2)}, normal ${nn.toExponential(2)}; pontos ${pointCount} (referência ${refPoints}, folga do aceite ${ref.points.margin.toExponential(2)}); esferas ${sphereVertexCount} vértices, ${sphereTriangleCount} triângulos`,
    );
    if (np > 1e-5 || nn > 1e-5) fail(`malha com normais difere: posição ${np}, normal ${nn}`);
    if (pointCount !== refPoints) fail(`${pointCount} pontos (referência ${refPoints})`);
    const nPoints = Math.min(pointCount, refPoints);
    const [pp, pn] = compare(points, ref.points.points, 6, nPoints);
    log(`(b:${label}) pontos: posição ${pp.toExponential(2)}, normal ${pn.toExponential(2)}`);
    if (pp > 1e-5 || pn > 1e-5) fail(`pontos diferem: posição ${pp}, normal ${pn}`);
    const refSphereVertices = ref.spheres.vertices.length / 8;
    const refSphereTriangles = ref.spheres.triangles.length / 3;
    if (sphereVertexCount !== refSphereVertices || sphereTriangleCount !== refSphereTriangles)
        fail(
            `esferas ${sphereVertexCount}/${sphereTriangleCount} (referência ${refSphereVertices}/${refSphereTriangles})`,
        );
    const nSphere = Math.min(sphereVertexCount, refSphereVertices);
    const [sp, sn] = compare(sphereVertices, ref.spheres.vertices, 8, nSphere);
    log(`(b:${label}) esferas: posição ${sp.toExponential(2)}, normal ${sn.toExponential(2)}`);
    if (sp > 1e-5 || sn > 1e-5) fail(`esferas diferem: posição ${sp}, normal ${sn}`);
    let badTriangles = 0;
    for (let i = 0; i < Math.min(sphereTriangleCount, refSphereTriangles) * 3; i++)
        if (sphereTriangles[i] !== ref.spheres.triangles[i]) badTriangles++;
    let badIndices = 0;
    for (let i = 0; i < triangleCapacity * 3; i++) {
        const want = i < refSphereTriangles * 3 ? ref.spheres.triangles[i]! : 0;
        if (indices[i] !== want) badIndices++;
    }
    let badEdges = 0;
    for (let e = 0; e < triangleCapacity * 3; e++) {
        const t = Math.floor(e / 3);
        const k = e % 3;
        const tri = ref.spheres.triangles;
        const want =
            t < refSphereTriangles ? [tri[t * 3 + k]!, tri[t * 3 + ((k + 1) % 3)]!] : [0, 0];
        if (edges[2 * e] !== want[0] || edges[2 * e + 1] !== want[1]) badEdges++;
    }
    log(
        `(b:${label}) alvo: indireto [${indirect[0]}, …, ${indirect[5]}], ${badTriangles} triângulos, ${badIndices} índices e ${badEdges} arestas diferentes da referência`,
    );
    if (badTriangles + badIndices + badEdges > 0)
        fail(`${badTriangles} triângulos, ${badIndices} índices, ${badEdges} arestas diferentes`);
    if (indirect[0] !== refSphereTriangles * 3 || indirect[5] !== refSphereTriangles * 3 * 6)
        fail(
            `indireto [${indirect[0]}, ${indirect[5]}] (esperado [${refSphereTriangles * 3}, ${refSphereTriangles * 18}])`,
        );
    const hash = fnvBytes(
        points.subarray(0, pointCount * 6),
        sphereVertices.subarray(0, sphereVertexCount * 8),
        sphereTriangles.subarray(0, sphereTriangleCount * 3),
        indices,
    );
    // Valor novo (semente da distribuição): o grafo é refeito uma vez, sem recompilar, e volta a parar.
    const passes1 = probe.setPasses();
    setGraph.values.s_seed = 8;
    for (let k = 0; k < 10; k++) app.step(1 / 60);
    const redone = probe.setPasses() - passes1;
    log(`(b:${label}) semente nova: ${redone} passes set.* em 10 quadros`);
    if (redone !== firstPasses)
        fail(`semente nova refez ${redone} passes (esperado ${firstPasses}, uma vez)`);
    app.dispose();
    app.canvas.remove();
    return { hash, staticReadbacks, staticPasses, firstPasses, image };
}

async function partB(failures: string[]): Promise<void> {
    const first = await runSetGraph(failures, '1');
    const second = await runSetGraph(failures, '2');
    log(
        `(b) hash ${first.hash} / ${second.hash}; passes set.* ao montar ${first.firstPasses}; com a cena parada (120 quadros): ${first.staticReadbacks} leituras de volta, ${first.staticPasses} passes set.*`,
    );
    if (first.hash !== second.hash)
        failures.push(`(b) execuções com hashes diferentes (${first.hash} × ${second.hash})`);
    if (first.firstPasses === 0) failures.push('(b) o grafo não gravou passes ao montar');
    for (const r of [first, second]) {
        if (r.staticReadbacks !== 0)
            failures.push(`(b) ${r.staticReadbacks} leituras de volta com a cena parada`);
        if (r.staticPasses !== 0)
            failures.push(`(b) ${r.staticPasses} passes do grafo refeitos com a cena parada`);
    }
    // As esferas aparecem: pixels diferentes do fundo.
    const d = first.image.data;
    let lit = 0;
    for (let k = 0; k < d.length; k += 4)
        if (
            Math.abs(d[k]! - d[0]!) + Math.abs(d[k + 1]! - d[1]!) + Math.abs(d[k + 2]! - d[2]!)
            > 30
        )
            lit++;
    log(`(b) imagem: ${lit} pixels com as esferas`);
    if (lit < 100) failures.push(`(b) as esferas não aparecem (${lit} pixels)`);
}

// ---------------------------------------------------------------------------------------------------------------------
// (c) 1 000 entidades com o mesmo sub-grafo de ponto e valores próprios.

const GRID_X = 40;
const GRID_Z = 25;
/** Pixels por unidade de mundo (câmera ortográfica de cima, uma caixa por unidade). */
const PX = 8;

/** Cor da entidade `i` (canais em [0,1; 0,9], distintos entre vizinhas). */
function entityColor(i: number): [number, number, number] {
    const c = (k: number): number => 0.1 + (0.8 * (((i * k) % 97) + 0.5)) / 97;
    return [c(37), c(61), c(23)];
}

/**
 * O sub-grafo da parte (c): ruído da posição de mundo → rampa de cor; as cores da rampa expostas (valor por uso), a
 * escala do ruído embutida no código.
 */
function tintSubgraph(): ReturnType<typeof Subgraph.point> {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                s: graphArgument('s', { world_position: 'vec3f' }),
                n: nodes.noise.gradient3.with({ scale: 2 }),
                c: nodes.color.ramp.with({ low: -1, high: 1 }),
            },
            links: [
                ['s.world_position', 'n.p'],
                ['n.value', 'c.t'],
            ],
            output: 'c.color',
        }),
        { name: 'smoke.tint', inputs: { s: 'SurfaceSample' }, expose: ['c.color_a', 'c.color_b'] },
    );
}

async function partC(failures: string[]): Promise<void> {
    const app = await createApp(false, GRID_X * PX, GRID_Z * PX);
    app.world.insert(
        // Câmera ortográfica a 40 m, de cima.
        new Camera({ projection: 'orthographic', orthoHeight: GRID_Z, near: 0.1, far: 50 }).add(
            new Transform({
                position: [0, 40, 0, 1],
                rotation: Transform.lookRotation([0, 40, 0], [0, 0, 0], [0, 0, -1]),
            }),
        ),
    );
    app.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], intensity: 1 }));
    const tint = tintSubgraph();
    // Contagem a partir de agora: shaders e pipelines com a função do sub-grafo.
    const shaderSources = new Set<string>();
    let shaderCreates = 0;
    let pipelineCreates = 0;
    const pipelineIds = new Set<unknown>();
    const core = app.core as {
        create: <S extends ResourceSpec>(s: S) => S;
        createAsync: <S extends ResourceSpec>(s: S) => Promise<S>;
    };
    const sourceOf = (s: ResourceSpec): string => {
        const x = s as {
            source?: string;
            vertex?: { shader?: { source?: string } };
            fragment?: { shader?: { source?: string } };
            shader?: { source?: string };
        };
        return [x.source, x.vertex?.shader?.source, x.fragment?.shader?.source, x.shader?.source]
            .filter((v) => v !== undefined)
            .join('\n');
    };
    const count = (s: ResourceSpec, out: ResourceSpec): void => {
        if (!sourceOf(s).includes(tint.fn)) return;
        if (s.kind === 'shader') {
            shaderCreates++;
            shaderSources.add(sourceOf(s));
        }
        if (s.kind === 'pipeline') {
            pipelineCreates++;
            pipelineIds.add(out);
        }
    };
    const create = core.create.bind(core);
    const createAsync = core.createAsync.bind(core);
    core.create = <S extends ResourceSpec>(s: S): S => {
        const out = create(s);
        count(s, out);
        return out;
    };
    core.createAsync = async <S extends ResourceSpec>(s: S): Promise<S> => {
        const out = await createAsync(s);
        count(s, out);
        return out;
    };

    const t0 = performance.now();
    const entities: { id: EntityId; fn: MaterialFunction; color: [number, number, number] }[] = [];
    for (let i = 0; i < GRID_X * GRID_Z; i++) {
        const cx = i % GRID_X;
        const rz = Math.floor(i / GRID_X);
        const color = entityColor(i);
        // Grafo próprio de cada entidade: a mesma forma (o mesmo sub-grafo), valores do uso diferentes.
        const graph = new NodeGraph({
            nodes: {
                s: nodes.input.surfaceSample(),
                t: tint.with({ c_color_a: color, c_color_b: color }),
                out: nodes.output.surfaceParams,
            },
            links: [
                ['s.value', 't.s'],
                ['t.value', 'out.emissive'],
            ],
            output: 'out.value',
        });
        const fn = new MaterialFunction({ graph });
        const id = app.world.insert(
            new BoxGeometry({ size: [0.8, 0.2, 0.8] })
                .add(new StandardMaterial({ albedo: [0, 0, 0, 1] }))
                .add(
                    new Transform({
                        position: [cx - GRID_X / 2 + 0.5, 0, rz - GRID_Z / 2 + 0.5, 1],
                    }),
                )
                .add(fn),
        );
        entities.push({ id, fn, color });
    }
    const built = performance.now() - t0;
    // Até todas as entidades desenharem com a função (a variante compila uma vez).
    await settle(app, 600);
    for (let k = 0; k < 3; k++) app.step(1 / 60);
    const image = capture(app.canvas);

    const first = entities[0]!.fn;
    const modules = new Set(entities.map((e) => e.fn.module));
    const records = new Set(entities.map((e) => e.fn.record));
    log(
        `(c) ${entities.length} entidades montadas em ${built.toFixed(0)} ms: ${modules.size} módulo, ${records.size} registro (${first.record.name}); shaders com '${tint.fn}': ${shaderCreates} criações, ${shaderSources.size} fonte; pipelines: ${pipelineCreates} criações, ${pipelineIds.size} distintos`,
    );
    if (modules.size !== 1) failures.push(`(c) ${modules.size} módulos (esperado 1)`);
    if (records.size !== 1) failures.push(`(c) ${records.size} formas de registro (esperado 1)`);
    if (shaderSources.size !== 1)
        failures.push(`(c) ${shaderSources.size} shaders com o sub-grafo (esperado 1)`);
    // Uma variante (a forma) com as duas orientações do material (ccw/cw), independente do número de entidades.
    if (pipelineIds.size !== 2)
        failures.push(`(c) ${pipelineIds.size} pipelines com o sub-grafo (esperado 2: ccw e cw)`);
    const code = first.code;
    const subCalls = code.match(new RegExp(`${tint.fn}\\(`, 'g'))?.length ?? 0;
    if (subCalls !== 1) failures.push(`(c) sub-grafo chamado ${subCalls}× no grafo (esperado 1)`);

    // Valores de cada entidade no pool da forma (leitura só para a medida).
    const key = first.record.name;
    const info = app.resources.poolInfo(key);
    if (info === undefined) {
        failures.push(`(c) pool '${key}' não existe`);
    } else {
        const data = await readBuffer(app, info.buffer, 'subgraph_pool');
        const offA = first.record.offsetOf('t_c_color_a') / 4;
        const offB = first.record.offsetOf('t_c_color_b') / 4;
        let wrong = 0;
        for (const e of entities) {
            const slot = app.resources.poolSlotOf(key, e.id);
            if (slot === undefined) {
                wrong++;
                continue;
            }
            const base = (slot * info.stride) / 4;
            for (let k = 0; k < 3; k++) {
                const want = Math.fround(e.color[k]!);
                if (data[base + offA + k] !== want || data[base + offB + k] !== want) wrong++;
            }
        }
        log(
            `(c) pool ${key}: ${info.count} slots, stride ${info.stride} B; ${wrong} valores diferentes do da entidade`,
        );
        if (wrong > 0) failures.push(`(c) ${wrong} valores do pool diferentes dos das entidades`);
    }

    // Cor de cada caixa no centro dela (emissão = a cor; cor base preta).
    let checked = 0;
    let worst = 0;
    let worstAt = -1;
    for (let i = 0; i < entities.length; i++) {
        const cx = i % GRID_X;
        const rz = Math.floor(i / GRID_X);
        const o = ((rz * PX + PX / 2) * image.width + cx * PX + PX / 2) * 4;
        const color = entities[i]!.color;
        for (let k = 0; k < 3; k++) {
            const d = Math.abs(image.data[o + k]! - color[k]! * 255);
            if (d > worst) {
                worst = d;
                worstAt = i;
            }
        }
        checked++;
    }
    log(
        `(c) cores na imagem: ${checked} caixas, maior diferença ${worst.toFixed(2)} (de 255) na entidade ${worstAt}`,
    );
    if (worst > 1)
        failures.push(`(c) cor da caixa ${worstAt} difere ${worst.toFixed(2)} da do seu valor`);
    app.dispose();
    app.canvas.remove();
}

// ---------------------------------------------------------------------------------------------------------------------
// (e) Grafos serializados e lidos: mesma forma, imagem bit a bit igual.

/** A forma do plano de um grafo de conjunto: nós, módulos fundidos, conjuntos, capacidades e contagens. */
function planShape(graph: NodeGraph): string {
    const setGraph = new SetGraph({ graph });
    const plan = compileSetGraph(graph, (n) => setGraph.valuesOf(n));
    return JSON.stringify({
        nodes: plan.nodes.map((n) => [
            n.id,
            n.definition.name,
            [...n.points].map(([port, p]) => [port, p.module.name, p.schema.wgslName]),
        ]),
        sets: plan.sets.map((s) => [s.key, s.schema.name, s.capacity, s.slot, s.count]),
        slots: plan.slots,
        cpu: [...plan.cpuCounts],
        animated: plan.animated,
    });
}

/** Imagens iguais byte a byte? Devolve o número de canais diferentes. */
function differingChannels(a: ImageData, b: ImageData): number {
    if (a.data.length !== b.data.length) return Infinity;
    let n = 0;
    for (let k = 0; k < a.data.length; k++) if (a.data[k] !== b.data[k]) n++;
    return n;
}

async function partE(failures: string[]): Promise<void> {
    // Grafos de ponto (parte a): mesmo JSON na volta e o mesmo código gerado.
    for (const [name, make] of [
        ['superfície', surfaceGraph],
        ['material', materialGraph],
    ] as const) {
        const original = make();
        const { graph, same } = roundTrip(original);
        if (!same) failures.push(`(e) ${name}: o JSON da volta difere do da ida`);
        const fnA = name === 'material' ? new MaterialFunction({ graph: original }) : undefined;
        const fnB = name === 'material' ? new MaterialFunction({ graph }) : undefined;
        const codeA = fnA?.code ?? new SurfaceFunction({ graph: original }).code;
        const codeB = fnB?.code ?? new SurfaceFunction({ graph }).code;
        log(
            `(e) grafo de ponto (${name}): ${JSON.stringify(toJSON(original, defaultNodeRegistry)).length} bytes de JSON, JSON da volta ${same ? 'igual' : 'diferente'}, código ${codeA === codeB ? 'igual' : 'diferente'}`,
        );
        if (codeA !== codeB) failures.push(`(e) ${name}: código gerado diferente após a leitura`);
    }
    const shots: Record<string, { image: ImageData; vertices: Float32Array }> = {};
    for (const variant of ['graph', 'json'] as const) {
        const b = await build(variant);
        for (let k = 0; k < 30; k++) b.app.step(1 / 60);
        await settle(b.app, 100);
        const image = capture(b.app.canvas);
        const vertices = await readBuffer(
            b.app,
            b.app.resources.bufferOf(b.surface, 'vertices')!,
            `graph_e_${variant}_v`,
        );
        shots[variant] = { image, vertices };
        b.app.dispose();
        b.app.canvas.remove();
    }
    const px = differingChannels(shots.graph!.image, shots.json!.image);
    let vx = 0;
    for (let k = 0; k < shots.graph!.vertices.length; k++)
        if (!Object.is(shots.graph!.vertices[k], shots.json!.vertices[k])) vx++;
    log(`(e) grafos de ponto lidos do JSON: ${px} canais e ${vx} floats de vértice diferentes`);
    if (px !== 0) failures.push(`(e) imagem do grafo de ponto lido difere em ${px} canais`);
    if (vx !== 0) failures.push(`(e) vértices do grafo de ponto lido diferem em ${vx} floats`);

    // Grafo de conjunto (parte b): mesmo JSON, mesmo plano, mesmo resultado e imagem bit a bit.
    const original = smokeSetGraph();
    const { graph, same } = roundTrip(original);
    const shapeSame = planShape(original) === planShape(graph);
    log(
        `(e) grafo de conjunto: JSON da volta ${same ? 'igual' : 'diferente'}, plano ${shapeSame ? 'igual' : 'diferente'}`,
    );
    if (!same) failures.push('(e) conjunto: o JSON da volta difere do da ida');
    if (!shapeSame) failures.push('(e) conjunto: plano diferente após a leitura');
    const a = await runSetGraph(failures, 'e-original', original);
    const b = await runSetGraph(failures, 'e-json', graph);
    const setPx = differingChannels(a.image, b.image);
    log(`(e) grafo de conjunto lido: hash ${a.hash} / ${b.hash}, ${setPx} canais diferentes`);
    if (a.hash !== b.hash) failures.push(`(e) conjunto: hash ${a.hash} × ${b.hash}`);
    if (setPx !== 0)
        failures.push(`(e) imagem do grafo de conjunto lido difere em ${setPx} canais`);
}

// ---------------------------------------------------------------------------------------------------------------------
// (f) Biblioteca base: cada nó de ponto na GPU contra a referência da CPU.

/** Entradas e saídas dos kernels de teste dos nós (um `vec4f` por valor; matrizes, uma coluna por `vec4f`). */
const nodeCaseIn = wgslResource({
    name: 'node_case_in',
    binding: { storage: 'read' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'stage',
    provider: 'private',
});
const nodeCaseOut = wgslResource({
    name: 'node_case_out',
    binding: { storage: 'read_write' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'stage',
    provider: 'private',
});

/** Componentes e `vec4f`s de um tipo de valor. */
const LANES: Readonly<Record<string, { readonly n: number; readonly slots: number }>> = {
    f32: { n: 1, slots: 1 },
    u32: { n: 1, slots: 1 },
    vec2f: { n: 2, slots: 1 },
    vec3f: { n: 3, slots: 1 },
    vec4f: { n: 4, slots: 1 },
    mat4x4f: { n: 16, slots: 4 },
};

/** Campos (nome, tipo) do struct `name` definido na árvore de `module`. */
function structOf(module: WgslModule, name: string): [string, string][] | undefined {
    const seen = new Set<WgslModule>();
    const walk = (m: WgslModule): [string, string][] | undefined => {
        if (seen.has(m)) return undefined;
        seen.add(m);
        const match = new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`).exec(m.source);
        if (match !== null)
            return match[1]!
                .replace(/\/\/[^\n]*/g, '')
                .split(',')
                .map((f) => f.split(':').map((t) => t.trim()) as [string, string])
                .filter(([n, t]) => n !== undefined && n.length > 0 && t !== undefined);
        for (const r of m.requires) {
            const found = walk(r);
            if (found !== undefined) return found;
        }
        return undefined;
    };
    return walk(module);
}

/** O recurso declarado `name` na árvore de `module`. */
function resourceIn(module: WgslModule, name: string): WgslResource | undefined {
    if ('resource' in module && module.name === name) return module as WgslResource;
    for (const r of module.requires) {
        const found = resourceIn(r, name);
        if (found !== undefined) return found;
    }
    return undefined;
}

/** Leitura de um valor de tipo `type` a partir do `vec4f` `k` da amostra. */
function readExpr(type: string, k: string): string {
    switch (type) {
        case 'f32':
            return `node_case_in[${k}].x`;
        case 'u32':
            return `u32(node_case_in[${k}].x)`;
        case 'vec2f':
            return `node_case_in[${k}].xy`;
        case 'vec3f':
            return `node_case_in[${k}].xyz`;
        case 'vec4f':
            return `node_case_in[${k}]`;
        case 'mat4x4f':
            return `mat4x4f(${[0, 1, 2, 3].map((c) => `node_case_in[${k} + ${c}u]`).join(', ')})`;
        default:
            throw new Error(`(f) tipo de entrada '${type}' sem leitura no kernel de teste`);
    }
}

/** Escritas (um `vec4f` por linha) de um valor `expr` de tipo `type`. */
function writeExprs(type: string, expr: string): string[] {
    switch (type) {
        case 'f32':
            return [`vec4f(${expr}, 0.0, 0.0, 0.0)`];
        case 'u32':
            return [`vec4f(f32(${expr}), 0.0, 0.0, 0.0)`];
        case 'vec2f':
            return [`vec4f(${expr}, 0.0, 0.0)`];
        case 'vec3f':
            return [`vec4f(${expr}, 0.0)`];
        case 'vec4f':
            return [expr];
        case 'mat4x4f':
            return [0, 1, 2, 3].map((c) => `${expr}[${c}]`);
        default:
            throw new Error(`(f) tipo de saída '${type}' sem escrita no kernel de teste`);
    }
}

interface CaseResult {
    readonly node: string;
    /** Pior erro (`|gpu − ref| / max(1, |ref|)`) e a tolerância. */
    readonly worst: number;
    readonly tolerance: number;
}

/** Avalia o nó do caso na GPU (um kernel de compute que chama a função do nó) e mede contra a referência. */
async function runNodeCase(app: Application, c: NodeCase, index: number): Promise<CaseResult> {
    const def = defaultNodeRegistry.get(c.node) as NodeDefinition;
    // Entradas e parâmetros na ordem da função; o valor de uma entrada (spec 011) é a própria entrada.
    const ports: [string, string][] = [
        ...Object.entries(def.inputs),
        ...Object.entries(def.params)
            .filter(([n]) => !(n in def.inputs))
            .map(([n, p]) => [n, p.type] as [string, string]),
    ];
    // Tipos de cada porta, campo a campo (struct de entrada, spec 011: `Closure`, construído no kernel).
    const fieldsOf = (type: string): string[] => {
        if (type in LANES) return [type];
        const fields = structOf(def.code, type);
        if (fields === undefined) throw new Error(`(f) ${c.node}: struct '${type}' não achado`);
        return fields.map(([, t]) => t);
    };
    const slotsOf = (type: string): number =>
        fieldsOf(type).reduce((n, t) => n + LANES[t]!.slots, 0);
    // Saídas: um pedaço (tipo, expressão) por porta; struct (fora das saídas múltiplas) por campo.
    const single = Object.keys(def.outputs).length === 1;
    const pieces: { port: string; type: string; expr: string }[] = [];
    for (const [port, type] of Object.entries(def.outputs)) {
        const expr = single ? 'r' : `r.${port}`;
        if (type in LANES) pieces.push({ port, type, expr });
        else {
            const fields = structOf(def.code, type);
            if (fields === undefined) throw new Error(`(f) ${c.node}: struct '${type}' não achado`);
            for (const [f, t] of fields) pieces.push({ port, type: t, expr: `${expr}.${f}` });
        }
    }
    const slotsIn = ports.reduce((n, [, t]) => n + slotsOf(t), 0);
    const writes = pieces.flatMap((p) => writeExprs(p.type, p.expr));
    const samples = caseSamples(c, 1000 + index);
    const n = samples.length;
    const inData = new Float32Array(n * slotsIn * 4);
    samples.forEach((x, i) => {
        let slot = i * slotsIn;
        for (const [name, type] of ports) {
            const v = x[name]!;
            const all = typeof v === 'number' ? [v] : v;
            let used = 0;
            for (const ft of fieldsOf(type)) {
                const lanes = LANES[ft]!;
                const values = all.slice(used, used + lanes.n);
                used += lanes.n;
                if (lanes.slots === 1) inData.set(values, slot * 4);
                else
                    for (let col = 0; col < lanes.slots; col++)
                        inData.set(values.slice(col * 4, col * 4 + 4), (slot + col) * 4);
                slot += lanes.slots;
            }
        }
    });
    let offset = 0;
    const args = ports.map(([, type]) => {
        const reads = fieldsOf(type).map((ft) => {
            const e = readExpr(ft, `b + ${offset}u`);
            offset += LANES[ft]!.slots;
            return e;
        });
        return type in LANES ? reads[0]! : `${type}(${reads.join(', ')})`;
    });
    const module = wgslModule({
        name: `node_case_${index}`,
        requires: [def.code, nodeCaseIn, nodeCaseOut],
        source: /* wgsl */ `
@compute @workgroup_size(64)
fn node_case_main(@builtin(global_invocation_id) g: vec3u) {
    if (g.x >= ${n}u) { return; }
    let b = g.x * ${slotsIn}u;
    let r = ${def.fn}(${args.join(', ')});
    let o = g.x * ${writes.length}u;
${writes.map((w, k) => `    node_case_out[o + ${k}u] = ${w};`).join('\n')}
}`,
    });
    const storage = (name: string, byteSize: number): StorageBufferSpec =>
        app.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `node_case_${index}_${name}`,
            byteSize: Math.max(16, byteSize),
        });
    const inBuf = storage('in', inData.byteLength);
    const outBuf = storage('out', n * writes.length * 16);
    app.core.write(inBuf, inData);
    const bindings = new Map<WgslResource, StorageBufferSpec>([
        [nodeCaseIn, inBuf],
        [nodeCaseOut, outBuf],
    ]);
    if (c.scene !== undefined) {
        const resource = resourceIn(def.code, c.scene.resource);
        const type = resource?.resource.type;
        if (resource === undefined || type === undefined || !('schema' in type))
            throw new Error(`(f) ${c.node}: recurso '${c.scene.resource}' sem schema`);
        const bytes = new Uint8Array(type.schema.stride * c.scene.records.length);
        c.scene.records.forEach((rec, k) => {
            bytes.set(type.schema.pack({ ...rec }), k * type.schema.stride);
        });
        const sceneBuf = storage('scene', bytes.byteLength);
        app.core.write(sceneBuf, bytes);
        bindings.set(resource, sceneBuf);
    }
    const kernel = createComputeKernel(app.core, {
        discriminator: `node_case_${index}`,
        shader: module,
        entryPoint: 'node_case_main',
        bindings,
    });
    app.core.record('node-case', (frame) => {
        frame.compute('node.case', (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind);
            pass.dispatch.invocations(n, 64);
        });
    });
    app.core.submit();
    const out = await readBuffer(app, outBuf, `node_case_${index}`);
    destroyComputeKernel(app.core, kernel);
    let worst = 0;
    samples.forEach((x, i) => {
        const ref = c.reference(x);
        let slot = i * writes.length;
        const gpu: Record<string, number[]> = {};
        for (const p of pieces) {
            const lanes = LANES[p.type]!;
            const values: number[] = [];
            for (let col = 0; col < lanes.slots; col++)
                values.push(
                    ...out.slice((slot + col) * 4, (slot + col) * 4 + Math.min(4, lanes.n)),
                );
            slot += lanes.slots;
            (gpu[p.port] ??= []).push(...values);
        }
        for (const [port, want] of Object.entries(ref)) {
            const w: readonly number[] = typeof want === 'number' ? [want] : want;
            const got = gpu[port] ?? [];
            w.forEach((v, k) => {
                const err = Math.abs((got[k] ?? NaN) - v) / Math.max(1, Math.abs(v));
                worst = Math.max(worst, Number.isNaN(err) ? Infinity : err);
            });
        }
    });
    return { node: c.node, worst, tolerance: c.tolerance };
}

/**
 * Nós da biblioteca em pontos reais: uma superfície levantada por fBm (ponto `surface`, compute) e colorida pelo campo
 * da cena amostrado na posição de mundo (`field.sample` no ponto `material`, fragmento) por uma rampa de 4 paradas, com a
 * rugosidade pelo ruído celular. Com um vento turbulento na cena, a cor muda; sem campo, a aceleração é zero.
 */
async function libraryScene(withField: boolean): Promise<ImageData> {
    const app = await createApp();
    app.world.insert(
        new Camera({ fov: Math.PI / 3, near: 0.1, far: 50 }).add(
            new Transform({
                position: [0, 2.2, 2.2, 1],
                rotation: Transform.lookRotation([0, 2.2, 2.2], [0, 0, 0], [0, 1, 0]),
            }),
        ),
    );
    app.world.insert(new DirectionalLight({ direction: [-0.3, -1, -0.4, 0], intensity: 1 }));
    if (withField)
        app.world.insert(new WindField({ direction: [1, 0, 0, 0], magnitude: 3, turbulence: 1 }));
    const { input, math, map, color, noise, field, output } = nodes;
    const surface = new NodeGraph({
        nodes: {
            u: input.cell('u'),
            v: input.cell('v'),
            p: math.combine3,
            zero: math.value,
            h: noise.fbm3.with({ scale: 1.5, seed: 3, octaves: 4 }),
            amp: math.value.with({ value: 0.25 }),
            y: math.mul,
            out: math.combine3,
        },
        links: [
            ['u.value', 'p.x'],
            ['v.value', 'p.y'],
            ['zero.value', 'p.z'],
            ['p.value', 'h.p'],
            ['h.value', 'y.a'],
            ['amp.value', 'y.b'],
            ['v.value', 'out.x'],
            ['y.value', 'out.y'],
            ['u.value', 'out.z'],
        ],
        output: 'out.value',
    });
    const look = new NodeGraph({
        nodes: {
            s: input.surfaceSample(),
            f: field.sample,
            len: math.length,
            t: map.range.with({ in_min: 0, in_max: 6 }),
            c: color.ramp4,
            cell: noise.cellular3.with({ scale: 4 }),
            out: output.surfaceParams,
        },
        links: [
            ['s.world_position', 'f.x'],
            ['s.time', 'f.time'],
            ['f.value', 'len.v'],
            ['len.value', 't.x'],
            ['t.value', 'c.t'],
            ['c.color', 'out.base_color'],
            ['s.world_position', 'cell.p'],
            ['cell.f1', 'out.roughness'],
        ],
        output: 'out.value',
    });
    const parametric = new ParametricSurface({ resolution: [48, 48], domain: [-1, 1, -1, 1] });
    app.world.insert(
        parametric
            .add(new StandardMaterial({ albedo: [0.7, 0.7, 0.7, 1] }))
            .add(new Transform())
            .add(new SurfaceFunction({ graph: surface }))
            .add(new MaterialFunction({ graph: look })),
    );
    await settle(app, 300);
    for (let k = 0; k < 10; k++) app.step(1 / 60);
    const image = capture(app.canvas);
    app.dispose();
    app.canvas.remove();
    return image;
}

async function partF(failures: string[]): Promise<void> {
    const app = await createApp();
    const results: CaseResult[] = [];
    let derivative = 0;
    for (const [k, c] of nodeCases.entries()) {
        // Derivadas de tela só no fragmento: conferido no smoke que desenha o nó (spec 011).
        if (c.derivatives === true) {
            derivative++;
            continue;
        }
        try {
            results.push(await runNodeCase(app, c, k));
        } catch (err) {
            failures.push(`(f) ${c.node}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    const byCategory = new Map<string, CaseResult[]>();
    for (const r of results) {
        const cat = r.node.slice(0, r.node.indexOf('.'));
        byCategory.set(cat, [...(byCategory.get(cat) ?? []), r]);
    }
    for (const [cat, rs] of byCategory) {
        const worst = rs.reduce((a, r) => (r.worst / r.tolerance > a.worst / a.tolerance ? r : a));
        log(
            `(f) ${cat}: ${rs.length} nós — pior ${worst.node} ${worst.worst.toExponential(2)} (tolerância ${worst.tolerance.toExponential(0)})`,
        );
    }
    const bad = results.filter((r) => !(r.worst <= r.tolerance));
    log(
        `(f) ${results.length} de ${nodeCases.length} nós avaliados na GPU, ${nodeCases.length > 0 ? caseSamples(nodeCases[0]!, 0).length : 0} amostras cada; ${bad.length} fora da tolerância; ${derivative} de derivadas de tela conferido(s) no smoke materials`,
    );
    for (const r of bad)
        failures.push(`(f) ${r.node}: erro ${r.worst.toExponential(2)} > ${r.tolerance}`);
    app.dispose();
    app.canvas.remove();

    // Em pontos reais: superfície (compute) e material (fragmento) montados com os nós; o campo da cena chega à cor.
    const still = await libraryScene(false);
    const windy = await libraryScene(true);
    const lit = (img: ImageData): number => {
        let n = 0;
        for (let k = 0; k < img.data.length; k += 4)
            if (
                Math.abs(img.data[k]! - img.data[0]!)
                    + Math.abs(img.data[k + 1]! - img.data[1]!)
                    + Math.abs(img.data[k + 2]! - img.data[2]!)
                > 30
            )
                n++;
        return n;
    };
    const changed = differingChannels(still, windy);
    log(
        `(f) em pontos reais: superfície por fBm e material pelo campo da cena — ${lit(still)} pixels da superfície; com vento, ${changed} canais diferentes`,
    );
    if (lit(still) < 1000) failures.push('(f) a superfície montada com os nós não aparece');
    if (changed < 1000) failures.push('(f) o campo da cena não chega à cor (field.sample)');
}

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('part');
    const parts: Record<string, (f: string[]) => Promise<void>> = {
        a: partA,
        b: partB,
        c: partC,
        d: partD,
        e: partE,
        f: partF,
    };
    const failures: string[] = [];
    for (const [name, run] of Object.entries(parts)) {
        if (only !== null && !only.split('.').includes(name)) continue;
        await run(failures);
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('NODEGRAPHS SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
