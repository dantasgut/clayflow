import { describe, expect, it } from 'vitest';
import type {
    Binder,
    ComputePipelineSpec,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../core/contracts/index';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { StructSchema } from '../descriptors/StructSchema';
import { Flow } from '../flows/Flow';
import type { BindingSource, BoundFlow, TransitionContext } from '../flows/FlowBinding';
import type { FlowTransitions } from '../flows/FlowTransitions';
import { FlowWork } from '../flows/FlowWork';
import { slot, type WorkSlot } from '../flows/slots';
import { wgslModule } from '../shaders/WgslModule';
import { wgslResource, type WgslResource } from '../shaders/WgslResource';
import { ResourceSystem } from '../systems/ResourceSystem';
import { World } from '../world/World';
import { memoryCore } from './helpers/memoryCore';

class OwnerWork extends FlowWork {
    static readonly schema = new StructSchema('OwnerWork', {});
}

interface Slots {
    readonly [name: string]: WorkSlot<OwnerWork>;
    readonly work: WorkSlot<OwnerWork>;
}

class Owner extends Flow<Slots, 'idle'> {
    readonly type = 'Owner';
    readonly slots: Slots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<Slots>> = {
        '*': { slotsResolved: 'ignore', pipelinesCompiled: 'ignore' },
    };
    constructor(work: OwnerWork) {
        super();
        this.slots = { work: slot.work(() => work) };
    }
    dispatch(_frame: Frame, _bound: BoundFlow<Slots>): void {}
}

const src = wgslResource({
    name: 'wp_src',
    binding: { storage: 'read' },
    type: { wgsl: 'f32', array: true },
    frequency: 'stage',
    provider: 'private',
});
const dst = wgslResource({
    name: 'wp_dst',
    binding: { storage: 'read_write' },
    type: { wgsl: 'f32', array: true },
    frequency: 'stage',
    provider: 'private',
});
const params = wgslResource({
    name: 'wp_params',
    binding: { uniform: true },
    type: { wgsl: 'vec4u' },
    frequency: 'draw',
    provider: 'private',
});
const copy = wgslModule({
    name: 'wp_copy',
    requires: [src, dst, params],
    source: 'override WP_SCALE: f32 = 1.0;\n@compute @workgroup_size(64) fn wp_main(@builtin(global_invocation_id) id: vec3u) { wp_dst[id.x] = wp_src[id.x + wp_params.x] * WP_SCALE; }',
});

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core } = memoryCore();
    const resources = new ResourceSystem(core, events, world);
    const work = new OwnerWork();
    resources.ensureFlowAllocated(new Owner(work), { type: 'Owner', phase: 'physics' });
    const buffer = (d: string): StorageBufferSpec => ({
        kind: 'buffer',
        subkind: 'storage',
        discriminator: d,
        byteSize: 256,
    });
    const ubo: UniformBufferSpec = {
        kind: 'buffer',
        subkind: 'uniform',
        discriminator: 'wp_u',
        byteSize: 16,
    };
    return { core, work, buffer, ubo };
}

describe('WorkPipelines — os kernels das partes do trabalho pela C2 (T060g)', () => {
    it('o kernel fica pronto com as suas fontes; grupos por frequência; constantes no pipeline', () => {
        const { work, buffer, ubo } = setup();
        const id = work.pipelines.kernel({
            discriminator: 'wp',
            shader: copy,
            entryPoint: 'wp_main',
            bindings: new Map<WgslResource, BindingSource>([
                [src, buffer('a')],
                [dst, buffer('b')],
                [params, ubo],
            ]),
            constants: { WP_SCALE: 2 },
        });
        const k = work.pipelines.compute(id)!;
        expect(k.ready).toBe(true);
        expect(k.groupsOf('stage').map((g) => g.index)).toEqual([0]);
        expect(k.groupsOf('draw').map((g) => g.index)).toEqual([1]);
        expect(k.spec.constants).toEqual({ WP_SCALE: 2 });
    });

    it('o mesmo recurso em dois kernels: cada um com a sua fonte (a ligação é do pipeline)', () => {
        const { work, buffer, ubo } = setup();
        const make = (from: string, to: string): string =>
            work.pipelines.kernel({
                discriminator: 'wp',
                shader: copy,
                entryPoint: 'wp_main',
                bindings: new Map<WgslResource, BindingSource>([
                    [src, buffer(from)],
                    [dst, buffer(to)],
                    [params, ubo],
                ]),
            });
        const ab = make('a', 'b');
        const ba = make('b', 'a');
        expect(ab).not.toBe(ba);
        const stage = (id: string) =>
            JSON.stringify(work.pipelines.compute(id)!.groupsOf('stage')[0]!.spec.bindings);
        expect(stage(ab)).toContain('"a"');
        expect(stage(ab)).not.toBe(stage(ba));
    });

    it('recurso usado sem fonte → erro; `use` de um kernel que não existe acusa', () => {
        const { work, buffer } = setup();
        expect(() =>
            work.pipelines.kernel({
                discriminator: 'wp',
                shader: copy,
                entryPoint: 'wp_main',
                bindings: new Map<WgslResource, BindingSource>([
                    [src, buffer('a')],
                    [dst, buffer('b')],
                ]),
            }),
        ).toThrow(/wp_params.*sem fonte/);
        expect(() => {
            work.pipelines.use({} as Binder<ComputePipelineSpec>, 'nada');
        }).toThrow(/não está pronto/);
    });

    it('release libera o pipeline', () => {
        const { work, buffer, ubo } = setup();
        const id = work.pipelines.kernel({
            discriminator: 'wp',
            shader: copy,
            entryPoint: 'wp_main',
            bindings: new Map<WgslResource, BindingSource>([
                [src, buffer('a')],
                [dst, buffer('b')],
                [params, ubo],
            ]),
        });
        work.pipelines.release(id);
        expect(work.pipelines.compute(id)).toBeUndefined();
    });

    it('fora de um Flow, o trabalho não tem pipelines', () => {
        expect(() => new OwnerWork().pipelines).toThrow(/não foram entregues/);
    });
});
