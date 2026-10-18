import type { EntityId } from '../../scene/world/EntityId';
import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    IndexBufferSpec,
    IndirectBufferSpec,
    RenderPass,
    RenderTarget,
    SamplerSpec,
    StorageBufferSpec,
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type {
    BindingKey,
    BindingSource,
    BoundFlow,
    PreparedRender,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
import { sameBindGroup } from '../../scene/flows/FlowBinding';
import { ExtensionPipelines, type PipelineVariant } from '../../scene/flows/ExtensionPipelines';
import type { BindGroupSpec } from '../../scene/contracts/gpu';
import { BINDING_FREQUENCIES, type WgslResource } from '../../scene/shaders/WgslResource';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import {
    slot,
    type EntitiesSlot,
    type EntityEntry,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TargetSlot,
} from '../../scene/flows/slots';
import type { World } from '../../scene/world/World';
import { Geometry } from '../../elements/geometry/Geometry';
import { SurfaceDiffSchema } from '../../elements/geometry/SurfaceSchemas';
import { Material } from '../../elements/material/Material';
import { ForwardFrameParamsSchema } from '../../elements/material/forwardSchemas';
import {
    forwardFrameResource,
    pointVerticesResource,
    surfaceDiffReadResource,
    wireEdgesResource,
    wireVerticesResource,
} from '../../elements/material/renderResources';
import { Camera } from '../../elements/scene/Camera';
import { Transform } from '../../elements/scene/Transform';
import { renderableRecord, RenderInstanceSchema } from '../../elements/scene/Renderable';
import { FrameTargets } from '../app/FrameTargets';
import { bindPoints } from '../../scene/shaders/bindPoints';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import { Time } from '../../scene/time/Time';
import { CameraFunction } from '../../elements/extension/CameraFunction';
import {
    forwardBackground,
    forwardCameraAdapter,
    forwardCameraClip,
    forwardTransmission,
    transmissionResources,
} from '../../elements/material/shaders';
import { LOBES } from '../../elements/material/pbr/lobes';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../scene/flows/createComputeKernel';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { SCENE_COLOR_FORMAT } from '../app/FrameTargets';
import { sceneCopyMips, sceneMipResources } from './shaders';
import { MaterialFunction } from '../../elements/extension/MaterialFunction';
import {
    forwardMaterial,
    forwardMaterialAdapter,
    materialPoint,
} from '../../elements/material/point/shaders';

const CLEAR_COLOR: readonly [number, number, number, number] = [0.05, 0.07, 0.12, 1.0];

/** Lobos que vão ao passe de transmissivos (spec 011, R6): o que está atrás aparece através do material. */
const TRANSMISSIVE_LOBES = LOBES.transmission | LOBES.opacity | LOBES.translucent;

const VERTEX_LAYOUT = [
    {
        arrayStride: 32,
        stepMode: 'vertex' as const,
        attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' as const },
            { shaderLocation: 1, offset: 12, format: 'float32x3' as const },
            { shaderLocation: 2, offset: 24, format: 'float32x2' as const },
        ],
    },
];

/** Onde o forward desenha a cor: a cor da cena (`FrameTargets`, lida pelo pós) ou direto no canvas. */
export type ForwardOutput = 'scene' | 'canvas';

/** Slots do render principal. */
export interface ForwardSlots extends SlotMap {
    /** Câmera ativa: o seu slot em `cameras` vai nos parâmetros do quadro. */
    readonly camera: SingletonSlot<false>;
    /** Pool `CameraMatrices` (grupo 0), produzido na GPU pelo estágio de câmera. */
    readonly cameras: PoolSlot<false>;
    /** Pool `WorldTransform` (grupo 1, matriz de mundo pelo `transformSlot` do registro). */
    readonly world: PoolSlot<false>;
    /**
     * Entidades desenhadas (geometria + material + transform), com o registro `Renderable` e os grupos de instâncias
     * por (geometria, shader do material, orientação) mantidos pela C2.
     */
    readonly renderables: EntitiesSlot;
    /** Pool da geometria diferencial das superfícies (spec 010; opcional). */
    readonly diffs: PoolSlot<true>;
    /** Cor dos `FrameTargets` (com pós) ou o canvas; profundidade dos `FrameTargets`. */
    readonly target: TargetSlot;
    /** Câmeras com `CameraFunction` (projeção de ponto da câmera ativa, spec 009). */
    readonly cameraFunctions: EntitiesSlot;
    /** Relógio da cena (tempo das funções `material`; opcional). */
    readonly time: SingletonSlot<true>;
    /** Os alvos da cena (a cópia com mips e a espessura dos transmissivos, spec 011; opcional). */
    readonly targets: SingletonSlot<true>;
}

/**
 * Chave do grupo de desenho de uma entidade: geometria (chave de conteúdo — a mesma cópia na GPU), shader do material
 * (pipeline), topologia do material (spec 008) e, em triângulos, a orientação das faces (escala espelhada). Geometria
 * sem chave de conteúdo é própria da entidade.
 */
export function forwardGroupKey(entry: EntityEntry): string {
    const geometry = entry.get(Geometry).contentKey ?? `entity:${entry.entityId}`;
    const material = entry.get(Material);
    const shader = material.getPipelineDescriptors()[0]?.id ?? '';
    const topology = material.topology;
    const face = topology !== 'triangle-list' ? '-' : entry.get(Transform).mirrored ? 'cw' : 'ccw';
    // Função `material` (spec 009): outro pipeline — outro grupo, por código.
    const fn = materialFunctionOf(entry);
    const program = fn === undefined ? '' : `|${fn.module.name}`;
    return `${geometry}|${shader}|${topology}|${face}${program}`;
}

/**
 * Variante de uma função `material` sobre o pipeline base de uma entidade: as duas orientações (a `ccw` é a principal),
 * com os pipelines base a que correspondem.
 */
interface MaterialFnVariant extends PipelineVariant {
    readonly base: { readonly ccw: string; readonly cw: string };
    readonly ccw: string;
    readonly cw: string;
    /** Transmissivos (spec 011): os pipelines das faces de trás e da frente, por orientação. */
    readonly transmission?: {
        readonly back: { readonly ccw: string; readonly cw: string };
        readonly front: { readonly ccw: string; readonly cw: string };
    };
}

/** A função `material` faz da entidade um transmissivo (spec 011): lobo de transmissão, parede fina ou opacidade. */
function isTransmissive(fn: MaterialFunction | undefined): boolean {
    return fn !== undefined && (fn.lobeMask & TRANSMISSIVE_LOBES) !== 0;
}

/** Cópia da cena com mips e os kernels da redução, por textura (recriados quando ela muda). */
interface SceneCopyState {
    readonly texture: TextureSpec;
    readonly view: TextureViewSpec;
    readonly levelViews: readonly TextureViewSpec[];
    readonly storageViews: readonly TextureViewSpec[];
    readonly kernels: readonly ComputeKernel[];
    readonly sizes: readonly number[];
}

/** A `MaterialFunction` da entidade, se tem. */
function materialFunctionOf(entry: EntityEntry): MaterialFunction | undefined {
    return entry.resources.find((r): r is MaterialFunction => r instanceof MaterialFunction);
}

