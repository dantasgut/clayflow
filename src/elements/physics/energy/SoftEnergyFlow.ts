import type { Frame } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type ChannelSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../../scene/flows/slots';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { WgslModule } from '../../../scene/shaders/WgslModule';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { Time } from '../../../scene/time/Time';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';
import { XPBDSoftSchema } from '../bodies/schemas/XPBDSoftSchema';
import { FEMSchema } from '../bodies/schemas/FEMSchema';
import { MPMSoftSchema } from '../bodies/schemas/MPMSoftSchema';
import { DistanceConstraint } from '../constraints/DistanceConstraint';
import { GravityField } from '../forcefields/GravityField';
import { ParticlePhysics } from '../ParticlePhysics';
import { EnergyMeter } from './EnergyMeter';
import {
    BODY_ENERGY_HISTORY,
    SOFT_ENERGY_ALGORITHM,
    SoftBodyChunkSchema,
    SoftBodyEnergySchema,
    SoftBodyPartialSchema,
    SoftBodyRangeSchema,
    SoftEnergyParamsSchema,
} from './schemas';
import {
    softEnergyPartialKernel,
    softEnergyResources,
    softEnergySeriesKernel,
    softEnergySlots,
    softEnergySourcePoint,
    softEnergySources,
} from './shaders';

/** Slots do estágio da energia dos corpos moles. */
export interface SoftEnergySlots extends SlotMap {
    /** O medidor (sem ele, o estágio fica pendente: nada calculado nem alocado). */
    readonly meter: SingletonSlot<false>;
    /** As faixas dos corpos moles (um registro por corpo) e os blocos (um registro por bloco). */
    readonly ranges: PoolSlot<false>;
    readonly chunks: PoolSlot<false>;
    /** O tempo da cena (os passos do quadro). */
    readonly time: SingletonSlot<false>;
    /** A gravidade uniforme (sem ela, a padrão dos solvers: 0, −9,81, 0). */
    readonly gravity: SingletonSlot<true>;
    /** A física das partículas (a massa, o volume e a rigidez do MPM; sem ele, o padrão). */
    readonly physics: SingletonSlot<true>;
    /** As partículas de cada algoritmo e as arestas do XPBD (cada pipeline existe com o pool dele). */
    readonly xpbd: PoolSlot<true>;
    readonly fem: PoolSlot<true>;
    readonly mpm: PoolSlot<true>;
    readonly edges: PoolSlot<true>;
    /** A série da energia (o canal do pool `SoftBodyEnergy`). */
    readonly softEnergy: ChannelSlot<false>;
}

type Ctx = TransitionContext<SoftEnergySlots>;

type Algorithm = keyof typeof SOFT_ENERGY_ALGORITHM;

/** A região de parâmetros de cada algoritmo na passada 1 (offset dinâmico) e a da passada 2. */
const REGION: Readonly<Record<Algorithm, number>> = { XPBD: 0, FEM: 1, MPM: 2 };
const ALGORITHMS = Object.keys(REGION) as Algorithm[];
const SERIES_REGION = ALGORITHMS.length;

/** A passada 1 com a fonte de um algoritmo no ponto `soft_energy_source`. */
const pipeline = (id: string, source: WgslModule): PipelineDescriptor => ({
    id,
    role: 'compute',
    shader: bindPoints(softEnergyPartialKernel, new Map([[softEnergySourcePoint, source]])),
    entryPoints: ['soft_energy_partial_main'],
});

/** A passada 2: a soma dos blocos de cada corpo e a fatia da série. */
const SERIES: PipelineDescriptor = {
    id: 'soft_energy_series',
    role: 'compute',
    shader: softEnergySeriesKernel,
    entryPoints: ['soft_energy_main'],
};

const PIPELINES = Object.freeze({
    xpbdEdges: pipeline('soft_energy_xpbd_edges', softEnergySources.xpbdEdges),
    xpbdNodes: pipeline('soft_energy_xpbd_nodes', softEnergySources.xpbdNodes),
    fem: pipeline('soft_energy_fem', softEnergySources.femNodes),
    mpm: pipeline('soft_energy_mpm', softEnergySources.mpm),
});

/**
 * SoftEnergyFlow — a série temporal da energia dos corpos moles (spec 037, o canal temporal da C2). Na fase `physics`,
 * depois dos solvers, só com um `EnergyMeter` na cena: pede o pool `SoftBodyEnergy` (8 fatias, um registro por corpo, no
 * slot da faixa dele) e as somas dos blocos, escreve uma região de parâmetros por algoritmo e uma da soma (a gravidade,
 * o tempo simulado do quadro, os passos já gravados e, no MPM, a física) e despacha em duas passadas: a dos blocos
 * (um grupo por bloco de 1024 elementos, uma vez por algoritmo presente, com a fonte dele no ponto
 * `soft_energy_source` — XPBD com as arestas, ou sem se não há restrições na cena, FEM, MPM), em paralelo mesmo num
 * corpo grande, e a dos corpos (um grupo por corpo: a soma dos blocos e a fatia da série). O anel gira só nos quadros
 * com passo de física e com todos os pipelines prontos: um registro sem a fatia gravada não entra na série.
 */
