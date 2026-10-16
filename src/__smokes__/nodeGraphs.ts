// Spec 031 (US2) — Smoke dos grafos de nós de ponto: uma `ParametricSurface` deslocada por ruído e colorida por uma
// rampa com ramificação (o mesmo ruído na cor e na rugosidade), montada por grafo (`SurfaceFunction`/`MaterialFunction`
// com `graph`), contra a mesma regra escrita em WGSL à mão.
//
//   (a) equivalência: vértices da superfície (≤ 1 ULP por componente) e pixels (≤ 1 por canal) iguais aos do WGSL à
//       mão; GPU por quadro igual dentro do ruído (≤ 10% + 0,05 ms);
//   (d) 60 s simulados mudando parâmetros a cada quadro → 0 shaders novos; troca de topologia (`setGraph`) compila em
//       transição sem quadro quebrado (a superfície em todos os quadros) e o visual novo aparece.
//
// Para rodar: `npm run smoke -- nodeGraphs [--query part=a.d]`. Resultado: `NODEGRAPHS SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    Camera,
    createScene,
    defineNode,
    DirectionalLight,
    graphArgument,
    MaterialFunction,
    NodeGraph,
    nodes,
    ParametricSurface,
    StandardMaterial,
    SurfaceFunction,
    Transform,
    wgslLib,
    wgslModule,
} from 'clayflow';
import type { EntityId, FrameCompleteEvent } from 'clayflow';

/** Spec de recurso do núcleo (o que `create` recebe). */
type ResourceSpec = Parameters<Application['core']['create']>[0];
import { capture, readBuffer, settle } from './support/extensionScenes';

function log(msg: string): void {
    console.log(`[nodeGraphs] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

/** Erros dos estágios e rejeições: qualquer um reprova. */
const engineErrors: string[] = [];

const SIZE = 128;

async function createApp(profiling = false): Promise<Application> {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    document.body.appendChild(canvas);
    const app = await Application.create({
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

interface Built {
    readonly app: Application;
    readonly id: EntityId;
    readonly surface: ParametricSurface;
    readonly surfaceFn: SurfaceFunction;
    readonly materialFn: MaterialFunction;
}

async function build(variant: 'hand' | 'graph', profiling = false): Promise<Built> {
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
            : new SurfaceFunction({ graph: surfaceGraph() });
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
            : new MaterialFunction({ graph: materialGraph() });
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
        const samples: number[] = [];
        b.app.events.on('frameComplete', (e: FrameCompleteEvent) => {
            if (e.stats.gpuTimeMs !== undefined) samples.push(e.stats.gpuTimeMs);
        });
        for (let k = 0; k < 150; k++) {
            b.app.step(1 / 60);
            await new Promise((r) => requestAnimationFrame(r));
        }
        const window = samples.slice(-90);
        const mean = window.reduce((a, c) => a + c, 0) / Math.max(1, window.length);
        if (window.length >= 30) gpu[variant] = Math.min(gpu[variant]!, mean);
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

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('part');
    const parts: Record<string, (f: string[]) => Promise<void>> = { a: partA, d: partD };
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
