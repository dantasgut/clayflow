import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type {
    ComputePass,
    EngineCore,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
} from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type PoolSlot, type SingletonSlot, type SlotMap } from '../../../scene/flows/slots';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { WgslModule } from '../../../scene/shaders/WgslModule';
import { Time } from '../../../scene/time/Time';
import type { World } from '../../../scene/world/World';
import { CountToArgs } from '../../gpu/compute/CountToArgs';
import { RayScene } from '../../raytrace/RayScene';
import { RayWave } from '../../raytrace/RayWave';
import { RayWaveEntrySchema } from '../../raytrace/wave/shaders';
import { RadixSort } from '../../gpu/compute/RadixSort';
import { SetCountSchema } from '../../../scene/graph/SetCountSchema';
import { Camera } from '../../scene/Camera';
import { Light } from '../../scene/Light';
import { Transform } from '../../scene/Transform';
import { Refraction } from './Refraction';
import {
    refractionCamera,
    refractionGradient,
    refractionQueue,
    refractionResources,
    refractionWave,
} from './shaders';
import { RefractionLeafSchema, RefractionPathSchema } from './schemas';

/** Slots do estágio da refração. */
export interface RefractionSlots extends SlotMap {
    /** A refração da cena (parâmetros e alvos). */
    readonly refraction: SingletonSlot<false>;
    /** A estrutura de raios (sem ela, o estágio não traça). */
    readonly rays: SingletonSlot<true>;
    /** A câmera ativa e o pool das matrizes (o slot dela). */
    readonly camera: SingletonSlot<true>;
    readonly cameras: PoolSlot<true>;
    /** Relógio da cena (as funções `material` nos acertos). */
    readonly time: SingletonSlot<true>;
}

const slots: RefractionSlots = {
    refraction: slot.singleton(Refraction.schema),
    rays: slot.singleton(RayScene.schema, { optional: true }),
    camera: slot.singleton(Camera.schema, { optional: true }),
    cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
    time: slot.singleton(Time.schema, { optional: true }),
};

type Ctx = TransitionContext<RefractionSlots>;

const compute = (id: string, shader: WgslModule, entry: string): PipelineDescriptor => ({
    id,
    role: 'compute',
    shader,
    entryPoints: [entry],
});

const QUEUE = compute('refraction_queue', refractionQueue, 'refraction_queue_main');
const QUEUE_COUNT = compute(
    'refraction_queue_count',
    refractionQueue,
    'refraction_queue_count_main',
);

/** Os acertos da reta da câmera na onda e os meios dela pelos fechamentos avaliados (spec 039). */
const CAMERA_HITS = compute(
    'refraction_camera_hits',
    refractionCamera,
    'refraction_camera_hits_main',
);
const CAMERA = compute('refraction_camera', refractionCamera, 'refraction_camera_main');
/** Entradas da onda da câmera: as instâncias distintas da reta e o volume (`REFRACTION_CAMERA_SEEN` + 1). */
const CAMERA_WAVE = 33;

/** A refração em ondas (spec 039, R17): a fila, as raízes, a rodada, as folhas e o fechamento por pixel. */
const WAVE_RESET = compute('refraction_wave_reset', refractionWave, 'refraction_wave_reset_main');
const WAVE_ROOTS = compute('refraction_wave_roots', refractionWave, 'refraction_wave_roots_main');
const WAVE_SWAP = compute('refraction_wave_swap', refractionWave, 'refraction_wave_swap_main');
const WAVE_HIT = compute('refraction_wave_hit', refractionWave, 'refraction_wave_hit_main');
const WAVE_FOLLOW = compute(
    'refraction_wave_follow',
    refractionWave,
    'refraction_wave_follow_main',
);
const WAVE_TRUNCATE = compute(
    'refraction_wave_truncate',
    refractionWave,
    'refraction_wave_truncate_main',
);
const WAVE_KEYS = compute('refraction_wave_keys', refractionWave, 'refraction_wave_keys_main');
const WAVE_RESOLVE = compute(
    'refraction_wave_resolve',
    refractionWave,
    'refraction_wave_resolve_main',
);
const WAVE_FIXED = [
    CAMERA_HITS,
    CAMERA,
    WAVE_RESET,
    WAVE_ROOTS,
    WAVE_SWAP,
    WAVE_HIT,
    WAVE_FOLLOW,
    WAVE_TRUNCATE,
    WAVE_KEYS,
    WAVE_RESOLVE,
];

