import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { EngineCore, Frame, StorageBufferSpec } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type SingletonSlot, type SlotMap } from '../../../scene/flows/slots';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { WgslModule } from '../../../scene/shaders/WgslModule';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { Time } from '../../../scene/time/Time';
import { RayScene } from '../../raytrace/RayScene';
import { composeHitMaterial, rayHitMaterialPoint } from '../../raytrace/hitMaterial';
import { Light } from '../../scene/Light';
import { Caustics } from './Caustics';
import { CAUSTICS_SLOTS, CAUSTICS_TARGET_WORDS } from './schemas';
import { causticsResolve, causticsResources as R, causticsTrace } from './shaders';

/** Slots do estágio das cáusticas. */
export interface CausticsSlots extends SlotMap {
    /** O transporte (o hash e os parâmetros). */
    readonly caustics: SingletonSlot<false>;
    /** A estrutura de raios: os fótons seguem por ela (e pela superfície dos volumes). */
    readonly rays: SingletonSlot<false>;
    /** O tempo simulado (as funções `material` nos acertos). */
    readonly time: SingletonSlot<true>;
}

const slots: CausticsSlots = {
    caustics: slot.singleton(Caustics.schema),
    rays: slot.singleton(RayScene.schema),
    time: slot.singleton(Time.schema, { optional: true }),
};

type Ctx = TransitionContext<CausticsSlots>;

const compute = (id: string, shader: WgslModule, entry: string): PipelineDescriptor => ({
    id,
    role: 'compute',
    shader,
    entryPoints: [entry],
});

const RESOLVE = compute('caustics_resolve', causticsResolve, 'caustics_resolve_main');
/** Ids dos kernels compostos com as funções `material` (as instâncias, os alvos e os fótons) de uma revisão. */
const traceIds = (revision: number): readonly [string, string, string] => [
    `caustics_instances:${revision}`,
    `caustics_targets:${revision}`,
    `caustics_trace:${revision}`,
];

/**
 * CausticsFlow — o transporte da luz pelos caminhos especulares (spec 034, T067c; antes dentro da GI, spec 033 US5), por
 * quadro: os alvos dos fótons (as instâncias de vidro e metal liso e a caixa dos volumes), os fótons das luzes pelo
 * mesmo acerto e fechamento da refração até a primeira superfície difusa (o depósito no hash do `Caustics`) e o acúmulo
 * do hash. Os kernels dos fótons levam a composição das funções `material` da estrutura de raios (refeitos quando ela
 * muda, como a luz global e a refração).
 */
export class CausticsFlow extends Flow<CausticsSlots, 'idle'> {
    readonly type = 'CausticsFlow';
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private targets: StorageBufferSpec | undefined;
    /** Uma palavra por instância da capacidade da estrutura de raios: faz cáustica? */
    private capable: StorageBufferSpec | undefined;
    private capableCount = 0;
    private prepared = false;
    private traceRevision: number | undefined;
    private nextTraceRevision: number | undefined;
    private materialRevision = -1;
    private frame = 0;
    private photons = 0;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
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
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                pipelineRejected: 'ignore',
                bindGroupReplaced: 'ignore',
            },
        };
    }

    /** As instâncias que fazem cáustica, os alvos (um grupo), os fótons e o acúmulo no hash, num passe. */
    dispatch(frame: Frame, bound: BoundFlow<CausticsSlots>): void {
        if (this.photons === 0) return;
        const traces = this.readyTraces(bound);
        const resolve = bound.pipelines.get(RESOLVE.id);
        if (traces === undefined || resolve?.role !== 'compute' || !resolve.ready) return;
        const W = WORKGROUP_SIZE.value;
        frame.compute('CausticsFlow', (pass) => {
            for (const [p, count] of [
                [traces[0]!, this.capableCount],
                [traces[1]!, W],
                [traces[2]!, this.photons],
                [resolve, CAUSTICS_SLOTS],
            ] as const) {
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind);
                pass.dispatch.invocations(count, W);
            }
        });
        this.frame++;
    }

    override dispose(): void {
        if (this.targets !== undefined) this.core.destroy(this.targets);
        this.targets = undefined;
        if (this.capable !== undefined) this.core.destroy(this.capable);
        this.capable = undefined;
        this.capableCount = 0;
    }

    /** Os kernels dos fótons prontos: os novos assim que compilam (os anteriores são liberados), senão os atuais. */
    private readyTraces(
        bound: BoundFlow<CausticsSlots>,
    ): readonly ReturnType<BoundFlow['compute']>[] | undefined {
        type Compute = ReturnType<BoundFlow['compute']>;
        const ready = (revision: number | undefined): Compute[] | undefined => {
            if (revision === undefined) return undefined;
            const ps = traceIds(revision).map((id) => bound.pipelines.get(id));
            return ps.every((p) => p?.role === 'compute' && p.ready)
                ? (ps as Compute[])
                : undefined;
        };
        return ready(this.nextTraceRevision) ?? ready(this.traceRevision);
    }

    private prepare(c: Ctx): void {
        const caustics = c.bound.slots.caustics.resource as Caustics;
        // As luzes nos acertos: o pool existe mesmo sem nenhuma luz na cena.
        this.resources.ensurePool(Light.schema);
        if (this.targets === undefined) {
            this.targets = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: 'caustics_targets',
                byteSize: CAUSTICS_TARGET_WORDS * 4,
            });
            c.bind(new Map<WgslResource, BindingSource>([[R.targets, this.targets]]));
        }
        if (!this.prepared) {
            c.prepare(RESOLVE);
            this.prepared = true;
        }
        const scene = c.bound.slots.rays.resource as RayScene;
        this.syncCapable(c, scene);
        this.syncTrace(c, scene);
        this.photons = caustics.enabled ? caustics.photons : 0;
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
        if (this.capable !== undefined && count <= this.capableCount) return;
        if (this.capable !== undefined) this.core.destroy(this.capable);
        this.capable = this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'caustics_instance_capable',
            byteSize: count * 4,
        });
        this.capableCount = count;
        c.bind(new Map<WgslResource, BindingSource>([[R.instanceCapable, this.capable]]));
    }

    /** Os kernels dos fótons com a composição das funções `material` da cena (novos quando o conjunto muda). */
    private syncTrace(c: Ctx, scene: RayScene): void {
        if (this.nextTraceRevision !== undefined) {
            const next = traceIds(this.nextTraceRevision).map((id) => c.bound.pipelines.get(id));
            if (next.every((p) => p?.ready === true)) {
                if (this.traceRevision !== undefined)
                    for (const id of traceIds(this.traceRevision)) c.release(id);
                this.traceRevision = this.nextTraceRevision;
                this.nextTraceRevision = undefined;
            }
        }
        if (scene.materialRevision === this.materialRevision) return;
        this.materialRevision = scene.materialRevision;
        const fns = scene.materialFunctions;
        const composed =
            fns.length === 0
                ? causticsTrace
                : bindPoints(
                      causticsTrace,
                      new Map([[rayHitMaterialPoint, composeHitMaterial(fns)]]),
                  );
        const [instancesId, targetsId, traceId] = traceIds(this.materialRevision);
        if (this.nextTraceRevision !== undefined)
            for (const id of traceIds(this.nextTraceRevision)) c.release(id);
        c.prepare(compute(instancesId, composed, 'caustics_instances_main'));
        c.prepare(compute(targetsId, composed, 'caustics_targets_main'));
        c.prepare(compute(traceId, composed, 'caustics_trace_main'));
        if (this.traceRevision === undefined) this.traceRevision = this.materialRevision;
        else this.nextTraceRevision = this.materialRevision;
    }
}
