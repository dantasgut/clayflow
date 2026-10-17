import type { BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { BindingSource } from '../../scene/flows/FlowBinding';
import type {
    ComputePass,
    EngineCore,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { EntityId } from '../../scene/world/EntityId';
import { Flow } from '../../scene/flows/Flow';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { slot, type EntitiesSlot, type SingletonSlot, type SlotMap } from '../../scene/flows/slots';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../scene/flows/createComputeKernel';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { CountToArgs } from '../gpu/compute/CountToArgs';
import { PerStepUniforms } from '../gpu/compute/PerStepUniforms';
import { SpatialHashGrid } from '../gpu/compute/SpatialHashGrid';
import { FluidSurfaceMaterial } from '../material/FluidSurfaceMaterial';
import { ParticleBody } from '../physics/bodies/ParticleBody';
import { ParticleMaterial } from '../physics/materials/ParticleMaterial';
import { SET_COUNT_DISPATCH_OFFSET } from '../../scene/graph/SetCountSchema';
import { FIELD } from './reference/field';
import { FluidField, fieldDataLayout } from './FluidField';
import { FIELD_BRICK_VOXELS, FIELD_PARTICLES_PER_BRICK, FieldGatherSchema } from './schemas';
import {
    fieldApron,
    fieldDensity,
    fieldGather,
    fieldKernels,
    fieldLinks,
    fieldMark,
    fieldRedistance,
    fieldResources as R,
} from './shaders';

/** Slots do estágio do campo. */
export interface FluidFieldSlots extends SlotMap {
    /** O campo da cena (inserido pelos estágios padrão). */
    readonly field: SingletonSlot<false>;
    /** Os corpos de partículas com superfície de fluido. */
    readonly bodies: EntitiesSlot;
    /** O material das partículas (o espaçamento). */
    readonly particleMaterial: SingletonSlot<true>;
}

const slots: FluidFieldSlots = {
    field: slot.singleton(FluidField.schema),
    bodies: slot.entities({ all: [ParticleBody, FluidSurfaceMaterial] }),
    particleMaterial: slot.singleton(ParticleMaterial.schema, { optional: true }),
};

type Ctx = TransitionContext<FluidFieldSlots>;

/** Corpo de água acompanhado. */
interface FieldBody {
    readonly entity: EntityId;
    readonly body: ParticleBody;
    readonly material: FluidSurfaceMaterial;
    readonly poolKey: string;
}

/** Buffers de trabalho (por capacidade de partículas e de blocos). */
interface Work {
    readonly particles: number;
    readonly bricks: number;
    readonly items: StorageBufferSpec;
    readonly sorted: StorageBufferSpec;
    readonly kernel: StorageBufferSpec;
    readonly links: StorageBufferSpec;
    readonly density: StorageBufferSpec;
    readonly phi0: StorageBufferSpec;
    readonly phiA: StorageBufferSpec;
}

/** Kernels do quadro (refeitos quando um buffer muda). */
interface Kernels {
    readonly key: string;
    readonly gather: Map<string, ComputeKernel>;
    /** As partículas na ordem das células (depois da grade). */
    readonly sort: ComputeKernel;
    readonly kernels: ComputeKernel;
    readonly clear: ComputeKernel;
    readonly mark: ComputeKernel;
    readonly links: ComputeKernel;
    readonly density: ComputeKernel;
    /** Filtro separável da densidade: B (ponto fixo) → A → P → A. */
    readonly smooth: readonly ComputeKernel[];
    /** Filtrada (A) → φ inicial (P). */
    readonly init: ComputeKernel;
    /** φ inicial (P) → interface e sinais (A) e a primeira distância (B). */
    readonly classify: ComputeKernel;
    /** Iterações da eikonal B → P e P → B. */
    readonly forward: ComputeKernel;
    readonly backward: ComputeKernel;
    readonly apron: ComputeKernel;
}

/** Espaçamento padrão das partículas quando a cena não tem `ParticleMaterial`. */
const DEFAULT_SPACING = 0.05;

/**
 * FluidFieldFlow — o campo dos fluidos na GPU a cada quadro (spec 033, R11), depois da física e antes da estrutura de
 * raios. As partículas dos corpos com `FluidSurfaceMaterial` vão a um array compacto; a grade hash dá os vizinhos; os
 * núcleos anisotrópicos (Yu & Turk) saem da covariância; os blocos de 8³ cobertos pelos núcleos entram na tabela do
 * `FluidField` (contagem só na GPU); a densidade nos voxels, o φ inicial, as iterações do redistanciamento e os voxels
 * com a borda — os quatro por despacho indireto, um grupo por bloco. Nenhuma leitura de volta. Sem água, nada.
 */
export class FluidFieldFlow extends Flow<FluidFieldSlots, 'idle'> {
    readonly type = 'FluidFieldFlow';
    readonly slots = slots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private readonly bodies = new Map<EntityId, FieldBody>();
    private readonly draws: PerStepUniforms;
    private readonly grid: SpatialHashGrid;
    /** Volume do campo somado no quadro (lido pela limpeza do seguinte: o nível que conserva o volume). */
    private readonly volume: StorageBufferSpec;
    private readonly args: CountToArgs;
    private order: FieldBody[] = [];
    /** Conteúdo escrito nas regiões da junção e no uniform do campo (escritos quando mudam, não por quadro). */
    private drawsWritten = '';
    private paramsWritten = '';
    private work: Work | undefined;
    private kernels: Kernels | undefined;
    private field: FluidField | undefined;
    private particles = 0;
    private active = false;
    private readonly ids = new WeakMap<object, number>();
    private nextId = 0;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.draws = new PerStepUniforms(ctx.core, {
            discriminator: 'field_gather',
            schema: FieldGatherSchema,
        });
        this.draws.reserve(1);
        this.grid = new SpatialHashGrid(ctx.core, {
            discriminator: 'field_grid',
            label: 'FluidFieldFlow.grid',
        });
        this.args = new CountToArgs(ctx.core, { discriminator: 'field_args' });
        this.volume = ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'field_volume',
            byteSize: 16,
        });
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.track(
                            c,
                            c.bound.slots.bodies.entries.map((e) => e.entityId),
                            [],
                        );
                    },
                },
                entitiesChanged: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type !== 'entitiesChanged') return;
                        this.track(c, e.added, e.removed);
                    },
                },
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
            },
        };
    }

    /** Grava a construção do campo. */
    dispatch(frame: Frame, _bound: BoundFlow<FluidFieldSlots>): void {
        const k = this.kernels;
        const work = this.work;
        const field = this.field;
        const counts = field === undefined ? undefined : this.counts(field);
        if (!this.active || k === undefined || work === undefined || counts === undefined) return;
        const W = WORKGROUP_SIZE.value;
        frame.compute('FluidFieldFlow.gather', (pass) => {
            this.order.forEach((b, i) => {
                const kernel = k.gather.get(b.poolKey);
                if (kernel === undefined) return;
                pass.bind.setPipeline(kernel.pipeline);
                kernel.bindTo(pass.bind, { draw: [this.draws.offset(i)] });
                pass.dispatch.invocations(b.body.count, W);
            });
        });
        this.grid.record(frame);
        const table = field!.capacity.table;
        frame.compute('FluidFieldFlow.kernels', (pass) => {
            this.run(pass, k.sort, this.particles, W);
            this.run(pass, k.kernels, this.particles, W);
        });
        frame.compute('FluidFieldFlow.mark', (pass) => {
            this.run(pass, k.clear, table + 1, W);
            this.run(pass, k.mark, this.particles, W);
            this.run(pass, k.links, work.bricks, W);
        });
        this.args.record(frame, { counts, index: 0, workgroupSize: 1 });
        // A densidade é somada em ponto fixo: o buffer (também o segundo do redistanciamento) começa zerado.
        frame.clear(work.density);
        frame.compute('FluidFieldFlow.density', (pass) => {
            this.run(pass, k.density, this.particles, W);
        });
        const indirect = (label: string, kernels: readonly ComputeKernel[]): void => {
            frame.compute(label, (pass) => {
                for (const kernel of kernels) {
                    pass.bind.setPipeline(kernel.pipeline);
                    kernel.bindTo(pass.bind);
                    pass.dispatch.workgroupsIndirect(counts, SET_COUNT_DISPATCH_OFFSET);
                }
            });
        };
        indirect('FluidFieldFlow.smooth', k.smooth);
        indirect('FluidFieldFlow.init', [k.init, k.classify]);
        indirect(
            'FluidFieldFlow.redistance',
            Array.from({ length: FIELD.iterations }, (_, n) =>
                n % 2 === 0 ? k.forward : k.backward,
            ),
        );
        indirect('FluidFieldFlow.apron', [k.apron]);
    }

    /** Libera buffers e kernels. */
    override dispose(): void {
        this.releaseKernels();
        this.releaseWork();
        this.grid.destroy();
        this.core.destroy(this.volume);
        this.draws.dispose();
    }

    private run(pass: ComputePass, kernel: ComputeKernel, count: number, size: number): void {
        if (count <= 0) return;
        pass.bind.setPipeline(kernel.pipeline);
        kernel.bindTo(pass.bind);
        pass.dispatch.invocations(count, size);
    }

    /** Corpos que entraram e saíram. */
    private track(ctx: Ctx, added: readonly EntityId[], removed: readonly EntityId[]): void {
        for (const id of removed) this.bodies.delete(id);
        const entries = ctx.bound.slots.bodies;
        for (const id of added) {
            const entry = entries.entry(id);
            if (entry === undefined) continue;
            const body = entry.get(ParticleBody);
            const material = entry.get(FluidSurfaceMaterial);
            const poolKey = this.resources.poolKeyForResource(body);
            if (poolKey === undefined) continue;
            this.bodies.set(id, { entity: id, body, material, poolKey });
        }
    }

    /** O registro da contagem dos blocos (descritor indireto do campo). */
    private counts(field: FluidField): IndirectBufferSpec | undefined {
        const buffer = this.resources.bufferOf(field, 'counts');
        return buffer?.subkind === 'indirect' ? buffer : undefined;
    }

    private buffer(field: FluidField, id: string): StorageBufferSpec | undefined {
        const buffer = this.resources.bufferOf(field, id);
        return buffer?.subkind === 'storage' ? buffer : undefined;
    }

    /** Antes da gravação: capacidades, buffers, grade, regiões, parâmetros e kernels. */
    private prepare(ctx: Ctx): void {
        const field = ctx.bound.slots.field.resource as FluidField;
        this.field = field;
        this.order = [...this.bodies.values()].filter((b) => b.body.count > 0);
        this.particles = this.order.reduce((n, b) => n + b.body.count, 0);
        this.active = this.particles > 0;
        field.setVolume(this.active);
        if (!this.active) return;
        const bricks = Math.max(64, Math.ceil(this.particles / FIELD_PARTICLES_PER_BRICK));
        field.reserve({ bricks, table: bricks * 4 });
        const capacity = field.capacity.bricks;
        const counts = this.counts(field);
        const data = this.buffer(field, 'data');
        if (counts === undefined || data === undefined) {
            this.active = false;
            return;
        }
        const work = this.ensureWork(this.particles, capacity);
        const spacing =
            (ctx.bound.slots.particleMaterial?.resource as ParticleMaterial | undefined)?.data
                .particleSpacing ?? DEFAULT_SPACING;
        const radius = FIELD.radius * spacing;
        const gridRebuilt = this.grid.prepare(work.items, this.particles, radius);
        this.args.prepare(counts);
        this.writeDraws();
        const layout = fieldDataLayout(field.capacity);
        const params: [Record<string, number[]>] = [
            {
                sizes: [this.particles, capacity, field.capacity.table - 1, FIELD.iterations],
                grid: [spacing, FIELD.voxel * spacing, radius, FIELD.band * FIELD.voxel * spacing],
                tuning: [FIELD.smoothing, FIELD.ratio, FIELD.sparse, FIELD.iso],
                limits: [FIELD.neighbors, 32, layout.bricks, layout.voxels],
            },
        ];
        const paramsKey = JSON.stringify(params);
        if (paramsKey !== this.paramsWritten) {
            this.paramsWritten = paramsKey;
            field.data.params = params;
        }
        this.ensureKernels(field, work, counts, data, gridRebuilt);
    }

    /** Regiões da junção, uma por corpo. */
    private writeDraws(): void {
        const grown = this.draws.reserve(Math.max(1, this.order.length));
        let base = 0;
        const regions = this.order.map((b) => {
            const range = this.resources.poolRangeOf(b.poolKey, b.entity);
            const schema = b.body.particleSchema;
            const materialSlot =
                this.resources.poolSlotOf(FluidSurfaceMaterial.schema.name, b.entity) ?? 0;
            const region = {
                first: range?.first ?? 0,
                strideVec4: schema.stride / 16,
                posOffsetVec4: schema.offsetOf('pos') / 16,
                count: b.body.count,
                base,
                materialSlot: materialSlot + 1,
            };
            base += b.body.count;
            return region;
        });
        const key = JSON.stringify(regions);
        if (!grown && key === this.drawsWritten) return;
        this.drawsWritten = key;
        regions.forEach((region, i) => {
            this.draws.write(i, region);
        });
        this.draws.flush(this.order.length);
    }

    private ensureWork(particles: number, bricks: number): Work {
        const w = this.work;
        if (w !== undefined && w.particles >= particles && w.bricks === bricks) return w;
        this.releaseKernels();
        this.releaseWork();
        let cap = Math.max(256, w?.particles ?? 0);
        while (cap < particles) cap *= 2;
        const storage = (name: string, bytes: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `field_${name}`,
                byteSize: Math.max(16, bytes),
            });
        this.work = {
            particles: cap,
            bricks,
            items: storage('items', cap * 16),
            sorted: storage('sorted', cap * 16),
            kernel: storage('kernel', cap * 48),
            links: storage('links', bricks * 28 * 4),
            density: storage('density', bricks * FIELD_BRICK_VOXELS * 4),
            phi0: storage('phi0', bricks * FIELD_BRICK_VOXELS * 4),
            phiA: storage('phi_a', bricks * FIELD_BRICK_VOXELS * 4),
        };
        return this.work;
    }

    /** Kernels com os buffers atuais (refeitos quando algum muda). */
    private ensureKernels(
        field: FluidField,
        work: Work,
        counts: IndirectBufferSpec,
        data: StorageBufferSpec,
        gridRebuilt: boolean,
    ): void {
        const pools = this.order.map(
            (b) => `${b.poolKey}:${this.identity(this.resources.poolBufferSpec(b.poolKey))}`,
        );
        const key = [work.items, data, counts]
            .map((b) => String(this.identity(b)))
            .concat([String(this.draws.generation), ...pools])
            .join('|');
        if (this.kernels?.key === key && !gridRebuilt) return;
        this.releaseKernels();
        const params = this.resources.bufferOf(field, 'params') as BindingSource;
        const gridSources: [WgslResource, BindingSource][] = [
            [R.grid, this.grid.params],
            [R.cellStart, this.grid.cellStart],
            [R.cellCount, this.grid.cellCount],
        ];
        const make = (
            name: string,
            shader: WgslModule,
            entryPoint: string,
            sources: [WgslResource, BindingSource][],
        ): ComputeKernel =>
            createComputeKernel(this.core, {
                discriminator: `field:${name}`,
                shader,
                entryPoint,
                bindings: new Map<WgslResource, BindingSource>([[R.params, params], ...sources]),
            });
        const gather = new Map<string, ComputeKernel>();
        for (const b of this.order) {
            if (gather.has(b.poolKey)) continue;
            const pool = this.resources.poolBufferSpec(b.poolKey);
            const live = this.resources.poolLiveBuffer(b.poolKey);
            if (pool === undefined || live === undefined) continue;
            gather.set(
                b.poolKey,
                createComputeKernel(this.core, {
                    discriminator: `field:gather:${b.poolKey}`,
                    shader: fieldGather,
                    entryPoint: 'field_gather_main',
                    bindings: new Map<WgslResource, BindingSource>([
                        [R.gather, this.draws.source()],
                        [R.particles, pool],
                        [R.live, live],
                        [R.itemsWrite, work.items],
                    ]),
                }),
            );
        }
        const eikonal = (
            src: StorageBufferSpec,
            dst: StorageBufferSpec,
            name: string,
        ): ComputeKernel =>
            make(name, fieldRedistance, 'field_eikonal_main', [
                [R.counts, counts],
                [R.links, work.links],
                [R.flags, work.phiA],
                [R.src, src],
                [R.dst, dst],
            ]);
        this.kernels = {
            key,
            gather,
            sort: make('sort', fieldGather, 'field_sort_main', [
                [R.cellItems, this.grid.cellItems],
                [R.itemsWrite, work.items],
                [R.sortedWrite, work.sorted],
            ]),
            kernels: make('kernels', fieldKernels, 'field_kernels_main', [
                ...gridSources,
                [R.sorted, work.sorted],
                [R.kernelWrite, work.kernel],
            ]),
            clear: make('clear', fieldMark, 'field_clear_main', [
                [R.dataAtomic, data],
                [R.countsWrite, counts],
                [R.volumeWrite, this.volume],
            ]),
            mark: make('mark', fieldMark, 'field_mark_main', [
                [R.sorted, work.sorted],
                [R.kernel, work.kernel],
                [R.dataAtomic, data],
                [R.countsWrite, counts],
            ]),
            links: make('links', fieldLinks, 'field_links_main', [
                [R.data, data],
                [R.counts, counts],
                [R.linksWrite, work.links],
            ]),
            density: make('density', fieldDensity, 'field_density_main', [
                [R.data, data],
                [R.sorted, work.sorted],
                [R.kernel, work.kernel],
                [R.densityWrite, work.density],
            ]),
            smooth: [
                make('smooth_x', fieldRedistance, 'field_smooth_x_main', [
                    [R.counts, counts],
                    [R.links, work.links],
                    [R.density, work.density],
                    [R.dst, work.phiA],
                ]),
                make('smooth_y', fieldRedistance, 'field_smooth_y_main', [
                    [R.counts, counts],
                    [R.links, work.links],
                    [R.src, work.phiA],
                    [R.dst, work.phi0],
                ]),
                make('smooth_z', fieldRedistance, 'field_smooth_z_main', [
                    [R.counts, counts],
                    [R.links, work.links],
                    [R.src, work.phi0],
                    [R.dst, work.phiA],
                ]),
            ],
            init: make('init', fieldRedistance, 'field_init_main', [
                [R.counts, counts],
                [R.links, work.links],
                [R.src, work.phiA],
                [R.phi0, work.phi0],
                [R.data, data],
            ]),
            classify: make('classify', fieldRedistance, 'field_classify_main', [
                [R.counts, counts],
                [R.links, work.links],
                [R.phi0, work.phi0],
                [R.flags, work.phiA],
                [R.dst, work.density],
            ]),
            forward: eikonal(work.density, work.phi0, 'eikonal_bp'),
            backward: eikonal(work.phi0, work.density, 'eikonal_pb'),
            apron: make('apron', fieldApron, 'field_apron_main', [
                [R.counts, counts],
                [R.links, work.links],
                [R.src, FIELD.iterations % 2 === 0 ? work.density : work.phi0],
                [R.dataVoxels, data],
                [R.volumeWrite, this.volume],
            ]),
        };
    }

    /** Identidade estável de um objeto de GPU (para saber quando um buffer foi trocado). */
    private identity(o: object | undefined): number {
        if (o === undefined) return -1;
        let id = this.ids.get(o);
        if (id === undefined) this.ids.set(o, (id = this.nextId++));
        return id;
    }

    private releaseKernels(): void {
        const k = this.kernels;
        if (k === undefined) return;
        for (const kernel of k.gather.values()) destroyComputeKernel(this.core, kernel);
        for (const kernel of [
            k.sort,
            k.kernels,
            k.clear,
            k.mark,
            k.links,
            k.density,
            ...k.smooth,
            k.init,
            k.classify,
            k.forward,
            k.backward,
            k.apron,
        ])
            destroyComputeKernel(this.core, kernel);
        this.kernels = undefined;
    }

    private releaseWork(): void {
        const w = this.work;
        if (w === undefined) return;
        for (const b of [w.items, w.sorted, w.kernel, w.links, w.density, w.phi0, w.phiA])
            this.core.destroy(b);
        this.work = undefined;
    }
}
