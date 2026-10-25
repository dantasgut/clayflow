// Spec 033 — Smoke da estrutura de raios (Fase 2, T016; US6, SC-009).
//
// Um estágio de teste consulta `ray_scene_hit` na GPU com raios conhecidos e compara com a interseção analítica:
//   - analytic: esfera (malha fina), caixa girada e escalada e um plano de superfície paramétrica — ponto e normal a
//     ≤ 1 % do tamanho do objeto, a instância certa, e os raios que passam longe não acertam nada;
//   - refit: a superfície paramétrica escrita na GPU muda de altura (valor da função) e a consulta acompanha (reajuste
//     sem leitura de volta);
//   - moving: uma instância que se move é encontrada na posição nova no quadro seguinte (hierarquia de cima por quadro);
//   - scale: 1 milhão de triângulos (uma malha de superfície grande) — a consulta acerta e o tempo de construção e de
//     reajuste fica no relatório;
//   - contract (US6): um estágio novo consulta a cena sem conhecer a origem da geometria — malha, superfície
//     paramétrica, geometria de grafo de nós, corpo mole (XPBD), esferas de um corpo de sprites (pelo mesmo
//     `ray_scene_hit`) e a água por
//     campo de distância (pelo ponto de cena `ray_volume_hit`, composto pela C2 no kernel) — e compara com a interseção
//     analítica: ≤ 1 % do tamanho e ≤ 3° na normal nos objetos analíticos; na água, os acertos a ≤ 1 espaçamento da esfera
//     das partículas de fora.
// Para rodar: `npm run smoke -- rayScene [--query case=analytic]`. Resultado: `RAYSCENE SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    BoxGeometry,
    compileSetGraph,
    createScene,
    Flow,
    FluidBody,
    FluidSurfaceMaterial,
    GraphGeometry,
    NodeGraph,
    nodes,
    ParametricSurface,
    ParticlePhysics,
    PointSpriteMaterial,
    RayScene,
    rayScene,
    rayVolumeHitReady,
    SetGraph,
    slot,
    SoftBody,
    SphereGeometry,
    StandardMaterial,
    SurfaceFunction,
    Transform,
    wgslModule,
    wgslResource,
} from 'clayflow';
import type { BoundFlow, Frame, StagingBufferSpec, StorageBufferSpec, WgslModule } from 'clayflow';
import { readPool, settle } from './support/extensionScenes';
import { lcg } from './support/random';

function log(msg: string): void {
    console.log(`[rayScene] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
    const l = len(a);
    return [a[0] / l, a[1] / l, a[2] / l];
};

const raysResource = wgslResource({
    name: 'smoke_rays',
    binding: { storage: 'read' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'stage',
    provider: 'private',
});
const hitsResource = wgslResource({
    name: 'smoke_hits',
    binding: { storage: 'read_write' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'stage',
    provider: 'private',
});

/** Kernel de teste: um raio por invocação (origem, direção) → (ponto, t) e (normal, instância). */
const queryKernel = wgslModule({
    name: 'smoke_ray_query',
    requires: [rayScene, raysResource, hitsResource],
    source: /* wgsl */ `
@compute @workgroup_size(64)
fn smoke_ray_query_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&smoke_rays) / 2u) { return; }
    let o = smoke_rays[i * 2u].xyz;
    let d = smoke_rays[i * 2u + 1u].xyz;
    let h = ray_scene_hit(o, d, 1e30);
    smoke_hits[i * 2u] = vec4f(h.position, h.t);
    smoke_hits[i * 2u + 1u] = vec4f(h.normal, select(-1.0, f32(h.instance), h.instance != NONE));
}`,
});

/**
 * Kernel do contrato (US6): o acerto mais próximo entre as superfícies (`ray_scene_hit`) e os volumes
 * (`ray_volume_hit`), sem saber quem os escreveu → (ponto, t) e (normal, instância; −2 num volume; −1 sem acerto).
 */
const contractKernel = wgslModule({
    name: 'smoke_ray_contract',
    requires: [rayScene, rayVolumeHitReady, raysResource, hitsResource],
    source: /* wgsl */ `
