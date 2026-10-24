import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingKey, BindingSource } from '../../../scene/flows/FlowBinding';
import { surfaceResources } from '../../geometry/shaders';
import { NONE as ENGINE_NONE } from '../../../scene/shaders/engineConstants';
import type {
    EngineCore,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../scene/contracts/gpu';
import { ExtensionPipelines, type PipelineVariant } from '../../../scene/flows/ExtensionPipelines';
import { Flow } from '../../../scene/flows/Flow';
import type {
    BoundFlow,
    PreparedCompute,
    TransitionContext,
} from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { PoolDirectory } from '../../../scene/contracts/PoolDirectory';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type EntitiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../../scene/flows/slots';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { Time } from '../../../scene/time/Time';
import type { EntityId } from '../../../scene/world/EntityId';
import { SpaceFunction } from '../../extension/SpaceFunction';
import { SurfaceFunction } from '../../extension/SurfaceFunction';
import { TransformFunction } from '../../extension/TransformFunction';
import { ParametricSurface, SURFACE_PRESET_INDEX } from '../../geometry/ParametricSurface';
import { SurfaceParamsSchema } from '../../geometry/SurfaceSchemas';
import { surfacePoint, surfaceTangents, surfaceTangentsAnalytic } from '../../geometry/shaders';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';
import { Parent } from '../../scene/Parent';
import { Transform } from '../../scene/Transform';
import { SurfaceCollider } from '../colliders/SurfaceCollider';
import { trsNormal, trsWorld } from '../../math/reference/xform';
import {
    SurfaceBakeParamsSchema,
    surfaceColliderBuild,
    surfaceColliderPoints,
    surfaceBakeResources as B,
} from '../shaders/surfaceCollider';

const WORKGROUP = ENGINE_WORKGROUP_SIZE.value;
const NONE = ENGINE_NONE.value;

/** Slots do estágio dos colliders de superfície. */
export interface SurfaceColliderSlots extends SlotMap {
    /** Superfícies colidíveis. */
    readonly colliders: EntitiesSlot;
    /** Superfícies colidíveis com `SurfaceFunction`. */
    readonly functions: EntitiesSlot;
    /** Pool do campo (cabeçalho e valores de todos os colliders de superfície). */
    readonly fields: PoolSlot<false>;
    /** Funções `space` da cena (com alguma, a superfície anima). */
    readonly spaces: EntitiesSlot;
    /** Pool das matrizes de mundo (transformação por função ou por hierarquia). */
    readonly worlds: PoolSlot<true>;
    /** Relógio da cena (opcional; sem ele, tempo 0 e uma cópia). */
    readonly time: SingletonSlot<true>;
}

const slots: SurfaceColliderSlots = {
    colliders: slot.entities({ all: [ParametricSurface, SurfaceCollider] }),
    functions: slot.entities({ all: [ParametricSurface, SurfaceCollider, SurfaceFunction] }),
    fields: slot.pool(SurfaceCollider.cellSchema.name),
    spaces: slot.entities({ all: [SpaceFunction] }),
    worlds: slot.pool(Transform.worldSchema.name, { optional: true }),
    time: slot.singleton(Time.schema, { optional: true }),
};

type Ctx = TransitionContext<SurfaceColliderSlots>;

/** Passadas da construção, por modo (entradas do `surface_collider_build.wgsl`). */
const BUILD_ENTRIES = {
    height: ['scb_clear', 'scb_header', 'scb_height', 'scb_height_finish'],
    distance: [
        'scb_clear',
        'scb_header',
        'scb_seed',
        'scb_seed_id',
        'scb_jfa',
        'scb_distance_finish',
    ],
} as const;

/** Geometria de um colisor (muda ⇒ rascunho e pipelines refeitos). */
interface Shape {
    readonly key: string;
    readonly mode: 'height' | 'distance';
    readonly nu: number;
    readonly nv: number;
    readonly samples: number;
    readonly tris: number;
    readonly cells: number;
    readonly copies: number;
    /** Passos do jump flooding (do maior para 1, e mais um de 1). */
    readonly jfa: readonly number[];
}

/** Estado de um colisor: forma, rascunho, parâmetros e o que construir no quadro (a amostragem fica em `pointPipelines`). */
interface ColliderState {
    readonly id: EntityId;
    shape: Shape;
    readonly surfaceParams: UniformBufferSpec;
    readonly bake: PerStepUniforms;
    points: StorageBufferSpec;
    bounds: StorageBufferSpec;
    cells: StorageBufferSpec;
    ids: StorageBufferSpec;
    /** Construir no próximo quadro (entrou, mudou, campo realocado). */
    stale: boolean;
    /** Cópias a construir neste quadro (0: nada). */
    copies: number;
    /** Matriz de mundo da última construção (CPU), para reconstruir quando o `Transform` muda. */
    world: Float32Array | undefined;
}

/**
 * SurfaceColliderFlow — constrói na GPU o campo dos `SurfaceCollider` (spec 010, R2): para cada superfície colidível,
 * a superfície é avaliada pelo mesmo `surface_at` do desenho (função da entidade ou pronta, espaço da cena) numa grade
 * de amostragem, e o campo — alturas (rasterização dos triângulos com `atomicMax`) ou distâncias com sinal (semeadura
 * exata, jump flooding, sinal pela normal) — é escrito no pool do colisor, com a caixa local, a inversa do mundo e a
 * matriz normal no cabeçalho.
 *
 * Roda na física antes dos solvers. Superfície que anima (`animated`, espaço na cena ou `TransformFunction`): uma cópia
 * por passo fixo do quadro, cada uma no tempo do fim do seu passo — os solvers leem a do passo corrente pelo cursor
 * (mesma trajetória a 30/60/144 Hz). Parada: uma cópia, construída só quando a superfície, o colisor ou o `Transform`
 * mudam. A função nova vale quando o pipeline compila; rejeitada, o último campo continua.
 */
export class SurfaceColliderFlow extends Flow<SurfaceColliderSlots, 'idle'> {
    readonly type = 'SurfaceColliderFlow';
    readonly slots = slots;
    /** Os registros de todas as formas das funções `surface` (spec 031, R8). */
    override readonly listens = [surfacePoint];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    /** Pools da C2: o slot do registro de cada função, no pool da forma dela. */
    private readonly pools: PoolDirectory;
    private readonly states = new Map<EntityId, ColliderState>();
    private readonly dummyWorlds: StorageBufferSpec;
    private readonly warnedSteps = new Set<EntityId>();
    /** Pipeline da amostragem de cada colisor (pela função da entidade, ou a pronta), ativo ao compilar. */
    private readonly pointPipelines = new ExtensionPipelines<EntityId>();
    private dirty = true;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.pools = ctx.resources;
        this.dummyWorlds = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'scb_worlds_dummy',
            byteSize: Transform.worldSchema.stride,
        });
        const changed = {
            to: 'idle' as const,
            run: (): void => {
                this.dirty = true;
            },
        };
        const restale = {
            to: 'idle' as const,
            run: (): void => {
                this.dirty = true;
                for (const st of this.states.values()) st.stale = true;
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: restale,
                slotLost: changed,
                slotChanged: restale,
                entitiesChanged: changed,
                // O campo é só da GPU: realocado, é reconstruído.
                poolReallocated: restale,
                // Valores ou código de uma função.
                poolWritten: restale,
                resourceReady: {
                    to: 'idle',
                    run: (e) => {
                        if (e.type !== 'resourceReady') return;
                        if (
                            e.resource instanceof ParametricSurface
                            || e.resource instanceof SurfaceCollider
                        )
                            restale.run();
                    },
                },
                bindGroupReplaced: 'ignore',
                pipelinesCompiled: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type !== 'pipelinesCompiled' || e.pipeline === undefined) return;
                        for (const id of this.pointPipelines.compiled(e.pipeline, c)) {
                            const st = this.states.get(id);
                            if (st !== undefined) st.stale = true;
                        }
                    },
                },
                pipelineRejected: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type === 'pipelineRejected')
                            this.pointPipelines.rejected(e.pipeline, c);
                    },
                },
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.sync(c);
                        this.plan(c);
                    },
                },
            },
        };
    }

    /** Grava as passadas dos colliders a construir neste quadro. */
    dispatch(frame: Frame, bound: BoundFlow<SurfaceColliderSlots>): void {
        for (const st of this.states.values()) {
            const active = this.pointPipelines.active(st.id);
            if (st.copies === 0 || active === undefined) continue;
            const points = bound.pipelines.get(active.id);
            if (points?.role !== 'compute' || !points.ready) continue;
            const build = (entry: string): PreparedCompute | undefined => {
                const p = bound.pipelines.get(buildId(st.id, entry));
                return p?.role === 'compute' && p.ready ? p : undefined;
            };
            const entries = BUILD_ENTRIES[st.shape.mode].map(build);
            if (entries.some((p) => p === undefined)) continue;
            const s = st.shape;
            const run = (p: PreparedCompute, region: number, count: number): void => {
                frame.compute('SurfaceColliderFlow', (pass) => {
                    pass.bind.setPipeline(p.spec);
                    p.bindTo(pass.bind, { draw: [st.bake.offset(region)] });
                    // As cópias ficam em sequência no índice linear.
                    pass.dispatch.invocations(count * st.copies, WORKGROUP);
                });
            };
            const [clear, header, ...rest] = entries as PreparedCompute[];
            run(clear!, 0, Math.max(s.cells, 8));
            run(points, 0, s.samples);
            run(header!, 0, 1);
            if (s.mode === 'height') {
                const [height, finish] = rest;
                run(height!, 0, s.tris);
                run(finish!, 0, s.cells);
            } else {
                const [seed, seedId, jfa, finish] = rest;
                run(seed!, 0, s.tris);
                run(seedId!, 0, s.tris);
                s.jfa.forEach((_, p) => {
                    run(jfa!, 1 + p, s.cells);
                });
                run(finish!, 1 + s.jfa.length, s.cells);
            }
            st.stale = false;
        }
    }

    /** Libera rascunhos, parâmetros e substitutos. */
    override dispose(): void {
        for (const st of this.states.values()) this.destroyState(st);
        this.states.clear();
        this.core.destroy(this.dummyWorlds);
    }

    /** Colliders presentes: estado, rascunho, bindings e pipelines. */
    private sync(ctx: Ctx): void {
        if (!this.dirty) return;
        this.dirty = false;
        const { colliders, functions, fields, worlds } = ctx.bound.slots;
        const present = new Set<EntityId>();
        for (const entry of colliders.entries) {
            const id = entry.entityId;
            present.add(id);
            const shape = shapeOf(entry.get(SurfaceCollider));
            let st = this.states.get(id);
            if (st !== undefined && st.shape.key !== shape.key) {
                this.releaseBuild(ctx, st);
                this.pointPipelines.forget(ctx, id);
                this.destroyState(st);
                this.states.delete(id);
                st = undefined;
            }
            if (st === undefined) {
                st = this.createState(id, shape);
                this.states.set(id, st);
            }
            st.stale = true;
            const fn = functions.entry(id)?.get(SurfaceFunction);
            const key = fn?.module.name ?? 'preset';
            const next: PipelineVariant = { key, id: `scb_points:${id}:${key}` };
            const shared: [WgslResource, BindingSource][] = [
                [B.bake, st.bake.source()],
                [B.points, st.points],
                [B.bounds, st.bounds],
            ];
            for (const { id: pid } of this.pointPipelines.bindable(id, next)) {
                ctx.bind(prefixed(pid, [...shared, [surfaceResources.params, st.surfaceParams]]));
            }
            for (const entryName of BUILD_ENTRIES[shape.mode]) {
                const pid = buildId(id, entryName);
                ctx.bind(
                    prefixed(pid, [
                        ...shared,
                        [B.cells, st.cells],
                        [B.ids, st.ids],
                        [B.field, fields.buffer],
                        [B.worlds, worlds?.buffer ?? this.dummyWorlds],
                    ]),
                );
                ctx.prepare({
                    id: pid,
                    role: 'compute',
                    shader: surfaceColliderBuild,
                    entryPoints: [`${entryName}_main`],
                });
            }
            this.pointPipelines.select(id, next, ({ id: pointsId }) => {
                const impls = new Map([[surfacePoint, fn?.module ?? surfacePoint.ready]]);
                const shader =
                    fn === undefined
                        ? surfaceColliderPoints
                        : bindPoints(
                              surfaceColliderPoints,
                              fn.analytic
                                  ? new Map([...impls, [surfaceTangents, surfaceTangentsAnalytic]])
                                  : impls,
                          );
                return ctx.prepare({
                    id: pointsId,
                    role: 'compute',
                    shader,
                    entryPoints: ['scb_points_main'],
                    ...(fn === undefined ? {} : { verify: true, extensions: [fn] }),
                }).ready;
            });
        }
        for (const [id, st] of [...this.states]) {
            if (present.has(id)) continue;
            this.releaseBuild(ctx, st);
            this.destroyState(st);
            this.states.delete(id);
        }
        this.pointPipelines.retain(ctx, present);
    }

    /** Decide quem constrói neste quadro, quantas cópias e em que tempos, e escreve os parâmetros. */
    private plan(ctx: Ctx): void {
        const { colliders, fields, spaces, worlds, functions } = ctx.bound.slots;
        const time = ctx.bound.slots.time?.resource as Time | undefined;
        const spaced = spaces.entries.length > 0;
        for (const st of this.states.values()) {
            st.copies = 0;
            const entry = colliders.entry(st.id);
            if (entry === undefined) continue;
            const surface = entry.get(ParametricSurface);
            const collider = entry.get(SurfaceCollider);
            const byFunction = entry.resources.some(
                (r) => r instanceof TransformFunction || r instanceof Parent,
            );
            const transform = entry.resources.find((r): r is Transform => r instanceof Transform);
            const world = byFunction ? undefined : trsOf(transform);
            if (world !== undefined && !sameMatrix(world.m, st.world)) st.stale = true;
            const animated = surface.data.animated || spaced || byFunction;
            const steps = time?.steps ?? 0;
            const times: number[] = [];
            if (animated && steps > 0) {
                const copies = Math.min(steps, st.shape.copies);
                if (steps > st.shape.copies && !this.warnedSteps.has(st.id)) {
                    this.warnedSteps.add(st.id);
                    console.warn(
                        `SurfaceColliderFlow: ${steps} passos no quadro e ${st.shape.copies} cópias no colisor — os `
                            + 'passos excedentes usam a última cópia (aumente `steps` do SurfaceCollider).',
                    );
                }
                for (let k = 0; k < copies; k++) times.push(time!.stepTime(k) + time!.stepDt);
            } else if (st.stale) {
                times.push(time?.simulated ?? 0);
            }
            if (times.length === 0) continue;
            st.copies = times.length;
            st.world = world?.m;
            const d = surface.data;
            const [u0, u1, v0, v1] = d.domain;
            const fn = functions.entry(st.id)?.get(SurfaceFunction);
            const record =
                fn === undefined ? undefined : this.pools.poolSlotOf(fn.record.name, st.id);
            this.core.write(
                st.surfaceParams,
                SurfaceParamsSchema.pack({
                    nu: st.shape.nu,
                    nv: st.shape.nv,
                    record_slot: record ?? 0,
                    preset: SURFACE_PRESET_INDEX[d.preset],
                    u0,
                    u1,
                    v0,
                    v1,
                    time: times[times.length - 1]!,
                    h_u: Math.abs(u1 - u0) * 1e-3,
                    h_v: Math.abs(v1 - v0) * 1e-3,
                    diff_first: 0,
                    preset_a: [
                        d.params[0] ?? 0,
                        d.params[1] ?? 0,
                        d.params[2] ?? 0,
                        d.params[3] ?? 0,
                    ],
                }),
            );
            const t = new Float32Array(16);
            t.set(times);
            const s = st.shape;
            const base = {
                nu: s.nu,
                nv: s.nv,
                samples: s.samples,
                tris: s.tris,
                copies: st.copies,
                mode: collider.data.mode,
                nx: collider.data.nx,
                ny: collider.data.ny,
                nz: collider.data.nz,
                cells: s.cells,
                band: collider.data.band,
                field_first: fields.slotOf(st.id) ?? 0,
                copy_stride: collider.data.copy_stride,
                transform_slot: worlds?.slotOf(st.id) ?? NONE,
                use_world_pool: world === undefined ? 1 : 0,
                pass_step: 0,
                parity: 0,
                margin: collider.data.margin,
                t0: [...t.subarray(0, 4)],
                t1: [...t.subarray(4, 8)],
                t2: [...t.subarray(8, 12)],
                t3: [...t.subarray(12, 16)],
                world: [...(world?.m ?? IDENTITY)],
                normal0: world?.n[0] ?? [1, 0, 0, 0],
                normal1: world?.n[1] ?? [0, 1, 0, 0],
                normal2: world?.n[2] ?? [0, 0, 1, 0],
            };
            const regions = 2 + s.jfa.length;
            if (st.bake.reserve(regions)) this.dirty = true;
            st.bake.write(0, base);
            s.jfa.forEach((step, p) => {
                st.bake.write(1 + p, { ...base, pass_step: step, parity: p % 2 });
            });
            st.bake.write(1 + s.jfa.length, { ...base, parity: s.jfa.length % 2 });
            st.bake.flush(regions);
        }
        // Buffer de parâmetros recriado: religa no próximo quadro (os bind groups do quadro já foram feitos).
        if (this.dirty) this.sync(ctx);
    }

    private createState(id: EntityId, shape: Shape): ColliderState {
        const storage = (name: string, bytes: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `scb_${name}:${id}:${shape.key}`,
                byteSize: Math.max(16, bytes),
            });
        const bake = new PerStepUniforms(this.core, {
            discriminator: `scb_bake:${id}:${shape.key}`,
            schema: SurfaceBakeParamsSchema,
        });
        bake.reserve(2 + shape.jfa.length);
        return {
            id,
            shape,
            surfaceParams: this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: `scb_surface_params:${id}:${shape.key}`,
                byteSize: SurfaceParamsSchema.stride,
            }),
            bake,
            points: storage('points', shape.copies * shape.samples * 32),
            bounds: storage('bounds', shape.copies * 32),
            cells: storage('cells', shape.copies * shape.cells * 4),
            ids: storage(
                'ids',
                shape.mode === 'distance' ? shape.copies * 2 * shape.cells * 4 : 16,
            ),
            stale: true,
            copies: 0,
            world: undefined,
        };
    }

    /** Libera as passadas da construção do colisor (a amostragem é de `pointPipelines`). */
    private releaseBuild(ctx: Ctx, st: ColliderState): void {
        for (const entry of BUILD_ENTRIES[st.shape.mode]) ctx.release(buildId(st.id, entry));
    }

    private destroyState(st: ColliderState): void {
        this.core.destroy(st.surfaceParams);
        st.bake.dispose();
        for (const b of [st.points, st.bounds, st.cells, st.ids]) this.core.destroy(b);
    }
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function buildId(id: EntityId, entry: string): string {
    return `${entry}:${id}`;
}

