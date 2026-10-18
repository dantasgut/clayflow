import type {
    EngineCore,
    Frame,
    RenderTarget,
    SamplerSpec,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { Resource } from '../../scene/contracts/Resource';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type {
    BindingSource,
    BindingSources,
    BoundFlow,
    PreparedCompute,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { LOBES } from '../../elements/material/pbr/lobes';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import {
    slot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TargetSlot,
} from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { World } from '../../scene/world/World';
import { FluidSurfaceMaterial } from '../../elements/material/FluidSurfaceMaterial';
import { Camera } from '../../elements/scene/Camera';
import { FrameTargets } from '../app/FrameTargets';
import { WaterSurface } from '../app/WaterSurface';
import { WaterCompositeParamsSchema } from '../water/schemas';
import { waterComposite, waterRequest, waterResources as R } from '../water/shaders';
import { Time } from '../../scene/time/Time';
import { Sky } from '../../elements/scene/sky/Sky';
import {
    refractionFrameResource,
    refractionKernels,
    transmissionResources,
} from '../../elements/material/shaders';
import { Refraction, RefractionFrameSchema } from '../../elements/material/Refraction';
import { SCENE_CLEAR_COLOR } from '../app/FrameTargets';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import { RayScene } from '../../elements/raytrace/RayScene';
import { composeHitMaterial } from '../../elements/raytrace/hitMaterial';
import { rayHitMaterialPoint } from '../../elements/raytrace/shaders';
import { bindPoints } from '../../scene/shaders/bindPoints';

/** O pipeline dos pedidos de refração da água. */
const WATER_REQUEST = 'water_refraction_request';

/** Alvos da refração usados pela água (spec 034), sob demanda. */
const WATER_TARGETS = [
    'sceneCopy',
    'refractionRequest',
    'refractionDistance',
    'refractionRadiance',
    'refractionBlur',
    'refractionHit',
    'refractionHitInfo',
    'refractionThroughput',
] as const;

/** Slots da composição da água. */
export interface WaterSlots extends SlotMap {
    /** Câmera ativa. */
    readonly camera: SingletonSlot<false>;
    /** Pool `CameraMatrices` (o slot da câmera ativa). */
    readonly cameras: PoolSlot<false>;
    /** A superfície de água da cena. */
    readonly water: SingletonSlot<false>;
    /** Tempo da cena (fase das ondulações do material). */
    readonly time: SingletonSlot<false>;
    /** Cor e profundidade da cena (a água é composta sobre elas). */
    readonly target: TargetSlot;
    /** Os alvos da cena (a cópia da cena e a radiância traçada da refração, spec 034). */
    readonly targets: SingletonSlot<false>;
    /** A estrutura de raios (o traçado da refração da água, spec 034; opcional). */
    readonly rayScene: SingletonSlot<true>;
    /** O céu físico (o fundo de quem escapa no traçado; sem ele, a cor de limpeza). */
    readonly sky: SingletonSlot<true>;
}

type Ctx = TransitionContext<WaterSlots>;

/**
 * WaterFlow — composição óptica da água (spec 017, research R5), consumidor da superfície genérica do `WaterSurface`
 * (profundidade, espessura e material por pixel) — não sabe de onde ela vem (partículas hoje, água por altura na 029).
 *
 * Na fase `forward`, depois do produtor da vista da câmera: copia a cor da cena para a cópia dos `FrameTargets`, traça
 * o raio refratado de cada pixel com água pela estrutura de raios (spec 034, o núcleo da refração dos transmissivos) e
 * desenha um triângulo de tela cheia nos alvos da cena — com MSAA, nas amostras, resolvidas na cor —, com teste de
 * profundidade contra a cena (a água se oculta atrás dos objetos) sem escrever nela. Por pixel: a normal da superfície
 * (a do campo, spec 033), o fundo pela refração traçada, a luz espalhada pela espessura, Fresnel, especular e a sombra
 * da cena. Sem o traçado pronto (a estrutura de raios entrando), a cena deslocada. Só grava quando a superfície foi
 * produzida no quadro.
 *
 * A luz vem do ponto de cena `scene_lighting` (spec 011), com a sombra e as cáusticas por luz: o estágio não conhece
 * luzes nem mapas de sombra.
 */
export class WaterFlow extends RenderFlow<WaterSlots, 'idle'> {
    readonly type = 'WaterFlow';
    readonly slots: WaterSlots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource>;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly params: UniformBufferSpec;
    private pipeline: string | undefined;
    private samples = 0;
    private written = '';
    private active = false;
    private water: WaterSurface | undefined;
    /** Traçado da refração em uso e o que compila (nova composição das funções `material`), spec 034. */
    private traceId: string | undefined;
    private nextTraceId: string | undefined;
    private traceRevision = -1;
    /** Amostrador linear da cópia da cena (o limite de interfaces do traçado). */
    private copySampler: SamplerSpec | undefined;
    /** Câmera ativa e tempo do traçado da refração da água. */
    private readonly refractionFrame: UniformBufferSpec;
    /** Os pedidos da água preparados. */
    private requestPrepared = false;
    /** Os alvos da cena (as texturas do traçado). */
    private targets: Resource | undefined;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        this.slots = {
            camera: slot.singleton(Camera.schema),
            cameras: slot.pool(Camera.matricesSchema.name),
            water: slot.singleton(WaterSurface.schema),
            time: slot.singleton(Time.schema),
            target: slot.target({
                color: { schema: FrameTargets.schema, descId: 'color' },
                depth: { schema: FrameTargets.schema, descId: 'depth' },
                samples: { schema: FrameTargets.schema, descId: 'samples' },
            }),
            targets: slot.singleton(FrameTargets.schema),
            rayScene: slot.singleton(RayScene.schema, { optional: true }),
            sky: slot.singleton(Sky.schema, { optional: true }),
        };
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'water_composite_params',
            byteSize: WaterCompositeParamsSchema.stride,
        });
        this.refractionFrame = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'water_refraction_frame',
            byteSize: RefractionFrameSchema.stride,
        });
        this.bindings = new Map<WgslResource, BindingSource>([
            [R.composite, this.params],
            [refractionFrameResource, this.refractionFrame],
        ]);
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

    /** Copia a cena, traça a refração da água e compõe a água sobre a cena. */
    dispatch(frame: Frame, bound: BoundFlow<WaterSlots>): void {
        const water = this.water;
        if (!this.active || water === undefined || this.pipeline === undefined) return;
        if (!this.resources.isProduced(water, WaterSurface.producedDescriptor.camera)) return;
        const prepared = bound.pipelines.get(this.pipeline);
        if (prepared?.role !== 'render' || !prepared.ready) return;
        const target = bound.slots.target;
        const targets = bound.slots.targets.resource;
        const colorView = this.colorView(frame, target);
        const copy = this.resources.textureOf(targets, 'sceneCopy');
        const radiance = this.resources.textureOf(targets, 'refractionRadiance');
        if (
            colorView === undefined
            || copy === undefined
            || radiance === undefined
            || target.depth === undefined
        )
            return;
        frame.copyTextureToTexture(colorView.source, copy, [copy.width, copy.height]);
        const trace = this.tracePipeline(bound);
        const request = this.resources.textureViewOf(targets, 'refractionRequest');
        const distance = this.resources.textureViewOf(targets, 'refractionDistance');
        const requestPipeline = bound.pipelines.get(WATER_REQUEST);
        if (
            trace !== undefined
            && request !== undefined
            && distance !== undefined
            && requestPipeline?.role === 'render'
            && requestPipeline.ready
        ) {
            // Os pedidos da água (os do vidro já foram traçados e compostos) e o mesmo traçado em dois kernels.
            frame.render(
                {
                    colorAttachments: [
                        {
                            view: request,
                            loadOp: 'clear',
                            clearValue: [0, 0, 0, 0],
                            storeOp: 'store',
                        },
                        {
                            view: distance,
                            loadOp: 'clear',
                            clearValue: [0, 0, 0, 0],
                            storeOp: 'store',
                        },
                    ],
                },
                'WaterFlow.refractionRequest',
                (pass) => {
                    pass.bind.setPipeline(requestPipeline.spec);
                    requestPipeline.bindTo(pass.bind);
                    pass.draw.vertices(3);
                },
            );
            frame.compute('WaterFlow.refraction', (pass) => {
                for (const kernel of trace) {
                    pass.bind.setPipeline(kernel.spec);
                    kernel.bindTo(pass.bind);
                    pass.dispatch.workgroups(
                        Math.ceil(radiance.width / 8),
                        Math.ceil(radiance.height / 8),
                    );
                }
            });
        }
        const color = this.colorAttachment(frame, target, { loadOp: 'load' });
        if (color === undefined) return;
        const renderTarget: RenderTarget = {
            colorAttachments: [color],
            depthStencilAttachment: { view: target.depth, depthReadOnly: true },
        };
        frame.render(renderTarget, 'WaterFlow', (pass) => {
            pass.bind.setPipeline(prepared.spec);
            prepared.bindTo(pass.bind);
            pass.draw.vertices(3);
        });
    }

    /** Os pedidos e os dois kernels prontos: a composição lê a radiância traçada. */
    private traceReady(bound: BoundFlow<WaterSlots>): boolean {
        const request = bound.pipelines.get(WATER_REQUEST);
        return (
            this.tracePipeline(bound) !== undefined && request?.role === 'render' && request.ready
        );
    }

    /** Os dois kernels do traçado da refração da água (o caminho e a luz), se prontos. */
    private tracePipeline(
        bound: BoundFlow<WaterSlots>,
    ): readonly [PreparedCompute, PreparedCompute] | undefined {
        if (this.traceId === undefined || bound.slots.rayScene === undefined) return undefined;
        const trace = bound.pipelines.get(this.traceId);
        const shade = bound.pipelines.get(`${this.traceId}:shade`);
        return trace?.role === 'compute' && trace.ready && shade?.role === 'compute' && shade.ready
            ? [trace, shade]
            : undefined;
    }

    /**
     * Os pedidos e o traçado da refração da água (spec 034): os dois kernels com a composição das funções `material` da
     * cena nos acertos, preparados de novo quando o conjunto muda (os anteriores valem até os novos compilarem).
     */
    private syncTrace(ctx: Ctx): void {
        const scene = ctx.bound.slots.rayScene?.resource as RayScene | undefined;
        if (scene === undefined) return;
        if (!this.requestPrepared) {
            ctx.prepare({
                id: WATER_REQUEST,
                role: 'render',
                shader: waterRequest,
                entryPoints: ['water_composite_vs', 'water_request_fs'],
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [{ format: 'rgba32uint' }, { format: 'r32float' }],
            });
            this.requestPrepared = true;
        }
        const ready = (id: string): boolean =>
            ctx.bound.pipelines.get(id)?.ready === true
            && ctx.bound.pipelines.get(`${id}:shade`)?.ready === true;
        if (this.nextTraceId !== undefined && ready(this.nextTraceId)) {
            if (this.traceId !== undefined) {
                ctx.release(this.traceId);
                ctx.release(`${this.traceId}:shade`);
            }
            this.traceId = this.nextTraceId;
            this.nextTraceId = undefined;
        }
        if (scene.materialRevision === this.traceRevision) return;
        this.traceRevision = scene.materialRevision;
        const fns = scene.materialFunctions;
        const id = `water_refraction:${scene.materialRevision}`;
        if (this.nextTraceId !== undefined) {
            ctx.release(this.nextTraceId);
            ctx.release(`${this.nextTraceId}:shade`);
        }
        const compose = (shader: WgslModule): WgslModule =>
            fns.length === 0
                ? shader
                : bindPoints(shader, new Map([[rayHitMaterialPoint, composeHitMaterial(fns)]]));
        ctx.prepare({
            id,
            role: 'compute',
            shader: compose(refractionKernels.trace),
            entryPoints: ['refraction_trace_main'],
        });
        ctx.prepare({
            id: `${id}:shade`,
            role: 'compute',
            shader: compose(refractionKernels.shade),
            entryPoints: ['refraction_shade_main'],
        });
        if (this.traceId === undefined) this.traceId = id;
        else this.nextTraceId = id;
    }

    /** Libera os recursos privados. */
    override dispose(): void {
        this.core.destroy(this.params);
        this.core.destroy(this.refractionFrame);
        if (this.copySampler !== undefined) this.core.destroy(this.copySampler);
    }

    /** Pipeline (variante pelas amostras da cena), fontes e parâmetros — antes da gravação. */
    private prepareFrame(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        const water = slots.water.resource as WaterSurface;
        this.water = water;
        if (!this.resources.isProduced(water, WaterSurface.producedDescriptor.camera)) {
            this.active = false;
            return;
        }
        const depthView = this.resources.textureViewOf(water, 'depth');
        const materials = this.resources.poolBufferSpec(FluidSurfaceMaterial.schema.name);
        const sceneDepth = slots.target.depth;
        // A cópia da cena e a radiância traçada (spec 034), sob demanda nos alvos.
        const targets = slots.targets.resource;
        this.targets = targets;
        for (const id of WATER_TARGETS) this.resources.ensureAllocated(targets, id);
        const copy = this.resources.textureViewOf(targets, 'sceneCopy');
        const radiance = this.resources.textureViewOf(targets, 'refractionRadiance');
        this.active =
            depthView !== undefined
            && materials !== undefined
            && sceneDepth !== undefined
            && copy !== undefined
            && radiance !== undefined;
        if (
            depthView === undefined
            || materials === undefined
            || sceneDepth === undefined
            || copy === undefined
            || radiance === undefined
        )
            return;
        this.copySampler ??= this.core.create<SamplerSpec>({
            kind: 'sampler',
            discriminator: 'water_scene_copy_sampler',
            desc: {
                magFilter: 'linear',
                minFilter: 'linear',
                mipmapFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge',
            },
        });
        const samples = slots.target.sampleCount;
        if (this.pipeline === undefined || samples !== this.samples) {
            if (this.pipeline !== undefined) ctx.release(this.pipeline);
            this.samples = samples;
            this.pipeline = `water_composite:${samples}`;
            ctx.bind(this.sources(water, sceneDepth, copy, radiance));
            ctx.prepare({
                id: this.pipeline,
                role: 'render',
                shader: samples > 1 ? waterComposite.sceneMs : waterComposite.scene,
                entryPoints: ['water_composite_vs', 'water_composite_fs'],
                // Lobos da superfície e do volume (spec 011): o especular dielétrico e o difuso espalhado.
                constants: { CLOSURE_LOBES: LOBES.specular | LOBES.diffuse },
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [{ format: slots.target.format ?? this.core.canvasFormat }],
                depth: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
                multisample: { count: samples },
            });
        } else {
            ctx.bind(this.sources(water, sceneDepth, copy, radiance));
        }
        this.syncTrace(ctx);
        this.writeParams(ctx);
    }

    /**
     * Fontes do passe e do traçado: texturas da superfície, profundidade da cena, a cópia da cena e a radiância traçada
     * (o pool de materiais vem da C2).
     */
    private sources(
        water: WaterSurface,
        sceneDepth: TextureViewSpec,
        copy: TextureViewSpec,
        radiance: TextureViewSpec,
    ): BindingSources {
        const tex = (id: string): TextureViewSpec => this.resources.textureViewOf(water, id)!;
        return new Map<WgslResource, BindingSource>([
            [R.depth, tex('depth')],
            [R.material, tex('material')],
            [R.normal, tex('normal')],
            [this.samples > 1 ? R.sceneDepthMs : R.sceneDepth, sceneDepth],
            [transmissionResources.sceneCopy, copy],
            [transmissionResources.sampler, this.copySampler!],
            [transmissionResources.radiance, radiance],
            [transmissionResources.radianceOut, radiance],
            ...this.traceSources(),
        ]);
    }

    /** As texturas do traçado nos alvos (os pedidos, a distância e as do caminho entre os dois kernels). */
    private traceSources(): [WgslResource, BindingSource][] {
        const targets = this.targets;
        if (targets === undefined) return [];
        const view = (id: string): TextureViewSpec | undefined =>
            this.resources.textureViewOf(targets, id);
        const pairs: [WgslResource[], string][] = [
            [[transmissionResources.request], 'refractionRequest'],
            [[transmissionResources.distance], 'refractionDistance'],
            [[transmissionResources.partialOut, transmissionResources.partialIn], 'refractionBlur'],
            [[transmissionResources.hitOut, transmissionResources.hitIn], 'refractionHit'],
            [
                [transmissionResources.hitInfoOut, transmissionResources.hitInfoIn],
                'refractionHitInfo',
            ],
            [
                [transmissionResources.throughputOut, transmissionResources.throughputIn],
                'refractionThroughput',
            ],
        ];
        const out: [WgslResource, BindingSource][] = [];
        for (const [resources, id] of pairs) {
            const v = view(id);
            if (v === undefined) continue;
            for (const r of resources) out.push([r, v]);
        }
        return out;
    }

    /** Slot da câmera, tamanho e tempo — escritos quando mudam. */
    private writeParams(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        const cameraId = this.world.entityIdOfResource(slots.camera.resource);
        const cameraSlot = cameraId === undefined ? 0 : (slots.cameras.slotOf(cameraId) ?? 0);
        const { width, height } = this.core.canvasSize() ?? { width: 1, height: 1 };
        // O tempo muda a cada quadro (ondulações): um uniform pequeno por quadro, só com água na tela.
        const time = (slots.time.resource as Time).data.elapsed;
        const traced = this.traceReady(ctx.bound) ? 1 : 0;
        const sky = slots.sky !== undefined;
        const key = `${cameraSlot}:${width}x${height}:${time}:${traced}:${sky}`;
        if (key === this.written) return;
        this.written = key;
        this.core.write(
            this.params,
            WaterCompositeParamsSchema.pack({
                cameraSlot,
                viewport: [width, height],
                time,
                traced,
            }),
        );
        this.core.write(
            this.refractionFrame,
            Refraction.frameParams(cameraSlot, time, SCENE_CLEAR_COLOR, sky),
        );
    }
}
