import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { FlowRegistry } from '../flows/FlowRegistry';
import { ExecutionSystem } from '../systems/ExecutionSystem';
import type { EngineCore } from '../../core/contracts/index';

function fakeCore(
    opts: {
        withErrorScope?: (filter: GPUErrorFilter, body: () => void) => Promise<void>;
    } = {},
): EngineCore {
    const recorded: string[] = [];
    return {
        record: vi.fn((labelOrBody: unknown, body?: unknown) => {
            recorded.push('record');
            const fn = typeof labelOrBody === 'function' ? labelOrBody : body;
            (fn as (frame: unknown) => void)({});
        }),
        submit: vi.fn(() => {
            recorded.push('submit');
        }),
        withErrorScope:
            opts.withErrorScope
            ?? (async (_filter: GPUErrorFilter, body: () => void) => {
                body();
            }),
    } as unknown as EngineCore;
}

describe('ExecutionSystem.engineError', () => {
    it('captureErrors=false: erro propaga (comportamento legado)', () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const core = fakeCore();
        const sys = new ExecutionSystem(core, events, flows);
        sys.captureErrors = false;
        let emitted = 0;
        events.on('engineError', () => {
            emitted++;
        });
        events.emit('frameTick', { dt: 0.016, elapsed: 0 });
        expect(emitted).toBe(0);
    });

    it('captureErrors=true: validation error vira engineError sem throw', async () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const core = fakeCore({
            withErrorScope: (_filter, body) => {
                body();
                return Promise.reject(new Error('[validation] shader compile failed'));
            },
        });
        const sys = new ExecutionSystem(core, events, flows);
        sys.captureErrors = true;
        const seen: { stage: string; filter: GPUErrorFilter; message: string }[] = [];
        events.on('engineError', (e) => {
            seen.push(e);
        });
        events.emit('frameTick', { dt: 0.016, elapsed: 0 });
        // O .catch() é uma microtask: aguardamos antes de assertir.
        await Promise.resolve();
        await Promise.resolve();
        expect(seen.length).toBe(1);
        expect(seen[0]?.stage).toBe('frame');
        expect(seen[0]?.filter).toBe('validation');
        expect(seen[0]?.message).toContain('shader compile failed');
    });

    it('captureErrors=true sem erro: engineError não emitido', async () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const core = fakeCore();
        const sys = new ExecutionSystem(core, events, flows);
        sys.captureErrors = true;
        let emitted = 0;
        events.on('engineError', () => {
            emitted++;
        });
        events.emit('frameTick', { dt: 0.016, elapsed: 0 });
        await Promise.resolve();
        await Promise.resolve();
        expect(emitted).toBe(0);
    });

    it('captureErrors=true: frameComplete emitido mesmo após erro (loop continua)', async () => {
        const events = new DefaultEventBus();
        const flows = new FlowRegistry();
        const core = fakeCore({
            withErrorScope: (_filter, body) => {
                body();
                return Promise.reject(new Error('[validation] x'));
            },
        });
        const sys = new ExecutionSystem(core, events, flows);
        sys.captureErrors = true;
        let frameComplete = 0;
        events.on('frameComplete', () => {
            frameComplete++;
        });
        events.emit('frameTick', { dt: 0.016, elapsed: 0 });
        await Promise.resolve();
        expect(frameComplete).toBe(1);
    });
});
