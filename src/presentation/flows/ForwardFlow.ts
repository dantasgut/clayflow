import type { EntityId } from '../../scene/world/EntityId';
import type {
    EngineCore,
    Frame,
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
import { Material } from '../../elements/material/Material';
import { ForwardFrameParamsSchema, NO_LIGHT_SLOT } from '../../elements/material/forwardSchemas';
import { Camera } from '../../elements/scene/Camera';
import { Light } from '../../elements/scene/Light';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { Transform } from '../../elements/scene/Transform';
import { renderableRecord, RenderInstanceSchema } from '../../elements/scene/Renderable';
import { FrameTargets } from '../app/FrameTargets';
import { castingShadowMap, isMirrored } from './ShadowFlow';

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
 * (pipeline) e orientação das faces (escala espelhada). Geometria sem chave de conteúdo é própria da entidade.
 */
export function forwardGroupKey(entry: EntityEntry): string {
    const geometry = entry.get(Geometry).contentKey ?? `entity:${entry.entityId}`;
    const shader = entry.get(Material).getPipelineDescriptors()[0]?.id ?? '';
    return `${geometry}|${shader}|${isMirrored(entry.get(Transform)) ? 'cw' : 'ccw'}`;
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
        const groups = bound.slots.renderables.groups;
        frame.render(renderTarget, 'ForwardFlow', (pass) => {
            let shared = false;
            let current: PreparedRender | undefined;
            for (const group of groups) {
                const entry = group.representative;
                const shader = this.materialShader.get(entry.get(Material));
                const ids = shader === undefined ? undefined : this.materialPipelines.get(shader);
                if (ids === undefined) continue;
                const prepared = bound.pipelines.get(
                    isMirrored(entry.get(Transform)) ? ids.cw : ids.ccw,
                );
                if (prepared?.role !== 'render' || !prepared.ready) continue; // compilando em segundo plano
                // A geometria do grupo é a mesma cópia para todos os membros (mesma chave de conteúdo).
                const geometry = entry.get(Geometry);
                const vertices = this.resources.bufferOf(geometry, 'vertices');
                const indices = this.resources.bufferOf(geometry, 'indices');
                if (vertices?.subkind !== 'vertex' || indices?.subkind !== 'index') continue;
                if (prepared !== current) {
                    pass.bind.setPipeline(prepared.spec);
                    if (!shared) {
                        // Câmera, mundo + registros + instâncias e sombra: os mesmos para todos os pipelines do passe.
                        pass.bind
                            .setBindGroup(0, prepared.groups[0]!)
                            .setBindGroup(1, prepared.groups[1]!)
                            .setBindGroup(3, prepared.groups[3]!);
                        shared = true;
                    }
                    // Material: o pool do schema do pipeline, indexado no shader pelo registro.
                    pass.bind.setBindGroup(2, prepared.groups[2]!);
                    current = prepared;
                }
                pass.geometry.vertex(0, vertices).index(indices);
                pass.draw.indexed(indices.count, group.count, 0, 0, group.first);
            }
        });
    }

    /** Libera os recursos privados. */
    override dispose(): void {
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
     * Prepara os pipelines (orientação direta e espelhada) do shader de cada material que entrou na cena — das
     * entidades `ids` (as adicionadas), ou de todas. Custo proporcional às entidades novas, não à cena. Material cujo
     * pool ainda não existe fica pendente e é tentado de novo em `framePrepare`.
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
            if (this.materialShader.has(material)) {
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
            if (this.materialPipelines.has(desc.id)) continue;
            const variant = (frontFace: GPUFrontFace): string => {
                const descriptor: PipelineDescriptor = {
                    ...desc,
                    id: `forward:${desc.id}:${frontFace}`,
                    // Topologia do material ignorada: triângulos com descarte de faces de trás (como antes da 006).
                    topology: 'triangle-list',
                    cullMode: 'back',
                    frontFace,
                    vertexBuffers: VERTEX_LAYOUT,
                    colorTargets: [{ format }],
                    depth: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
                    ...(this.preferAsync ? { preferAsync: true } : {}),
                };
                ctx.prepare(descriptor);
                return descriptor.id;
            };
            this.materialPipelines.set(desc.id, { ccw: variant('ccw'), cw: variant('cw') });
        }
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
