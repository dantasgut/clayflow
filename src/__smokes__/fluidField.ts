// Spec 033 — Smoke do campo dos fluidos (US7, R11; SC-013).
//
// A superfície dos corpos de partículas com `FluidSurfaceMaterial` é um campo de distância com sinal construído na GPU
// a cada quadro e desenhado por marcha. Casos (limiares documentados aqui e nas notas do US7 em `tasks.md`; `p` é o
// espaçamento das partículas em pixels na distância medida):
//   - gpu: o campo da GPU (blocos esparsos, voxels com a borda) igual ao da referência de CPU (`fields/reference/field`)
//     nas mesmas partículas paradas: φ nos voxels da faixa (|φ| < 2 voxels) com erro ≤ ¼ voxel no percentil 95 e
//     ≤ 1 voxel no máximo; nenhum NaN; blocos dentro da capacidade;
//   - drops: gotas separadas por 2 e 4 espaçamentos não se fundem (φ > 0 em todo o vão);
//   - rays: os raios atingem a mesma superfície — a profundidade da câmera e o ponto `ray_volume_hit` (composto pela C2
//     num estágio de consulta) contra a marcha da referência: erro ≤ ½ espaçamento em 99 % dos raios;
//   - close: o tanque com água parada de perto (p ≥ 20 px): a silhueta da borda contra a parede tem ondulação RMS na
//     escala das partículas (períodos de ½p a 2p) ≤ 0,008 p (sem semicírculos; a versão da 017 dá 0,018 p); com a resolução dobrada, igual (em p);
//   - normal: a água parada vista de cima de perto: a normal da superfície tem amplitude RMS na escala das partículas
//     ≤ 0,01 (sem favo de mel); a luminância da imagem, ≤ 0,004;
//   - edge: o realce da borda da frente é contínuo (≤ 5 % dos pixels de brilho isolados);
//   - volume: a barragem em movimento: o volume do campo a ±5 % do das partículas (N · espaçamento³) em 4 quadros;
//   - caustics: a placa de água parada sobre o fundo: a borda da sombra e das cáusticas no fundo sem ondulação na
//     escala das partículas (RMS ≤ 0,05 p) e o padrão sem blocos (≤ 2 % de degraus entre vizinhos acima de 0,06);
//   - contact: a água encosta na caixa: o anel de ½ a 1½ espaçamento em volta da caixa tem água em ≥ 95 % dos pixels;
//   - timing: 64 000 partículas em 1280 × 720 — o campo (junção, grade, marcação, densidade, distância) ≤ 1,5 ms e a
//     marcha ≤ 1 ms: medidos juntos pela diferença do tempo de GPU por quadro (perfil por quadro: o por passo não é
//     confiável no Apple) entre a mesma barragem com a água e com sprites, ≤ 2,5 ms.
//
// Para rodar: `npm run smoke -- fluidField [--query case=close]`. Resultado: `FLUIDFIELD SMOKE PASSED` ou `FAIL: …`.
import {
    Application,
    Camera,
    createScene,
    DirectionalLight,
    Flow,
    FluidBody,
    FluidField,
    fieldDataLayout,
    FluidSurfaceMaterial,
    ParticleMaterial,
    PlaneGeometry,
    rayVolumeHitReady,
    slot,
    StandardMaterial,
    Transform,
    WaterSurface,
    wgslModule,
    wgslResource,
} from 'clayflow';
import type {
    BoundFlow,
    FluidSurfaceMaterialOptions,
    Frame,
    StagingBufferSpec,
    StorageBufferSpec,
    TextureSpec,
} from 'clayflow';
import {
    buildField,
    FIELD,
    marchField,
    type FieldGrid,
    type Vec3,
} from '../elements/fields/reference/field';
import { nextGpuFrame } from './support/extensionScenes';
import { readHdrTexture } from './support/imageMeasures';
import {
    bandAmplitude,
    isolatedHighlights,
    neighborSteps,
    silhouetteRows,
    type Rect,
} from './support/spectralMeasures';
import { WATER_SPACING, waterScene, type WaterSceneOptions } from './support/waterScene';
import { lumaSrgb8 } from './support/images';
import { lcg } from './support/random';

/** Espaçamento das cenas paradas (sem a simulação). */
const SPACING = 0.05;