@compute @workgroup_size(64)
fn smoke_ray_query_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&smoke_rays) / 2u) { return; }
    let o = smoke_rays[i * 2u].xyz;
    let d = smoke_rays[i * 2u + 1u].xyz;
    let h = ray_scene_hit(o, d, 1e30);
    let v = ray_volume_hit(o, d, min(h.t, 1e6));
    if (v.hit) {
        smoke_hits[i * 2u] = vec4f(v.position, v.t);
        smoke_hits[i * 2u + 1u] = vec4f(v.normal, -2.0);
        return;
    }
    smoke_hits[i * 2u] = vec4f(h.position, h.t);
    smoke_hits[i * 2u + 1u] = vec4f(h.normal, select(-1.0, f32(h.instance), h.instance != NONE));
}`,
});

/** Estágio de teste: grava a consulta quando pedido (depois da estrutura de raios). */
class QueryFlow extends Flow<{ readonly scene: ReturnType<typeof slot.singleton> }, 'idle'> {
    readonly type = 'smokeRayQuery';
    readonly slots = { scene: slot.singleton(RayScene.schema) };
    override readonly pipelines: readonly {
        readonly id: string;
        readonly role: 'compute';
        readonly shader: WgslModule;
        readonly entryPoints: readonly string[];
    }[];
    override readonly bindings: ReadonlyMap<typeof raysResource, StorageBufferSpec>;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions = {
        '*': {
            slotsResolved: 'ignore',
            slotChanged: 'ignore',
            slotLost: 'ignore',
            pipelinesCompiled: 'ignore',
            bindGroupReplaced: 'ignore',
        },
    } as const;
    /** Pedidos de consulta pendentes (gravados no próximo quadro). */
    pending = 0;

    constructor(
        rays: StorageBufferSpec,
        hits: StorageBufferSpec,
        private readonly count: number,
        shader: WgslModule,
    ) {
        super();
        this.pipelines = [
            { id: 'query', role: 'compute', shader, entryPoints: ['smoke_ray_query_main'] },
        ];
        this.bindings = new Map([
            [raysResource, rays],
            [hitsResource, hits],
        ]);
    }

    dispatch(frame: Frame, bound: BoundFlow): void {
        if (this.pending === 0) return;
        const p = bound.pipelines.get('query');
        if (p?.role !== 'compute' || !p.ready) return;
        frame.compute('smokeRayQuery', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.workgroups(Math.ceil(this.count / 64));
        });
        this.pending--;
    }
}

interface Probe {
    readonly origin: V3;
    readonly dir: V3;
}

interface Hit {
    readonly position: V3;
    readonly t: number;
    readonly normal: V3;
    readonly instance: number;
}

/** Cena com a estrutura de raios e o estágio de consulta para `probes` raios. */
async function rayApp(
    capacity: number,
    profiling = false,
    kernel: WgslModule = queryKernel,
): Promise<{
    app: Application;
    canvas: HTMLCanvasElement;
    query: (probes: readonly Probe[]) => Promise<Hit[]>;
}> {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    document.body.appendChild(canvas);
    const scene = createScene();
    const app = await Application.create({
        // Antisserrilhado com que as medidas deste smoke foram calibradas (MSAA, o padrão antes da 034; o
        // temporal, padrão agora, tem o smoke `antialiasing`).
        antialias: 'msaa',
        canvas,
        scene,
        autoResize: false,
        captureErrors: true,
        ...(profiling ? { profiling: 'passes' as const, profilingCapacity: 1024 } : {}),
    });
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    app.events.on('globalIlluminationUnsupported', (e) =>
        engineErrors.push(`unsupported: ${e.reason}`),
    );
    app.world.insert(new RayScene());
    const bytes = capacity * 32;
    const storage = (name: string): StorageBufferSpec =>
        app.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `smoke_ray:${name}`,
            byteSize: bytes,
        });
    const rays = storage('rays');
    const hits = storage('hits');
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: 'smoke_ray:staging',
        byteSize: bytes,
    });
    const flow = new QueryFlow(rays, hits, capacity, kernel);
    scene.flows.register(() => flow, { type: 'smokeRayQuery', phase: 'forward', priority: 100 });
    const query = async (probes: readonly Probe[]): Promise<Hit[]> => {
        const data = new Float32Array(capacity * 8);
        // Raios além dos pedidos apontam para longe de tudo.
        for (let i = 0; i < capacity; i++) {
            const p = probes[i] ?? { origin: [0, 1e6, 0], dir: [0, 1, 0] };
            data.set([...p.origin, 0, ...p.dir, 0], i * 8);
        }
        app.core.write(rays, data);
        flow.pending = 1;
        app.step(0);
        app.core.record('smoke-ray-readback', (frame) => {
            frame.copy(hits, staging, bytes);
        });
        app.core.submit();
        const out = new Float32Array(await app.core.readback(staging));
        return probes.map((_, i) => ({
            position: [out[i * 8]!, out[i * 8 + 1]!, out[i * 8 + 2]!],
            t: out[i * 8 + 3]!,
            normal: [out[i * 8 + 4]!, out[i * 8 + 5]!, out[i * 8 + 6]!],
            instance: out[i * 8 + 7]!,
        }));
    };
    return { app, canvas, query };
}

function dispose(app: Application, canvas: HTMLCanvasElement): void {
    app.dispose();
    canvas.remove();
}

/** Interseção analítica raio–esfera. */
function sphereHit(o: V3, d: V3, c: V3, r: number): { t: number; n: V3 } | null {
    const oc = sub(o, c);
    const b = dot(oc, d);
    const disc = b * b - (dot(oc, oc) - r * r);
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t <= 0) return null;
    const p: V3 = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    return { t, n: norm(sub(p, c)) };
}

/** Interseção analítica raio–caixa orientada (giro `angle` em y, meia extensão `half`, centro `c`). */
function boxHit(o: V3, d: V3, c: V3, half: V3, angle: number): { t: number; n: V3 } | null {
    const cs = Math.cos(angle);
    const sn = Math.sin(angle);
    // Mundo → local: giro −angle em y.
    const toLocal = (v: V3): V3 => [cs * v[0] - sn * v[2], v[1], sn * v[0] + cs * v[2]];
    const toWorld = (v: V3): V3 => [cs * v[0] + sn * v[2], v[1], -sn * v[0] + cs * v[2]];
    const lo = toLocal(sub(o, c));
    const ld = toLocal(d);
    let t0 = -Infinity;
    let t1 = Infinity;
    let axis = 0;
    let sign = 1;
    for (let k = 0; k < 3; k++) {
        const a = (-half[k]! - lo[k]!) / ld[k]!;
        const b = (half[k]! - lo[k]!) / ld[k]!;
        const near = Math.min(a, b);
        if (near > t0) {
            t0 = near;
            axis = k;
            sign = a < b ? -1 : 1;
        }
        t1 = Math.min(t1, Math.max(a, b));
    }
    if (t0 > t1 || t0 <= 0) return null;
    const n: V3 = [0, 0, 0];
    n[axis] = sign;
    return { t: t0, n: toWorld(n) };
}

/** Quatérnio de um giro em y. */
const rotY = (a: number): number[] => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];

/** Função de superfície: plano horizontal à altura `h`, sobre o domínio. */
const PLANE_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return vec3f(u, data.h, v);
}`;

