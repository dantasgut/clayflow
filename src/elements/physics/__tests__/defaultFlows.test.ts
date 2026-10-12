import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FLOW_FACTORIES } from '../flows/defaultFlows';
import { XPBDFlow } from '../flows/XPBDFlow';
import { SoftBody } from '../bodies/SoftBody';
import { DistanceConstraint } from '../constraints/DistanceConstraint';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import { World } from '../../../scene/world/World';
import { Time } from '../../../scene/time/Time';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from './helpers/recordingFrame';

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('DEFAULT_FLOW_FACTORIES — XPBD', () => {
    it('o XPBD padrão resolve as restrições de distância inseridas no World', () => {
        const events = new DefaultEventBus();
        const world = new World(events);
        const { core } = fakeResourceCore();
        const resources = new ResourceSystem(core, events, world);
        const time = new Time(events);
        world.insert(time);
        world.insert(new SoftBody({ algorithm: 'XPBD', position: [0, 1, 0], mass: 0 }));
        world.insert(new SoftBody({ algorithm: 'XPBD', position: [0.1, 1, 0], mass: 1 }));
        world.insert(new DistanceConstraint({ i: 0, j: 1, restLength: 0.1 }));

        const flow = DEFAULT_FLOW_FACTORIES.get('XPBDSoftSchema')!(core, world, resources);
        expect(flow).toBeInstanceOf(XPBDFlow);
        time.advance(1 / 60);
        const rec = recordingFrame();
        flow.dispatch(rec.frame);
        expect(rec.passes.some((p) => p.label.toLowerCase().includes('distance'))).toBe(true);
    });
});