export class SoftEnergyFlow extends Flow<SoftEnergySlots, 'idle'> {
    readonly type = 'SoftEnergyFlow';
    readonly slots: SoftEnergySlots = {
        meter: slot.singleton(EnergyMeter.schema),
        ranges: slot.pool(SoftBodyRangeSchema.name),
        chunks: slot.pool(SoftBodyChunkSchema.name),
        time: slot.singleton(Time.schema),
        gravity: slot.singleton(GravityField.schema, { optional: true }),
        physics: slot.singleton(ParticlePhysics.schema, { optional: true }),
        xpbd: slot.pool(XPBDSoftSchema.name, { optional: true }),
        fem: slot.pool(FEMSchema.name, { optional: true }),
        mpm: slot.pool(MPMSoftSchema.name, { optional: true }),
        edges: slot.pool(DistanceConstraint.schema.name, { optional: true }),
        ...softEnergySlots,
    };
    override readonly pipelines: readonly PipelineDescriptor[] = [SERIES];
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource>;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly params: PerStepUniforms;
    /** O pipeline de cada algoritmo presente (pelo pool das partículas dele). */
    private readonly active = new Map<Algorithm, PipelineDescriptor>();
    /** Passos de física no quadro (0: nada a gravar). */
    private steps = 0;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.params = new PerStepUniforms(ctx.core, {
            discriminator: 'soft_energy_params',
            schema: SoftEnergyParamsSchema,
        });
        this.params.reserve(ALGORITHMS.length + 1);
        this.bindings = new Map<WgslResource, BindingSource>([
            [softEnergyResources.params, this.params.source()],
        ]);
        const reconcile = {
            to: 'idle' as const,
            run: (_e: unknown, c: Ctx) => {
                this.reconcile(c);
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.resources.ensurePoolAllocated(SoftBodyEnergySchema.name);
                        this.resources.ensurePoolAllocated(SoftBodyPartialSchema.name);
                        this.reconcile(c);
                    },
                },
                slotChanged: reconcile,
                slotLost: reconcile,
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
            },
        };
    }

    dispatch(frame: Frame, bound: BoundFlow<SoftEnergySlots>): void {
        const bodies = bound.slots.ranges.count;
        const chunks = bound.slots.chunks.count;
        if (this.steps === 0 || bodies === 0 || this.active.size === 0) return;
        const prepared = [...this.active].flatMap(([algorithm, desc]) => {
            const p = bound.pipelines.get(desc.id);
            return p?.role === 'compute' && p.ready ? [{ algorithm, p }] : [];
        });
        const series = bound.compute(SERIES.id);
        // Todos os algoritmos presentes e a soma, ou nada: o anel não gira com registros sem a fatia do passo.
        if (prepared.length < this.active.size || !series.ready) return;
        const wg = WORKGROUP_SIZE.value;
        for (const { algorithm, p } of prepared) {
            frame.compute(`SoftEnergyFlow.${algorithm}`, (pass) => {
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind, { draw: [this.params.offset(REGION[algorithm])] });
                pass.dispatch.invocations(chunks * wg, wg);
            });
        }
        frame.compute('SoftEnergyFlow.series', (pass) => {
            pass.bind.setPipeline(series.spec);
            series.bindTo(pass.bind, { draw: [this.params.offset(SERIES_REGION)] });
            pass.dispatch.invocations(bodies * wg, wg);
        });
        bound.slots.softEnergy.written();
    }

    /** Libera os parâmetros. */
    override dispose(): void {
        this.params.dispose();
    }

    /** Um pipeline por algoritmo com o pool das partículas na cena; o do XPBD com as arestas se o pool delas existe. */
    private reconcile(c: Ctx): void {
        const s = c.bound.slots;
        const want = new Map<Algorithm, PipelineDescriptor>();
        if (s.xpbd !== undefined)
            want.set('XPBD', s.edges !== undefined ? PIPELINES.xpbdEdges : PIPELINES.xpbdNodes);
        if (s.fem !== undefined) want.set('FEM', PIPELINES.fem);
        if (s.mpm !== undefined) want.set('MPM', PIPELINES.mpm);
        for (const [algorithm, desc] of this.active) {
            if (want.get(algorithm) !== desc) c.release(desc.id);
        }
        this.active.clear();
        for (const [algorithm, desc] of want) {
            c.prepare(desc);
            this.active.set(algorithm, desc);
        }
    }

    /** Os passos do quadro e uma região de parâmetros por algoritmo (uma escrita). */
    private prepare(c: Ctx): void {
        const s = c.bound.slots;
        const time = s.time.resource as Time;
        this.steps = time.data.steps;
        if (this.steps === 0) return;
        const g = (s.gravity?.resource as GravityField | undefined)?.uniformAcceleration() ?? [
            0, -9.81, 0, 0,
        ];
        const physics =
            (s.physics?.resource as ParticlePhysics | undefined) ?? ParticlePhysics.defaults;
        const { mu, lambda } = physics.lame;
        const region = (records: number, algorithm: number) => ({
            gravity: [g[0] ?? 0, g[1] ?? 0, g[2] ?? 0, time.data.stepDt * time.data.steps],
            counts: [records, s.softEnergy.frames, BODY_ENERGY_HISTORY, algorithm],
            material: [physics.particleMass, physics.particleVolume, mu, lambda],
        });
        // Passada 1: os blocos, filtrados pelo algoritmo; passada 2: as faixas.
        for (const algorithm of ALGORITHMS)
            this.params.write(
                REGION[algorithm],
                region(s.chunks.count, SOFT_ENERGY_ALGORITHM[algorithm]),
            );
        this.params.write(SERIES_REGION, region(s.ranges.count, 0));
        this.params.flush(ALGORITHMS.length + 1);
    }
}
