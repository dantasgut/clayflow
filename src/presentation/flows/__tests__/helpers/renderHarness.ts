import { vi } from 'vitest';
import type {
    BindGroupSpec,
    EngineCore,
    Frame,
    RenderPipelineSpec,
    RenderTarget,
    ResourceSpec,
} from '../../../../scene/contracts/gpu';
import { createScene, type SceneContext } from '../../../../scene/SceneContext';
import { defaultCapabilities } from '../../../../scene/__tests__/helpers/defaultCapabilities';
import { ELEMENT_CONSUMERS } from '../../../../elements/consumers';
import { WATER_CONSUMERS } from '../../../water/consumers';
import { TransformFlow } from '../../../../elements/scene/flows/TransformFlow';
import { CameraFlow } from '../../../../elements/scene/flows/CameraFlow';
import { ShadowMatrixFlow } from '../../../../elements/scene/flows/ShadowMatrixFlow';
import { FrameTargets } from '../../../app/FrameTargets';
import { ForwardFlow, type ForwardOutput } from '../../ForwardFlow';
import { ParticleFlow } from '../../ParticleFlow';
import { SoftSurfaceFlow } from '../../../../elements/physics/flows/SoftSurfaceFlow';
import { PostFlow } from '../../PostFlow';
import { ShadowFlow } from '../../ShadowFlow';
import { WaterSurface } from '../../../app/WaterSurface';
import { FluidFieldPassFlow } from '../../FluidFieldPassFlow';
import { FluidField } from '../../../../elements/fields/FluidField';
import { FluidFieldFlow } from '../../../../elements/fields/FluidFieldFlow';
import { CausticsFlow } from '../../CausticsFlow';
import { WaterFlow } from '../../WaterFlow';
import { PbrTables } from '../../../../elements/material/pbr/PbrTables';

/** Bind group ligado num desenho, com os offsets dinâmicos. */
export interface BoundGroup {
    readonly group: BindGroupSpec;
    readonly offsets: readonly number[] | undefined;
}

/** Uma chamada de desenho capturada. */
export interface DrawCall {
    readonly pass: string;
    readonly pipeline: RenderPipelineSpec;
    readonly bindGroups: ReadonlyMap<number, BoundGroup>;
    readonly vertex: ResourceSpec | undefined;
    readonly index: ResourceSpec | undefined;
    readonly indexCount: number;
    /** Instâncias do desenho (um grupo de instâncias desenha `instanceCount` entidades). */
    readonly instanceCount: number;
    readonly firstInstance: number | undefined;
    /** Desenho indireto (spec 010): o buffer de argumentos e o offset; as contagens vêm dele. */
    readonly indirect?: { readonly buffer: ResourceSpec; readonly offset: number };
}

/** Um passe de render gravado. */
export interface RenderPassRecord {
    readonly label: string;
    readonly target: RenderTarget;
    /** `setBindGroup` chamados no passe, em ordem (`índice`). */
    readonly setBindGroups: readonly number[];
    readonly draws: readonly DrawCall[];
    /** `draw.vertices` (passes de tela cheia). */
    readonly fullscreen: number;
    /** Desenhos `draw.vertices` (sem índices), com a contagem de vértices em `indexCount`. */
    readonly vertexDraws: readonly DrawCall[];
}

/** Discriminator de um spec (ou string vazia). */
export function discOf(spec: unknown): string {
    return (spec as { discriminator?: string } | undefined)?.discriminator ?? '';
}

/**
 * Cena real (C2) para testar estágios de render no modelo de slots: core falso (`create` devolve o spec e é
 * registrado, `write`/`destroy` registrados, `record` grava os passes de render com desenhos, bind groups e offsets),
 * resolvers da C3 e `step()` avançando um quadro (`frameTick`). Registre os estágios em `scene.flows` (factory).
 * Acessos por função: o objeto pode ser espalhado sem congelar os valores.
 */