async function caseAnalytic(): Promise<void> {
    const { app, canvas, query } = await rayApp(1024);
    const sphereC: V3 = [0, 0, 0];
    const boxC: V3 = [5, 0.5, 0];
    const boxHalf: V3 = [0.5, 1, 0.75];
    const angle = 0.6;
    const planeX = -5;
    const planeH = 0.25;
    app.world.insert(
        new SphereGeometry({ radius: 1, latSegments: 96, lonSegments: 192 })
            .add(new StandardMaterial())
            .add(new Transform({ position: [...sphereC, 1] })),
    );
    app.world.insert(
        new BoxGeometry().add(new StandardMaterial()).add(
            new Transform({
                position: [...boxC, 1],
                rotation: rotY(angle),
                scale: [boxHalf[0] * 2, boxHalf[1] * 2, boxHalf[2] * 2, 1],
            }),
        ),
    );
    app.world.insert(
        new ParametricSurface({ resolution: [32, 32], domain: [-1.5, 1.5, -1.5, 1.5] })
            .add(
                new SurfaceFunction({
                    code: PLANE_CODE,
                    params: { h: 'f32' },
                    values: { h: planeH },
                }),
            )
            .add(new StandardMaterial())
            .add(new Transform({ position: [planeX, 0, 0, 1] })),
    );
    await settle(app, 600);
    const r = lcg(7);
    const probes: Probe[] = [];
    const expected: ({ t: number; n: V3; size: number } | null)[] = [];
    for (let i = 0; i < 900; i++) {
        const kind = i % 3;
        const target: V3 =
            kind === 0
                ? [
                      sphereC[0] + r() * 1.6 - 0.8,
                      sphereC[1] + r() * 1.6 - 0.8,
                      sphereC[2] + r() * 1.6 - 0.8,
                  ]
                : kind === 1
                  ? [boxC[0] + r() * 1.2 - 0.6, boxC[1] + r() * 2 - 1, boxC[2] + r() * 1.2 - 0.6]
                  : [planeX + r() * 2.4 - 1.2, planeH, r() * 2.4 - 1.2];
        const origin: V3 =
            kind === 2
                ? [target[0] + r() - 0.5, 4, target[2] + r() - 0.5]
                : [target[0] + (r() - 0.5) * 6, target[1] + 3 + r() * 2, target[2] + 6];
        const dir = norm(sub(target, origin));
        probes.push({ origin, dir });
        // Esperado: o acerto analítico mais próximo entre os três.
        const cands = [
            { h: sphereHit(origin, dir, sphereC, 1), size: 2 },
            { h: boxHit(origin, dir, boxC, boxHalf, angle), size: 2 },
            {
                h: ((): { t: number; n: V3 } | null => {
                    if (Math.abs(dir[1]) < 1e-6) return null;
                    const t = (planeH - origin[1]) / dir[1];
                    const p: V3 = [origin[0] + dir[0] * t, planeH, origin[2] + dir[2] * t];
                    const inside = Math.abs(p[0] - planeX) <= 1.5 && Math.abs(p[2]) <= 1.5;
                    return t > 0 && inside ? { t, n: [0, Math.sign(-dir[1]) || 1, 0] } : null;
                })(),
                size: 3,
            },
        ]
            .filter((c) => c.h !== null)
            .sort((a, b) => a.h!.t - b.h!.t);
        expected.push(cands[0] === undefined ? null : { ...cands[0].h!, size: cands[0].size });
    }
    // Raios que passam longe de tudo.
    for (let i = 0; i < 60; i++)
        probes.push({ origin: [r() * 20 - 10, 20, r() * 20 - 10], dir: [0, 1, 0] });
    const hits = await query(probes);
    let maxPos = 0;
    let maxNormal = 0;
    let wrong = 0;
    let missed = 0;
    expected.forEach((e, i) => {
        const h = hits[i]!;
        if (e === null) {
            if (h.instance >= 0) wrong++;
            return;
        }
        if (h.instance < 0) {
            missed++;
            return;
        }
        const p = probes[i]!;
        const ep: V3 = [
            p.origin[0] + p.dir[0] * e.t,
            p.origin[1] + p.dir[1] * e.t,
            p.origin[2] + p.dir[2] * e.t,
        ];
        maxPos = Math.max(maxPos, len(sub(h.position, ep)) / e.size);
        // A normal da superfície paramétrica sai da orientação dos triângulos: compara pela direção, sem sinal.
        const c = Math.abs(dot(norm(h.normal), e.n));
        maxNormal = Math.max(maxNormal, Math.acos(Math.min(1, c)));
    });
    const far = hits.slice(expected.length).filter((h) => h.instance >= 0).length;
    log(
        `analytic: ${expected.length} raios — erro de posição máx ${(maxPos * 100).toFixed(3)} % do tamanho, normal máx ${(
            (maxNormal * 180)
            / Math.PI
        ).toFixed(
            3,
        )}°, ${missed} perdidos, ${wrong} acertos falsos; ${far} acertos nos raios distantes`,
    );
    check(maxPos <= 0.01, `analytic: erro de posição ${(maxPos * 100).toFixed(3)} % > 1 %`);
    check(
        (maxNormal * 180) / Math.PI <= 3,
        `analytic: normal ${((maxNormal * 180) / Math.PI).toFixed(2)}° > 3°`,
    );
    check(missed <= 2, `analytic: ${missed} raios sem acerto onde há objeto`);
    check(wrong <= 2, `analytic: ${wrong} acertos onde não há objeto`);
    check(far === 0, `analytic: ${far} acertos em raios que passam longe`);
    dispose(app, canvas);
}

