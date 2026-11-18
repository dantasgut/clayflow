import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { Frame } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type ChannelSlot,
    type SingletonSlot,
    type SlotMap,
    type TextureSlot,
} from '../../../scene/flows/slots';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { Sky } from '../../scene/sky/Sky';
import { CloudLayer } from './CloudLayer';
import {
    cloudHistorySlots,
    cloudMarchKernel,
    cloudOutputs,
    cloudReconstructKernel,
    cloudResources,
    cloudUpsampleKernel,
} from './shaders';

/** Slots do estágio da marcha das nuvens. */
export interface CloudSlots extends SlotMap {
    readonly cloud: SingletonSlot<false>;
    readonly sky: SingletonSlot<true>;
    /** A profundidade da cena (depois da água). */
    readonly sceneDepth: TextureSlot<true>;
    /** As séries da marcha (spec 037). */
    readonly cloudMarch: ChannelSlot<false>;
    readonly cloudMarchDepth: ChannelSlot<false>;
}

type Ctx = TransitionContext<CloudSlots>;

/**
 * CloudFlow — as nuvens na tela (spec 041, R1, R2; fase `forward`, depois da água — a última superfície que escreve
 * profundidade — e antes da composição do céu): a marcha de um pixel por bloco 2 × 2 do alvo de ¼ (Bayer), a
 * reconstrução temporal pela série da marcha (o canal temporal da 037: lida pelo atraso 1, escrita no atraso 0 e
 * girada) e o aumento para a tela pela profundidade, que o `SkyCompositeFlow` compõe. Os pipelines seguem as amostras
 * da profundidade da cena. Sem `Sky`, nada.
 */
export class CloudFlow extends Flow<CloudSlots, 'idle'> {
    readonly type = 'CloudFlow';
    readonly slots: CloudSlots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private views: readonly unknown[] = [];
    private march: string | undefined;
    private upsample: string | undefined;
    private prepared = false;
    private active = false;

    /** `targets`: o schema dos alvos do quadro (`FrameTargets`), de onde vem a profundidade da cena. */
    constructor(ctx: FlowContext, targets: StructSchema) {
        super();
        this.resources = ctx.resources;
        this.slots = {
            cloud: slot.singleton(CloudLayer.schema),
            sky: slot.singleton(Sky.schema, { optional: true }),
            sceneDepth: slot.texture(targets, 'depth', { optional: true }),
            ...cloudHistorySlots,
        };
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
                canvasReconfigured: 'ignore',
            },
        };
    }

    /** A marcha, a reconstrução (a série gira) e o aumento. */
    dispatch(frame: Frame, bound: BoundFlow<CloudSlots>): void {
        if (!this.active || this.march === undefined || this.upsample === undefined) return;
        const march = bound.pipelines.get(this.march);
        const reconstruct = bound.pipelines.get('cloud_reconstruct');
        const upsample = bound.pipelines.get(this.upsample);
        if (
            march?.role !== 'compute'
            || !march.ready
            || reconstruct?.role !== 'compute'
            || !reconstruct.ready
            || upsample?.role !== 'compute'
            || !upsample.ready
        )
            return;
        const depth = bound.slots.sceneDepth;
        if (depth === undefined) return;
        const w = depth.texture.width;
        const h = depth.texture.height;
        const quarter = [Math.ceil(w / 2), Math.ceil(h / 2)];
        const blocks = [Math.ceil(w / 4), Math.ceil(h / 4)];
        frame.compute('CloudFlow.march', (pass) => {
            pass.bind.setPipeline(march.spec);
            march.bindTo(pass.bind);
            pass.dispatch.invocations(blocks[0]! * blocks[1]!, WORKGROUP_SIZE.value);
        });
        frame.compute('CloudFlow.reconstruct', (pass) => {
            pass.bind.setPipeline(reconstruct.spec);
            reconstruct.bindTo(pass.bind);
            pass.dispatch.invocations(quarter[0]! * quarter[1]!, WORKGROUP_SIZE.value);
        });
        bound.slots.cloudMarch.written();
        bound.slots.cloudMarchDepth.written();
        frame.compute('CloudFlow.upsample', (pass) => {
            pass.bind.setPipeline(upsample.spec);
            upsample.bindTo(pass.bind);
            pass.dispatch.invocations(w * h, WORKGROUP_SIZE.value);
        });
    }

    override dispose(): void {}

    /** Solta os pipelines e as ligações (sem céu nada roda). */
    private release(c: Ctx): void {
        this.active = false;
        if (this.prepared) c.release('cloud_reconstruct');
        if (this.march !== undefined) c.release(this.march);
        if (this.upsample !== undefined) c.release(this.upsample);
        this.prepared = false;
        this.march = undefined;
        this.upsample = undefined;
        this.views = [];
    }

    private prepare(c: Ctx): void {
        const cloud = c.bound.slots.cloud.resource as CloudLayer;
        const depth = c.bound.slots.sceneDepth;
        if (c.bound.slots.sky === undefined) {
            // O céu saiu: os pipelines (que leem o uniforme dele) saem junto — nenhum fica esperando, e o motor fica
            // pronto; voltando, são preparados de novo.
            this.release(c);
            return;
        }
        this.active = depth !== undefined;
        if (!this.active || depth === undefined) return;
        for (const id of ['trace', 'traceDepth', 'march', 'marchDepth', 'view'])
            this.resources.ensureAllocated(cloud, id);
        const views = (['trace', 'traceDepth', 'view'] as const).map((id) =>
            c.bound.slots.cloud.textureViewOf(id),
        );
        if (views.some((v) => v === undefined)) {
            this.active = false;
            return;
        }
        const multisampled = (depth.texture.sampleCount ?? 1) > 1;
        const sources = [...views, depth.view];
        if (sources.some((v, k) => v !== this.views[k])) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [cloudOutputs.trace, views[0]!],
                    [cloudOutputs.traceDepth, views[1]!],
                    [cloudOutputs.view, views[2]!],
                    [
                        multisampled ? cloudResources.sceneDepthMs : cloudResources.sceneDepth,
                        depth.view,
                    ],
                ]),
            );
            this.views = sources;
        }
        if (!this.prepared) {
            c.prepare({
                id: 'cloud_reconstruct',
                role: 'compute',
                shader: cloudReconstructKernel,
                entryPoints: ['cloud_reconstruct_main'],
            });
            this.prepared = true;
        }
        const variant = multisampled ? 'ms' : '1';
        const marchId = `cloud_march:${variant}`;
        if (marchId !== this.march) {
            if (this.march !== undefined) c.release(this.march);
            if (this.upsample !== undefined) c.release(this.upsample);
            this.march = marchId;
            this.upsample = `cloud_upsample:${variant}`;
            c.prepare({
                id: this.march,
                role: 'compute',
                shader: multisampled ? cloudMarchKernel.multisampled : cloudMarchKernel.single,
                entryPoints: ['cloud_march_main'],
            });
            c.prepare({
                id: this.upsample,
                role: 'compute',
                shader: multisampled
                    ? cloudUpsampleKernel.multisampled
                    : cloudUpsampleKernel.single,
                entryPoints: ['cloud_upsample_main'],
            });
        }
    }
}
