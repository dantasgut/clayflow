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
import type { Resource } from '../../scene/contracts/Resource';
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
import { slot } from '../../scene/flows/slots';
import type { World } from '../../scene/world/World';
import { Geometry } from '../../elements/geometry/Geometry';
import { Material } from '../../elements/material/Material';
import { ForwardFrameParamsSchema } from '../../elements/material/forwardSchemas';
import { Camera } from '../../elements/scene/Camera';
import { DirectionalLight } from '../../elements/scene/DirectionalLight';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { Transform } from '../../elements/scene/Transform';
import { FrameTargets } from '../app/FrameTargets';
import { castingShadowMap, isMirrored } from './ShadowFlow';

/** Direção da luz sem luz que projeta sombra (a de antes da 006). */
const DEFAULT_LIGHT_DIR: readonly number[] = [0.4, -1, 0.6, 0];
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

function slotsOf(world: World, output: ForwardOutput) {
    const select = castingShadowMap(world);
    const depth = { schema: FrameTargets.schema, descId: 'depth' };
    return {
        camera: slot.singleton(Camera.schema),
        world: slot.pool(Transform.worldSchema.name),
        renderables: slot.entities({ all: [Geometry, Material, Transform] }),
        caster: slot.singleton(ShadowMap.schema, { optional: true, select }),
        shadowTexture: slot.texture(ShadowMap.schema, 'depth', { optional: true, select }),
        shadowMaps: slot.pool(ShadowMap.schema.name, { optional: true }),
        target: slot.target(
            output === 'scene'
                ? { color: { schema: FrameTargets.schema, descId: 'color' }, depth }
                : { color: 'canvas', depth },
        ),
    };
}

/** Slots do render principal. */
export type ForwardSlots = ReturnType<typeof slotsOf>;

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
 *   - grupo 0: a câmera ativa (`consumes: 'Camera'`), enviada pela C2 quando muda;
 *   - grupo 1: o pool `WorldTransform` (produzido pelo `TransformFlow`), lido pelo slot da entidade
 *     (`firstInstance` do draw);
 *   - grupo 2: o pool uniforme do material do seu schema, com offset dinâmico `slot × stride` por desenho;
 *   - grupo 3: parâmetros do quadro (direção da luz, sombra ligada, slot do mapa), o mapa de sombra da luz que
 *     projeta (`ShadowMap`: textura e, pelo pool, matriz e viés) e o sampler de comparação;
 *   - vértices e índices: os buffers da `Geometry` alocados pela C2.
 *
 * Os grupos 0, 1 e 3 são definidos uma vez por passe; pipeline e grupo 2 só quando mudam entre desenhos. Um pipeline
 * por shader de material e orientação de faces (escala espelhada ⇒ `frontFace: 'cw'`), preparado numa transição
 * quando o material entra na cena. Recursos privados (parâmetros do quadro, sampler, substitutos da sombra) são
 * religados em transições.
 */
