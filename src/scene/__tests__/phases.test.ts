import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { Flow, type Phase } from '../flows/Flow';
import { FlowRegistry } from '../flows/FlowRegistry';
import { ExecutionSystem } from '../systems/ExecutionSystem';
import type { Frame } from '../../core/contracts/Frame';
import type { EngineCore } from '../../core/contracts/EngineCore';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';

class TraceFlow extends Flow {
    readonly bodyType = '';
    constructor(
        readonly type: string,
        readonly phase: Phase,
        private readonly trace: string[],
    ) {
        super();
    }
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
    dispatch(_frame: Frame): void {
        this.trace.push(this.type);
    }
}

function fakeCore(): EngineCore {
    return {
        record: vi.fn((label: unknown, body?: unknown) => {
            const fn = typeof label === 'function' ? label : body;
            (fn as (frame: Frame) => void)({} as Frame);
        }),
        submit: vi.fn(),
    } as unknown as EngineCore;
}

describe('fases do quadro', () => {
    it('inclui transform entre physics e shadow', () => {
        expect(new FlowRegistry().phasesInOrder()).toEqual([
            'physics',
            'transform',
            'shadow',
            'forward',
            'post',
            'ui',
        ]);
    });

    it('ExecutionSystem despacha a fase transform depois da física e antes da sombra', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const trace: string[] = [];
        flows.register(new TraceFlow('shadow', 'shadow', trace));
        flows.register(new TraceFlow('transform', 'transform', trace));
        flows.register(new TraceFlow('physics', 'physics', trace));
        new ExecutionSystem(fakeCore(), events, flows);
        events.emit('frameTick', { dt: 1 / 60, elapsed: 0 });
        expect(trace).toEqual(['physics', 'transform', 'shadow']);
    });
});
