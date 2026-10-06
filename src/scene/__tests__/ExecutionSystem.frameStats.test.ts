import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { FlowRegistry } from '../flows/FlowRegistry';
import { ExecutionSystem } from '../systems/ExecutionSystem';
import type { EngineCore, Frame, FrameStats } from '../../core/contracts/index';
import type { FrameCompleteEvent } from '../events/FrameCompleteEvent';

/** Core falso: cada submit publica as estatísticas da gravação (por rótulo). */
function statsCore(byLabel: Record<string, FrameStats>): EngineCore {
    let current = '';
    let last: FrameStats = { drawCalls: 0, dispatches: 0, passes: 0 };
    return {
        record: vi.fn((label: unknown, body?: unknown) => {
            current = typeof label === 'string' ? label : '';
            const fn = typeof label === 'function' ? label : body;
            (fn as (frame: Frame) => void)({} as Frame);
        }),
        submit: vi.fn(() => {
            last = byLabel[current] ?? { drawCalls: 0, dispatches: 0, passes: 0 };
        }),
        setFrameProfiling: vi.fn(),
        lastFrameStats: vi.fn(() => last),
    } as unknown as EngineCore;
}

function busyWait(ms: number): void {
    const end = performance.now() + ms;
    while (performance.now() < end) {
        /* espera sintética */
    }
}

describe('ExecutionSystem — frameComplete.stats e dt', () => {
    it('payload carrega as estatísticas do quadro vindas do core', () => {
        const events = new DefaultEventBus();
        const frameStats = { drawCalls: 7, dispatches: 2, passes: 3, gpuTimeMs: 1.5, gpuFrame: 4 };
        new ExecutionSystem(statsCore({ frame: frameStats }), events, new FlowRegistry());
        const seen: FrameCompleteEvent[] = [];
        events.on('frameComplete', (e) => seen.push(e));
        events.emit('frameTick', { dt: 1 / 60, elapsed: 0 });
        expect(seen[0]?.stats).toEqual(frameStats);
    });

    it('dt inclui o tempo gasto pelos ouvintes de frameRecording', () => {
        const events = new DefaultEventBus();
        new ExecutionSystem(statsCore({}), events, new FlowRegistry());
        events.on('frameRecording', () => {
            busyWait(15);
        });
        let dt = 0;
        events.on('frameComplete', (e) => {
            dt = e.dt;
        });
        events.emit('frameTick', { dt: 1 / 60, elapsed: 0 });
        expect(dt).toBeGreaterThanOrEqual(14);
    });

    it('gravação auxiliar entre quadros não altera o stats do quadro seguinte', () => {
        const events = new DefaultEventBus();
        const core = statsCore({
            frame: { drawCalls: 5, dispatches: 1, passes: 2 },
            'pool_grow:Transform': { drawCalls: 0, dispatches: 0, passes: 0 },
        });
        new ExecutionSystem(core, events, new FlowRegistry());
        const seen: FrameStats[] = [];
        events.on('frameComplete', (e) => seen.push(e.stats));
        events.emit('frameTick', { dt: 1 / 60, elapsed: 0 });
        core.record('pool_grow:Transform', () => undefined);
        core.submit();
        events.emit('frameTick', { dt: 1 / 60, elapsed: 1 / 60 });
        expect(seen).toEqual([
            { drawCalls: 5, dispatches: 1, passes: 2 },
            { drawCalls: 5, dispatches: 1, passes: 2 },
        ]);
    });
});