async function caseRefit(): Promise<void> {
    const { app, canvas, query } = await rayApp(256);
    const fn = new SurfaceFunction({ code: PLANE_CODE, params: { h: 'f32' }, values: { h: 0 } });
    app.world.insert(
        new ParametricSurface({ resolution: [16, 16], domain: [-1, 1, -1, 1] })
            .add(fn)
            .add(new StandardMaterial())
            .add(new Transform()),
    );
    await settle(app, 500);
    const probes: Probe[] = Array.from({ length: 64 }, (_, i) => ({
        origin: [((i % 8) - 3.5) * 0.2, 5, (Math.floor(i / 8) - 3.5) * 0.2],
        dir: [0, -1, 0],
    }));
    const heights: number[] = [];
    for (const h of [0, 0.7, -0.4]) {
        fn.values.h = h;
        await settle(app, 300);
        const hits = await query(probes);
        const ys = hits.map((x) => x.position[1]);
        const err = Math.max(...ys.map((y) => Math.abs(y - h)));
        heights.push(err);
        check(
            hits.every((x) => x.instance === 0),
            `refit: h=${h}: raio sem acerto`,
        );
        check(err <= 1e-3, `refit: h=${h}: altura da consulta erra ${err.toFixed(5)}`);
    }
    log(`refit: erro de altura por passo ${heights.map((e) => e.toExponential(1)).join(', ')}`);
    dispose(app, canvas);
}

async function caseMoving(): Promise<void> {
    const { app, canvas, query } = await rayApp(64);
    const t = new Transform({ position: [0, 0, 0, 1] });
    app.world.insert(new BoxGeometry().add(new StandardMaterial()).add(t));
    await settle(app, 300);
    const results: number[] = [];
    for (const x of [0, 3, -2]) {
        t.data.position = [x, 0, 0, 1];
        app.step(0);
        const [h] = await query([{ origin: [x, 5, 0], dir: [0, -1, 0] }]);
        results.push(h!.position[1]);
        check(
            h!.instance === 0 && Math.abs(h!.position[1] - 0.5) < 1e-4,
            `moving: x=${x}: acerto ${h!.position.join(',')}`,
        );
    }
    log(`moving: topo da caixa em ${results.map((y) => y.toFixed(4)).join(', ')} (esperado 0,5)`);
    dispose(app, canvas);
}

