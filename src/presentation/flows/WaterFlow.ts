import type {
    EngineCore,
    Frame,
    RenderTarget,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type {
    BindingSource,
    BindingSources,
    BoundFlow,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
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
import { waterComposite, waterResources as R } from '../water/shaders';
import { Time } from '../../scene/time/Time';

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
 *
 * A luz que ilumina e a sombra vêm dos pontos de cena do sombreamento (`scene_light_direction`, `light_visibility`,
 * spec 031): o estágio não conhece luzes nem mapas de sombra.
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
        };
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'water_composite_params',
            byteSize: WaterCompositeParamsSchema.stride,
        });
        this.bindings = new Map<WgslResource, BindingSource>([[R.composite, this.params]]);
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
        if (!this.resources.isProduced(water, WaterSurface.producedDescriptor.camera)) return;
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
            prepared.bindTo(pass.bind);
            pass.draw.vertices(3);
        });
    }

    /** Libera os recursos privados. */
    override dispose(): void {
        this.core.destroy(this.params);
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
        this.active =
            depthView !== undefined && materials !== undefined && sceneDepth !== undefined;
        if (depthView === undefined || materials === undefined || sceneDepth === undefined) return;
        const samples = slots.target.sampleCount;
        if (this.pipeline === undefined || samples !== this.samples) {
            if (this.pipeline !== undefined) ctx.release(this.pipeline);
            this.samples = samples;
            this.pipeline = `water_composite:${samples}`;
            ctx.bind(this.sources(water, sceneDepth));
            ctx.prepare({
                id: this.pipeline,
                role: 'render',
                shader: samples > 1 ? waterComposite.sceneMs : waterComposite.scene,
                entryPoints: ['water_composite_vs', 'water_composite_fs'],
                topology: 'triangle-list',
                cullMode: 'none',
                colorTargets: [{ format: slots.target.format ?? this.core.canvasFormat }],
                depth: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' },
                multisample: { count: samples },
            });
        } else {
            ctx.bind(this.sources(water, sceneDepth));
        }
        this.writeParams(ctx);
    }

    /** Fontes do passe: texturas da superfície e profundidade da cena (o pool de materiais vem da C2). */
    private sources(water: WaterSurface, sceneDepth: TextureViewSpec): BindingSources {
        const tex = (id: string): TextureViewSpec => this.resources.textureViewOf(water, id)!;
        return new Map<WgslResource, BindingSource>([
            [R.depth, tex('depth')],
            [R.thickness, tex('thickness')],
            [R.material, tex('material')],
            [R.background, tex('background')],
            [this.samples > 1 ? R.sceneDepthMs : R.sceneDepth, sceneDepth],
        ]);
    }

    /** Slot da câmera, tamanho e tempo — escritos quando mudam. */
    private writeParams(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        const cameraId = this.world.entityIdOfResource(slots.camera.resource);
        const cameraSlot = cameraId === undefined ? 0 : (slots.cameras.slotOf(cameraId) ?? 0);
        const { width, height } = this.core.canvasSize() ?? { width: 1, height: 1 };
        // O tempo muda a cada quadro (ondulações): um uniform pequeno por quadro, só com água na tela.
        const time = (slots.time.resource as Time).data.elapsed;
        const key = `${cameraSlot}:${width}x${height}:${time}`;
        if (key === this.written) return;
        this.written = key;
        this.core.write(
            this.params,
            WaterCompositeParamsSchema.pack({ cameraSlot, viewport: [width, height], time }),
        );
    }
}
