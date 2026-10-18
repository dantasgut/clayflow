import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    StorageBufferSpec,
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
import { Transform } from '../scene/Transform';
import { FogVolume } from './FogVolume';
import { Froxels } from './Froxels';
import { FROXEL_AMBIENT_GRID, FROXEL_GRID, FROXEL_NEAR } from './schemas';
import { froxelAmbient, froxelInject, froxelIntegrate, mediaResources as R } from './shaders';

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
}

const slots: FroxelSlots = {
    froxels: slot.singleton(Froxels.schema),
    fogs: slot.entities({ all: [FogVolume] }),
    camera: slot.singleton(Camera.schema, { optional: true }),
    cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
    time: slot.singleton(Time.schema, { optional: true }),
};

type Ctx = TransitionContext<FroxelSlots>;

const compute = (id: string, shader: WgslModule, entry: string): PipelineDescriptor => ({
    id,
    role: 'compute',
    shader,
    entryPoints: [entry],
});

const AMBIENT = compute('froxel_ambient', froxelAmbient, 'froxel_ambient_main');
const INTEGRATE = [
    compute('froxel_integrate_0', froxelIntegrate[0], 'froxel_integrate_main'),
    compute('froxel_integrate_1', froxelIntegrate[1], 'froxel_integrate_main'),
] as const;
/** Ids das injeções compostas com as funções de densidade de uma revisão (uma por paridade). */
const injectIds = (revision: number): readonly [string, string] => [
    `froxel_inject_0:${revision}`,
    `froxel_inject_1:${revision}`,
];
/** vec4f de um registro de volume no buffer dos meios. */
const RECORD_VEC4 = 8;
/** Passo (razão) em que a distância da última fatia é arredondada: mudanças menores não invalidam o histórico. */
const FAR_STEP = 1.25;

