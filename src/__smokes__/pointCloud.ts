// Spec 008 — Smoke de geometria produzida em compute (US4).
//
// Um estágio do próprio smoke (`SpiralFlow`, fase `transform`, `owns` sobre os vértices) escreve a cada quadro, por
// kernel, uma espiral animada de 10 000 pontos numa `PointCloudGeometry` (vértices só da GPU); o forward a desenha com
// `PointSpriteMaterial`. Verifica: pontos na imagem nos quadros 20 e 60, a imagem muda entre eles (animação), nenhuma
// escrita da CPU no vertex buffer da nuvem e nenhuma leitura de volta, e o quadro 60 igual à fixture
// `pointCloud-<perfil>.png` (`--record` grava; duas execuções idênticas antes).
//
// Para rodar: `npm run smoke -- pointCloud [--record]`. Resultado: `POINT CLOUD SMOKE PASSED` ou `FAIL: …`.
import { wgslResource, type WgslResource } from '../scene/shaders/WgslResource';
import type { BindingSource } from '../scene/flows/FlowBinding';
import {
    Application,
    Camera,
    createComputeKernel,
    createScene,
    destroyComputeKernel,
    DirectionalLight,
    FieldType,
    Flow,
    PointCloudGeometry,
    PointSpriteMaterial,
    slot,
    StructSchema,
    Transform,
    wgslModule,
} from 'clayflow';
import type {
    ComputeKernel,
    EngineCore,
    EntitiesSlot,
    FlowContext,
    FlowTransitions,
    Frame,
    SlotMap,
    TransitionContext,
    UniformBufferSpec,
} from 'clayflow';
import { gpuProfile, readFixture, recording, writeFixture } from './support/fixtures';

const WIDTH = 256;
const HEIGHT = 192;
const POINTS = 10_000;