/** Tempos de GPU (ms) por rótulo de passe dos quadros seguintes, até `frames` leituras. */
async function stageTimes(app: Application, frames: number): Promise<Record<string, number>[]> {
    const out: Record<string, number>[] = [];
    const off = app.events.on('frameComplete', (e) => {
        const stages = e.stats.stagesNs;
        if (stages === undefined) return;
        const ms: Record<string, number> = {};
        for (const [k, v] of Object.entries(stages)) ms[k] = v / 1e6;
        out.push(ms);
    });
    for (let i = 0; i < frames + 6; i++) {
        app.step(1 / 60);
        await new Promise((r) => setTimeout(r, 0));
    }
    off();
    return out;
}

/** Soma dos rótulos que passam no filtro. */
const sumOf = (ms: Record<string, number>, keep: (label: string) => boolean): number =>
    Object.entries(ms)
        .filter(([k]) => keep(k))
        .reduce((a, [, v]) => a + v, 0);

const median = (xs: readonly number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? NaN;
};

const BLAS_REFIT = ['RaySceneFlow.blas'];
/** Mediana por rótulo (os da estrutura de raios e da ordenação). */
function breakdown(frames: readonly Record<string, number>[]): string {
    const labels = new Set(
        frames
            .flatMap((ms) => Object.keys(ms))
            .filter(
                (k) =>
                    k.startsWith('RaySceneFlow')
                    || k.startsWith('RadixSort')
                    || k.startsWith('PrefixSum')
                    || k.startsWith('dbg'),
            ),
    );
    return [...labels]
        .map(
            (k) =>
                `${k.replace('RaySceneFlow.', '')} ${median(frames.map((ms) => ms[k] ?? 0)).toFixed(3)}`,
        )
        .join(', ');
}

const isTlas = (k: string): boolean => k === 'RaySceneFlow.tlas';

async function caseScale(): Promise<void> {
    const { app, canvas, query } = await rayApp(256, true);
    // 708 × 708 vértices ≈ 1 milhão de triângulos numa superfície paramétrica animada (escrita na GPU a cada quadro).
    const n = 708;
    app.world.insert(
        new ParametricSurface({ resolution: [n, n], domain: [-4, 4, -4, 4], animated: true })
            .add(
                new SurfaceFunction({ code: PLANE_CODE, params: { h: 'f32' }, values: { h: 0.1 } }),
            )
            .add(new StandardMaterial())
            .add(new Transform()),
    );
    const first = await stageTimes(app, 12);
    await settle(app, 600);
    const probes: Probe[] = Array.from({ length: 200 }, (_, i) => ({
        origin: [Math.sin(i) * 3.5, 6, Math.cos(i * 1.7) * 3.5],
        dir: [0, -1, 0],
    }));
    const hits = await query(probes);
    const ok = hits.filter((h) => h.instance === 0 && Math.abs(h.position[1] - 0.1) < 1e-3).length;
    const steady = await stageTimes(app, 60);
    const refit = median(steady.map((ms) => sumOf(ms, (k) => BLAS_REFIT.includes(k))));
    log(`scale: por passe (ms) — ${breakdown(steady)}`);
    // A construção é o maior quadro das hierarquias de baixo logo depois de a superfície entrar.
    const buildMs = Math.max(...first.map((ms) => ms['RaySceneFlow.blas'] ?? 0));
    log(
        `scale: ${2 * (n - 1) * (n - 1)} triângulos, ${ok}/${probes.length} acertos; construção ${buildMs.toFixed(3)} ms, reajuste por quadro ${refit.toFixed(3)} ms (mediana)`,
    );
    check(ok === probes.length, `scale: só ${ok}/${probes.length} acertos certos`);
    if (Number.isFinite(refit))
        check(
            refit <= 1,
            `scale: reajuste de 1 milhão de triângulos ${refit.toFixed(3)} ms > 1 ms`,
        );
    else log('scale: sem consulta de tempo da GPU neste dispositivo — custo não medido');
    dispose(app, canvas);
}

async function caseTlas(): Promise<void> {
    const { app, canvas, query } = await rayApp(64, true);
    // 10 mil instâncias que se movem (a hierarquia de cima é refeita a cada quadro).
    const transforms: Transform[] = [];
    for (let i = 0; i < 10000; i++) {
        const t = new Transform({
            position: [(i % 100) * 2, 0, Math.floor(i / 100) * 2, 1],
            scale: [0.5, 0.5, 0.5, 1],
        });
        transforms.push(t);
        app.world.insert(new BoxGeometry().add(new StandardMaterial()).add(t));
    }
    await settle(app, 1500);
    transforms[4321]!.data.position = [86, 3, 86, 1];
    app.step(0);
    const [h] = await query([{ origin: [86, 10, 86], dir: [0, -1, 0] }]);
    check(
        h!.instance >= 0 && Math.abs(h!.position[1] - 3.25) < 1e-3,
        `tlas: caixa movida não encontrada (${h!.position.join(',')})`,
    );
    const steady = await stageTimes(app, 60);
    const per = steady.map((ms) => sumOf(ms, isTlas));
    const tlas = per.reduce((a, b) => a + b, 0) / Math.max(1, per.length);
    log(
        `tlas: 10 mil instâncias, hierarquia de cima ${tlas.toFixed(3)} ms por quadro (média; mediana ${median(per).toFixed(3)}, máx ${Math.max(...per).toFixed(3)} no quadro de topologia nova); acerto na caixa movida em y=${h!.position[1].toFixed(4)}`,
    );
    if (Number.isFinite(tlas)) check(tlas <= 0.3, `tlas: ${tlas.toFixed(3)} ms > 0,3 ms`);
    dispose(app, canvas);
}