export async function renderScene(
    options: {
        /** Features do device (padrão nenhuma; ex.: `'indirect-first-instance'`). */
        readonly features?: readonly GPUFeatureName[];
    } = {},
): Promise<{
    scene: SceneContext;
    core: EngineCore;
    /** Avança um quadro e devolve os passes de render gravados nele. */
    step(): RenderPassRecord[];
    /** Desenhos do último quadro, de todos os passes (ou do passe `label`). */
    draws(label?: string): DrawCall[];
    /** Rótulos dos passes de compute do último quadro, em ordem. */
    computes(): readonly string[];
    /** Specs criados desde o início (ou o último `resetCounts`). */
    creates(): readonly ResourceSpec[];
    /** Specs escritos desde o início (ou o último `resetCounts`). */
    writes(): readonly ResourceSpec[];
    /** Specs destruídos desde o início (ou o último `resetCounts`). */
    destroys(): readonly ResourceSpec[];
    /** Criações feitas durante a gravação de algum passe (deve ficar 0). */
    createdWhileRecording(): number;
    resetCounts(): void;
}> {
    let creates: ResourceSpec[] = [];
    let writes: ResourceSpec[] = [];
    let destroys: ResourceSpec[] = [];
    let recording = false;
    let createdWhileRecording = 0;
    let passes: RenderPassRecord[] = [];
    /** Rótulos dos passes de compute do último quadro. */
    let computes: string[] = [];
    const created = <S>(spec: S): S => {
        creates.push(spec as ResourceSpec);
        if (recording) createdWhileRecording++;
        return spec;
    };

    const frameFor = (out: RenderPassRecord[]): Frame =>
        ({
            canvasView: { kind: 'textureview', discriminator: 'canvas' },
            render: (target: RenderTarget, label: string, body: (pass: unknown) => void) => {
                let pipeline: RenderPipelineSpec | null = null;
                const bound = new Map<number, BoundGroup>();
                const setBindGroups: number[] = [];
                const draws: DrawCall[] = [];
                let vertex: ResourceSpec | undefined;
                let index: ResourceSpec | undefined;
                let fullscreen = 0;
                const vertexDraws: DrawCall[] = [];
                const pass = {
                    bind: {
                        setPipeline: (p: RenderPipelineSpec) => {
                            pipeline = p;
                            return pass.bind;
                        },
                        setBindGroup: (
                            i: number,
                            group: BindGroupSpec,
                            offsets?: readonly number[],
                        ) => {
                            bound.set(i, { group, offsets });
                            setBindGroups.push(i);
                            return pass.bind;
                        },
                    },
                    geometry: {
                        vertex: (_slot: number, buffer: ResourceSpec) => {
                            vertex = buffer;
                            return pass.geometry;
                        },
                        index: (buffer: ResourceSpec) => {
                            index = buffer;
                            return pass.geometry;
                        },
                    },
                    draw: {
                        indexedIndirect: (buffer: ResourceSpec, offset = 0) => {
                            draws.push({
                                pass: label,
                                pipeline: pipeline!,
                                bindGroups: new Map(bound),
                                vertex,
                                index,
                                indexCount: -1,
                                instanceCount: -1,
                                firstInstance: undefined,
                                indirect: { buffer, offset },
                            });
                            return pass.draw;
                        },
                        indirect: (buffer: ResourceSpec, offset = 0) => {
                            vertexDraws.push({
                                pass: label,
                                pipeline: pipeline!,
                                bindGroups: new Map(bound),
                                vertex,
                                index: undefined,
                                indexCount: -1,
                                instanceCount: -1,
                                firstInstance: undefined,
                                indirect: { buffer, offset },
                            });
                            return pass.draw;
                        },
                        indexed: (
                            count: number,
                            instances?: number,
                            _firstIndex?: number,
                            _baseVertex?: number,
                            firstInstance?: number,
                        ) => {
                            draws.push({
                                pass: label,
                                pipeline: pipeline!,
                                bindGroups: new Map(bound),
                                vertex,
                                index,
                                indexCount: count,
                                instanceCount: instances ?? 1,
                                firstInstance,
                            });
                            return pass.draw;
                        },
                        vertices: (
                            count: number,
                            instances?: number,
                            _firstVertex?: number,
                            firstInstance?: number,
                        ) => {
                            fullscreen++;
                            vertexDraws.push({
                                pass: label,
                                pipeline: pipeline!,
                                bindGroups: new Map(bound),
                                vertex,
                                index: undefined,
                                indexCount: count,
                                instanceCount: instances ?? 1,
                                firstInstance,
                            });
                            return pass.draw;
                        },
                    },
                    marker: () => undefined,
                };
                body(pass);
                out.push({ label, target, setBindGroups, draws, fullscreen, vertexDraws });
            },
            compute: (label: string, body: (pass: unknown) => void) => {
                computes.push(label);
                const pass = {
                    bind: { setPipeline: () => pass.bind, setBindGroup: () => pass.bind },
                    dispatch: {
                        workgroups: () => pass.dispatch,
                        invocations: () => pass.dispatch,
                        workgroupsIndirect: () => pass.dispatch,
                    },
                };
                body(pass);
            },
            copy: (src: ResourceSpec, dst: ResourceSpec) => {
                computes.push(`copy:${discOf(src)}→${discOf(dst)}`);
            },
            copyTextureToTexture: (src: ResourceSpec, dst: ResourceSpec) => {
                computes.push(`copy:${discOf(src)}→${discOf(dst)}`);
            },
            clear: () => undefined,
        }) as unknown as Frame;

    const core = {
        create: vi.fn(<S>(spec: S) => created(spec)),
        shaderMessages: vi.fn(() => Promise.resolve([])),
        createAsync: vi.fn(<S>(spec: S) => Promise.resolve(created(spec))),
        writeTexture: vi.fn(),
        write: vi.fn((spec: ResourceSpec) => {
            writes.push(spec);
        }),
        destroy: vi.fn((spec: ResourceSpec) => {
            destroys.push(spec);
        }),
        record: vi.fn((label: unknown, body?: unknown) => {
            const fn = (typeof label === 'function' ? label : body) as (frame: Frame) => void;
            const out: RenderPassRecord[] = [];
            recording = true;
            try {
                fn(frameFor(out));
            } finally {
                recording = false;
            }
            passes = out;
        }),
        readback: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
        submit: vi.fn(),
        initialize: vi.fn(() => Promise.resolve()),
        reconfigureCanvas: vi.fn(),
        requestRecover: vi.fn(() => Promise.resolve()),
        onDeviceLost: vi.fn(() => () => undefined),
        shutdown: vi.fn(),
        withErrorScope: vi.fn(<T>(_f: unknown, body: () => T) => Promise.resolve(body())),
        memoryUsage: vi.fn(() => ({ bufferBytes: 0, textureBytes: 0, totalBytes: 0, top: [] })),
        canvasFormat: 'bgra8unorm',
        canvasOutput: { format: 'bgra8unorm', toneMapping: 'standard' },
        canvasOptions: {},
        profiler: { isSupported: false, timestampWritesFor: () => undefined },
        setFrameProfiling: vi.fn(),
        lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
        capabilities: vi.fn(() => ({
            ...defaultCapabilities(),
            features: [...(options.features ?? [])],
        })),
        canvasSize: vi.fn(() => ({ width: 800, height: 600 })),
        framesInFlight: vi.fn(() => 0),
        onFrameRetired: vi.fn(() => () => undefined),
    } as unknown as EngineCore;

    const scene = createScene({ core });
    await scene.initialize();
    for (const resolver of ELEMENT_CONSUMERS) scene.consumers.registerDefault(resolver);
    for (const resolver of WATER_CONSUMERS) scene.consumers.registerDefault(resolver);
    let frame = 0;
    return {
        scene,
        core,
        step() {
            frame++;
            const dt = 1 / 60;
            scene.time.advance(dt);
            passes = [];
            computes = [];
            scene.events.emit('frameTick', { dt, realDt: dt, elapsed: scene.time.elapsed, frame });
            return passes;
        },
        draws: (label) =>
            passes.filter((p) => label === undefined || p.label === label).flatMap((p) => p.draws),
        computes: () => computes,
        creates: () => creates,
        writes: () => writes,
        destroys: () => destroys,
        createdWhileRecording: () => createdWhileRecording,
        resetCounts() {
            creates = [];
            writes = [];
            destroys = [];
            createdWhileRecording = 0;
        },
    };
}

