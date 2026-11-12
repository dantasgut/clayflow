import type { EntityId } from '../../scene/world/EntityId';
import type {
    EngineCore,
    Frame,
    IndirectBufferSpec,
    RenderPass,
    RenderTarget,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { FlowWork, type WorkContext } from '../../scene/flows/FlowWork';
import type {
    BindingKey,
    BindingSource,
    BoundFlow,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
import { sameBindGroup } from '../../scene/flows/FlowBinding';
import type { BindGroupSpec } from '../../scene/contracts/gpu';
import { BINDING_FREQUENCIES } from '../../scene/shaders/WgslResource';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { PARAMS_LOBES } from '../../elements/material/pbr/lobes';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import {
    slot,
    type ChannelSlot,
    type EntitiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TargetSlot,
    type TextureSlot,
    type WorkSlot,
} from '../../scene/flows/slots';
import type { World } from '../../scene/world/World';
import { PerStepUniforms } from '../../elements/gpu/compute/PerStepUniforms';
import { Material } from '../../elements/material/Material';
import { PointSpriteMaterial } from '../../elements/material/PointSpriteMaterial';
import { Geometry } from '../../elements/geometry/Geometry';
import {
    particleDrawResource,
    particleFrameResource,
    particleListResource,
    particlePoolResource,
} from '../../elements/material/renderResources';
import {
    ParticleFrameParamsSchema,
    ParticleDrawParamsSchema,
} from '../../elements/material/forwardSchemas';
import { particleSprite } from '../../elements/material/shaders';
import { ParticleBody } from '../../elements/physics/bodies/ParticleBody';
import { Camera } from '../../elements/scene/Camera';
import { TemporalAntialiasing } from '../../elements/scene/TemporalAntialiasing';
import { NONE } from '../../scene/shaders/engineConstants';
import { Time } from '../../scene/time/Time';
import { FrameTargets } from '../app/FrameTargets';
import { DRAW_CULL_HZB, DRAW_CULL_STATS } from './DrawCulling';
import { ForwardWorkSchema } from './renderSchemas';
import { ParticleCulling } from './ParticleCulling';

/** Slots do desenho de corpos de partículas. */
export interface ParticleSlots extends SlotMap {
    /** Câmera ativa. */
    readonly camera: SingletonSlot<false>;
    /** Pool `CameraMatrices` (produzido na GPU pelo estágio de câmera). */
    readonly cameras: PoolSlot<false>;
    /** Corpos de partículas com material (só `PointSpriteMaterial` é desenhado). */
    readonly bodies: EntitiesSlot;
    /** Cor e profundidade da cena (`FrameTargets`), carregadas: o desenho vem depois do forward. */
    readonly target: TargetSlot;
    /** Vetores de movimento (`FrameTargets.motion`, spec 034; sem MSAA): os sprites escrevem o deles. */
    readonly motion: TextureSlot<true>;
    /** Antisserrilhado da cena: o passe de movimento vale com o modo temporal. */
    readonly antialiasing: SingletonSlot<true>;
    /** Relógio da cena: o tempo simulado no quadro (o quanto a partícula andou). */
    readonly time: SingletonSlot<true>;
    /** O espaço de trabalho do desenho: parâmetros do quadro e uma região por corpo (spec 039). */
    readonly work: WorkSlot<ParticleWork>;
    /** O descarte ligado (`FrameTargets.culling`, spec 034 T060d). */
    readonly targets: SingletonSlot<true>;
    /**
     * A hierarquia de profundidade e as medidas do descarte do desenho principal (as séries do `ForwardFlow`, spec 034
     * T060d): as partículas escondidas atrás do que ele desenhou neste quadro saem da lista.
     */
    readonly hzb: ChannelSlot<true>;
    readonly cullStats: ChannelSlot<true>;
}

/** Id dos parâmetros do quadro no trabalho. */
const FRAME_PARAMS = 'particle_frame_params';

/** Resource de trabalho do `ParticleFlow` (spec 039): `ParticleFrameParams` e as regiões `ParticleDrawParams`. */
class ParticleWork extends FlowWork {
    static readonly schema = new StructSchema('ParticleWork', {});

    constructor() {
        super();
        this.use({
            descriptors: () => [
                // Escritos da CPU só quando mudam (`writeNow`).
                {
                    id: FRAME_PARAMS,
                    role: 'uniform',
                    schema: ParticleFrameParamsSchema,
                    upload: 'never',
                },
            ],
        });
    }
}

const baseSlots = {
    camera: slot.singleton(Camera.schema),
    cameras: slot.pool(Camera.matricesSchema.name),
    bodies: slot.entities({ all: [ParticleBody, Material] }),
    target: slot.target({
        color: { schema: FrameTargets.schema, descId: 'color' },
        depth: { schema: FrameTargets.schema, descId: 'depth' },
        samples: { schema: FrameTargets.schema, descId: 'samples' },
    }),
    motion: slot.texture(FrameTargets.schema, 'motion', { optional: true }),
    antialiasing: slot.singleton(TemporalAntialiasing.schema, { optional: true }),
    time: slot.singleton(Time.schema, { optional: true }),
    targets: slot.singleton(FrameTargets.schema, { optional: true }),
    hzb: slot.channel(ForwardWorkSchema, DRAW_CULL_HZB, { optional: true }),
    cullStats: slot.channel(ForwardWorkSchema, DRAW_CULL_STATS, { optional: true }),
};

type Ctx = TransitionContext<ParticleSlots>;

/** Corpo desenhado: a região de parâmetros dele e os pipelines do pool do schema (cor e movimento). */
interface DrawnBody {
    readonly entity: EntityId;
    readonly body: ParticleBody;
    readonly poolKey: string;
    readonly pipeline: string;
    /** Pipeline do passe de movimento (spec 034; sem MSAA), ou `undefined`. */
    readonly motion: string | undefined;
}

/**
 * ParticleFlow — desenha os corpos de partículas (`FluidBody`, `SoftBody`) com `PointSpriteMaterial` como sprites (spec
 * 008, research R4): **um desenho por corpo** (`draw.vertices(6, N)`), com o vertex shader lendo a posição de cada
 * partícula direto do pool do corpo pelo índice da instância — sem cópia para vertex buffer nem leitura de volta.
 *
 *   - grupo 0: o pool `CameraMatrices` e os parâmetros do quadro (slot da câmera); a luz vem do ponto de cena
 *     `scene_lighting` (spec 011);
 *   - grupo 1: o pool do corpo (`array<vec4f>`, ligado por pipeline — um pipeline por pool de partícula) e o pool
 *     `PointSpriteMaterial`;
 *   - grupo 2: a região `ParticleDrawParams` do corpo (início da faixa, stride e deslocamento do campo `pos` em
 *     `vec4f`, slot do material), por offset dinâmico.
 *
 * Desenha depois do forward, na cor e na profundidade da cena (`loadOp: 'load'`), com teste e escrita de profundidade:
 * partículas e geometrias se ocultam. Os parâmetros são escritos quando um corpo entra ou sai; os pools são religados
 * quando crescem (detectado em `framePrepare`). Corpos de fluido sem material de desenho (a aparência pela função
 * `material`, spec 034) são da superfície do campo dos fluidos e não entram aqui; com outro material ficam fora, com
 * aviso único.
 */
export class ParticleFlow extends RenderFlow<ParticleSlots, 'idle'> {
    readonly type = 'ParticleFlow';
    readonly slots: ParticleSlots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly work: WorkContext;
    private readonly draws: PerStepUniforms;
    private readonly bodies = new Map<EntityId, DrawnBody>();
    /** O pool e a lista ligados aos pipelines de cada corpo (religados quando o pool cresce ou a lista é realocada). */
    private readonly boundSources = new Map<EntityId, string>();
    /** O descarte das partículas pela GPU (spec 034, T060d): a lista e os argumentos do desenho de cada corpo. */
    private readonly culling: ParticleCulling;
    private readonly ids = new WeakMap<object, number>();
    private nextId = 1;
    /** Os pipelines do corpo que esperam o pool e a lista ligados. */
    private readonly pending = new Map<EntityId, PipelineDescriptor[]>();
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
        const work = new ParticleWork();
        this.work = { core: ctx.core, resources: ctx.resources, work };
        this.slots = { ...baseSlots, work: slot.work(() => work) };
        this.draws = new PerStepUniforms(this.work, {
            id: 'particle_draw_params',
            schema: ParticleDrawParamsSchema,
        });
        this.draws.reserve(1);
        this.culling = new ParticleCulling(this.work);
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        // O trabalho já está na cena: as fontes privadas ligam ao que a C2 alocou.
                        c.bind(
                            new Map<BindingKey, BindingSource>([
                                [
                                    particleFrameResource,
                                    this.resources.bufferOf(
                                        work,
                                        FRAME_PARAMS,
                                    ) as UniformBufferSpec,
                                ],
                                [particleDrawResource, this.draws.source()],
                            ]),
                        );
                        this.track(
                            c,
                            c.bound.slots.bodies.entries.map((e) => e.entityId),
                            [],
                        );
                    },
                },
                slotChanged: 'ignore',
                poolReallocated: 'ignore',
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
                        this.writeDraws(c);
                        const cameraSlot = this.writeFrameParams(c);
                        this.syncCulling(c, cameraSlot);
                    },
                },
            },
        };
    }

    /**
     * Grava as listas do descarte (compute) e um desenho indireto por corpo, sobre a cor e a profundidade da cena. A
     * hierarquia de profundidade vale se o desenho principal a gravou neste quadro (as duas séries com idade 0).
     */
    dispatch(frame: Frame, bound: BoundFlow<ParticleSlots>): void {
        if (this.order.length === 0) return;
        const hzb = bound.slots.hzb?.age(0) === 0 && bound.slots.cullStats?.age(0) === 0;
        const args = new Map<EntityId, IndirectBufferSpec>();
        for (const drawn of this.order) {
            const a = this.culling.record(frame, drawn.entity, drawn.body.count, hzb);
            if (a !== undefined) args.set(drawn.entity, a);
        }
        if (args.size === 0) return;
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
            this.recordBodies(pass, bound, args, (drawn) => drawn.pipeline);
        });
        // Passe de movimento (spec 034): com o temporal, os mesmos quadrados com a profundidade de agora (teste igual)
        // escrevem o deslocamento de cada sprite sobre o do forward.
        const motion = bound.slots.motion;
        const aa = bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        if (motion === undefined || aa?.mode !== 'temporal') return;
        frame.render(
            {
                colorAttachments: [{ view: motion.view, loadOp: 'load', storeOp: 'store' }],
                depthStencilAttachment: {
                    view: target.depth,
                    depthLoadOp: 'load',
                    depthStoreOp: 'store',
                },
            },
            'ParticleFlow.motion',
            (pass) => {
                this.recordBodies(pass, bound, args, (drawn) => drawn.motion);
            },
        );
    }

    /**
     * Um desenho indireto por corpo (os argumentos da lista dele) com o pipeline escolhido (os grupos compartilhados uma
     * vez; a região por offset).
     */
    private recordBodies(
        pass: RenderPass,
        bound: BoundFlow<ParticleSlots>,
        args: ReadonlyMap<EntityId, IndirectBufferSpec>,
        pipelineOf: (drawn: DrawnBody) => string | undefined,
    ): void {
        let current: string | undefined;
        const boundGroups: (BindGroupSpec | undefined)[] = [];
        this.order.forEach((drawn, region) => {
            const indirect = args.get(drawn.entity);
            if (indirect === undefined) return;
            const id = pipelineOf(drawn);
            const prepared = id === undefined ? undefined : bound.pipelines.get(id);
            if (prepared?.role !== 'render' || !prepared.ready) return;
            if (id !== current) {
                pass.bind.setPipeline(prepared.spec);
                for (const frequency of BINDING_FREQUENCIES) {
                    if (frequency === 'draw') continue;
                    for (const g of prepared.groupsOf(frequency)) {
                        if (sameBindGroup(boundGroups[g.index], g.spec)) continue;
                        pass.bind.setBindGroup(g.index, g.spec);
                        boundGroups[g.index] = g.spec;
                    }
                }
                current = id;
            }
            // Região do corpo (offset dinâmico) a cada desenho.
            for (const g of prepared.groupsOf('draw')) {
                pass.bind.setBindGroup(g.index, g.spec, [this.draws.offset(region)]);
                boundGroups[g.index] = undefined;
            }
            pass.draw.indirect(indirect, ParticleCulling.drawOffset);
        });
    }

    /** Os parâmetros são do `ParticleWork` (a C2 os libera com ele). */
    override dispose(): void {}

    /** Corpos que entraram (pipeline do pool preparado) e saíram do conjunto. */
    private track(ctx: Ctx, added: readonly EntityId[], removed: readonly EntityId[]): void {
        for (const id of removed) {
            const drawn = this.bodies.get(id);
            if (drawn !== undefined && !this.pending.has(id)) {
                ctx.release(drawn.pipeline);
                if (drawn.motion !== undefined) ctx.release(drawn.motion);
            }
            this.bodies.delete(id);
            this.boundSources.delete(id);
            this.pending.delete(id);
            this.warned.delete(id);
        }
        const entries = ctx.bound.slots.bodies;
        for (const id of added) {
            const entry = entries.entry(id);
            if (entry === undefined) continue;
            const body = entry.get(ParticleBody);
            // Entidade com geometria (ex.: superfície de um corpo mole): desenhada pelo forward como malha.
            if (entry.resources.some((r) => r instanceof Geometry)) continue;
            const material = entry.get(Material);
            // Material que desenha corpos numa família de outro estágio (ex.: a superfície de água): desenhado por ele.
            if (material.drawsParticles && material.family !== 'points') continue;
            if (!material.drawsParticles || !(material instanceof PointSpriteMaterial)) {
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
            const pipelines = this.preparePipelines(ctx, poolKey, id);
            this.bodies.set(id, { entity: id, body, poolKey, ...pipelines });
        }
        this.drawsDirty = true;
    }

    /**
     * Pipelines do corpo (um por corpo: o pool e a lista do descarte são bindings privados dele): a cor e, sem MSAA, o
     * movimento (o mesmo vértice, `fs_motion`, teste de profundidade igual sem escrita; spec 034). Preparados em
     * `syncCulling`, depois de ligados o pool e a lista (alocada pelo descarte).
     */
    private preparePipelines(
        ctx: Ctx,
        poolKey: string,
        entity: EntityId,
    ): { pipeline: string; motion: string | undefined } {
        const id = `particle_sprite:${poolKey}:${entity}`;
        const samples = ctx.bound.slots.target.sampleCount;
        const motionId = samples === 1 ? `${id}:motion` : undefined;
        const format = ctx.bound.slots.target.format ?? this.core.canvasFormat;
        const descriptor: PipelineDescriptor = {
            id,
            role: 'render',
            shader: particleSprite,
            entryPoints: ['vs_main', 'fs_main'],
            // Lobos do fechamento da partícula (spec 011): difuso, especular e emissão.
            constants: { CLOSURE_LOBES: PARAMS_LOBES },
            topology: 'triangle-list',
            cullMode: 'none',
            colorTargets: [{ format }],
            depth: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
            multisample: { count: samples },
        };
        const descriptors = [descriptor];
        if (motionId !== undefined)
            descriptors.push({
                ...descriptor,
                id: motionId,
                entryPoints: ['vs_main', 'fs_motion'],
                colorTargets: [{ format: 'rgba16float' }],
                depth: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'equal' },
            });
        this.pending.set(entity, descriptors);
        return { pipeline: id, motion: motionId };
    }

    /**
     * O descarte do quadro: as palavras de cada corpo (faixa, layout, material, câmera, descarte ligado), as listas e os
     * argumentos (`ParticleCulling.sync`); o pool e a lista religados aos pipelines do corpo quando mudam.
     */
    private syncCulling(ctx: Ctx, cameraSlot: number): void {
        const targets = ctx.bound.slots.targets?.resource as FrameTargets | undefined;
        const enabled = targets?.data.culling !== 0;
        const inputs = [];
        for (const drawn of this.order) {
            const pool = this.resources.poolBufferSpec(drawn.poolKey);
            if (pool === undefined) continue;
            const schema = drawn.body.particleSchema;
            const range = this.resources.poolRangeOf(drawn.poolKey, drawn.entity);
            inputs.push({
                entity: drawn.entity,
                count: drawn.body.count,
                pool,
                first: range?.first ?? 0,
                strideVec4: schema.stride / 16,
                posOffsetVec4: schema.offsetOf('pos') / 16,
                materialSlot:
                    this.resources.poolSlotOf(PointSpriteMaterial.schema.name, drawn.entity) ?? 0,
                cameraSlot,
                enabled,
            });
        }
        this.culling.sync(inputs);
        for (const input of inputs) {
            const drawn = this.bodies.get(input.entity)!;
            const list = this.culling.list(input.entity);
            if (list === undefined) continue;
            const key = `${this.idOf(input.pool)}:${this.idOf(list)}`;
            if (this.boundSources.get(input.entity) === key) continue;
            const sources = new Map<BindingKey, BindingSource>();
            for (const id of [drawn.pipeline, drawn.motion]) {
                if (id === undefined) continue;
                sources.set({ pipeline: id, resource: particlePoolResource }, input.pool);
                sources.set({ pipeline: id, resource: particleListResource }, list);
            }
            ctx.bind(sources);
            this.boundSources.set(input.entity, key);
            const pending = this.pending.get(input.entity);
            if (pending !== undefined) {
                for (const d of pending) ctx.prepare(d);
                this.pending.delete(input.entity);
            }
        }
    }

    private idOf(o: object): number {
        let id = this.ids.get(o);
        if (id === undefined) {
            id = this.nextId++;
            this.ids.set(o, id);
        }
        return id;
    }

    /** Uma região por corpo: início da faixa, layout do registro e slot do material — escritas quando mudam. */
    private writeDraws(ctx: Ctx): void {
        if (!this.drawsDirty) return;
        this.drawsDirty = false;
        this.order = [...this.bodies.values()];
        if (this.order.length === 0) return;
        if (this.draws.reserve(this.order.length))
            ctx.bind(new Map([[particleDrawResource, this.draws.source()]]));
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
                velOffsetVec4: schema.fields.has('vel') ? schema.offsetOf('vel') / 16 : NONE.value,
            });
        });
        this.draws.flush(this.order.length);
    }

    /**
     * Slot da câmera ativa e tempo simulado no quadro (os passos da física dados nele: o movimento dos sprites), escritos
     * quando mudam (a luz dos sprites vem do ponto `scene_lighting`).
     */
    private writeFrameParams(ctx: Ctx): number {
        const slots = ctx.bound.slots;
        const cameraId = this.world.entityIdOfResource(slots.camera.resource);
        const cameraSlot = cameraId === undefined ? 0 : (slots.cameras.slotOf(cameraId) ?? 0);
        const time = slots.time?.resource as Time | undefined;
        const dt = time === undefined ? 0 : time.steps * time.stepDt;
        const key = `${cameraSlot}:${dt}`;
        if (key === this.writtenFrame) return cameraSlot;
        this.resources.writeNow(
            this.work.work,
            FRAME_PARAMS,
            ParticleFrameParamsSchema.pack({ cameraSlot, dt }),
        );
        this.writtenFrame = key;
        return cameraSlot;
    }
}