/** Passos de um caminho no máximo (`REFRACTION_STEP_LIMIT` de `refraction_path.wgsl`). */
const STEP_LIMIT = 34;
/**
 * Rodadas da onda por quadro: o acerto da câmera, o caminho até a segunda interface (até o teto de passos e a interface)
 * e o caminho de um lobo (cada passo, e o lobo raro olhado antes dele numa rodada a mais) — o que resta vivo depois conta
 * como truncado, como o teto de passos do caminho.
 */
const WAVE_ROUNDS = 1 + (STEP_LIMIT + 1) + 2 * STEP_LIMIT;
/** Caminhos por pixel do pedido na fila (os ramos das duas primeiras interfaces); além do teto do dispositivo, menos. */
const PATHS_PER_PIXEL = 4;
/** Caminhos na fila no máximo (o orçamento de memória dela) e por bloco da onda (duas entradas por caminho). */
const WAVE_PATHS = 1 << 19;
const WAVE_CHUNK = 1 << 19;

/** Os buffers dos caminhos. */
interface PathBuffers {
    readonly slots: number;
    readonly chunk: number;
    readonly bits: number;
    readonly paths: StorageBufferSpec;
    readonly queue: StorageBufferSpec;
    readonly leaves: StorageBufferSpec;
    readonly keys: StorageBufferSpec;
    readonly values: StorageBufferSpec;
    readonly count: IndirectBufferSpec;
}

/** O kernel da mudança da cena por bloco (só lê as marcas de movimento do traçado anterior). */
const GRADIENT = compute('refraction_gradient', refractionGradient, 'refraction_gradient_main');

/**
 * Estágio da refração traçada (Camada 3, spec 034, R1): depois do pedido por pixel (o desenho dos transmissivos no
 * forward), compacta os pixels com pedido numa fila (a contagem também no estado do quadro), acha os meios em que a
 * câmera está e traça cada pixel da fila por despacho indireto — a contagem nunca volta à CPU. Os kernels que sombreiam
 * acertos compõem as funções `material` da cena (como a iluminação global) e são refeitos quando o conjunto muda (os
 * anteriores valem até os novos compilarem). Fase `forward`, depois dos opacos, dos sprites e da superfície da água,
 * antes da composição dos transmissivos e da água. Sem o pedido alocado (nenhum transmissivo desenhado com a refração),
 * sem a estrutura de raios ou desligada, não traça. Declara a cada quadro se produziu a `radiance` (a composição só
 * desenha quando sim). Com o gradiente temporal alocado (por quem filtra o traçado ou recomeça históricos), antes do
 * traçado, mede-o: a mudança da cena em cada bloco de pixels, pelas marcas de movimento que o traçado do quadro anterior
 * deixou (um caminho que tocou uma instância que se moveu), sem raio a mais.
 */
