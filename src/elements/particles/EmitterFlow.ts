import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { EngineCore, Frame, StorageBufferSpec } from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import { Flow } from '../../scene/flows/Flow';
import type {
    BindingKey,
    BindingSource,
    BoundFlow,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import {
    slot,
    type EntitiesSlot,
    type PoolSlot,
    type PoolsSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../scene/flows/slots';
import { bindPoints } from '../../scene/shaders/bindPoints';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { Time } from '../../scene/time/Time';
import type { EntityId } from '../../scene/world/EntityId';
import { PerStepUniforms } from '../gpu/compute/PerStepUniforms';
import { EmitFunction } from '../extension/EmitFunction';
import { PointCloudGeometry } from '../geometry/PointCloudGeometry';
import { GravityField } from '../physics/forcefields/GravityField';
import { LCPSchema } from '../physics/bodies/schemas/LCPSchema';
import { Collider } from '../physics/colliders/Collider';
import { COLLIDER_POOL_KEYS, ColliderSet } from '../physics/colliders/ColliderSet';
import { ComputeParticleEmitter } from './ComputeParticleEmitter';
import { EmitFnRecordSchema, EmitterParamsSchema } from './EmitterSchemas';
import { emitCollide, emitPoint, emitResources as R, emitSpawn, emitUpdate } from './shaders';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;

/** Slots do estágio dos emissores. */
export interface EmitterSlots extends SlotMap {
    /** Emissores com a nuvem de pontos onde as partículas são desenhadas (o estágio escreve os vértices). */
    readonly emitters: EntitiesSlot;
    /** Emissores com `EmitFunction`. */
    readonly functions: EntitiesSlot;
    /** Pool dos registros de parâmetros das `EmitFunction` (opcional). */
    readonly fnRecords: PoolSlot<true>;
    /** Gravidade uniforme (opcional; padrão −9,81 em y). */
    readonly gravity: SingletonSlot<true>;
    /** Relógio da cena. */
    readonly time: SingletonSlot<false>;
    /** Pools dos colliders e dos corpos donos (spec 010: as partículas colidem com os colliders). */
    readonly colliderPools: PoolsSlot;
    /** Entidades com collider. */
    readonly colliders: EntitiesSlot;
}

const slots: EmitterSlots = {
    emitters: slot.entities({
        all: [ComputeParticleEmitter, PointCloudGeometry],
        owns: [[PointCloudGeometry, 'vertices']],
    }),
    functions: slot.entities({ all: [ComputeParticleEmitter, EmitFunction] }),
    fnRecords: slot.pool(EmitFnRecordSchema.name, { optional: true }),
    gravity: slot.singleton(GravityField.schema, { optional: true }),
    time: slot.singleton(Time.schema),
    colliderPools: slot.pools([...COLLIDER_POOL_KEYS, LCPSchema.name]),
    colliders: slot.entities({ all: [Collider] }),
};

type Ctx = TransitionContext<EmitterSlots>;

/** Estado de um emissor: parâmetros por passo, anel, acumulador e pipelines. */
interface EmitterState {
    readonly id: EntityId;
    readonly params: PerStepUniforms;
    /** Partículas a criar em cada passo do quadro (do acumulador). */
    spawn: number[];
    accumulator: number;
    head: number;
    emitted: number;
    /** Pipeline de criação em uso e o que aguarda compilar (função nova ou código trocado). */
    spawnActive: { readonly id: string; readonly module: WgslModule | undefined } | undefined;
    spawnPending: { readonly id: string; readonly module: WgslModule | undefined } | undefined;
    readonly updateId: string;
    /** Pipeline da colisão com os colliders (spec 010). */
    readonly collideId: string;
}

/**
 * EmitterFlow — partículas de `ComputeParticleEmitter` inteiras na GPU (spec 009). A cada passo da física: a CPU
 * conta as partículas a criar (`rate × stepDt` acumulado, sem leitura de volta — a mesma sequência em qualquer taxa de
 * quadros); `emit_spawn` cria cada uma no anel pela função `emit_fn` (a forma do emissor, ou a `EmitFunction` da
 * entidade); `emit_update` envelhece, integra gravidade e campos (ponto `field`) e escreve os vértices da
 * `PointCloudGeometry` da entidade (a morta vai para longe). A função nova (ou `setCode`) vale quando o pipeline de
 * criação compila; rejeitada, segue a anterior.
 */
export class EmitterFlow extends Flow<EmitterSlots, 'idle'> {
    readonly type = 'EmitterFlow';
    readonly slots = slots;
    override readonly listens = [EmitFnRecordSchema];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private readonly states = new Map<EntityId, EmitterState>();
    /** Substituto do pool de registros das funções (emissores sem `EmitFunction`). */
    private readonly dummyRecords: StorageBufferSpec;
    private dirty = true;
    private readonly colliderSet: ColliderSet;
    /** Colliders na cena no quadro: grava a colisão depois de cada passo (spec 010). */
    private collide = false;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.dummyRecords = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'emit_fn_records_dummy',
            byteSize: EmitFnRecordSchema.stride,
        });
        this.colliderSet = new ColliderSet(ctx.core, ctx.world, ctx.resources, {
            discriminator: 'emit_colliders',
        });
        const changed = {
            to: 'idle' as const,
            run: (e: { type: string; poolKey?: string }): void => {
                this.dirty = true;
                this.colliderSet.markDirty();
                if (e.type === 'poolReallocated' && e.poolKey !== undefined)
                    this.colliderSet.onPoolReallocated(e.poolKey);
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: changed,
                slotLost: changed,
                slotChanged: changed,
                entitiesChanged: changed,
                poolWritten: changed,
                poolReallocated: changed,
                bindGroupReplaced: 'ignore',
                pipelinesCompiled: {
                    to: 'idle',
                    run: (e) => {
                        if (e.type !== 'pipelinesCompiled' || e.pipeline === undefined) return;
                        for (const st of this.states.values()) {
                            if (st.spawnPending?.id !== e.pipeline) continue;
                            st.spawnActive = st.spawnPending;
                            st.spawnPending = undefined;
                        }
                    },
                },
                pipelineRejected: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type !== 'pipelineRejected') return;
                        for (const st of this.states.values())
                            if (st.spawnPending?.id === e.pipeline) st.spawnPending = undefined;
                        c.release(e.pipeline);
                    },
                },
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        if (this.colliderSet.refresh()) c.bind(this.colliderSet.sources());
                        this.collide = this.colliderSet.totalCount > 0;
                        this.sync(c);
                        this.writeSteps(c);
                    },
                },
            },
        };
    }

    /** Por passo do quadro e por emissor: criação (se há partículas a criar) e atualização. */
    dispatch(frame: Frame, bound: BoundFlow<EmitterSlots>): void {
        for (const st of this.states.values()) {
            const update = bound.pipelines.get(st.updateId);
            if (update?.role !== 'compute' || !update.ready) continue;
            const spawn =
                st.spawnActive === undefined ? undefined : bound.pipelines.get(st.spawnActive.id);
            const capacity = this.capacityOf(bound, st.id);
            st.spawn.forEach((n, k) => {
                const offsets = { draw: [st.params.offset(k)] };
                if (n > 0 && spawn?.role === 'compute' && spawn.ready) {
                    frame.compute('EmitterFlow.spawn', (pass) => {
                        pass.bind.setPipeline(spawn.spec);
                        spawn.bindTo(pass.bind, offsets);
                        pass.dispatch.invocations(n, WORKGROUP_SIZE);
                    });
                }
                frame.compute('EmitterFlow.update', (pass) => {
                    pass.bind.setPipeline(update.spec);
                    update.bindTo(pass.bind, offsets);
                    pass.dispatch.invocations(capacity, WORKGROUP_SIZE);
                });
                const collide = this.collide ? bound.pipelines.get(st.collideId) : undefined;
                if (collide?.role === 'compute' && collide.ready)
                    frame.compute('EmitterFlow.collide', (pass) => {
                        pass.bind.setPipeline(collide.spec);
                        collide.bindTo(pass.bind, offsets);
                        pass.dispatch.invocations(capacity, WORKGROUP_SIZE);
                    });
            });
        }
    }

    /** Libera os parâmetros dos emissores e o substituto. */
    override dispose(): void {
        for (const st of this.states.values()) st.params.dispose();
        this.states.clear();
        this.core.destroy(this.dummyRecords);
        this.colliderSet.destroy();
    }

    /**
     * Emissores presentes: estado e pipelines dos que entraram (atualização; criação pela forma ou pela função),
     * liberação dos que saíram, função nova ou trocada preparada para valer ao compilar.
     */
    private sync(ctx: Ctx): void {
        if (!this.dirty) return;
        this.dirty = false;
        const { emitters, functions, fnRecords } = ctx.bound.slots;
        const present = new Set<EntityId>();
        for (const entry of emitters.entries) {
            const id = entry.entityId;
            present.add(id);
            const emitter = entry.get(ComputeParticleEmitter);
            const particles = this.resources.bufferOf(emitter, 'particles');
            const vertices = this.resources.bufferOf(entry.get(PointCloudGeometry), 'vertices');
            if (particles?.subkind !== 'storage' || vertices?.subkind !== 'vertex') continue;
            let st = this.states.get(id);
            if (st === undefined) {
                st = {
                    id,
                    params: new PerStepUniforms(this.core, {
                        discriminator: `emitter_params:${id}`,
                        schema: EmitterParamsSchema,
                    }),
                    spawn: [],
                    accumulator: 0,
                    head: 0,
                    emitted: 0,
                    spawnActive: undefined,
                    spawnPending: undefined,
                    updateId: `emit_update:${id}`,
                    collideId: `emit_collide:${id}`,
                };
                st.params.reserve(1);
                this.states.set(id, st);
            }
            const params = st.params.source();
            const records = fnRecords?.buffer ?? this.dummyRecords;
            // Bindings privados antes da preparação (a C2 resolve as fontes ao preparar).
            ctx.bind(
                at(st.updateId, [
                    [R.params, params],
                    [R.particles, particles],
                    [R.vertices, vertices],
                ]),
            );
            ctx.prepare({
                id: st.updateId,
                role: 'compute',
                shader: emitUpdate,
                entryPoints: ['emit_update_main'],
            });
            ctx.bind(
                at(st.collideId, [
                    [R.params, params],
                    [R.particles, particles],
                    [R.vertices, vertices],
                ]),
            );
            ctx.prepare({
                id: st.collideId,
                role: 'compute',
                shader: emitCollide,
                entryPoints: ['emit_collide_main'],
            });
            const fn = functions.entry(id)?.get(EmitFunction);
            const module = fn?.module;
            const known = st.spawnPending ?? st.spawnActive;
            const spawnId =
                known === undefined || known.module !== module
                    ? `emit_spawn:${id}:${module?.name ?? 'shape'}`
                    : undefined;
            for (const pid of [st.spawnActive?.id, st.spawnPending?.id, spawnId]) {
                if (pid === undefined) continue;
                ctx.bind(
                    at(pid, [
                        [R.params, params],
                        [R.particles, particles],
                        [R.fnRecords, records],
                    ]),
                );
            }
            if (spawnId !== undefined) {
                const prepared = ctx.prepare({
                    id: spawnId,
                    role: 'compute',
                    shader:
                        fn === undefined
                            ? emitSpawn
                            : bindPoints(emitSpawn, new Map([[emitPoint, fn.module]])),
                    entryPoints: ['emit_spawn_main'],
                    ...(fn === undefined ? {} : { verify: true, extensions: [fn] }),
                });
                const next = { id: spawnId, module };
                if (prepared.ready) {
                    if (st.spawnActive !== undefined && st.spawnActive.id !== spawnId)
                        ctx.release(st.spawnActive.id);
                    st.spawnActive = next;
                    st.spawnPending = undefined;
                } else st.spawnPending = next;
            }
        }
        for (const [id, st] of [...this.states]) {
            if (present.has(id)) continue;
            for (const pid of [st.updateId, st.collideId, st.spawnActive?.id, st.spawnPending?.id])
                if (pid !== undefined) ctx.release(pid);
            st.params.dispose();
            this.states.delete(id);
        }
    }

    /** Partículas a criar em cada passo (acumulador por passo) e os parâmetros de cada passo, por emissor. */
    private writeSteps(ctx: Ctx): void {
        const { emitters, functions, fnRecords, gravity, time } = ctx.bound.slots;
        const clock = time.resource as Time;
        const steps = clock.steps;
        const stepDt = clock.stepDt;
        const g = (gravity?.resource as GravityField | undefined)?.uniformAcceleration() ?? [
            0, -9.81, 0, 0,
        ];
        for (const st of this.states.values()) {
            const entry = emitters.entry(st.id);
            if (entry === undefined) continue;
            const emitter = entry.get(ComputeParticleEmitter);
            const d = emitter.data;
            const capacity = d.maxParticles;
            const shape = d.shape?.gpu() ?? { kind: 0, a: [0, 0, 0], b: [0, 0, 0], s: [0, 0] };
            const record = fnRecords?.slotOf(st.id);
            const hasFn = functions.entry(st.id) !== undefined && record !== undefined;
            if (st.params.reserve(Math.max(1, steps))) {
                const params = st.params.source();
                for (const pid of [
                    st.spawnActive?.id,
                    st.spawnPending?.id,
                    st.updateId,
                    st.collideId,
                ])
                    if (pid !== undefined) ctx.bind(at(pid, [[R.params, params]]));
            }
            st.spawn = [];
            for (let k = 0; k < steps; k++) {
                st.accumulator += d.rate * stepDt;
                const due = Math.floor(st.accumulator);
                st.accumulator -= due;
                const n = Math.min(due, capacity);
                st.params.write(k, {
                    head: st.head,
                    spawn_count: n,
                    emitted: st.emitted >>> 0,
                    capacity,
                    // Fim do passo k: o mesmo tempo em qualquer taxa.
                    time: clock.stepTime(k) + stepDt,
                    dt: stepDt,
                    seed: d.seed >>> 0,
                    record_slot: hasFn ? record : 0,
                    gravity: [g[0] ?? 0, g[1] ?? -9.81, g[2] ?? 0],
                    lifetime: d.lifetime,
                    shape_kind: shape.kind,
                    shape_a: [...shape.a, 0],
                    shape_b: [...shape.b, 0],
                    shape_s: [...shape.s, 0, 0],
                });
                st.spawn.push(n);
                st.head = (st.head + n) % capacity;
                st.emitted += n;
            }
            if (steps > 0) st.params.flush(steps);
        }
    }

    private capacityOf(bound: BoundFlow<EmitterSlots>, id: EntityId): number {
        return bound.slots.emitters.entry(id)?.get(ComputeParticleEmitter).data.maxParticles ?? 0;
    }
}

/** Fontes privadas de um pipeline (chave `{ pipeline, resource }`). */
function at(
    pid: string,
    sources: readonly (readonly [WgslResource, BindingSource])[],
): Map<BindingKey, BindingSource> {
    return new Map(sources.map(([resource, source]) => [{ pipeline: pid, resource }, source]));
}
