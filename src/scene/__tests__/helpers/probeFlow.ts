import type { Frame, UniformBufferSpec } from '../../../core/contracts/index';
import { Entity } from '../../contracts/Entity';
import { ResourceState } from '../../contracts/ResourceState';
import type { Resource } from '../../contracts/Resource';
import type { GPUDescriptor } from '../../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../descriptors/PipelineDescriptor';
import { FieldType } from '../../descriptors/FieldType';
import { StructSchema } from '../../descriptors/StructSchema';
import { SingletonResolver } from '../../consumers/strategies/SingletonResolver';
import { Flow } from '../../flows/Flow';
import type { BindingSources, BoundFlow, TransitionContext } from '../../flows/FlowBinding';
import type { FlowEvent, FlowTransitions } from '../../flows/FlowTransitions';
import { slot } from '../../flows/slots';
import { createScene, type SceneContext } from '../../SceneContext';
import { wgslModule } from '../../shaders/WgslModule';
import { countingCore } from './countingCore';

/** Corpo de teste em pool de storage. */
export const ProbeBodySchema = new StructSchema('ProbeBody', { v: FieldType.vec4f });
/** Singleton de teste (uniform individual). */
export const ProbeCamSchema = new StructSchema(
    'ProbeCam',
    { scale: FieldType.vec4f },
    { addressSpace: 'uniform' },
);
/** Uniform privado do Flow de teste. */
export const ProbeParamsSchema = new StructSchema(
    'ProbeParams',
    { k: FieldType.vec4f },
    { addressSpace: 'uniform' },
);

export class ProbeBody extends Entity implements Resource {
    static readonly schema = ProbeBodySchema;
    state: ResourceState = ResourceState.Uninitialized;
    constructor() {
        super();
        this.data = { v: [0, 0, 0, 0] };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'body',
                role: 'storage-rw',
                schema: ProbeBodySchema,
                storage: 'pool',
                upload: 'initial',
            },
        ];
    }
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

export class ProbeCam extends Entity implements Resource {
    static readonly schema = ProbeCamSchema;
    state: ResourceState = ResourceState.Uninitialized;
    constructor() {
        super();
        this.data = { scale: [1, 1, 1, 1] };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'cam', role: 'uniform', schema: ProbeCamSchema }];
    }
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

/**
 * `cam` só é citada numa função auxiliar (`scale_of`) chamada pela entrada; `params` é privado; `bodies` vem do
 * pool pelo tipo `ProbeBody` em `consumes`.
 */
export const probeShader = wgslModule({
    name: 'probe',
    structs: [ProbeCamSchema, ProbeBodySchema, ProbeParamsSchema],
    source: `
@group(0) @binding(0) var<uniform> cam: ProbeCam;
@group(0) @binding(1) var<storage, read_write> bodies: array<ProbeBody>;
@group(1) @binding(0) var<uniform> params: ProbeParams;
fn scale_of() -> vec4f { return cam.scale; }
@compute @workgroup_size(64) fn probe_main(@builtin(global_invocation_id) id: vec3u) {
    bodies[id.x].v = scale_of() * params.k;
}
`,
});

/** Slots do Flow de teste; o tipo vem do próprio objeto (idioma dos Flows). */
const probeSlots = { bodies: slot.bodies(), cam: slot.singleton(ProbeCamSchema) };
export type ProbeSlots = typeof probeSlots;
export type ProbeState = 'idle' | 'busy';

export interface ProbeFlowOptions {
    readonly pipelines?: readonly PipelineDescriptor[];
    readonly bindings?: BindingSources;
    readonly transitions?: FlowTransitions<ProbeState, TransitionContext<ProbeSlots>>;
}

/** Descritor padrão do pipeline do Flow de teste. */
export function probePipeline(overrides: Partial<PipelineDescriptor> = {}): PipelineDescriptor {
    return {
        id: 'main',
        role: 'compute',
        shader: probeShader,
        entryPoints: ['probe_main'],
        consumes: ['ProbeCam', 'ProbeBody'],
        ...overrides,
    };
}

/** Flow de teste: registra os eventos recebidos e as gravações. */
export class ProbeFlow extends Flow<ProbeSlots, ProbeState> {
    readonly type = 'ProbeFlow';
    readonly slots = probeSlots;
    override readonly pipelines: readonly PipelineDescriptor[];
    override readonly bindings: BindingSources;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<ProbeState, TransitionContext<ProbeSlots>>;
    readonly events: FlowEvent[] = [];
    readonly dispatched: number[] = [];
    disposed = false;

    constructor(params: UniformBufferSpec, options: ProbeFlowOptions = {}) {
        super();
        this.pipelines = options.pipelines ?? [probePipeline()];
        this.bindings = options.bindings ?? { params };
        const record = (event: FlowEvent): void => {
            this.events.push(event);
        };
        const stay = { to: 'idle' as const, run: record };
        this.transitions = options.transitions ?? {
            '*': {
                slotsResolved: stay,
                slotLost: stay,
                pipelinesCompiled: stay,
                bindGroupReplaced: stay,
                poolReallocated: stay,
                entitiesChanged: stay,
                canvasReconfigured: stay,
                resourceReady: stay,
            },
        };
    }

    dispatch(frame: Frame, bound: BoundFlow<ProbeSlots>): void {
        const p = bound.compute('main');
        frame.compute('ProbeFlow', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.groups.forEach((g, i) => pass.bind.setBindGroup(i, g));
            pass.dispatch.invocations(bound.slots.bodies.count, 64);
        });
        this.dispatched.push(bound.slots.bodies.count);
    }

    override dispose(): void {
        this.disposed = true;
    }
}

/** Uniform privado de teste. */
export const probeParams: UniformBufferSpec = {
    kind: 'buffer',
    subkind: 'uniform',
    discriminator: 'probe_params',
    byteSize: 16,
};

/** Cena real (C2) com o core de contagem, o resolver de `ProbeCam` e um avanço de quadro. */
export async function probeScene(): Promise<{
    scene: SceneContext;
    counting: ReturnType<typeof countingCore>;
    frame(): void;
}> {
    const counting = countingCore();
    const scene = createScene({ core: counting.core });
    await scene.initialize();
    scene.consumers.register(new SingletonResolver(ProbeCamSchema, 'cam'));
    let n = 0;
    return {
        scene,
        counting,
        frame() {
            n++;
            scene.events.emit('frameTick', {
                dt: 1 / 60,
                realDt: 1 / 60,
                elapsed: n / 60,
                frame: n,
            });
        },
    };
}