/** Estágios de apresentação que um teste registra (sempre com o `TransformFlow`, que produz o `WorldTransform`). */
export interface StageOptions {
    readonly shadow?: boolean;
    /**
     * Render principal; `'scene'` desenha a cor nos `FrameTargets`, `'canvas'` direto no canvas (a profundidade é
     * sempre a dos `FrameTargets`, inseridos aqui).
     */
    readonly forward?: ForwardOutput;
    readonly post?: boolean;
    /** Desenho de corpos de partículas (`ParticleFlow`, depois do forward). */
    readonly particles?: boolean;
    /** Vértices das superfícies de corpos moles (`SoftSurfaceFlow`, fase `transform`). */
    readonly softSurface?: boolean;
    /**
     * Estágios da água (spec 017): superfície vista pela luz e cáusticas (fase `shadow`), superfície vista pela câmera
     * e composição (fase `forward`), com o `WaterSurface` da cena.
     */
    readonly water?: boolean;
}

/** Registra os estágios pedidos por factory, como `registerPresentationDefaults`, e devolve as instâncias. */
export function registerStages(
    scene: SceneContext,
    options: StageOptions,
): {
    forward: ForwardFlow | undefined;
    shadow: ShadowFlow | undefined;
    post: PostFlow | undefined;
    frameTargets: FrameTargets | undefined;
} {
    scene.flows.register((ctx) => new TransformFlow(ctx), {
        type: 'transform',
        phase: 'transform',
    });
    scene.flows.register((ctx) => new CameraFlow(ctx), {
        type: 'camera',
        phase: 'transform',
        priority: -10,
    });
    if (options.shadow === true)
        scene.flows.register((ctx) => new ShadowMatrixFlow(ctx), {
            type: 'shadowMatrix',
            phase: 'transform',
            priority: -20,
        });
    const shadow =
        options.shadow === true
            ? scene.flows.register((ctx) => new ShadowFlow(ctx), {
                  type: 'shadow',
                  phase: 'shadow',
              }).flow
            : undefined;
    const output = options.forward;
    const frameTargets =
        output !== undefined
        || options.post === true
        || options.particles === true
        || options.water === true
            ? new FrameTargets()
            : undefined;
    if (frameTargets !== undefined) scene.world.insert(frameTargets);
    // Tabelas do sombreamento físico (spec 011): o fechamento as lê em todo desenho iluminado.
    if (frameTargets !== undefined) scene.world.insert(new PbrTables());
    const forward =
        output === undefined
            ? undefined
            : scene.flows.register((ctx) => new ForwardFlow(ctx, { output }), {
                  type: 'forward',
                  phase: 'forward',
              }).flow;
    if (options.softSurface === true)
        scene.flows.register((ctx) => new SoftSurfaceFlow(ctx), {
            type: 'softSurface',
            phase: 'transform',
            priority: -30,
        });
    if (options.particles === true)
        scene.flows.register((ctx) => new ParticleFlow(ctx), {
            type: 'particles',
            phase: 'forward',
            priority: -50,
        });
    if (options.water === true) {
        scene.world.insert(new WaterSurface());
        scene.world.insert(new FluidField());
        scene.flows.register((ctx) => new FluidFieldFlow(ctx), {
            type: 'fluidField',
            phase: 'transform',
            priority: -50,
        });
        scene.flows.register((ctx) => new FluidFieldPassFlow(ctx, { view: 'light' }), {
            type: 'fluidLightSurface',
            phase: 'shadow',
            priority: -10,
        });
        scene.flows.register((ctx) => new CausticsFlow(ctx), {
            type: 'caustics',
            phase: 'shadow',
            priority: -20,
        });
        scene.flows.register((ctx) => new FluidFieldPassFlow(ctx, { view: 'camera' }), {
            type: 'fluidSurface',
            phase: 'forward',
            priority: -60,
        });
        scene.flows.register((ctx) => new WaterFlow(ctx), {
            type: 'water',
            phase: 'forward',
            priority: -70,
        });
    }
    const post =
        options.post === true
            ? scene.flows.register((ctx) => new PostFlow(ctx), { type: 'post', phase: 'post' }).flow
            : undefined;
    return { forward, shadow, post, frameTargets };
}