export class RefractionFlow extends Flow<RefractionSlots, 'idle'> {
    readonly type = 'RefractionFlow';
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly world: World;
    private readonly countToArgs: CountToArgs;
    /** A onda dos acertos (spec 039): os da reta da câmera e os dos caminhos. */
    private readonly wave: RayWave;
    private readonly core: EngineCore;
    private sorter: RadixSort | undefined;
    private paths: PathBuffers | undefined;
    private prepared = false;
    /** Fontes ligadas (outras = religa). */
    private bound: readonly unknown[] = [];
    /** A contagem da fila, quando ligada. */
    private queueCount: IndirectBufferSpec | undefined;
    /** Pixels do pedido (o despacho da fila). */
    private pixels = 0;
    /** Há o que traçar neste quadro (estrutura de raios, câmera, ligada). */
    private tracing = false;
    /** Revisão das funções `material` dos kernels de material da onda. */
    private materialRevision = -1;
    private frame = 0;
    /** Invocações do gradiente temporal (uma por bloco). */
    private strata = 0;
    /** O kernel do gradiente temporal, depois que um consumidor o alocou. */
    private gradient: string | undefined;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.world = ctx.world;
        this.countToArgs = new CountToArgs(ctx.core, { discriminator: 'refraction_queue' });
        this.wave = new RayWave(ctx.core, 'refraction');
        this.core = ctx.core;
        this.transitions = {
            '*': {
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                        // A composição lê as radiâncias só no quadro em que o traçado as escreve.
                        c.produced(
                            c.bound.slots.refraction.resource,
                            'radiance',
                            this.tracing
                                && this.pixels > 0
                                && this.queueReady(c.bound)
                                && this.waveReady(c.bound),
                        );
                    },
                },
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
            },
        };
    }

    /**
     * Zera a contagem, compacta a fila, copia a contagem para o estado do quadro, deriva os argumentos do traçado, acha
     * os meios da câmera e traça.
     */
    dispatch(frame: Frame, bound: BoundFlow<RefractionSlots>): void {
        const count = this.queueCount;
        const queue = bound.pipelines.get(QUEUE.id);
        const queueCount = bound.pipelines.get(QUEUE_COUNT.id);
        if (
            count === undefined
            || this.pixels === 0
            || !this.queueReady(bound)
            || queue?.role !== 'compute'
            || queueCount?.role !== 'compute'
        )
            return;
        frame.clear(count, 0, 4);
        frame.compute('RefractionFlow.queue', (pass) => {
            pass.bind.setPipeline(queue.spec);
            queue.bindTo(pass.bind);
            pass.dispatch.invocations(this.pixels, WORKGROUP_SIZE.value);
            pass.bind.setPipeline(queueCount.spec);
            queueCount.bindTo(pass.bind);
            pass.dispatch.workgroups(1);
        });
        this.countToArgs.record(frame, {
            counts: count,
            index: 0,
            workgroupSize: WORKGROUP_SIZE.value,
        });
        const b = this.paths;
        const sorter = this.sorter;
        if (!this.tracing || b === undefined || sorter === undefined || !this.waveReady(bound))
            return;
        type Compute = ReturnType<BoundFlow['compute']>;
        const at = (d: PipelineDescriptor): Compute => bound.pipelines.get(d.id) as Compute;
        const round = bound.pipelines.get(this.roundId(b)) as Compute;
        const chunk = bound.pipelines.get(this.chunkId(b)) as Compute;
        const W = WORKGROUP_SIZE.value;
        const bind = (pass: ComputePass, k: Compute): void => {
            pass.bind.setPipeline(k.spec);
            k.bindTo(pass.bind);
        };
        const gradient =
            this.gradient === undefined ? undefined : bound.pipelines.get(this.gradient);
        const measures = gradient?.role === 'compute' && gradient.ready;
        const chunks = Math.ceil(b.slots / b.chunk);
        frame.compute('RefractionFlow.trace', (pass) => {
            this.wave.reset(pass, bound);
            bind(pass, at(CAMERA_HITS));
            pass.dispatch.workgroups(1);
            this.wave.shade(pass, bound);
            bind(pass, at(CAMERA));
            pass.dispatch.workgroups(1);
            // A mudança por bloco lê as marcas do traçado anterior, antes que este as reescreva.
            if (measures) {
                pass.bind.setPipeline(gradient.spec);
                gradient.bindTo(pass.bind);
                pass.dispatch.invocations(this.strata, W);
            }
            // As raízes (um caminho por pixel da fila) e as rodadas da onda.
            bind(pass, at(WAVE_RESET));
            pass.dispatch.workgroups(1);
            bind(pass, at(WAVE_ROOTS));
            pass.dispatch.workgroupsIndirect(
                count,
                CountToArgs.dispatchOffset({ counts: count, index: 0 }),
            );
            for (let r = 0; r < WAVE_ROUNDS; r++) {
                bind(pass, round);
                pass.dispatch.workgroups(1);
                for (let k = 0; k < chunks; k++) {
                    if (k > 0) {
                        bind(pass, chunk);
                        pass.dispatch.workgroups(1);
                    }
                    this.wave.reset(pass, bound);
                    bind(pass, at(WAVE_HIT));
                    pass.dispatch.invocations(this.wave.gridInvocations(), W);
                    this.wave.shade(pass, bound);
                    bind(pass, at(WAVE_FOLLOW));
                    pass.dispatch.invocations(this.wave.gridInvocations(), W);
                }
                bind(pass, at(WAVE_SWAP));
                pass.dispatch.workgroups(1);
            }
            bind(pass, at(WAVE_TRUNCATE));
            pass.dispatch.invocations(b.slots, W);
            bind(pass, at(WAVE_KEYS));
            pass.dispatch.invocations(2 * b.slots, W);
        });
        // As folhas por pixel: a ordem pelas chaves (a contagem lida na GPU) e o fechamento.
        this.countToArgs.record(frame, { counts: b.count, index: 0, workgroupSize: 256 });
        sorter.record(frame, {
            keys: b.keys,
            values: b.values,
            count: { counts: b.count, index: 0 },
            bits: b.bits,
        });
        frame.compute('RefractionFlow.resolve', (pass) => {
            bind(pass, at(WAVE_RESOLVE));
            pass.dispatch.invocations(2 * b.slots, W);
        });
        this.frame++;
    }

    /** Libera os kernels da contagem. */
    override dispose(): void {
        this.countToArgs.destroy();
        this.wave.destroy();
        this.releasePaths();
    }

    /** Os kernels da fila prontos. */
    private queueReady(bound: BoundFlow<RefractionSlots>): boolean {
        return [QUEUE.id, QUEUE_COUNT.id].every((id) => bound.pipelines.get(id)?.ready === true);
    }

    /** Os kernels da onda prontos. */
    private waveReady(bound: BoundFlow<RefractionSlots>): boolean {
        const b = this.paths;
        if (b === undefined || !this.wave.ready(bound)) return false;
        return [...WAVE_FIXED.map((d) => d.id), this.roundId(b), this.chunkId(b)].every((id) => {
            const p = bound.pipelines.get(id);
            return p?.role === 'compute' && p.ready;
        });
    }

    /** O começo de uma rodada para o tamanho de bloco de `b`. */
    private roundId(b: PathBuffers): string {
        return `refraction_wave_round:${b.chunk}`;
    }

    /** O bloco seguinte para o tamanho de bloco de `b`. */
    private chunkId(b: PathBuffers): string {
        return `refraction_wave_chunk:${b.chunk}`;
    }

    /**
     * Com o pedido alocado (por quem desenha os transmissivos), aloca a fila, a contagem, o estado do quadro e as
     * radiâncias, liga-os (religa quando mudam: redimensionamento), prepara os kernels e escreve o uniform do quadro.
     */
    private prepare(c: Ctx): void {
        const refraction = c.bound.slots.refraction.resource as Refraction;
        if (this.resources.textureOf(refraction, 'request') === undefined) {
            this.pixels = 0;
            return;
        }
        const R = refractionResources;
        // O gradiente temporal só quando um consumidor o alocou.
        const measures = this.resources.textureOf(refraction, 'gradient') !== undefined;
        // As texturas e onde cada uma é ligada (o gradiente lê as marcas de movimento no alfa do albedo).
        const textures = [
            ['request', [R.request]],
            ['queue', [R.queueOut, R.queueIn]],
            ['frame', [R.frameOut, R.frame]],
            ['radiance', [R.radianceOut]],
            ['hit', [R.hitOut]],
            ['albedo', [R.albedoOut, R.albedo]],
            ...(measures ? ([['gradient', [R.gradientOut]]] as const) : []),
        ] as const;
        for (const [id] of textures.slice(1)) this.resources.ensureAllocated(refraction, id);
        // As inversas de mundo (spec 037): o histórico leva o ponto atingido ao espaço do objeto por elas.
        this.resources.ensurePoolAllocated(Transform.worldInverseSchema.name);
        const count = this.resources.ensureAllocated(refraction, 'queueCount');
        const views = textures.map(([id]) => this.resources.textureViewOf(refraction, id));
        if (count?.subkind !== 'indirect' || views.some((v) => v === undefined)) {
            this.pixels = 0;
            return;
        }
        const sources = [...views, count];
        if (sources.some((s, k) => s !== this.bound[k])) {
            const binds = new Map<WgslResource, BindingSource>([[R.queueCount, count]]);
            textures.forEach(([, resources], k) => {
                for (const r of resources) binds.set(r, views[k]!);
            });
            c.bind(binds);
            if (this.bound.length === 0) {
                c.prepare(QUEUE);
                c.prepare(QUEUE_COUNT);
            }
            // Duas gravações por quadro: a contagem da fila e a das folhas.
            this.countToArgs.prepare(count, 2);
            this.bound = sources;
        }
        this.queueCount = count;
        const texture = this.resources.textureOf(refraction, 'request')!;
        this.pixels = texture.width * texture.height;
        const strata = this.resources.textureOf(refraction, 'gradient');
        // Em ladrilhos de 8 × 8 blocos (um grupo de 64 por ladrilho).
        this.strata = strata === undefined ? 0 : strata.width * strata.height;
        const rays = c.bound.slots.rays?.resource as RayScene | undefined;
        const cameraSlot = this.cameraSlot(c);
        this.tracing = refraction.enabled && rays !== undefined && cameraSlot !== undefined;
        if (rays !== undefined) {
            // As luzes nos acertos: o pool existe mesmo sem nenhuma luz na cena (só emissores ou só o céu).
            this.resources.ensurePool(Light.schema);
            this.syncPaths(c);
            this.syncWave(c, rays);
        }
        if (measures && this.gradient === undefined) {
            this.gradient = GRADIENT.id;
            c.prepare(GRADIENT);
        }
        this.writeParams(c, refraction, cameraSlot ?? 0);
    }

    /**
     * Os caminhos da onda para os pixels do pedido (refeitos quando crescem): a fila de `PATHS_PER_PIXEL` caminhos por
     * pixel, no máximo `WAVE_PATHS` e o que uma ligação de storage comporta; o bloco da onda (duas entradas por caminho)
     * no máximo `WAVE_CHUNK`; as folhas, as chaves e a ordenação delas.
     */
    private syncPaths(c: Ctx): void {
        const limits = this.core.capabilities().limits;
        const binding =
            limits.maxStorageBufferBindingSize ?? WAVE_CHUNK * RayWaveEntrySchema.stride;
        const slots = Math.max(
            1,
            Math.min(
                this.pixels * PATHS_PER_PIXEL,
                WAVE_PATHS,
                Math.floor(binding / RefractionPathSchema.stride),
                Math.floor(binding / (2 * RefractionLeafSchema.stride)),
            ),
        );
        if (this.paths !== undefined && this.paths.slots >= slots) return;
        const previous = this.paths;
        this.releasePaths();
        const chunk = Math.max(
            1,
            Math.min(slots, WAVE_CHUNK, Math.floor(binding / (2 * RayWaveEntrySchema.stride))),
        );
        let bits = 4;
        while (bits < 32 && 2 ** bits < this.pixels * 64) bits += 4;
        const storage = (name: string, byteSize: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `refraction_${name}:${slots}`,
                byteSize,
            });
        const b: PathBuffers = {
            slots,
            chunk,
            bits,
            paths: storage('paths', slots * RefractionPathSchema.stride),
            queue: storage('path_queue', (8 + 2 * slots) * 4),
            // Uma folha por caminho que termina; a que parou na dispersão divide a vaga com os canais: até o dobro.
            leaves: storage('leaves', 2 * slots * RefractionLeafSchema.stride),
            keys: storage('leaf_keys', 2 * slots * 4),
            values: storage('leaf_values', 2 * slots * 4),
            count: this.core.create<IndirectBufferSpec>({
                kind: 'buffer',
                subkind: 'indirect',
                discriminator: `refraction_leaf_count:${slots}`,
                byteSize: SetCountSchema.stride,
            }),
        };
        this.paths = b;
        const R = refractionResources;
        c.bind(
            new Map<WgslResource, BindingSource>([
                [R.paths, b.paths],
                [R.pathQueue, b.queue],
                [R.leaves, b.leaves],
                [R.leafKeys, b.keys],
                [R.leafValues, b.values],
                [R.leafCount, b.count],
            ]),
        );
        this.sorter = new RadixSort(this.core, {
            discriminator: `refraction_leaves:${slots}`,
            capacity: 2 * slots,
            withValues: true,
        });
        this.sorter.prepare(b.keys, b.values, 1, b.count);
        this.countToArgs.prepare(b.count, 2);
        if (previous?.chunk !== chunk) {
            if (previous !== undefined) {
                c.release(this.roundId(previous));
                c.release(this.chunkId(previous));
            }
            const constants = { REFRACTION_WAVE: chunk };
            c.prepare({
                ...compute(this.roundId(b), refractionWave, 'refraction_wave_round_main'),
                constants,
            });
            c.prepare({
                ...compute(this.chunkId(b), refractionWave, 'refraction_wave_chunk_main'),
                constants,
            });
        }
    }

    /**
     * A onda (a reta da câmera e um bloco de caminhos, duas entradas cada) e os kernels de material por classe da revisão
     * das funções `material` da estrutura de raios; os kernels da onda da refração na primeira vez.
     */
    private syncWave(c: Ctx, scene: RayScene): void {
        const capacity = Math.max(CAMERA_WAVE, 2 * (this.paths?.chunk ?? 1));
        if (this.wave.capacity >= capacity && scene.materialRevision === this.materialRevision)
            return;
        this.materialRevision = scene.materialRevision;
        const w = this.wave.ensure(capacity, scene.materialFunctions, scene.materialRevision);
        if (w.bindings !== undefined) c.bind(w.bindings);
        for (const id of w.released) c.release(id);
        for (const p of w.pipelines) c.prepare(p);
        if (!this.prepared) {
            for (const d of WAVE_FIXED) c.prepare(d);
            this.prepared = true;
        }
    }

    private releasePaths(): void {
        const b = this.paths;
        if (b === undefined) return;
        for (const s of [b.paths, b.queue, b.leaves, b.keys, b.values, b.count])
            this.core.destroy(s);
        this.sorter?.destroy();
        this.sorter = undefined;
        this.paths = undefined;
    }

    /** O uniform do quadro: a câmera, as luzes, o quadro e o tempo (só quando mudam). */
    private writeParams(c: Ctx, refraction: Refraction, cameraSlot: number): void {
        const d = refraction.data;
        const time = (c.bound.slots.time?.resource as Time | undefined)?.simulated ?? 0;
        const lights = this.resources.poolCount(Light.schema.name);
        if (d.camera_slot !== cameraSlot) d.camera_slot = cameraSlot;
        if (d.light_count !== lights) d.light_count = lights;
        if (d.frame !== this.frame) d.frame = this.frame;
        if (d.time !== time) d.time = time;
    }

    /** Slot da câmera ativa no pool das matrizes. */
    private cameraSlot(c: Ctx): number | undefined {
        const camera = c.bound.slots.camera?.resource;
        const id = camera === undefined ? undefined : this.world.entityIdOfResource(camera);
        return id === undefined ? undefined : c.bound.slots.cameras?.slotOf(id);
    }
}
