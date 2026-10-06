import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { FlowRegistry } from '../flows/FlowRegistry';
import { ExecutionSystem } from '../systems/ExecutionSystem';
import type { Frame } from '../../core/contracts/Frame';
import type { EngineCore } from '../../core/contracts/EngineCore';

function tracingCore(order: string[]): EngineCore {
    return {
        record: vi.fn((label: unknown, body?: unknown) => {
            order.push('record');
            const fn = typeof label === 'function' ? label : body;
            (fn as (frame: Frame) => void)({} as Frame);
        }),
        submit: vi.fn(() => order.push('submit')),
        withErrorScope: vi.fn(async (_f: string, body: () => void) => {
            body();
            return Promise.resolve();
        }),
        setFrameProfiling: vi.fn(),
        lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
    } as unknown as EngineCore;
}

describe('ExecutionSystem frameRecording', () => {
    it('emite frameRecording com o elapsed do tick antes de gravar o quadro', () => {
        const order: string[] = [];
        const events = new DefaultEventBus();
        new ExecutionSystem(tracingCore(order), events, new FlowRegistry());
        const seen: number[] = [];
        events.on('frameRecording', (e) => {
            order.push('frameRecording');
            seen.push(e.elapsed);
        });
        events.on('frameComplete', () => order.push('frameComplete'));
        events.emit('frameTick', { dt: 1 / 60, elapsed: 2.5 });
        expect(order).toEqual(['frameRecording', 'record', 'submit', 'frameComplete']);
        expect(seen).toEqual([2.5]);
    });

    it('emite frameRecording também no modo captureErrors', () => {
        const order: string[] = [];
        const events = new DefaultEventBus();
        const exec = new ExecutionSystem(tracingCore(order), events, new FlowRegistry());
        exec.captureErrors = true;
        events.on('frameRecording', () => order.push('frameRecording'));
        events.emit('frameTick', { dt: 1 / 60, elapsed: 0 });
        expect(order.slice(0, 2)).toEqual(['frameRecording', 'record']);
    });
});
