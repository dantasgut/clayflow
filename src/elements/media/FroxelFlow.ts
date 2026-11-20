import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    IndirectBufferSpec,
    TextureViewSpec,
} from '../../scene/contracts/gpu';
import type { CompositeFunction } from '../../scene/contracts/ExtensionFunction';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import { Flow } from '../../scene/flows/Flow';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import {
    slot,
    type ChannelSlot,
    type EntitiesSlot,
    type EntityEntry,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../scene/flows/slots';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { Time } from '../../scene/time/Time';
import type { World } from '../../scene/world/World';
import { Camera } from '../scene/Camera';
import { Light } from '../scene/Light';
import { Sky } from '../scene/sky/Sky';
import { halton } from '../scene/TemporalAntialiasing';
import { Transform } from '../scene/Transform';
import { FogVolume } from './FogVolume';
import { Froxels } from './Froxels';
import { FROXEL_NEAR, froxelAmbientGrid } from './schemas';
import {
    froxelAmbient,
    froxelDecide,
    froxelHistorySlot,
    froxelReachSlot,
    froxelInject,
    froxelIntegrate,
    froxelResolveFor,
    mediaResources as R,
} from './shaders';

/** Slots do estágio dos froxels. */
export interface FroxelSlots extends SlotMap {
    /** Os froxels da cena (inseridos pelos estágios padrão). */
    readonly froxels: SingletonSlot<false>;
    /** Os volumes de névoa. */
    readonly fogs: EntitiesSlot;
    /** A câmera ativa (a grade é dela). */
    readonly camera: SingletonSlot<true>;
    /** As matrizes das câmeras (o slot da ativa). */
    readonly cameras: PoolSlot<true>;
    /** O tempo simulado (as funções de densidade). */
    readonly time: SingletonSlot<true>;
    /** O histórico dos froxels: um canal temporal (spec 037), alocado com a primeira névoa. */
    readonly froxelHistory: ChannelSlot<false>;
    /** O céu: com a tabela da perspectiva aérea escrita, a atmosfera entra na grade como meio (spec 041, R21). */
    readonly sky: SingletonSlot<true>;
    /** O alcance da câmera (spec 041, R21): a decisão do meio contínuo, escrita no fim do quadro anterior. */
    readonly froxelReach: ChannelSlot<false>;
}

const slots: FroxelSlots = {
    froxels: slot.singleton(Froxels.schema),
    fogs: slot.entities({ all: [FogVolume] }),
    camera: slot.singleton(Camera.schema, { optional: true }),
    cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
    time: slot.singleton(Time.schema, { optional: true }),
    sky: slot.singleton(Sky.schema, { optional: true }),
    ...froxelHistorySlot,
    ...froxelReachSlot,
};

type Ctx = TransitionContext<FroxelSlots>;

const compute = (id: string, shader: WgslModule, entry: string): PipelineDescriptor => ({
    id,
    role: 'compute',
    shader,
    entryPoints: [entry],
});

const AMBIENT = compute('froxel_ambient', froxelAmbient, 'froxel_ambient_main');
const DECIDE = compute('froxel_decide', froxelDecide, 'froxel_decide_main');
const INTEGRATE = compute('froxel_integrate', froxelIntegrate, 'froxel_integrate_main');
/** Id do acúmulo no formato do histórico. */
const resolveId = (format: GPUTextureFormat): string => `froxel_resolve:${format}`;
/** Id da injeção composta com as funções de densidade de uma revisão. */
const injectId = (revision: number): string => `froxel_inject:${revision}`;
/** vec4f de um registro de volume no buffer dos meios. */
const RECORD_VEC4 = 8;
/** Passo (razão) em que a distância da última fatia é arredondada: mudanças menores não invalidam o histórico. */
const FAR_STEP = 1.25;
/** Os volumes da grade, a escrever antes da injeção. */
const GRIDS = [
    'scatter',
    'current',
    'history',
    'ambient',
    'reach',
    'reachMax',
    'state',
    'open',
] as const;

/** Cópia de uma grade de densidade para o buffer dos meios (no início do quadro). */
interface GridCopy {
    readonly buffer: AnyBufferSpec;
    readonly bytes: number;
    readonly offset: number;
}

/**
 * FroxelFlow — a névoa dos `FogVolume` em froxels (spec 033, R12), depois do mapa de sombra e das sondas. A cada quadro:
 * os volumes e as grades no buffer dos meios (os registros só quando mudam; as grades copiadas, que a GPU pode
 * escrever), a injeção em cada froxel (a extinção e a luz espalhada: as luzes com a sombra e o meio até elas, o
 * ambiente e a luz rebatida, a emissão), o acúmulo no histórico reprojetado recortado pela vizinhança do quadro (T058),
 * e a integração da frente para trás que o
 * desenho lê (`scene_fog`). As funções de densidade da cena são compostas na injeção; uma mudança no conjunto prepara
 * kernels novos, que entram quando compilam. Com um `Sky` cuja tabela da perspectiva aérea foi escrita, a atmosfera entra
 * na grade como meio (spec 041, R21: `scene_medium`, até o alcance da tabela; a tabela soma o resto) — a grade existe
 * então mesmo sem névoa. Sem névoa e sem céu, ou sem câmera, nada.
 */
export class FroxelFlow extends Flow<FroxelSlots, 'idle'> {
    readonly type = 'FroxelFlow';
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private views: readonly (TextureViewSpec | undefined)[] = [];
    private prepared = false;
    private revision = 0;
    private injectRevision: number | undefined;
    private nextInjectRevision: number | undefined;
    private functionModules: readonly WgslModule[] = [];
    private mediaWritten = '';
    private mediaBuffer: AnyBufferSpec | undefined;
    /** Os argumentos do despacho indireto da grade (spec 041, R21). */
    private dispatchBuffer: IndirectBufferSpec | undefined;
    private grids: GridCopy[] = [];
    private frame = 0;
    /** A profundidade da última fatia do quadro anterior (o histórico só vale com as mesmas fatias). */
    private farKey: number | undefined;
    /** Volumes de névoa no quadro (sem nenhum, a luz ambiente da grade grossa não é lida). */
    private fogCount = 0;
    /** A resolução da grade do quadro anterior (o histórico só vale na mesma). */
    private gridKey: string | undefined;
    /** O formato do histórico resolvido pela C2 (spec 037: a precisão do canal, com o recuo sem `float32-filterable`). */
    private historyFormat: GPUTextureFormat | undefined;
    private active = false;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        this.transitions = {
            '*': {
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
                slotsResolved: 'ignore',
                entitiesChanged: 'ignore',
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                pipelineRejected: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
            },
        };
    }

    /** As grades no buffer dos meios, a luz ambiente, a injeção, o acúmulo e a integração, num passe. */
    dispatch(frame: Frame, bound: BoundFlow<FroxelSlots>): void {
        if (!this.active) return;
        const revision = this.readyInject(bound);
        const inject = revision === undefined ? undefined : bound.pipelines.get(injectId(revision));
        const integrate = bound.pipelines.get(INTEGRATE.id);
        const decide = bound.pipelines.get(DECIDE.id);
        const ambient = bound.pipelines.get(AMBIENT.id);
        const resolve =
            this.historyFormat === undefined
                ? undefined
                : bound.pipelines.get(resolveId(this.historyFormat));
        if (
            ambient?.role !== 'compute'
            || !ambient.ready
            || inject?.role !== 'compute'
            || !inject.ready
            || integrate?.role !== 'compute'
            || !integrate.ready
            || resolve?.role !== 'compute'
            || !resolve.ready
            || decide?.role !== 'compute'
            || !decide.ready
            || this.mediaBuffer === undefined
            || this.dispatchBuffer === undefined
        )
            return;
        const args = this.dispatchBuffer;
        for (const g of this.grids) frame.copy(g.buffer, this.mediaBuffer, g.bytes, 0, g.offset);
        const W = WORKGROUP_SIZE.value;
        // A grade do quadro (a dos `Froxels`, do perfil do `Renderer`) e a da luz ambiente que a acompanha.
        const grid = (bound.slots.froxels.resource as Froxels).grid;
        const am = froxelAmbientGrid(grid);
        const fogs = this.fogCount;
        frame.compute('FroxelFlow', (pass) => {
            // A decisão do quadro (spec 041, R21): o meio contínuo conta? Lida pelos kernels e pelo desenho.
            pass.bind.setPipeline(decide.spec);
            decide.bindTo(pass.bind);
            pass.dispatch.invocations(1, 1);
            // A luz ambiente da grade grossa só é lida onde há névoa dos volumes (a do meio contínuo vem com ele).
            if (fogs > 0) {
                pass.bind.setPipeline(ambient.spec);
                ambient.bindTo(pass.bind);
                pass.dispatch.invocations(am[0] * am[1] * am[2], W);
            }
            // A injeção, o acúmulo e a integração pelos argumentos da decisão (nenhum grupo sem o meio nem névoa).
            pass.bind.setPipeline(inject.spec);
            inject.bindTo(pass.bind);
            pass.dispatch.workgroupsIndirect(args, 0);
            // O acúmulo com o recorte pela vizinhança do quadro (T058).
            pass.bind.setPipeline(resolve.spec);
            resolve.bindTo(pass.bind);
            pass.dispatch.workgroupsIndirect(args, 0);
            pass.bind.setPipeline(integrate.spec);
            integrate.bindTo(pass.bind);
            pass.dispatch.workgroupsIndirect(args, 16);
        });
        // A fatia do quadro do histórico foi escrita: o quadro seguinte a lê como a anterior (o canal gira).
        bound.slots.froxelHistory.written();
        this.frame++;
    }

    /** Libera o buffer da câmera guardada. */
    override dispose(): void {}

    private prepare(c: Ctx): void {
        const froxels = c.bound.slots.froxels.resource as Froxels;
        const fogs = c.bound.slots.fogs.entries;
        const cameraSlot = this.cameraSlot(c);
        const sky = c.bound.slots.sky?.resource as Sky | undefined;
        // A atmosfera como meio (R21): com a tabela da câmera ativa escrita (o `SkyAerialFlow`, antes nesta fase).
        const medium = sky !== undefined && sky.aerial && cameraSlot !== undefined;
        this.fogCount = fogs.length;
        this.active = (fogs.length > 0 || medium) && cameraSlot !== undefined;
        // As grades sob demanda: alocadas com a primeira névoa (ou o meio), antes de as contribuições lerem.
        if (fogs.length > 0 || medium)
            for (const id of GRIDS) this.resources.ensureAllocated(froxels, id);
        froxels.setActive(fogs.length > 0);
        froxels.setMedium(medium);
        this.dispatchBuffer = this.resources.bufferOf(froxels, 'dispatch') as
            | IndirectBufferSpec
            | undefined;
        sky?.setNear(medium);
        if (fogs.length === 0 && !medium) return;
        const format = c.bound.slots.froxelHistory.format ?? 'rgba16float';
        if (format !== this.historyFormat) {
            // Outro formato do histórico (a precisão, realocada pela C2): o acúmulo que o escreve é outro.
            if (this.historyFormat !== undefined) c.release(resolveId(this.historyFormat));
            this.historyFormat = format;
            c.prepare(compute(resolveId(format), froxelResolveFor(format), 'froxel_resolve_main'));
        }
        this.resources.ensurePool(Light.schema);
        const views = (['scatter', 'ambient', 'current', 'state', 'open'] as const).map((id) =>
            c.bound.slots.froxels.textureViewOf(id),
        );
        if (views.some((v) => v === undefined)) {
            this.active = false;
            return;
        }
        if (views.some((v, k) => v !== this.views[k])) {
            this.views = views;
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [R.scatterOut, views[0]!],
                    [R.ambientOut, views[1]!],
                    [R.currentOut, views[2]!],
                    [R.stateOut, views[3]!],
                    [R.openOut, views[4]!],
                ]),
            );
            if (!this.prepared) {
                for (const p of [AMBIENT, INTEGRATE, DECIDE]) c.prepare(p);
                this.prepared = true;
            }
        }
        this.syncFunctions(
            c,
            froxels,
            fogs.map((e) => e.get(FogVolume)),
        );
        this.writeMedia(froxels, fogs);
        if (cameraSlot !== undefined)
            this.writeParams(
                c,
                froxels,
                fogs.map((e) => e.get(FogVolume)),
                cameraSlot,
                medium ? sky.mediumRange : 0,
            );
    }

    /** As funções de densidade dos volumes (uma por código), publicadas nos `Froxels`, e as injeções compostas com elas. */
    private syncFunctions(c: Ctx, froxels: Froxels, fogs: readonly FogVolume[]): void {
        if (this.nextInjectRevision !== undefined) {
            if (c.bound.pipelines.get(injectId(this.nextInjectRevision))?.ready === true) {
                if (this.injectRevision !== undefined) c.release(injectId(this.injectRevision));
                this.injectRevision = this.nextInjectRevision;
                this.nextInjectRevision = undefined;
            }
        }
        const list: CompositeFunction[] = [];
        for (const fog of fogs) {
            const composite = fog.densityFunction?.composite;
            if (composite !== undefined && !list.some((f) => f.module === composite.module))
                list.push(composite);
        }
        const modules = list.map((f) => f.module);
        const same =
            this.injectRevision !== undefined
            && modules.length === this.functionModules.length
            && modules.every((m, k) => m === this.functionModules[k]);
        if (same) return;
        this.functionModules = modules;
        froxels.setDensityFunctions(list);
        const revision = ++this.revision;
        if (this.nextInjectRevision !== undefined) c.release(injectId(this.nextInjectRevision));
        c.prepare(
            compute(injectId(revision), froxels.withDensity(froxelInject), 'froxel_inject_main'),
        );
        if (this.injectRevision === undefined) this.injectRevision = revision;
        else this.nextInjectRevision = revision;
    }

    /** A revisão das injeções prontas: a nova assim que compila, senão a atual. */
    private readyInject(bound: BoundFlow<FroxelSlots>): number | undefined {
        const ready = (revision: number | undefined): boolean =>
            revision !== undefined
            && (() => {
                const p = bound.pipelines.get(injectId(revision));
                return p?.role === 'compute' && p.ready;
            })();
        if (ready(this.nextInjectRevision)) return this.nextInjectRevision;
        return ready(this.injectRevision) ? this.injectRevision : undefined;
    }

    /**
     * O buffer dos meios: o cabeçalho, um registro por volume (o índice da função na composição e o slot do registro
     * dela, o primeiro valor da grade) e o lugar das grades (copiadas a cada quadro). Escrito só quando muda.
     */
    private writeMedia(froxels: Froxels, fogs: readonly EntityEntry[]): void {
        const records = 1 + fogs.length * RECORD_VEC4;
        let words = records * 4;
        const grids: { fog: FogVolume; first: number; count: number }[] = [];
        for (const e of fogs) {
            const fog = e.get(FogVolume);
            const count = fog.data.grid.length;
            if (count === 0) continue;
            grids.push({ fog, first: words, count });
            words += Math.ceil(count / 4) * 4;
        }
        const grew = froxels.reserve(Math.max(1, words / 4));
        const buffer = this.resources.bufferOf(froxels, 'media');
        if (buffer === undefined) {
            this.mediaBuffer = undefined;
            return;
        }
        const f = new Float32Array(records * 4);
        const u = new Uint32Array(f.buffer);
        u[0] = fogs.length;
        fogs.forEach((e, k) => {
            const fog = e.get(FogVolume);
            const d = fog.data;
            const b = (1 + k * RECORD_VEC4) * 4;
            const fn = fog.densityFunction;
            const index =
                fn?.composite === undefined
                    ? 0
                    : this.functionModules.indexOf(fn.composite.module) + 1;
            const fnSlot =
                fn === undefined
                    ? 0
                    : (this.resources.poolSlotOf(fn.getDescriptors()[0]!.schema!.name, e.entityId)
                      ?? 0);
            u.set([d.shape, d.density, Math.max(index, 0), 0], b);
            f.set([d.center[0]!, d.center[1]!, d.center[2]!, d.edge], b + 4);
            f.set([d.extent[0]!, d.extent[1]!, d.extent[2]!, 0], b + 8);
            f.set([d.extinction, d.anisotropy, 0, 0], b + 12);
            f.set([d.albedo[0]!, d.albedo[1]!, d.albedo[2]!, 1], b + 16);
            f.set([d.emission[0]!, d.emission[1]!, d.emission[2]!, 0], b + 20);
            u.set([d.gridSize[0]!, d.gridSize[1]!, d.gridSize[2]!, 0], b + 24);
            u.set([fnSlot, grids.find((g) => g.fog === fog)?.first ?? 0, 0, 0], b + 28);
        });
        this.grids = [];
        for (const g of grids) {
            const src = this.resources.bufferOf(g.fog, 'grid');
            if (src !== undefined)
                this.grids.push({ buffer: src, bytes: g.count * 4, offset: g.first * 4 });
        }
        // O buffer novo (realocado) recebe tudo de novo; senão, só quando os registros mudam.
        const key = u.join(',');
        const fresh = buffer !== this.mediaBuffer || grew;
        this.mediaBuffer = buffer;
        if (!fresh && key === this.mediaWritten) return;
        this.mediaWritten = key;
        this.resources.writeNow(froxels, 'media', f);
    }

    /**
     * O uniform do quadro: a grade e a câmera, as fatias até o volume mais distante (e, com o meio contínuo, até o alcance
     * dele, `range` m: a profundidade da vista da última fatia), o jitter e as contagens.
     */
    private writeParams(
        c: Ctx,
        froxels: Froxels,
        fogs: readonly FogVolume[],
        cameraSlot: number,
        range: number,
    ): void {
        const camera = c.bound.slots.camera?.resource as Camera | undefined;
        const eye = this.cameraPosition(c);
        let far = FROXEL_NEAR * 4;
        for (const fog of fogs) {
            const d = fog.data;
            let corner = 0;
            for (let k = 0; k < 3; k++)
                corner += (Math.abs((eye[k] ?? 0) - d.center[k]!) + d.extent[k]!) ** 2;
            far = Math.max(far, Math.sqrt(corner));
        }
        far = Math.min(far, camera?.data.far ?? far);
        // Arredondada para cima em passos de 25 %: a câmera andando não muda as fatias a cada quadro.
        const step = Math.ceil(Math.log(far / FROXEL_NEAR) / Math.log(FAR_STEP));
        far = FROXEL_NEAR * FAR_STEP ** step;
        // O meio contínuo (R21) até o alcance dele (fixo: as fatias não mudam com a câmera andando), até o plano distante.
        if (range > 0) far = Math.max(far, Math.min(range, camera?.data.far ?? range));
        // O histórico vale se a fatia anterior foi escrita no quadro imediatamente anterior (a reprojeção usa a câmera
        // desse quadro)
        // e as fatias da grade não mudaram (nem a resolução dela: o perfil do `Renderer` realoca as grades).
        const grid = froxels.grid.join(',');
        const valid =
            c.bound.slots.froxelHistory.age(1) === 1
            && far === this.farKey
            && grid === this.gridKey;
        this.farKey = far;
        this.gridKey = grid;
        const n = this.frame + 1;
        const time = (c.bound.slots.time?.resource as Time | undefined)?.simulated ?? 0;
        froxels.data.params = [
            {
                grid: [froxels.grid[0], froxels.grid[1], froxels.grid[2], cameraSlot],
                depth: [FROXEL_NEAR, far, Math.log(far / FROXEL_NEAR), this.active ? 1 : 0],
                frame: [halton(n, 2), halton(n, 3), halton(n, 5), time],
                // w: bit 0, o histórico vale; bit 1, o alcance do quadro anterior foi escrito (spec 041, R21).
                counts: [
                    fogs.length,
                    this.resources.poolCount(Light.schema.name),
                    this.frame,
                    (valid ? 1 : 0) | (c.bound.slots.froxelReach.age(1) === 1 ? 2 : 0),
                ],
            },
        ];
    }

    /** Slot da câmera ativa no pool `CameraMatrices` (sem câmera, nenhum). */
    private cameraSlot(c: Ctx): number | undefined {
        const camera = c.bound.slots.camera?.resource;
        const id = camera === undefined ? undefined : this.world.entityIdOfResource(camera);
        return id === undefined ? undefined : c.bound.slots.cameras?.slotOf(id);
    }

    /** Posição de mundo da câmera ativa (o `Transform` da entidade dela). */
    private cameraPosition(c: Ctx): readonly number[] {
        const camera = c.bound.slots.camera?.resource;
        const id = camera === undefined ? undefined : this.world.entityIdOfResource(camera);
        const transform =
            id === undefined
                ? undefined
                : this.world.resourcesOf(id).find((r): r is Transform => r instanceof Transform);
        return transform?.data.position ?? [0, 0, 0, 1];
    }
}