function log(msg: string): void {
    console.log(`[fluidField] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
const engineErrors: string[] = [];

function check(ok: boolean, msg: string): void {
    log(`${ok ? 'ok' : 'FALHA'}: ${msg}`);
    if (!ok) failures.push(msg);
}

/**
 * Partículas numa bola de raio `r` em volta de `c` (rede cúbica do espaçamento, perturbada de ±10%: sem vizinhos
 * exatamente no raio do núcleo, onde a contagem dependeria do arredondamento).
 */
function ball(c: Vec3, r: number, seed = 7): number[] {
    const jitter = lcg(seed);
    const out: number[] = [];
    const n = Math.ceil(r / SPACING);
    for (let z = -n; z <= n; z++)
        for (let y = -n; y <= n; y++)
            for (let x = -n; x <= n; x++) {
                const p = [x * SPACING, y * SPACING, z * SPACING];
                if (p[0]! ** 2 + p[1]! ** 2 + p[2]! ** 2 > r * r) continue;
                for (let k = 0; k < 3; k++)
                    out.push(c[k]! + p[k]! + (jitter() - 0.5) * 0.2 * SPACING);
            }
    return out;
}

/** Placa de partículas (nx × ny × nz) a partir do canto `lo`, no espaçamento `s`, perturbada de ±5 %. */
function slab(lo: Vec3, n: readonly [number, number, number], s: number, seed = 11): number[] {
    const jitter = lcg(seed);
    const out: number[] = [];
    for (let z = 0; z < n[2]; z++)
        for (let y = 0; y < n[1]; y++)
            for (let x = 0; x < n[0]; x++)
                out.push(
                    lo[0] + (x + 0.5) * s + (jitter() - 0.5) * 0.1 * s,
                    lo[1] + (y + 0.5) * s + (jitter() - 0.5) * 0.1 * s,
                    lo[2] + (z + 0.5) * s + (jitter() - 0.5) * 0.1 * s,
                );
    return out;
}

interface Session {
    readonly app: Application;
    readonly canvas: HTMLCanvasElement;
    readonly width: number;
    readonly height: number;
    capture(): ImageData;
    dispose(): void;
}

async function session(width: number, height: number, profiling?: 'passes'): Promise<Session> {
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
        ...(profiling !== undefined ? { profiling, profilingCapacity: 2048 } : {}),
    });
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    const ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })!;
    return {
        app,
        canvas,
        width,
        height,
        capture: () => {
            // Logo depois de um quadro: o canvas só guarda a imagem até ela ser apresentada.
            app.step(0);
            ctx.drawImage(canvas, 0, 0);
            return ctx.getImageData(0, 0, width, height);
        },
        dispose: () => {
            app.dispose();
            canvas.remove();
        },
    };
}

/** Câmera, luz e material de partícula das cenas paradas. */
function staticStage(
    app: Application,
    width: number,
    height: number,
    eye: Vec3,
    target: Vec3,
): void {
    app.world.insert(
        new Camera({
            fov: Math.PI / 4,
            aspect: width / height,
            aspectMode: 'fixed',
            near: 0.05,
            far: 20,
        }).add(
            new Transform({ position: [...eye, 1], rotation: Transform.lookRotation(eye, target) }),
        ),
    );
    app.world.insert(
        new DirectionalLight({
            direction: [-0.3, -1, -0.4, 0],
            color: [1, 1, 1, 1],
            intensity: 1.2,
            castShadow: true,
        }),
    );
}

/** Corpo de fluido parado (quadros de duração 0: a simulação não avança). */
function staticBody(
    app: Application,
    positions: readonly number[],
    spacing: number,
    material: FluidSurfaceMaterialOptions = {},
): void {
    app.world.insert(new ParticleMaterial({ particleSpacing: spacing }));
    const body = new FluidBody({ algorithm: 'SPH', position: [...positions] });
    body.add(new FluidSurfaceMaterial(material));
    app.world.insert(body);
}

/** Espera o motor pronto (spec 034) com quadros de duração 0, e ao menos `ms` de tempo real. */
async function settle(app: Application, ms = 0): Promise<void> {
    const end = performance.now() + ms;
    await app.whenReady({ timeoutMs: 60_000 });
    while (performance.now() < end) {
        app.step(0);
        await new Promise((r) => setTimeout(r, 16));
    }
    // Um quadro na mesma tarefa de quem chamou: o canvas WebGPU só vale até a tarefa ceder (captura logo depois).
    app.step(0);
}

/** Avança `frames` quadros da simulação (tempo fixo). */
async function simulate(app: Application, frames: number): Promise<void> {
    for (let i = 0; i < frames; i++) {
        app.step(1 / 60);
        if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
    }
}

function fieldOf(app: Application): FluidField {
    const field = app.world.findResource(FluidField.schema, FluidField);
    if (field === undefined) throw new Error('sem FluidField na cena');
    return field;
}

function waterOf(app: Application): WaterSurface {
    const water = app.world.findResource(WaterSurface.schema, WaterSurface);
    if (water === undefined) throw new Error('sem WaterSurface na cena');
    return water;
}

async function readSpec(
    app: Application,
    spec: { readonly byteSize: number },
    tag: string,
): Promise<ArrayBuffer> {
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `fluid_field_${tag}_${spec.byteSize}`,
        byteSize: spec.byteSize,
    });
    app.core.record('fluid-field-readback', (frame) => {
        frame.copy(spec as Parameters<typeof frame.copy>[0], staging, spec.byteSize);
    });
    app.core.submit();
    const out = await app.core.readback(staging);
    app.core.destroy(staging);
    return out;
}

async function read(app: Application, descId: string): Promise<ArrayBuffer> {
    const spec = app.resources.bufferOf(fieldOf(app), descId);
    if (spec === undefined) throw new Error(`FluidField.${descId} sem buffer`);
    return readSpec(app, spec, descId);
}

/** Lê uma textura de 32 bits por texel (`r32float`/`r32uint`) de volta. */
async function readR32(
    app: Application,
    texture: TextureSpec,
): Promise<{ data: ArrayBuffer; stride: number }> {
    const { width, height } = texture;
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `fluid_field_r32_${width}x${height}`,
        byteSize: bytesPerRow * height,
    });
    app.core.record('fluid-field-texture', (frame) => {
        frame.copyTextureToBuffer(texture, staging, { bytesPerRow, rowsPerImage: height }, [
            width,
            height,
        ]);
    });
    app.core.submit();
    const data = await app.core.readback(staging);
    app.core.destroy(staging);
    return { data, stride: bytesPerRow / 4 };
}

/** O campo da GPU lido de volta: blocos e voxels, com φ trilinear num ponto de mundo. */
interface GpuField {
    readonly used: number;
    readonly capacity: number;
    readonly voxel: number;
    /** Nível da superfície do quadro (ajustado na GPU para conservar o volume). */
    readonly iso: number;
    readonly bricks: Int32Array;
    readonly voxels: Float32Array;
    phi(p: Vec3): number;
}

async function gpuField(app: Application, spacing: number): Promise<GpuField> {
    const field = fieldOf(app);
    const counts = new Uint32Array(await read(app, 'counts'));
    const data = await read(app, 'data');
    const layout = fieldDataLayout(field.capacity);
    const bricks = new Int32Array(data, layout.bricks * 4, field.capacity.bricks * 4);
    const voxels = new Float32Array(data, layout.voxels * 4);
    const iso = new Float32Array(data, 7 * 4, 1)[0]!;
    const used = Math.min(counts[0]!, field.capacity.bricks);
    const voxel = FIELD.voxel * spacing;
    const B = FIELD.brick;
    const S = B + 4;
    const index = new Map<string, number>();
    for (let k = 0; k < used; k++)
        index.set(`${bricks[4 * k]},${bricks[4 * k + 1]},${bricks[4 * k + 2]}`, k);
    const phi = (p: Vec3): number => {
        const b = p.map((v) => Math.floor(v / (voxel * B)));
        const k = index.get(b.join(','));
        if (k === undefined) return 3 * FIELD.band * voxel;
        const g = p.map((v, a) => v / voxel - 0.5 - b[a]! * B);
        const base = g.map((v) => Math.floor(v));
        const f = g.map((v, a) => v - base[a]!);
        let out = 0;
        for (let c = 0; c < 8; c++) {
            const o = [c & 1, (c >> 1) & 1, c >> 2];
            const v = o.map((d, a) => Math.min(B + 1, Math.max(-2, base[a]! + d)) + 2);
            const w = o.reduce((acc, d, a) => acc * (d === 1 ? f[a]! : 1 - f[a]!), 1);
            out += w * voxels[k * S * S * S + v[0]! + S * (v[1]! + S * v[2]!)]!;
        }
        return out;
    };
    return { used, capacity: field.capacity.bricks, voxel, iso, bricks, voxels, phi };
}

/** φ da grade de CPU por interpolação trilinear (os voxels da GPU são amostras pontuais, a B-spline suavizaria). */
function trilinear(grid: FieldGrid, p: Vec3): number {
    const [nx, ny, nz] = grid.dims;
    const g = [0, 1, 2].map((k) => (p[k]! - grid.origin[k]!) / grid.voxel);
    const base = g.map((v) => Math.floor(v));
    const f = g.map((v, k) => v - base[k]!);
    let phi = 0;
    for (let c = 0; c < 8; c++) {
        const o = [c & 1, (c >> 1) & 1, c >> 2];
        const i = o.map((v, k) => Math.min([nx, ny, nz][k]! - 1, Math.max(0, base[k]! + v)));
        const w = o.reduce((acc, v, k) => acc * (v === 1 ? f[k]! : 1 - f[k]!), 1);
        phi += w * grid.phi[i[0]! + nx * (i[1]! + ny * i[2]!)]!;
    }
    return phi;
}

const toPoints = (positions: readonly number[]): Vec3[] => {
    const pts: Vec3[] = [];
    for (let i = 0; i < positions.length; i += 3)
        pts.push([positions[i]!, positions[i + 1]!, positions[i + 2]!]);
    return pts;
};

/** As duas bolas da cena parada: grande em (0, 0,5, 0) e pequena a 4 espaçamentos de vão. */
const BALLS = (): number[] => [...ball([0, 0.5, 0], 0.3), ...ball([0.6, 0.5, 0], 0.1)];
const BALL_EYE: Vec3 = [0, 0.8, 2.2];
const BALL_TARGET: Vec3 = [0, 0.4, 0];

async function caseGpu(): Promise<void> {
    const positions = BALLS();
    const s = await session(320, 200);
    staticStage(s.app, s.width, s.height, BALL_EYE, BALL_TARGET);
    staticBody(s.app, positions, SPACING);
    await settle(s.app);
    const f = await gpuField(s.app, SPACING);
    log(`gpu: ${f.used} blocos (capacidade ${f.capacity}), ${positions.length / 3} partículas`);
    check(
        f.used > 0 && f.used < f.capacity,
        `gpu: blocos ${f.used} dentro da capacidade ${f.capacity}`,
    );
    const t0 = performance.now();
    const grid = buildField(toPoints(positions), { spacing: SPACING, iso: f.iso });
    log(
        `gpu: nível da superfície ${f.iso.toFixed(3)}; referência de CPU em ${((performance.now() - t0) / 1000).toFixed(1)} s`,
    );
    const B = FIELD.brick;
    const S = B + 4;
    const errors: number[] = [];
    let nans = 0;
    for (let k = 0; k < f.used; k++)
        for (let z = 0; z < B; z++)
            for (let y = 0; y < B; y++)
                for (let x = 0; x < B; x++) {
                    const phi = f.voxels[k * S * S * S + (x + 2) + S * (y + 2 + S * (z + 2))]!;
                    if (!Number.isFinite(phi)) {
                        nans++;
                        continue;
                    }
                    const p: Vec3 = [
                        (f.bricks[4 * k]! * B + x + 0.5) * f.voxel,
                        (f.bricks[4 * k + 1]! * B + y + 0.5) * f.voxel,
                        (f.bricks[4 * k + 2]! * B + z + 0.5) * f.voxel,
                    ];
                    const ref = trilinear(grid, p);
                    if (Math.abs(ref) < 2 * f.voxel) errors.push(Math.abs(phi - ref) / f.voxel);
                }
    errors.sort((a, b) => a - b);
    const p95 = errors[Math.floor(0.95 * (errors.length - 1))] ?? Infinity;
    const max = errors[errors.length - 1] ?? Infinity;
    log(
        `gpu: ${errors.length} voxels na faixa, erro p95 ${p95.toFixed(3)} voxel, máx ${max.toFixed(3)} voxel, ${nans} NaN`,
    );
    check(nans === 0, `gpu: ${nans} NaN`);
    check(errors.length > 1000, `gpu: ${errors.length} voxels na faixa`);
    check(
        p95 <= 0.25 && max <= 1,
        `gpu: erro p95 ${p95.toFixed(3)} ≤ 0,25 e máx ${max.toFixed(3)} ≤ 1 voxel`,
    );
    s.dispose();
}

async function caseDrops(): Promise<void> {
    // Bola grande e pequena com 4 espaçamentos de vão; duas pequenas com 2.
    const positions = [
        ...BALLS(),
        ...ball([0, 0.5, 0.7], 0.1, 3),
        ...ball([0.3, 0.5, 0.7], 0.1, 5),
    ];
    const s = await session(320, 200);
    staticStage(s.app, s.width, s.height, BALL_EYE, BALL_TARGET);
    staticBody(s.app, positions, SPACING);
    await settle(s.app);
    const f = await gpuField(s.app, SPACING);
    const gap = (a: Vec3, b: Vec3): number => {
        let min = Infinity;
        for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            min = Math.min(
                min,
                f.phi([
                    a[0] + (b[0] - a[0]) * t,
                    a[1] + (b[1] - a[1]) * t,
                    a[2] + (b[2] - a[2]) * t,
                ]),
            );
        }
        return min;
    };
    // Os vãos entre as superfícies das partículas de fora (raio + ½ espaçamento de cada lado).
    const wide = gap([0.3 + SPACING, 0.5, 0], [0.5 - SPACING, 0.5, 0]);
    const narrow = gap([0.1 + SPACING, 0.5, 0.7], [0.2 - SPACING, 0.5, 0.7]);
    log(
        `drops: φ mínimo no vão de 4 espaçamentos ${(wide / f.voxel).toFixed(2)} voxel, no de 2 ${(narrow / f.voxel).toFixed(2)} voxel`,
    );
    check(wide > 0 && narrow > 0, 'drops: gotas separadas não se fundem (φ > 0 nos vãos)');
    s.dispose();
}

/** Raios de consulta (origem, direção) → (t, acertou) pelo ponto `ray_volume_hit`. */
const queryRays = wgslResource({
    name: 'smoke_rays',
    binding: { storage: 'read' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'stage',
    provider: 'private',
});
const queryHits = wgslResource({
    name: 'smoke_hits',
    binding: { storage: 'read_write' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'stage',
    provider: 'private',
});
const volumeQuery = wgslModule({
    name: 'smoke_volume_query',
    requires: [rayVolumeHitReady, queryRays, queryHits],
    source: /* wgsl */ `
@compute @workgroup_size(64)
fn smoke_volume_query_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&smoke_rays) / 2u) { return; }
    let h = ray_volume_hit(smoke_rays[i * 2u].xyz, smoke_rays[i * 2u + 1u].xyz, 10.0);
    smoke_hits[i] = vec4f(h.t, select(0.0, 1.0, h.hit), f32(h.material), 0.0);
}`,
});

/** Estágio de consulta: o ponto `ray_volume_hit` composto pela C2 com a contribuição do campo. */
class VolumeQueryFlow extends Flow<{ readonly field: ReturnType<typeof slot.singleton> }, 'idle'> {
    readonly type = 'smokeVolumeQuery';
    readonly slots = { field: slot.singleton(FluidField.schema) };
    override readonly pipelines = [
        {
            id: 'query',
            role: 'compute' as const,
            shader: volumeQuery,
            entryPoints: ['smoke_volume_query_main'],
        },
    ];
    override readonly bindings: ReadonlyMap<typeof queryRays, StorageBufferSpec>;
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
    pending = 0;

    constructor(
        rays: StorageBufferSpec,
        hits: StorageBufferSpec,
        private readonly count: number,
    ) {
        super();
        this.bindings = new Map([
            [queryRays, rays],
            [queryHits, hits],
        ]);
    }

    dispatch(frame: Frame, bound: BoundFlow): void {
        if (this.pending === 0) return;
        const p = bound.pipelines.get('query');
        if (p?.role !== 'compute' || !p.ready) return;
        frame.compute('smokeVolumeQuery', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.workgroups(Math.ceil(this.count / 64));
        });
        this.pending--;
    }
}

async function caseRays(): Promise<void> {
    const positions = BALLS();
    const W = 640;
    const H = 400;
    const s = await session(W, H);
    staticStage(s.app, W, H, BALL_EYE, BALL_TARGET);
    staticBody(s.app, positions, SPACING, { rippleStrength: 0 });
    // Raios para a bola grande, de fora, em direções variadas.
    const count = 256;
    const r = lcg(29);
    const rays: { o: Vec3; d: Vec3 }[] = [];
    for (let i = 0; i < count; i++) {
        const u = 2 * r() - 1;
        const a = 2 * Math.PI * r();
        const dir: Vec3 = [
            Math.sqrt(1 - u * u) * Math.cos(a),
            u,
            Math.sqrt(1 - u * u) * Math.sin(a),
        ];
        const o: Vec3 = [dir[0] * 1.2, 0.5 + dir[1] * 1.2, dir[2] * 1.2];
        const aim: Vec3 = [(r() - 0.5) * 0.2, 0.5 + (r() - 0.5) * 0.2, (r() - 0.5) * 0.2];
        const d = [aim[0] - o[0], aim[1] - o[1], aim[2] - o[2]];
        const len = Math.hypot(d[0]!, d[1]!, d[2]!);
        rays.push({ o, d: [d[0]! / len, d[1]! / len, d[2]! / len] });
    }
    const storage = (name: string, bytes: number): StorageBufferSpec =>
        s.app.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `smoke_volume_${name}`,
            byteSize: bytes,
        });
    const raysBuf = storage('rays', count * 32);
    const hitsBuf = storage('hits', count * 16);
    const data = new Float32Array(count * 8);
    rays.forEach((ray, i) => {
        data.set([...ray.o, 0, ...ray.d, 0], i * 8);
    });
    s.app.core.write(raysBuf, data);
    const query = new VolumeQueryFlow(raysBuf, hitsBuf, count);
    s.app.flows.register(() => query, {
        type: 'smokeVolumeQuery',
        phase: 'transform',
        priority: -100,
    });
    await settle(s.app, 1500);
    // A consulta roda quando o pipeline (recomposto com a contribuição do campo) estiver pronto.
    let hits = new Float32Array(count * 4);
    for (let attempt = 0; attempt < 40 && !hits.some((v, i) => i % 4 === 1 && v > 0.5); attempt++) {
        query.pending = 1;
        s.app.step(0);
        hits = new Float32Array(await readSpec(s.app, hitsBuf, 'hits'));
        await new Promise((r) => setTimeout(r, 100));
    }
    const f = await gpuField(s.app, SPACING);
    const grid = buildField(toPoints(positions), { spacing: SPACING, iso: f.iso });
    const half = 0.5 * SPACING;
    const errors: number[] = [];
    let missed = 0;
    rays.forEach((ray, i) => {
        const ref = marchField(grid, ray.o, ray.d, 3);
        const hit = hits[i * 4 + 1]! > 0.5;
        if (ref === null || !hit) {
            if ((ref === null) !== !hit) missed++;
            return;
        }
        errors.push(Math.abs(hits[i * 4]! - ref.t));
    });
    errors.sort((a, b) => a - b);
    const p99 = errors[Math.floor(0.99 * (errors.length - 1))] ?? Infinity;
    log(
        `rays: ray_volume_hit em ${errors.length} raios, erro p99 ${(p99 / SPACING).toFixed(3)} espaçamento, máx ${((errors.at(-1) ?? 0) / SPACING).toFixed(3)}; ${missed} discordâncias de acerto`,
    );
    check(
        errors.length > count * 0.8 && missed === 0,
        `rays: ${errors.length} acertos de ${count}, ${missed} discordâncias`,
    );
    check(
        p99 <= half,
        `rays: ray_volume_hit a ${(p99 / SPACING).toFixed(3)} ≤ ½ espaçamento (p99)`,
    );
    // A profundidade que a câmera escreveu na superfície da água contra a marcha da referência pelo mesmo pixel.
    const depth = await readR32(s.app, s.app.resources.textureOf(waterOf(s.app), 'depth')!);
    const z = new Float32Array(depth.data);
    const tanY = Math.tan(Math.PI / 8);
    const tanX = tanY * (W / H);
    const fwd = [
        BALL_TARGET[0] - BALL_EYE[0],
        BALL_TARGET[1] - BALL_EYE[1],
        BALL_TARGET[2] - BALL_EYE[2],
    ];
    const fl = Math.hypot(fwd[0]!, fwd[1]!, fwd[2]!);
    const ahead: Vec3 = [fwd[0]! / fl, fwd[1]! / fl, fwd[2]! / fl];
    const right: Vec3 = (() => {
        const rr = [-ahead[2], 0, ahead[0]];
        const l = Math.hypot(rr[0]!, rr[2]!);
        return [rr[0]! / l, 0, rr[2]! / l];
    })();
    const up: Vec3 = [
        right[1] * ahead[2] - right[2] * ahead[1],
        right[2] * ahead[0] - right[0] * ahead[2],
        right[0] * ahead[1] - right[1] * ahead[0],
    ];
    const depthErrors: number[] = [];
    for (let py = 4; py < H; py += 8)
        for (let px = 4; px < W; px += 8) {
            const zg = z[py * depth.stride + px]!;
            if (!(zg < 1e5)) continue;
            const nx = ((px + 0.5) / W) * 2 - 1;
            const ny = 1 - ((py + 0.5) / H) * 2;
            const d = [0, 1, 2].map((k) => ahead[k]! + right[k]! * nx * tanX + up[k]! * ny * tanY);
            const dl = Math.hypot(d[0]!, d[1]!, d[2]!);
            const dir: Vec3 = [d[0]! / dl, d[1]! / dl, d[2]! / dl];
            const ref = marchField(grid, BALL_EYE, dir, 5);
            if (ref === null) continue;
            depthErrors.push(Math.abs(zg - ref.t / dl));
        }
    depthErrors.sort((a, b) => a - b);
    const dp99 = depthErrors[Math.floor(0.99 * (depthErrors.length - 1))] ?? Infinity;
    log(
        `rays: profundidade da câmera em ${depthErrors.length} pixels, erro p99 ${(dp99 / SPACING).toFixed(3)} espaçamento`,
    );
    check(
        depthErrors.length > 200 && dp99 <= half,
        `rays: profundidade da câmera a ${(dp99 / SPACING).toFixed(3)} ≤ ½ espaçamento (p99)`,
    );
    s.app.core.destroy(raysBuf);
    s.app.core.destroy(hitsBuf);
    s.dispose();
}

/** Água opaca e escura (a silhueta contra o fundo claro). */
const OPAQUE: FluidSurfaceMaterialOptions = {
    color: [0.02, 0.03, 0.05, 1],
    absorption: [40, 40, 40, 0],
    rippleStrength: 0,
    refraction: 0,
};
/** Camada parada de 6 partículas (15 cm) depois de assentar. */
const SETTLE_FRAMES = 240;

/** Tanque com a camada parada e a câmera dada; devolve a sessão depois de assentar. */
async function tank(
    width: number,
    height: number,
    options: Omit<WaterSceneOptions, 'width' | 'height'>,
    profiling?: 'passes',
): Promise<Session> {
    const s = await session(width, height, profiling);
    waterScene(s.app, { width, height, ...options });
    await settle(s.app, 400);
    await simulate(s.app, options.layer !== undefined ? SETTLE_FRAMES : 0);
    return s;
}

/** Pixels por metro na distância `d` com a câmera de 45° e `height` linhas. */
const pxPerMeter = (d: number, height: number): number => height / (2 * d * Math.tan(Math.PI / 8));

/** Silhueta da borda da água contra a parede da frente, vista de perto um pouco abaixo da superfície. */
async function closeSilhouette(
    width: number,
    height: number,
): Promise<{ ripple: number; p: number; rows: number }> {
    // Olho a 0,7 m da parede da frente (z = 0,4), abaixo do topo da água (15 cm): o topo da face da frente contra o fundo.
    const eye: Vec3 = [0.05, 0.12, 1.1];
    const s = await tank(width, height, {
        layer: 6,
        material: OPAQUE,
        eye,
        target: [0.05, 0.12, 0.4],
    });
    const img = s.capture();
    const p = WATER_SPACING * pxPerMeter(0.7, height);
    const rect: Rect = {
        x: Math.round(width * 0.15),
        y: Math.round(height * 0.2),
        w: Math.round(width * 0.7),
        h: Math.round(height * 0.32),
    };
    const rows = silhouetteRows(img, rect, 0.22, 'bright');
    const ripple = bandAmplitude(rows, 0.5 * p, 2 * p);
    s.dispose();
    return { ripple, p, rows: rows.length };
}

async function caseClose(): Promise<void> {
    const a = await closeSilhouette(1280, 720);
    log(
        `close: silhueta em ${a.rows} colunas, p = ${a.p.toFixed(1)} px, ondulação na escala das partículas ${a.ripple.toFixed(3)} px (${(a.ripple / a.p).toFixed(4)} p)`,
    );
    check(
        a.p >= 20 && a.rows > 0.9 * 1280 * 0.7,
        `close: p ${a.p.toFixed(1)} ≥ 20 px e silhueta contínua (${a.rows} colunas)`,
    );
    check(a.ripple / a.p <= 0.008, `close: ondulação ${(a.ripple / a.p).toFixed(4)} p ≤ 0,008 p`);
    const b = await closeSilhouette(2560, 1440);
    log(
        `close: resolução dobrada, p = ${b.p.toFixed(1)} px, ondulação ${b.ripple.toFixed(3)} px (${(b.ripple / b.p).toFixed(4)} p)`,
    );
    check(
        b.ripple / b.p <= 0.008,
        `close: resolução dobrada ${(b.ripple / b.p).toFixed(4)} p ≤ 0,008 p`,
    );
}

async function caseNormal(): Promise<void> {
    const W = 1280;
    const H = 720;
    const eye: Vec3 = [0.05, 0.75, 0.06];
    const s = await tank(W, H, {
        layer: 6,
        floor: 'sand',
        material: { rippleStrength: 0 },
        eye,
        target: [0.05, 0.15, 0],
    });
    const img = s.capture();
    const p = WATER_SPACING * pxPerMeter(0.6, H);
    const rect: Rect = {
        x: Math.round(W * 0.3),
        y: Math.round(H * 0.3),
        w: Math.round(W * 0.4),
        h: Math.round(H * 0.4),
    };
    // Luminância da imagem e a normal escrita pela marcha, nos períodos da escala das partículas.
    const lumRows: number[] = [];
    let lum = 0;
    let lumN = 0;
    for (let y = rect.y; y < rect.y + rect.h; y += 4) {
        const row: number[] = [];
        for (let x = rect.x; x < rect.x + rect.w; x++) {
            const i = (y * W + x) * 4;
            row.push(lumaSrgb8(img.data, i));
        }
        lum += bandAmplitude(row, 0.5 * p, 2 * p);
        lumN++;
        lumRows.push(row.length);
    }
    const normal = await readHdrTexture(
        s.app,
        s.app.resources.textureOf(waterOf(s.app), 'normal')!,
    );
    let amp = 0;
    let n = 0;
    for (let y = rect.y; y < rect.y + rect.h; y += 4) {
        const row: number[] = [];
        for (let x = rect.x; x < rect.x + rect.w; x++) row.push(normal.data[(y * W + x) * 4]!);
        amp += bandAmplitude(row, 0.5 * p, 2 * p);
        n++;
    }
    for (let x = rect.x; x < rect.x + rect.w; x += 4) {
        const col: number[] = [];
        for (let y = rect.y; y < rect.y + rect.h; y++) col.push(normal.data[(y * W + x) * 4 + 2]!);
        amp += bandAmplitude(col, 0.5 * p, 2 * p);
        n++;
    }
    const normalAmp = amp / Math.max(1, n);
    const lumAmp = lum / Math.max(1, lumN);
    log(
        `normal: p = ${p.toFixed(1)} px; amplitude na escala das partículas: normal ${normalAmp.toFixed(4)}, luminância ${lumAmp.toFixed(4)}`,
    );
    check(normalAmp <= 0.01, `normal: favo de mel na normal ${normalAmp.toFixed(4)} ≤ 0,01`);
    check(lumAmp <= 0.004, `normal: favo de mel na imagem ${lumAmp.toFixed(4)} ≤ 0,004`);
    s.dispose();
}

async function caseEdge(): Promise<void> {
    const W = 1280;
    const H = 720;
    const eye: Vec3 = [0.05, 0.22, 1.05];
    const s = await tank(W, H, {
        layer: 6,
        material: { rippleStrength: 0 },
        eye,
        target: [0.05, 0.16, 0.4],
    });
    const img = s.capture();
    const rect: Rect = {
        x: Math.round(W * 0.15),
        y: Math.round(H * 0.25),
        w: Math.round(W * 0.7),
        h: Math.round(H * 0.5),
    };
    let max = 0;
    for (let y = rect.y; y < rect.y + rect.h; y++)
        for (let x = rect.x; x < rect.x + rect.w; x++) {
            const i = (y * W + x) * 4;
            max = Math.max(max, lumaSrgb8(img.data, i));
        }
    const isolated = isolatedHighlights(img, rect, 0.85 * max);
    log(
        `edge: realce da borda (≥ 85 % do máximo ${max.toFixed(3)}): ${(isolated * 100).toFixed(1)} % isolados`,
    );
    check(
        isolated <= 0.05,
        `edge: realce contínuo (${(isolated * 100).toFixed(1)} % ≤ 5 % isolados)`,
    );
    s.dispose();
}

async function caseVolume(): Promise<void> {
    const s = await session(640, 360);
    const body = waterScene(s.app, { width: 640, height: 360 })!;
    await settle(s.app, 400);
    const reference = body.count * WATER_SPACING ** 3;
    const B = FIELD.brick;
    const S = B + 4;
    const out: string[] = [];
    let worst = 0;
    for (const frames of [0, 20, 25, 25, 25]) {
        await simulate(s.app, frames);
        s.app.step(0);
        const f = await gpuField(s.app, WATER_SPACING);
        let volume = 0;
        for (let k = 0; k < f.used; k++)
            for (let z = 0; z < B; z++)
                for (let y = 0; y < B; y++)
                    for (let x = 0; x < B; x++) {
                        const phi = f.voxels[k * S * S * S + (x + 2) + S * (y + 2 + S * (z + 2))]!;
                        volume += Math.min(1, Math.max(0, 0.5 - phi / f.voxel));
                    }
        volume *= f.voxel ** 3;
        const ratio = volume / reference;
        worst = Math.max(worst, Math.abs(ratio - 1));
        out.push(ratio.toFixed(3));
    }
    log(`volume: campo / partículas nos quadros 0, 20, 45, 70, 95: ${out.join(', ')}`);
    check(
        worst <= 0.05,
        `volume: a ±5 % das partículas em movimento (pior ${(worst * 100).toFixed(1)} %)`,
    );
    s.dispose();
}

async function caseCaustics(): Promise<void> {
    const W = 1280;
    const H = 720;
    const s = await session(W, H);
    const eye: Vec3 = [0, 1.2, 0.01];
    staticStage(s.app, W, H, eye, [0, 0, 0]);
    // Fundo claro e uma placa de água parada apoiada nele (o fundo do tanque sob a água, sol inclinado).
    const floor = new PlaneGeometry({ size: [3, 3] });
    floor.add(new StandardMaterial({ albedo: [0.85, 0.82, 0.72, 1], roughness: 0.9, metallic: 0 }));
    floor.add(new Transform({ position: [0, 0, 0, 1] }));
    s.app.world.insert(floor);
    const s0 = WATER_SPACING;
    staticBody(s.app, slab([-0.2, 0, -0.15], [16, 3, 12], s0), s0, {
        absorption: [6, 3, 1.5, 0],
        rippleStrength: 0,
    });
    await settle(s.app, 1200);
    const img = s.capture();
    const p = s0 * pxPerMeter(1.2, H);
    // A borda de cima da projeção da placa no fundo (horizontal na imagem), entre o fundo aceso e a área sob a água.
    const rect: Rect = {
        x: Math.round(W * 0.42),
        y: Math.round(H * 0.1),
        w: Math.round(W * 0.16),
        h: Math.round(H * 0.4),
    };
    const rows = silhouetteRows(img, rect, 0.55, 'bright');
    const ripple = bandAmplitude(rows, 0.5 * p, 2 * p);
    const inner: Rect = {
        x: Math.round(W * 0.45),
        y: Math.round(H * 0.45),
        w: Math.round(W * 0.1),
        h: Math.round(H * 0.1),
    };
    const steps = neighborSteps(img, inner, 0.06);
    log(
        `caustics: borda no fundo em ${rows.length} colunas, p = ${p.toFixed(1)} px, ondulação ${ripple.toFixed(3)} px (${(ripple / p).toFixed(4)} p); degraus no padrão ${(steps * 100).toFixed(2)} %`,
    );
    check(
        rows.length > 0.9 * rect.w,
        `caustics: borda contínua (${rows.length} de ${rect.w} colunas)`,
    );
    check(
        ripple / p <= 0.05,
        `caustics: borda sem ondulação das partículas (${(ripple / p).toFixed(4)} p ≤ 0,05 p)`,
    );
    check(
        steps <= 0.02,
        `caustics: padrão sem blocos (${(steps * 100).toFixed(2)} % ≤ 2 % de degraus)`,
    );
    s.dispose();
}

async function caseContact(): Promise<void> {
    const W = 1280;
    const H = 720;
    const eye: Vec3 = [0.15, 0.9, 0.01];
    const s = await tank(W, H, {
        layer: 6,
        box: true,
        material: { rippleStrength: 0 },
        eye,
        target: [0.15, 0, 0],
    });
    const material = await readR32(s.app, s.app.resources.textureOf(waterOf(s.app), 'material')!);
    const m = new Uint32Array(material.data);
    // A caixa (centro x = 0,15, z = 0, meio lado 0,12; topo a 0,24) vista de cima: o quadrado na tela pela câmera.
    const ppm = pxPerMeter(0.9 - 0.24, H);
    const cx = W / 2;
    const cy = H / 2;
    const half = 0.12 * ppm;
    const ring = (d: number): boolean =>
        d >= 0.5 * WATER_SPACING * ppm && d <= 1.5 * WATER_SPACING * ppm;
    let inRing = 0;
    let wet = 0;
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            const dx = Math.max(Math.abs(x + 0.5 - cx) - half, 0);
            const dy = Math.max(Math.abs(y + 0.5 - cy) - half, 0);
            const d = Math.hypot(dx, dy);
            if (d === 0 || !ring(d)) continue;
            inRing++;
            if (m[y * material.stride + x]! > 0) wet++;
        }
    log(
        `contact: anel em volta da caixa ${inRing} px, com água ${((wet / Math.max(1, inRing)) * 100).toFixed(1)} %`,
    );
    check(
        inRing > 1000 && wet / inRing >= 0.95,
        `contact: a água encosta na caixa (${((wet / inRing) * 100).toFixed(1)} % ≥ 95 %)`,
    );
    s.dispose();
}

/** Tempo de GPU por quadro (perfil por quadro, leituras novas a cada quadro de tela) da barragem de 64 000. */
async function damFrameTime(
    material: 'water' | 'sprites',
): Promise<{ mean: number; readings: number; count: number }> {
    const W = 1280;
    const H = 720;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const app = await Application.create({
        // Antisserrilhado com que as medidas deste smoke foram calibradas (MSAA, o padrão antes da 034; o
        // temporal, padrão agora, tem o smoke `antialiasing`).
        antialias: 'msaa',
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        profiling: 'frame',
    });
    app.events.on('engineError', (e) => engineErrors.push(`timing: ${e.stage}: ${e.message}`));
    const body = waterScene(app, {
        width: W,
        height: H,
        dam: [40, 40, 40],
        box: true,
        ...(material === 'sprites' ? { material: 'sprites' as const } : {}),
    })!;
    const gpu: number[] = [];
    let counting = false;
    app.events.on('gpuFrameTimed', (e) => {
        if (counting) gpu.push(e.totalMs);
    });
    // Todos os pipelines compilados antes de medir (a água recompõe os da cena ao entrar).
    await app.whenReady({ timeoutMs: 60_000 });
    await simulate(app, 90);
    counting = true;
    for (let i = 0; i < 120; i++) {
        app.step(1 / 60);
        await nextGpuFrame(app);
    }
    app.dispose();
    canvas.remove();
    const sorted = [...gpu].sort((a, b) => a - b);
    // Uma leitura por quadro (spec 034); a mediana, robusta aos picos de relógio.
    return {
        mean: sorted[Math.floor(sorted.length / 2)] ?? NaN,
        readings: gpu.length,
        count: body.count,
    };
}

async function caseTiming(): Promise<void> {
    const water = await damFrameTime('water');
    const sprites = await damFrameTime('sprites');
    const cost = water.mean - sprites.mean;
    log(
        `timing: ${water.count} partículas em 1280 × 720: quadro com a água pelo campo ${water.mean.toFixed(2)} ms, com sprites ${sprites.mean.toFixed(2)} ms (${water.readings}/${sprites.readings} leituras) → a água custa ${cost.toFixed(2)} ms`,
    );
    check(
        water.readings >= 90 && sprites.readings >= 90,
        `timing: leituras de GPU suficientes (${water.readings}/${sprites.readings}, ≥ 90)`,
    );
    check(
        cost <= 2.5,
        `timing: campo + marcha da água ${cost.toFixed(2)} ms ≤ 2,5 ms (campo ≤ 1,5 e marcha ≤ 1)`,
    );
}

const CASES: Record<string, () => Promise<void>> = {
    gpu: caseGpu,
    drops: caseDrops,
    rays: caseRays,
    close: caseClose,
    normal: caseNormal,
    edge: caseEdge,
    volume: caseVolume,
    caustics: caseCaustics,
    contact: caseContact,
    timing: caseTiming,
};

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        if (only !== null && !only.split('-').includes(name)) continue;
        await run();
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('FLUIDFIELD SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
