import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { Flow } from '../flows/Flow';
import { FlowRegistry } from '../flows/FlowRegistry';
import type { Phase } from '../flows/Flow';
import { ExecutionSystem } from '../systems/ExecutionSystem';
import type { Frame } from '../../core/contracts/Frame';
import type { EngineCore } from '../../core/contracts/EngineCore';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';

class StubFlow extends Flow {
    readonly type = 'StubFlow';
    readonly bodyType = 'stub';
    readonly phase: Phase = 'forward';
    onPoolCalls: string[] = [];
    onCanvasCalls: { w: number; h: number }[] = [];
    onEntitiesCalls: (readonly number[])[] = [];
    dispatchCalls = 0;

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
    dispatch(_frame: Frame): void {
        this.dispatchCalls++;
    }
    override onPoolReallocated(poolKey: string): void {
        this.onPoolCalls.push(poolKey);
    }
    override onCanvasResized(width: number, height: number): void {
        this.onCanvasCalls.push({ w: width, h: height });
    }
    override onEntitiesRemoved(entityIds: readonly number[]): void {
        this.onEntitiesCalls = [...this.onEntitiesCalls, entityIds];
    }
}

function fakeCore(): EngineCore {
    return {
        record: vi.fn((_label: unknown, body?: unknown) => {
            const fn = typeof _label === 'function' ? _label : body;
            (fn as (frame: Frame) => void)({} as Frame);
        }),
        submit: vi.fn(),
    } as unknown as EngineCore;
}

describe('ExecutionSystem broadcasts', () => {
    it('poolReallocated propaga para todos os flows', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const f1 = new StubFlow();
        const f2 = new StubFlow();
        flows.register(f1);
        flows.register(f2);
        new ExecutionSystem(fakeCore(), events, flows);
        events.emit('poolReallocated', {
            poolKey: 'LCPSchema',
            oldByteSize: 256,
            newByteSize: 512,
        });
        expect(f1.onPoolCalls).toEqual(['LCPSchema']);
        expect(f2.onPoolCalls).toEqual(['LCPSchema']);
    });

    it('canvasReconfigured propaga para todos os flows', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const f1 = new StubFlow();
        const f2 = new StubFlow();
        flows.register(f1);
        flows.register(f2);
        new ExecutionSystem(fakeCore(), events, flows);
        events.emit('canvasReconfigured', { width: 1024, height: 768, format: 'rgba8unorm' });
        expect(f1.onCanvasCalls).toEqual([{ w: 1024, h: 768 }]);
        expect(f2.onCanvasCalls).toEqual([{ w: 1024, h: 768 }]);
    });

    it('entitiesRemoved propaga para todos os flows', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const f1 = new StubFlow();
        flows.register(f1);
        new ExecutionSystem(fakeCore(), events, flows);
        events.emit('entitiesRemoved', { entityIds: [1, 2, 3] as never });
        expect(f1.onEntitiesCalls).toHaveLength(1);
        expect(f1.onEntitiesCalls[0]).toEqual([1, 2, 3]);
    });

    it('entitiesRemoved vazio é no-op', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const f1 = new StubFlow();
        flows.register(f1);
        new ExecutionSystem(fakeCore(), events, flows);
        events.emit('entitiesRemoved', { entityIds: [] as never });
        expect(f1.onEntitiesCalls).toHaveLength(0);
    });

    it('frameTick chama dispatch dos flows ready + emite frameComplete', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const f1 = new StubFlow();
        flows.register(f1);
        new ExecutionSystem(fakeCore(), events, flows);
        let frameCompleteCount = 0;
        events.on('frameComplete', () => {
            frameCompleteCount++;
        });
        events.emit('frameTick', { dt: 0.016, elapsed: 0 });
        expect(f1.dispatchCalls).toBe(1);
        expect(frameCompleteCount).toBe(1);
    });
});
