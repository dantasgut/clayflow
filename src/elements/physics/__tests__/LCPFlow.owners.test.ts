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

describe('LCPFlow — mapas de dono pelo ColliderSet', () => {
    it('crescer além da capacidade recria o mapa de dono, destrói o anterior e refaz a narrowphase', () => {
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
        const created = (prefix: string) =>
            vi
                .mocked(core.create)
                .mock.calls.map((c) => c[0] as { discriminator?: string })
                .filter((s) => s.discriminator?.startsWith(prefix));
        const first = created('lcp_colliders_owners_SphereCollider')[0];
        expect(first).toBeDefined();
        const narrowphaseBefore = created('lcp_narrowphase_SphereCollider').length;

        // Capacidade mínima do mapa é 4: o 5º collider força a recriação.
        for (let i = 1; i <= 4; i++) {
            const body = new RigidBody({
                shape: 'sphere',
                radius: 0.5,
                mass: 1,
                position: [2 * i, 0, 0],
            });
            world.insert(body);
            flow.onEntitiesInserted([]);
        }
        time.advance(1 / 60);
        flow.dispatch(recordingFrame().frame);
        expect(created('lcp_colliders_owners_SphereCollider').length).toBeGreaterThan(1);
        expect(core.destroy).toHaveBeenCalledWith(first);
        expect(created('lcp_narrowphase_SphereCollider').length).toBeGreaterThan(narrowphaseBefore);
    });

    it('dispose libera os buffers do conjunto de colliders', () => {
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
        const owners = vi
            .mocked(core.create)
            .mock.calls.map((c) => c[0] as { discriminator?: string })
            .filter((s) => s.discriminator?.startsWith('lcp_colliders_'));
        expect(owners.length).toBeGreaterThan(0);
        flow.dispose();
        for (const spec of owners) expect(core.destroy).toHaveBeenCalledWith(spec);
    });
});
