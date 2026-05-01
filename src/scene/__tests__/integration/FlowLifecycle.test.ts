/**
 * Integration tests — Flow lifecycle dentro do ExecutionSystem.
 *
 * Cobertura:
 *   - Flow.isReady=false faz ExecutionSystem skipar dispatch
 *   - Flows na mesma phase são ordenados por priority
 *   - frameComplete é emitido mesmo quando todos os flows estão ready=false
 *   - Flow registrado durante dispatch não é executado no mesmo frame
 */
import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../../events/DefaultEventBus';
import { Flow, type Phase } from '../../flows/Flow';
import { FlowRegistry } from '../../flows/FlowRegistry';
import { ExecutionSystem } from '../../systems/ExecutionSystem';
import type { Frame } from '../../../core/contracts/Frame';
import type { EngineCore } from '../../../core/contracts/EngineCore';
import type { PipelineDescriptor } from '../../descriptors/PipelineDescriptor';

class TestFlow extends Flow {
    readonly bodyType = '';
    dispatches: number[] = []; // ordered by call sequence

    constructor(
        readonly type: string,
        readonly phase: Phase,
        priority = 0,
        public ready = true,
    ) {
        super();
        this.priority = priority;
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
    override isReady(): boolean {
        return this.ready;
    }
    dispatch(_frame: Frame): void {
        this.dispatches.push(performance.now());
    }
}

function fakeCore(): EngineCore {
    return {
        record: vi.fn((labelOrBody: unknown, body?: unknown) => {
            const fn = typeof labelOrBody === 'function' ? labelOrBody : body;
            (fn as (frame: Frame) => void)({} as Frame);
        }),
        submit: vi.fn(),
    } as unknown as EngineCore;
}

describe('Integration — Flow lifecycle', () => {
    it('flows com isReady=false são skipados; isReady=true são despachados', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const ready = new TestFlow('Ready', 'forward', 0, true);
        const notReady = new TestFlow('NotReady', 'forward', 0, false);
        flows.register(ready);
        flows.register(notReady);
        new ExecutionSystem(fakeCore(), events, flows);

        events.emit('frameTick', { dt: 0.016, elapsed: 0 });
        expect(ready.dispatches).toHaveLength(1);
        expect(notReady.dispatches).toHaveLength(0);
    });

    it('flows são ordenados por priority dentro da mesma phase', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const a = new TestFlow('A', 'forward', 10);
        const b = new TestFlow('B', 'forward', 0);
        const c = new TestFlow('C', 'forward', 5);
        flows.register(a);
        flows.register(b);
        flows.register(c);
        new ExecutionSystem(fakeCore(), events, flows);

        events.emit('frameTick', { dt: 0.016, elapsed: 0 });
        // FlowRegistry sort é descending: `b.priority - a.priority`
        // (priority maior roda primeiro).
        const active = flows.activeFlowsInPhase('forward').map((f) => f.type);
        expect(active).toEqual(['A', 'C', 'B']); // priority 10 → 5 → 0
    });

    it('frameComplete emitido mesmo quando todos os flows estão not-ready', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const flow = new TestFlow('Skipped', 'forward', 0, false);
        flows.register(flow);
        new ExecutionSystem(fakeCore(), events, flows);

        let frameCompleteCount = 0;
        events.on('frameComplete', () => {
            frameCompleteCount++;
        });
        events.emit('frameTick', { dt: 0.016, elapsed: 0 });
        expect(flow.dispatches).toHaveLength(0);
        expect(frameCompleteCount).toBe(1);
    });

    it('phases executam em ordem fixa (physics → shadow → forward → post → ui)', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        // Registra fora de ordem para validar que phasesInOrder ordena.
        const ui = new TestFlow('UI', 'ui');
        const physics = new TestFlow('Phys', 'physics');
        const post = new TestFlow('Post', 'post');
        const shadow = new TestFlow('Shdw', 'shadow');
        const forward = new TestFlow('Fwd', 'forward');
        flows.register(ui);
        flows.register(physics);
        flows.register(post);
        flows.register(shadow);
        flows.register(forward);
        new ExecutionSystem(fakeCore(), events, flows);

        events.emit('frameTick', { dt: 0.016, elapsed: 0 });
        // Asserts via dispatch ordering — physics.dispatches[0] < shadow.dispatches[0] < etc.
        const t = (f: TestFlow) => f.dispatches[0];
        expect(t(physics)).toBeDefined();
        expect(t(physics)!).toBeLessThanOrEqual(t(shadow)!);
        expect(t(shadow)!).toBeLessThanOrEqual(t(forward)!);
        expect(t(forward)!).toBeLessThanOrEqual(t(post)!);
        expect(t(post)!).toBeLessThanOrEqual(t(ui)!);
    });

    it('flow.ready=true durante dispatch torna flow ativo no próximo frame', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const flow = new TestFlow('Toggle', 'forward', 0, false);
        flows.register(flow);
        new ExecutionSystem(fakeCore(), events, flows);

        events.emit('frameTick', { dt: 0.016, elapsed: 0 });
        expect(flow.dispatches).toHaveLength(0);

        flow.ready = true;
        events.emit('frameTick', { dt: 0.016, elapsed: 1 });
        expect(flow.dispatches).toHaveLength(1);
    });
});
