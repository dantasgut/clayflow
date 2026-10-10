import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LCPFlow } from '../flows/LCPFlow';
import { RigidBody } from '../bodies/RigidBody';
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

describe('LCPFlow — buffer de donos', () => {
    it('recriar o buffer de donos (mais corpos) destrói o anterior', () => {
        const events = new DefaultEventBus();
        const world = new World(events);
        const { core } = fakeResourceCore();
        const resources = new ResourceSystem(core, events, world);
        const time = new Time(events);
        world.insert(time);
        world.insert(new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1 }));
        const flow = new LCPFlow(core, world, resources);
        time.advance(1 / 60);
        flow.dispatch(recordingFrame().frame);
        const owners = () =>
            vi
                .mocked(core.create)
                .mock.calls.map((c) => c[0] as { discriminator?: string })
                .filter((s) => s.discriminator?.startsWith('lcp_body_owners_SphereCollider'));
        const first = owners()[0];
        expect(first).toBeDefined();
        world.insert(new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1, position: [2, 0, 0] }));
        time.advance(1 / 60);
        flow.dispatch(recordingFrame().frame);
        expect(owners().length).toBeGreaterThan(1);
        expect(core.destroy).toHaveBeenCalledWith(first);
    });
});
