import { describe, expect, it } from 'vitest';
import { Flow } from '../flows/Flow';
import type { BoundFlow, TransitionContext } from '../flows/FlowBinding';
import type { FlowTransitions } from '../flows/FlowTransitions';
import type { Frame } from '../../core/contracts/index';
import { createScene } from '../SceneContext';
import { countingCore } from './helpers/countingCore';
import { ProbeBody, ProbeCam, ProbeFlow, probeParams, probeScene } from './helpers/probeFlow';

/** Flow sem slots nem pipelines: pronto assim que alocado; registra a ordem de gravação. */
class Marker extends Flow<Record<string, never>, 'idle'> {
    readonly slots = {};
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<
        'idle',
        TransitionContext<Record<string, never>>
    > = {
        '*': { slotsResolved: 'ignore', pipelinesCompiled: 'ignore' },
    };
    constructor(
        readonly type: string,
        private readonly log: string[],
    ) {
        super();
    }
    dispatch(_frame: Frame, _bound: BoundFlow<Record<string, never>>): void {
        this.log.push(this.type);
    }
}

function tick(scene: ReturnType<typeof createScene>, n = 1): void {
    scene.events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: n / 60, frame: n });
}

describe('ExecutionSystem — Flows ativos por flowReady/flowSuspended', () => {
    it('grava por fase na ordem da regra única (fase → prioridade decrescente → registro)', () => {
        const scene = createScene({ core: countingCore().core });
        const log: string[] = [];
        const add = (type: string, phase: 'physics' | 'forward', priority = 0) =>
            scene.flows.register(() => new Marker(type, log), { type, phase, priority });
        add('F-low', 'forward', 0);
        add('F-high', 'forward', 10);
        add('P', 'physics');
        add('F-tie', 'forward', 0);
        tick(scene);
        expect(log).toEqual(['P', 'F-high', 'F-low', 'F-tie']);
    });

    it('Flow pendente não grava; ao ficar pronto entra; suspenso sai', async () => {
        const { scene, frame } = await probeScene();
        let flow: ProbeFlow | undefined;
        scene.flows.register(
            () => {
                flow = new ProbeFlow(probeParams);
                return flow;
            },
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        scene.world.insert(new ProbeBody());
        frame();
        expect(flow!.dispatched).toEqual([]);
        expect(scene.executionSystem.isActive(flow!)).toBe(false);
        const cam = new ProbeCam();
        scene.world.insert(cam);
        frame();
        expect(scene.executionSystem.isActive(flow!)).toBe(true);
        expect(flow!.dispatched).toEqual([1]);
        scene.world.remove(cam);
        frame();
        expect(scene.executionSystem.isActive(flow!)).toBe(false);
        expect(flow!.dispatched).toEqual([1]);
    });

    it('unregister tira o Flow do quadro', () => {
        const scene = createScene({ core: countingCore().core });
        const log: string[] = [];
        const reg = scene.flows.register(() => new Marker('M', log), { type: 'M', phase: 'ui' });
        tick(scene);
        scene.flows.unregister(reg);
        tick(scene, 2);
        expect(log).toEqual(['M']);
    });
});
