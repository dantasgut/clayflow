import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { Frame, TextureViewSpec } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type SingletonSlot, type SlotMap } from '../../../scene/flows/slots';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { Sky } from './Sky';
import { skyAmbientKernel, skyOutputs } from './shaders';

/** Slots do estágio da luz do céu. */
export interface SkyAmbientSlots extends SlotMap {
    readonly sky: SingletonSlot<false>;
}

type Ctx = TransitionContext<SkyAmbientSlots>;

const AMBIENT: PipelineDescriptor = {
    id: 'sky_ambient',
    role: 'compute',
    shader: skyAmbientKernel,
    entryPoints: ['sky_ambient_main'],
};

/**
 * SkyAmbientFlow — a luz do céu nas superfícies sem iluminação global (spec 041; fase `shadow`, depois da luz das nuvens,
 * que ela lê pelo céu coberto): o céu e o chão médios do ambiente da cena, a cada quadro, um grupo. Só quando o `Sky`
 * ilumina as superfícies (`Sky.setAmbient`, pelos estágios padrão: sem `GlobalIllumination`).
 */
export class SkyAmbientFlow extends Flow<SkyAmbientSlots, 'idle'> {
    readonly type = 'SkyAmbientFlow';
    readonly slots: SkyAmbientSlots = { sky: slot.singleton(Sky.schema) };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private view: TextureViewSpec | undefined;
    private active = false;

    constructor(ctx: FlowContext) {
        super();
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
                bindGroupReplaced: 'ignore',
            },
        };
    }

    /** O céu e o chão médios, num grupo. */
    dispatch(frame: Frame, bound: BoundFlow<SkyAmbientSlots>): void {
        if (!this.active) return;
        const p = bound.pipelines.get(AMBIENT.id);
        if (p?.role !== 'compute' || !p.ready) return;
        frame.compute('SkyAmbientFlow', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.invocations(WORKGROUP_SIZE.value, WORKGROUP_SIZE.value);
        });
    }

    private prepare(c: Ctx): void {
        const sky = c.bound.slots.sky.resource as Sky;
        this.active = sky.lightsSurfaces;
        if (!this.active) return;
        this.resources.ensureAllocated(sky, 'ambient');
        const view = c.bound.slots.sky.textureViewOf('ambient');
        if (view === undefined) {
            this.active = false;
            return;
        }
        if (view !== this.view) {
            c.bind(new Map<WgslResource, BindingSource>([[skyOutputs.ambient, view]]));
            if (this.view === undefined) c.prepare(AMBIENT);
            this.view = view;
        }
    }
}
