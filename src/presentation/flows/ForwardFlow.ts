import type { EntityId } from '../../scene/world/EntityId';
import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    IndexBufferSpec,
    IndirectBufferSpec,
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
    BindingSources,
    BoundFlow,
    PreparedRender,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
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
    type TextureSlot,
} from '../../scene/flows/slots';
import type { World } from '../../scene/world/World';
import { Geometry } from '../../elements/geometry/Geometry';
import { SurfaceDiffSchema } from '../../elements/geometry/SurfaceSchemas';
import { Material } from '../../elements/material/Material';
import {
    ForwardFrameParamsSchema,
    NO_LIGHT_SLOT,
    WaterLightMatrixSchema,
} from '../../elements/material/forwardSchemas';
import { Camera } from '../../elements/scene/Camera';
import { Light } from '../../elements/scene/Light';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { Transform } from '../../elements/scene/Transform';
import { renderableRecord, RenderInstanceSchema } from '../../elements/scene/Renderable';
import { FrameTargets } from '../app/FrameTargets';
import { WaterSurface } from '../app/WaterSurface';
import { castingShadowMap } from './ShadowFlow';
import { bindPoints } from '../../scene/shaders/bindPoints';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import { Time } from '../../scene/time/Time';
import { CameraFunction } from '../../elements/extension/CameraFunction';
import { CameraFnRecordSchema } from '../../elements/scene/flows/CameraSchemas';
import { forwardCameraAdapter, forwardCameraClip } from '../../elements/material/shaders';
import { MaterialFunction } from '../../elements/extension/MaterialFunction';
import {
    forwardMaterial,
    forwardMaterialAdapter,
    MaterialFnRecordSchema,
} from '../../elements/material/point/shaders';

const CLEAR_COLOR: readonly [number, number, number, number] = [0.05, 0.07, 0.12, 1.0];

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

/** Família de layout dos pipelines do forward (grupos compartilhados no passe). */
type Family = 'forward' | 'points' | 'wire';

/** Mistura alfa do arame (borda suavizada). */
const ALPHA_BLEND = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
} as const;

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
    /** `ShadowMap` da luz que projeta sombra (opcional; sem ele, `shadowEnabled = 0`). */
    readonly caster: SingletonSlot<true>;
    /** Textura de profundidade do caster (opcional). */
    readonly shadowTexture: TextureSlot<true>;
    /** Pool `ShadowMap` (vieses pelo slot do caster; opcional). */
    readonly shadowMaps: PoolSlot<true>;
    /** Pool `ShadowMatrix` (matriz da luz pelo slot do caster, produzida na GPU; opcional). */
    readonly shadowMatrices: PoolSlot<true>;
    /** Superfície de água da cena (cáusticas da luz que projeta sombra, spec 017; opcional). */
    readonly water: SingletonSlot<true>;
    /** Pool `Light` (direção da luz que ilumina pelo `lightSlot`; opcional). */
    readonly lights: PoolSlot<true>;
    /** Pool da geometria diferencial das superfícies (spec 010; opcional). */
    readonly diffs: PoolSlot<true>;
    /** Cor dos `FrameTargets` (com pós) ou o canvas; profundidade dos `FrameTargets`. */
    readonly target: TargetSlot;
    /** Câmeras com `CameraFunction` (projeção de ponto da câmera ativa, spec 009). */
    readonly cameraFunctions: EntitiesSlot;
    /** Pool dos registros de parâmetros das `CameraFunction` (opcional). */
    readonly cameraFnRecords: PoolSlot<true>;
    /** Relógio da cena (tempo das funções `material`; opcional). */
    readonly time: SingletonSlot<true>;
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

/** A `MaterialFunction` da entidade, se tem. */
function materialFunctionOf(entry: EntityEntry): MaterialFunction | undefined {
    return entry.resources.find((r): r is MaterialFunction => r instanceof MaterialFunction);
}