function slotsOf(output: ForwardOutput): ForwardSlots {
    const depth = { schema: FrameTargets.schema, descId: 'depth' };
    // Cor multiamostrada dos alvos (MSAA, spec 008): o passe desenha nela e resolve na cor.
    const samples = { schema: FrameTargets.schema, descId: 'samples' };
    return {
        camera: slot.singleton(Camera.schema),
        cameras: slot.pool(Camera.matricesSchema.name),
        world: slot.pool(Transform.worldSchema.name),
        renderables: slot.entities({
            all: [Geometry, Material, Transform],
            record: renderableRecord,
            groups: {
                schema: RenderInstanceSchema,
                key: forwardGroupKey,
                instance: 'record',
                // Do Transform, só a escala muda a chave (orientação das faces).
                rekeyOn: { [Transform.schema.name]: ['scale'] },
            },
        }),
        diffs: slot.pool(SurfaceDiffSchema.name, { optional: true }),
        target: slot.target(
            output === 'scene'
                ? { color: { schema: FrameTargets.schema, descId: 'color' }, depth, samples }
                : { color: 'canvas', depth, samples },
        ),
        cameraFunctions: slot.entities({ all: [Camera, CameraFunction] }),
        time: slot.singleton(Time.schema, { optional: true }),
        targets: slot.singleton(FrameTargets.schema, { optional: true }),
    };
}

type Ctx = TransitionContext<ForwardSlots>;

/** Opções do `ForwardFlow`. */
export interface ForwardFlowOptions {
    /** Onde desenhar a cor. Padrão `'scene'` (o pós-processamento compõe no canvas). */
    readonly output?: ForwardOutput;
    /** Compila os pipelines de material em segundo plano; objetos de um material ainda compilando não são desenhados. */
    readonly preferAsync?: boolean;
    /**
     * Passe de profundidade dos opacos antes da cor (spec 033): cada pixel é sombreado uma vez — o sombreamento caro (a
     * luz rebatida) não paga os fragmentos encobertos. `true` sempre; `false` nunca (sem os pipelines de profundidade);
     * sem valor (o padrão), o dos `FrameTargets` (`depthPrepass`, ligado pelos estágios padrão com a luz rebatida), lido
     * a cada quadro sem recompilar.
     */
    readonly depthPrepass?: boolean;
}

/**
 * ForwardFlow — o render principal: desenha as entidades com geometria, material e transform.
 *
 * Tudo vem do que a C2 já alocou, sem objeto de GPU por entidade, pelos recursos declarados dos shaders de material
 * (spec 031): as matrizes das câmeras (`frame`), o mundo, o registro `Renderable` e a lista de instâncias dos grupos
 * (`stage`), o pool do material do shader (`batch`) e, nos sprites e no arame, os vértices da geometria do pipeline
 * (`draw`). A luz, a sombra e a água chegam pelos pontos de cena dos shaders — o estágio não as conhece.
 *
 * Um desenho por grupo de instâncias (spec 007): entidades com a mesma geometria (mesmo conteúdo), o mesmo shader de
 * material e a mesma orientação de faces saem numa chamada `draw.indexed(índices, instâncias, 0, 0, início do
 * grupo)`; os grupos são mantidos pela C2 por eventos, e a gravação não percorre entidades. Os grupos 0, 1 e 3 são
 * religados só quando mudam (por frequência); pipeline e material só quando o pipeline muda. Um pipeline
 * por shader de material e orientação de faces (escala espelhada ⇒ `frontFace: 'cw'`), preparado numa transição
 * quando o material entra na cena. Recursos privados (parâmetros do quadro, substituto da geometria diferencial) são
 * religados em transições.
 */
