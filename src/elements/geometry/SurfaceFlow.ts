import type {
    EngineCore,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import { Flow } from '../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import {
    slot,
    type EntitiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../scene/flows/slots';
import { bindPoints, type BindablePoint } from '../../scene/shaders/bindPoints';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import { Time } from '../../scene/time/Time';
import type { EntityId } from '../../scene/world/EntityId';
import { SurfaceFunction } from '../extension/SurfaceFunction';
import { ParametricSurface, SURFACE_PRESET_INDEX } from './ParametricSurface';
import {
    SpaceFnRecordSchema,
    SurfaceDiffSchema,
    SurfaceFnRecordSchema,
    SurfaceParamsSchema,
} from './SurfaceSchemas';
import {
    surfaceEval,
    surfaceEvalDiff,
    surfaceJet,
    surfaceJetAnalytic,
    surfaceJetMapped,
    surfaceJetPreset,
    surfacePoint,
    surfaceTangents,
    surfaceTangentsAnalytic,
} from './shaders';

const WORKGROUP_SIZE = 64;

/** Slots do estágio das superfícies paramétricas. */
export interface SurfaceSlots extends SlotMap {
    /** Superfícies paramétricas (o estágio escreve os vértices). */
    readonly surfaces: EntitiesSlot;
    /** Superfícies com `SurfaceFunction`. */
    readonly functions: EntitiesSlot;
    /** Pool dos registros das `SurfaceFunction` (opcional). */
    readonly fnRecords: PoolSlot<true>;
    /** Pool dos registros das `SpaceFunction` (existe com espaço na cena: avaliação a cada quadro). */
    readonly spaceRecords: PoolSlot<true>;
    /** Relógio da cena (opcional; sem ele, tempo 0). */
    readonly time: SingletonSlot<true>;
    /** Pool da geometria diferencial (existe com superfícies `differential`). */
    readonly diffs: PoolSlot<true>;
}

const slots: SurfaceSlots = {
    surfaces: slot.entities({
        all: [ParametricSurface],
        owns: [[ParametricSurface, 'vertices']],
    }),
    functions: slot.entities({ all: [ParametricSurface, SurfaceFunction] }),
    fnRecords: slot.pool(SurfaceFnRecordSchema.name, { optional: true }),
    spaceRecords: slot.pool(SpaceFnRecordSchema.name, { optional: true }),
    time: slot.singleton(Time.schema, { optional: true }),
    diffs: slot.pool(SurfaceDiffSchema.name, { optional: true }),
};

type Ctx = TransitionContext<SurfaceSlots>;

/** Estado de uma superfície: parâmetros, pipeline em uso e o que aguarda compilar, avaliação pendente. */
interface SurfaceState {
    readonly id: EntityId;
    readonly params: UniformBufferSpec;
    active: { readonly id: string; readonly key: string } | undefined;
    pending: { readonly id: string; readonly key: string } | undefined;
    /** Avaliar no próximo quadro. */
    stale: boolean;
    /** Avaliar neste quadro (decidido no `framePrepare`). */
    evaluate: boolean;
}

/**
 * SurfaceFlow — superfícies paramétricas avaliadas na GPU (spec 009): para cada `ParametricSurface`, o kernel
 * `surface_eval` escreve posição, normal e uv da grade a partir da função `surface` da entidade (`SurfaceFunction`, com
 * derivadas analíticas quando ela as define) ou da superfície pronta, com o espaço da cena (`SpaceFunction`, composto
 * pela C2). Avalia quando a superfície entra ou muda, quando a função muda (valores ou código) e a cada quadro com
 * `animated` ou com espaço na cena. A função nova vale quando o pipeline compila; rejeitada, segue a anterior.
 */
export class SurfaceFlow extends Flow<SurfaceSlots, 'idle'> {
    readonly type = 'SurfaceFlow';
    readonly slots = slots;
    override readonly listens = [SurfaceFnRecordSchema, ParametricSurface.vertexStruct];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private readonly states = new Map<EntityId, SurfaceState>();
    private readonly dummyRecords: StorageBufferSpec;
    private dirty = true;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.dummyRecords = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'surface_fn_records_dummy',
            byteSize: SurfaceFnRecordSchema.stride,
        });
        const changed = {
            to: 'idle' as const,
            run: (): void => {
                this.dirty = true;
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: changed,
                slotLost: changed,
                slotChanged: changed,
                entitiesChanged: changed,
                poolReallocated: changed,
                // Valores ou código de uma função: todas as superfícies com função reavaliam.
                poolWritten: changed,
                // Uma superfície mudou de domínio, pronta ou parâmetros.
                resourceReady: {
                    to: 'idle',
                    run: (e) => {
                        if (
                            e.type !== 'resourceReady'
                            || !(e.resource instanceof ParametricSurface)
                        )
                            return;
                        this.dirty = true;
                    },
                },
                bindGroupReplaced: 'ignore',
                pipelinesCompiled: {
                    to: 'idle',
                    run: (e) => {
                        if (e.type !== 'pipelinesCompiled' || e.pipeline === undefined) return;
                        for (const st of this.states.values()) {
                            if (st.pending?.id !== e.pipeline) continue;
                            st.active = st.pending;
                            st.pending = undefined;
                            st.stale = true;
                        }
                    },
                },
                pipelineRejected: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type !== 'pipelineRejected') return;
                        for (const st of this.states.values())
                            if (st.pending?.id === e.pipeline) st.pending = undefined;
                        c.release(e.pipeline);
                    },
                },
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.sync(c);
                        this.writeParams(c);
                    },
                },
            },
        };
    }

    /** Uma avaliação por superfície marcada neste quadro. */
    dispatch(frame: Frame, bound: BoundFlow<SurfaceSlots>): void {
        for (const st of this.states.values()) {
            if (!st.evaluate || st.active === undefined) continue;
            const p = bound.pipelines.get(st.active.id);
            if (p?.role !== 'compute' || !p.ready) continue;
            const surface = bound.slots.surfaces.entry(st.id)?.get(ParametricSurface);
            if (surface === undefined) continue;
            frame.compute('SurfaceFlow', (pass) => {
                pass.bind.setPipeline(p.spec);
                p.groups.forEach((bg, g) => pass.bind.setBindGroup(g, bg));
                pass.dispatch.invocations(surface.vertexCount, WORKGROUP_SIZE);
            });
            st.stale = false;
        }
    }

    /** Libera os parâmetros e o substituto. */
    override dispose(): void {
        for (const st of this.states.values()) this.core.destroy(st.params);
        this.states.clear();
        this.core.destroy(this.dummyRecords);
    }

    /** Superfícies presentes: estado, bindings e pipeline (pela função, ou pela pronta). */
    private sync(ctx: Ctx): void {
        if (!this.dirty) return;
        this.dirty = false;
        const { surfaces, functions, fnRecords, spaceRecords, diffs } = ctx.bound.slots;
        const present = new Set<EntityId>();
        for (const entry of surfaces.entries) {
            const id = entry.entityId;
            present.add(id);
            const vertices = this.resources.bufferOf(entry.get(ParametricSurface), 'vertices');
            if (vertices?.subkind !== 'vertex') continue;
            let st = this.states.get(id);
            if (st === undefined) {
                st = {
                    id,
                    params: this.core.create<UniformBufferSpec>({
                        kind: 'buffer',
                        subkind: 'uniform',
                        discriminator: `surface_params:${id}`,
                        byteSize: SurfaceParamsSchema.stride,
                    }),
                    active: undefined,
                    pending: undefined,
                    stale: true,
                    evaluate: false,
                };
                this.states.set(id, st);
            }
            st.stale = true;
            const fn = functions.entry(id)?.get(SurfaceFunction);
            const module = fn?.module;
            const surface = entry.get(ParametricSurface);
            // Jato da geometria diferencial: do mapa com o espaço, analítico, das prontas ou numérico.
            const jet = !surface.differential
                ? undefined
                : spaceRecords !== undefined
                  ? surfaceJetMapped
                  : fn === undefined
                    ? surfaceJetPreset
                    : fn.analytic2
                      ? surfaceJetAnalytic
                      : undefined;
            const key = `${module?.name ?? 'preset'}|${surface.differential ? (jet?.name ?? 'numeric') : '-'}`;
            const known = st.pending ?? st.active;
            const pipelineId = known?.key !== key ? `surface_eval:${id}:${key}` : undefined;
            const records = fnRecords?.buffer ?? this.dummyRecords;
            for (const pid of [st.active?.id, st.pending?.id, pipelineId]) {
                if (pid === undefined) continue;
                ctx.bind({
                    [`${pid}:surface_params`]: st.params,
                    [`${pid}:surface_vertices`]: vertices,
                    [`${pid}:surface_fn_records`]: records,
                    ...(surface.differential && diffs !== undefined
                        ? { [`${pid}:surface_diff`]: diffs.buffer }
                        : {}),
                });
            }
            if (pipelineId === undefined) continue;
            const base = surface.differential ? surfaceEvalDiff : surfaceEval;
            const impls = new Map<BindablePoint, WgslModule>([
                [surfacePoint, fn?.module ?? surfacePoint.ready],
            ]);
            if (fn?.analytic === true) impls.set(surfaceTangents, surfaceTangentsAnalytic);
            if (jet !== undefined) impls.set(surfaceJet, jet);
            const shader = fn === undefined && jet === undefined ? base : bindPoints(base, impls);
            const prepared = ctx.prepare({
                id: pipelineId,
                role: 'compute',
                shader,
                entryPoints: [
                    surface.differential ? 'surface_eval_diff_main' : 'surface_eval_main',
                ],
                consumes: [],
                ...(fn === undefined ? {} : { verify: true, extensions: [fn] }),
            });
            const next = { id: pipelineId, key };
            if (prepared.ready) {
                if (st.active !== undefined && st.active.id !== pipelineId)
                    ctx.release(st.active.id);
                st.active = next;
                st.pending = undefined;
            } else st.pending = next;
        }
        for (const [id, st] of [...this.states]) {
            if (present.has(id)) continue;
            for (const pid of [st.active?.id, st.pending?.id])
                if (pid !== undefined) ctx.release(pid);
            this.core.destroy(st.params);
            this.states.delete(id);
        }
    }

    /** Decide quem avalia neste quadro e escreve os parâmetros deles. */
    private writeParams(ctx: Ctx): void {
        const { surfaces, functions, fnRecords, spaceRecords, time, diffs } = ctx.bound.slots;
        const t = (time?.resource as Time | undefined)?.simulated ?? 0;
        const spaced = spaceRecords !== undefined;
        for (const st of this.states.values()) {
            const surface = surfaces.entry(st.id)?.get(ParametricSurface);
            if (surface === undefined) continue;
            const d = surface.data;
            st.evaluate = st.stale || d.animated || spaced;
            if (!st.evaluate) continue;
            const record =
                functions.entry(st.id) !== undefined ? fnRecords?.slotOf(st.id) : undefined;
            const [u0, u1, v0, v1] = d.domain;
            this.core.write(
                st.params,
                SurfaceParamsSchema.pack({
                    nu: d.resolution[0],
                    nv: d.resolution[1],
                    record_slot: record ?? 0,
                    preset: SURFACE_PRESET_INDEX[d.preset],
                    u0,
                    u1,
                    v0,
                    v1,
                    time: t,
                    diff_first: surface.differential ? (diffs?.slotOf(st.id) ?? 0) : 0,
                    h_u: Math.abs(u1 - u0) * 1e-3,
                    h_v: Math.abs(v1 - v0) * 1e-3,
                    preset_a: [
                        d.params[0] ?? 0,
                        d.params[1] ?? 0,
                        d.params[2] ?? 0,
                        d.params[3] ?? 0,
                    ],
                }),
            );
        }
    }
}