function slotsOf(world: World, output: ForwardOutput): ForwardSlots {
    const select = castingShadowMap(world);
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
        caster: slot.singleton(ShadowMap.schema, { optional: true, select }),
        shadowTexture: slot.texture(ShadowMap.schema, 'depth', { optional: true, select }),
        shadowMaps: slot.pool(ShadowMap.schema.name, { optional: true }),
        shadowMatrices: slot.pool(ShadowMap.matrixSchema.name, { optional: true }),
        water: slot.singleton(WaterSurface.schema, { optional: true }),
        lights: slot.pool(Light.schema.name, { optional: true }),
        diffs: slot.pool(SurfaceDiffSchema.name, { optional: true }),
        target: slot.target(
            output === 'scene'
                ? { color: { schema: FrameTargets.schema, descId: 'color' }, depth, samples }
                : { color: 'canvas', depth, samples },
        ),
        cameraFunctions: slot.entities({ all: [Camera, CameraFunction] }),
        cameraFnRecords: slot.pool(CameraFnRecordSchema.name, { optional: true }),
        time: slot.singleton(Time.schema, { optional: true }),
    };
}

type Ctx = TransitionContext<ForwardSlots>;

/** Opções do `ForwardFlow`. */
export interface ForwardFlowOptions {
    /** Onde desenhar a cor. Padrão `'scene'` (o pós-processamento compõe no canvas). */
    readonly output?: ForwardOutput;
    /** Compila os pipelines de material em segundo plano; objetos de um material ainda compilando não são desenhados. */
    readonly preferAsync?: boolean;
}

/**
 * ForwardFlow — o render principal: desenha as entidades com geometria, material e transform.
 *
 * Tudo vem do que a C2 já alocou, sem objeto de GPU por entidade:
 *   - grupo 0: o pool `CameraMatrices` (matrizes produzidas na GPU pelo `CameraFlow`); a câmera ativa é escolhida pelo
 *     `cameraSlot` dos parâmetros do quadro;
 *   - grupo 1: o pool `WorldTransform` (produzido pelo `TransformFlow`), o pool `Renderable` — o registro de cada
 *     entidade (`transformSlot`, `materialSlot`), mantido pela C2 — e a lista de instâncias dos grupos
 *     (`RenderInstance`, slot do registro por instância);
 *   - grupo 2: o pool de storage do material do schema do pipeline, indexado pelo `materialSlot` do registro;
 *   - grupo 3: parâmetros do quadro (slots da câmera, da luz e do mapa; sombra ligada), o mapa de sombra da luz que
 *     projeta (`ShadowMap`: textura, vieses pelo pool `ShadowMap` e a matriz pelo pool `ShadowMatrix`, produzida na
 *     GPU), o sampler de comparação e o pool `Light` — a direção da luz é lida no shader pelo slot dela, sem conta
 *     na CPU;
 *   - vértices e índices: os buffers da `Geometry` alocados pela C2.
 *
 * Um desenho por grupo de instâncias (spec 007): entidades com a mesma geometria (mesmo conteúdo), o mesmo shader de
 * material e a mesma orientação de faces saem numa chamada `draw.indexed(índices, instâncias, 0, 0, início do
 * grupo)`; os grupos são mantidos pela C2 por eventos, e a gravação não percorre entidades. Os grupos 0, 1 e 3 são
 * definidos uma vez por passe; pipeline e grupo 2 só quando o pipeline muda. Um pipeline
 * por shader de material e orientação de faces (escala espelhada ⇒ `frontFace: 'cw'`), preparado numa transição
 * quando o material entra na cena. Recursos privados (parâmetros do quadro, sampler, substitutos da sombra) são
 * religados em transições.
 */
