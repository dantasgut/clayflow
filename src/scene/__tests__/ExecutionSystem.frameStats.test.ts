import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { FlowRegistry } from '../flows/FlowRegistry';
import { ExecutionSystem } from '../systems/ExecutionSystem';
import type { EngineCore, Frame, FrameStats } from '../../core/contracts/index';
import type { FrameCompleteEvent } from '../events/FrameCompleteEvent';
import type { GpuFrameTimedPayload } from '../events/EventMap';
import type { Flow } from '../flows/Flow';
import type { BoundFlow } from '../flows/FlowBinding';

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
        takeFrameTimings: vi.fn(() => []),
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
        events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: 1 });
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
        events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: 1 });
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
        events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: 1 });
        core.record('pool_grow:Transform', () => undefined);
        core.submit();
        events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 1 / 60, frame: 1 });
        expect(seen).toEqual([
            { drawCalls: 5, dispatches: 1, passes: 2 },
            { drawCalls: 5, dispatches: 1, passes: 2 },
        ]);
    });

    it('grupos de depuração por fase e por Flow em volta de cada dispatch (spec 034)', () => {
        const events = new DefaultEventBus();
        const trace: string[] = [];
        const frame = {
            marker: (label: string, body: () => void) => {
                trace.push(`+${label}`);
                body();
                trace.push(`-${label}`);
            },
        } as unknown as Frame;
        const core = {
            record: vi.fn((_label: unknown, body: (f: Frame) => void) => {
                body(frame);
            }),
            submit: vi.fn(),
            lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
            takeFrameTimings: vi.fn(() => []),
        } as unknown as EngineCore;
        const flows = new FlowRegistry();
        const flow = (type: string) =>
            ({ type, dispatch: () => trace.push(`dispatch:${type}`) }) as unknown as Flow;
        const a = flow('A');
        const b = flow('B');
        vi.spyOn(flows, 'phasesInOrder').mockReturnValue(['transform', 'forward']);
        vi.spyOn(flows, 'flowsInPhase').mockImplementation((phase) =>
            phase === 'transform' ? [a] : [b],
        );
        new ExecutionSystem(core, events, flows);
        for (const f of [a, b])
            events.emit('flowReady', {
                payload: { type: f.type, flow: f, bound: {} as BoundFlow },
            });
        events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: 1 });
        expect(trace).toEqual([
            '+transform',
            '+A',
            'dispatch:A',
            '-A',
            '-transform',
            '+forward',
            '+B',
            'dispatch:B',
            '-B',
            '-forward',
        ]);
    });

    it('gpuFrameTimed: uma vez por leitura, agregada por fase, Flow e passe', () => {
        const events = new DefaultEventBus();
        const timings = [
            {
                gpuFrame: 9,
                gpuTimeMs: 4,
                stagesNs: {},
                scopesNs: {
                    'shadow/ProbeFlow/trace': 1_000_000,
                    'shadow/ProbeFlow/blend': 500_000,
                    'forward/ForwardFlow/forward': 2_000_000,
                    pool_grow: 500_000,
                },
            },
        ];
        const core = {
            record: vi.fn(),
            submit: vi.fn(),
            lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
            takeFrameTimings: vi.fn(() => timings.splice(0)),
        } as unknown as EngineCore;
        new ExecutionSystem(core, events, new FlowRegistry());
        const seen: GpuFrameTimedPayload[] = [];
        events.on('gpuFrameTimed', (e) => seen.push(e));
        events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: 1 });
        events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 0, frame: 2 });
        expect(seen).toHaveLength(1);
        expect(seen[0]).toEqual({
            gpuFrame: 9,
            totalMs: 4,
            phasesMs: { shadow: 1.5, forward: 2, outros: 0.5 },
            flowsMs: { ProbeFlow: 1.5, ForwardFlow: 2 },
            passesMs: {
                'shadow/ProbeFlow/trace': 1,
                'shadow/ProbeFlow/blend': 0.5,
                'forward/ForwardFlow/forward': 2,
                pool_grow: 0.5,
            },
        });
    });
});
