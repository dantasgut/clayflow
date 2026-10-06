import { describe, expect, it, vi } from 'vitest';
import { TransformFlow } from '../flows/TransformFlow';
import { Transform } from '../Transform';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { validateWgslReferences } from '../../../scene/flows/validateWgslReferences';
import type { PoolDirectory } from '../../../scene/contracts/PoolDirectory';
import type { Resource } from '../../../scene/contracts/Resource';
import type {
    BindGroupSpec,
    EngineCore,
    Frame,
    StorageBufferSpec,
} from '../../../core/contracts/index';

function storage(name: string): StorageBufferSpec {
    return { kind: 'buffer', subkind: 'storage', discriminator: name, byteSize: 1024 };
}

function setup(count = 3) {
    const buffers = { Transform: storage('t0'), WorldTransform: storage('w0') };
    const state = { count };
    const pools: PoolDirectory = {
        poolBufferSpec: (k) => buffers[k as keyof typeof buffers],
        poolCount: (k) => (k === 'Transform' ? state.count : 0),
        poolSlotOf: () => undefined,
        poolKeyForResource: (r) => (r as { pool?: string }).pool ?? undefined,
    };
    const core = {
        create: vi.fn(<S>(spec: S) => spec),
        createAsync: vi.fn(<S>(spec: S) => Promise.resolve(spec)),
        write: vi.fn(),
        destroy: vi.fn(),
        setFrameProfiling: vi.fn(),
        lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
    } as unknown as EngineCore;
    const workgroups: number[] = [];
    const bindGroups: BindGroupSpec[] = [];
    const frame = {
        compute: vi.fn((_label: string, body: (pass: unknown) => void) => {
            const pass = {
                bind: {
                    setPipeline: () => pass.bind,
                    setBindGroup: (_i: number, bg: BindGroupSpec) => {
                        bindGroups.push(bg);
                        return pass.bind;
                    },
                },
                dispatch: {
                    workgroups: (x: number) => {
                        workgroups.push(x);
                        return pass.dispatch;
                    },
                },
                marker: () => undefined,
            };
            body(pass);
        }),
    } as unknown as Frame;
    const events = new DefaultEventBus();
    const flow = new TransformFlow(core, pools, events);
    return { flow, frame, events, workgroups, bindGroups, buffers, state, core };
}

function fakeResource(pool: string): Resource {
    return { pool } as unknown as Resource;
}

describe('TransformFlow', () => {
    it('roda na fase transform', () => {
        expect(setup().flow.phase).toBe('transform');
    });

    it('despacha na primeira vez com ceil(count/64) workgroups e não repete sem mudança', () => {
        const { flow, frame, workgroups } = setup(130);
        flow.dispatch(frame);
        expect(workgroups).toEqual([3]);
        flow.dispatch(frame);
        expect(workgroups).toEqual([3]);
    });

    it('despacha de novo após resourceReady de um recurso do pool Transform', () => {
        const { flow, frame, events, workgroups } = setup();
        flow.dispatch(frame);
        events.emit('resourceReady', { payload: { resource: fakeResource('Transform') } });
        flow.dispatch(frame);
        expect(workgroups).toHaveLength(2);
    });

    it('ignora resourceReady de recursos de outros pools', () => {
        const { flow, frame, events, workgroups } = setup();
        flow.dispatch(frame);
        events.emit('resourceReady', { payload: { resource: fakeResource('Camera') } });
        flow.dispatch(frame);
        expect(workgroups).toHaveLength(1);
    });

    it('recria o kernel com os novos buffers e despacha após poolReallocated', () => {
        const { flow, frame, workgroups, bindGroups, buffers } = setup();
        flow.dispatch(frame);
        buffers.WorldTransform = storage('w1');
        flow.onPoolReallocated('WorldTransform');
        flow.dispatch(frame);
        expect(workgroups).toHaveLength(2);
        const bound = bindGroups
            .at(-1)!
            .bindings.map((b) => (b.kind === 'buffer' ? b.buffer.discriminator : undefined));
        expect(bound).toContain('w1');
    });

    it('não despacha com o pool vazio', () => {
        const { flow, frame, workgroups } = setup(0);
        flow.dispatch(frame);
        expect(workgroups).toHaveLength(0);
    });

    it('escreve os parâmetros só quando a contagem muda', () => {
        const { flow, frame, events, core, state } = setup(3);
        flow.dispatch(frame);
        events.emit('resourceReady', { payload: { resource: fakeResource('Transform') } });
        flow.dispatch(frame);
        expect(core.write).toHaveBeenCalledTimes(1);
        state.count = 5;
        events.emit('resourceReady', { payload: { resource: fakeResource('Transform') } });
        flow.dispatch(frame);
        expect(core.write).toHaveBeenCalledTimes(2);
    });

    it('o shader composto é válido para validateWgslReferences e lê os pools certos', () => {
        const [desc] = setup().flow.getPipelineDescriptors();
        expect(() => {
            validateWgslReferences(desc!.shaderSource, 'transform_compose');
        }).not.toThrow();
        expect(desc!.consumes).toEqual([Transform.schema.name]);
    });
});