export class ForwardFlow extends RenderFlow<ForwardSlots, 'idle'> {
    readonly type = 'ForwardFlow';
    readonly slots: ForwardSlots;
    override readonly listens = [MaterialFnRecordSchema];
    override readonly bindings: BindingSources;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<ForwardSlots>>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly preferAsync: boolean;
    private readonly frameParams: UniformBufferSpec;
    private readonly sampler: SamplerSpec;
    private readonly dummyDepth: TextureSpec;
    private readonly dummyDepthView: TextureViewSpec;
    private readonly dummyShadowMaps: StorageBufferSpec;
    private readonly dummyShadowMatrices: StorageBufferSpec;
    private readonly dummyLights: StorageBufferSpec;
    /** Substituto do pool `SurfaceDiff` (nenhuma superfície com geometria diferencial). */
    private readonly dummyDiff: StorageBufferSpec;
    /** Substitutos das cáusticas (spec 017): fator 1 e "sem água" — só lidos com `causticsEnabled = 1`. */
    private readonly dummyCaustics: TextureSpec;
    private readonly dummyCausticsView: TextureViewSpec;
    private readonly dummyWaterDepth: TextureSpec;
    private readonly dummyWaterDepthView: TextureViewSpec;
    private readonly dummyLightMatrix: StorageBufferSpec;
    /** Fontes das cáusticas ligadas (as reais ou os substitutos). */
    private causticSources:
        | readonly [TextureViewSpec, TextureViewSpec, StorageBufferSpec]
        | undefined;
    private causticsEnabled = false;
    /** Conteúdo escrito em `ForwardFrameParams` (comparado para escrever só quando muda). */
    private writtenFrame = '';
    /** Pipelines (por orientação) do shader de cada material, preparados quando o material aparece. */
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
    /** Família de layout de cada pipeline: os grupos 0, 1 e 3 são religados quando a família muda no passe. */
    private readonly pipelineFamily = new Map<string, Family>();
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
        const used = new Set<string>();
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
            const key = this.materialFnKey(draw.pipelines.ccw, fn);
            used.add(key);
            if (this.materialFnPipelines.has(key)) continue;
            const variant = (baseId: string): string => {
                const base = this.baseDescriptors.get(baseId)!;
                const id = `${baseId}|material:${fn.module.name}`;
                const descriptor: PipelineDescriptor = {
                    ...base,
                    id,
                    shader: bindPoints(
                        base.shader,
                        new Map([[forwardMaterial, forwardMaterialAdapter(fn.module)]]),
                    ),
                    consumes: [...base.consumes, MaterialFnRecordSchema.name],
                    verify: true,
                    extensions: [...(base.extensions ?? []), fn],
                };
                ctx.prepare(descriptor);
                this.pipelineFamily.set(id, 'forward');
                // Projeção de ponto da câmera ativa também sobre a variante da função.
                this.baseDescriptors.set(id, descriptor);
                this.prepareVariant(ctx, descriptor);
                return id;
            };
            this.materialFnPipelines.set(key, {
                ccw: variant(draw.pipelines.ccw),
                cw: variant(draw.pipelines.cw),
            });
        }
        for (const [key, ids] of [...this.materialFnPipelines]) {
            if (used.has(key)) continue;
            for (const id of [ids.ccw, ids.cw]) {
                const projected = this.projection?.variants.get(id);
                if (projected !== undefined) {
                    ctx.release(projected);
                    this.projection?.variants.delete(id);
                }
                ctx.release(id);
                this.baseDescriptors.delete(id);
            }
            this.materialFnPipelines.delete(key);
        }
        this.usesTime = any;
    }

    private materialFnKey(baseCcw: string, fn: MaterialFunction): string {
        return `${baseCcw}|${fn.module.name}`;
    }

    /** O pipeline da função `material` da entidade para o pipeline base `id`, se pronto. */
    private materialFnPipelineOf(
        bound: BoundFlow<ForwardSlots>,
        entry: EntityEntry,
        id: string,
    ): string | undefined {
        const fn = materialFunctionOf(entry);
        if (fn === undefined) return undefined;
        const draw = this.materialDraw.get(entry.get(Material));
        if (draw?.pipelines === undefined) return undefined;
        const ids = this.materialFnPipelines.get(this.materialFnKey(draw.pipelines.ccw, fn));
        if (ids === undefined) return undefined;
        const fnId = id === draw.pipelines.cw ? ids.cw : ids.ccw;
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
     * Pipelines das funções `material` (spec 009), por (pipeline base, código): as duas orientações; até compilar, as
     * entidades com a função desenham com a base (as constantes do material).
     */
    private readonly materialFnPipelines = new Map<
        string,
        { readonly ccw: string; readonly cw: string }
    >();
    /** As funções `material` (conjunto ou código) mudaram desde a última sincronização. */
    private materialFnDirty = true;

    constructor(ctx: FlowContext, options: ForwardFlowOptions = {}) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        this.preferAsync = options.preferAsync === true;
        this.slots = slotsOf(ctx.world, options.output ?? 'scene');
        this.frameParams = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'forward_frame_params',
            byteSize: ForwardFrameParamsSchema.stride,
        });
        this.sampler = ctx.core.create<SamplerSpec>({
            kind: 'sampler',
            discriminator: 'forward_shadow_sampler',
            desc: { magFilter: 'linear', minFilter: 'linear', compare: 'less' },
        });
        this.dummyDepth = ctx.core.create<TextureSpec>({
            kind: 'texture',
            discriminator: 'forward_shadow_dummy',
            width: 1,
            height: 1,
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.dummyDepthView = ctx.core.create<TextureViewSpec>({
            kind: 'textureview',
            discriminator: 'forward_shadow_dummy_view',
            source: this.dummyDepth,
            format: 'depth32float',
        });
        this.dummyShadowMaps = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'forward_shadow_maps_dummy',
            byteSize: ShadowMap.schema.stride,
        });
        this.dummyShadowMatrices = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'forward_shadow_matrices_dummy',
            byteSize: ShadowMap.matrixSchema.stride,
        });
        this.dummyLights = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'forward_lights_dummy',
            byteSize: Light.schema.stride,
        });
        this.dummyDiff = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'forward_surface_diff_dummy',
            byteSize: SurfaceDiffSchema.stride,
        });
        const dummy = (name: string, format: GPUTextureFormat): [TextureSpec, TextureViewSpec] => {
            const texture = ctx.core.create<TextureSpec>({
                kind: 'texture',
                discriminator: `forward_${name}_dummy`,
                width: 1,
                height: 1,
                format,
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            });
            const view = ctx.core.create<TextureViewSpec>({
                kind: 'textureview',
                discriminator: `forward_${name}_dummy_view`,
                source: texture,
                format,
            });
            return [texture, view];
        };
        [this.dummyCaustics, this.dummyCausticsView] = dummy('caustics', 'rgba16float');
        [this.dummyWaterDepth, this.dummyWaterDepthView] = dummy('water_depth', 'r32float');
        this.dummyLightMatrix = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'forward_water_light_matrix_dummy',
            byteSize: WaterLightMatrixSchema.stride,
        });
        this.bindings = {
            caustic_map: this.dummyCausticsView,
            water_light_depth: this.dummyWaterDepthView,
            water_light_matrix: this.dummyLightMatrix,
            forward_frame: this.frameParams,
            shadow_sampler: this.sampler,
            shadow_map: this.dummyDepthView,
            shadow_maps: this.dummyShadowMaps,
            shadow_matrices: this.dummyShadowMatrices,
            lights: this.dummyLights,
            surface_diff: this.dummyDiff,
        };
        const shadow = {
            to: 'idle' as const,
            run: (_e: unknown, c: Ctx) => {
                this.bindShadow(c);
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.bindShadow(c);
                        this.prepareMaterials(c);
                    },
                },
                slotChanged: shadow,
                poolReallocated: shadow,
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
                pipelinesCompiled: 'ignore',
                // Variante de projeção rejeitada: o desenho segue com a projeção linear (a cena já anunciou).
                pipelineRejected: {
                    to: 'idle',
                    run: (e) => {
                        if (e.type !== 'pipelineRejected' || this.projection === undefined) return;
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
                        this.bindCaustics(c);
                        this.syncMaterialFunctions(c);
                        this.syncProjection(c);
                        this.prepareIndirect(c);
                        this.writeFrameParams(c);
                    },
                },
            },
        };
    }

    /**
     * Grava o passe principal: um desenho por grupo de instâncias; grupos de bind compartilhados uma vez; pipeline e
     * grupo do material só quando o pipeline muda.
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
        frame.render(renderTarget, 'ForwardFlow', (pass) => {
            let family: Family | undefined;
            let current: PreparedRender | undefined;
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
                const fnId = this.materialFnPipelineOf(bound, entry, id);
                const prepared =
                    this.projected(bound, fnId ?? id) ?? bound.pipelines.get(fnId ?? id);
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
                    const next = this.pipelineFamily.get(id) ?? 'forward';
                    if (next !== family) {
                        // Câmera, mundo + registros + instâncias e quadro: os mesmos para a família de layout.
                        pass.bind
                            .setBindGroup(0, prepared.groups[0]!)
                            .setBindGroup(1, prepared.groups[1]!)
                            .setBindGroup(3, prepared.groups[3]!);
                        family = next;
                    } else if (next !== 'forward') {
                        // Os vértices (e as arestas) da geometria são bindings privados (grupo 3) de cada pipeline.
                        pass.bind.setBindGroup(3, prepared.groups[3]!);
                    }
                    // Material: o pool do schema do pipeline, indexado no shader pelo registro.
                    pass.bind.setBindGroup(2, prepared.groups[2]!);
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
        });
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

    /** Libera os recursos privados. */
    override dispose(): void {
        for (const { args } of this.indirectArgs.values()) this.core.destroy(args);
        this.indirectArgs.clear();
        for (const spec of [
            this.frameParams,
            this.sampler,
            this.dummyDepthView,
            this.dummyDepth,
            this.dummyShadowMaps,
            this.dummyShadowMatrices,
            this.dummyLights,
            this.dummyDiff,
            this.dummyCausticsView,
            this.dummyCaustics,
            this.dummyWaterDepthView,
            this.dummyWaterDepth,
            this.dummyLightMatrix,
        ]) {
            this.core.destroy(spec);
        }
    }

    /**
     * Cáusticas da água (spec 017): com a superfície vista pela luz produzida, liga o mapa de cáusticas e a profundidade
     * da água na vista da luz e acende `causticsEnabled`; sem ela, os substitutos e o fator 1 exato (imagens de antes).
     */
    private bindCaustics(ctx: Ctx): void {
        const water = ctx.bound.slots.water?.resource as WaterSurface | undefined;
        const produced = water?.isProduced('light') === true;
        const caustics = produced ? this.resources.textureViewOf(water, 'caustics') : undefined;
        const depth = produced ? this.resources.textureViewOf(water, 'lightDepth') : undefined;
        const matrix = produced ? this.resources.bufferOf(water, 'lightMatrix') : undefined;
        const real =
            caustics !== undefined && depth !== undefined && matrix?.subkind === 'storage'
                ? ([caustics, depth, matrix] as const)
                : undefined;
        this.causticsEnabled = real !== undefined;
        const sources: readonly [TextureViewSpec, TextureViewSpec, StorageBufferSpec] = real ?? [
            this.dummyCausticsView,
            this.dummyWaterDepthView,
            this.dummyLightMatrix,
        ];
        if (this.causticSources?.every((b, i) => b === sources[i]) === true) return;
        this.causticSources = sources;
        ctx.bind({
            caustic_map: sources[0],
            water_light_depth: sources[1],
            water_light_matrix: sources[2],
        });
    }

    /** Mapa de sombra da luz que projeta e o pool de luzes (ou os substitutos) nos bindings do grupo 3. */
    private bindShadow(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        ctx.bind({
            shadow_map: slots.shadowTexture?.view ?? this.dummyDepthView,
            shadow_maps: slots.shadowMaps?.buffer ?? this.dummyShadowMaps,
            shadow_matrices: slots.shadowMatrices?.buffer ?? this.dummyShadowMatrices,
            lights: slots.lights?.buffer ?? this.dummyLights,
            surface_diff: slots.diffs?.buffer ?? this.dummyDiff,
        });
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
                    depth: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
                    multisample: { count: samples },
                    ...(this.preferAsync ? { preferAsync: true } : {}),
                };
                ctx.prepare(descriptor);
                this.pipelineFamily.set(descriptor.id, 'forward');
                this.baseDescriptors.set(descriptor.id, descriptor);
                this.prepareVariant(ctx, descriptor);
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
            ctx.bind(
                wire
                    ? {
                          [`${id}:wire_vertices`]: vertices,
                          [`${id}:wire_edges`]: edges! as IndexBufferSpec,
                      }
                    : { [`${id}:point_vertices`]: vertices },
            );
            ctx.prepare({
                ...desc,
                id,
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [wire ? { format, blend: ALPHA_BLEND } : { format }],
                depth: {
                    format: 'depth24plus',
                    depthWriteEnabled: !wire,
                    depthCompare: wire ? 'less-equal' : 'less',
                },
                multisample: { count: ctx.bound.slots.target.sampleCount },
                ...(this.preferAsync ? { preferAsync: true } : {}),
            });
            this.pipelineFamily.set(id, wire ? 'wire' : 'points');
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
            this.pipelineFamily.delete(pipeline.id);
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
     * Parâmetros do quadro: slot da câmera ativa e, com a luz que projeta sombra, o slot dela no pool `Light` (a
     * direção é lida no shader; sem ela, a padrão), sombra ligada e o slot do mapa — escritos só quando mudam. Nenhum
     * dado da luz é lido na CPU.
     */
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
                : (slots.cameraFnRecords?.slotOf(cameraId) ?? 0);
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
            consumes: [...base.consumes, CameraFnRecordSchema.name],
            verify: true,
            extensions: [projection.fn],
        });
        this.pipelineFamily.set(id, 'forward');
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

    private writeFrameParams(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        const caster = slots.caster?.resource;
        const lightId = caster === undefined ? undefined : this.world.entityIdOfResource(caster);
        const lightSlot = lightId === undefined ? undefined : slots.lights?.slotOf(lightId);
        const shadowSlot = lightId === undefined ? undefined : slots.shadowMaps?.slotOf(lightId);
        const on =
            lightSlot !== undefined
            && shadowSlot !== undefined
            && slots.shadowMatrices !== undefined
            && slots.shadowTexture !== undefined;
        const cameraId = this.world.entityIdOfResource(slots.camera.resource);
        const cameraSlot = cameraId === undefined ? 0 : (slots.cameras.slotOf(cameraId) ?? 0);
        const light = on ? lightSlot : NO_LIGHT_SLOT;
        const shadow = on ? shadowSlot : 0;
        // Tamanho do alvo em pixels: a espessura das linhas do arame é em pixels de tela.
        const { width, height } = this.core.canvasSize() ?? { width: 1, height: 1 };
        const caustics = this.causticsEnabled && on;
        // O tempo só vai ao shader com funções `material` na cena (sem elas, nenhuma escrita por quadro).
        const time = this.usesTime
            ? ((slots.time?.resource as Time | undefined)?.simulated ?? 0)
            : 0;
        const key = `${cameraSlot}:${light}:${shadow}:${width}x${height}:${caustics}:${this.cameraFnSlot}:${time}`;
        if (key === this.writtenFrame) return;
        this.core.write(
            this.frameParams,
            ForwardFrameParamsSchema.pack({
                cameraSlot,
                lightSlot: light,
                shadowEnabled: on ? 1 : 0,
                shadowSlot: shadow,
                viewport: [width, height],
                causticsEnabled: caustics ? 1 : 0,
                cameraFnSlot: this.cameraFnSlot,
                time,
            }),
        );
        this.writtenFrame = key;
    }
}