/** Lê a hierarquia de baixo da primeira geometria e confere a estrutura na CPU (filhos, folhas, caixas). */
async function caseStructure(): Promise<void> {
    const { app, canvas } = await rayApp(64);
    app.world.insert(
        new SphereGeometry({ radius: 1, latSegments: 96, lonSegments: 192 })
            .add(new StandardMaterial())
            .add(new Transform()),
    );
    await settle(app, 500);
    const scene = app.world
        .queryBySchemaName(RayScene.schema.name)
        .flatMap((id) => app.world.resourcesOf(id))
        .find((r) => r instanceof RayScene)!;
    const info = scene.data;
    const bvhBytes = await readPool(app, 'RayBvh');
    const f = new Float32Array(bvhBytes.buffer, bvhBytes.byteOffset, bvhBytes.byteLength / 4);
    const u = new Uint32Array(bvhBytes.buffer, bvhBytes.byteOffset, bvhBytes.byteLength / 4);
    const b = u;
    // Palavras de 4 u32: a hierarquia de baixo começa na palavra `blasFirst`.
    const blasAt = info.blasFirst * 4;
    const nodeBase = b[blasAt]!;
    const prims = b[blasAt + 2]!;
    const leafSize = b[blasAt + 6]!;
    const count = Math.ceil(prims / leafSize);
    const node = (local: number): { lo: V3; hi: V3; left: number; right: number } => {
        const k = (info.nodeFirst + (nodeBase + local) * 2) * 4;
        return {
            lo: [f[k]!, f[k + 1]!, f[k + 2]!],
            hi: [f[k + 4]!, f[k + 5]!, f[k + 6]!],
            left: u[k + 3]!,
            right: u[k + 7]!,
        };
    };
    const seen = new Set<number>();
    let bad = 0;
    let depthMax = 0;
    const stack: [number, number][] = [[0, 0]];
    while (stack.length > 0 && stack.length < 1e6) {
        const [i, depth] = stack.pop()!;
        depthMax = Math.max(depthMax, depth);
        const n = node(i);
        if ((n.left & 0x80000000) !== 0) {
            if (seen.has(n.right) || n.right % leafSize !== 0) bad++;
            seen.add(n.right);
            continue;
        }
        for (const c of [n.left, n.right]) {
            if (c >= 2 * count - 1) {
                bad++;
                continue;
            }
            const cn = node(c);
            for (let k = 0; k < 3; k++)
                if (cn.lo[k]! < n.lo[k]! - 1e-5 || cn.hi[k]! > n.hi[k]! + 1e-5) bad++;
            stack.push([c, depth + 1]);
        }
    }
    const root = node(0);
    log(
        `structure: ${prims} primitivas em ${count} folhas de ${leafSize}, ${seen.size} folhas alcançadas, profundidade ${depthMax}, ${bad} defeitos; raiz [${root.lo.map((x) => x.toFixed(3)).join(',')}]–[${root.hi.map((x) => x.toFixed(3)).join(',')}]`,
    );
    check(
        seen.size === count && bad === 0,
        `structure: ${seen.size}/${count} folhas, ${bad} defeitos`,
    );
    dispose(app, canvas);
}

/** Interseção analítica raio–plano horizontal `y = h` dentro do quadrado de centro (cx, cz) e meia largura `half`. */
function planeHit(o: V3, d: V3, h: number, cx: number, cz: number, half: number): number | null {
    if (Math.abs(d[1]) < 1e-6) return null;
    const t = (h - o[1]) / d[1];
    const x = o[0] + d[0] * t;
    const z = o[2] + d[2] * t;
    return t > 0 && Math.abs(x - cx) <= half && Math.abs(z - cz) <= half ? t : null;
}

/** Bola de partículas em grade (espaçamento `s`) de raio `r` em volta de `c`. */
function particleBall(c: V3, r: number, s: number): number[] {
    const out: number[] = [];
    const n = Math.ceil(r / s);
    for (let z = -n; z <= n; z++)
        for (let y = -n; y <= n; y++)
            for (let x = -n; x <= n; x++) {
                if ((x * x + y * y + z * z) * s * s > r * r) continue;
                out.push(c[0] + x * s, c[1] + y * s, c[2] + z * s);
            }
    return out;
}

