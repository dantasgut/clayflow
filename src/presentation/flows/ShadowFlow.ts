import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { AnyBufferSpec, EngineCore, Frame, RenderTarget } from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { FlowWork, type WorkContext } from '../../scene/flows/FlowWork';
import type {
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
import { SHADOW_MAX_LEVELS, ShadowMap } from '../../elements/scene/ShadowMap';
import { castingShadowMap } from '../../elements/scene/shadowCaster';
import { Transform } from '../../elements/scene/Transform';
import { PerStepUniforms } from '../../elements/gpu/compute/PerStepUniforms';
import { wordBuffer } from '../../elements/gpu/compute/schemas';
import {
    ShadowBoundsGeometrySchema,
    ShadowGroupDrawSchema,
    ShadowInstanceSchema,
    ShadowPagesParamsSchema,
} from './renderSchemas';
import { shadowDepth, shadowDepthClip, shadowPages, shadowResources } from './shaders';

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
    /** A série da tabela de páginas do mapa que projeta. */
    readonly pages: ChannelSlot<false>;
    /** A série dos pedidos de páginas (o quadro anterior, pelo `ShadowRequestFlow`). */
    readonly requests: ChannelSlot<false>;
    /** A série do atlas das páginas (o alvo do desenho; o quadro anterior segue no de agora). */
    readonly atlas: ChannelSlot<false>;
    /** A série dos retângulos das instâncias no plano da luz (quem se moveu). */
    readonly rects: ChannelSlot<true>;
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
/** Largura da textura dos retângulos (uma instância por texel). */
const RECTS_WIDTH = 256;
/** Palavras da seção de estado (os contadores). */
const STATE_WORDS = 32;
/** Palavras de um registro de argumentos indiretos. */
const INDIRECT_WORDS = 5;
/** Bits da palavra de grupo de cada instância (ver `shadow_pages_constants.wgsl`). */
const SKIP = 0x80000000;
const DEFORMING = 0x40000000;

const PARAMS = 'shadow_pages_params';
const SCRATCH = 'shadow_pages_scratch';
const GROUPS = 'shadow_pages_groups';
const ARGS = 'shadow_pages_args';
const PAIRS = 'shadow_pages_pairs';
const RECTS = 'rects';

/** Capacidades do trabalho (crescem por dobra). */
interface Capacity {
    groups: number;
    instances: number;
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
    const needBase = groupPairsBase + c.groups * 3;
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
        words: needBase + SHADOW_MAX_LEVELS * c.pagesPerLevel * c.pagesPerLevel,
    };
}

/**
 * Resource de trabalho do `ShadowFlow` (spec 039): os parâmetros do quadro, o espaço de trabalho das páginas, os grupos,
 * os argumentos indiretos (um registro por grupo e o do fundo das páginas sujas), os pares e a série dos retângulos das
 * instâncias.
 */
class ShadowWork extends FlowWork {
    static readonly schema = new StructSchema('ShadowWork', {});
    capacity: Capacity = { groups: 1, instances: 1, pagesPerLevel: 4, atlasPages: 16 };

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
                    wordBuffer(ARGS, (c.groups + 1) * INDIRECT_WORDS * 4, 'indirect'),
                    wordBuffer(PAIRS, PAIR_CAPACITY * 4),
                    {
                        id: RECTS,
                        role: 'storage-texture',
                        textureShape: {
                            format: 'rgba32float',
                            width: RECTS_WIDTH,
                            height: Math.ceil(c.instances / RECTS_WIDTH),
                            access: 'write-only',
                        },
                        history: { depth: 2 },
                    },
                ];
            },
        });
    }
}

/** Prefixo da chave dos grupos que não projetam sombra (material com `castsShadow` falso): não desenhados. */
const NO_SHADOW = 'no-shadow|';

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
        pages: slot.channel(ShadowMap.schema, 'pages', { select }),
        requests: slot.channel(ShadowMap.schema, 'requests', { select }),
        atlas: slot.channel(ShadowMap.schema, 'depth', { select }),
        rects: slot.channel(ShadowWork.schema, RECTS, { optional: true }),
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

