/**
 * O Resource de trabalho do Flow (spec 039, `slot.work`): a C2 o cria e o insere no World quando aloca o Flow, o
 * entrega como singleton pela identidade (com o stride das regiões), liga o fornecedor `{ slot, descriptor }` com
 * offset dinâmico quando o descritor tem `regions`, religa o Flow na redescrição e o remove (liberando os objetos) no
 * descarte — um por instância.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Frame } from '../../core/contracts/index';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { Flow } from '../flows/Flow';
import type { BoundFlow, TransitionContext } from '../flows/FlowBinding';
import type { FlowEvent, FlowTransitions } from '../flows/FlowTransitions';
import { slot } from '../flows/slots';
import { wgslModule } from '../shaders/WgslModule';
import { wgslResource } from '../shaders/WgslResource';
import { ProbeBody, ProbeBodySchema, probeScene } from './helpers/probeFlow';

const WorkParams = new StructSchema(
    'WorkParams',
    { k: FieldType.vec4f },
    { addressSpace: 'uniform' },
);

class TestWork extends Entity<{ params: { k: number[] }[] }> implements Resource {
    static readonly schema = new StructSchema('TestWork', {});
    static created = 0;
    state: ResourceState = ResourceState.Uninitialized;
    #regions = 2;
    constructor() {
        super();
        TestWork.created++;
        this.data = { params: [] };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'params',
                role: 'uniform',
                schema: WorkParams,
                regions: { count: this.#regions },
            },
        ];
    }
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
    reserve(regions: number): void {
        if (regions === this.#regions) return;
        const previous = this.getDescriptors();
        this.#regions = regions;
        this.redescribe(previous, { params: this.data.params.slice(0, regions) });
    }
}

const bodies = wgslResource({
    name: 'bodies',
    binding: { storage: 'read_write' },
    type: { schema: ProbeBodySchema, array: true },
    frequency: 'stage',
    provider: { slot: 'bodies' },
});
const params = wgslResource({
    name: 'params',
    binding: { uniform: true },
    type: { schema: WorkParams },
    frequency: 'draw',
    provider: { slot: 'work', descriptor: 'params' },
});
const shader = wgslModule({
    name: 'work_probe',
    requires: [bodies, params],
    source: `
@compute @workgroup_size(64) fn work_main(@builtin(global_invocation_id) id: vec3u) {
    bodies[id.x].v = params.k;
}
`,
});

const slots = { bodies: slot.bodies(), work: slot.work(() => new TestWork()) };
type Slots = typeof slots;

class WorkFlow extends Flow<Slots, 'idle'> {
    readonly slots = slots;
    override readonly pipelines: readonly PipelineDescriptor[] = [
        { id: 'main', role: 'compute', shader, entryPoints: ['work_main'] },
    ];
    protected readonly initialState = 'idle' as const;
    readonly events: FlowEvent[] = [];
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<Slots>>;
    work: TestWork | undefined;
    constructor(readonly type: string) {
        super();
        const stay = {
            to: 'idle' as const,
            run: (e: FlowEvent, c: TransitionContext<Slots>) => {
                this.events.push(e);
                this.work = c.bound.slots.work.resource;
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: stay,
                slotLost: stay,
                pipelinesCompiled: stay,
                bindGroupReplaced: stay,
                poolReallocated: stay,
            },
        };
    }
    dispatch(_frame: Frame, _bound: BoundFlow<Slots>): void {}
}

/** Flow sem corpos: só o trabalho (registrado sem `bodyType`, instanciado no registro). */
const bareSlots = { work: slot.work(() => new TestWork()) };
class BareWorkFlow extends Flow<typeof bareSlots, 'idle'> {
    readonly slots = bareSlots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<typeof bareSlots>> = {
        '*': { slotsResolved: 'ignore', slotLost: 'ignore', pipelinesCompiled: 'ignore' },
    };
    constructor(readonly type: string) {
        super();
    }
    dispatch(): void {}
}

async function setup(type = 'WorkFlow') {
    const s = await probeScene();
    const ready = vi.fn();
    s.scene.events.on('flowReady', ready);
    const reg = s.scene.flows.register(() => new WorkFlow(type), {
        type,
        phase: 'physics',
        bodyType: 'ProbeBody',
    });
    s.scene.world.insert(new ProbeBody());
    s.frame();
    return { ...s, ready, reg };
}

describe('Resource de trabalho do Flow (spec 039)', () => {
    it('entra no World com o Flow, é alocado e resolvido; o Flow fica pronto', async () => {
        const s = await setup();
        const flow = s.reg.flow!;
        expect(s.ready).toHaveBeenCalled();
        const work = flow.work!;
        expect(work).toBeInstanceOf(TestWork);
        expect(s.scene.world.queryBySchemaName('TestWork')).toHaveLength(1);
        expect(s.scene.resourceSystem.bufferOf(work, 'params')?.byteSize).toBe(
            2 * s.scene.resourceSystem.regionStrideOf(work, 'params')!,
        );
    });

    it('o fornecedor { slot, descriptor } de um descritor com regions liga com offset dinâmico', async () => {
        const s = await setup();
        const created = vi
            .mocked(s.counting.core.create)
            .mock.calls.map(([spec]) => spec as unknown);
        const json = JSON.stringify(created);
        expect(json).toContain('"hasDynamicOffset":true');
    });

    it('a redescrição do trabalho religa o Flow (bindGroupReplaced)', async () => {
        const s = await setup();
        const flow = s.reg.flow!;
        flow.events.length = 0;
        flow.work!.reserve(8);
        s.frame();
        expect(flow.events.some((e) => e.type === 'bindGroupReplaced')).toBe(true);
        expect(s.scene.resourceSystem.bufferOf(flow.work!, 'params')?.byteSize).toBe(
            8 * s.scene.resourceSystem.regionStrideOf(flow.work!, 'params')!,
        );
    });

    it('sai do World no descarte do Flow e libera os objetos', async () => {
        const s = await setup();
        const flow = s.reg.flow!;
        const buffer = s.scene.resourceSystem.bufferOf(flow.work!, 'params')!;
        s.scene.flows.unregister(s.reg);
        expect(s.scene.world.queryBySchemaName('TestWork')).toHaveLength(0);
        expect(vi.mocked(s.counting.core.destroy).mock.calls.map(([spec]) => spec)).toContain(
            buffer,
        );
    });

    it('um por instância: dois Flows, dois Resources de trabalho', async () => {
        const s = await probeScene();
        const before = TestWork.created;
        s.scene.flows.register(() => new BareWorkFlow('A'), { type: 'A', phase: 'physics' });
        s.scene.flows.register(() => new BareWorkFlow('B'), { type: 'B', phase: 'physics' });
        s.frame();
        expect(TestWork.created - before).toBe(2);
        const works = s.scene.world.queryBySchemaName('TestWork');
        expect(works).toHaveLength(2);
        expect(works[0]).not.toBe(works[1]);
    });
});
