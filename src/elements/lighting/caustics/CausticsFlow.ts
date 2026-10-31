import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type {
    ComputePass,
    EngineCore,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
} from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import { Flow } from '../../../scene/flows/Flow';
import { FlowWork, type WorkContext } from '../../../scene/flows/FlowWork';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type SingletonSlot, type SlotMap, type WorkSlot } from '../../../scene/flows/slots';
import { wordBuffer } from '../../gpu/compute/schemas';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { WgslModule } from '../../../scene/shaders/WgslModule';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { Time } from '../../../scene/time/Time';
import { RayScene } from '../../raytrace/RayScene';
import { RayWave } from '../../raytrace/RayWave';
import { RayWaveEntrySchema } from '../../raytrace/wave/shaders';
import { Light } from '../../scene/Light';
import { Caustics } from './Caustics';
import {
    CAUSTICS_BOUNCES,
    CAUSTICS_PHOTON_SLOTS,
    CAUSTICS_QUEUE_HEADER,
    CAUSTICS_SLOTS,
    CAUSTICS_TARGET_WORDS,
    CAUSTICS_WAVE_CHUNK,
    CausticsPhotonSchema,
} from './schemas';
import {
    causticsInstances,
    causticsResolve,
    causticsResources as R,
    causticsTrace,
} from './shaders';

/** Slots do estágio das cáusticas. */
export interface CausticsSlots extends SlotMap {
    /** O transporte (o hash e os parâmetros). */
    readonly caustics: SingletonSlot<false>;
    /** A estrutura de raios: os fótons seguem por ela (e pela superfície dos volumes). */
    readonly rays: SingletonSlot<false>;
    /** O tempo simulado (as funções `material` nos acertos). */
    readonly time: SingletonSlot<true>;
    /** O espaço de trabalho do transporte: alvos, instâncias capazes, fótons, fila, a onda (spec 039). */
    readonly work: WorkSlot<CausticsWork>;
}

/** Resource de trabalho do `CausticsFlow` (spec 039). */
class CausticsWork extends FlowWork {
    static readonly schema = new StructSchema('CausticsWork', {});
}

/** Tamanho dos fótons: os da fila e o bloco da onda. */
interface PhotonSize {
    readonly slots: number;
    readonly chunk: number;
}

type Ctx = TransitionContext<CausticsSlots>;
type Compute = ReturnType<BoundFlow['compute']>;

const compute = (
    id: string,
    shader: WgslModule,
    entry: string,
    constants?: Readonly<Record<string, number>>,
): PipelineDescriptor => ({
    id,
    role: 'compute',
    shader,
    entryPoints: [entry],
    ...(constants === undefined ? {} : { constants }),
});

const RESOLVE = compute('caustics_resolve', causticsResolve, 'caustics_resolve_main');
/** O acerto sintético do centro de cada instância na onda (spec 039). */
const INSTANCES = compute('caustics_instances', causticsInstances, 'caustics_instances_main');
/** A marca de cada instância pelo fechamento avaliado na onda. */
const FLAG = compute('caustics_instances_flag', causticsInstances, 'caustics_instances_flag_main');
/** Os alvos dos fótons (um grupo). */
const TARGETS = compute('caustics_targets', causticsTrace, 'caustics_targets_main');
/** A emissão: a fonte, a correção da linha reta e o fóton na fila. */
const EMIT = compute('caustics_trace', causticsTrace, 'caustics_trace_main');
const QUEUE_RESET = compute('caustics_queue_reset', causticsTrace, 'caustics_queue_reset_main');
const SWAP = compute('caustics_swap', causticsTrace, 'caustics_swap_main');
/** Um rebote: o acerto dos fótons do bloco na onda e, depois do material, a continuação. */
const PHOTON_HIT = compute('caustics_photon_hit', causticsTrace, 'caustics_photon_hit_main');
const PHOTON_FOLLOW = compute(
    'caustics_photon_follow',
    causticsTrace,
    'caustics_photon_follow_main',
);
const FIXED = [
    RESOLVE,
    INSTANCES,
    FLAG,
    TARGETS,
    EMIT,
    QUEUE_RESET,
    SWAP,
    PHOTON_HIT,
    PHOTON_FOLLOW,
];