/** O desenho das páginas de uma orientação: recortado pelo hardware (`clip`) ou com o descarte no fragmento. */
function depthPipeline(
    faces: GPUFrontFace | 'two',
    clip: boolean,
    preferAsync: boolean,
): PipelineDescriptor {
    return {
        id: `shadow_depth:${faces}`,
        role: 'render',
        shader: clip ? shadowDepthClip : shadowDepth,
        entryPoints: clip ? ['shadow_depth_vs'] : ['shadow_depth_discard_vs', 'shadow_depth_fs'],
        colorTargets: [],
        topology: 'triangle-list',
        // As duas faces do material de dois lados (T061a).
        cullMode: faces === 'two' ? 'none' : 'back',
        frontFace: faces === 'two' ? 'ccw' : faces,
        vertexBuffers: VERTEX_LAYOUT,
        depth: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
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
    'sp_pairs_count_main',
    'sp_pairs_base_main',
    'sp_pairs_main',
] as const;

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
 * se moveu ou se deformou são desenhadas; as demais seguem do quadro anterior (a tabela é série temporal de fatias,
 * refeita da anterior a cada quadro; o atlas é série por páginas — um alvo só, com o carimbo de cada página e a época da
 * C2, T060a).
 *
 * No quadro: a caixa de cada geometria (um despacho por geometria, ligado aos vértices dela), as etapas das páginas
 * (`shadow_pages.wgsl`: os retângulos das instâncias no plano da luz e quem se moveu, a tabela, as páginas livres, a
 * alocação do mais grosso ao mais fino até o orçamento do quadro, com o carimbo das páginas escritas, e os pares
 * instância × página suja) e o desenho — o fundo das sujas e um desenho indireto por grupo de instâncias (geometria,
 * orientação) com uma instância por par, recortado à página. A CPU não acompanha a luz nem as páginas: escreve só os
 * grupos quando mudam e os parâmetros do quadro.
 */
export class ShadowFlow extends Flow<ShadowSlots, 'idle'> {
    readonly type = 'ShadowFlow';
    readonly slots: ShadowSlots;
    override readonly pipelines: readonly PipelineDescriptor[];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<ShadowSlots>>;

    private readonly core: EngineCore;
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
        this.groupDraws.reserve(1);
        this.boundsGroups.reserve(1);
        this.slots = slotsOf(ctx.world, this.work);
        const async = options.preferAsync === true;
        const clip = ctx.core.capabilities().features.includes('clip-distances');
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
            {
                id: 'shadow_clear',
                role: 'render',
                shader: shadowDepth,
                entryPoints: ['shadow_clear_vs'],
                topology: 'triangle-list',
                cullMode: 'none',
                depth: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'always' },
                ...(async ? { preferAsync: true } : {}),
            },
            depthPipeline('ccw', clip, async),
            depthPipeline('cw', clip, async),
            depthPipeline('two', clip, async),
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
        const clear = bound.render('shadow_clear');
        const ccw = bound.render('shadow_depth:ccw');
        const cw = bound.render('shadow_depth:cw');
        const two = bound.render('shadow_depth:two');
        if (!clear.ready) return;
        const atlas = bound.slots.atlas;
        const view = atlas.view(0);
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
            const once = (index: number, workgroups: number): void => {
                const step = steps[index]!;
                pass.bind.setPipeline(step.spec);
                step.bindTo(pass.bind);
                pass.dispatch.workgroups(workgroups);
            };
            run(1, this.instanceCount);
            run(2, entries);
            // As filas: um grupo de trabalho por nível.
            once(3, SHADOW_MAX_LEVELS);
            once(4, 1);
            once(5, 1);
            run(6, SHADOW_PAGE_BUDGET * this.instanceCount);
            once(7, 1);
            run(8, SHADOW_PAGE_BUDGET * this.instanceCount);
        });
        const target: RenderTarget = {
            colorAttachments: [],
            depthStencilAttachment: {
                view,
                depthLoadOp: 'load',
                depthStoreOp: 'store',
            },
        };
        const groups = bound.slots.casters.groups;
        frame.render(target, 'ShadowFlow', (pass) => {
            // O fundo das páginas sujas e os grupos nelas; as demais seguem no atlas (a série por páginas).
            pass.bind.setPipeline(clear.spec);
            clear.bindTo(pass.bind);
            pass.draw.indirect(args, this.groupCount * INDIRECT_WORDS * 4);
            let current: PreparedRender | undefined;
            groups.forEach((group, index) => {
                if (group.key.startsWith(NO_SHADOW)) return;
                const entry = group.representative;
                const geometry = entry.get(Geometry);
                const vertices = this.resources.bufferOf(geometry, 'vertices');
                if (vertices?.subkind !== 'vertex') return;
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
        });
        bound.slots.pages.written();
        atlas.written();
        bound.slots.rects?.written();
    }

    /** O trabalho é do `ShadowWork` (a C2 o libera com ele). */
    override dispose(): void {
        this.bounds.clear();
        this.boundsGroupsOf = [];
        this.indirectSources.clear();
    }

    /** O quadro: as capacidades, os grupos, as caixas, as ligações privadas e os parâmetros. */
    private prepare(ctx: Ctx): void {
        const s = ctx.bound.slots;
        const map = s.caster.resource as ShadowMap;
        const id = this.world.entityIdOfResource(map);
        const casterSlot = id === undefined ? undefined : s.matrices.slotOf(id);
        const groups = s.casters.groups;
        this.active = casterSlot !== undefined && groups.length > 0;
        if (!this.active || casterSlot === undefined) return;
        const instances = Math.max(1, ...groups.map((g) => g.first + g.count));
        const { pagesPerLevel, atlasPages } = map.data;
        this.ensureCapacity(groups.length, instances, pagesPerLevel, atlasPages);
        this.writeGroups(ctx, instances);
        if (!this.bindPrivate(ctx)) {
            this.active = false;
            return;
        }
        this.writeParams(ctx, casterSlot);
    }

    /** Capacidades do trabalho (por dobra); mudadas, a C2 realoca e o cache recomeça. */
    private ensureCapacity(
        groups: number,
        instances: number,
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
            pagesPerLevel,
            atlasPages,
        };
        if (
            next.groups === c.groups
            && next.instances === c.instances
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
        const target = this.resources.bufferOf(this.work, GROUPS);
        const argsBuffer = this.resources.bufferOf(this.work, ARGS);
        const key = [
            target === undefined ? 0 : this.idOf(target),
            argsBuffer === undefined ? 0 : this.idOf(argsBuffer),
            this.groupDraws.generation,
            this.boundsGroups.generation,
            content,
        ].join(';');
        this.indirectSources.clear();
        // Sem 'indirect-first-instance' a malha adaptativa fica no nível máximo: a contagem é a da capacidade.
        const adaptive = this.core.capabilities().features.includes('indirect-first-instance');
        groups.forEach((group, index) => {
            if (!adaptive) return;
            const source = this.resources.bufferOf(group.representative.get(Geometry), 'indirect');
            if (source?.subkind === 'indirect' && !group.key.startsWith(NO_SHADOW))
                this.indirectSources.set(index, source);
        });
        if (key === this.groupsKey && !this.regroup) return;
        this.regroup = false;
        const c = this.work.capacity;
        const words = new Uint32Array(c.groups * 4 + c.instances);
        // As posições da lista sem instância de grupo (a lista da C2 tem buracos) ficam fora do desenho.
        words.fill(SKIP, c.groups * 4);
        const args = new Uint32Array((c.groups + 1) * INDIRECT_WORDS);
        groups.forEach((group, index) => {
            const geometry = group.representative.get(Geometry);
            // Fora do desenho só o que não projeta; a geometria ainda sem vértices fica com a caixa vazia (zerada a cada
            // quadro) até o kernel dela rodar.
            const skip = group.key.startsWith(NO_SHADOW);
            const deforming = this.resources.hasGpuWriter(geometry, 'vertices');
            words.set([group.first, group.count, 0, index], index * 4);
            const word = index | (skip ? SKIP : 0) | (deforming ? DEFORMING : 0);
            for (let j = 0; j < group.count; j++)
                words[c.groups * 4 + group.first + j] = word >>> 0;
            const indices = this.resources.bufferOf(geometry, 'indices');
            const count = indices?.subkind === 'index' ? indices.count : geometry.vertexCount;
            args.set([count, 0, 0, 0, 0], index * INDIRECT_WORDS);
            this.groupDraws.write(index, { group: index });
            this.boundsGroups.write(index, { group: index });
        });
        // O fundo das páginas sujas: 6 vértices por página.
        args.set([6, 0, 0, 0], groups.length * INDIRECT_WORDS);
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
        if (
            params === undefined
            || scratch === undefined
            || groups === undefined
            || args === undefined
            || pairs === undefined
        )
            return false;
        const key = [
            params,
            scratch,
            groups,
            args,
            pairs,
            this.groupDraws.generation,
            this.boundsGroups.generation,
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
                ]),
            );
            this.boundSources = key;
            this.boundsDirty = true;
        }
        if (this.boundsDirty) this.rebuildBounds(ctx, params, scratch, key);
        return true;
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
     * vértices e os mesmos buffers do trabalho reaproveitam o kernel.
     */
    private rebuildBounds(
        ctx: Ctx,
        params: AnyBufferSpec,
        scratch: AnyBufferSpec,
        generation: string,
    ): void {
        this.boundsDirty = false;
        const used = new Set<AnyBufferSpec>();
        this.boundsGroupsOf = [];
        ctx.bound.slots.casters.groups.forEach((group, index) => {
            const vertices = this.resources.bufferOf(
                group.representative.get(Geometry),
                'vertices',
            );
            if (vertices === undefined || vertices.subkind === 'staging') {
                // A geometria ainda sem buffer (alocado no envio do quadro): tenta de novo no próximo.
                if (!group.key.startsWith(NO_SHADOW)) this.boundsDirty = true;
                return;
            }
            used.add(vertices);
            let b = this.bounds.get(vertices);
            if (b?.generation !== generation) {
                b = {
                    generation,
                    kernel: this.work.pipelines.kernel({
                        discriminator: `shadow_bounds:${this.idOf(vertices)}`,
                        shader: shadowPages,
                        entryPoint: 'sp_bounds_main',
                        bindings: new Map<WgslResource, BindingSource>([
                            [shadowResources.vertices, vertices],
                            [shadowResources.scratch, scratch as BindingSource],
                            [shadowResources.params, params as BindingSource],
                            [shadowResources.geometry, this.boundsGroups.source()],
                        ]),
                    }),
                };
                this.bounds.set(vertices, b);
            }
            this.boundsGroupsOf.push({ group: index, kernel: b.kernel });
        });
        for (const v of [...this.bounds.keys()]) if (!used.has(v)) this.bounds.delete(v);
    }

    /** Os parâmetros do quadro: o recomeço (séries interrompidas, grupos mudados), os pedidos e as seções. */
    private writeParams(ctx: Ctx, casterSlot: number): void {
        const s = ctx.bound.slots;
        const continuous = (lag1: number | undefined): boolean => lag1 === 1;
        this.reset = this.reset || !continuous(s.pages.age(1)) || !continuous(s.rects?.age(1));
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
            rectsWidth: RECTS_WIDTH,
            instanceGroupBase: this.work.capacity.groups * 4,
            clearRecord: this.groupCount,
            groupPairsBase: layout.groupPairsBase,
            needBase: layout.needBase,
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
