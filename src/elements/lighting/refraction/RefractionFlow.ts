import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { Frame, IndirectBufferSpec } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type SingletonSlot, type SlotMap } from '../../../scene/flows/slots';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { CountToArgs } from '../../gpu/compute/CountToArgs';
import { Refraction } from './Refraction';
import { refractionQueue, refractionResources } from './shaders';

/** Slots do estágio da refração. */
export interface RefractionSlots extends SlotMap {
    /** A refração da cena (parâmetros e alvos). */
    readonly refraction: SingletonSlot<false>;
}

const slots: RefractionSlots = { refraction: slot.singleton(Refraction.schema) };

type Ctx = TransitionContext<RefractionSlots>;

const QUEUE: PipelineDescriptor = {
    id: 'refraction_queue',
    role: 'compute',
    shader: refractionQueue,
    entryPoints: ['refraction_queue_main'],
};

/**
 * Estágio da refração traçada (Camada 3, spec 034, R1): depois do pedido por pixel (o desenho dos transmissivos no
 * forward), compacta os pixels com pedido numa fila e deriva o despacho indireto do traçado pela contagem, sem a
 * contagem voltar à CPU. Fase `forward`, depois dos opacos, dos sprites e da superfície da água, antes da composição
 * dos transmissivos e da água. Sem o pedido alocado (nenhum transmissivo desenhado com a refração), nada grava.
 */
export class RefractionFlow extends Flow<RefractionSlots, 'idle'> {
    readonly type = 'RefractionFlow';
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly countToArgs: CountToArgs;
    /** Fontes ligadas (outras = religa). */
    private bound: readonly unknown[] = [];
    /** A contagem da fila, quando ligada. */
    private queueCount: IndirectBufferSpec | undefined;
    /** Pixels do pedido (o despacho da fila). */
    private pixels = 0;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.countToArgs = new CountToArgs(ctx.core, {
            discriminator: 'refraction_queue',
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
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
            },
        };
    }

    /** Zera a contagem, compacta a fila e deriva os argumentos do despacho do traçado. */
    dispatch(frame: Frame, bound: BoundFlow<RefractionSlots>): void {
        const count = this.queueCount;
        const queue = bound.pipelines.get(QUEUE.id);
        if (count === undefined || this.pixels === 0 || queue?.role !== 'compute' || !queue.ready)
            return;
        frame.clear(count, 0, 4);
        frame.compute('RefractionFlow.queue', (pass) => {
            pass.bind.setPipeline(queue.spec);
            queue.bindTo(pass.bind);
            pass.dispatch.invocations(this.pixels, WORKGROUP_SIZE.value);
        });
        this.countToArgs.record(frame, {
            counts: count,
            index: 0,
            workgroupSize: WORKGROUP_SIZE.value,
        });
    }

    /** Libera os kernels da contagem. */
    override dispose(): void {
        this.countToArgs.destroy();
    }

    /**
     * Com o pedido alocado (por quem desenha os transmissivos), aloca a fila, a contagem e os contadores, liga as
     * texturas e a contagem (religa quando mudam: redimensionamento) e prepara o kernel da fila.
     */
    private prepare(c: Ctx): void {
        const refraction = c.bound.slots.refraction.resource as Refraction;
        const request = this.resources.textureOf(refraction, 'request');
        if (request === undefined) {
            this.pixels = 0;
            return;
        }
        this.resources.ensureAllocated(refraction, 'queue');
        this.resources.ensureAllocated(refraction, 'stats');
        const count = this.resources.ensureAllocated(refraction, 'queueCount');
        const requestView = this.resources.textureViewOf(refraction, 'request');
        const queueView = this.resources.textureViewOf(refraction, 'queue');
        if (count?.subkind !== 'indirect' || requestView === undefined || queueView === undefined) {
            this.pixels = 0;
            return;
        }
        const sources = [requestView, queueView, count];
        if (sources.some((s, k) => s !== this.bound[k])) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [refractionResources.request, requestView],
                    [refractionResources.queueOut, queueView],
                    [refractionResources.queueCount, count],
                ]),
            );
            if (this.bound.length === 0) c.prepare(QUEUE);
            this.countToArgs.prepare(count);
            this.bound = sources;
        }
        this.queueCount = count;
        this.pixels = request.width * request.height;
    }
}
