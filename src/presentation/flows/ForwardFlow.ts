import type { EntityId } from '../../scene/world/EntityId';
import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    IndexBufferSpec,
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
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../scene/flows/createComputeKernel';
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
import { EdgeParamsSchema } from '../../elements/geometry/edges';
import { edgesFromTriangles } from '../../elements/geometry/shaders';
import { Material } from '../../elements/material/Material';
import { ForwardFrameParamsSchema, NO_LIGHT_SLOT } from '../../elements/material/forwardSchemas';
import { Camera } from '../../elements/scene/Camera';
import { Light } from '../../elements/scene/Light';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { Transform } from '../../elements/scene/Transform';
import { renderableRecord, RenderInstanceSchema } from '../../elements/scene/Renderable';
import { FrameTargets } from '../app/FrameTargets';
import { castingShadowMap } from './ShadowFlow';

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

/** Índices de arestas de uma malha (desenho em linhas), gerados por kernel a partir dos índices de triângulo. */
interface EdgeIndex {
    readonly buffer: IndexBufferSpec;
    readonly params: UniformBufferSpec;
    readonly kernel: ComputeKernel;
    readonly triangles: number;
    /** O kernel ainda não rodou (roda no próximo quadro, antes do passe). */
    pending: boolean;
}

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
    /** Pool `Light` (direção da luz que ilumina pelo `lightSlot`; opcional). */
    readonly lights: PoolSlot<true>;
    /** Cor dos `FrameTargets` (com pós) ou o canvas; profundidade dos `FrameTargets`. */
    readonly target: TargetSlot;
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
    return `${geometry}|${shader}|${topology}|${face}`;
}

