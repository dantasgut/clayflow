import { vi } from 'vitest';
import type {
    BindGroupSpec,
    EngineCore,
    Frame,
    RenderPipelineSpec,
    RenderTarget,
    ResourceSpec,
} from '../../../../core/contracts/index';
import { createScene, type SceneContext } from '../../../../scene/SceneContext';
import { defaultCapabilities } from '../../../../scene/__tests__/helpers/defaultCapabilities';
import { ELEMENT_CONSUMERS } from '../../../../elements/consumers';
import { TransformFlow } from '../../../../elements/scene/flows/TransformFlow';
import { FrameTargets } from '../../../app/FrameTargets';
import { ForwardFlow, type ForwardOutput } from '../../ForwardFlow';
import { PostFlow } from '../../PostFlow';
import { ShadowFlow } from '../../ShadowFlow';

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
    readonly firstInstance: number | undefined;
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
export async function renderScene(): Promise<{
    scene: SceneContext;
    core: EngineCore;
    /** Avança um quadro e devolve os passes de render gravados nele. */
    step(): RenderPassRecord[];
    /** Desenhos do último quadro, de todos os passes (ou do passe `label`). */
    draws(label?: string): DrawCall[];
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
                        indexed: (
                            count: number,
                            _instances?: number,
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
                                firstInstance,
                            });
                            return pass.draw;
                        },
                        vertices: () => {
                            fullscreen++;
                            return pass.draw;
                        },
                    },
                    marker: () => undefined,
                };
                body(pass);
                out.push({ label, target, setBindGroups, draws, fullscreen });
            },
            compute: (_label: string, body: (pass: unknown) => void) => {
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
            copy: () => undefined,
            clear: () => undefined,
        }) as unknown as Frame;

    const core = {
        create: vi.fn(<S>(spec: S) => created(spec)),
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
        profiler: { isSupported: false, timestampWritesFor: () => undefined },
        setFrameProfiling: vi.fn(),
        lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
        capabilities: vi.fn(defaultCapabilities),
        canvasSize: vi.fn(() => ({ width: 800, height: 600 })),
        framesInFlight: vi.fn(() => 0),
    } as unknown as EngineCore;

    const scene = createScene({ core });
    await scene.initialize();
    for (const resolver of ELEMENT_CONSUMERS) scene.consumers.registerDefault(resolver);
    let frame = 0;
    return {
        scene,
        core,
        step() {
            frame++;
            const dt = 1 / 60;
            scene.time.advance(dt);
            passes = [];
            scene.events.emit('frameTick', { dt, realDt: dt, elapsed: scene.time.elapsed, frame });
            return passes;
        },
        draws: (label) =>
            passes.filter((p) => label === undefined || p.label === label).flatMap((p) => p.draws),
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
    const shadow =
        options.shadow === true
            ? scene.flows.register((ctx) => new ShadowFlow(ctx), {
                  type: 'shadow',
                  phase: 'shadow',
              }).flow
            : undefined;
    const output = options.forward;
    const frameTargets =
        output !== undefined || options.post === true ? new FrameTargets() : undefined;
    if (frameTargets !== undefined) scene.world.insert(frameTargets);
    const forward =
        output === undefined
            ? undefined
            : scene.flows.register((ctx) => new ForwardFlow(ctx, { output }), {
                  type: 'forward',
                  phase: 'forward',
              }).flow;
    const post =
        options.post === true
            ? scene.flows.register((ctx) => new PostFlow(ctx), { type: 'post', phase: 'post' }).flow
            : undefined;
    return { forward, shadow, post, frameTargets };
}