/** As fontes ligadas só no pipeline `pid`. */
function prefixed(
    pid: string,
    sources: readonly (readonly [WgslResource, BindingSource])[],
): Map<BindingKey, BindingSource> {
    return new Map(sources.map(([resource, source]) => [{ pipeline: pid, resource }, source]));
}

/** Forma do colisor: amostragem, contagens, cópias e passos do jump flooding. */
function shapeOf(c: SurfaceCollider): Shape {
    const [nu, nv] = c.sampling;
    const mode = c.mode;
    const cells = c.cellCount;
    const jfa: number[] = [];
    if (mode === 'distance') {
        const n = Math.max(c.data.nx, c.data.ny, c.data.nz);
        for (let s = 2 ** Math.ceil(Math.log2(n)) / 2; s >= 1; s /= 2) jfa.push(s);
        jfa.push(1);
    }
    return {
        key: `${mode}:${c.data.nx}x${c.data.ny}x${c.data.nz}:${nu}x${nv}:${c.data.copies}`,
        mode,
        nu,
        nv,
        samples: nu * nv,
        tris: 2 * (nu - 1) * (nv - 1),
        cells,
        copies: c.data.copies,
        jfa,
    };
}

/** Matriz de mundo e de normais do `Transform` pela referência f64 do TRS (a mesma regra da GPU, spec 037). */
function trsOf(
    t: Transform | undefined,
): { m: Float32Array; n: [number[], number[], number[]] } | undefined {
    if (t === undefined) return undefined;
    const d = t.data;
    const [px = 0, py = 0, pz = 0] = d.position;
    const [qx = 0, qy = 0, qz = 0, qw = 1] = d.rotation;
    const [sx = 1, sy = 1, sz = 1] = d.scale;
    const m = new Float32Array(trsWorld([px, py, pz], [qx, qy, qz, qw], [sx, sy, sz]));
    const nm = trsNormal([qx, qy, qz, qw], [sx, sy, sz]);
    const n = [0, 1, 2].map((c) => [nm[3 * c]!, nm[3 * c + 1]!, nm[3 * c + 2]!, 0]) as [
        number[],
        number[],
        number[],
    ];
    return { m, n };
}

function sameMatrix(a: Float32Array, b: Float32Array | undefined): boolean {
    if (b === undefined) return false;
    for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false;
    return true;
}
