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
import { Camera } from '../../scene/Camera';
import { Light } from '../../scene/Light';
import { Transform } from '../../scene/Transform';
import { Refraction } from './Refraction';
import {
    refractionCamera,
    refractionGradient,
    refractionQueue,
    refractionResources,
    refractionChain,
} from './shaders';
import { RefractionChainSchema } from './schemas';

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

/** A refração com trabalho fixo por pixel (spec 039 refeita, D1): o quadro, o bloco, as vagas, a rodada e o fechamento. */
const CHAIN_FIXED = [CAMERA_HITS, CAMERA];
/** Os kernels da cadeia (com o tamanho do bloco: `REFRACTION_CHAIN_PIXELS`). */
const CHAIN_KERNELS = ['reset', 'chunk', 'roots', 'hit', 'follow', 'swap', 'resolve'] as const;
type ChainKernel = (typeof CHAIN_KERNELS)[number];

/**
 * Rodadas por bloco: um acerto por vaga em cada uma — a câmera e as interfaces seguintes até o teto padrão de interfaces
 * (`Refraction.max_interfaces`, 16); a vaga que ainda segue depois conta como truncada.
 */
const CHAIN_ROUNDS = 17;
/** Palavras do cabeçalho da cadeia (`REFRACTION_CHAIN_HEADER`). */
const CHAIN_HEADER = 8;
/** Vagas por pixel (`REFRACTION_CHAIN_SLOTS`). */
const CHAIN_SLOTS = 4;
/** Pixels por bloco no máximo (a memória das vagas e da onda: duas entradas por vaga). */
const CHAIN_PIXELS = 1 << 16;

