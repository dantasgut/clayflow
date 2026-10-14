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
import type { BindingSources, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import {
    slot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TargetSlot,
    type TextureSlot,
} from '../../scene/flows/slots';
import type { World } from '../../scene/world/World';
import { FluidSurfaceMaterial } from '../../elements/material/FluidSurfaceMaterial';
import { NO_LIGHT_SLOT, WaterCompositeParamsSchema } from '../../elements/material/forwardSchemas';
import { waterComposite } from '../../elements/material/shaders';
import { Camera } from '../../elements/scene/Camera';
import { Light } from '../../elements/scene/Light';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { FrameTargets } from '../app/FrameTargets';
import { WaterSurface } from '../app/WaterSurface';
import { castingShadowMap } from './ShadowFlow';

/** Slots da composição da água. */
export interface WaterSlots extends SlotMap {
    /** Câmera ativa. */
    readonly camera: SingletonSlot<false>;
    /** Pool `CameraMatrices`. */
    readonly cameras: PoolSlot<false>;
    /** Pool `Light` (a luz que ilumina; opcional). */
    readonly lights: PoolSlot<true>;
    /** `ShadowMap` da luz que projeta sombra (opcional). */
    readonly caster: SingletonSlot<true>;
    /** Textura do mapa de sombra dela. */
    readonly shadowTexture: TextureSlot<true>;
    /** Pool `ShadowMap` (vieses). */
    readonly shadowMaps: PoolSlot<true>;
    /** Pool `ShadowMatrix` (matriz da luz). */
    readonly shadowMatrices: PoolSlot<true>;
    /** A superfície de água da cena. */
    readonly water: SingletonSlot<false>;
    /** Cor e profundidade da cena (a água é composta sobre elas). */
    readonly target: TargetSlot;
}

type Ctx = TransitionContext<WaterSlots>;

/**
 * WaterFlow — composição óptica da água (spec 017, research R5), consumidor da superfície genérica do `WaterSurface`
 * (profundidade, espessura e material por pixel) — não sabe de onde ela vem (partículas hoje, água por altura na 029).
 *
 * Na fase `forward`, depois do produtor da vista da câmera: copia a cor da cena para `background` (a fonte da refração,
 * que não pode ser a textura em que o passe resolve) e desenha um triângulo de tela cheia nos alvos da cena — com MSAA,
 * nas amostras, resolvidas na cor —, com teste de profundidade contra a cena (a água se oculta atrás dos objetos) sem
 * escrever nela. Por pixel: normal da profundidade suavizada, refração, absorção pela espessura, dispersão, Fresnel com
 * a cor de ambiente do material, especular e a sombra da cena. Só grava quando a superfície foi produzida no quadro.
 */
export class WaterFlow extends RenderFlow<WaterSlots, 'idle'> {
    readonly type = 'WaterFlow';
    readonly slots: WaterSlots;
    override readonly bindings: BindingSources;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly params: UniformBufferSpec;
    private readonly sampler: SamplerSpec;
    private readonly dummyDepth: TextureSpec;
    private readonly dummyDepthView: TextureViewSpec;
    private readonly dummyShadowMaps: StorageBufferSpec;
    private readonly dummyShadowMatrices: StorageBufferSpec;
    private readonly dummyLights: StorageBufferSpec;
    private pipeline: string | undefined;
    private samples = 0;
    private written = '';
    private active = false;
    private water: WaterSurface | undefined;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        const select = castingShadowMap(ctx.world);
        this.slots = {
            camera: slot.singleton(Camera.schema),
            cameras: slot.pool(Camera.matricesSchema.name),
            lights: slot.pool(Light.schema.name, { optional: true }),
            caster: slot.singleton(ShadowMap.schema, { optional: true, select }),
            shadowTexture: slot.texture(ShadowMap.schema, 'depth', { optional: true, select }),
            shadowMaps: slot.pool(ShadowMap.schema.name, { optional: true }),
            shadowMatrices: slot.pool(ShadowMap.matrixSchema.name, { optional: true }),
            water: slot.singleton(WaterSurface.schema),
            target: slot.target({
                color: { schema: FrameTargets.schema, descId: 'color' },
                depth: { schema: FrameTargets.schema, descId: 'depth' },
                samples: { schema: FrameTargets.schema, descId: 'samples' },
            }),
        };
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'water_composite_params',
            byteSize: WaterCompositeParamsSchema.stride,
        });
        this.sampler = ctx.core.create<SamplerSpec>({
            kind: 'sampler',
            discriminator: 'water_shadow_sampler',
            desc: { magFilter: 'linear', minFilter: 'linear', compare: 'less' },
        });
        this.dummyDepth = ctx.core.create<TextureSpec>({
            kind: 'texture',
            discriminator: 'water_shadow_dummy',
            width: 1,
            height: 1,
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.dummyDepthView = ctx.core.create<TextureViewSpec>({
            kind: 'textureview',
            discriminator: 'water_shadow_dummy_view',
            source: this.dummyDepth,
            format: 'depth32float',
        });
        const storage = (name: string, byteSize: number): StorageBufferSpec =>
            ctx.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `water_${name}_dummy`,
                byteSize,
            });
        this.dummyShadowMaps = storage('shadow_maps', ShadowMap.schema.stride);
        this.dummyShadowMatrices = storage('shadow_matrices', ShadowMap.matrixSchema.stride);
        this.dummyLights = storage('lights', Light.schema.stride);
        this.bindings = {
            water_composite: this.params,
            shadow_sampler: this.sampler,
            shadow_map: this.dummyDepthView,
            shadow_maps: this.dummyShadowMaps,
            shadow_matrices: this.dummyShadowMatrices,
            lights: this.dummyLights,
        };
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                poolReallocated: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                canvasReconfigured: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepareFrame(c);
                    },
                },
            },
        };
    }

    /** Copia a cena para `background` e compõe a água sobre ela. */
    dispatch(frame: Frame, bound: BoundFlow<WaterSlots>): void {
        const water = this.water;
        if (!this.active || water === undefined || this.pipeline === undefined) return;
        if (!water.isProduced('camera')) return;
        const prepared = bound.pipelines.get(this.pipeline);
        if (prepared?.role !== 'render' || !prepared.ready) return;
        const target = bound.slots.target;
        const colorView = this.colorView(frame, target);
        const background = this.resources.textureOf(water, 'background');
        if (colorView === undefined || background === undefined || target.depth === undefined)
            return;
        frame.copyTextureToTexture(colorView.source, background, [
            background.width,
            background.height,
        ]);
        const color = this.colorAttachment(frame, target, { loadOp: 'load' });
        if (color === undefined) return;
        const renderTarget: RenderTarget = {
            colorAttachments: [color],
            depthStencilAttachment: { view: target.depth, depthReadOnly: true },
        };
        frame.render(renderTarget, 'WaterFlow', (pass) => {
            pass.bind.setPipeline(prepared.spec);
            prepared.groups.forEach((g, i) => {
                if (g !== undefined) pass.bind.setBindGroup(i, g);
            });
            pass.draw.vertices(3);
        });
    }

    /** Libera os recursos privados. */
    override dispose(): void {
        for (const spec of [
            this.params,
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

    /** Pipeline (variante pelas amostras da cena), fontes e parâmetros — antes da gravação. */
    private prepareFrame(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        const water = slots.water.resource as WaterSurface;
        this.water = water;
        const depthView = this.resources.textureViewOf(water, 'depth');
        const materials = this.resources.poolBufferSpec(FluidSurfaceMaterial.schema.name);
        const sceneDepth = slots.target.depth;
        this.active =
            depthView !== undefined && materials !== undefined && sceneDepth !== undefined;
        if (depthView === undefined || materials === undefined || sceneDepth === undefined) return;
        const samples = slots.target.sampleCount;
        if (this.pipeline === undefined || samples !== this.samples) {
            if (this.pipeline !== undefined) ctx.release(this.pipeline);
            this.samples = samples;
            this.pipeline = `water_composite:${samples}`;
            ctx.bind(this.sources(ctx, water, materials, sceneDepth));
            ctx.prepare({
                id: this.pipeline,
                role: 'render',
                shader: samples > 1 ? waterComposite.sceneMs : waterComposite.scene,
                entryPoints: ['water_composite_vs', 'water_composite_fs'],
                consumes: [Camera.matricesSchema.name],
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [{ format: slots.target.format ?? this.core.canvasFormat }],
                depth: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
                multisample: { count: samples },
            });
        } else {
            ctx.bind(this.sources(ctx, water, materials, sceneDepth));
        }
        this.writeParams(ctx);
    }

    /** Fontes do passe (texturas da superfície, profundidade da cena, sombra, luzes, materiais). */
    private sources(
        ctx: Ctx,
        water: WaterSurface,
        materials: StorageBufferSpec,
        sceneDepth: TextureViewSpec,
    ): BindingSources {
        const slots = ctx.bound.slots;
        const tex = (id: string): TextureViewSpec => this.resources.textureViewOf(water, id)!;
        return {
            water_depth: tex('depth'),
            water_thickness: tex('thickness'),
            water_material: tex('material'),
            water_background: tex('background'),
            water_scene_depth: sceneDepth,
            water_materials: materials,
            shadow_map: slots.shadowTexture?.view ?? this.dummyDepthView,
            shadow_maps: slots.shadowMaps?.buffer ?? this.dummyShadowMaps,
            shadow_matrices: slots.shadowMatrices?.buffer ?? this.dummyShadowMatrices,
            lights: slots.lights?.buffer ?? this.dummyLights,
        };
    }

    /** Slots da câmera, da luz e do mapa; sombra ligada; tamanho — escritos quando mudam. */
    private writeParams(ctx: Ctx): void {
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
        const { width, height } = this.core.canvasSize() ?? { width: 1, height: 1 };
        const light = on ? lightSlot : NO_LIGHT_SLOT;
        const shadow = on ? shadowSlot : 0;
        const key = `${cameraSlot}:${light}:${shadow}:${width}x${height}`;
        if (key === this.written) return;
        this.written = key;
        this.core.write(
            this.params,
            WaterCompositeParamsSchema.pack({
                cameraSlot,
                lightSlot: light,
                shadowSlot: shadow,
                shadowEnabled: on ? 1 : 0,
                viewport: [width, height],
            }),
        );
    }
}