/** Os buffers dos fótons. */
interface PhotonBuffers {
    /** Fótons na fila (os principais e os extras da dispersão). */
    readonly slots: number;
    /** Fótons por bloco (a capacidade da onda para eles). */
    readonly chunk: number;
    readonly photons: StorageBufferSpec;
    readonly queue: StorageBufferSpec;
    readonly args: IndirectBufferSpec;
}

/**
 * CausticsFlow — o transporte da luz pelos caminhos especulares (spec 034, T067c; antes dentro da GI, spec 033 US5), por
 * quadro: os alvos dos fótons (as instâncias de vidro e metal liso, pelo material no centro de cada uma, e a caixa dos
 * volumes), os fótons das luzes pelo mesmo acerto da refração até a primeira superfície difusa (o depósito no hash do
 * `Caustics`) e o acúmulo do hash. O material nos acertos é avaliado fora do traçado, na onda dos acertos (spec 039): os
 * fótons seguem em rodadas (uma por rebote) — em cada uma, por bloco de fótons vivos, o acerto na onda, o material por
 * classe e a continuação. Nenhum kernel do Flow leva funções `material`.
 */
export class CausticsFlow extends Flow<CausticsSlots, 'idle'> {
    readonly type = 'CausticsFlow';
    readonly slots: CausticsSlots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly work: WorkContext;
    private readonly resources: ResourceDirectory;
    private targetsBound = false;
    /** Instâncias da capacidade da estrutura de raios (uma palavra cada: faz cáustica?). */
    private capableCount = 0;
    /** A onda dos acertos: das instâncias, depois dos fótons (bloco a bloco). */
    private readonly wave: RayWave;
    private waveRevision = -1;
    private photonSize: PhotonSize | undefined;
    private prepared = false;
    private frame = 0;
    private photons = 0;

    constructor(ctx: FlowContext) {
        super();
        const work = new CausticsWork();
        this.work = { core: ctx.core, resources: ctx.resources, work };
        this.slots = {
            caustics: slot.singleton(Caustics.schema),
            rays: slot.singleton(RayScene.schema),
            time: slot.singleton(Time.schema, { optional: true }),
            work: slot.work(() => work),
        };
        this.resources = ctx.resources;
        work.use({ descriptors: () => this.ownDescriptors() });
        this.wave = new RayWave(this.work, 'caustics');
        this.transitions = {
            '*': {
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                pipelineRejected: 'ignore',
                bindGroupReplaced: 'ignore',
            },
        };
    }