async function caseContract(): Promise<void> {
    const { app, canvas, query } = await rayApp(1024, false, contractKernel);
    // Malha: esfera de raio 1 na origem.
    app.world.insert(
        new SphereGeometry({ radius: 1, latSegments: 96, lonSegments: 192 })
            .add(new StandardMaterial())
            .add(new Transform()),
    );
    // Superfície paramétrica (escrita na GPU): plano y = 0,25 sobre [−1,5; 1,5]² em x = −5.
    app.world.insert(
        new ParametricSurface({ resolution: [32, 32], domain: [-1.5, 1.5, -1.5, 1.5] })
            .add(
                new SurfaceFunction({
                    code: PLANE_CODE,
                    params: { h: 'f32' },
                    values: { h: 0.25 },
                }),
            )
            .add(new StandardMaterial())
            .add(new Transform({ position: [-5, 0, 0, 1] })),
    );
    // Geometria de grafo de nós (só GPU, contagem indireta): grade 2 × 2 em y = 0,4, x = 5.
    const graph = new NodeGraph({
        nodes: {
            g: nodes.set.grid.with({ resolution: [9, 9], size: [2, 2] }),
            o: nodes.set.meshOutput,
        },
        links: [['g.mesh', 'o.mesh']],
    });
    const setGraph = new SetGraph({ graph });
    const plan = compileSetGraph(graph, (n) => setGraph.valuesOf(n));
    const cap = (key: string): number => plan.sets.find((x) => x.key === key)!.capacity;
    app.world.insert(
        setGraph
            .add(
                new GraphGeometry({
                    vertexCapacity: cap('g.mesh.vertices'),
                    indexCapacity: cap('g.mesh.triangles') * 3,
                }),
            )
            .add(new StandardMaterial())
            .add(new Transform({ position: [5, 0.4, 0, 1] })),
    );
    // Corpo de sprites: esferas de raio 0,15 (paradas: quadros de duração 0).
    const sprite = 0.15;
    const spriteAt: V3[] = [
        [0, 0, -5],
        [0.5, 0.2, -5],
        [-0.5, -0.1, -5.3],
    ];
    app.world.insert(
        new FluidBody({ algorithm: 'SPH', position: spriteAt.flat() }).add(
            new PointSpriteMaterial({ radius: sprite, color: [0.9, 0.4, 0.2, 1] }),
        ),
    );
    // Água por campo de distância: bola de partículas de raio 0,3 em z = 5.
    const spacing = 0.05;
    const waterC: V3 = [0, 0, 5];
    const waterR = 0.3;
    app.world.insert(new ParticlePhysics({ particleSpacing: spacing }));
    app.world.insert(
        new FluidBody({ algorithm: 'SPH', position: particleBall(waterC, waterR, spacing) }).add(
            new FluidSurfaceMaterial(),
        ),
    );
    // Corpo mole (XPBD, a superfície escrita na GPU a cada quadro): pano 16 × 16 plano em y = 1,3 em volta de
    // (0; 9) — com quadros de duração 0 a física não anda e ele fica plano.
    const clothSide = 16;
    const clothSpacing = 0.05;
    const clothY = 1.3;
    const clothZ = 9;
    {
        const position: number[] = [];
        const mass: number[] = [];
        const uvs: number[] = [];
        const at = (i: number, j: number): number => j * clothSide + i;
        const half = (clothSide - 1) / 2;
        for (let j = 0; j < clothSide; j++)
            for (let i = 0; i < clothSide; i++) {
                position.push(
                    (i - half) * clothSpacing,
                    clothY,
                    clothZ + (j - half) * clothSpacing,
                );
                mass.push(0.01);
                uvs.push(i / (clothSide - 1), j / (clothSide - 1));
            }
        const a: number[] = [];
        const b: number[] = [];
        const triangles: number[] = [];
        for (let j = 0; j + 1 < clothSide; j++)
            for (let i = 0; i + 1 < clothSide; i++) {
                a.push(at(i, j), at(i, j), at(i, j));
                b.push(at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
                triangles.push(
                    at(i, j),
                    at(i, j + 1),
                    at(i + 1, j),
                    at(i + 1, j),
                    at(i, j + 1),
                    at(i + 1, j + 1),
                );
            }
        app.world.insert(
            new SoftBody({
                algorithm: 'XPBD',
                position,
                mass,
                edges: { a, b },
                surface: { triangles, uvs },
            })
                .add(new StandardMaterial())
                .add(new Transform()),
        );
    }
    await settle(app, 1200);

    type Kind = 'mesh' | 'surface' | 'graph' | 'cloth' | 'sprites' | 'water';
    const r = lcg(11);
    const probes: Probe[] = [];
    const expected: { kind: Kind; t: number; n: V3 | null; size: number }[] = [];
    const add = (kind: Kind, origin: V3, target: V3): void => {
        const dir = norm(sub(target, origin));
        let t: number | null = null;
        let n: V3 | null = null;
        let size = 2;
        if (kind === 'mesh') {
            const h = sphereHit(origin, dir, [0, 0, 0], 1);
            if (h !== null) ({ t, n } = h);
        } else if (kind === 'surface') {
            t = planeHit(origin, dir, 0.25, -5, 0, 1.5);
            n = [0, 1, 0];
            size = 3;
        } else if (kind === 'graph') {
            t = planeHit(origin, dir, 0.4, 5, 0, 1);
            n = [0, 1, 0];
        } else if (kind === 'cloth') {
            const half = ((clothSide - 1) / 2) * clothSpacing;
            t = planeHit(origin, dir, clothY, 0, clothZ, half);
            n = [0, 1, 0];
            size = 2 * half;
        } else if (kind === 'sprites') {
            size = 2 * sprite;
            for (const c of spriteAt) {
                const h = sphereHit(origin, dir, c, sprite);
                if (h !== null && (t === null || h.t < t)) ({ t, n } = h);
            }
        } else {
            // Só para escolher os raios que chegam à água: a superfície do campo é conferida pelo raio dos acertos.
            const h = sphereHit(origin, dir, waterC, waterR);
            size = 2 * waterR;
            if (h !== null) t = h.t;
        }
        if (t === null) return;
        probes.push({ origin, dir });
        expected.push({ kind, t, n, size });
    };
    for (let i = 0; i < 120; i++) {
        const j = (): number => r() * 2 - 1;
        add('mesh', [j() * 3, 4, 6], [j() * 0.7, j() * 0.7, j() * 0.7]);
        add('surface', [-5 + j(), 4, j()], [-5 + j() * 1.3, 0.25, j() * 1.3]);
        add('graph', [5 + j(), 4, j()], [5 + j() * 0.9, 0.4, j() * 0.9]);
        add('cloth', [j(), 4, clothZ + j()], [j() * 0.3, clothY, clothZ + j() * 0.3]);
        const c = spriteAt[i % 3]!;
        add(
            'sprites',
            [c[0] + j(), c[1] + 3, c[2] + 3],
            [c[0] + j() * 0.08, c[1] + j() * 0.08, c[2] + j() * 0.08],
        );
        add(
            'water',
            [j() * 2, 3, 5 + 3],
            [waterC[0] + j() * 0.15, waterC[1] + j() * 0.15, waterC[2] + j() * 0.15],
        );
    }
    const hits = await query(probes);
    // Água: a distância radial dos acertos ao centro (a superfície do campo é uma esfera de raio quase constante).
    const radial = expected
        .map((e, i) =>
            e.kind === 'water' && hits[i]!.instance === -2
                ? len(sub(hits[i]!.position, waterC))
                : NaN,
        )
        .filter((x) => Number.isFinite(x));
    log(
        `contract: água — raio dos acertos ${Math.min(...radial).toFixed(4)}..${Math.max(...radial).toFixed(4)}`,
    );
    const stats = new Map<Kind, { n: number; pos: number; normal: number; wrong: number }>();
    expected.forEach((e, i) => {
        const h = hits[i]!;
        const st = stats.get(e.kind) ?? { n: 0, pos: 0, normal: 0, wrong: 0 };
        stats.set(e.kind, st);
        st.n++;
        const volume = h.instance === -2;
        if (volume !== (e.kind === 'water') || h.instance === -1) {
            st.wrong++;
            return;
        }
        st.pos = Math.max(st.pos, Math.abs(h.t - e.t) / e.size);
        if (e.n !== null) {
            const c = Math.abs(dot(norm(h.normal), e.n));
            st.normal = Math.max(st.normal, (Math.acos(Math.min(1, c)) * 180) / Math.PI);
        }
    });
    for (const [kind, st] of stats) {
        log(
            `contract: ${kind} — ${st.n} raios, erro máx ${(st.pos * 100).toFixed(3)} % do tamanho, normal máx ${st.normal.toFixed(2)}°, ${st.wrong} acertos no tipo errado ou ausentes`,
        );
        check(st.wrong === 0, `contract: ${kind}: ${st.wrong} raios sem acerto ou no tipo errado`);
        if (kind === 'water') {
            const err = Math.max(...radial.map((x) => Math.abs(x - waterR)));
            check(
                radial.length === st.n && err <= spacing,
                `contract: água: acertos a ${err.toFixed(4)} da esfera das partículas > 1 espaçamento`,
            );
        } else {
            check(st.pos <= 0.01, `contract: ${kind}: erro ${(st.pos * 100).toFixed(3)} % > 1 %`);
            check(st.normal <= 3, `contract: ${kind}: normal ${st.normal.toFixed(2)}° > 3°`);
        }
    }
    dispose(app, canvas);
}

const CASES: Record<string, () => Promise<void>> = {
    structure: caseStructure,
    analytic: caseAnalytic,
    refit: caseRefit,
    moving: caseMoving,
    scale: caseScale,
    tlas: caseTlas,
    contract: caseContract,
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && only !== name) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('RAYSCENE SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