export class ForwardFlow extends RenderFlow<ForwardSlots, 'idle'> {
    readonly type = 'ForwardFlow';
    readonly slots: ForwardSlots;
    /** Os registros de todas as formas das funções `material` (spec 031, R8). */
    override readonly listens = [materialPoint];
    override readonly bindings: ReadonlyMap<BindingKey, BindingSource>;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<ForwardSlots>>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly preferAsync: boolean;
    /** Pipelines de profundidade preparados (o passe pode valer). */
    private readonly depthPrepass: boolean;
    /** O passe sempre (`true`), ou o dos `FrameTargets` (`undefined`). */
    private readonly depthPrepassForced: boolean | undefined;
    /** Pipeline de profundidade de cada pipeline base de opaco (o mesmo vértice, sem fragmento). */
    private readonly depthPipelines = new Map<string, string>();
    private readonly frameParams: UniformBufferSpec;
    /** Substituto do pool `SurfaceDiff` (nenhuma superfície com geometria diferencial). */
    private readonly dummyDiff: StorageBufferSpec;
    /** Pool `SurfaceDiff` ligado (o real ou o substituto). */
    private boundDiff: StorageBufferSpec | undefined;
    /** Conteúdo escrito em `ForwardFrameParams` (comparado para escrever só quando muda). */
    private writtenFrame = '';
    /** Pipelines (por orientação) do shader de cada material, preparados quando o material aparece. */
    /** Pipeline do fundo preparado (formato e amostras do alvo). */
    private backgroundId: string | undefined;
    private readonly materialPipelines = new Map<
        string,
        { readonly ccw: string; readonly cw: string }
    >();
    /** Entidades cujo material ainda não tem pool (tentadas de novo em `framePrepare`). */
    private readonly pendingMaterials = new Set<EntityId>();
    /** Id do shader de cada material (pelo descritor; reconhecido uma vez por instância). */
    private readonly materialShader = new WeakMap<Material, string>();
    /**
     * O que o desenho precisa de cada material, guardado na preparação (o quadro não relê descritores): a topologia e,
     * em triângulos e faixas, os pipelines das duas orientações de face.
     */
    private readonly materialDraw = new WeakMap<
        Material,
        {
            readonly topology: GPUPrimitiveTopology;
            readonly pipelines?: { readonly ccw: string; readonly cw: string };
        }
    >();
    /**
     * Pipelines por geometria (spec 008) — sprites de vértice (`point-list`) e arame (`line-list`): um por (shader do
     * material, vertex buffer da geometria); os vértices (e as arestas do arame) são bindings privados do pipeline.
     * Contagem de entidades por pipeline (liberado com a última).
     */
    private readonly geometryPipelines = new Map<string, { readonly id: string; users: number }>();
    /** Pipeline por geometria de cada entidade que o usa (para liberar na saída). */
    private readonly geometryOfEntity = new Map<EntityId, string>();
    /** Geometrias escritas pela GPU sem escritor já avisadas. */
    private readonly warnedWriter = new WeakSet<Geometry>();
    /** Geometrias que entraram desde o último `framePrepare` (conferidas uma vez quanto ao escritor). */
    private readonly uncheckedGeometries = new Set<Geometry>();
    private geometryCounter = 0;
    /** Número de cada vertex buffer com pipeline por geometria (nome estável dos pipelines). */
    private readonly geometryKeys = new Map<AnyBufferSpec, number>();
    /**
     * Argumentos do desenho indireto dos grupos cuja geometria tem registro indireto (malha adaptativa, spec 010): o
     * `first`/`count` do grupo deste passe escritos pela CPU e a contagem copiada do registro da geometria (na GPU) antes
     * do passe. Registro 0 (indexado) e 1 (byte 20: arame, não indexado).
     */
    private readonly indirectArgs = new Map<
        string,
        { readonly args: IndirectBufferSpec; readonly source: IndirectBufferSpec }
    >();
    /** O device tem `indirect-first-instance` (sem ela, a malha adaptativa vem no nível máximo e desenha direto). */
    private indirectOn = false;
    /** Quando true, o passe grava os timestamps do profiler (`timestamp-query`); sem a feature, nada muda. */
    profileTimestamps = false;
    /** Descritor de cada pipeline de material de triângulos (base das variantes de projeção). */
    private readonly baseDescriptors = new Map<string, PipelineDescriptor>();
    /**
     * Funções `material` (spec 009): para cada entidade de triângulos com `MaterialFunction`, as variantes do pipeline
     * do material dela com o adaptador da função (as duas orientações), preparadas com conferência do compilador;
     * variantes de códigos que ninguém usa mais são liberadas. O tempo simulado vai ao quadro enquanto há função.
     */
    private syncMaterialFunctions(ctx: Ctx): void {
        if (!this.materialFnDirty) return;
        this.materialFnDirty = false;
        const present: EntityId[] = [];
        let any = false;
        for (const entry of ctx.bound.slots.renderables.entries) {
            const fn = materialFunctionOf(entry);
            if (fn === undefined) continue;
            any = true;
            const draw = this.materialDraw.get(entry.get(Material));
            if (draw?.pipelines === undefined) {
                // O pipeline do material ainda não foi preparado (pool por criar): tenta de novo no próximo quadro.
                this.materialFnDirty = true;
                continue;
            }
            present.push(entry.entityId);
            const base = draw.pipelines;
            const name = fn.module.name;
            const ccw = `${base.ccw}|material:${name}`;
            const cw = `${base.cw}|material:${name}`;
            const transmissive = isTransmissive(fn) && this.ensureTransmission(ctx);
            const transmission = transmissive
                ? {
                      back: { ccw: `${ccw}|back`, cw: `${cw}|back` },
                      front: { ccw: `${ccw}|front`, cw: `${cw}|front` },
                  }
                : undefined;
            const next: MaterialFnVariant = {
                key: `${base.ccw}|${name}${transmissive ? '|transmission' : ''}`,
                id: transmission?.front.ccw ?? ccw,
                ids: [
                    ccw,
                    cw,
                    ...(transmission === undefined
                        ? []
                        : [
                              transmission.back.ccw,
                              transmission.back.cw,
                              transmission.front.ccw,
                              transmission.front.cw,
                          ]),
                ],
                base,
                ccw,
                cw,
                ...(transmission !== undefined ? { transmission } : {}),
            };
            this.materialFns.select(entry.entityId, next, () => {
                const variant = (baseId: string, id: string): boolean => {
                    const b = this.baseDescriptors.get(baseId)!;
                    const descriptor: PipelineDescriptor = {
                        ...b,
                        id,
                        shader: bindPoints(
                            b.shader,
                            new Map([[forwardMaterial, forwardMaterialAdapter(fn.module)]]),
                        ),
                        verify: true,
                        extensions: [...(b.extensions ?? []), fn],
                        // Os lobos da função (spec 011): o avaliador só com os que o grafo ou o código usam.
                        constants: { ...b.constants, CLOSURE_LOBES: fn.lobeMask },
                    };
                    const ready = ctx.prepare(descriptor).ready;
                    // Projeção de ponto da câmera ativa também sobre a variante da função.
                    this.baseDescriptors.set(id, descriptor);
                    this.prepareVariant(ctx, descriptor);
                    return ready;
                };
                const ready = variant(base.ccw, ccw);
                variant(base.cw, cw);
                if (transmission === undefined) return ready;
                // Transmissivos: as duas camadas sobre a variante da função (o mesmo adaptador e os mesmos lobos).
                const layer = (fromId: string, id: string, side: 'back' | 'front'): boolean => {
                    const f = this.baseDescriptors.get(fromId)!;
                    return ctx.prepare({
                        ...f,
                        id,
                        shader: bindPoints(
                            ctx.bound.slots.target.sampleCount > 1
                                ? forwardTransmission.multisampled
                                : forwardTransmission.single,
                            new Map([[forwardMaterial, forwardMaterialAdapter(fn.module)]]),
                        ),
                        entryPoints: [
                            'vs_main',
                            side === 'back' ? 'fs_transmission_back' : 'fs_transmission_front',
                        ],
                        cullMode: side === 'back' ? 'front' : 'back',
                        colorTargets:
                            side === 'back'
                                ? [{ format: SCENE_COLOR_FORMAT }, { format: 'r16float' }]
                                : [{ format: SCENE_COLOR_FORMAT }],
                        // Trás: a mais distante por pixel na profundidade própria (descasque); frente: a da cena.
                        depth: {
                            format: 'depth24plus',
                            depthWriteEnabled: true,
                            depthCompare: side === 'back' ? 'greater' : 'less',
                        },
                    }).ready;
                };
                layer(ccw, transmission.back.ccw, 'back');
                layer(cw, transmission.back.cw, 'back');
                const frontReady = layer(ccw, transmission.front.ccw, 'front');
                layer(cw, transmission.front.cw, 'front');
                return ready && frontReady;
            });
        }
        this.materialFns.retain(ctx, present);
        this.usesTime = any;
    }

    /** O pipeline da função `material` da entidade para o pipeline base `id`, se pronto. */
    private materialFnPipelineOf(
        bound: BoundFlow<ForwardSlots>,
        entry: EntityEntry,
        id: string,
    ): string | undefined {
        if (materialFunctionOf(entry) === undefined) return undefined;
        const v = this.materialFns.active(entry.entityId);
        if (v === undefined) return undefined;
        const fnId = id === v.base.cw ? v.cw : id === v.base.ccw ? v.ccw : undefined;
        if (fnId === undefined) return undefined;
        const prepared = bound.pipelines.get(fnId);
        return prepared?.role === 'render' && prepared.ready ? fnId : undefined;
    }