/** Sequência de Halton na base `b` (o jitter dos froxels). */
function halton(i: number, b: number): number {
    let f = 1;
    let r = 0;
    for (let n = i; n > 0; n = Math.floor(n / b)) {
        f /= b;
        r += f * (n % b);
    }
    return r;
}

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
 * ambiente e a luz rebatida, a emissão) acumulada no histórico reprojetado, e a integração da frente para trás que o
 * desenho lê (`scene_fog`). As funções de densidade da cena são compostas na injeção; uma mudança no conjunto prepara
 * kernels novos, que entram quando compilam. Sem névoa ou sem câmera, nada.
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
    /** A vista e a vista-projeção do quadro anterior (a reprojeção). */
    private readonly cameraBuffer: StorageBufferSpec;
    private views: readonly (TextureViewSpec | undefined)[] = [];
    private prepared = false;
    private revision = 0;
    private injectRevision: number | undefined;
    private nextInjectRevision: number | undefined;
    private functionModules: readonly WgslModule[] = [];
    private mediaWritten = '';
    private mediaBuffer: AnyBufferSpec | undefined;
    private grids: GridCopy[] = [];
    private frame = 0;
    private farStep: number | undefined;
    /** O quadro anterior despachou (o histórico vale). */
    private ran = false;
    private active = false;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        this.cameraBuffer = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'froxel_camera',
            byteSize: 128,
        });
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

    /** As grades no buffer dos meios, a luz ambiente, a injeção com o acúmulo e a integração, num passe. */
    dispatch(frame: Frame, bound: BoundFlow<FroxelSlots>): void {
        if (!this.active) {
            this.ran = false;
            return;
        }
        const revision = this.readyInject(bound);
        const parity = this.frame & 1;
        const inject =
            revision === undefined ? undefined : bound.pipelines.get(injectIds(revision)[parity]!);
        const integrate = bound.pipelines.get(INTEGRATE[parity]!.id);
        const ambient = bound.pipelines.get(AMBIENT.id);
        if (
            ambient?.role !== 'compute'
            || !ambient.ready
            || inject?.role !== 'compute'
            || !inject.ready
            || integrate?.role !== 'compute'
            || !integrate.ready
            || this.mediaBuffer === undefined
        ) {
            this.ran = false;
            return;
        }
        for (const g of this.grids) frame.copy(g.buffer, this.mediaBuffer, g.bytes, 0, g.offset);
        const W = WORKGROUP_SIZE.value;
        frame.compute('FroxelFlow', (pass) => {
            pass.bind.setPipeline(ambient.spec);
            ambient.bindTo(pass.bind);
            pass.dispatch.invocations(
                FROXEL_AMBIENT_GRID[0] * FROXEL_AMBIENT_GRID[1] * FROXEL_AMBIENT_GRID[2],
                W,
            );
            pass.bind.setPipeline(inject.spec);
            inject.bindTo(pass.bind);
            pass.dispatch.invocations(FROXEL_GRID[0] * FROXEL_GRID[1] * FROXEL_GRID[2], W);
            pass.bind.setPipeline(integrate.spec);
            integrate.bindTo(pass.bind);
            pass.dispatch.invocations(FROXEL_GRID[0] * FROXEL_GRID[1], W);
        });
        this.ran = true;
        this.frame++;
    }

    /** Libera o buffer da câmera guardada. */
    override dispose(): void {
        this.core.destroy(this.cameraBuffer);
    }

    private prepare(c: Ctx): void {
        const froxels = c.bound.slots.froxels.resource as Froxels;
        const fogs = c.bound.slots.fogs.entries;
        const cameraSlot = this.cameraSlot(c);
        this.active = fogs.length > 0 && cameraSlot !== undefined;
        froxels.setActive(fogs.length > 0);
        if (fogs.length === 0) return;
        this.resources.ensurePool(Light.schema);
        const views = (['history0', 'history1', 'scatter', 'ambient'] as const).map((id) =>
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
                    [R.historyOut0, views[0]!],
                    [R.historyOut1, views[1]!],
                    [R.scatterOut, views[2]!],
                    [R.ambientOut, views[3]!],
                    [R.camera, this.cameraBuffer],
                    [R.cameraWrite, this.cameraBuffer],
                ]),
            );
            this.ran = false;
            if (!this.prepared) {
                for (const p of [AMBIENT, ...INTEGRATE]) c.prepare(p);
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
            );
    }

    /** As funções de densidade dos volumes (uma por código), publicadas nos `Froxels`, e as injeções compostas com elas. */
    private syncFunctions(c: Ctx, froxels: Froxels, fogs: readonly FogVolume[]): void {
        if (this.nextInjectRevision !== undefined) {
            const next = injectIds(this.nextInjectRevision).map((id) => c.bound.pipelines.get(id));
            if (next.every((p) => p?.ready === true)) {
                if (this.injectRevision !== undefined)
                    for (const id of injectIds(this.injectRevision)) c.release(id);
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
        if (this.nextInjectRevision !== undefined)
            for (const id of injectIds(this.nextInjectRevision)) c.release(id);
        const [id0, id1] = injectIds(revision);
        c.prepare(compute(id0, froxels.withDensity(froxelInject[0]), 'froxel_inject_main'));
        c.prepare(compute(id1, froxels.withDensity(froxelInject[1]), 'froxel_inject_main'));
        if (this.injectRevision === undefined) this.injectRevision = revision;
        else this.nextInjectRevision = revision;
    }

    /** A revisão das injeções prontas: a nova assim que compila, senão a atual. */
    private readyInject(bound: BoundFlow<FroxelSlots>): number | undefined {
        const ready = (revision: number | undefined): boolean =>
            revision !== undefined
            && injectIds(revision).every((id) => {
                const p = bound.pipelines.get(id);
                return p?.role === 'compute' && p.ready;
            });
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
        this.core.write(buffer, f);
    }

    /** O uniform do quadro: a grade e a câmera, as fatias até o volume mais distante, o jitter e as contagens. */
    private writeParams(
        c: Ctx,
        froxels: Froxels,
        fogs: readonly FogVolume[],
        cameraSlot: number,
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
        const valid = this.ran && step === this.farStep;
        this.farStep = step;
        const n = this.frame + 1;
        const time = (c.bound.slots.time?.resource as Time | undefined)?.simulated ?? 0;
        froxels.data.params = [
            {
                grid: [FROXEL_GRID[0], FROXEL_GRID[1], FROXEL_GRID[2], cameraSlot],
                depth: [FROXEL_NEAR, far, Math.log(far / FROXEL_NEAR), this.active ? 1 : 0],
                frame: [halton(n, 2), halton(n, 3), halton(n, 5), time],
                counts: [
                    fogs.length,
                    this.resources.poolCount(Light.schema.name),
                    this.frame,
                    valid ? 1 : 0,
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