function log(msg: string): void {
    console.log(`[pointCloud] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const SpiralParamsSchema = new StructSchema(
    'SpiralParams',
    { time: FieldType.f32, count: FieldType.u32, _pad0: FieldType.u32, _pad1: FieldType.u32 },
    { addressSpace: 'uniform' },
);

// Espiral: ponto i em ângulo i·0,02 + t, raio crescente, subindo; 8 floats por vértice (posição, normal, uv).
const spiralParams = wgslResource({
    name: 'spiral',
    binding: { uniform: true },
    type: { schema: SpiralParamsSchema },
    frequency: 'stage',
    provider: 'private',
});
const spiralVertices = wgslResource({
    name: 'vertices',
    binding: { storage: 'read_write' },
    type: { wgsl: 'f32', array: true },
    frequency: 'stage',
    provider: 'private',
});
const spiral = wgslModule({
    name: 'smoke_spiral',
    requires: [spiralParams, spiralVertices],
    source: /* wgsl */ `
@compute @workgroup_size(64)
fn spiral_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= spiral.count) { return; }
    let f = f32(i);
    let angle = f * 0.02 + spiral.time;
    let radius = 0.15 + f * 0.00012;
    let o = i * 8u;
    vertices[o] = cos(angle) * radius;
    vertices[o + 1u] = f * 0.00011;
    vertices[o + 2u] = sin(angle) * radius;
    vertices[o + 3u] = 0.0;
    vertices[o + 4u] = 1.0;
    vertices[o + 5u] = 0.0;
}
`,
    structs: [SpiralParamsSchema],
});

interface SpiralSlots extends SlotMap {
    readonly clouds: EntitiesSlot;
}

/** Estágio que escreve a espiral nos vértices de cada `PointCloudGeometry` (dono dos vértices). */
class SpiralFlow extends Flow<SpiralSlots, 'idle'> {
    readonly type = 'SpiralFlow';
    readonly slots: SpiralSlots = {
        clouds: slot.entities({
            all: [PointCloudGeometry],
            owns: [[PointCloudGeometry, 'vertices']],
        }),
    };
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<SpiralSlots>>;
    private readonly core: EngineCore;
    private readonly params: UniformBufferSpec;
    private readonly kernels: ComputeKernel[] = [];
    private time = 0;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'smoke_spiral_params',
            byteSize: SpiralParamsSchema.stride,
        });
        const build = (c: TransitionContext<SpiralSlots>): void => {
            for (const k of this.kernels.splice(0)) destroyComputeKernel(this.core, k);
            for (const entry of c.bound.slots.clouds.entries) {
                const vertices = ctx.resources.bufferOf(entry.get(PointCloudGeometry), 'vertices');
                if (vertices?.subkind !== 'vertex') continue;
                this.kernels.push(
                    createComputeKernel(this.core, {
                        discriminator: `smoke_spiral:${entry.entityId}`,
                        shader: spiral,
                        entryPoint: 'spiral_main',
                        bindings: new Map<WgslResource, BindingSource>([
                            [spiralParams, this.params],
                            [spiralVertices, vertices],
                        ]),
                    }),
                );
            }
        };
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        build(c);
                    },
                },
                entitiesChanged: {
                    to: 'idle',
                    run: (_e, c) => {
                        build(c);
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: () => {
                        this.time += 1 / 60;
                        this.core.write(
                            this.params,
                            SpiralParamsSchema.pack({ time: this.time, count: POINTS }),
                        );
                    },
                },
            },
        };
    }

    dispatch(frame: Frame): void {
        for (const kernel of this.kernels) {
            frame.compute('SpiralFlow', (pass) => {
                pass.bind.setPipeline(kernel.pipeline);
                kernel.bindTo(pass.bind);
                pass.dispatch.invocations(POINTS, 64);
            });
        }
    }

    override dispose(): void {
        for (const k of this.kernels) destroyComputeKernel(this.core, k);
        this.core.destroy(this.params);
    }
}

const engineErrors: string[] = [];

interface Capture {
    readonly early: ImageData;
    readonly late: ImageData;
    readonly cpuWrites: number;
    readonly readbacks: number;
    readonly profile: string;
}

async function run(): Promise<Capture> {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
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
    });
    app.events.on('engineError', (e) => engineErrors.push(`${e.stage}: ${e.message}`));
    scene.flows.register((ctx) => new SpiralFlow(ctx), { type: 'spiral', phase: 'transform' });
    app.world.insert(
        new Camera({
            fov: Math.PI / 4,
            aspect: WIDTH / HEIGHT,
            aspectMode: 'fixed',
            near: 0.05,
            far: 20,
        }).add(
            new Transform({
                position: [0, 1.6, 2.4, 1],
                rotation: Transform.lookRotation([0, 1.6, 2.4], [0, 0.5, 0]),
            }),
        ),
    );
    // Spec 011: a luz é explícita (sem luz na cena, só o hemisfério ilumina).
    app.world.insert(new DirectionalLight({ direction: [0.4, -1, 0.6, 0], intensity: Math.PI }));
    const cloud = new PointCloudGeometry({ maxPoints: POINTS });
    app.world.insert(
        cloud
            .add(new PointSpriteMaterial({ color: [1, 0.15, 0.1, 1], radius: 0.012 }))
            .add(new Transform()),
    );
    let cpuWrites = 0;
    let readbacks = 0;
    const write = app.core.write.bind(app.core);
    app.core.write = (spec, data, offset) => {
        if (spec === app.resources.bufferOf(cloud, 'vertices')) cpuWrites++;
        write(spec, data, offset);
    };
    const readback = app.core.readback.bind(app.core);
    app.core.readback = (spec: Parameters<typeof readback>[0]) => {
        readbacks++;
        return readback(spec);
    };
    const ctx = new OffscreenCanvas(WIDTH, HEIGHT).getContext('2d', { willReadFrequently: true });
    if (ctx === null) throw new Error('canvas 2D indisponível');
    const grab = (): ImageData => {
        ctx.drawImage(canvas, 0, 0);
        return ctx.getImageData(0, 0, WIDTH, HEIGHT);
    };
    for (let i = 0; i < 20; i++) app.step(1 / 60);
    const early = grab();
    for (let i = 20; i < 60; i++) app.step(1 / 60);
    const late = grab();
    const profile = gpuProfile(app);
    app.dispose();
    canvas.remove();
    return { early, late, cpuWrites, readbacks, profile };
}

function reddish(img: ImageData): number {
    let n = 0;
    for (let i = 0; i < img.data.length; i += 4) {
        const r = img.data[i]!;
        if (r > 40 && r > 1.8 * img.data[i + 1]! && r > 1.8 * img.data[i + 2]!) n++;
    }
    return n;
}

function diff(a: ImageData, b: ImageData): { pixels: number; max: number } {
    let pixels = 0;
    let max = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        let d = 0;
        for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a.data[i + k]! - b.data[i + k]!));
        if (d > 0) pixels++;
        max = Math.max(max, d);
    }
    return { pixels, max };
}

async function toPng(pixels: ImageData): Promise<Uint8Array> {
    const off = new OffscreenCanvas(pixels.width, pixels.height);
    off.getContext('2d')!.putImageData(pixels, 0, 0);
    return new Uint8Array(await (await off.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

async function fromPng(bytes: Uint8Array): Promise<ImageData> {
    const bitmap = await createImageBitmap(new Blob([bytes.slice().buffer], { type: 'image/png' }));
    const off = new OffscreenCanvas(bitmap.width, bitmap.height);
    const c = off.getContext('2d')!;
    c.drawImage(bitmap, 0, 0);
    return c.getImageData(0, 0, bitmap.width, bitmap.height);
}

async function main(): Promise<void> {
    const failures: string[] = [];
    const first = await run();
    const early = reddish(first.early);
    const late = reddish(first.late);
    const moved = diff(first.early, first.late).pixels;
    log(
        `pontos ${early} → ${late} px, ${moved} px mudaram, ${first.cpuWrites} escritas da CPU nos vértices, ${first.readbacks} leituras`,
    );
    if (early < 500 || late < 500) failures.push(`a nuvem não aparece (${early}/${late} px)`);
    if (moved === 0) failures.push('a imagem não mudou entre os quadros 20 e 60');
    if (first.cpuWrites > 0) failures.push(`${first.cpuWrites} escritas da CPU nos vértices`);
    if (first.readbacks > 0) failures.push(`${first.readbacks} leituras de volta`);
    const file = `pointCloud-${first.profile}.png`;
    if (recording()) {
        const second = await run();
        const d = diff(first.late, second.late);
        if (d.pixels > 0)
            failures.push(`duas execuções diferem (${d.pixels} pixels, máx. ${d.max})`);
        else {
            await writeFixture(file, await toPng(first.late));
            log(`gravada (${file})`);
        }
    } else {
        const bytes = await readFixture(file);
        if (bytes === null) failures.push(`sem fixture ${file} (rode com --record)`);
        else {
            const d = diff(await fromPng(bytes), first.late);
            log(d.pixels === 0 ? 'idêntica' : `${d.pixels} pixels diferentes (máx. ${d.max})`);
            if (d.pixels > 0) failures.push(`${d.pixels} pixels diferentes`);
        }
    }
    failures.push(...new Set(engineErrors));
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('POINT CLOUD SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
