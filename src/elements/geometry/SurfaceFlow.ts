import type { WgslResource } from '../../scene/shaders/WgslResource';
import { NONE as ENGINE_NONE } from '../../scene/shaders/engineConstants';
import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { FlowWork, type WorkPart } from '../../scene/flows/FlowWork';
import { wordBuffer } from '../gpu/compute/schemas';
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
    type ChannelSlot,
    type EntitiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type WorkSlot,
} from '../../scene/flows/slots';
import { bindPoints, type BindablePoint } from '../../scene/shaders/bindPoints';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import { Time } from '../../scene/time/Time';
import type { EntityId } from '../../scene/world/EntityId';
import type { World } from '../../scene/world/World';
import type { EventBus } from '../../scene/events/EventBus';
import { Camera } from '../scene/Camera';
import { DirectionalLight } from '../scene/DirectionalLight';
import { ShadowMap } from '../scene/ShadowMap';
import { Transform } from '../scene/Transform';
import { geometryViewDescriptor, type GeometryView } from './GeometryView';
import { SpaceFunction } from '../extension/SpaceFunction';
import { SurfaceFunction } from '../extension/SurfaceFunction';
import { ParametricSurface, SURFACE_PRESET_INDEX, type AdaptiveConfig } from './ParametricSurface';
import { SurfaceAdaptParamsSchema, SurfaceDiffSchema, SurfaceParamsSchema } from './SurfaceSchemas';
import {
    SURFACE_VIEW_LEVELS_SLOT,
    surfaceAdapt,
    surfaceAdaptLight,
    surfaceAdaptViewCamera,
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

/** A assinatura das vistas pedidas de uma superfície (outra = sincronizar). */
function viewsKeyOf(surface: ParametricSurface): string {
    return surface.views
        .map((v) => `${v.key}:${v.kind}:${v.source}:${v.error}:${v.segment}`)
        .join(';');
}

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
    /** O espaço de trabalho do estágio: o substituto dos pools ausentes da malha adaptativa (spec 039). */
    readonly work: WorkSlot<SurfaceWork>;
    /** Os referenciais dos mapas de sombra virtuais (as vistas da luz; spec 041, R20). */
    readonly shadows: PoolSlot<true>;
    /** A série dos níveis das vistas (spec 037): o registro de cada retalho no quadro e no anterior. */
    readonly levels: ChannelSlot<true>;
}

/**
 * Resource de trabalho do `SurfaceFlow` (spec 039): o substituto dos pools ausentes e o trabalho de cada superfície
 * (parâmetros, retalhos, histograma) como uma parte por superfície, tirada quando ela sai. Na própria
 * `ParametricSurface` esses descritores (todos escritos pela GPU ou pelo estágio) fariam a C2 tratá-la como dado da GPU
 * e ignorar as mudanças de `data`.
 */
class SurfaceWork extends FlowWork {
    static readonly schema = new StructSchema('SurfaceWork', {});
    /** Registros (um `vec4u` por retalho de cada vista) da série dos níveis das vistas. */
    levelsCapacity = 1;
}

/** O descritor da série dos níveis das vistas no `SurfaceWork` (spec 041, R20). */
const LEVELS = 'surface_view_levels';

/**
 * Passadas de uma vista (spec 041, R20), na ordem: o nível pelo critério da vista, o orçamento e os prefixos da malha
 * adaptativa, a marcação dos retalhos que mudaram, o despacho da emissão e a emissão (indireta).
 */
const VIEW_ENTRIES = ['level', 'budget', 'scan', 'mark', 'args', 'emit'] as const;

/** A função de entrada de uma passada de uma vista do tipo `kind`. */
function viewEntry(kind: GeometryView['kind'], entry: (typeof VIEW_ENTRIES)[number]): string {
    switch (entry) {
        case 'level':
            return kind === 'light'
                ? 'surface_adapt_light_level_main'
                : 'surface_adapt_view_camera_level_main';
        case 'mark':
            return 'surface_adapt_view_mark_main';
        case 'args':
            return 'surface_adapt_view_args_main';
        default:
            return `surface_adapt_${entry}_main`;
    }
}

/** Id do pipeline de uma passada de uma vista (a variante tem o da emissão como principal). */
function viewPassId(emitId: string, entry: (typeof VIEW_ENTRIES)[number]): string {
    return `${emitId.slice(0, -'#emit'.length)}#${entry}`;
}