    /**
     * Projeção de ponto da câmera ativa (spec 009): a função, o módulo dela e a variante de cada pipeline de material
     * (base → variante). Variante ainda compilando ou rejeitada: o desenho usa a base (projeção linear).
     */
    private projection:
        | {
              readonly fn: CameraFunction;
              readonly module: WgslModule;
              readonly variants: Map<string, string>;
              rejected: boolean;
          }
        | undefined;
    /** Slot do registro da função da câmera ativa (0 sem função). */
    private cameraFnSlot = 0;
    /** Há função `material` na cena: o tempo simulado vai aos parâmetros do quadro. */
    private usesTime = false;
    /**
     * Pipelines das funções `material` (spec 009), por entidade: as duas orientações do pipeline base com o adaptador
     * da função (compartilhadas por (pipeline base, código)), ativas ao compilar; até a primeira compilar, a entidade
     * desenha com a base (as constantes do material). Ao liberar uma variante, sai também a projeção sobre ela.
     */
    private readonly materialFns = new ExtensionPipelines<EntityId, MaterialFnVariant>(
        (id, ctx) => {
            const projected = this.projection?.variants.get(id);
            if (projected !== undefined) {
                ctx.release(projected);
                this.projection?.variants.delete(id);
            }
            this.baseDescriptors.delete(id);
        },
    );
    /** As funções `material` (conjunto ou código) mudaram desde a última sincronização. */
    private materialFnDirty = true;
    /** Amostrador linear com mips da cópia da cena (transmissivos, spec 011). */
    private copySampler: SamplerSpec | undefined;
    /** Cópia da cena com mips e os kernels da redução. */
    private sceneCopy: SceneCopyState | undefined;
    /** Views ligadas às variáveis dos transmissivos (religadas quando mudam). */
    private transmissionBound: readonly unknown[] = [];