export class ForwardFlow extends RenderFlow<ForwardSlots, 'idle'> {
    readonly type = 'ForwardFlow';
    readonly slots: ForwardSlots;
    override readonly bindings: BindingSources;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly preferAsync: boolean;
    private readonly frameParams: UniformBufferSpec;
    private readonly sampler: SamplerSpec;
    private readonly dummyDepth: TextureSpec;
    private readonly dummyDepthView: TextureViewSpec;
    private readonly dummyShadowMaps: StorageBufferSpec;
    /** Conteúdo escrito em `ForwardFrameParams` (comparado para escrever só quando muda). */
    private writtenFrame = '';
    /** Pipelines (por orientação) do shader de cada material, preparados quando o material aparece. */
    private readonly materialPipelines = new Map<
        string,
        { readonly ccw: string; readonly cw: string }
    >();
    /** Chave do pool e id do shader por material (pelo descritor; reconhecido uma vez por instância). */
    private readonly materialInfo = new WeakMap<
        Material,
        { readonly pool: string; readonly shader: string; readonly stride: number }
    >();
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
        this.bindings = {
            forward_frame: this.frameParams,
            shadow_sampler: this.sampler,
            shadow_map: this.dummyDepthView,
            shadow_maps: this.dummyShadowMaps,
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
                    run: (_e, c) => {
                        this.prepareMaterials(c);
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                canvasReconfigured: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.writeFrameParams(c);
                    },
                },
            },
        };
    }

    /** Grava o passe principal: grupos compartilhados uma vez; por desenho, pipeline e material só quando mudam. */
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
        const entries = bound.slots.renderables.entries;
        const world = bound.slots.world;
        frame.render(renderTarget, 'ForwardFlow', (pass) => {
            let shared = false;
            let current: PreparedRender | undefined;
            let currentMaterial: string | undefined;
            let currentOffset = -1;
            for (const entry of entries) {
                const worldSlot = world.slotOf(entry.entityId);
                if (worldSlot === undefined) continue; // ainda sem slot ⇒ não desenha neste quadro
                const material = entry.get(Material);
                const info = this.materialInfo.get(material);
                const ids =
                    info === undefined ? undefined : this.materialPipelines.get(info.shader);
                if (info === undefined || ids === undefined) continue;
                const prepared = bound.pipelines.get(
                    isMirrored(entry.get(Transform)) ? ids.cw : ids.ccw,
                );
                if (prepared?.role !== 'render' || !prepared.ready) continue; // compilando em segundo plano
                const materialSlot = this.resources.poolSlotOf(info.pool, entry.entityId);
                const geometry = entry.get(Geometry);
                const vertices = this.resources.bufferOf(geometry, 'vertices');
                const indices = this.resources.bufferOf(geometry, 'indices');
                if (
                    materialSlot === undefined
                    || vertices?.subkind !== 'vertex'
                    || indices?.subkind !== 'index'
                ) {
                    continue;
                }
                if (prepared !== current) {
                    pass.bind.setPipeline(prepared.spec);
                    current = prepared;
                }
                if (!shared) {
                    // Câmera, mundo e sombra: os mesmos para todos os pipelines do passe.
                    pass.bind
                        .setBindGroup(0, prepared.groups[0]!)
                        .setBindGroup(1, prepared.groups[1]!)
                        .setBindGroup(3, prepared.groups[3]!);
                    shared = true;
                }
                const offset = materialSlot * info.stride;
                if (info.pool !== currentMaterial || offset !== currentOffset) {
                    pass.bind.setBindGroup(2, prepared.groups[2]!, [offset]);
                    currentMaterial = info.pool;
                    currentOffset = offset;
                }
                pass.geometry.vertex(0, vertices).index(indices);
                pass.draw.indexed(indices.count, 1, 0, 0, worldSlot);
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
        ]) {
            this.core.destroy(spec);
        }
    }

    /** Mapa de sombra da luz que projeta (ou os substitutos sem sombra) nos bindings do grupo 3. */
    private bindShadow(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        ctx.bind({
            shadow_map: slots.shadowTexture?.view ?? this.dummyDepthView,
            shadow_maps: slots.shadowMaps?.buffer ?? this.dummyShadowMaps,
        });
    }

    /** Prepara os pipelines (orientação direta e espelhada) do shader de cada material que entrou na cena. */
    private prepareMaterials(ctx: Ctx): void {
        const format = ctx.bound.slots.target.format ?? this.core.canvasFormat;
        for (const entry of ctx.bound.slots.renderables.entries) {
            const material = entry.get(Material);
            if (this.materialInfo.has(material)) continue;
            const desc = material.getPipelineDescriptors()[0];
            const pool = this.resources.poolKeyForResource(material);
            const stride = pool === undefined ? undefined : this.resources.poolInfo(pool)?.stride;
            if (desc === undefined || pool === undefined || stride === undefined) continue;
            // O stride de um pool não muda (alinhamento do schema): o offset do material é `slot × stride`.
            this.materialInfo.set(material, { pool, shader: desc.id, stride });
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
     * Parâmetros do quadro: direção da luz que projeta sombra (ou a padrão), sombra ligada e o slot do mapa dela —
     * escritos só quando mudam.
     */
    private writeFrameParams(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        const caster = slots.caster?.resource;
        const lightId = caster === undefined ? undefined : this.world.entityIdOfResource(caster);
        const light: Resource | undefined =
            lightId === undefined
                ? undefined
                : this.world.resourcesOf(lightId).find((r) => r instanceof DirectionalLight);
        const shadowSlot = lightId === undefined ? undefined : slots.shadowMaps?.slotOf(lightId);
        const on =
            light !== undefined && shadowSlot !== undefined && slots.shadowTexture !== undefined;
        const dir = on
            ? ((light.data.direction as readonly number[] | undefined) ?? [0, -1, 0, 0])
            : DEFAULT_LIGHT_DIR;
        const values = {
            lightDir: [dir[0] ?? 0, dir[1] ?? -1, dir[2] ?? 0, 0],
            shadowEnabled: on ? 1 : 0,
            shadowSlot: on ? shadowSlot : 0,
        };
        const key = JSON.stringify(values);
        if (key === this.writtenFrame) return;
        this.core.write(this.frameParams, ForwardFrameParamsSchema.pack(values));
        this.writtenFrame = key;
    }
}