/** Os buffers de um bloco. */
interface ChainBuffers {
    readonly pixels: number;
    readonly paths: StorageBufferSpec;
    readonly queue: StorageBufferSpec;
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
    private paths: ChainBuffers | undefined;
    /** Os kernels da cadeia a preparar (o bloco mudou). */
    private chainPending = false;
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
        if (!this.tracing || b === undefined || !this.waveReady(bound)) return;
        type Compute = ReturnType<BoundFlow['compute']>;
        const at = (d: PipelineDescriptor): Compute => bound.pipelines.get(d.id) as Compute;
        const kernel = (k: ChainKernel): Compute =>
            bound.pipelines.get(this.chainId(b, k)) as Compute;
        const W = WORKGROUP_SIZE.value;
        const bind = (pass: ComputePass, k: Compute): void => {
            pass.bind.setPipeline(k.spec);
            k.bindTo(pass.bind);
        };
        const gradient =
            this.gradient === undefined ? undefined : bound.pipelines.get(this.gradient);
        const measures = gradient?.role === 'compute' && gradient.ready;
        const chunks = Math.ceil(this.pixels / b.pixels);
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
            // Os blocos de pixels da fila: as vagas, as rodadas fixas (um acerto por vaga, o material por classe e a
            // continuação) e o fechamento por pixel. O bloco além da fila do quadro só passa pelos laços vazios.
            bind(pass, kernel('reset'));
            pass.dispatch.workgroups(1);
            const grid = this.wave.gridInvocations();
            for (let k = 0; k < chunks; k++) {
                bind(pass, kernel('chunk'));
                pass.dispatch.workgroups(1);
                bind(pass, kernel('roots'));
                pass.dispatch.invocations(grid, W);
                for (let r = 0; r < CHAIN_ROUNDS; r++) {
                    this.wave.reset(pass, bound);
                    bind(pass, kernel('hit'));
                    pass.dispatch.invocations(grid, W);
                    this.wave.shade(pass, bound);
                    bind(pass, kernel('follow'));
                    pass.dispatch.invocations(grid, W);
                    bind(pass, kernel('swap'));
                    pass.dispatch.workgroups(1);
                }
                bind(pass, kernel('resolve'));
                pass.dispatch.invocations(grid, W);
            }
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
        return [
            ...CHAIN_FIXED.map((d) => d.id),
            ...CHAIN_KERNELS.map((k) => this.chainId(b, k)),
        ].every((id) => {
            const p = bound.pipelines.get(id);
            return p?.role === 'compute' && p.ready;
        });
    }

    /** O kernel `k` da cadeia para o tamanho de bloco de `b`. */
    private chainId(b: ChainBuffers, k: ChainKernel): string {
        return `refraction_chain_${k}:${b.pixels}`;
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
            this.countToArgs.prepare(count, 1);
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
            this.prepareChain(c);
        }
        if (measures && this.gradient === undefined) {
            this.gradient = GRADIENT.id;
            c.prepare(GRADIENT);
        }
        this.writeParams(c, refraction, cameraSlot ?? 0);
    }

    /**
     * As vagas de um bloco de pixels da fila (`CHAIN_SLOTS` por pixel; refeitas quando o bloco cresce): no máximo
     * `CHAIN_PIXELS` pixels, o que uma ligação de storage comporta das vagas e da onda (duas entradas por vaga); os
     * kernels da cadeia com esse tamanho.
     */
    private syncPaths(c: Ctx): void {
        const limits = this.core.capabilities().limits;
        const binding =
            limits.maxStorageBufferBindingSize
            ?? CHAIN_PIXELS * CHAIN_SLOTS * 2 * RayWaveEntrySchema.stride;
        const pixels = Math.max(
            1,
            Math.min(
                this.pixels,
                CHAIN_PIXELS,
                Math.floor(binding / (CHAIN_SLOTS * RefractionChainSchema.stride)),
                Math.floor(binding / (CHAIN_SLOTS * 2 * RayWaveEntrySchema.stride)),
            ),
        );
        if (this.paths !== undefined && this.paths.pixels >= pixels) return;
        const previous = this.paths;
        this.releasePaths();
        const storage = (name: string, byteSize: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `refraction_${name}:${pixels}`,
                byteSize,
            });
        const b: ChainBuffers = {
            pixels,
            paths: storage('chain', pixels * CHAIN_SLOTS * RefractionChainSchema.stride),
            // O cabeçalho e as duas listas das vagas vivas.
            queue: storage('chain_header', (CHAIN_HEADER + 2 * CHAIN_SLOTS * pixels) * 4),
        };
        this.paths = b;
        const R = refractionResources;
        c.bind(
            new Map<WgslResource, BindingSource>([
                [R.paths, b.paths],
                [R.pathQueue, b.queue],
            ]),
        );
        if (previous !== undefined)
            for (const k of CHAIN_KERNELS) c.release(this.chainId(previous, k));
        this.chainPending = true;
    }

    /** Os kernels da cadeia do tamanho de bloco atual, depois que a onda está ligada (eles a leem). */
    private prepareChain(c: Ctx): void {
        const b = this.paths;
        if (!this.chainPending || b === undefined) return;
        this.chainPending = false;
        const constants = { REFRACTION_CHAIN_PIXELS: b.pixels };
        for (const k of CHAIN_KERNELS) {
            c.prepare({
                ...compute(this.chainId(b, k), refractionChain, `refraction_chain_${k}_main`),
                constants,
            });
        }
    }

    /**
     * A onda (a reta da câmera e as vagas de um bloco, duas entradas cada) e os kernels de material por classe da revisão
     * das funções `material` da estrutura de raios; os kernels da câmera na primeira vez.
     */
    private syncWave(c: Ctx, scene: RayScene): void {
        const capacity = Math.max(CAMERA_WAVE, 2 * CHAIN_SLOTS * (this.paths?.pixels ?? 1));
        if (this.wave.capacity >= capacity && scene.materialRevision === this.materialRevision)
            return;
        this.materialRevision = scene.materialRevision;
        const w = this.wave.ensure(capacity, scene.materialFunctions, scene.materialRevision);
        if (w.bindings !== undefined) c.bind(w.bindings);
        for (const id of w.released) c.release(id);
        for (const p of w.pipelines) c.prepare(p);
        if (!this.prepared) {
            for (const d of CHAIN_FIXED) c.prepare(d);
            this.prepared = true;
        }
    }

    private releasePaths(): void {
        const b = this.paths;
        if (b === undefined) return;
        for (const s of [b.paths, b.queue]) this.core.destroy(s);
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
