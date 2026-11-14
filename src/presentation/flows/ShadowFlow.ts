import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    IndexBufferSpec,
    RenderTarget,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { FlowWork, type WorkContext } from '../../scene/flows/FlowWork';
import type {
    BindingKey,
    BindingSource,
    BoundFlow,
    PreparedRender,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { Flow } from '../../scene/flows/Flow';
import {
    slot,
    type ChannelSlot,
    type DrawGroup,
    type EntitiesSlot,
    type EntityEntry,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type WorkSlot,
} from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { World } from '../../scene/world/World';
import { Geometry } from '../../elements/geometry/Geometry';
import { Material } from '../../elements/material/Material';
import { PointSpriteMaterial } from '../../elements/material/PointSpriteMaterial';
import { ParticleBody } from '../../elements/physics/bodies/ParticleBody';
import { SHADOW_MAX_LEVELS, SHADOW_PAGE_STRIDE, ShadowMap } from '../../elements/scene/ShadowMap';
import { castingShadowMap } from '../../elements/scene/shadowCaster';
import { Transform } from '../../elements/scene/Transform';
import { PerStepUniforms } from '../../elements/gpu/compute/PerStepUniforms';
import { wordBuffer } from '../../elements/gpu/compute/schemas';
import { vertexBoundsResource } from '../../elements/gpu/shaders/vertexBounds';
import {
    ShadowBoundsGeometrySchema,
    ShadowGroupDrawSchema,
    ShadowInstanceSchema,
    ShadowPagesParamsSchema,
    ShadowSpriteSourceSchema,
} from './renderSchemas';
import { shadowDepth, shadowPages, shadowResources } from './shaders';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;

/** Slots do estágio de sombra. */
export interface ShadowSlots extends SlotMap {
    /** `ShadowMap` da primeira `DirectionalLight` que projeta sombra. */
    readonly caster: SingletonSlot<false>;
    /** Pool `WorldTransform` (matriz de mundo pelo slot da entidade). */
    readonly world: PoolSlot<false>;
    /** Pool `ShadowMatrix` (o referencial do quadro, produzido na GPU pelo `ShadowMatrixFlow`). */
    readonly matrices: PoolSlot<false>;
    /** Entidades desenhadas no mapa (geometria + transform), em grupos por (geometria, orientação) mantidos pela C2. */
    readonly casters: EntitiesSlot;
    /** A série dos pedidos de páginas (o quadro anterior, pelo `ShadowRequestFlow`). */
    readonly requests: ChannelSlot<false>;
    /** A série do atlas (a tabela no começo e as páginas físicas: o alvo do desenho; o quadro anterior segue no de agora). */
    readonly atlas: ChannelSlot<false>;
    /** A série dos retângulos das instâncias no plano da luz (quem se moveu). */
    readonly rects: ChannelSlot<true>;
    /** Corpos de partículas desenhados como sprites (os que projetam: `castsShadow` do material). */
    readonly sprites: EntitiesSlot;
    /** O espaço de trabalho do passe (spec 039). */
    readonly work: WorkSlot<ShadowWork>;
}

/** Reserva dos pares instância × página suja por quadro (4 MB; o que passa fica para os quadros seguintes). */
const PAIR_CAPACITY = 1 << 20;
/**
 * Páginas desenhadas por quadro, no máximo (a fila das sujas; o resto fica para os quadros seguintes). Até 256: a
 * alocação é um grupo de trabalho, uma invocação por posição.
 */
export const SHADOW_PAGE_BUDGET = 256;
/** Instâncias dinâmicas por quadro na lista que suja as páginas (além disso, todas as páginas são redesenhadas). */
const DYNAMIC_CAP = 1024;
/** Palavras da seção de estado (os contadores). */
const STATE_WORDS = 32;
/** Palavras de um registro de argumentos indiretos. */
const INDIRECT_WORDS = 5;
/**
 * Malhas grandes em aglomerados (ver `shadow_pages.wgsl`, etapa 8): a geometria indexada em `uint32` de pelo menos
 * tantos triângulos, num grupo de até `CLUSTER_MAX_INSTANCES` instâncias, é desenhada por aglomerados de
 * `CLUSTER_TRIS` triângulos — cada um só nas páginas sujas que a forma dele, vista da luz, toca — em vez da malha
 * inteira em cada página suja (o custo deixa de ser triângulos × páginas).
 */
const CLUSTER_MIN_TRIANGLES = 16384;
const CLUSTER_TRIS = 32;
const CLUSTER_MAX_INSTANCES = 16;
/** Lugares da lista de um grupo por aglomerado (`SP_CLUSTER_SLOTS`). */
const CLUSTER_SLOTS = 32;
/** Aglomerados de um grupo, no máximo (o índice do aglomerado tem 20 bits na lista). */
const CLUSTER_MAX = 1 << 20;

/**
 * Um grupo em aglomerados: o primeiro aglomerado (global), quantos, os índices da malha, o pipeline do desenho (ligado
 * aos vértices e aos índices da geometria) e se o pipeline e o kernel das caixas estão prontos.
 */
interface ClusterPlan {
    readonly first: number;
    readonly count: number;
    readonly indexCount: number;
    readonly pipeline: string;
    readonly ready: boolean;
}
/**
 * Sprites que projetam (esferas impostoras; `shadow_pages.wgsl`, etapa 9): palavras por entrada da lista dos pares
 * (sprite, página suja), entradas por ponto reservadas (os níveis que o disco alcança) e o teto da lista.
 */
const SPRITE_ENTRY_WORDS = 5;
const SPRITE_ENTRIES_PER_POINT = 8;
const SPRITE_LIST_MAX = 1 << 19;
/** A fonte sem instância (corpo de partículas). */
const SPRITE_NO_INSTANCE = 0xffffffff;

/**
 * Uma fonte de sprites que projetam: os pontos (o buffer, o primeiro registro, quantos, o passo e a posição em
 * palavras), a instância da matriz de mundo (vértices de uma geometria) ou nenhuma (partículas), se se move sozinha e o
 * raio.
 */
interface SpriteSource {
    readonly points: AnyBufferSpec;
    readonly first: number;
    readonly count: number;
    readonly strideWords: number;
    readonly posOffsetWords: number;
    readonly instance: number;
    readonly dynamic: boolean;
    readonly radius: number;
}

/** Os kernels de uma fonte de sprites (ligados aos pontos dela). */
interface SpriteKernels {
    readonly rect: string;
    readonly pairs: string;
    readonly generation: string;
}

/** Bits da palavra de grupo de cada instância (ver `shadow_pages_constants.wgsl`). */
const SKIP = 0x80000000;
const DEFORMING = 0x40000000;

const PARAMS = 'shadow_pages_params';
const SCRATCH = 'shadow_pages_scratch';
const GROUPS = 'shadow_pages_groups';
const ARGS = 'shadow_pages_args';
const PAIRS = 'shadow_pages_pairs';
const SPRITES = 'shadow_pages_sprites';
const RECTS = 'rects';
/**
 * O anexo do desenho das páginas (T060h): o passe de desenho do WebGPU pede um; a escrita dele fica desligada (a
 * profundidade vai ao atlas em buffer). Do tamanho de uma página com a borda.
 */
const RASTER = 'shadow_raster';

/** Capacidades do trabalho (crescem por dobra). */
interface Capacity {
    groups: number;
    instances: number;
    /** Aglomerados das malhas grandes e as palavras das listas deles. */
    clusters: number;
    clusterList: number;
    /** Fontes de sprites (lugares na série dos retângulos) e entradas da lista dos pares deles. */
    sprites: number;
    spriteList: number;
    /** Páginas por nível e por lado do atlas do mapa que projeta. */
    pagesPerLevel: number;
    atlasPages: number;
}

/** Seções do `sp_scratch` (em palavras) para as capacidades. */
function layoutOf(c: Capacity): {
    keepBase: number;
    freeBase: number;
    workBase: number;
    dirtyBase: number;
    dynamicBase: number;
    boundsBase: number;
    rectsBase: number;
    groupPairsBase: number;
    needBase: number;
    clusterBoundsBase: number;
    clusterListBase: number;
    words: number;
} {
    const physical = c.atlasPages * c.atlasPages;
    const keepBase = STATE_WORDS;
    const freeBase = keepBase + physical;
    const workBase = freeBase + physical;
    const dirtyBase = workBase + SHADOW_MAX_LEVELS * c.pagesPerLevel * c.pagesPerLevel * 2;
    const dynamicBase = dirtyBase + SHADOW_PAGE_BUDGET * 4;
    const boundsBase = dynamicBase + DYNAMIC_CAP * 4;
    const rectsBase = boundsBase + c.groups * 6;
    const groupPairsBase = rectsBase + c.instances * 4;
    const needBase = groupPairsBase + c.groups * 4;
    const clusterBoundsBase = needBase + SHADOW_MAX_LEVELS * c.pagesPerLevel * c.pagesPerLevel;
    const clusterListBase = clusterBoundsBase + c.clusters * 6;
    return {
        keepBase,
        freeBase,
        workBase,
        dirtyBase,
        dynamicBase,
        boundsBase,
        rectsBase,
        groupPairsBase,
        needBase,
        clusterBoundsBase,
        clusterListBase,
        words: clusterListBase + c.clusterList,
    };
}

/**
 * Resource de trabalho do `ShadowFlow` (spec 039): os parâmetros do quadro, o espaço de trabalho das páginas, os grupos,
 * os argumentos indiretos (um registro por grupo e o do fundo das páginas sujas), os pares e a série dos retângulos das
 * instâncias.
 */
class ShadowWork extends FlowWork {
    static readonly schema = new StructSchema('ShadowWork', {});
    capacity: Capacity = {
        groups: 1,
        instances: 1,
        clusters: 1,
        clusterList: 1,
        sprites: 1,
        spriteList: 1,
        pagesPerLevel: 4,
        atlasPages: 16,
    };

    constructor() {
        super();
        this.use({
            descriptors: (): readonly GPUDescriptor[] => {
                const c = this.capacity;
                return [
                    {
                        id: PARAMS,
                        role: 'uniform',
                        schema: ShadowPagesParamsSchema,
                        upload: 'never',
                    },
                    wordBuffer(SCRATCH, layoutOf(c).words * 4),
                    wordBuffer(GROUPS, (c.groups * 4 + c.instances) * 4),
                    // Um registro por grupo e o dos sprites (o último).
                    wordBuffer(ARGS, (c.groups + 1) * INDIRECT_WORDS * 4, 'indirect'),
                    wordBuffer(PAIRS, PAIR_CAPACITY * 4),
                    wordBuffer(SPRITES, c.spriteList * SPRITE_ENTRY_WORDS * 4),
                    // Os retângulos das instâncias e depois os das fontes de sprites (um `vec4f` cada), série de duas
                    // fatias: os de agora e os de antes.
                    { ...wordBuffer(RECTS, (c.instances + c.sprites) * 16), history: { depth: 2 } },
                    {
                        id: RASTER,
                        role: 'texture',
                        textureShape: {
                            format: 'r8unorm',
                            width: SHADOW_PAGE_STRIDE,
                            height: SHADOW_PAGE_STRIDE,
                        },
                    },
                ];
            },
        });
    }
}

/** Prefixo da chave dos grupos que não projetam sombra (material com `castsShadow` falso): não desenhados. */
const NO_SHADOW = 'no-shadow|';
/**
 * Prefixo da chave dos grupos desenhados como sprites que projetam (`PointSpriteMaterial` com `castsShadow`): fora do
 * desenho dos triângulos; cada instância é uma fonte de sprites (os vértices da geometria).
 */
const SPRITE_SHADOW = 'sprites|';

/** O grupo desenha triângulos no mapa (nem sem sombra, nem sprites)? */
function drawsTriangles(key: string): boolean {
    return !key.startsWith(NO_SHADOW) && !key.startsWith(SPRITE_SHADOW);
}

/**
 * Chave do grupo de profundidade: geometria (chave de conteúdo) e orientação das faces — `two` para o material de dois
 * lados (as duas faces projetam sombra; T061a). A entidade cujo material não projeta sombra (spec 008: linhas e
 * sprites, salvo opção do material) vai para um grupo `no-shadow`, não desenhado; sem material, projeta.
 */
export function shadowGroupKey(entry: EntityEntry, world: World): string {
    const geometry = entry.get(Geometry).contentKey ?? `entity:${entry.entityId}`;
    const material = world.resourcesOf(entry.entityId).find((r) => r instanceof Material) as
        | Material
        | undefined;
    const casts = material === undefined || material.castsShadow;
    const faces =
        material?.doubleSided === true ? 'two' : entry.get(Transform).mirrored ? 'cw' : 'ccw';
    // Os vértices como sprites que projetam: o raio na chave (as instâncias de um grupo dividem o raio).
    if (casts && material instanceof PointSpriteMaterial)
        return `${SPRITE_SHADOW}${material.data.radius}|${geometry}|${faces}`;
    return `${casts ? '' : NO_SHADOW}${geometry}|${faces}`;
}

function slotsOf(world: World, work: ShadowWork): ShadowSlots {
    const select = castingShadowMap(world);
    return {
        work: slot.work(() => work),
        caster: slot.singleton(ShadowMap.schema, { select }),
        world: slot.pool(Transform.worldSchema.name),
        matrices: slot.pool(ShadowMap.matrixSchema.name),
        casters: slot.entities({
            all: [Geometry, Transform],
            groups: {
                schema: ShadowInstanceSchema,
                key: (entry) => shadowGroupKey(entry, world),
                instance: [Transform, 'world'],
                rekeyOn: { [Transform.schema.name]: ['scale'] },
            },
        }),
        requests: slot.channel(ShadowMap.schema, 'requests', { select }),
        atlas: slot.channel(ShadowMap.schema, 'atlas', { select }),
        rects: slot.channel(ShadowWork.schema, RECTS, { optional: true }),
        sprites: slot.entities({ all: [ParticleBody, PointSpriteMaterial] }),
    };
}

type Ctx = TransitionContext<ShadowSlots>;

const VERTEX_LAYOUT = [
    {
        arrayStride: 32,
        stepMode: 'vertex' as const,
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' as const }],
    },
];

/**
 * O desenho das páginas de uma orientação (T060h): o vértice na página (o recorte da janela a prende a ela) e a
 * profundidade no atlas pelo mínimo atômico no fragmento; o anexo sem escrita.
 */
function depthPipeline(faces: GPUFrontFace | 'two', preferAsync: boolean): PipelineDescriptor {
    return {
        id: `shadow_depth:${faces}`,
        role: 'render',
        shader: shadowDepth,
        entryPoints: ['shadow_depth_vs', 'shadow_depth_fs'],
        colorTargets: [{ format: 'r8unorm', writeMask: 0 }],
        topology: 'triangle-list',
        // As duas faces do material de dois lados (T061a).
        cullMode: faces === 'two' ? 'none' : 'back',
        frontFace: faces === 'two' ? 'ccw' : faces,
        vertexBuffers: VERTEX_LAYOUT,
        ...(preferAsync ? { preferAsync: true } : {}),
    };
}

/**
 * O desenho dos aglomerados de uma malha grande (o pipeline `id`, ligado aos vértices e aos índices dela): sem buffer de
 * vértices, um aglomerado por instância (`shadow_cluster_vs`).
 */
function clusterPipeline(
    id: string,
    faces: GPUFrontFace | 'two',
    preferAsync: boolean,
): PipelineDescriptor {
    return {
        id,
        role: 'render',
        shader: shadowDepth,
        entryPoints: ['shadow_cluster_vs', 'shadow_depth_fs'],
        colorTargets: [{ format: 'r8unorm', writeMask: 0 }],
        topology: 'triangle-list',
        cullMode: faces === 'two' ? 'none' : 'back',
        frontFace: faces === 'two' ? 'ccw' : faces,
        ...(preferAsync ? { preferAsync: true } : {}),
    };
}

/** O desenho dos sprites que projetam (seis vértices por par da lista; sem buffer de vértices). */
const SPRITE_PIPELINE = 'shadow_sprite';

/** O pipeline dos sprites, preparado quando a primeira fonte aparece (a cena sem sprites que projetam não o compila). */
function spritePipeline(preferAsync: boolean): PipelineDescriptor {
    return {
        id: SPRITE_PIPELINE,
        role: 'render',
        shader: shadowDepth,
        entryPoints: ['shadow_sprite_vs', 'shadow_sprite_fs'],
        colorTargets: [{ format: 'r8unorm', writeMask: 0 }],
        topology: 'triangle-list',
        cullMode: 'none',
        ...(preferAsync ? { preferAsync: true } : {}),
    };
}

/** As etapas das páginas (ver `shadow_pages.wgsl`). */
const PAGE_STEPS = [
    'sp_clear_main',
    'sp_instances_main',
    'sp_update_main',
    'sp_rank_main',
    'sp_free_main',
    'sp_allocate_main',
    'sp_fill_main',
    'sp_pairs_count_main',
    'sp_pairs_base_main',
    'sp_pairs_main',
    'sp_clusters_main',
] as const;
/** A etapa das listas dos grupos em aglomerados (despachada por grupo, com a região dele). */
const CLUSTERS_STEP = PAGE_STEPS.indexOf('sp_clusters_main');

/** Opções do `ShadowFlow`. */
export interface ShadowFlowOptions {
    /** Compila os pipelines em segundo plano; o estágio entra no quadro quando prontos. */
    readonly preferAsync?: boolean;
}

/** A caixa de uma geometria: o kernel ligado aos vértices dela (o grupo vem da região do despacho). */
interface BoundsKernel {
    readonly kernel: string;
    readonly generation: string;
}

/**
 * ShadowFlow — o mapa de sombra virtual da primeira `DirectionalLight` que projeta sombra (spec 034, T060): as páginas
 * que a imagem pediu no quadro anterior (a série dos pedidos) são alocadas no atlas e só as novas e as tocadas por quem
 * se moveu ou se deformou são desenhadas; as demais seguem do quadro anterior. Sem texturas (T060h): o atlas é um buffer
 * por páginas (um alvo só, com o carimbo de cada página e a época da C2, T060a) com a tabela no começo, refeita no lugar a
 * cada quadro; os pedidos e os retângulos, séries de buffer de duas fatias.
 *
 * No quadro: a caixa de cada geometria (um despacho por geometria, ligado aos vértices dela), as etapas das páginas
 * (`shadow_pages.wgsl`: os retângulos das instâncias no plano da luz e quem se moveu, a tabela, as páginas livres, a
 * alocação do mais grosso ao mais fino até o orçamento do quadro, com o carimbo das páginas escritas, e os pares
 * instância × página suja, e o fundo das sujas) e o desenho — um desenho indireto por grupo de instâncias (geometria,
 * orientação) com uma instância por par, do tamanho de uma página, a profundidade no atlas pelo mínimo atômico; a malha
 * grande vai em aglomerados (um desenho com uma instância por par aglomerado × página que a forma do aglomerado toca,
 * pelo pipeline da geometria). A CPU não acompanha a luz nem as páginas: escreve só os
 * grupos quando mudam e os parâmetros do quadro.
 */
export class ShadowFlow extends Flow<ShadowSlots, 'idle'> {
    readonly type = 'ShadowFlow';
    readonly slots: ShadowSlots;
    override readonly pipelines: readonly PipelineDescriptor[];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<ShadowSlots>>;

    private readonly core: EngineCore;
    private readonly preferAsync: boolean;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly work: ShadowWork;
    private readonly workContext: WorkContext;
    /** O início dos pares de cada grupo (por desenho) e o grupo de cada caixa (por despacho). */
    private readonly groupDraws: PerStepUniforms;
    private readonly boundsGroups: PerStepUniforms;
    /** Os kernels das caixas por buffer de vértices e os grupos do quadro (grupo, kernel). */
    private readonly bounds = new Map<AnyBufferSpec, BoundsKernel>();
    private boundsGroupsOf: { readonly group: number; readonly kernel: string }[] = [];
    /** Os kernels das caixas dos aglomerados por buffer de índices e os pipelines do desenho deles (id → usado). */
    private readonly clusterBounds = new Map<AnyBufferSpec, BoundsKernel>();
    private readonly clusterPipelines = new Set<string>();
    /** Os grupos em aglomerados no quadro (por índice do grupo). */
    private clusterPlans = new Map<number, ClusterPlan>();
    /** O kernel das caixas dos aglomerados de cada grupo em aglomerados (refeito com as caixas). */
    private clusterKernels = new Map<number, string>();
    /** Os grupos escritos (chave) e a contagem das instâncias. */
    private groupsKey = '';
    private instanceCount = 0;
    private groupCount = 0;
    /** Parâmetros escritos (chave) e o recomeço pedido para o quadro (grupos mudados). */
    private paramsKey = '';
    private regroup = false;
    /** Há o que desenhar neste quadro (mapa, câmera ou não, grupos). */
    private active = false;
    /** O cache recomeça no próximo quadro preparado (grupos mudados). */
    private reset = true;
    /** Grupos cuja contagem de índices vem da geometria (malha adaptativa): o registro e a fonte. */
    private readonly indirectSources = new Map<number, AnyBufferSpec>();
    /** As fontes privadas ligadas (outras = religa). */
    private boundSources = '';
    /** As fontes de sprites que projetam no quadro, a região de cada uma e os kernels por buffer de pontos. */
    private spriteSources: SpriteSource[] = [];
    private readonly spriteRegions: PerStepUniforms;
    private readonly spriteKernels = new Map<AnyBufferSpec, SpriteKernels>();
    private spritesKey = '';
    private spritePrepared = false;

    constructor(ctx: FlowContext, options: ShadowFlowOptions = {}) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        this.work = new ShadowWork();
        this.workContext = { core: ctx.core, resources: ctx.resources, work: this.work };
        this.groupDraws = new PerStepUniforms(this.workContext, {
            id: 'shadow_group_draw',
            schema: ShadowGroupDrawSchema,
        });
        this.boundsGroups = new PerStepUniforms(this.workContext, {
            id: 'shadow_bounds_geometry',
            schema: ShadowBoundsGeometrySchema,
        });
        this.spriteRegions = new PerStepUniforms(this.workContext, {
            id: 'shadow_sprite_source',
            schema: ShadowSpriteSourceSchema,
        });
        this.groupDraws.reserve(1);
        this.boundsGroups.reserve(1);
        this.spriteRegions.reserve(1);
        this.slots = slotsOf(ctx.world, this.work);
        const async = options.preferAsync === true;
        this.preferAsync = async;
        this.pipelines = [
            ...PAGE_STEPS.map(
                (entry): PipelineDescriptor => ({
                    id: entry,
                    role: 'compute',
                    shader: shadowPages,
                    entryPoints: [entry],
                    ...(async ? { preferAsync: true } : {}),
                }),
            ),
            depthPipeline('ccw', async),
            depthPipeline('cw', async),
            depthPipeline('two', async),
        ];
        this.transitions = {
            '*': {
                // O trabalho já está na cena: as fontes privadas ligam ao que a C2 alocou.
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.bindPrivate(c);
                    },
                },
                slotLost: 'ignore',
                // O mapa que projeta, as séries ou a câmera trocados: o quadro seguinte refaz as ligações e os grupos.
                slotChanged: {
                    to: 'idle',
                    run: () => {
                        this.regroup = true;
                    },
                },
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
                entitiesChanged: {
                    to: 'idle',
                    run: () => {
                        this.regroup = true;
                    },
                },
                canvasReconfigured: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
            },
        };
    }

    /** As caixas, as etapas das páginas e o desenho das páginas sujas. */
    dispatch(frame: Frame, bound: BoundFlow<ShadowSlots>): void {
        if (!this.active) return;
        const steps = PAGE_STEPS.map((id) => bound.compute(id));
        if (steps.some((s) => !s.ready)) return;
        // Os grupos em aglomerados escritos como prontos: o kernel das caixas (refeito com os buffers) e o pipeline do
        // desenho também prontos agora, senão o quadro fica com o atlas de antes.
        for (const [group, plan] of this.clusterPlans) {
            if (!plan.ready) continue;
            const k = this.clusterKernels.get(group);
            if (k === undefined || this.work.pipelines.compute(k) === undefined) return;
            if (bound.pipelines.get(plan.pipeline)?.ready !== true) return;
        }
        const sprites = this.readySprites(bound);
        if (sprites === undefined) return;
        const ccw = bound.render('shadow_depth:ccw');
        const cw = bound.render('shadow_depth:cw');
        const two = bound.render('shadow_depth:two');
        const atlas = bound.slots.atlas;
        const view = this.resources.textureViewOf(this.work, RASTER);
        const args = this.resources.bufferOf(this.work, ARGS);
        if (view === undefined || args?.subkind !== 'indirect') return;
        const c = this.work.capacity;
        const physical = c.atlasPages * c.atlasPages;
        const entries = SHADOW_MAX_LEVELS * c.pagesPerLevel * c.pagesPerLevel;
        for (const [record, source] of this.indirectSources)
            frame.copy(source, args, 4, 0, record * INDIRECT_WORDS * 4);
        frame.compute('ShadowFlow.pages', (pass) => {
            const run = (index: number, invocations: number): void => {
                const step = steps[index]!;
                pass.bind.setPipeline(step.spec);
                step.bindTo(pass.bind);
                pass.dispatch.invocations(Math.max(1, invocations), WORKGROUP_SIZE);
            };
            // O início do quadro (os contadores, as caixas vazias) e as caixas das geometrias, cada uma no seu grupo.
            run(0, Math.max(STATE_WORDS, physical, this.groupCount));
            for (const b of this.boundsGroupsOf) {
                this.work.pipelines.use(pass.bind, b.kernel, {
                    draw: [this.boundsGroups.offset(b.group)],
                });
                pass.dispatch.workgroups(1);
            }
            // As caixas dos aglomerados das malhas grandes: uma invocação por aglomerado.
            for (const [group, plan] of this.clusterPlans) {
                const k = this.clusterKernels.get(group);
                if (!plan.ready || k === undefined) continue;
                this.work.pipelines.use(pass.bind, k, {
                    draw: [this.boundsGroups.offset(group)],
                });
                pass.dispatch.invocations(plan.count, WORKGROUP_SIZE);
            }
            const once = (index: number, workgroups: number): void => {
                const step = steps[index]!;
                pass.bind.setPipeline(step.spec);
                step.bindTo(pass.bind);
                pass.dispatch.workgroups(workgroups);
            };
            run(1, this.instanceCount);
            // Os retângulos das fontes de sprites (um grupo por fonte), entre as dinâmicas antes da tabela.
            sprites.parts.forEach((part, s) => {
                this.work.pipelines.use(pass.bind, part.rect, {
                    draw: [this.spriteRegions.offset(s)],
                });
                pass.dispatch.workgroups(1);
            });
            run(2, entries);
            // As filas: um grupo de trabalho por nível.
            once(3, SHADOW_MAX_LEVELS);
            once(4, 1);
            once(5, 1);
            // O fundo das sujas: um grupo por posição da lista.
            once(6, SHADOW_PAGE_BUDGET);
            run(7, SHADOW_PAGE_BUDGET * this.instanceCount);
            once(8, 1);
            run(9, SHADOW_PAGE_BUDGET * this.instanceCount);
            // As listas dos grupos em aglomerados: uma invocação por aglomerado, com a região do grupo.
            const clusters = steps[CLUSTERS_STEP];
            for (const [group, plan] of this.clusterPlans) {
                if (!plan.ready || clusters === undefined) continue;
                pass.bind.setPipeline(clusters.spec);
                clusters.bindTo(pass.bind, { draw: [this.boundsGroups.offset(group)] });
                pass.dispatch.invocations(plan.count, WORKGROUP_SIZE);
            }
            // Os pares (sprite, página suja) de cada fonte: uma invocação por ponto.
            sprites.parts.forEach((part, s) => {
                this.work.pipelines.use(pass.bind, part.pairs, {
                    draw: [this.spriteRegions.offset(s)],
                });
                pass.dispatch.invocations(Math.max(1, part.count), WORKGROUP_SIZE);
            });
        });
        // A profundidade vai ao atlas pelo fragmento; o anexo só dá a janela do desenho (uma página).
        const target: RenderTarget = {
            colorAttachments: [{ view, loadOp: 'clear', storeOp: 'discard' }],
        };
        const groups = bound.slots.casters.groups;
        frame.render(target, 'ShadowFlow', (pass) => {
            // Os grupos nas páginas sujas; as demais seguem no atlas (a série por páginas).
            let current: PreparedRender | undefined;
            groups.forEach((group, index) => {
                if (!drawsTriangles(group.key)) return;
                const entry = group.representative;
                const geometry = entry.get(Geometry);
                const vertices = this.resources.bufferOf(geometry, 'vertices');
                if (vertices?.subkind !== 'vertex') return;
                const plan = this.clusterPlans.get(index);
                if (plan?.ready === true) {
                    // A malha grande: um desenho só, os vértices pelos índices (o pipeline da geometria).
                    const clustered = bound.render(plan.pipeline);
                    pass.bind.setPipeline(clustered.spec);
                    current = clustered;
                    clustered.bindTo(pass.bind, { draw: [this.groupDraws.offset(index)] });
                    pass.draw.indirect(args, index * INDIRECT_WORDS * 4);
                    return;
                }
                const pipeline = group.key.endsWith('|two')
                    ? two
                    : entry.get(Transform).mirrored
                      ? cw
                      : ccw;
                if (!pipeline.ready) return;
                if (pipeline !== current) {
                    pass.bind.setPipeline(pipeline.spec);
                    current = pipeline;
                }
                pipeline.bindTo(pass.bind, { draw: [this.groupDraws.offset(index)] });
                pass.geometry.vertex(0, vertices);
                const indices = this.resources.bufferOf(geometry, 'indices');
                const offset = index * INDIRECT_WORDS * 4;
                if (indices?.subkind === 'index') {
                    pass.geometry.index(indices);
                    pass.draw.indexedIndirect(args, offset);
                } else {
                    pass.draw.indirect(args, offset);
                }
            });
            // Os sprites: um desenho só, um par da lista por instância (o registro depois dos grupos).
            if (sprites.draw !== undefined) {
                pass.bind.setPipeline(sprites.draw.spec);
                sprites.draw.bindTo(pass.bind);
                pass.draw.indirect(args, c.groups * INDIRECT_WORDS * 4);
            }
        });
        atlas.written();
        bound.slots.rects?.written();
    }

    /**
     * Os sprites que projetam no quadro: o desenho e, por fonte, os kernels e os pontos — `undefined` se algum ainda não
     * está pronto (o quadro fica com o atlas de antes); sem fontes, sem desenho.
     */
    private readySprites(bound: BoundFlow<ShadowSlots>):
        | {
              readonly draw: PreparedRender | undefined;
              readonly parts: readonly { rect: string; pairs: string; count: number }[];
          }
        | undefined {
        if (this.spriteSources.length === 0) return { draw: undefined, parts: [] };
        const draw = bound.pipelines.get(SPRITE_PIPELINE);
        if (draw?.role !== 'render' || !draw.ready) return undefined;
        const parts: { rect: string; pairs: string; count: number }[] = [];
        for (const src of this.spriteSources) {
            const k = this.spriteKernels.get(src.points);
            if (k === undefined) return undefined;
            if (this.work.pipelines.compute(k.rect) === undefined) return undefined;
            if (this.work.pipelines.compute(k.pairs) === undefined) return undefined;
            parts.push({ rect: k.rect, pairs: k.pairs, count: src.count });
        }
        return { draw, parts };
    }

    /** O trabalho é do `ShadowWork` (a C2 o libera com ele). */
    override dispose(): void {
        this.bounds.clear();
        this.clusterBounds.clear();
        this.clusterPipelines.clear();
        this.boundsGroupsOf = [];
        this.clusterKernels = new Map();
        this.clusterPlans = new Map();
        this.indirectSources.clear();
        this.spriteKernels.clear();
        this.spriteSources = [];
    }

    /** O quadro: as capacidades, os grupos, as caixas, as ligações privadas e os parâmetros. */
    private prepare(ctx: Ctx): void {
        const s = ctx.bound.slots;
        const map = s.caster.resource as ShadowMap;
        const id = this.world.entityIdOfResource(map);
        const casterSlot = id === undefined ? undefined : s.matrices.slotOf(id);
        const groups = s.casters.groups;
        const sprites = this.collectSprites(ctx);
        this.active = casterSlot !== undefined && (groups.length > 0 || sprites.length > 0);
        if (!this.active || casterSlot === undefined) {
            // Sem grupos, nenhum kernel das caixas fica ligado: a geometria de mesmo conteúdo que volta (o mesmo buffer de
            // vértices pela chave de conteúdo, outro objeto de GPU) não reaproveita o grupo de ligação do que morreu.
            this.releaseBounds();
            return;
        }
        const instances = Math.max(1, ...groups.map((g) => g.first + g.count));
        const { pagesPerLevel, atlasPages } = map.data;
        const clusters = this.planClusters(ctx);
        const points = sprites.reduce((n, src) => n + src.count, 0);
        this.ensureCapacity(
            groups.length,
            instances,
            clusters,
            {
                sprites: sprites.length,
                spriteList: Math.min(SPRITE_LIST_MAX, points * SPRITE_ENTRIES_PER_POINT),
            },
            pagesPerLevel,
            atlasPages,
        );
        this.writeGroups(ctx, instances);
        this.writeSprites(sprites);
        if (!this.bindPrivate(ctx)) {
            this.active = false;
            return;
        }
        // Depois das fontes privadas ligadas (as do trabalho realocado neste quadro).
        if (sprites.length > 0 && !this.spritePrepared) {
            ctx.prepare(spritePipeline(this.preferAsync));
            this.spritePrepared = true;
        }
        this.writeParams(ctx, casterSlot);
    }

    /**
     * Os grupos em aglomerados: a geometria indexada em `uint32` de pelo menos `CLUSTER_MIN_TRIANGLES`, sem contagem
     * vinda da GPU (a malha adaptativa), num grupo que projeta com até `CLUSTER_MAX_INSTANCES` instâncias. Cada um tem o
     * pipeline do desenho ligado aos vértices e aos índices da geometria (preparado aqui; os que saíram são liberados) e
     * fica pronto quando o pipeline e o kernel das caixas estão prontos — até lá, o grupo vai inteiro a cada página,
     * como os outros. Devolve os aglomerados e as palavras das listas.
     */
    private planClusters(ctx: Ctx): { clusters: number; clusterList: number } {
        const groups = ctx.bound.slots.casters.groups;
        const adaptive = this.core.capabilities().features.includes('indirect-first-instance');
        const plans = new Map<number, ClusterPlan>();
        const used = new Set<string>();
        let clusters = 0;
        let clusterList = 0;
        groups.forEach((group, index) => {
            const buffers = this.clusterBuffersOf(group, adaptive);
            if (buffers === undefined) return;
            const { vertices, indices } = buffers;
            const triangles = Math.floor(indices.count / 3);
            const count = Math.ceil(triangles / CLUSTER_TRIS);
            const faces = group.key.endsWith('|two')
                ? 'two'
                : group.representative.get(Transform).mirrored
                  ? 'cw'
                  : 'ccw';
            const id = `shadow_cluster:${faces}:${this.idOf(vertices)}:${this.idOf(indices)}`;
            if (!this.clusterPipelines.has(id)) {
                ctx.bind(
                    new Map<BindingKey, BindingSource>([
                        [
                            { pipeline: id, resource: shadowResources.drawClusterVertices },
                            vertices as BindingSource,
                        ],
                        [{ pipeline: id, resource: shadowResources.drawClusterIndices }, indices],
                    ]),
                );
                ctx.prepare(clusterPipeline(id, faces, this.preferAsync));
                this.clusterPipelines.add(id);
            }
            used.add(id);
            const kernel = this.clusterKernels.get(index);
            const ready =
                ctx.bound.pipelines.get(id)?.ready === true
                && kernel !== undefined
                && this.work.pipelines.compute(kernel) !== undefined;
            plans.set(index, {
                first: clusters,
                count,
                indexCount: triangles * 3,
                pipeline: id,
                ready,
            });
            clusters += count;
            clusterList += count * CLUSTER_SLOTS;
        });
        for (const id of [...this.clusterPipelines]) {
            if (used.has(id)) continue;
            ctx.release(id);
            this.clusterPipelines.delete(id);
        }
        this.clusterPlans = plans;
        return { clusters, clusterList };
    }

    /**
     * Os vértices e os índices da geometria do grupo, se ele vai em aglomerados (ver `planClusters`); senão,
     * `undefined`.
     */
    private clusterBuffersOf(
        group: DrawGroup,
        adaptive: boolean,
    ): { vertices: AnyBufferSpec; indices: IndexBufferSpec } | undefined {
        if (!drawsTriangles(group.key) || group.count > CLUSTER_MAX_INSTANCES) return undefined;
        const geometry = group.representative.get(Geometry);
        const vertices = this.resources.bufferOf(geometry, 'vertices');
        const indices = this.resources.bufferOf(geometry, 'indices');
        if (vertices?.subkind !== 'vertex' || indices?.subkind !== 'index') return undefined;
        if (geometry.indexFormat !== 'uint32') return undefined;
        if (adaptive && this.resources.bufferOf(geometry, 'indirect')?.subkind === 'indirect')
            return undefined;
        const triangles = Math.floor(indices.count / 3);
        if (triangles < CLUSTER_MIN_TRIANGLES || Math.ceil(triangles / CLUSTER_TRIS) > CLUSTER_MAX)
            return undefined;
        return { vertices, indices };
    }

    /** Capacidades do trabalho (por dobra); mudadas, a C2 realoca e o cache recomeça. */
    private ensureCapacity(
        groups: number,
        instances: number,
        clusters: { clusters: number; clusterList: number },
        sprites: { sprites: number; spriteList: number },
        pagesPerLevel: number,
        atlasPages: number,
    ): void {
        const c = this.work.capacity;
        const grow = (have: number, need: number): number => {
            let n = Math.max(1, have);
            while (n < need) n *= 2;
            return n;
        };
        const next: Capacity = {
            groups: grow(c.groups, groups),
            instances: grow(c.instances, instances),
            clusters: grow(c.clusters, clusters.clusters),
            clusterList: grow(c.clusterList, clusters.clusterList),
            sprites: grow(c.sprites, sprites.sprites),
            spriteList: grow(c.spriteList, sprites.spriteList),
            pagesPerLevel,
            atlasPages,
        };
        if (
            next.groups === c.groups
            && next.instances === c.instances
            && next.clusters === c.clusters
            && next.clusterList === c.clusterList
            && next.sprites === c.sprites
            && next.spriteList === c.spriteList
            && next.pagesPerLevel === c.pagesPerLevel
            && next.atlasPages === c.atlasPages
        )
            return;
        this.work.capacity = next;
        this.work.refresh();
        this.groupsKey = '';
        this.regroup = true;
    }

    /**
     * Os grupos (primeira instância, contagem, registro) e a palavra de grupo de cada instância (sem sombra, deformada
     * pela GPU), os argumentos dos desenhos e as regiões por grupo — escritos quando os grupos mudam.
     */
    private writeGroups(ctx: Ctx, instances: number): void {
        const groups = ctx.bound.slots.casters.groups;
        // As regiões por grupo antes da chave (crescer as realoca).
        this.groupDraws.reserve(groups.length);
        this.boundsGroups.reserve(groups.length);
        // Os grupos (o conteúdo: muda o que é desenhado — o cache recomeça) e os buffers (realocados voltam vazios: os
        // grupos são reescritos, as páginas seguem valendo).
        const content = groups.map((g) => `${g.key}:${g.first}:${g.count}`).join(';');
        const plans = [...this.clusterPlans]
            .map(([g, p]) => `${g}:${p.first}:${p.count}:${p.pipeline}:${p.ready}`)
            .join(';');
        const target = this.resources.bufferOf(this.work, GROUPS);
        const argsBuffer = this.resources.bufferOf(this.work, ARGS);
        const key = [
            target === undefined ? 0 : this.idOf(target),
            argsBuffer === undefined ? 0 : this.idOf(argsBuffer),
            this.groupDraws.generation,
            this.boundsGroups.generation,
            content,
            plans,
        ].join(';');
        this.indirectSources.clear();
        // Sem 'indirect-first-instance' a malha adaptativa fica no nível máximo: a contagem é a da capacidade.
        const adaptive = this.core.capabilities().features.includes('indirect-first-instance');
        groups.forEach((group, index) => {
            if (!adaptive) return;
            const source = this.resources.bufferOf(group.representative.get(Geometry), 'indirect');
            if (source?.subkind === 'indirect' && drawsTriangles(group.key))
                this.indirectSources.set(index, source);
        });
        if (key === this.groupsKey && !this.regroup) return;
        this.regroup = false;
        const c = this.work.capacity;
        const words = new Uint32Array(c.groups * 4 + c.instances);
        // As posições da lista sem instância de grupo (a lista da C2 tem buracos) ficam fora do desenho.
        words.fill(SKIP, c.groups * 4);
        const args = new Uint32Array((c.groups + 1) * INDIRECT_WORDS);
        // O registro dos sprites: seis vértices por par (a contagem de instâncias pela GPU).
        args.set([6, 0, 0, 0, 0], c.groups * INDIRECT_WORDS);
        const { clusterListBase } = layoutOf(c);
        groups.forEach((group, index) => {
            const geometry = group.representative.get(Geometry);
            // Fora do desenho só o que não projeta; a geometria ainda sem vértices fica com a caixa vazia (zerada a cada
            // quadro) até o kernel dela rodar.
            const skip = !drawsTriangles(group.key);
            const deforming = this.resources.hasGpuWriter(geometry, 'vertices');
            const plan = this.clusterPlans.get(index);
            // O grupo em aglomerados pronto: a lista dele (a palavra 2, nunca 0) e o desenho de um aglomerado por
            // instância; os outros, a malha inteira por instância.
            const list = plan?.ready === true ? clusterListBase + plan.first * CLUSTER_SLOTS : 0;
            words.set([group.first, group.count, list, index], index * 4);
            const word = index | (skip ? SKIP : 0) | (deforming ? DEFORMING : 0);
            for (let j = 0; j < group.count; j++)
                words[c.groups * 4 + group.first + j] = word >>> 0;
            const indices = this.resources.bufferOf(geometry, 'indices');
            const count = indices?.subkind === 'index' ? indices.count : geometry.vertexCount;
            args.set([list !== 0 ? CLUSTER_TRIS * 3 : count, 0, 0, 0, 0], index * INDIRECT_WORDS);
            this.writeRegions(index, list, plan);
        });
        this.resources.writeNow(this.work, GROUPS, words);
        this.resources.writeNow(this.work, ARGS, args);
        this.groupDraws.flush(groups.length);
        this.boundsGroups.flush(groups.length);
        this.groupsKey = key;
        this.groupCount = groups.length;
        this.instanceCount = instances;
        this.boundsDirty = true;
        if (content !== this.groupsContent) this.reset = true;
        this.groupsContent = content;
    }

    /**
     * As regiões do grupo `index`: a do desenho (a lista dos aglomerados, se pronto) e a das caixas e das listas (os
     * aglomerados dele).
     */
    private writeRegions(index: number, list: number, plan: ClusterPlan | undefined): void {
        const count = plan?.count ?? 0;
        const indexCount = plan?.indexCount ?? 0;
        this.groupDraws.write(index, {
            group: index,
            listBase: list,
            listCap: count * CLUSTER_SLOTS,
            indexCount,
        });
        this.boundsGroups.write(index, {
            group: index,
            clusterFirst: plan?.first ?? 0,
            clusterCount: count,
            indexCount,
        });
    }

    /** O conteúdo dos grupos escrito (as chaves, primeiras instâncias e contagens). */
    private groupsContent = '';

    /** As caixas das geometrias precisam de kernels novos (grupos ou buffers mudados). */
    private boundsDirty = true;

    /**
     * Liga as fontes privadas (parâmetros, trabalho, regiões) aos pipelines e refaz os kernels das caixas quando os
     * buffers mudam. Devolve se tudo está alocado.
     */
    private bindPrivate(ctx: Ctx): boolean {
        const R = shadowResources;
        const buffer = (descId: string): AnyBufferSpec | undefined =>
            this.resources.bufferOf(this.work, descId);
        const params = buffer(PARAMS);
        const scratch = buffer(SCRATCH);
        const groups = buffer(GROUPS);
        const args = buffer(ARGS);
        const pairs = buffer(PAIRS);
        const spriteList = buffer(SPRITES);
        if (
            params === undefined
            || scratch === undefined
            || groups === undefined
            || args === undefined
            || pairs === undefined
            || spriteList === undefined
        )
            return false;
        const key = [
            params,
            scratch,
            groups,
            args,
            pairs,
            spriteList,
            this.groupDraws.generation,
            this.boundsGroups.generation,
            this.spriteRegions.generation,
        ]
            .map((b) => (typeof b === 'number' ? b : this.idOf(b)))
            .join(':');
        const src = (b: AnyBufferSpec): BindingSource => b as BindingSource;
        if (key !== this.boundSources) {
            ctx.bind(
                new Map<WgslResource, BindingSource>([
                    [R.params, src(params)],
                    [R.scratch, src(scratch)],
                    [R.scratchRead, src(scratch)],
                    [R.groups, src(groups)],
                    [R.args, src(args)],
                    [R.pairs, src(pairs)],
                    [R.pairsRead, src(pairs)],
                    [R.group, this.groupDraws.source()],
                    // A região do grupo nas listas dos aglomerados (`sp_clusters_main`).
                    [R.geometry, this.boundsGroups.source()],
                    [R.spriteSource, this.spriteRegions.source()],
                    [R.spriteList, src(spriteList)],
                    [R.spriteListRead, src(spriteList)],
                ]),
            );
            this.boundSources = key;
            this.boundsDirty = true;
        }
        if (this.boundsDirty) this.rebuildBounds(ctx, params, scratch, key);
        this.rebuildSprites(key, [
            [R.params, src(params)],
            [R.scratch, src(scratch)],
            [R.args, src(args)],
            [R.spriteList, src(spriteList)],
            [R.spriteSource, this.spriteRegions.source()],
        ]);
        return true;
    }

    /** Solta os kernels das caixas (a C2 libera os pipelines e as ligações deles). */
    private releaseBounds(): void {
        for (const b of this.bounds.values()) this.work.pipelines.release(b.kernel);
        for (const b of this.clusterBounds.values()) this.work.pipelines.release(b.kernel);
        for (const k of this.spriteKernels.values()) {
            this.work.pipelines.release(k.rect);
            this.work.pipelines.release(k.pairs);
        }
        this.spriteKernels.clear();
        this.spriteSources = [];
        this.spritesKey = '';
        this.bounds.clear();
        this.clusterBounds.clear();
        this.boundsGroupsOf = [];
        this.clusterKernels = new Map();
        this.boundsDirty = true;
    }

    /** Ids estáveis dos buffers (para a chave das ligações). */
    private readonly ids = new WeakMap<object, number>();
    private nextId = 1;
    private idOf(o: object): number {
        let id = this.ids.get(o);
        if (id === undefined) {
            id = this.nextId++;
            this.ids.set(o, id);
        }
        return id;
    }

    /**
     * Um kernel da caixa por geometria, ligado aos vértices dela (o grupo pela região do despacho): o mesmo buffer de
     * vértices e os mesmos buffers do trabalho reaproveitam o kernel; o dos vértices que saíram é liberado.
     */
    private rebuildBounds(
        ctx: Ctx,
        params: AnyBufferSpec,
        scratch: AnyBufferSpec,
        generation: string,
    ): void {
        this.boundsDirty = false;
        const used = new Set<AnyBufferSpec>();
        const usedIndices = new Set<AnyBufferSpec>();
        this.boundsGroupsOf = [];
        this.clusterKernels = new Map();
        ctx.bound.slots.casters.groups.forEach((group, index) => {
            const vertices = this.resources.bufferOf(
                group.representative.get(Geometry),
                'vertices',
            );
            if (vertices === undefined || vertices.subkind === 'staging') {
                // A geometria ainda sem buffer (alocado no envio do quadro): tenta de novo no próximo.
                if (drawsTriangles(group.key)) this.boundsDirty = true;
                return;
            }
            used.add(vertices);
            let b = this.bounds.get(vertices);
            if (b?.generation !== generation) {
                if (b !== undefined) this.work.pipelines.release(b.kernel);
                b = {
                    generation,
                    kernel: this.work.pipelines.kernel({
                        discriminator: `shadow_bounds:${this.idOf(vertices)}`,
                        shader: shadowPages,
                        entryPoint: 'sp_bounds_main',
                        bindings: new Map<WgslResource, BindingSource>([
                            [vertexBoundsResource, vertices],
                            [shadowResources.scratch, scratch as BindingSource],
                            [shadowResources.params, params as BindingSource],
                            [shadowResources.geometry, this.boundsGroups.source()],
                        ]),
                    }),
                };
                this.bounds.set(vertices, b);
            }
            this.boundsGroupsOf.push({ group: index, kernel: b.kernel });
            // Os aglomerados da malha grande: o kernel das caixas ligado aos vértices e aos índices dela.
            const indices = this.resources.bufferOf(group.representative.get(Geometry), 'indices');
            if (!this.clusterPlans.has(index) || indices?.subkind !== 'index') return;
            usedIndices.add(indices);
            const tag = `${generation}:${this.idOf(vertices)}`;
            let k = this.clusterBounds.get(indices);
            if (k?.generation !== tag) {
                if (k !== undefined) this.work.pipelines.release(k.kernel);
                k = {
                    generation: tag,
                    kernel: this.work.pipelines.kernel({
                        discriminator: `shadow_cluster_bounds:${this.idOf(indices)}`,
                        shader: shadowPages,
                        entryPoint: 'sp_cluster_bounds_main',
                        bindings: new Map<WgslResource, BindingSource>([
                            [vertexBoundsResource, vertices],
                            [shadowResources.clusterIndices, indices],
                            [shadowResources.scratch, scratch as BindingSource],
                            [shadowResources.params, params as BindingSource],
                            [shadowResources.geometry, this.boundsGroups.source()],
                        ]),
                    }),
                };
                this.clusterBounds.set(indices, k);
            }
            this.clusterKernels.set(index, k.kernel);
        });
        for (const [i, k] of [...this.clusterBounds]) {
            if (usedIndices.has(i)) continue;
            this.work.pipelines.release(k.kernel);
            this.clusterBounds.delete(i);
        }
        // Os vértices que saíram (a geometria removida): o kernel ligado a eles sai da C2.
        for (const [v, b] of [...this.bounds]) {
            if (used.has(v)) continue;
            this.work.pipelines.release(b.kernel);
            this.bounds.delete(v);
        }
    }

    /**
     * As fontes de sprites que projetam: cada instância de um grupo de vértices como sprites (a matriz de mundo dela; a
     * geometria escrita pela GPU se move sozinha) e cada corpo de partículas com `PointSpriteMaterial` que projeta (o
     * trecho do corpo no pool; sempre em movimento). O raio é o do material.
     */
    private collectSprites(ctx: Ctx): SpriteSource[] {
        const out: SpriteSource[] = [];
        const s = ctx.bound.slots;
        for (const group of s.casters.groups) {
            if (!group.key.startsWith(SPRITE_SHADOW)) continue;
            const entry = group.representative;
            const geometry = entry.get(Geometry);
            const points = this.resources.bufferOf(geometry, 'vertices');
            const material = entry.resources.find((r) => r instanceof PointSpriteMaterial);
            if (points === undefined || points.subkind === 'staging' || material === undefined)
                continue;
            const dynamic = this.resources.hasGpuWriter(geometry, 'vertices');
            for (let j = 0; j < group.count; j++)
                out.push({
                    points,
                    first: 0,
                    count: geometry.vertexCount,
                    strideWords: 8,
                    posOffsetWords: 0,
                    instance: group.first + j,
                    dynamic,
                    radius: material.data.radius,
                });
        }
        for (const entry of s.sprites.entries) {
            // O corpo com geometria (a superfície de um corpo mole) é desenhado como malha.
            if (entry.resources.some((r) => r instanceof Geometry)) continue;
            const material = entry.get(PointSpriteMaterial);
            if (!material.castsShadow) continue;
            const body = entry.get(ParticleBody);
            const poolKey = this.resources.poolKeyForResource(body);
            const pool = poolKey === undefined ? undefined : this.resources.poolBufferSpec(poolKey);
            if (poolKey === undefined || pool === undefined) continue;
            const schema = body.particleSchema;
            out.push({
                points: pool,
                first: this.resources.poolRangeOf(poolKey, entry.entityId)?.first ?? 0,
                count: body.count,
                strideWords: schema.stride / 4,
                posOffsetWords: schema.offsetOf('pos') / 4,
                instance: SPRITE_NO_INSTANCE,
                dynamic: true,
                radius: material.data.radius,
            });
        }
        return out;
    }

    /** As regiões das fontes de sprites (escritas quando mudam; o lugar de cada uma na série dos retângulos). */
    private writeSprites(sources: SpriteSource[]): void {
        this.spriteSources = sources;
        if (sources.length === 0) return;
        this.spriteRegions.reserve(sources.length);
        const rectsFirst = this.work.capacity.instances;
        const key = [
            this.spriteRegions.generation,
            rectsFirst,
            ...sources.map(
                (src) =>
                    `${this.idOf(src.points)}:${src.first}:${src.count}:${src.strideWords}:`
                    + `${src.posOffsetWords}:${src.instance}:${src.dynamic}:${src.radius}`,
            ),
        ].join(';');
        if (key === this.spritesKey) return;
        sources.forEach((src, i) => {
            this.spriteRegions.write(i, {
                first: src.first,
                count: src.count,
                strideWords: src.strideWords,
                posOffsetWords: src.posOffsetWords,
                instance: src.instance,
                rectSlot: rectsFirst + i,
                dynamic: src.dynamic ? 1 : 0,
                radius: src.radius,
            });
        });
        this.spriteRegions.flush(sources.length);
        this.spritesKey = key;
    }

    /**
     * Os kernels das fontes de sprites, um par (retângulo, pares) por buffer de pontos, ligados a ele e aos buffers do
     * trabalho (`shared`): refeitos quando estes mudam; os dos pontos que saíram são liberados.
     */
    private rebuildSprites(
        generation: string,
        shared: readonly (readonly [WgslResource, BindingSource])[],
    ): void {
        const used = new Set<AnyBufferSpec>();
        for (const src of this.spriteSources) {
            used.add(src.points);
            const k = this.spriteKernels.get(src.points);
            if (k?.generation === generation) continue;
            if (k !== undefined) {
                this.work.pipelines.release(k.rect);
                this.work.pipelines.release(k.pairs);
            }
            const bindings = new Map<WgslResource, BindingSource>([
                ...shared,
                [shadowResources.spritePoints, src.points as BindingSource],
            ]);
            const id = this.idOf(src.points);
            this.spriteKernels.set(src.points, {
                generation,
                rect: this.work.pipelines.kernel({
                    discriminator: `shadow_sprite_rect:${id}`,
                    shader: shadowPages,
                    entryPoint: 'ss_rect_main',
                    bindings,
                }),
                pairs: this.work.pipelines.kernel({
                    discriminator: `shadow_sprite_pairs:${id}`,
                    shader: shadowPages,
                    entryPoint: 'ss_pairs_main',
                    bindings,
                }),
            });
        }
        for (const [points, k] of [...this.spriteKernels]) {
            if (used.has(points)) continue;
            this.work.pipelines.release(k.rect);
            this.work.pipelines.release(k.pairs);
            this.spriteKernels.delete(points);
        }
    }

    /** Os parâmetros do quadro: o recomeço (séries interrompidas, grupos mudados), os pedidos e as seções. */
    private writeParams(ctx: Ctx, casterSlot: number): void {
        const s = ctx.bound.slots;
        const continuous = (lag1: number | undefined): boolean => lag1 === 1;
        this.reset = this.reset || !continuous(s.rects?.age(1));
        const layout = layoutOf(this.work.capacity);
        const values = {
            casterSlot,
            groupCount: this.groupCount,
            instanceCount: this.instanceCount,
            budget: SHADOW_PAGE_BUDGET,
            reset: this.reset ? 1 : 0,
            requestsValid: continuous(s.requests.age(1)) ? 1 : 0,
            keepBase: layout.keepBase,
            freeBase: layout.freeBase,
            workBase: layout.workBase,
            dirtyBase: layout.dirtyBase,
            dynamicBase: layout.dynamicBase,
            dynamicCap: DYNAMIC_CAP,
            boundsBase: layout.boundsBase,
            rectsBase: layout.rectsBase,
            instanceGroupBase: this.work.capacity.groups * 4,
            groupPairsBase: layout.groupPairsBase,
            needBase: layout.needBase,
            clusterBoundsBase: layout.clusterBoundsBase,
            spriteRecord: this.work.capacity.groups,
            spriteCap: this.work.capacity.spriteList,
        };
        const key = JSON.stringify(values);
        if (key !== this.paramsKey) {
            this.resources.writeNow(this.work, PARAMS, ShadowPagesParamsSchema.pack(values));
            this.paramsKey = key;
        }
        // O recomeço vale só para este quadro: a partir do seguinte, as séries seguem.
        this.reset = false;
    }
}