    constructor(ctx: FlowContext, options: ForwardFlowOptions = {}) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        this.preferAsync = options.preferAsync === true;
        this.depthPrepass = options.depthPrepass !== false;
        this.depthPrepassForced = options.depthPrepass;
        this.slots = slotsOf(options.output ?? 'scene');
        this.frameParams = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'forward_frame_params',
            byteSize: ForwardFrameParamsSchema.stride,
        });
        this.dummyDiff = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'forward_surface_diff_dummy',
            byteSize: SurfaceDiffSchema.stride,
        });
        this.bindings = new Map<BindingKey, BindingSource>([
            [forwardFrameResource, this.frameParams],
            [surfaceDiffReadResource, this.dummyDiff],
        ]);
        const diffs = {
            to: 'idle' as const,
            run: (_e: unknown, c: Ctx) => {
                this.bindDiff(c);
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.bindDiff(c);
                        this.prepareMaterials(c);
                    },
                },
                slotChanged: diffs,
                poolReallocated: diffs,
                entitiesChanged: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type !== 'entitiesChanged') return;
                        for (const id of e.removed) this.pendingMaterials.delete(id);
                        this.releaseGeometryPipelines(c, e.removed);
                        this.prepareMaterials(c, e.added);
                        this.materialFnDirty = true;
                    },
                },
                resourceReady: 'ignore',
                // Registro de uma função `material`: valores (nada a fazer) ou código novo (revisão).
                poolWritten: {
                    to: 'idle',
                    run: () => {
                        this.materialFnDirty = true;
                    },
                },
                slotLost: 'ignore',
                // Variante de função `material` compilada: passa a valer.
                pipelinesCompiled: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type === 'pipelinesCompiled' && e.pipeline !== undefined)
                            this.materialFns.compiled(e.pipeline, c);
                    },
                },
                // Variante de função `material` rejeitada: a entidade segue com a anterior (ou a base). Variante de
                // projeção rejeitada: o desenho segue com a projeção linear (a cena já anunciou).
                pipelineRejected: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type !== 'pipelineRejected') return;
                        this.materialFns.rejected(e.pipeline, c);
                        if (this.projection === undefined) return;
                        if ([...this.projection.variants.values()].includes(e.pipeline))
                            this.projection.rejected = true;
                    },
                },
                bindGroupReplaced: 'ignore',
                canvasReconfigured: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        if (this.pendingMaterials.size > 0)
                            this.prepareMaterials(c, [...this.pendingMaterials]);
                        this.checkWriters();
                        this.syncMaterialFunctions(c);
                        this.syncSceneCopy(c);
                        this.syncProjection(c);
                        this.prepareBackground(c);
                        this.prepareIndirect(c);
                        this.writeFrameParams(c);
                    },
                },
            },
        };
    }

    /**
     * Grava o passe principal: um desenho por grupo de instâncias; grupos de bind compartilhados uma vez; pipeline e
     * grupo do material só quando o pipeline muda. Com transmissivos (spec 011), eles saem do passe principal e vão a
     * duas camadas depois dele: a cor resolvida é copiada para a cópia com mips, as faces de trás desenham (com a
     * distância delas), a cópia é refeita e as faces da frente desenham sobre ela.
     */
    dispatch(frame: Frame, bound: BoundFlow<ForwardSlots>): void {
        const target = bound.slots.target;
        const color = this.colorAttachment(frame, target, {
            loadOp: 'clear',
            clearValue: CLEAR_COLOR,
        });
        if (color === undefined || target.depth === undefined) return;
        const tsWrites = this.profileTimestamps
            ? this.core.profiler.timestampWritesFor(0, 1)
            : undefined;
        const renderTarget: RenderTarget = {
            colorAttachments: [color],
            depthStencilAttachment: {
                view: target.depth,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
            ...(tsWrites !== undefined ? { timestampWrites: tsWrites } : {}),
        };
        const groups = bound.slots.renderables.groups;
        // Contagens da malha adaptativa (produzidas na GPU) nos argumentos deste passe.
        for (const { args, source } of this.indirectArgs.values()) {
            frame.copy(source, args, 4, 0, 0);
            frame.copy(source, args, 4, 20, 20);
        }
        const transmissive = groups.filter(
            (g) => this.transmissionOf(g.representative) !== undefined,
        );
        const opaque =
            transmissive.length === 0 ? groups : groups.filter((g) => !transmissive.includes(g));
        frame.render(renderTarget, 'ForwardFlow', (pass) => {
            // A profundidade dos opacos primeiro (só o vértice); a cor depois, um fragmento por pixel.
            if (this.prepassActive(bound))
                this.recordGroups(pass, bound, opaque, (_entry, id) => this.depthPipelines.get(id));
            this.recordGroups(
                pass,
                bound,
                opaque,
                (entry, id) => this.materialFnPipelineOf(bound, entry, id) ?? id,
            );
            this.recordBackground(pass, bound);
        });
        if (transmissive.length > 0) this.recordTransmission(frame, bound, transmissive);
    }

    /** O passe de profundidade vale neste quadro: forçado pela opção ou ligado nos `FrameTargets`. */
    private prepassActive(bound: BoundFlow<ForwardSlots>): boolean {
        if (!this.depthPrepass) return false;
        if (this.depthPrepassForced === true) return true;
        const targets = bound.slots.targets?.resource as FrameTargets | undefined;
        return targets?.data.depthPrepass === 1;
    }

    /**
     * Prepara o pipeline do fundo (spec 033) para o formato e as amostras do alvo: triângulo no plano distante, depois
     * dos opacos, profundidade `less-equal` sem escrita. O ponto `scene_background` decide a cor; preparado de novo se o
     * alvo muda.
     */
    private prepareBackground(ctx: Ctx): void {
        const format = ctx.bound.slots.target.format ?? this.core.canvasFormat;
        const samples = ctx.bound.slots.target.sampleCount;
        const id = `forward:background:${format}:${samples}`;
        if (this.backgroundId === id) return;
        if (this.backgroundId !== undefined) ctx.release(this.backgroundId);
        ctx.prepare({
            id,
            role: 'render',
            shader: forwardBackground,
            entryPoints: ['vs_background', 'fs_background'],
            topology: 'triangle-list',
            cullMode: 'none',
            colorTargets: [{ format }],
            depth: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' },
            multisample: { count: samples },
        });
        this.backgroundId = id;
    }

    /** Desenha o fundo no passe principal quando algum Resource contribui ao ponto `scene_background`. */
    private recordBackground(pass: RenderPass, bound: BoundFlow<ForwardSlots>): void {
        const id = this.backgroundId;
        if (id === undefined) return;
        const p = bound.pipelines.get(id);
        // Sem contribuinte o shader é o do pronto: nada a desenhar (fica a cor da limpeza).
        if (p?.role !== 'render' || !p.ready || p.descriptor.shader === forwardBackground) return;
        pass.bind.setPipeline(p.spec);
        p.bindTo(pass.bind);
        pass.draw.vertices(3);
    }

    /** Pipelines de transmissivo da entidade (as duas camadas), se a função dela os tem e estão prontos. */
    private transmissionOf(entry: EntityEntry):
        | {
              readonly back: { ccw: string; cw: string };
              readonly front: { ccw: string; cw: string };
          }
        | undefined {
        if (!isTransmissive(materialFunctionOf(entry))) return undefined;
        return this.materialFns.active(entry.entityId)?.transmission;
    }

    /**
     * As duas camadas dos transmissivos (spec 011, R6). Sem a cópia da cena ou com os pipelines compilando, os
     * transmissivos esperam (não desenham pela metade).
     */
    private recordTransmission(
        frame: Frame,
        bound: BoundFlow<ForwardSlots>,
        groups: BoundFlow<ForwardSlots>['slots']['renderables']['groups'],
    ): void {
        const target = bound.slots.target;
        const targets = bound.slots.targets?.resource;
        const colorView = this.colorView(frame, target);
        if (targets === undefined || colorView === undefined || target.depth === undefined) return;
        const colorTexture = colorView.source;
        const depthResolved = this.resources.textureViewOf(targets, 'transmissionDepth');
        const depthSamples = this.resources.textureViewOf(targets, 'transmissionSamples');
        const backZ = this.resources.textureViewOf(targets, 'transmissionZ');
        if (this.sceneCopy === undefined || depthResolved === undefined || backZ === undefined)
            return;
        const color = this.colorAttachment(frame, target, { loadOp: 'load' })!;
        const distance =
            target.samples !== undefined && depthSamples !== undefined
                ? { view: depthSamples, resolveTarget: depthResolved }
                : { view: depthResolved };
        const depth = {
            view: target.depth,
            depthLoadOp: 'load' as const,
            depthStoreOp: 'store' as const,
        };
        const pick =
            (side: 'back' | 'front') =>
            (entry: EntityEntry, id: string): string | undefined => {
                const t = this.transmissionOf(entry);
                if (t === undefined) return undefined;
                const v = this.materialFns.active(entry.entityId)!;
                return id === v.base.cw ? t[side].cw : t[side].ccw;
            };
        this.recordSceneCopy(frame, colorTexture);
        frame.render(
            {
                colorAttachments: [
                    color,
                    { ...distance, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' },
                ],
                // Profundidade própria limpa em 0: o teste `greater` guarda a face de trás mais distante.
                depthStencilAttachment: {
                    view: backZ,
                    depthClearValue: 0,
                    depthLoadOp: 'clear',
                    depthStoreOp: 'store',
                },
            },
            'ForwardFlow.transmissionBack',
            (pass) => {
                this.recordGroups(pass, bound, groups, pick('back'));
            },
        );
        this.recordSceneCopy(frame, colorTexture);
        frame.render(
            { colorAttachments: [color], depthStencilAttachment: depth },
            'ForwardFlow.transmissionFront',
            (pass) => {
                this.recordGroups(pass, bound, groups, pick('front'));
            },
        );
    }

    /**
     * Um desenho por grupo de instâncias, com o pipeline escolhido por `pipelineFor` a partir do pipeline base do grupo
     * (`undefined`: o grupo não desenha neste passe); bind groups religados só quando mudam.
     */
    private recordGroups(
        pass: RenderPass,
        bound: BoundFlow<ForwardSlots>,
        groups: BoundFlow<ForwardSlots>['slots']['renderables']['groups'],
        pipelineFor: (entry: EntityEntry, baseId: string) => string | undefined,
    ): void {
        let current: PreparedRender | undefined;
        // Bind group atual de cada índice: só o que muda é religado ao trocar de pipeline (spec 031).
        const boundGroups: (BindGroupSpec | undefined)[] = [];
        for (const group of groups) {
            const entry = group.representative;
            const draw = this.materialDraw.get(entry.get(Material));
            if (draw === undefined) continue;
            const topology = draw.topology;
            const id =
                draw.pipelines !== undefined
                    ? entry.get(Transform).mirrored
                        ? draw.pipelines.cw
                        : draw.pipelines.ccw
                    : this.geometryPipelineOf(entry);
            if (id === undefined) continue;
            const chosen = pipelineFor(entry, id);
            if (chosen === undefined) continue;
            const prepared = this.projected(bound, chosen) ?? bound.pipelines.get(chosen);
            if (prepared?.role !== 'render' || !prepared.ready) continue; // compilando em segundo plano
            // A geometria do grupo é a mesma cópia para todos os membros (mesma chave de conteúdo).
            const geometry = entry.get(Geometry);
            const vertices = this.resources.bufferOf(geometry, 'vertices');
            if (vertices?.subkind !== 'vertex') continue;
            const edges =
                topology === 'line-list'
                    ? this.resources.bufferOf(geometry, 'wireEdges')
                    : undefined;
            if (topology === 'line-list' && edges?.subkind !== 'index') continue;
            if (prepared !== current) {
                pass.bind.setPipeline(prepared.spec);
                for (const frequency of BINDING_FREQUENCIES) {
                    for (const g of prepared.groupsOf(frequency)) {
                        if (sameBindGroup(boundGroups[g.index], g.spec)) continue;
                        pass.bind.setBindGroup(g.index, g.spec);
                        boundGroups[g.index] = g.spec;
                    }
                }
                current = prepared;
            }
            if (topology === 'point-list') {
                // Um quad (6 vértices) por vértice da geometria, lida como storage pelo shader.
                pass.draw.vertices(6 * geometry.vertexCount, group.count, 0, group.first);
                continue;
            }
            const indirect = this.indirectArgs.get(group.key)?.args;
            if (edges?.subkind === 'index') {
                // Arame: um quad (6 vértices) por aresta da geometria (`wireEdges`, aos pares).
                if (indirect !== undefined) pass.draw.indirect(indirect, 20);
                else pass.draw.vertices(6 * (edges.count >> 1), group.count, 0, group.first);
                continue;
            }
            pass.geometry.vertex(0, vertices);
            const indices = this.resources.bufferOf(geometry, 'indices');
            if (indices?.subkind === 'index') {
                pass.geometry.index(indices);
                if (indirect !== undefined) pass.draw.indexedIndirect(indirect, 0);
                else pass.draw.indexed(indices.count, group.count, 0, 0, group.first);
            } else {
                // Geometria sem índices (ex.: escrita por um estágio): desenho direto pela contagem de vértices.
                pass.draw.vertices(geometry.vertexCount, group.count, 0, group.first);
            }
        }
    }

    /**
     * Argumentos indiretos dos grupos com registro indireto na geometria (malha adaptativa, spec 010), com o `first` e o
     * `count` do grupo neste passe; os de grupos que sumiram são liberados. Sem `indirect-first-instance`, nenhum (o
     * desenho direto pela capacidade, que a superfície preenche no nível máximo).
     */
    private prepareIndirect(ctx: Ctx): void {
        this.indirectOn = this.core.capabilities().features.includes('indirect-first-instance');
        const used = new Set<string>();
        if (this.indirectOn)
            for (const group of ctx.bound.slots.renderables.groups) {
                const source = this.resources.bufferOf(
                    group.representative.get(Geometry),
                    'indirect',
                );
                if (source?.subkind !== 'indirect') continue;
                used.add(group.key);
                let entry = this.indirectArgs.get(group.key);
                if (entry?.source !== source) {
                    if (entry !== undefined) this.core.destroy(entry.args);
                    entry = {
                        args: this.core.create<IndirectBufferSpec>({
                            kind: 'buffer',
                            subkind: 'indirect',
                            discriminator: `forward_indirect:${group.key}:${this.indirectArgs.size}`,
                            byteSize: 40,
                        }),
                        source,
                    };
                    this.indirectArgs.set(group.key, entry);
                }
                const words = new Uint32Array([
                    0,
                    group.count,
                    0,
                    0,
                    group.first,
                    0,
                    group.count,
                    0,
                    group.first,
                    0,
                ]);
                this.core.write(entry.args, new Uint8Array(words.buffer));
            }
        for (const [key, entry] of [...this.indirectArgs]) {
            if (used.has(key)) continue;
            this.core.destroy(entry.args);
            this.indirectArgs.delete(key);
        }
    }

    /**
     * Prepara os recursos dos transmissivos (spec 011): aloca a cópia da cena com mips e a espessura nos alvos, cria o
     * amostrador e liga as três variáveis privadas — antes de preparar o primeiro pipeline de transmissivo. `false` sem
     * os alvos da cena (desenho direto no canvas: sem transmissivos).
     */
    private ensureTransmission(ctx: Ctx): boolean {
        const targets = ctx.bound.slots.targets?.resource;
        if (targets === undefined) return false;
        for (const id of ['sceneCopy', 'transmissionDepth', 'transmissionSamples', 'transmissionZ'])
            if (targets.getDescriptors().some((d) => d.id === id))
                this.resources.ensureAllocated(targets, id);
        this.copySampler ??= this.core.create<SamplerSpec>({
            kind: 'sampler',
            discriminator: 'forward_scene_copy_sampler',
            desc: {
                magFilter: 'linear',
                minFilter: 'linear',
                mipmapFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge',
            },
        });
        this.syncSceneCopy(ctx);
        return this.sceneCopy !== undefined;
    }

    /**
     * Cópia da cena com mips (spec 011): com transmissivos, views por nível e um kernel de redução por nível, refeitos
     * quando a textura muda (redimensionamento); as variáveis dos transmissivos religadas quando as views mudam.
     */
    private syncSceneCopy(ctx: Ctx): void {
        const targets = ctx.bound.slots.targets?.resource;
        if (targets === undefined || this.copySampler === undefined) return;
        const texture = this.resources.textureOf(targets, 'sceneCopy');
        const depthView = this.resources.textureViewOf(targets, 'transmissionDepth');
        if (texture === undefined || depthView === undefined) return;
        if (this.sceneCopy?.texture !== texture) {
            this.releaseSceneCopy();
            const levels = texture.mipLevelCount ?? 1;
            const view = (base: number, count: number | undefined, tag: string): TextureViewSpec =>
                this.core.create<TextureViewSpec>({
                    kind: 'textureview',
                    discriminator: `forward_scene_copy_${tag}:${texture.width}x${texture.height}`,
                    source: texture,
                    baseMipLevel: base,
                    ...(count !== undefined ? { mipLevelCount: count } : {}),
                });
            const levelViews = Array.from({ length: levels }, (_, l) => view(l, 1, `l${l}`));
            const storageViews = levelViews;
            const sampler = this.copySampler;
            const kernels = Array.from({ length: Math.max(levels - 1, 0) }, (_, k) =>
                createComputeKernel(this.core, {
                    discriminator: `forward_scene_mip_${k + 1}:${texture.width}x${texture.height}`,
                    shader: sceneCopyMips,
                    entryPoint: 'scene_copy_down',
                    bindings: new Map<WgslResource, BindingSource>([
                        [sceneMipResources.src, levelViews[k]!],
                        [sceneMipResources.dst, storageViews[k + 1]!],
                        [sceneMipResources.sampler, sampler],
                    ]),
                }),
            );
            const sizes = Array.from(
                { length: levels },
                (_, l) => Math.max(texture.width >> l, 1) * Math.max(texture.height >> l, 1),
            );
            this.sceneCopy = {
                texture,
                view: view(0, undefined, 'all'),
                levelViews,
                storageViews,
                kernels,
                sizes,
            };
        }
        const sceneDepth = ctx.bound.slots.target.depth;
        if (sceneDepth === undefined) return;
        const sources = [this.sceneCopy.view, this.copySampler, depthView, sceneDepth];
        if (sources.some((v, k) => v !== this.transmissionBound[k])) {
            ctx.bind(
                new Map<BindingKey, BindingSource>([
                    [transmissionResources.sceneCopy, this.sceneCopy.view],
                    [transmissionResources.sampler, this.copySampler],
                    [transmissionResources.depth, depthView],
                    [
                        ctx.bound.slots.target.sampleCount > 1
                            ? transmissionResources.sceneDepthMs
                            : transmissionResources.sceneDepth,
                        sceneDepth,
                    ],
                ]),
            );
            this.transmissionBound = sources;
        }
    }

    private releaseSceneCopy(): void {
        const copy = this.sceneCopy;
        if (copy === undefined) return;
        for (const k of copy.kernels) destroyComputeKernel(this.core, k);
        for (const v of copy.levelViews) this.core.destroy(v);
        this.core.destroy(copy.view);
        this.sceneCopy = undefined;
    }

    /** Copia a cor resolvida da cena para a cópia e reduz os mips (compute). */
    private recordSceneCopy(frame: Frame, color: TextureSpec): void {
        const copy = this.sceneCopy;
        if (copy === undefined) return;
        frame.copyTextureToTexture(color, copy.texture, [copy.texture.width, copy.texture.height]);
        if (copy.kernels.length === 0) return;
        frame.compute('ForwardFlow.sceneCopy', (pass) => {
            copy.kernels.forEach((kernel, k) => {
                pass.bind.setPipeline(kernel.pipeline);
                kernel.bindTo(pass.bind);
                pass.dispatch.invocations(copy.sizes[k + 1]!, WORKGROUP_SIZE.value);
            });
        });
    }

    /** Libera os recursos privados. */
    override dispose(): void {
        this.releaseSceneCopy();
        if (this.copySampler !== undefined) this.core.destroy(this.copySampler);
        for (const { args } of this.indirectArgs.values()) this.core.destroy(args);
        this.indirectArgs.clear();
        for (const spec of [this.frameParams, this.dummyDiff]) this.core.destroy(spec);
    }

    /** Pool da geometria diferencial das superfícies (ou o substituto), religado quando muda. */
    private bindDiff(ctx: Ctx): void {
        const buffer = ctx.bound.slots.diffs?.buffer ?? this.dummyDiff;
        if (buffer === this.boundDiff) return;
        this.boundDiff = buffer;
        ctx.bind(new Map([[surfaceDiffReadResource, buffer]]));
    }

    /**
     * Prepara os pipelines do shader de cada material que entrou na cena — das entidades `ids` (as adicionadas), ou de
     * todas — conforme a topologia do material (spec 008): triângulos com as duas orientações de face; pontos (sprites)
     * e linhas (arame: as arestas da geometria em quads com espessura) com um pipeline por vertex buffer de geometria.
     * Custo proporcional às entidades novas, não à cena. Material cujo pool ainda não existe fica pendente e é tentado
     * de novo em `framePrepare`.
     */
    private prepareMaterials(ctx: Ctx, ids?: readonly EntityId[]): void {
        const renderables = ctx.bound.slots.renderables;
        const entries =
            ids === undefined
                ? renderables.entries
                : ids.map((id) => renderables.entry(id)).filter((e) => e !== undefined);
        const format = ctx.bound.slots.target.format ?? this.core.canvasFormat;
        const samples = ctx.bound.slots.target.sampleCount;
        for (const entry of entries) {
            this.uncheckedGeometries.add(entry.get(Geometry));
            const material = entry.get(Material);
            const topology = material.topology;
            const perGeometry = topology === 'point-list' || topology === 'line-list';
            if (this.materialShader.has(material) && !perGeometry) {
                this.pendingMaterials.delete(entry.entityId);
                continue;
            }
            const desc = material.getPipelineDescriptors()[0];
            this.pendingMaterials.delete(entry.entityId);
            if (desc === undefined) continue; // material sem shader de forward: nunca desenhado
            const pool = this.resources.poolKeyForResource(material);
            if (pool === undefined || this.resources.poolInfo(pool) === undefined) {
                this.pendingMaterials.add(entry.entityId);
                continue;
            }
            this.materialShader.set(material, desc.id);
            if (perGeometry) {
                this.materialDraw.set(material, { topology });
                this.prepareGeometryPipeline(
                    ctx,
                    entry.entityId,
                    desc,
                    entry.get(Geometry),
                    format,
                );
                continue;
            }
            const known = this.materialPipelines.get(desc.id);
            if (known !== undefined) {
                this.materialDraw.set(material, { topology, pipelines: known });
                continue;
            }
            const variant = (frontFace: GPUFrontFace): string => {
                const descriptor: PipelineDescriptor = {
                    ...desc,
                    id: `forward:${desc.id}:${frontFace}`,
                    topology,
                    cullMode: topology === 'triangle-list' ? 'back' : 'none',
                    frontFace,
                    vertexBuffers: VERTEX_LAYOUT,
                    colorTargets: [{ format }],
                    // Depois do passe de profundidade só o fragmento visível passa (o igual); sem o passe, `less-equal`
                    // dá o mesmo que o teste comum fora dos empates exatos.
                    depth: {
                        format: 'depth24plus',
                        depthWriteEnabled: true,
                        depthCompare: this.depthPrepass ? 'less-equal' : 'less',
                    },
                    multisample: { count: samples },
                    ...(this.preferAsync ? { preferAsync: true } : {}),
                };
                ctx.prepare(descriptor);
                this.baseDescriptors.set(descriptor.id, descriptor);
                this.prepareVariant(ctx, descriptor);
                if (this.depthPrepass && topology === 'triangle-list') {
                    const depth: PipelineDescriptor = {
                        ...descriptor,
                        id: `${descriptor.id}:depth`,
                        // O fragmento vazio: o passe tem o anexo de cor, e o pipeline o declara sem escrever nele.
                        entryPoints: [
                            ...descriptor.entryPoints.filter((e) => e.startsWith('vs_')),
                            'fs_depth',
                        ],
                        colorTargets: [{ format, writeMask: 0 }],
                        depth: {
                            format: 'depth24plus',
                            depthWriteEnabled: true,
                            depthCompare: 'less',
                        },
                    };
                    ctx.prepare(depth);
                    this.depthPipelines.set(descriptor.id, depth.id);
                    this.prepareVariant(ctx, depth);
                }
                return descriptor.id;
            };
            const pipelines = { ccw: variant('ccw'), cw: variant('cw') };
            this.materialPipelines.set(desc.id, pipelines);
            this.materialDraw.set(material, { topology, pipelines });
        }
    }

    /**
     * Pipeline do material sobre a geometria da entidade (sprites ou arame): os vértices da geometria — e, no arame, as
     * arestas dela (`wireEdges`) — são bindings privados do pipeline, lidos como storage. Um por (shader, vertex
     * buffer), contado por entidade. O arame mistura por alfa (borda suavizada) sem escrever profundidade.
     */
    private prepareGeometryPipeline(
        ctx: Ctx,
        entity: EntityId,
        desc: PipelineDescriptor,
        geometry: Geometry,
        format: GPUTextureFormat,
    ): void {
        const vertices = this.resources.bufferOf(geometry, 'vertices');
        if (vertices?.subkind !== 'vertex' || this.geometryOfEntity.has(entity)) return;
        const wire = desc.topology === 'line-list';
        const samples = ctx.bound.slots.target.sampleCount;
        // As arestas do arame só são alocadas quando um material de arame as usa.
        const edges = wire ? this.resources.ensureAllocated(geometry, 'wireEdges') : undefined;
        if (wire && edges?.subkind !== 'index') {
            this.warnWithoutEdges(geometry);
            return;
        }
        const n = this.geometryKeys.get(vertices) ?? this.newGeometryKey(vertices);
        const key = `${desc.id}|${n}`;
        let pipeline = this.geometryPipelines.get(key);
        if (pipeline === undefined) {
            const id = `forward:${desc.id}:${wire ? 'wire' : 'points'}:${n}`;
            const at = (resource: WgslResource): BindingKey => ({ pipeline: id, resource });
            ctx.bind(
                new Map<BindingKey, BindingSource>(
                    wire
                        ? [
                              [at(wireVerticesResource), vertices],
                              [at(wireEdgesResource), edges! as IndexBufferSpec],
                          ]
                        : [[at(pointVerticesResource), vertices]],
                ),
            );
            ctx.prepare({
                ...desc,
                id,
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [{ format }],
                depth: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
                // Arame sem mistura: escreve profundidade como um opaco e a ordem de desenho não importa. A borda é
                // suavizada pelo MSAA; o alfa da cor vira a fração das amostras cobertas (alpha-to-coverage).
                multisample: {
                    count: samples,
                    ...(wire && samples > 1 ? { alphaToCoverageEnabled: true } : {}),
                },
                ...(this.preferAsync ? { preferAsync: true } : {}),
            });
            pipeline = { id, users: 0 };
            this.geometryPipelines.set(key, pipeline);
        }
        pipeline.users++;
        this.geometryOfEntity.set(entity, key);
    }

    /** Número estável de um vertex buffer (nome dos pipelines por geometria). */
    private newGeometryKey(vertices: AnyBufferSpec): number {
        const n = this.geometryCounter++;
        this.geometryKeys.set(vertices, n);
        return n;
    }

    /** Entidades que saíram: libera o pipeline por geometria com a última entidade que o usava. */
    private releaseGeometryPipelines(ctx: Ctx, ids: readonly EntityId[]): void {
        for (const id of ids) {
            const key = this.geometryOfEntity.get(id);
            if (key === undefined) continue;
            this.geometryOfEntity.delete(id);
            const pipeline = this.geometryPipelines.get(key)!;
            if (--pipeline.users > 0) continue;
            this.geometryPipelines.delete(key);
            ctx.release(pipeline.id);
        }
    }

    /** Pipeline por geometria (sprites e arame) da entidade. */
    private geometryPipelineOf(entry: EntityEntry): string | undefined {
        const key = this.geometryOfEntity.get(entry.entityId);
        return key === undefined ? undefined : this.geometryPipelines.get(key)?.id;
    }

    /**
     * Antes da gravação: confere uma vez as geometrias que entraram (os escritores declaram `owns` nas transições de
     * entrada, antes deste ponto) — aviso único de geometria escrita pela GPU sem escritor. Nada por quadro com a cena
     * parada.
     */
    private checkWriters(): void {
        if (this.uncheckedGeometries.size === 0) return;
        for (const geometry of this.uncheckedGeometries) this.warnWithoutWriter(geometry);
        this.uncheckedGeometries.clear();
    }

    /** Geometria com vértices escritos só pela GPU e sem escritor declarado: aviso único (desenhada com zeros). */
    private warnWithoutWriter(geometry: Geometry): void {
        if (this.warnedWriter.has(geometry)) return;
        const vertices = geometry.getDescriptors().find((d) => d.id === 'vertices');
        if (vertices?.upload !== 'never' || this.resources.hasGpuWriter(geometry, 'vertices'))
            return;
        this.warnedWriter.add(geometry);
        const id = this.world.entityIdOfResource(geometry);
        console.warn(
            `[ForwardFlow] A geometria da entidade ${id ?? '?'} tem vértices escritos só pela GPU (upload 'never') e `
                + 'nenhum estágio declara owns sobre eles: é desenhada sem conteúdo.',
        );
    }

    /** Material de arame numa geometria sem arestas (`wireEdges`): aviso único, fora do desenho. */
    private warnWithoutEdges(geometry: Geometry): void {
        if (this.warnedWriter.has(geometry)) return;
        this.warnedWriter.add(geometry);
        const id = this.world.entityIdOfResource(geometry);
        console.warn(
            `[ForwardFlow] A geometria da entidade ${id ?? '?'} não declara arestas de arame (wireEdges): o material de `
                + 'linhas não a desenha.',
        );
    }

    /**
     * Projeção de ponto da câmera ativa (spec 009): com uma `CameraFunction` que define `camera_project` na entidade
     * da câmera, prepara a variante de cada pipeline de material com o adaptador da função (e libera as da função
     * anterior); sem ela, as variantes saem e o desenho volta à `viewProjection`.
     */
    private syncProjection(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        const cameraId = this.world.entityIdOfResource(slots.camera.resource);
        const entry = cameraId === undefined ? undefined : slots.cameraFunctions.entry(cameraId);
        const fn = entry?.get(CameraFunction);
        const projecting = fn?.projects === true ? fn : undefined;
        this.cameraFnSlot =
            projecting === undefined || cameraId === undefined
                ? 0
                : (this.resources.poolSlotOf(projecting.record.name, cameraId) ?? 0);
        if (projecting?.module === this.projection?.module && projecting === this.projection?.fn)
            return;
        if (this.projection !== undefined) {
            for (const id of this.projection.variants.values()) ctx.release(id);
            this.projection = undefined;
        }
        if (projecting === undefined) return;
        this.projection = {
            fn: projecting,
            module: projecting.module,
            variants: new Map(),
            rejected: false,
        };
        for (const descriptor of this.baseDescriptors.values())
            this.prepareVariant(ctx, descriptor);
    }

    /** Variante de projeção de um pipeline de material (quando a câmera ativa projeta por função). */
    private prepareVariant(ctx: Ctx, base: PipelineDescriptor): void {
        const projection = this.projection;
        if (projection === undefined || projection.variants.has(base.id)) return;
        const id = `${base.id}|camera:${projection.module.name}`;
        ctx.prepare({
            ...base,
            id,
            shader: bindPoints(
                base.shader,
                new Map([[forwardCameraClip, forwardCameraAdapter(projection.module)]]),
            ),
            verify: true,
            extensions: [projection.fn],
        });
        projection.variants.set(base.id, id);
    }

    /** A variante de projeção pronta de `id`, se a câmera ativa projeta por função. */
    private projected(bound: BoundFlow<ForwardSlots>, id: string): PreparedRender | undefined {
        const projection = this.projection;
        if (projection === undefined || projection.rejected) return undefined;
        const variant = projection.variants.get(id);
        const prepared = variant === undefined ? undefined : bound.pipelines.get(variant);
        return prepared?.role === 'render' && prepared.ready ? prepared : undefined;
    }

    /**
     * Parâmetros do quadro: slot da câmera ativa, tamanho do alvo, slot da função de projeção e tempo — escritos só
     * quando mudam. A luz, a sombra e a água chegam pelos pontos de cena dos shaders (spec 031).
     */
    private writeFrameParams(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        const cameraId = this.world.entityIdOfResource(slots.camera.resource);
        const cameraSlot = cameraId === undefined ? 0 : (slots.cameras.slotOf(cameraId) ?? 0);
        // Tamanho do alvo em pixels: a espessura das linhas do arame é em pixels de tela.
        const { width, height } = this.core.canvasSize() ?? { width: 1, height: 1 };
        // O tempo só vai ao shader com funções `material` na cena (sem elas, nenhuma escrita por quadro).
        const time = this.usesTime
            ? ((slots.time?.resource as Time | undefined)?.simulated ?? 0)
            : 0;
        const key = `${cameraSlot}:${width}x${height}:${this.cameraFnSlot}:${time}`;
        if (key === this.writtenFrame) return;
        this.core.write(
            this.frameParams,
            ForwardFrameParamsSchema.pack({
                cameraSlot,
                cameraFnSlot: this.cameraFnSlot,
                viewport: [width, height],
                time,
            }),
        );
        this.writtenFrame = key;
    }
}