    /**
     * As instâncias que fazem cáustica (o acerto do centro de cada uma na onda, o material por classe e a marca), os
     * alvos (um grupo), a emissão, os rebotes em rodadas e o acúmulo no hash, num passe.
     */
    dispatch(frame: Frame, bound: BoundFlow<CausticsSlots>): void {
        const b = this.buffers;
        if (this.photons === 0 || b === undefined) return;
        const fixed = new Map(FIXED.map((d) => [d.id, bound.pipelines.get(d.id)]));
        const round = bound.pipelines.get(this.roundId(b));
        const chunk = bound.pipelines.get(this.chunkId(b));
        if (
            [...fixed.values(), round, chunk].some((k) => k?.role !== 'compute' || !k.ready)
            || !this.wave.ready(bound)
        )
            return;
        const at = (d: PipelineDescriptor): Compute => fixed.get(d.id) as Compute;
        const W = WORKGROUP_SIZE.value;
        const bind = (pass: ComputePass, k: Compute): void => {
            pass.bind.setPipeline(k.spec);
            k.bindTo(pass.bind);
        };
        const chunks = Math.ceil(b.slots / b.chunk);
        frame.compute('CausticsFlow', (pass) => {
            this.wave.reset(pass, bound);
            bind(pass, at(INSTANCES));
            pass.dispatch.invocations(this.capableCount, W);
            this.wave.shade(pass, bound);
            bind(pass, at(FLAG));
            pass.dispatch.invocations(this.capableCount, W);
            bind(pass, at(TARGETS));
            pass.dispatch.workgroups(1);
            bind(pass, at(QUEUE_RESET));
            pass.dispatch.workgroups(1);
            bind(pass, at(EMIT));
            pass.dispatch.invocations(this.photons, W);
            for (let bounce = 0; bounce < CAUSTICS_BOUNCES; bounce++) {
                bind(pass, round as Compute);
                pass.dispatch.workgroups(1);
                for (let k = 0; k < chunks; k++) {
                    if (k > 0) {
                        bind(pass, chunk as Compute);
                        pass.dispatch.workgroups(1);
                    }
                    this.wave.reset(pass, bound);
                    bind(pass, at(PHOTON_HIT));
                    pass.dispatch.invocations(this.wave.gridInvocations(), W);
                    this.wave.shade(pass, bound);
                    bind(pass, at(PHOTON_FOLLOW));
                    pass.dispatch.invocations(this.wave.gridInvocations(), W);
                }
                bind(pass, at(SWAP));
                pass.dispatch.workgroups(1);
            }
            bind(pass, at(RESOLVE));
            pass.dispatch.invocations(CAUSTICS_SLOTS, W);
        });
        this.frame++;
    }

    private get core(): EngineCore {
        return this.work.core;
    }

    /** Os alvos, as instâncias capazes e os fótons no Resource de trabalho, pelos tamanhos atuais (spec 039). */
    private ownDescriptors(): readonly GPUDescriptor[] {
        const out: GPUDescriptor[] = [wordBuffer('caustics_targets', CAUSTICS_TARGET_WORDS * 4)];
        if (this.capableCount > 0)
            out.push(wordBuffer('caustics_instance_capable', this.capableCount * 4));
        const n = this.photonSize;
        if (n !== undefined)
            out.push(
                {
                    id: 'caustics_photons',
                    role: 'storage-rw',
                    schema: CausticsPhotonSchema,
                    upload: 'never',
                    count: n.slots,
                },
                wordBuffer('caustics_queue', (CAUSTICS_QUEUE_HEADER + 2 * n.slots) * 4),
                wordBuffer('caustics_args', 16, 'indirect'),
            );
        return out;
    }

    private own<B>(id: string): B {
        return this.resources.bufferOf(this.work.work, id) as B;
    }

    /** Os fótons que a C2 alocou (ou `undefined` antes do primeiro dimensionamento). */
    private get buffers(): PhotonBuffers | undefined {
        const n = this.photonSize;
        if (n === undefined) return undefined;
        return {
            ...n,
            photons: this.own('caustics_photons'),
            queue: this.own('caustics_queue'),
            args: this.own('caustics_args'),
        };
    }

    /** O começo de uma rodada para a capacidade de bloco de `b`. */
    private roundId(b: PhotonBuffers): string {
        return `caustics_round:${b.chunk}`;
    }

    /** O bloco seguinte para a capacidade de bloco de `b`. */
    private chunkId(b: PhotonBuffers): string {
        return `caustics_chunk:${b.chunk}`;
    }

