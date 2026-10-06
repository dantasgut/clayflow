import { describe, expect, it } from 'vitest';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { DebugFlow, type ProfilerStatsEvent } from '../DebugFlow';

const zero = { drawCalls: 0, dispatches: 0, passes: 0 };

describe('DebugFlow — stagesNs', () => {
    it('preenche stagesNs com os tempos por passe da última leitura do profiler', () => {
        const events = new DefaultEventBus();
        const debug = new DebugFlow().bindEvents(events);
        debug.setEnabled(true);
        const seen: ProfilerStatsEvent[] = [];
        events.on('profilerStats', (e) => seen.push(e));
        events.emit('frameComplete', {
            timestamp: 0,
            dt: 1,
            elapsed: 0,
            stats: {
                ...zero,
                gpuTimeMs: 0.9,
                gpuFrame: 0,
                stagesNs: { TransformFlow: 100_000, forward: 800_000 },
            },
        });
        events.emit('frameTick', { dt: 1 / 60, elapsed: 1 });
        expect(seen[0]?.stagesNs).toEqual({ TransformFlow: 100_000, forward: 800_000 });
    });

    it('sem leitura de GPU, stagesNs fica vazio', () => {
        const events = new DefaultEventBus();
        const debug = new DebugFlow().bindEvents(events);
        debug.setEnabled(true);
        const seen: ProfilerStatsEvent[] = [];
        events.on('profilerStats', (e) => seen.push(e));
        events.emit('frameComplete', { timestamp: 0, dt: 1, elapsed: 0, stats: zero });
        events.emit('frameTick', { dt: 1 / 60, elapsed: 1 });
        expect(seen[0]?.stagesNs).toEqual({});
    });
});