/**
 * Uma vista de uma superfície adaptativa (spec 041, R20): o trabalho dela (parâmetros, retalhos, histograma e o despacho
 * indireto da emissão), o primeiro registro na série dos níveis e as entradas da última geração.
 */
interface ViewState {
    /** Chave nos pipelines das vistas (`<entidade>|<vista>`). */
    readonly key: string;
    view: GeometryView;
    readonly part: WorkPart;
    readonly params: UniformBufferSpec;
    readonly patches: StorageBufferSpec;
    readonly hist: StorageBufferSpec;
    readonly dispatch: IndirectBufferSpec;
    /** Primeiro registro da vista na série dos níveis. */
    levelsBase: number;
    /** O que define o critério na última geração (a luz, o mapa, a câmera); outro = refazer. */
    inputs: string | undefined;
    /** Refazer todos os retalhos na próxima geração (vista nova, pipeline novo). */
    stale: boolean;
    /** Gerar neste quadro (decidido no `framePrepare`). */
    run: boolean;
}

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
    /** O trabalho da superfície no `SurfaceWork` (parâmetros e, na malha adaptativa, os da passada e os rascunhos). */
    readonly part: WorkPart;
    readonly params: UniformBufferSpec;
    /** Avaliar no próximo quadro. */
    stale: boolean;
    /** Avaliar neste quadro (decidido no `framePrepare`). */
    evaluate: boolean;
    /** As vistas além da câmera ativa (spec 041, R20), pela chave da vista. */
    readonly views: Map<string, ViewState>;
    /** As vistas pedidas na última sincronização (a assinatura). */
    viewsKey: string;
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
    readonly slots: SurfaceSlots;
    /** Os registros de todas as formas das funções `surface` (spec 031, R8) e os vértices das superfícies. */
    override readonly listens = [surfacePoint, ParametricSurface.vertexStruct];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    /** O core só para consultas (as funcionalidades do adaptador). */
    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private readonly states = new Map<EntityId, SurfaceState>();
    private readonly work: SurfaceWork;
    private readonly world: World;
    private readonly events: EventBus;
    private readonly warnedAdaptive = new Set<EntityId>();
    /**
     * Pipeline de avaliação de cada superfície (por função, adaptadores e jato; na malha adaptativa, as quatro
     * passadas, com a emissão como principal), ativo ao compilar.
     */
    private readonly evalPipelines = new ExtensionPipelines<EntityId>();
    /** Pipelines das vistas (spec 041, R20): as seis passadas de cada vista de cada superfície. */
    private readonly viewPipelines = new ExtensionPipelines<string>();
    /** A disposição da série dos níveis mudou (vistas novas ou que saíram): o registro anterior não vale. */
    private levelsMoved = true;
    private dirty = true;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.world = ctx.world;
        this.events = ctx.events;
        const work = new SurfaceWork();
        this.work = work;
        work.use({
            descriptors: () => [
                wordBuffer('surface_adapt_pool_dummy', 256),
                // O substituto das arestas do arame nas vistas (sem arame): outro buffer que o da geometria diferencial —
                // duas ligações graváveis do mesmo buffer no despacho invalidam o passe.
                wordBuffer('surface_view_edges_dummy', 256),
                // A série dos níveis das vistas (spec 037): a fatia do quadro e a do anterior.
                { ...wordBuffer(LEVELS, work.levelsCapacity * 16), history: { depth: 2 } },
            ],
        });
        this.slots = {
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
            work: slot.work(() => work),
            shadows: slot.pool(ShadowMap.matrixSchema.name, { optional: true }),
            // O nome do slot é o do provedor das fatias nos shaders (`SURFACE_VIEW_LEVELS_SLOT`).
            [SURFACE_VIEW_LEVELS_SLOT]: slot.channel(SurfaceWork.schema, LEVELS, {
                optional: true,
            }),
        };
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
                        for (const key of this.viewPipelines.compiled(e.pipeline, c)) {
                            for (const st of this.states.values()) {
                                for (const v of st.views.values())
                                    if (v.key === key) v.stale = true;
                            }
                        }
                    },
                },
                pipelineRejected: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type !== 'pipelineRejected') return;
                        this.evalPipelines.rejected(e.pipeline, c);
                        this.viewPipelines.rejected(e.pipeline, c);
                    },
                },
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.watchViews(c);
                        this.sync(c);
                        this.writeParams(c);
                    },
                },
            },
        };
    }

    /** Uma avaliação por superfície marcada neste quadro e as vistas a refazer. */
    dispatch(frame: Frame, bound: BoundFlow<SurfaceSlots>): void {
        this.dispatchSurfaces(frame, bound);
        let wrote = false;
        for (const st of this.states.values())
            for (const v of st.views.values()) wrote = this.dispatchView(frame, bound, v) || wrote;
        if (wrote) bound.slots.levels?.written();
    }

    /**
     * As passadas de uma vista (spec 041, R20): o nível pelo critério dela, o orçamento, os prefixos, a marcação dos
     * retalhos que mudaram, o despacho e a emissão indireta (nenhum grupo quando nenhum retalho mudou).
     */
    private dispatchView(frame: Frame, bound: BoundFlow<SurfaceSlots>, v: ViewState): boolean {
        if (!v.run) return false;
        const active = this.viewPipelines.active(v.key);
        if (active === undefined) return false;
        const ps = VIEW_ENTRIES.map((e) => bound.pipelines.get(viewPassId(active.id, e)));
        if (ps.some((p) => p?.role !== 'compute' || !p.ready)) return false;
        const [level, budget, scan, mark, args, emit] = ps as PreparedCompute[];
        const st = [...this.states.values()].find((s) => s.views.get(v.view.key) === v);
        const surface =
            st === undefined
                ? undefined
                : bound.slots.surfaces.entry(st.id)?.get(ParametricSurface);
        const a = surface?.adaptive;
        if (a === undefined) return false;
        const patches = a.patches[0] * a.patches[1];
        frame.clear(v.hist);
        frame.compute('SurfaceFlow.view', (pass) => {
            const run = (p: PreparedCompute, count: number | 'one'): void => {
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind);
                if (count === 'one') pass.dispatch.workgroups(1);
                else pass.dispatch.invocations(count, WORKGROUP_SIZE);
            };
            run(level!, patches);
            run(budget!, 'one');
            run(scan!, 'one');
            run(mark!, patches);
            run(args!, 'one');
            pass.bind.setPipeline(emit!.spec);
            emit!.bindTo(pass.bind);
            pass.dispatch.workgroupsIndirect(v.dispatch, 0);
        });
        v.stale = false;
        return true;
    }

    /** As superfícies: a grade uniforme ou a malha adaptativa da câmera ativa. */
    private dispatchSurfaces(frame: Frame, bound: BoundFlow<SurfaceSlots>): void {
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

    /** Esquece os estados (os objetos de GPU são do `SurfaceWork`; a C2 os libera com ele). */
    override dispose(): void {
        this.states.clear();
    }

    /** As vistas pedidas de cada superfície mudaram (o consumidor pediu ou soltou uma): sincroniza. */
    private watchViews(ctx: Ctx): void {
        for (const entry of ctx.bound.slots.surfaces.entries) {
            const st = this.states.get(entry.entityId);
            if (st === undefined) continue;
            if (viewsKeyOf(entry.get(ParametricSurface)) !== st.viewsKey) this.dirty = true;
        }
    }

    /**
     * O trabalho de uma vista (spec 041, R20): os parâmetros da passada, os retalhos, o histograma e o despacho indireto
     * da emissão.
     */
    private viewPart(id: EntityId, key: string, a: AdaptiveConfig): WorkPart {
        const tag = `${id}:${key}`;
        return {
            descriptors: () => [
                {
                    id: `surface_view_params:${tag}`,
                    role: 'uniform',
                    schema: SurfaceAdaptParamsSchema,
                    upload: 'never',
                },
                wordBuffer(`surface_view_patches:${tag}`, a.patches[0] * a.patches[1] * 16),
                wordBuffer(`surface_view_hist:${tag}`, 64),
                wordBuffer(`surface_view_dispatch:${tag}`, 16, 'indirect'),
            ],
        };
    }

    /**
     * As vistas da superfície (spec 041, R20): cria o trabalho das novas, tira o das que saíram e liga e prepara os
     * pipelines das seis passadas de cada uma (o nível pelo tipo da vista; o resto, os da malha adaptativa).
     */
    private syncViews(
        ctx: Ctx,
        st: SurfaceState,
        surface: ParametricSurface,
        surfaceKey: string,
        impls: Map<BindablePoint, WgslModule>,
        extra: Record<string, unknown>,
    ): void {
        const a = surface.adaptive;
        const views = a === undefined ? [] : surface.views;
        st.viewsKey = viewsKeyOf(surface);
        const wanted = new Set(views.map((v) => v.key));
        for (const [k, v] of [...st.views]) {
            if (wanted.has(k)) continue;
            this.work.drop(v.part);
            this.viewPipelines.forget(ctx, v.key);
            st.views.delete(k);
            this.levelsMoved = true;
        }
        if (a === undefined) return;
        for (const view of views) {
            let v = st.views.get(view.key);
            if (v === undefined) {
                const part = this.viewPart(st.id, view.key, a);
                this.work.use(part);
                const own = <T>(name: string): T =>
                    this.resources.bufferOf(this.work, `${name}:${st.id}:${view.key}`) as T;
                v = {
                    key: `${st.id}|${view.key}`,
                    view,
                    part,
                    params: own<UniformBufferSpec>('surface_view_params'),
                    patches: own<StorageBufferSpec>('surface_view_patches'),
                    hist: own<StorageBufferSpec>('surface_view_hist'),
                    dispatch: own<IndirectBufferSpec>('surface_view_dispatch'),
                    levelsBase: 0,
                    inputs: undefined,
                    stale: true,
                    run: false,
                };
                st.views.set(view.key, v);
                this.levelsMoved = true;
            }
            v.view = view;
            v.stale = true;
            const vertices = this.resources.bufferOf(
                surface,
                geometryViewDescriptor(view.key, 'vertices'),
            );
            const indices = this.resources.bufferOf(
                surface,
                geometryViewDescriptor(view.key, 'indices'),
            );
            const draw = this.resources.bufferOf(
                surface,
                geometryViewDescriptor(view.key, 'indirect'),
            );
            if (vertices === undefined || indices === undefined || draw === undefined) continue;
            const key = `${surfaceKey}|${view.kind}`;
            const emitId = `surface_view:${st.id}:${view.key}:${key}#emit`;
            const next: PipelineVariant = {
                key,
                id: emitId,
                ids: VIEW_ENTRIES.map((e) => viewPassId(emitId, e)),
            };
            const state = v;
            for (const { id: pid } of this.viewPipelines.bindable(v.key, next)) {
                for (const e of VIEW_ENTRIES) {
                    const at = (resource: WgslResource): BindingKey => ({
                        pipeline: viewPassId(pid, e),
                        resource,
                    });
                    ctx.bind(
                        new Map<BindingKey, BindingSource>([
                            [at(R.params), st.params],
                            [at(R.adapt), state.params],
                            [at(R.adaptPatches), state.patches],
                            [at(R.adaptHist), state.hist],
                            [at(R.adaptVertices), vertices as BindingSource],
                            [at(R.adaptIndices), indices as BindingSource],
                            [at(R.adaptEdges), this.dummyEdges],
                            [at(R.adaptDraw), draw as BindingSource],
                            [at(R.diff), this.dummyPool],
                            [at(R.adaptViewDispatch), state.dispatch as BindingSource],
                        ]),
                    );
                }
            }
            this.viewPipelines.select(v.key, next, ({ id: pipelineId }) => {
                const base = view.kind === 'light' ? surfaceAdaptLight : surfaceAdaptViewCamera;
                const shader = impls.size === 0 ? base : bindPoints(base, impls);
                return VIEW_ENTRIES.map(
                    (e) =>
                        ctx.prepare({
                            id: viewPassId(pipelineId, e),
                            role: 'compute',
                            shader,
                            entryPoints: [viewEntry(view.kind, e)],
                            ...extra,
                        }).ready,
                ).every(Boolean);
            });
        }
    }

    /**
     * A disposição da série dos níveis: cada vista com a sua faixa (um registro por retalho), na ordem das superfícies;
     * a capacidade cresce por dobra (a série é realocada e recomeça).
     */
    private layoutLevels(): void {
        let base = 0;
        for (const st of this.states.values()) {
            for (const v of st.views.values()) {
                const surface = this.world
                    .resourcesOf(st.id)
                    .find((r): r is ParametricSurface => r instanceof ParametricSurface);
                const a = surface?.adaptive;
                if (a === undefined) continue;
                if (v.levelsBase !== base) this.levelsMoved = true;
                v.levelsBase = base;
                base += a.patches[0] * a.patches[1];
            }
        }
        let cap = Math.max(1, this.work.levelsCapacity);
        while (cap < base) cap *= 2;
        if (cap !== this.work.levelsCapacity) {
            this.work.levelsCapacity = cap;
            this.work.refresh();
            this.levelsMoved = true;
        }
    }

    /**
     * O trabalho de uma superfície: os parâmetros (`SurfaceParams`) e, na malha adaptativa, os da passada
     * (`SurfaceAdaptParams`), os retalhos (um vec4 por retalho) e o histograma dos níveis — escritos pela GPU ou pelo
     * estágio (`writeNow`).
     */
    private surfacePart(id: EntityId, a: AdaptiveConfig | undefined): WorkPart {
        return {
            descriptors: () => [
                {
                    id: `surface_params:${id}`,
                    role: 'uniform',
                    schema: SurfaceParamsSchema,
                    upload: 'never',
                },
                ...(a === undefined
                    ? []
                    : [
                          {
                              id: `surface_adapt_params:${id}`,
                              role: 'uniform' as const,
                              schema: SurfaceAdaptParamsSchema,
                              upload: 'never' as const,
                          },
                          wordBuffer(
                              `surface_adapt_patches:${id}`,
                              a.patches[0] * a.patches[1] * 16,
                          ),
                          wordBuffer(`surface_adapt_hist:${id}`, 64),
                      ]),
            ],
        };
    }

    /** O substituto dos pools ausentes (descritor do `SurfaceWork`). */
    private get dummyPool(): StorageBufferSpec {
        return this.resources.bufferOf(this.work, 'surface_adapt_pool_dummy') as StorageBufferSpec;
    }

    /** O substituto das arestas nas vistas (descritor do `SurfaceWork`). */
    private get dummyEdges(): StorageBufferSpec {
        return this.resources.bufferOf(this.work, 'surface_view_edges_dummy') as StorageBufferSpec;
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
                // O trabalho da avaliação: uma parte do `SurfaceWork` (spec 039), alocada agora pela C2.
                const owner = entry.get(ParametricSurface);
                const a = owner.adaptive;
                const part = this.surfacePart(id, a);
                this.work.use(part);
                const own = <T>(name: string): T =>
                    this.resources.bufferOf(this.work, `${name}:${id}`) as T;
                st = {
                    id,
                    part,
                    params: own<UniformBufferSpec>('surface_params'),
                    stale: true,
                    evaluate: false,
                    views: new Map(),
                    viewsKey: '',
                    adapt: undefined,
                };
                if (a !== undefined) {
                    st.adapt = {
                        params: own<UniformBufferSpec>('surface_adapt_params'),
                        patches: own<StorageBufferSpec>('surface_adapt_patches'),
                        hist: own<StorageBufferSpec>('surface_adapt_hist'),
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
            const viewImpls = new Map<BindablePoint, WgslModule>();
            if (fn !== undefined) viewImpls.set(surfacePoint, fn.module);
            if (fn?.analytic === true) viewImpls.set(surfaceTangents, surfaceTangentsAnalytic);
            if (jet !== undefined) viewImpls.set(surfaceJet, jet);
            this.syncViews(
                ctx,
                st,
                surface,
                key,
                viewImpls,
                fn === undefined ? {} : { verify: true, extensions: [fn] },
            );
        }
        for (const [id, st] of [...this.states]) {
            if (present.has(id)) continue;
            for (const v of st.views.values()) {
                this.work.drop(v.part);
                this.viewPipelines.forget(ctx, v.key);
                this.levelsMoved = true;
            }
            this.work.drop(st.part);
            this.states.delete(id);
        }
        this.evalPipelines.retain(ctx, present);
        this.layoutLevels();
    }

    /** Fontes das passadas da malha adaptativa (pelo id da emissão). */
    private bindAdaptive(
        ctx: Ctx,
        st: SurfaceState,
        surface: ParametricSurface,
        emitId: string,
        vertices: AnyBufferSpec,
    ): void {
        const { diffs } = ctx.bound.slots;
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

    /** O pipeline (ou as passadas adaptativas) da superfície está pronto para gravar a avaliação neste quadro? */
    private willEvaluate(ctx: Ctx, st: SurfaceState, surface: ParametricSurface): boolean {
        const active = this.evalPipelines.active(st.id);
        if (active === undefined) return false;
        const ids =
            surface.adaptive !== undefined && st.adapt !== undefined
                ? ADAPT_ENTRIES.map((e) => adaptId(active.id, e))
                : [active.id];
        return ids.every((id) => {
            const p = ctx.bound.pipelines.get(id);
            return p?.role === 'compute' && p.ready;
        });
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
            // A estrutura de raios (spec 033) reajusta a geometria nos quadros em que ela é escrita.
            ctx.produced(surface, 'vertices', st.evaluate && this.willEvaluate(ctx, st, surface));
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
                this.resources.writeNow(
                    this.work,
                    `surface_adapt_params:${st.id}`,
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
            this.resources.writeNow(
                this.work,
                `surface_params:${st.id}`,
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
        this.writeViews(ctx, cameraPos, indirect, spaced);
    }

    /**
     * O que define o critério da vista no quadro: na da luz, a direção dela, o mapa (primeiro nível, páginas, tamanho) e
     * a câmera ativa (o centro dos níveis); na de câmera, a posição e o campo de visão dela.
     */
    private viewInputs(view: GeometryView, cameraPos: readonly number[] | undefined): string {
        if (view.kind === 'camera')
            return JSON.stringify(this.cameraPositionOf(view.source) ?? null);
        const resources = this.world.resourcesOf(view.source);
        const light = resources.find((r): r is DirectionalLight => r instanceof DirectionalLight);
        const map = resources.find((r): r is ShadowMap => r instanceof ShadowMap);
        return JSON.stringify([
            light?.data.direction ?? null,
            map === undefined
                ? null
                : [map.data.firstLevelRadius, map.data.pagesPerLevel, map.data.size],
            cameraPos ?? null,
        ]);
    }

    /**
     * As vistas no quadro (spec 041, R20): uma vista é refeita quando a superfície é avaliada (todos os retalhos), quando
     * o que define o critério muda ou quando é nova; se uma é refeita, todas são (a série dos níveis gira junto). Os
     * parâmetros das que rodam são escritos e a saída é marcada como produzida no quadro.
     */
    private writeViews(
        ctx: Ctx,
        cameraPos: readonly number[] | undefined,
        indirect: boolean,
        spaced: boolean,
    ): void {
        const { surfaces, cameras, shadows, worlds, levels } = ctx.bound.slots;
        const valid = !this.levelsMoved && levels?.age(1) !== undefined;
        let any = false;
        const plan: { st: SurfaceState; v: ViewState; force: boolean; inputs: string }[] = [];
        for (const st of this.states.values()) {
            const surface = surfaces.entry(st.id)?.get(ParametricSurface);
            if (surface === undefined) continue;
            for (const v of st.views.values()) {
                const inputs = this.viewInputs(v.view, cameraPos);
                const force = v.stale || st.stale || surface.data.animated || spaced || !valid;
                plan.push({ st, v, force, inputs });
                if (force || inputs !== v.inputs) any = true;
            }
        }
        for (const { st, v, force, inputs } of plan) {
            const surface = surfaces.entry(st.id)!.get(ParametricSurface);
            const a = surface.adaptive!;
            // Sem o desenho indireto, a malha fica no nível máximo (a capacidade inteira, maior que a da vista): a vista
            // não é gerada e o consumidor segue com a malha de sempre.
            const ready = indirect && this.viewReady(ctx, v);
            v.run = any && ready;
            ctx.produced(surface, geometryViewDescriptor(v.view.key, 'vertices'), v.run);
            if (!v.run) continue;
            v.inputs = inputs;
            const slot =
                v.view.kind === 'light'
                    ? shadows?.slotOf(v.view.source)
                    : cameras?.slotOf(v.view.source);
            const [pu, pv] = a.patches;
            this.resources.writeNow(
                this.work,
                `surface_view_params:${st.id}:${v.view.key}`,
                SurfaceAdaptParamsSchema.pack({
                    patches_u: pu,
                    patches_v: pv,
                    max_level: a.maxLevel,
                    budget: a.viewBudget,
                    camera_slot: NONE,
                    transform_slot: worlds?.slotOf(st.id) ?? NONE,
                    diff_first: 0,
                    force_max: indirect ? 0 : 1,
                    periodic_u: a.periodic[0] ? 1 : 0,
                    periodic_v: a.periodic[1] ? 1 : 0,
                    side: a.side,
                    view: 1,
                    tolerance: a.tolerance,
                    screen: a.screen,
                    view_error: v.view.error,
                    view_segment: v.view.segment,
                    view_slot: slot ?? NONE,
                    levels_base: v.levelsBase,
                    levels_valid: valid ? 1 : 0,
                    force: force ? 1 : 0,
                }),
            );
        }
        if (plan.some((p) => p.v.run)) this.levelsMoved = false;
    }

    /** As seis passadas da vista estão prontas? */
    private viewReady(ctx: Ctx, v: ViewState): boolean {
        const active = this.viewPipelines.active(v.key);
        if (active === undefined) return false;
        return VIEW_ENTRIES.every((e) => {
            const p = ctx.bound.pipelines.get(viewPassId(active.id, e));
            return p?.role === 'compute' && p.ready;
        });
    }
}