function slotsOf(world: World, output: ForwardOutput): ForwardSlots {
    const select = castingShadowMap(world);
    const depth = { schema: FrameTargets.schema, descId: 'depth' };
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
        lights: slot.pool(Light.schema.name, { optional: true }),
        target: slot.target(
            output === 'scene'
                ? { color: { schema: FrameTargets.schema, descId: 'color' }, depth }
                : { color: 'canvas', depth },
        ),
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
    /** Família de layout de cada pipeline: os grupos 0, 1 e 3 são religados quando a família muda no passe. */
    private readonly pipelineFamily = new Map<string, 'forward' | 'points'>();
    /**
     * Pipelines de sprites de vértice (`point-list`), um por (shader do material, vertex buffer da geometria): os
     * vértices são um binding privado do pipeline. Contagem de entidades por pipeline (liberado com a última).
     */
    private readonly pointPipelines = new Map<string, { readonly id: string; users: number }>();
    /** Pipeline de sprites de cada entidade que o usa (para liberar na saída). */
    private readonly pointOfEntity = new Map<EntityId, string>();
    /** Índices de arestas (`line-list`) por buffer de índices de triângulo, gerados por kernel. */
    private readonly edges = new Map<AnyBufferSpec, EdgeIndex>();
    /** Geometrias escritas pela GPU sem escritor já avisadas. */
    private readonly warnedWriter = new WeakSet<Geometry>();
    private pointCounter = 0;
    private edgeCounter = 0;
    /** Número de cada vertex buffer com pipeline de sprites (nome estável do pipeline). */
    private readonly pointKeys = new Map<AnyBufferSpec, number>();
    /** Quando true, o passe grava os timestamps do profiler (`timestamp-query`); sem a feature, nada muda. */
    profileTimestamps = false;

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
        this.bindings = {
            forward_frame: this.frameParams,
            shadow_sampler: this.sampler,
            shadow_map: this.dummyDepthView,
            shadow_maps: this.dummyShadowMaps,
            shadow_matrices: this.dummyShadowMatrices,
            lights: this.dummyLights,
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
                        this.releasePoints(c, e.removed);
                        this.prepareMaterials(c, e.added);
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                canvasReconfigured: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        if (this.pendingMaterials.size > 0)
                            this.prepareMaterials(c, [...this.pendingMaterials]);
                        this.prepareGroups(c);
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
        const colorView = this.colorView(frame, target);
        if (colorView === undefined || target.depth === undefined) return;
        const tsWrites = this.profileTimestamps
            ? this.core.profiler.timestampWritesFor(0, 1)
            : undefined;
        const renderTarget: RenderTarget = {
            colorAttachments: [
                { view: colorView, clearValue: CLEAR_COLOR, loadOp: 'clear', storeOp: 'store' },
            ],
            depthStencilAttachment: {
                view: target.depth,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
            ...(tsWrites !== undefined ? { timestampWrites: tsWrites } : {}),
        };
        // Índices de arestas novos ou refeitos: gerados antes do passe (kernel criado em `framePrepare`).
        for (const edge of this.edges.values()) {
            if (!edge.pending) continue;
            edge.pending = false;
            frame.compute('ForwardFlow.edges', (pass) => {
                pass.bind.setPipeline(edge.kernel.pipeline);
                edge.kernel.bindGroups.forEach((group, g) => pass.bind.setBindGroup(g, group));
                pass.dispatch.invocations(edge.triangles, 64);
            });
        }
        const groups = bound.slots.renderables.groups;
        frame.render(renderTarget, 'ForwardFlow', (pass) => {
            let family: 'forward' | 'points' | undefined;
            let current: PreparedRender | undefined;
            for (const group of groups) {
                const entry = group.representative;
                const id = this.pipelineOf(entry);
                if (id === undefined) continue;
                const prepared = bound.pipelines.get(id);
                if (prepared?.role !== 'render' || !prepared.ready) continue; // compilando em segundo plano
                // A geometria do grupo é a mesma cópia para todos os membros (mesma chave de conteúdo).
                const geometry = entry.get(Geometry);
                const topology = entry.get(Material).topology;
                const vertices = this.resources.bufferOf(geometry, 'vertices');
                if (vertices?.subkind !== 'vertex') continue;
                const indices = this.resources.bufferOf(geometry, 'indices');
                const lineIndices =
                    topology === 'line-list' && indices !== undefined
                        ? this.edges.get(indices)?.buffer
                        : undefined;
                if (topology === 'line-list' && indices !== undefined && lineIndices === undefined)
                    continue;
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
                    } else if (next === 'points') {
                        // Os vértices da geometria são um binding privado (grupo 3) de cada pipeline de sprites.
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
                pass.geometry.vertex(0, vertices);
                const drawn = lineIndices ?? (indices?.subkind === 'index' ? indices : undefined);
                if (drawn?.subkind === 'index') {
                    pass.geometry.index(drawn);
                    pass.draw.indexed(drawn.count, group.count, 0, 0, group.first);
                } else {
                    // Geometria sem índices (ex.: escrita por um estágio): desenho direto pela contagem de vértices.
                    pass.draw.vertices(geometry.vertexCount, group.count, 0, group.first);
                }
            }
        });
    }

    /** Libera os recursos privados. */
    override dispose(): void {
        for (const edge of this.edges.values()) this.destroyEdges(edge);
        this.edges.clear();
        for (const spec of [
            this.frameParams,
            this.sampler,
            this.dummyDepthView,
            this.dummyDepth,
            this.dummyShadowMaps,
            this.dummyShadowMatrices,
            this.dummyLights,
        ]) {
            this.core.destroy(spec);
        }
    }

    /** Mapa de sombra da luz que projeta e o pool de luzes (ou os substitutos) nos bindings do grupo 3. */
    private bindShadow(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        ctx.bind({
            shadow_map: slots.shadowTexture?.view ?? this.dummyDepthView,
            shadow_maps: slots.shadowMaps?.buffer ?? this.dummyShadowMaps,
            shadow_matrices: slots.shadowMatrices?.buffer ?? this.dummyShadowMatrices,
            lights: slots.lights?.buffer ?? this.dummyLights,
        });
    }

    /**
     * Prepara os pipelines do shader de cada material que entrou na cena — das entidades `ids` (as adicionadas), ou de
     * todas — conforme a topologia do material (spec 008): triângulos com as duas orientações de face, linhas (vértices
     * da geometria com os índices de arestas) e pontos (sprites; um pipeline por vertex buffer de geometria). Custo
     * proporcional às entidades novas, não à cena. Material cujo pool ainda não existe fica pendente e é tentado de novo
     * em `framePrepare`.
     */
    private prepareMaterials(ctx: Ctx, ids?: readonly EntityId[]): void {
        const renderables = ctx.bound.slots.renderables;
        const entries =
            ids === undefined
                ? renderables.entries
                : ids.map((id) => renderables.entry(id)).filter((e) => e !== undefined);
        const format = ctx.bound.slots.target.format ?? this.core.canvasFormat;
        for (const entry of entries) {
            const material = entry.get(Material);
            const topology = material.topology;
            if (this.materialShader.has(material) && topology !== 'point-list') {
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
            if (topology === 'point-list') {
                this.preparePoints(ctx, entry.entityId, desc, entry.get(Geometry), format);
                continue;
            }
            if (this.materialPipelines.has(desc.id)) continue;
            const variant = (suffix: string, extra: Partial<PipelineDescriptor>): string => {
                const descriptor: PipelineDescriptor = {
                    ...desc,
                    id: `forward:${desc.id}:${suffix}`,
                    topology,
                    vertexBuffers: VERTEX_LAYOUT,
                    colorTargets: [{ format }],
                    depth: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
                    ...extra,
                    ...(this.preferAsync ? { preferAsync: true } : {}),
                };
                ctx.prepare(descriptor);
                this.pipelineFamily.set(descriptor.id, 'forward');
                return descriptor.id;
            };
            if (topology === 'triangle-list') {
                this.materialPipelines.set(desc.id, {
                    ccw: variant('ccw', { cullMode: 'back', frontFace: 'ccw' }),
                    cw: variant('cw', { cullMode: 'back', frontFace: 'cw' }),
                });
            } else {
                // Linhas e faixas: sem descarte de faces; uma variante para as duas orientações.
                const id = variant('lines', { cullMode: 'none' });
                this.materialPipelines.set(desc.id, { ccw: id, cw: id });
            }
        }
    }

    /**
     * Pipeline de sprites do material sobre a geometria da entidade: os vértices da geometria são um binding privado
     * dele (`point_vertices`, lidos como storage). Um por (shader, vertex buffer), contado por entidade.
     */
    private preparePoints(
        ctx: Ctx,
        entity: EntityId,
        desc: PipelineDescriptor,
        geometry: Geometry,
        format: GPUTextureFormat,
    ): void {
        const vertices = this.resources.bufferOf(geometry, 'vertices');
        if (vertices?.subkind !== 'vertex' || this.pointOfEntity.has(entity)) return;
        const key = `${desc.id}|${String(this.pointKeys.get(vertices) ?? this.newPointKey(vertices))}`;
        let pipeline = this.pointPipelines.get(key);
        if (pipeline === undefined) {
            const id = `forward:${desc.id}:points:${this.pointKeys.get(vertices)!}`;
            ctx.bind({ [`${id}:point_vertices`]: vertices });
            ctx.prepare({
                ...desc,
                id,
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [{ format }],
                depth: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
                ...(this.preferAsync ? { preferAsync: true } : {}),
            });
            this.pipelineFamily.set(id, 'points');
            pipeline = { id, users: 0 };
            this.pointPipelines.set(key, pipeline);
        }
        pipeline.users++;
        this.pointOfEntity.set(entity, key);
    }

    /** Número estável de um vertex buffer (nome do pipeline de sprites dele). */
    private newPointKey(vertices: AnyBufferSpec): number {
        const n = this.pointCounter++;
        this.pointKeys.set(vertices, n);
        return n;
    }

    /** Entidades que saíram: libera o pipeline de sprites com a última entidade que o usava. */
    private releasePoints(ctx: Ctx, ids: readonly EntityId[]): void {
        for (const id of ids) {
            const key = this.pointOfEntity.get(id);
            if (key === undefined) continue;
            this.pointOfEntity.delete(id);
            const pipeline = this.pointPipelines.get(key)!;
            if (--pipeline.users > 0) continue;
            this.pointPipelines.delete(key);
            this.pipelineFamily.delete(pipeline.id);
            ctx.release(pipeline.id);
        }
    }

    /** Pipeline do grupo: pela topologia do material, a orientação das faces e a geometria (sprites). */
    private pipelineOf(entry: EntityEntry): string | undefined {
        const material = entry.get(Material);
        const shader = this.materialShader.get(material);
        if (shader === undefined) return undefined;
        if (material.topology === 'point-list') {
            const key = this.pointOfEntity.get(entry.entityId);
            return key === undefined ? undefined : this.pointPipelines.get(key)?.id;
        }
        const ids = this.materialPipelines.get(shader);
        if (ids === undefined) return undefined;
        return entry.get(Transform).mirrored ? ids.cw : ids.ccw;
    }

    /**
     * Antes da gravação: os índices de arestas dos grupos em linhas (criados para índices de triângulo novos, com o kernel
     * pendente; liberados quando nenhum grupo os usa) e o aviso único de geometria escrita pela GPU sem escritor.
     * Percorre os grupos (não as entidades).
     */
    private prepareGroups(ctx: Ctx): void {
        const used = new Set<AnyBufferSpec>();
        for (const group of ctx.bound.slots.renderables.groups) {
            const entry = group.representative;
            const geometry = entry.get(Geometry);
            this.warnWithoutWriter(geometry);
            if (entry.get(Material).topology !== 'line-list') continue;
            const indices = this.resources.bufferOf(geometry, 'indices');
            if (indices?.subkind !== 'index') continue;
            used.add(indices);
            if (!this.edges.has(indices)) this.edges.set(indices, this.createEdges(indices));
        }
        for (const [indices, edge] of this.edges) {
            if (used.has(indices)) continue;
            this.destroyEdges(edge);
            this.edges.delete(indices);
        }
    }

    /** Buffer de índices de arestas (6 por triângulo, `uint32`) e o kernel que o preenche a partir dos triângulos. */
    private createEdges(indices: IndexBufferSpec): EdgeIndex {
        const triangles = Math.floor(indices.count / 3);
        const n = this.edgeCounter++;
        const buffer = this.core.create<IndexBufferSpec>({
            kind: 'buffer',
            subkind: 'index',
            discriminator: `forward_edges:${n}`,
            byteSize: Math.max(4, triangles * 6 * 4),
            count: triangles * 6,
            format: 'uint32',
        });
        const params = this.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: `forward_edge_params:${n}`,
            byteSize: EdgeParamsSchema.stride,
        });
        this.core.write(
            params,
            EdgeParamsSchema.pack({
                triangleCount: triangles,
                indices16: indices.format === 'uint16' ? 1 : 0,
            }),
        );
        const kernel = createComputeKernel(this.core, {
            discriminator: `forward_edges:${n}`,
            shader: edgesFromTriangles,
            entryPoint: 'edges_from_triangles_main',
            bindings: { edge_params: params, triangle_indices: indices, edge_indices: buffer },
        });
        return { buffer, params, kernel, triangles, pending: true };
    }

    private destroyEdges(edge: EdgeIndex): void {
        destroyComputeKernel(this.core, edge.kernel);
        this.core.destroy(edge.buffer);
        this.core.destroy(edge.params);
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

    /**
     * Parâmetros do quadro: slot da câmera ativa e, com a luz que projeta sombra, o slot dela no pool `Light` (a
     * direção é lida no shader; sem ela, a padrão), sombra ligada e o slot do mapa — escritos só quando mudam. Nenhum
     * dado da luz é lido na CPU.
     */
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
        const key = `${cameraSlot}:${light}:${shadow}`;
        if (key === this.writtenFrame) return;
        this.core.write(
            this.frameParams,
            ForwardFrameParamsSchema.pack({
                cameraSlot,
                lightSlot: light,
                shadowEnabled: on ? 1 : 0,
                shadowSlot: shadow,
            }),
        );
        this.writtenFrame = key;
    }
}