    private prepare(c: Ctx): void {
        const caustics = c.bound.slots.caustics.resource as Caustics;
        // As luzes nos acertos: o pool existe mesmo sem nenhuma luz na cena.
        this.resources.ensurePool(Light.schema);
        if (!this.targetsBound) {
            this.targetsBound = true;
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [R.targets, this.own<StorageBufferSpec>('caustics_targets')],
                ]),
            );
        }
        this.photons = caustics.enabled ? caustics.photons : 0;
        const scene = c.bound.slots.rays.resource as RayScene;
        this.syncCapable(c, scene);
        this.syncPhotons(c);
        this.syncWave(c, scene);
        // Os kernels fixos depois de ligados os buffers privados.
        if (!this.prepared) {
            for (const d of FIXED) c.prepare(d);
            this.prepared = true;
        }
        const time = (c.bound.slots.time?.resource as Time | undefined)?.simulated ?? 0;
        const params: [Record<string, number[]>] = [
            {
                counts: [
                    this.resources.poolCount(Light.schema.name),
                    CAUSTICS_SLOTS,
                    this.photons,
                    this.frame,
                ],
                extra: [caustics.cellSize, time, 0, 0],
            },
        ];
        caustics.data.params = params;
    }

    /** Uma palavra por instância na capacidade da estrutura de raios (refeita quando ela cresce). */
    private syncCapable(c: Ctx, scene: RayScene): void {
        const count = Math.max(1, scene.data.instances);
        if (count <= this.capableCount) return;
        this.capableCount = count;
        this.work.work.refresh();
        c.bind(
            new Map<WgslResource, BindingSource>([
                [R.instanceCapable, this.own<StorageBufferSpec>('caustics_instance_capable')],
            ]),
        );
    }

    /**
     * Os fótons, a fila e o despacho do bloco para os fótons do quadro — refeitos quando mudam, nos dois sentidos (spec
     * 039: o custo segue os fótons pedidos, sem estado preso a um valor anterior): o bloco é a capacidade
     * da onda para os fótons — o menor entre os da fila, `CAUSTICS_WAVE_CHUNK` e o que uma ligação de storage do
     * dispositivo comporta —, e os kernels do começo da rodada e do bloco seguinte levam o tamanho dele.
     */
    private syncPhotons(c: Ctx): void {
        const slotCount = Math.max(1, this.photons) * CAUSTICS_PHOTON_SLOTS;
        if (this.photonSize?.slots === slotCount) return;
        const previous = this.photonSize;
        const limits = this.core.capabilities().limits;
        const binding =
            limits.maxStorageBufferBindingSize ?? CAUSTICS_WAVE_CHUNK * RayWaveEntrySchema.stride;
        const chunk = Math.max(
            1,
            Math.min(
                slotCount,
                CAUSTICS_WAVE_CHUNK,
                Math.floor(binding / RayWaveEntrySchema.stride),
            ),
        );
        // A C2 realoca os fótons no tamanho novo (o Resource de trabalho se redescreve).
        this.photonSize = { slots: slotCount, chunk };
        this.work.work.refresh();
        const b = this.buffers!;
        c.bind(
            new Map<WgslResource, BindingSource>([
                [R.photons, b.photons],
                [R.queue, b.queue],
                [R.argsOut, b.args],
                [R.args, b.args],
            ]),
        );
        if (previous?.chunk !== chunk) {
            if (previous !== undefined) {
                c.release(`caustics_round:${previous.chunk}`);
                c.release(`caustics_chunk:${previous.chunk}`);
            }
            const constants = {
                CAUSTICS_WAVE: chunk,
                CAUSTICS_MAX_X: limits.maxComputeWorkgroupsPerDimension ?? 65_535,
            };
            c.prepare(compute(this.roundId(b), causticsTrace, 'caustics_round_main', constants));
            c.prepare(compute(this.chunkId(b), causticsTrace, 'caustics_chunk_main', constants));
        }
    }

    /**
     * A onda (as instâncias e um bloco de fótons) e os kernels de material por classe da revisão das funções `material`
     * da estrutura de raios.
     */
    private syncWave(c: Ctx, scene: RayScene): void {
        const capacity = Math.max(this.capableCount, this.buffers?.chunk ?? 1);
        if (this.wave.capacity >= capacity && this.waveRevision === scene.materialRevision) return;
        this.waveRevision = scene.materialRevision;
        const w = this.wave.ensure(capacity, scene.materialFunctions, scene.materialRevision);
        if (w.bindings !== undefined) c.bind(w.bindings);
        for (const id of w.released) c.release(id);
        for (const p of w.pipelines) c.prepare(p);
    }
}
