import type { WgslResource } from '../../scene/shaders/WgslResource';
import { NONE as ENGINE_NONE } from '../../scene/shaders/engineConstants';
import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import { ExtensionPipelines, type PipelineVariant } from '../../scene/flows/ExtensionPipelines';
import { Flow } from '../../scene/flows/Flow';
import type {
    BindingKey,
    BindingSource,
    BoundFlow,
    PreparedCompute,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
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
import type { World } from '../../scene/world/World';
import type { EventBus } from '../../scene/events/EventBus';
import { Camera } from '../scene/Camera';
import { Transform } from '../scene/Transform';
import { SpaceFunction } from '../extension/SpaceFunction';
import { SurfaceFunction } from '../extension/SurfaceFunction';
import { ParametricSurface, SURFACE_PRESET_INDEX, type AdaptiveConfig } from './ParametricSurface';
import { SurfaceAdaptParamsSchema, SurfaceDiffSchema, SurfaceParamsSchema } from './SurfaceSchemas';
import {
    surfaceAdapt,
    surfaceEval,
    surfaceEvalDiff,
    surfaceJet,
    surfaceJetAnalytic,
    surfaceJetMapped,
    surfaceJetPreset,
    surfacePoint,
    surfaceTangents,
    surfaceTangentsAnalytic,
    surfaceResources as R,
} from './shaders';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;
const NONE = ENGINE_NONE.value;

/** A câmera andou mais que `limit` (ou mudou o campo de visão) desde a última geração? */
function cameraMoved(
    last: readonly number[] | undefined,
    now: readonly number[] | undefined,
    limit: number,
): boolean {
    if (now === undefined) return false;
    if (last === undefined) return true;
    const d = Math.hypot(now[0]! - last[0]!, now[1]! - last[1]!, now[2]! - last[2]!);
    return d > limit || now[3] !== last[3];
}

/** Slots do estágio das superfícies paramétricas. */
export interface SurfaceSlots extends SlotMap {
    /** Superfícies paramétricas (o estágio escreve os vértices). */
    readonly surfaces: EntitiesSlot;
    /** Superfícies com `SurfaceFunction` (registros nos pools das formas, spec 031). */
    readonly functions: EntitiesSlot;
    /** Funções `space` da cena (com alguma: avaliação a cada quadro). */
    readonly spaces: EntitiesSlot;
    /** Relógio da cena (opcional; sem ele, tempo 0). */
    readonly time: SingletonSlot<true>;
    /** Pool da geometria diferencial (existe com superfícies `differential`). */
    readonly diffs: PoolSlot<true>;
    /** Câmera ativa (malha adaptativa: distância). */
    readonly camera: SingletonSlot<true>;
    /** Matrizes das câmeras (só GPU). */
    readonly cameras: PoolSlot<true>;
    /** Matrizes de mundo (malha adaptativa: a superfície na cena). */
    readonly worlds: PoolSlot<true>;
}

const slots: SurfaceSlots = {
    surfaces: slot.entities({
        all: [ParametricSurface],
        owns: [[ParametricSurface, 'vertices']],
    }),
    functions: slot.entities({ all: [ParametricSurface, SurfaceFunction] }),
    spaces: slot.entities({ all: [SpaceFunction] }),
    time: slot.singleton(Time.schema, { optional: true }),
    diffs: slot.pool(SurfaceDiffSchema.name, { optional: true }),
    camera: slot.singleton(Camera.schema, { optional: true }),
    cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
    worlds: slot.pool(Transform.worldSchema.name, { optional: true }),
};

/** Passadas da malha adaptativa (entradas do `surface_adapt.wgsl`), na ordem. */
const ADAPT_ENTRIES = ['level', 'budget', 'scan', 'emit'] as const;

/** Id do pipeline de uma passada da malha adaptativa (a variante tem o da emissão como principal). */
function adaptId(emitId: string, entry: (typeof ADAPT_ENTRIES)[number]): string {
    return `${emitId.slice(0, -'#emit'.length)}#${entry}`;
}

type Ctx = TransitionContext<SurfaceSlots>;

/** Estado de uma superfície: parâmetros, avaliação pendente e a malha adaptativa (o pipeline fica em `pipelines`). */
interface SurfaceState {
    readonly id: EntityId;
    readonly params: UniformBufferSpec;
    /** Avaliar no próximo quadro. */
    stale: boolean;
    /** Avaliar neste quadro (decidido no `framePrepare`). */
    evaluate: boolean;
    /** Malha adaptativa: parâmetros, retalhos, histograma e a câmera da última geração. */
    adapt:
        | {
              readonly params: UniformBufferSpec;
              readonly patches: StorageBufferSpec;
              readonly hist: StorageBufferSpec;
              camera: readonly number[] | undefined;
          }
        | undefined;
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
    /** Os registros de todas as formas das funções `surface` (spec 031, R8) e os vértices das superfícies. */
    override readonly listens = [surfacePoint, ParametricSurface.vertexStruct];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private readonly states = new Map<EntityId, SurfaceState>();
    private readonly dummyPool: StorageBufferSpec;
    private readonly world: World;
    private readonly events: EventBus;
    private readonly warnedAdaptive = new Set<EntityId>();
    /**
     * Pipeline de avaliação de cada superfície (por função, adaptadores e jato; na malha adaptativa, as quatro
     * passadas, com a emissão como principal), ativo ao compilar.
     */
    private readonly evalPipelines = new ExtensionPipelines<EntityId>();
    private dirty = true;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.world = ctx.world;
        this.events = ctx.events;
        this.dummyPool = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'surface_adapt_pool_dummy',
            byteSize: 256,
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
                    run: (e, c) => {
                        if (e.type !== 'pipelinesCompiled' || e.pipeline === undefined) return;
                        for (const id of this.evalPipelines.compiled(e.pipeline, c)) {
                            const st = this.states.get(id);
                            if (st !== undefined) st.stale = true;
                        }
                    },
                },
                pipelineRejected: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type === 'pipelineRejected')
                            this.evalPipelines.rejected(e.pipeline, c);
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
            const active = this.evalPipelines.active(st.id);
            if (!st.evaluate || active === undefined) continue;
            const surface = bound.slots.surfaces.entry(st.id)?.get(ParametricSurface);
            if (surface === undefined) continue;
            if (surface.adaptive !== undefined && st.adapt !== undefined) {
                this.dispatchAdaptive(frame, bound, st, active, surface.adaptive);
                continue;
            }
            const p = bound.pipelines.get(active.id);
            if (p?.role !== 'compute' || !p.ready) continue;
            frame.compute('SurfaceFlow', (pass) => {
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind);
                pass.dispatch.invocations(surface.vertexCount, WORKGROUP_SIZE);
            });
            st.stale = false;
        }
    }

    /** Passadas da malha adaptativa: níveis, orçamento, prefixos e emissão — tudo na GPU. */
    private dispatchAdaptive(
        frame: Frame,
        bound: BoundFlow<SurfaceSlots>,
        st: SurfaceState,
        active: PipelineVariant,
        a: AdaptiveConfig,
    ): void {
        const ps = ADAPT_ENTRIES.map((e) => bound.pipelines.get(adaptId(active.id, e)));
        if (ps.some((p) => p?.role !== 'compute' || !p.ready)) return;
        const [level, budget, scan, emit] = ps as PreparedCompute[];
        const patches = a.patches[0] * a.patches[1];
        frame.clear(st.adapt!.hist);
        const run = (label: string, p: PreparedCompute, count: number | 'one'): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind);
                if (count === 'one') pass.dispatch.workgroups(1);
                else pass.dispatch.invocations(count, WORKGROUP_SIZE);
            });
        };
        run('SurfaceFlow.adapt.level', level!, patches);
        run('SurfaceFlow.adapt.budget', budget!, 'one');
        run('SurfaceFlow.adapt.scan', scan!, 'one');
        run('SurfaceFlow.adapt.emit', emit!, patches * a.side * a.side);
        st.stale = false;
    }

    /** Libera os parâmetros, os rascunhos e os substitutos. */
    override dispose(): void {
        for (const st of this.states.values()) this.destroyState(st);
        this.states.clear();
        this.core.destroy(this.dummyPool);
    }

    private destroyState(st: SurfaceState): void {
        this.core.destroy(st.params);
        if (st.adapt !== undefined)
            for (const b of [st.adapt.params, st.adapt.patches, st.adapt.hist])
                this.core.destroy(b);
    }

    /** Superfícies presentes: estado, bindings e pipeline (pela função, ou pela pronta). */
    private sync(ctx: Ctx): void {
        if (!this.dirty) return;
        this.dirty = false;
        const { surfaces, functions, spaces, diffs } = ctx.bound.slots;
        const spaced = spaces.entries.length > 0;
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
                    stale: true,
                    evaluate: false,
                    adapt: undefined,
                };
                const a = entry.get(ParametricSurface).adaptive;
                if (a !== undefined) {
                    const storage = (name: string, bytes: number): StorageBufferSpec =>
                        this.core.create<StorageBufferSpec>({
                            kind: 'buffer',
                            subkind: 'storage',
                            discriminator: `surface_adapt_${name}:${id}`,
                            byteSize: bytes,
                        });
                    st.adapt = {
                        params: this.core.create<UniformBufferSpec>({
                            kind: 'buffer',
                            subkind: 'uniform',
                            discriminator: `surface_adapt_params:${id}`,
                            byteSize: SurfaceAdaptParamsSchema.stride,
                        }),
                        patches: storage('patches', a.patches[0] * a.patches[1] * 16),
                        hist: storage('hist', 64),
                        camera: undefined,
                    };
                }
                this.states.set(id, st);
            }
            st.stale = true;
            const fn = functions.entry(id)?.get(SurfaceFunction);
            const module = fn?.module;
            const surface = entry.get(ParametricSurface);
            // Jato da geometria diferencial: do mapa com o espaço, analítico, das prontas ou numérico.
            const jet = !surface.differential
                ? undefined
                : spaced
                  ? surfaceJetMapped
                  : fn === undefined
                    ? surfaceJetPreset
                    : fn.analytic2
                      ? surfaceJetAnalytic
                      : undefined;
            const key = `${module?.name ?? 'preset'}|${surface.differential ? (jet?.name ?? 'numeric') : '-'}`;
            const adaptive = surface.adaptive !== undefined;
            const emitId = `surface_eval:${id}:${key}${adaptive ? '#emit' : ''}`;
            const next: PipelineVariant = {
                key,
                id: emitId,
                ...(adaptive ? { ids: ADAPT_ENTRIES.map((e) => adaptId(emitId, e)) } : {}),
            };
            for (const { id: pid } of this.evalPipelines.bindable(id, next)) {
                if (adaptive) {
                    this.bindAdaptive(ctx, st, surface, pid, vertices);
                    continue;
                }
                const at = (resource: WgslResource): BindingKey => ({ pipeline: pid, resource });
                ctx.bind(
                    new Map<BindingKey, BindingSource>([
                        [at(R.params), st.params],
                        [at(R.vertices), vertices],
                        ...(surface.differential && diffs !== undefined
                            ? ([[at(R.diff), diffs.buffer]] as [BindingKey, BindingSource][])
                            : []),
                    ]),
                );
            }
            this.evalPipelines.select(id, next, ({ id: pipelineId }) => {
                const base = adaptive
                    ? surfaceAdapt
                    : surface.differential
                      ? surfaceEvalDiff
                      : surfaceEval;
                const impls = new Map<BindablePoint, WgslModule>([
                    [surfacePoint, fn?.module ?? surfacePoint.ready],
                ]);
                if (fn?.analytic === true) impls.set(surfaceTangents, surfaceTangentsAnalytic);
                if (jet !== undefined) impls.set(surfaceJet, jet);
                const shader =
                    fn === undefined && jet === undefined ? base : bindPoints(base, impls);
                const extra = fn === undefined ? {} : { verify: true, extensions: [fn] };
                if (adaptive) {
                    // As quatro passadas compartilham o shader; a de emissão é a principal (marca a compilação).
                    return ADAPT_ENTRIES.map(
                        (e) =>
                            ctx.prepare({
                                id: adaptId(pipelineId, e),
                                role: 'compute',
                                shader,
                                entryPoints: [`surface_adapt_${e}_main`],
                                ...extra,
                            }).ready,
                    ).every(Boolean);
                }
                return ctx.prepare({
                    id: pipelineId,
                    role: 'compute',
                    shader,
                    entryPoints: [
                        surface.differential ? 'surface_eval_diff_main' : 'surface_eval_main',
                    ],
                    ...extra,
                }).ready;
            });
        }
        for (const [id, st] of [...this.states]) {
            if (present.has(id)) continue;
            this.destroyState(st);
            this.states.delete(id);
        }
        this.evalPipelines.retain(ctx, present);
    }

    /** Fontes das passadas da malha adaptativa (pelo id da emissão). */
    private bindAdaptive(
        ctx: Ctx,
        st: SurfaceState,
        surface: ParametricSurface,
        emitId: string,
        vertices: AnyBufferSpec,
    ): void {
        const { diffs, cameras, worlds } = ctx.bound.slots;
        const indices = this.resources.bufferOf(surface, 'indices');
        const edges = this.resources.bufferOf(surface, 'wireEdges');
        const draw = this.resources.bufferOf(surface, 'indirect');
        if (
            indices === undefined
            || edges === undefined
            || draw === undefined
            || st.adapt === undefined
        )
            return;
        for (const e of ADAPT_ENTRIES) {
            const pid = adaptId(emitId, e);
            const at = (resource: WgslResource): BindingKey => ({ pipeline: pid, resource });
            ctx.bind(
                new Map<BindingKey, BindingSource>([
                    [at(R.params), st.params],
                    [at(R.adapt), st.adapt.params],
                    [at(R.adaptPatches), st.adapt.patches],
                    [at(R.adaptHist), st.adapt.hist],
                    [at(R.adaptVertices), vertices as BindingSource],
                    [at(R.adaptIndices), indices as BindingSource],
                    [at(R.adaptEdges), edges as BindingSource],
                    [at(R.adaptDraw), draw as BindingSource],
                    [at(R.diff), diffs?.buffer ?? this.dummyPool],
                    [at(R.adaptCameras), cameras?.buffer ?? this.dummyPool],
                    [at(R.adaptWorlds), worlds?.buffer ?? this.dummyPool],
                ]),
            );
        }
    }

    /** Posição (e campo de visão) da câmera da entidade `id`, da CPU (`Transform` e `Camera`). */
    private cameraPositionOf(id: EntityId): readonly number[] | undefined {
        const resources = this.world.resourcesOf(id);
        const t = resources.find((r): r is Transform => r instanceof Transform);
        const c = resources.find((r): r is Camera => r instanceof Camera);
        if (t === undefined) return undefined;
        const p = t.data.position;
        return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, c?.data.fov ?? 0];
    }

    /** Decide quem avalia neste quadro e escreve os parâmetros deles. */
    private writeParams(ctx: Ctx): void {
        const { surfaces, functions, spaces, time, diffs, camera, cameras, worlds } =
            ctx.bound.slots;
        const cameraId =
            camera === undefined ? undefined : this.world.entityIdOfResource(camera.resource);
        const cameraPos = cameraId === undefined ? undefined : this.cameraPositionOf(cameraId);
        const indirect = this.core.capabilities().features.includes('indirect-first-instance');
        const t = (time?.resource as Time | undefined)?.simulated ?? 0;
        const spaced = spaces.entries.length > 0;
        for (const st of this.states.values()) {
            const surface = surfaces.entry(st.id)?.get(ParametricSurface);
            if (surface === undefined) continue;
            const d = surface.data;
            const a = surface.adaptive;
            // Malha adaptativa: refeita também quando a câmera anda mais que o limiar (ou a vista muda).
            const moved =
                a !== undefined
                && st.adapt !== undefined
                && cameraMoved(st.adapt.camera, cameraPos, a.refreshDistance);
            st.evaluate = st.stale || d.animated || spaced || moved;
            if (!st.evaluate) continue;
            if (a !== undefined && st.adapt !== undefined) {
                st.adapt.camera = cameraPos;
                if (!indirect && !this.warnedAdaptive.has(st.id)) {
                    this.warnedAdaptive.add(st.id);
                    this.events.emit('adaptiveUnavailable', {
                        resource: surface,
                        reason: "o device não tem 'indirect-first-instance': malha no nível máximo",
                    });
                }
                const [pu, pv] = a.patches;
                this.core.write(
                    st.adapt.params,
                    SurfaceAdaptParamsSchema.pack({
                        patches_u: pu,
                        patches_v: pv,
                        max_level: a.maxLevel,
                        budget: a.budget,
                        camera_slot:
                            cameraId === undefined ? NONE : (cameras?.slotOf(cameraId) ?? NONE),
                        transform_slot: worlds?.slotOf(st.id) ?? NONE,
                        diff_first: diffs?.slotOf(st.id) ?? 0,
                        force_max: indirect ? 0 : 1,
                        periodic_u: a.periodic[0] ? 1 : 0,
                        periodic_v: a.periodic[1] ? 1 : 0,
                        side: a.side,
                        tolerance: a.tolerance,
                        screen: a.screen,
                    }),
                );
            }
            const fn = functions.entry(st.id)?.get(SurfaceFunction);
            const record =
                fn === undefined ? undefined : this.resources.poolSlotOf(fn.record.name, st.id);
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
