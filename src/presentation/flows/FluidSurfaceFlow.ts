import type { EntityId } from '../../scene/world/EntityId';
import type {
    EngineCore,
    Frame,
    StorageBufferSpec,
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { BindingSources, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { Flow } from '../../scene/flows/Flow';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../scene/flows/createComputeKernel';
import {
    slot,
    type EntitiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TextureSlot,
} from '../../scene/flows/slots';
import type { World } from '../../scene/world/World';
import { PerStepUniforms } from '../../elements/gpu/compute/PerStepUniforms';
import { FluidSurfaceMaterial } from '../../elements/material/FluidSurfaceMaterial';
import {
    WaterBoundsParamsSchema,
    WaterDrawParamsSchema,
    WaterLightMatrixSchema,
    WaterSmoothParamsSchema,
    WaterViewParamsSchema,
} from '../../elements/material/forwardSchemas';
import { waterLight, waterSmooth, waterSpheres } from '../../elements/material/shaders';
import { ParticleBody } from '../../elements/physics/bodies/ParticleBody';
import { ParticleMaterial } from '../../elements/physics/materials/ParticleMaterial';
import { Camera } from '../../elements/scene/Camera';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { FrameTargets } from '../app/FrameTargets';
import {
    NO_WATER_DEPTH,
    WATER_LIGHT_TEXTURES,
    WATER_VIEW_TEXTURES,
    WaterSurface,
} from '../app/WaterSurface';
import { castingShadowMap } from './ShadowFlow';

/** Vista de um produtor da superfície de água: a da câmera (o que se vê) ou a da luz que projeta sombra (cáusticas). */
export type WaterView = 'camera' | 'light';

/** Opções do `FluidSurfaceFlow`. */
export interface FluidSurfaceFlowOptions {
    /** Vista produzida. Padrão `'camera'`. */
    readonly view?: WaterView;
    /** Iterações da suavização (cada uma = horizontal + vertical; mínimo 1). Padrão 2. */
    readonly smoothingIterations?: number;
}

/** Slots do produtor da superfície de água a partir das partículas. */
export interface FluidSurfaceSlots extends SlotMap {
    /** Câmera ativa. */
    readonly camera: SingletonSlot<false>;
    /** Pool `CameraMatrices` (produzido na GPU pelo estágio de câmera). */
    readonly cameras: PoolSlot<false>;
    /** `ShadowMap` da luz que projeta sombra (vista da luz; opcional). */
    readonly caster: SingletonSlot<true>;
    /** Pool `ShadowMap` (o slot do mapa da luz que projeta). */
    readonly shadowMaps: PoolSlot<true>;
    /** Pool `ShadowMatrix` (matriz da luz, produzida na GPU). */
    readonly shadowMatrices: PoolSlot<true>;
    /** Parâmetros do material de partícula (espaçamento: raio automático das esferas). */
    readonly particleMaterial: SingletonSlot<true>;
    /** Corpos de partículas com material de água. */
    readonly bodies: EntitiesSlot;
    /** A superfície de água da cena (texturas compartilhadas com os consumidores). */
    readonly water: SingletonSlot<false>;
    /** Profundidade da cena (vista da câmera: a água atrás dos objetos não entra). */
    readonly sceneDepth: TextureSlot<true>;
}

type Ctx = TransitionContext<FluidSurfaceSlots>;

/** Corpo desenhado: entidade, corpo, material e o pipeline do pool dele. */
interface DrawnBody {
    readonly entity: EntityId;
    readonly body: ParticleBody;
    readonly material: FluidSurfaceMaterial;
    readonly poolKey: string;
}

/** Texturas e kernels da suavização, recriados quando uma fonte muda (canvas, pools). */
interface SmoothChain {
    readonly sources: readonly unknown[];
    readonly kernels: {
        readonly depth: readonly ComputeKernel[];
        readonly thickness: readonly ComputeKernel[];
    };
}

/** Raio automático da esfera em múltiplos do espaçamento das partículas. */
const AUTO_RADIUS = 0.8;
/** Espaçamento sem `ParticleMaterial` na cena. */
const DEFAULT_SPACING = 0.05;
/** Mistura aditiva (espessura). */
const ADDITIVE = {
    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
} as const;

/**
 * FluidSurfaceFlow — produtor da superfície de água a partir das partículas (spec 017, research R2–R4 e R6): desenha os
 * corpos de partículas com `FluidSurfaceMaterial` como esferas lidas direto do pool do corpo (um desenho por corpo,
 * como os sprites da 008) e escreve a superfície genérica no `WaterSurface`:
 *
 *   - vista `'camera'` (fase `forward`, depois dos opacos e dos sprites): profundidade linear e material da esfera mais
 *     próxima, espessura somada (cortada pela profundidade da cena) e a suavização bilateral separável;
 *   - vista `'light'` (fase `shadow`, depois do mapa de sombra): profundidade e material vistos pela luz que projeta
 *     sombra, suavizados — a entrada das cáusticas.
 *
 * As texturas são alocadas sob demanda quando entra o primeiro corpo com água (sem água, nada é alocado nem gravado).
 * Os consumidores (`CausticsFlow`, `WaterFlow`) leem a superfície sem saber de partículas: a água por altura (spec 029)
 * escreve a mesma superfície.
 */
export class FluidSurfaceFlow extends Flow<FluidSurfaceSlots, 'idle'> {
    readonly type = 'FluidSurfaceFlow';
    readonly slots: FluidSurfaceSlots;
    override readonly bindings: BindingSources;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    /** Vista produzida. */
    readonly view: WaterView;
    private readonly iterations: number;
    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly viewParams: UniformBufferSpec;
    private readonly smoothParams: readonly [UniformBufferSpec, UniformBufferSpec];
    private readonly dummyShadowMatrices: StorageBufferSpec;
    /** Matriz da vista da luz substituta (a vista da câmera não a usa, mas o shader a declara). */
    private readonly dummyLightMatrix: StorageBufferSpec;
    /** Parâmetros da caixa envolvente por corpo (vista da luz). */
    private readonly boundsParams = new Map<EntityId, UniformBufferSpec>();
    /** Conteúdo escrito nos parâmetros de cada corpo (escrita só quando muda). */
    private readonly boundsWritten = new Map<EntityId, string>();
    private boundsKernels:
        | {
              readonly sources: readonly unknown[];
              readonly clear: ComputeKernel;
              readonly accumulate: readonly {
                  readonly kernel: ComputeKernel;
                  readonly count: number;
              }[];
              readonly fit: ComputeKernel;
          }
        | undefined;
    /** Profundidade da cena substituta da vista da luz (a oclusão só vale na câmera). */
    private readonly dummyDepth: TextureSpec;
    private readonly dummyDepthView: TextureViewSpec;
    private radii: StorageBufferSpec;
    private radiiCapacity = 1;
    private readonly draws: PerStepUniforms;
    private readonly bodies = new Map<EntityId, DrawnBody>();
    /** Pool ligado a cada pipeline (religado quando o pool cresce). */
    private readonly boundPools = new Map<string, StorageBufferSpec>();
    private order: DrawnBody[] = [];
    private drawsDirty = false;
    private writtenView = '';
    private chain: SmoothChain | undefined;
    /** Variante do shader (profundidade da cena com ou sem amostras; 1 na vista da luz). */
    private sceneSamples = 1;
    /** A vista tem o que desenhar neste quadro (corpos, texturas e, na luz, o mapa de sombra). */
    private active = false;
    private water: WaterSurface | undefined;

    constructor(ctx: FlowContext, options: FluidSurfaceFlowOptions = {}) {
        super();
        this.view = options.view ?? 'camera';
        this.iterations = Math.max(1, Math.floor(options.smoothingIterations ?? 3));
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        const select = castingShadowMap(ctx.world);
        this.slots = {
            camera: slot.singleton(Camera.schema),
            cameras: slot.pool(Camera.matricesSchema.name),
            caster: slot.singleton(ShadowMap.schema, { optional: true, select }),
            shadowMaps: slot.pool(ShadowMap.schema.name, { optional: true }),
            shadowMatrices: slot.pool(ShadowMap.matrixSchema.name, { optional: true }),
            particleMaterial: slot.singleton(ParticleMaterial.schema, { optional: true }),
            bodies: slot.entities({ all: [ParticleBody, FluidSurfaceMaterial] }),
            water: slot.singleton(WaterSurface.schema),
            sceneDepth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
        };
        const uniform = (name: string, byteSize: number): UniformBufferSpec =>
            ctx.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: `water_${this.view}_${name}`,
                byteSize,
            });
        this.viewParams = uniform('view_params', WaterViewParamsSchema.stride);
        this.smoothParams = [
            uniform('smooth_h', WaterSmoothParamsSchema.stride),
            uniform('smooth_v', WaterSmoothParamsSchema.stride),
        ];
        this.dummyShadowMatrices = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `water_${this.view}_shadow_matrices_dummy`,
            byteSize: ShadowMap.matrixSchema.stride,
        });
        this.dummyLightMatrix = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `water_${this.view}_light_matrix_dummy`,
            byteSize: WaterLightMatrixSchema.stride,
        });
        this.dummyDepth = ctx.core.create<TextureSpec>({
            kind: 'texture',
            discriminator: `water_${this.view}_scene_depth_dummy`,
            width: 1,
            height: 1,
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.dummyDepthView = ctx.core.create<TextureViewSpec>({
            kind: 'textureview',
            discriminator: `water_${this.view}_scene_depth_dummy_view`,
            source: this.dummyDepth,
            format: 'depth32float',
        });
        this.radii = this.createRadii(1);
        this.draws = new PerStepUniforms(ctx.core, {
            discriminator: `water_${this.view}_draw_params`,
            schema: WaterDrawParamsSchema,
        });
        this.draws.reserve(1);
        this.bindings = {
            water_view: this.viewParams,
            water_draw: this.draws.source(),
            shadow_matrices: this.dummyShadowMatrices,
            water_light_matrix: this.dummyLightMatrix,
            water_scene_depth: this.dummyDepthView,
        };
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.track(
                            c,
                            c.bound.slots.bodies.entries.map((e) => e.entityId),
                            [],
                        );
                    },
                },
                entitiesChanged: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type === 'entitiesChanged' && e.slot === 'bodies')
                            this.track(c, e.added, e.removed);
                    },
                },
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

    /** Grava os passes das esferas e a suavização da vista. */
    dispatch(frame: Frame, bound: BoundFlow<FluidSurfaceSlots>): void {
        const water = this.water;
        if (!this.active || water === undefined || this.chain === undefined) return;
        const view = (id: string): TextureViewSpec => this.resources.textureViewOf(water, id)!;
        const light = this.view === 'light';
        const prefix = light ? 'light' : '';
        const bounds = this.boundsKernels;
        if (light) {
            if (bounds === undefined) return;
            frame.compute('FluidSurfaceFlow.lightBounds', (pass) => {
                const set = (kernel: ComputeKernel): void => {
                    pass.bind.setPipeline(kernel.pipeline);
                    kernel.bindGroups.forEach((g, i) => pass.bind.setBindGroup(i, g));
                };
                set(bounds.clear);
                pass.dispatch.workgroups(1);
                for (const a of bounds.accumulate) {
                    set(a.kernel);
                    pass.dispatch.invocations(a.count, 64);
                }
                set(bounds.fit);
                pass.dispatch.workgroups(1);
            });
        }
        const name = (id: string): string =>
            light ? `${prefix}${id[0]!.toUpperCase()}${id.slice(1)}` : id;
        frame.render(
            {
                colorAttachments: [
                    {
                        view: view(name('depthRaw')),
                        loadOp: 'clear',
                        clearValue: [NO_WATER_DEPTH, 0, 0, 0],
                        storeOp: 'store',
                    },
                    {
                        view: view(light ? 'lightMaterial' : 'material'),
                        loadOp: 'clear',
                        clearValue: [0, 0, 0, 0],
                        storeOp: 'store',
                    },
                ],
                depthStencilAttachment: {
                    view: view(name('depthStencil')),
                    depthClearValue: 1,
                    depthLoadOp: 'clear',
                    depthStoreOp: 'discard',
                },
            },
            light ? 'FluidSurfaceFlow.lightDepth' : 'FluidSurfaceFlow.depth',
            (pass) => {
                this.drawBodies(pass, bound, 'depth');
            },
        );
        if (!light) {
            frame.render(
                {
                    colorAttachments: [
                        {
                            view: view('thicknessRaw'),
                            loadOp: 'clear',
                            clearValue: [0, 0, 0, 0],
                            storeOp: 'store',
                        },
                    ],
                },
                'FluidSurfaceFlow.thickness',
                (pass) => {
                    this.drawBodies(pass, bound, 'thickness');
                },
            );
        }
        const size = this.textureSize(water);
        const groups = [Math.ceil(size.width / 8), Math.ceil(size.height / 8)] as const;
        frame.compute(
            light ? 'FluidSurfaceFlow.lightSmooth' : 'FluidSurfaceFlow.smooth',
            (pass) => {
                const run = (kernel: ComputeKernel): void => {
                    pass.bind.setPipeline(kernel.pipeline);
                    kernel.bindGroups.forEach((g, i) => pass.bind.setBindGroup(i, g));
                    pass.dispatch.workgroups(groups[0], groups[1]);
                };
                for (const kernel of this.chain!.kernels.depth) run(kernel);
                for (const kernel of this.chain!.kernels.thickness) run(kernel);
            },
        );
    }

    /** Libera os recursos privados. */
    override dispose(): void {
        this.releaseChain();
        this.draws.dispose();
        this.core.destroy(this.viewParams);
        for (const p of this.smoothParams) this.core.destroy(p);
        this.core.destroy(this.dummyShadowMatrices);
        this.core.destroy(this.dummyLightMatrix);
        this.releaseBounds();
        for (const p of this.boundsParams.values()) this.core.destroy(p);
        this.core.destroy(this.dummyDepthView);
        this.core.destroy(this.dummyDepth);
        this.core.destroy(this.radii);
    }

    /** Um desenho por corpo (um quad por partícula), no pipeline do pool do corpo. */
    private drawBodies(
        pass: Parameters<Parameters<Frame['render']>[2]>[0],
        bound: BoundFlow<FluidSurfaceSlots>,
        kind: 'depth' | 'thickness',
    ): void {
        let current: string | undefined;
        this.order.forEach((drawn, region) => {
            const id = this.pipelineId(kind, drawn.poolKey);
            const prepared = bound.pipelines.get(id);
            if (prepared?.role !== 'render' || !prepared.ready) return;
            if (id !== current) {
                pass.bind.setPipeline(prepared.spec);
                prepared.groups.forEach((g, i) => {
                    if (i !== 2 && g !== undefined) pass.bind.setBindGroup(i, g);
                });
                current = id;
            }
            pass.bind.setBindGroup(2, prepared.groups[2]!, [this.draws.offset(region)]);
            pass.draw.vertices(6, drawn.body.count, 0, 0);
        });
    }

    /** Corpos que entraram e saíram; a primeira água aloca as texturas da vista. */
    private track(ctx: Ctx, added: readonly EntityId[], removed: readonly EntityId[]): void {
        for (const id of removed) this.bodies.delete(id);
        const entries = ctx.bound.slots.bodies;
        for (const id of added) {
            const entry = entries.entry(id);
            if (entry === undefined) continue;
            const body = entry.get(ParticleBody);
            const material = entry.get(FluidSurfaceMaterial);
            const poolKey = this.resources.poolKeyForResource(body);
            if (poolKey === undefined) continue;
            this.bodies.set(id, { entity: id, body, material, poolKey });
        }
        this.drawsDirty = true;
    }

    /**
     * Aloca as texturas da vista no `WaterSurface` na primeira vez em que há o que produzir (sob demanda: sem água — ou,
     * na vista da luz, sem luz que projete sombra —, nada é alocado).
     */
    private allocate(ctx: Ctx): WaterSurface {
        const water = ctx.bound.slots.water.resource as WaterSurface;
        if (this.water === water) return water;
        this.water = water;
        for (const id of this.view === 'light' ? WATER_LIGHT_TEXTURES : WATER_VIEW_TEXTURES) {
            this.resources.ensureAllocated(water, id);
        }
        return water;
    }

    /** Antes da gravação: pipelines, regiões, parâmetros e a cadeia de suavização (refeita quando uma fonte muda). */
    private prepareFrame(ctx: Ctx): void {
        if (this.bodies.size === 0) {
            // Sem água: nada a preparar (custo zero por quadro).
            if (this.active) this.water?.markProduced(this.view, false);
            this.active = false;
            return;
        }
        const slots = ctx.bound.slots;
        const shadowSlot = this.shadowSlot(ctx);
        const ready =
            this.bodies.size > 0
            && (this.view === 'camera'
                ? slots.sceneDepth !== undefined
                : shadowSlot !== undefined && slots.shadowMatrices !== undefined);
        this.active = ready;
        if (!ready) {
            this.water?.markProduced(this.view, false);
            return;
        }
        this.allocate(ctx).markProduced(this.view, true);
        ctx.bind({
            shadow_matrices: slots.shadowMatrices?.buffer ?? this.dummyShadowMatrices,
            water_light_matrix: this.lightMatrix(),
        });
        if (this.view === 'camera') {
            const depth = slots.sceneDepth!;
            const samples = depth.texture.sampleCount ?? 1;
            if (samples !== this.sceneSamples) {
                // A variante do shader muda com as amostras da cena: pipelines refeitos.
                for (const poolKey of this.boundPools.keys()) {
                    ctx.release(this.pipelineId('depth', poolKey));
                    ctx.release(this.pipelineId('thickness', poolKey));
                }
                this.boundPools.clear();
                this.sceneSamples = samples;
            }
            ctx.bind({ water_scene_depth: depth.view });
        }
        for (const drawn of this.bodies.values()) this.preparePool(ctx, drawn.poolKey);
        this.rebindPools(ctx);
        this.writeDraws(ctx);
        this.writeParams(ctx, shadowSlot ?? 0);
        if (this.view === 'light') this.prepareBounds(ctx, shadowSlot ?? 0);
        this.prepareChain(ctx);
    }

    /** A matriz da vista da luz da água (produzida na vista da luz), ou o substituto antes dela existir. */
    private lightMatrix(): StorageBufferSpec {
        const water = this.water;
        const buffer =
            water === undefined ? undefined : this.resources.bufferOf(water, 'lightMatrix');
        return buffer?.subkind === 'storage' ? buffer : this.dummyLightMatrix;
    }

    /**
     * Vista da luz: parâmetros da caixa envolvente por corpo e os kernels que a acumulam (min/max na base da luz) e
     * ajustam a matriz ortográfica à água — refeitos quando uma fonte muda.
     */
    private prepareBounds(ctx: Ctx, shadowSlot: number): void {
        const water = this.water!;
        const bounds = this.resources.bufferOf(water, 'lightBounds');
        const matrix = this.resources.bufferOf(water, 'lightMatrix');
        const shadows = ctx.bound.slots.shadowMatrices?.buffer;
        if (bounds === undefined || matrix === undefined || shadows === undefined) return;
        const bodies = this.order;
        for (const id of [...this.boundsParams.keys()]) {
            if (this.bodies.has(id)) continue;
            this.core.destroy(this.boundsParams.get(id)!);
            this.boundsParams.delete(id);
            this.boundsWritten.delete(id);
        }
        const pools = bodies.map((d) => this.boundPools.get(d.poolKey));
        const params = bodies.map((drawn) => {
            let spec = this.boundsParams.get(drawn.entity);
            if (spec === undefined) {
                spec = this.core.create<UniformBufferSpec>({
                    kind: 'buffer',
                    subkind: 'uniform',
                    discriminator: `water_bounds_params:${drawn.entity}`,
                    byteSize: WaterBoundsParamsSchema.stride,
                });
                this.boundsParams.set(drawn.entity, spec);
            }
            return spec;
        });
        bodies.forEach((drawn, i) => {
            const range = this.resources.poolRangeOf(drawn.poolKey, drawn.entity);
            const schema = drawn.body.particleSchema;
            const values = {
                first: range?.first ?? 0,
                count: drawn.body.count,
                strideVec4: schema.stride / 16,
                posOffsetVec4: schema.offsetOf('pos') / 16,
                shadowSlot,
                radius: this.radiusOf(ctx, drawn),
            };
            // Escritos quando mudam (o corpo entra, a faixa ou o mapa de sombra mudam), não por quadro.
            const key = Object.values(values).join(':');
            if (this.boundsWritten.get(drawn.entity) === key) return;
            this.boundsWritten.set(drawn.entity, key);
            this.core.write(params[i]!, WaterBoundsParamsSchema.pack(values));
        });
        if (bodies.length === 0) return;
        const sources = [bounds, matrix, shadows, ...pools, ...params];
        const known = this.boundsKernels;
        if (known !== undefined && sameSources(known.sources, sources)) return;
        this.releaseBounds();
        const kernel = (
            name: string,
            entryPoint: string,
            bindings: Record<string, unknown>,
        ): ComputeKernel =>
            createComputeKernel(this.core, {
                discriminator: `water_light_${name}`,
                shader: waterLight,
                entryPoint,
                bindings: bindings as Parameters<typeof createComputeKernel>[1]['bindings'],
            });
        this.boundsKernels = {
            sources,
            clear: kernel('bounds_clear', 'water_bounds_clear', { light_bounds: bounds }),
            accumulate: bodies.map((drawn, i) => ({
                count: drawn.body.count,
                kernel: kernel(`bounds_${drawn.entity}`, 'water_bounds_accumulate', {
                    light_bounds: bounds,
                    bounds_params: params[i]!,
                    shadow_matrices: shadows,
                    bounds_particles: pools[i]!,
                }),
            })),
            fit: kernel('fit', 'water_light_fit', {
                bounds_in: bounds,
                bounds_params: params[0]!,
                shadow_matrices: shadows,
                light_matrix: matrix,
            }),
        };
    }

    private releaseBounds(): void {
        const k = this.boundsKernels;
        if (k === undefined) return;
        for (const kernel of [k.clear, k.fit, ...k.accumulate.map((a) => a.kernel)])
            destroyComputeKernel(this.core, kernel);
        this.boundsKernels = undefined;
    }

    /** Raio da esfera do corpo: o do material, ou automático pelo espaçamento das partículas. */
    private radiusOf(ctx: Ctx, drawn: DrawnBody): number {
        const own = drawn.material.data.particleRadius;
        if (own > 0) return own;
        const spacing =
            (ctx.bound.slots.particleMaterial?.resource as ParticleMaterial | undefined)
                ?.particleSpacing ?? DEFAULT_SPACING;
        return spacing * AUTO_RADIUS;
    }

    /** Slot do mapa de sombra da luz que projeta (vista da luz). */
    private shadowSlot(ctx: Ctx): number | undefined {
        const caster = ctx.bound.slots.caster?.resource;
        const lightId = caster === undefined ? undefined : this.world.entityIdOfResource(caster);
        return lightId === undefined ? undefined : ctx.bound.slots.shadowMaps?.slotOf(lightId);
    }

    private pipelineId(kind: 'depth' | 'thickness', poolKey: string): string {
        return `water_${kind}:${this.view}:${poolKey}`;
    }

    /** Pipelines (profundidade e, na câmera, espessura) do pool de partícula; o pool é binding privado deles. */
    private preparePool(ctx: Ctx, poolKey: string): void {
        if (this.boundPools.has(poolKey)) return;
        const buffer = this.resources.poolBufferSpec(poolKey);
        const materials = this.resources.poolBufferSpec(FluidSurfaceMaterial.schema.name);
        if (buffer === undefined || materials === undefined) return;
        const shader = this.sceneSamples > 1 ? waterSpheres.sceneMs : waterSpheres.scene;
        const base: Omit<PipelineDescriptor, 'id' | 'entryPoints'> = {
            role: 'render',
            shader,
            consumes: [Camera.matricesSchema.name],
            topology: 'triangle-list',
            cullMode: 'none',
        };
        const depthId = this.pipelineId('depth', poolKey);
        ctx.bind({ [`${depthId}:particles`]: buffer, water_materials: materials });
        ctx.prepare({
            ...base,
            id: depthId,
            entryPoints: ['water_sphere_vs', 'water_depth_fs'],
            colorTargets: [{ format: 'r32float' }, { format: 'r32uint' }],
            depth: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
        });
        if (this.view === 'camera') {
            const thicknessId = this.pipelineId('thickness', poolKey);
            ctx.bind({ [`${thicknessId}:particles`]: buffer });
            ctx.prepare({
                ...base,
                id: thicknessId,
                entryPoints: ['water_sphere_vs', 'water_thickness_fs'],
                colorTargets: [{ format: 'r16float', blend: ADDITIVE }],
            });
        }
        this.boundPools.set(poolKey, buffer);
        this.drawsDirty = true;
    }

    /** Religa os pools (corpos e materiais) recriados pelo crescimento. */
    private rebindPools(ctx: Ctx): void {
        const materials = this.resources.poolBufferSpec(FluidSurfaceMaterial.schema.name);
        if (materials !== undefined) ctx.bind({ water_materials: materials });
        for (const [poolKey, bound] of this.boundPools) {
            const buffer = this.resources.poolBufferSpec(poolKey);
            if (buffer === undefined || buffer === bound) continue;
            this.boundPools.set(poolKey, buffer);
            ctx.bind({ [`${this.pipelineId('depth', poolKey)}:particles`]: buffer });
            if (this.view === 'camera')
                ctx.bind({ [`${this.pipelineId('thickness', poolKey)}:particles`]: buffer });
            this.drawsDirty = true;
        }
    }

    /** Uma região por corpo (faixa, layout, material, raio) e o raio por slot de material — escritos quando mudam. */
    private writeDraws(ctx: Ctx): void {
        if (!this.drawsDirty) return;
        this.drawsDirty = false;
        this.order = [...this.bodies.values()].filter((d) => this.boundPools.has(d.poolKey));
        if (this.order.length === 0) return;
        if (this.draws.reserve(this.order.length)) ctx.bind({ water_draw: this.draws.source() });
        const materialPool = FluidSurfaceMaterial.schema.name;
        const radii = new Map<number, number>();
        this.order.forEach((drawn, region) => {
            const schema = drawn.body.particleSchema;
            const range = this.resources.poolRangeOf(drawn.poolKey, drawn.entity);
            const materialSlot = this.resources.poolSlotOf(materialPool, drawn.entity) ?? 0;
            const radius = this.radiusOf(ctx, drawn);
            if (!radii.has(materialSlot)) radii.set(materialSlot, radius);
            this.draws.write(region, {
                first: range?.first ?? 0,
                strideVec4: schema.stride / 16,
                posOffsetVec4: schema.offsetOf('pos') / 16,
                materialSlot,
                radius,
            });
        });
        this.draws.flush(this.order.length);
        const count = Math.max(1, ...[...radii.keys()].map((s) => s + 1));
        if (count > this.radiiCapacity) {
            this.core.destroy(this.radii);
            this.radii = this.createRadii(count);
            this.chain = this.releaseChain();
        }
        const values = new Float32Array(this.radiiCapacity);
        for (const [s, r] of radii) values[s] = r;
        this.core.write(this.radii, values);
    }

    private createRadii(count: number): StorageBufferSpec {
        this.radiiCapacity = Math.max(count, 1);
        return this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `water_${this.view}_radii:${this.radiiCapacity}`,
            byteSize: Math.max(16, this.radiiCapacity * 4),
        });
    }

    /** Parâmetros da vista e da suavização (slots da câmera e do mapa, tamanho do alvo) — escritos quando mudam. */
    private writeParams(ctx: Ctx, shadowSlot: number): void {
        const slots = ctx.bound.slots;
        const cameraId = this.world.entityIdOfResource(slots.camera.resource);
        const cameraSlot = cameraId === undefined ? 0 : (slots.cameras.slotOf(cameraId) ?? 0);
        const { width, height } = this.textureSize(this.water!);
        const view = this.view === 'light' ? 1 : 0;
        const key = `${cameraSlot}:${shadowSlot}:${width}x${height}`;
        if (key === this.writtenView) return;
        this.writtenView = key;
        this.core.write(
            this.viewParams,
            WaterViewParamsSchema.pack({ cameraSlot, shadowSlot, view, viewport: [width, height] }),
        );
        this.smoothParams.forEach((spec, direction) => {
            this.core.write(
                spec,
                WaterSmoothParamsSchema.pack({
                    cameraSlot,
                    shadowSlot,
                    view,
                    direction,
                    viewport: [width, height],
                }),
            );
        });
    }

    /** Tamanho das texturas da vista (canvas ou o lado da vista da luz). */
    private textureSize(water: WaterSurface): { width: number; height: number } {
        const texture: TextureSpec | undefined = this.resources.textureOf(
            water,
            this.view === 'light' ? 'lightDepth' : 'depth',
        );
        return { width: texture?.width ?? 1, height: texture?.height ?? 1 };
    }

    /**
     * Kernels da suavização: profundidade (horizontal → temporária → vertical → final, `iterations` vezes) e, na
     * câmera, o borrão da espessura. Os bind groups são fixos: refeitos quando uma fonte muda (canvas, pools).
     */
    private prepareChain(ctx: Ctx): void {
        const water = this.water!;
        const light = this.view === 'light';
        const tex = (id: string): TextureViewSpec | undefined =>
            this.resources.textureViewOf(water, id);
        const raw = tex(light ? 'lightDepthRaw' : 'depthRaw');
        const temp = tex(light ? 'lightDepthTemp' : 'depthTemp');
        const final = tex(light ? 'lightDepth' : 'depth');
        const material = tex(light ? 'lightMaterial' : 'material');
        const cameras = ctx.bound.slots.cameras.buffer;
        const lightMatrix = this.lightMatrix();
        const materials = this.resources.poolBufferSpec(FluidSurfaceMaterial.schema.name);
        const thick = light ? [] : [tex('thicknessRaw'), tex('thicknessTemp'), tex('thickness')];
        const sources = [
            raw,
            temp,
            final,
            material,
            cameras,
            lightMatrix,
            materials,
            this.radii,
            ...thick,
        ];
        if (sources.some((s) => s === undefined)) return;
        if (this.chain !== undefined && sameSources(this.chain.sources, sources)) return;
        this.releaseChain();
        const [h, v] = this.smoothParams;
        const depthKernel = (
            name: string,
            src: TextureViewSpec,
            dst: TextureViewSpec,
            params: UniformBufferSpec,
        ): ComputeKernel =>
            createComputeKernel(this.core, {
                discriminator: `water_${this.view}_${name}`,
                shader: waterSmooth,
                entryPoint: 'water_smooth_depth',
                bindings: {
                    cameras,
                    water_light_matrix: lightMatrix,
                    water_materials: materials!,
                    water_radii: this.radii,
                    water_smooth: params,
                    smooth_src: src,
                    smooth_material: material!,
                    smooth_dst: dst,
                },
            });
        const depth: ComputeKernel[] = [];
        for (let i = 0; i < this.iterations; i++) {
            depth.push(depthKernel(`smooth_h${i}`, i === 0 ? raw! : final!, temp!, h));
            depth.push(depthKernel(`smooth_v${i}`, temp!, final!, v));
        }
        const thickness: ComputeKernel[] = [];
        if (!light) {
            const [tRaw, tTemp, tFinal] = thick as TextureViewSpec[];
            const blur = (
                name: string,
                src: TextureViewSpec,
                dst: TextureViewSpec,
                params: UniformBufferSpec,
            ): ComputeKernel =>
                createComputeKernel(this.core, {
                    discriminator: `water_${this.view}_${name}`,
                    shader: waterSmooth,
                    entryPoint: 'water_smooth_thickness',
                    bindings: { water_smooth: params, smooth_src: src, smooth_dst: dst },
                });
            thickness.push(blur('thick_h', tRaw!, tTemp!, h), blur('thick_v', tTemp!, tFinal!, v));
        }
        this.chain = { sources, kernels: { depth, thickness } };
    }

    private releaseChain(): undefined {
        if (this.chain === undefined) return undefined;
        for (const k of [...this.chain.kernels.depth, ...this.chain.kernels.thickness])
            destroyComputeKernel(this.core, k);
        this.chain = undefined;
        return undefined;
    }
}

function sameSources(a: readonly unknown[], b: readonly unknown[]): boolean {
    return a.length === b.length && a.every((x, i) => x === b[i]);
}
