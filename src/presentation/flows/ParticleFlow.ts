import type { EntityId } from '../../scene/world/EntityId';
import type {
    EngineCore,
    Frame,
    RenderTarget,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { BindingSources, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import {
    slot,
    type EntitiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TargetSlot,
} from '../../scene/flows/slots';
import type { World } from '../../scene/world/World';
import { PerStepUniforms } from '../../elements/gpu/compute/PerStepUniforms';
import { Material } from '../../elements/material/Material';
import { FluidSurfaceMaterial } from '../../elements/material/FluidSurfaceMaterial';
import { PointSpriteMaterial } from '../../elements/material/PointSpriteMaterial';
import {
    ForwardFrameParamsSchema,
    NO_LIGHT_SLOT,
    ParticleDrawParamsSchema,
} from '../../elements/material/forwardSchemas';
import { particleSprite } from '../../elements/material/shaders';
import { ParticleBody } from '../../elements/physics/bodies/ParticleBody';
import { SoftBody } from '../../elements/physics/bodies/SoftBody';
import { Camera } from '../../elements/scene/Camera';
import { Light } from '../../elements/scene/Light';
import { FrameTargets } from '../app/FrameTargets';

/** Slots do desenho de corpos de partículas. */
export interface ParticleSlots extends SlotMap {
    /** Câmera ativa. */
    readonly camera: SingletonSlot<false>;
    /** Pool `CameraMatrices` (produzido na GPU pelo estágio de câmera). */
    readonly cameras: PoolSlot<false>;
    /** Pool `Light` (direção da luz que ilumina; opcional). */
    readonly lights: PoolSlot<true>;
    /** Corpos de partículas com material (só `PointSpriteMaterial` é desenhado). */
    readonly bodies: EntitiesSlot;
    /** Cor e profundidade da cena (`FrameTargets`), carregadas: o desenho vem depois do forward. */
    readonly target: TargetSlot;
}

const slots: ParticleSlots = {
    camera: slot.singleton(Camera.schema),
    cameras: slot.pool(Camera.matricesSchema.name),
    lights: slot.pool(Light.schema.name, { optional: true }),
    bodies: slot.entities({ all: [ParticleBody, Material] }),
    target: slot.target({
        color: { schema: FrameTargets.schema, descId: 'color' },
        depth: { schema: FrameTargets.schema, descId: 'depth' },
        samples: { schema: FrameTargets.schema, descId: 'samples' },
    }),
};

type Ctx = TransitionContext<ParticleSlots>;

/** Corpo desenhado: a região de parâmetros dele e o pipeline do pool do schema. */
interface DrawnBody {
    readonly entity: EntityId;
    readonly body: ParticleBody;
    readonly pipeline: string;
}

/**
 * ParticleFlow — desenha os corpos de partículas (`FluidBody`, `SoftBody`) com `PointSpriteMaterial` como sprites (spec
 * 008, research R4): **um desenho por corpo** (`draw.vertices(6, N)`), com o vertex shader lendo a posição de cada
 * partícula direto do pool do corpo pelo índice da instância — sem cópia para vertex buffer nem leitura de volta.
 *
 *   - grupo 0: o pool `CameraMatrices`, os parâmetros do quadro (slots da câmera e da luz) e o pool `Light`;
 *   - grupo 1: o pool do corpo (`array<vec4f>`, ligado por pipeline — um pipeline por pool de partícula) e o pool
 *     `PointSpriteMaterial`;
 *   - grupo 2: a região `ParticleDrawParams` do corpo (início da faixa, stride e deslocamento do campo `pos` em
 *     `vec4f`, slot do material), por offset dinâmico.
 *
 * Desenha depois do forward, na cor e na profundidade da cena (`loadOp: 'load'`), com teste e escrita de profundidade:
 * partículas e geometrias se ocultam. Os parâmetros são escritos quando um corpo entra ou sai; os pools são religados
 * quando crescem (detectado em `framePrepare`). Corpos com `FluidSurfaceMaterial` são da superfície de água (spec 017);
 * com outro material ficam fora, com aviso único.
 */
export class ParticleFlow extends RenderFlow<ParticleSlots, 'idle'> {
    readonly type = 'ParticleFlow';
    readonly slots = slots;
    override readonly bindings: BindingSources;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly frameParams: UniformBufferSpec;
    private readonly dummyLights: StorageBufferSpec;
    private readonly draws: PerStepUniforms;
    private readonly bodies = new Map<EntityId, DrawnBody>();
    /** Buffer ligado a cada pool de partícula (religado quando o pool cresce). */
    private readonly boundPools = new Map<string, StorageBufferSpec>();
    private readonly warned = new Set<EntityId>();
    private drawsDirty = false;
    private writtenFrame = '';
    /** Ordem de desenho (a região de cada corpo é o índice dele aqui). */
    private order: DrawnBody[] = [];

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        this.frameParams = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'particle_frame_params',
            byteSize: ForwardFrameParamsSchema.stride,
        });
        this.dummyLights = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'particle_lights_dummy',
            byteSize: Light.schema.stride,
        });
        this.draws = new PerStepUniforms(ctx.core, {
            discriminator: 'particle_draw_params',
            schema: ParticleDrawParamsSchema,
        });
        this.draws.reserve(1);
        this.bindings = {
            particle_frame: this.frameParams,
            lights: this.dummyLights,
            particle_draw: this.draws.source(),
        };
        const lights = {
            to: 'idle' as const,
            run: (_e: unknown, c: Ctx) => {
                c.bind({ lights: c.bound.slots.lights?.buffer ?? this.dummyLights });
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        c.bind({ lights: c.bound.slots.lights?.buffer ?? this.dummyLights });
                        this.track(
                            c,
                            c.bound.slots.bodies.entries.map((e) => e.entityId),
                            [],
                        );
                    },
                },
                slotChanged: lights,
                poolReallocated: lights,
                entitiesChanged: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type === 'entitiesChanged' && e.slot === 'bodies')
                            this.track(c, e.added, e.removed);
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                canvasReconfigured: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.rebindPools(c);
                        this.writeDraws(c);
                        this.writeFrameParams(c);
                    },
                },
            },
        };
    }

    /** Grava um desenho por corpo, sobre a cor e a profundidade da cena. */
    dispatch(frame: Frame, bound: BoundFlow<ParticleSlots>): void {
        if (this.order.length === 0) return;
        const target = bound.slots.target;
        // Com MSAA, carrega as amostras do forward e resolve de novo na cor da cena.
        const color = this.colorAttachment(frame, target, { loadOp: 'load' });
        if (color === undefined || target.depth === undefined) return;
        const renderTarget: RenderTarget = {
            colorAttachments: [color],
            depthStencilAttachment: {
                view: target.depth,
                depthLoadOp: 'load',
                depthStoreOp: 'store',
            },
        };
        frame.render(renderTarget, 'ParticleFlow', (pass) => {
            let current: string | undefined;
            this.order.forEach((drawn, region) => {
                const prepared = bound.pipelines.get(drawn.pipeline);
                if (prepared?.role !== 'render' || !prepared.ready) return;
                if (drawn.pipeline !== current) {
                    pass.bind
                        .setPipeline(prepared.spec)
                        .setBindGroup(0, prepared.groups[0]!)
                        .setBindGroup(1, prepared.groups[1]!);
                    current = drawn.pipeline;
                }
                pass.bind.setBindGroup(2, prepared.groups[2]!, [this.draws.offset(region)]);
                pass.draw.vertices(6, drawn.body.count, 0, 0);
            });
        });
    }

    /** Libera os recursos privados. */
    override dispose(): void {
        this.draws.dispose();
        this.core.destroy(this.frameParams);
        this.core.destroy(this.dummyLights);
    }

    /** Corpos que entraram (pipeline do pool preparado) e saíram do conjunto. */
    private track(ctx: Ctx, added: readonly EntityId[], removed: readonly EntityId[]): void {
        for (const id of removed) {
            this.bodies.delete(id);
            this.warned.delete(id);
        }
        const entries = ctx.bound.slots.bodies;
        for (const id of added) {
            const entry = entries.entry(id);
            if (entry === undefined) continue;
            const body = entry.get(ParticleBody);
            // Corpo com superfície (malha): desenhado pelo forward como geometria, não como sprites.
            if (body instanceof SoftBody && body.surface !== undefined) continue;
            const material = entry.get(Material);
            // Água (spec 017): desenhada pelos estágios da superfície de água.
            if (material instanceof FluidSurfaceMaterial) continue;
            if (!(material instanceof PointSpriteMaterial)) {
                if (!this.warned.has(id)) {
                    this.warned.add(id);
                    console.warn(
                        `[ParticleFlow] Corpo de partículas da entidade ${id} com material `
                            + `'${material.constructor.name}': só PointSpriteMaterial é desenhado.`,
                    );
                }
                continue;
            }
            const poolKey = this.resources.poolKeyForResource(body);
            if (poolKey === undefined) continue;
            this.bodies.set(id, { entity: id, body, pipeline: this.preparePool(ctx, poolKey) });
        }
        this.drawsDirty = true;
    }

    /** Pipeline do pool de partícula (um por pool: o pool é um binding privado dele). */
    private preparePool(ctx: Ctx, poolKey: string): string {
        const id = `particle_sprite:${poolKey}`;
        if (this.boundPools.has(poolKey)) return id;
        const format = ctx.bound.slots.target.format ?? this.core.canvasFormat;
        const descriptor: PipelineDescriptor = {
            id,
            role: 'render',
            shader: particleSprite,
            entryPoints: ['vs_main', 'fs_main'],
            consumes: [Camera.matricesSchema.name, PointSpriteMaterial.schema.name],
            topology: 'triangle-list',
            cullMode: 'none',
            colorTargets: [{ format }],
            depth: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
            multisample: { count: ctx.bound.slots.target.sampleCount },
        };
        const buffer = this.resources.poolBufferSpec(poolKey)!;
        this.boundPools.set(poolKey, buffer);
        ctx.bind({ [`${id}:particles`]: buffer });
        ctx.prepare(descriptor);
        return id;
    }

    /** Religa o pool de cada pipeline cujo buffer foi recriado pelo crescimento. */
    private rebindPools(ctx: Ctx): void {
        for (const [poolKey, bound] of this.boundPools) {
            const buffer = this.resources.poolBufferSpec(poolKey);
            if (buffer === undefined || buffer === bound) continue;
            this.boundPools.set(poolKey, buffer);
            ctx.bind({ [`particle_sprite:${poolKey}:particles`]: buffer });
            this.drawsDirty = true;
        }
    }

    /** Uma região por corpo: início da faixa, layout do registro e slot do material — escritas quando mudam. */
    private writeDraws(ctx: Ctx): void {
        if (!this.drawsDirty) return;
        this.drawsDirty = false;
        this.order = [...this.bodies.values()];
        if (this.order.length === 0) return;
        if (this.draws.reserve(this.order.length)) ctx.bind({ particle_draw: this.draws.source() });
        this.order.forEach((drawn, region) => {
            const schema = drawn.body.particleSchema;
            const poolKey = this.resources.poolKeyForResource(drawn.body)!;
            const range = this.resources.poolRangeOf(poolKey, drawn.entity);
            const material = this.resources.poolSlotOf(
                PointSpriteMaterial.schema.name,
                drawn.entity,
            );
            this.draws.write(region, {
                first: range?.first ?? 0,
                strideVec4: schema.stride / 16,
                posOffsetVec4: schema.offsetOf('pos') / 16,
                materialSlot: material ?? 0,
            });
        });
        this.draws.flush(this.order.length);
    }

    /** Slots da câmera ativa e da luz que ilumina (a primeira luz viva do pool), escritos quando mudam. */
    private writeFrameParams(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        const cameraId = this.world.entityIdOfResource(slots.camera.resource);
        const cameraSlot = cameraId === undefined ? 0 : (slots.cameras.slotOf(cameraId) ?? 0);
        const lights = slots.lights;
        let lightSlot = NO_LIGHT_SLOT;
        for (let s = 0; lights !== undefined && s < lights.count; s++) {
            if (lights.entityAt(s) === undefined) continue;
            lightSlot = s;
            break;
        }
        const key = `${cameraSlot}:${lightSlot}`;
        if (key === this.writtenFrame) return;
        this.core.write(
            this.frameParams,
            ForwardFrameParamsSchema.pack({
                cameraSlot,
                lightSlot,
                shadowEnabled: 0,
                shadowSlot: 0,
            }),
        );
        this.writtenFrame = key;
    }
}
